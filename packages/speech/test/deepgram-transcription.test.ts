import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE,
  DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL,
  DEEPGRAM_TRANSCRIPTION_PROVIDER_ID,
  DeepgramTranscriptionSpeechProvider,
  INTRON_SAHARA_PROVIDER_ID,
  IntronSaharaSpeechProvider,
  OPENAI_TRANSCRIPTION_PROVIDER_ID,
  OpenAITranscriptionSpeechProvider,
  type AudioInput,
  type DeepgramTranscriptionFetch,
  type DeepgramTranscriptionProviderOptions,
  type IntronFetch,
  type OpenAITranscriptionFetch,
} from "../src/index.js";

function audio(overrides: Partial<AudioInput> = {}): AudioInput {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "audio/mp4",
    fileName: "yoruba-test.m4a",
    sampleId: "real-yo-001",
    ...overrides,
  };
}

function successBody(transcript = "Mo fi owó ránṣẹ́.") {
  return {
    metadata: {
      request_id: "dg-request-123",
      models: ["dg-model-uuid"],
      model_info: {
        "dg-model-uuid": {
          name: "nova-3-general",
          version: "2026-08-01.12345",
          arch: "nova-3",
        },
      },
    },
    results: {
      channels: [
        {
          alternatives: [{ transcript }],
        },
      ],
    },
  };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createHarness(
  responseOrFetch: Response | DeepgramTranscriptionFetch = jsonResponse(
    successBody(),
  ),
  overrides: Partial<DeepgramTranscriptionProviderOptions> = {},
) {
  const calls: Array<{
    readonly input: string | URL;
    readonly init?: RequestInit;
  }> = [];
  const implementation =
    responseOrFetch instanceof Response
      ? async () => responseOrFetch
      : responseOrFetch;
  const fetch: DeepgramTranscriptionFetch = async (input, init) => {
    calls.push({ input, ...(init === undefined ? {} : { init }) });
    return implementation(input, init);
  };
  const provider = new DeepgramTranscriptionSpeechProvider({
    apiKey: "test-deepgram-secret",
    requestTimeoutMilliseconds: 100,
    fetch,
    ...overrides,
  });
  return { provider, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Deepgram prerecorded transcription adapter", () => {
  it("constructs one authorized Nova-3 request with explicit benchmark options", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});

    expect(calls).toHaveLength(1);
    const url = new URL(String(calls[0]?.input));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.deepgram.com/v1/listen",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model: "nova-3",
      version: "latest",
      language: "multi",
      smart_format: "false",
    });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(
      "Token test-deepgram-secret",
    );
    expect(new Headers(calls[0]?.init?.headers).get("Content-Type")).toBe(
      "audio/mp4",
    );
    expect(provider.configuration).toMatchObject({
      providerId: DEEPGRAM_TRANSCRIPTION_PROVIDER_ID,
      modelIdentifier: DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL,
      options: {
        requestedModelVersion: "latest",
        language: DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE,
        smartFormat: false,
        detectLanguage: false,
        automaticRetries: 0,
      },
    });
  });

  it("sends the original audio bytes as the request body", async () => {
    const preparedAudio = audio({ bytes: new Uint8Array([9, 8, 7, 6]) });
    const { provider, calls } = createHarness();
    await provider.transcribe(preparedAudio, {});

    expect(new Uint8Array(calls[0]?.init?.body as ArrayBuffer)).toEqual(
      preparedAudio.bytes,
    );
    expect(preparedAudio.bytes).toEqual(new Uint8Array([9, 8, 7, 6]));
  });

  it("maps transcript, request ID, model metadata, and monotonic timing", async () => {
    const dates = [
      new Date("2026-09-08T10:00:00.000Z"),
      new Date("2026-09-08T10:00:00.052Z"),
    ];
    const monotonic = [500, 552];
    const { provider } = createHarness(jsonResponse(successBody()), {
      now: () => dates.shift()!,
      monotonicMilliseconds: () => monotonic.shift()!,
    });

    await expect(provider.transcribe(audio(), {})).resolves.toEqual({
      ok: true,
      value: {
        providerConfiguration: provider.configuration,
        text: "Mo fi owó ránṣẹ́.",
        segments: [],
        providerStatus: "http-200",
        providerModelMetadata: {
          identifier: "nova-3-general",
          version: "2026-08-01.12345",
          reference: "dg-model-uuid",
          architecture: "nova-3",
        },
        startedAt: "2026-09-08T10:00:00.000Z",
        completedAt: "2026-09-08T10:00:00.052Z",
        latencyMilliseconds: 52,
        rawResponseReference: "dg-request-123",
      },
    });
  });

  it("preserves returned language metadata without inferring it", async () => {
    const body = {
      ...successBody(),
      results: {
        channels: [
          {
            detected_language: "en",
            alternatives: [
              {
                transcript: "Yorùbá and English",
                languages: ["en", "es"],
              },
            ],
          },
        ],
      },
    };
    const { provider } = createHarness(jsonResponse(body));

    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: true,
      value: { detectedLanguages: ["en", "es"] },
    });
  });

  it("does not invent request, language, or model metadata", async () => {
    const { provider } = createHarness(
      jsonResponse({
        results: {
          channels: [{ alternatives: [{ transcript: "Raw transcript" }] }],
        },
      }),
    );
    const outcome = await provider.transcribe(audio(), {});

    expect(outcome).toMatchObject({
      ok: true,
      value: { text: "Raw transcript" },
    });
    if (!outcome.ok) throw new Error("Expected successful transcription.");
    expect(outcome.value).not.toHaveProperty("rawResponseReference");
    expect(outcome.value).not.toHaveProperty("detectedLanguages");
    expect(outcome.value).not.toHaveProperty("providerModelMetadata");
  });

  it("keeps credentials out of the sanitized configuration", async () => {
    const { provider } = createHarness();
    expect(JSON.stringify(provider.configuration)).not.toContain(
      "test-deepgram-secret",
    );
    expect(JSON.stringify(provider.configuration)).not.toContain(
      "Authorization",
    );
  });

  it("allows smart formatting only as an explicit configuration", async () => {
    const { provider, calls } = createHarness(undefined, { smartFormat: true });
    await provider.transcribe(audio(), {});

    expect(
      new URL(String(calls[0]?.input)).searchParams.get("smart_format"),
    ).toBe("true");
    expect(provider.configuration.options.smartFormat).toBe(true);
    expect(provider.configuration.id).toContain("smart-format-on");
  });

  it("returns structured missing-configuration failures without a request", async () => {
    const calls: unknown[] = [];
    const provider = new DeepgramTranscriptionSpeechProvider({
      apiKey: "",
      fetch: async (...args) => {
        calls.push(args);
        return jsonResponse(successBody());
      },
    });

    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: {
        code: "missing-provider-configuration",
        retryable: false,
      },
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [audio({ bytes: new Uint8Array() }), "invalid-audio-input"],
    [
      audio({ mediaType: "application/octet-stream" }),
      "unsupported-audio-format",
    ],
  ])("rejects unsupported input without a request", async (input, code) => {
    const { provider, calls } = createHarness();
    await expect(provider.transcribe(input, {})).resolves.toMatchObject({
      ok: false,
      error: { code, retryable: false },
    });
    expect(calls).toHaveLength(0);
  });

  it("rejects partial-result mode for the prerecorded endpoint", async () => {
    const { provider, calls } = createHarness();
    await expect(
      provider.transcribe(audio(), { enablePartialResults: true }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported-transcription-mode" },
    });
    expect(calls).toHaveLength(0);
  });

  it.each([401, 403])("maps HTTP %i to unauthorized", async (status) => {
    const { provider } = createHarness(jsonResponse({}, status));
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized", httpStatus: status, retryable: false },
    });
  });

  it("maps rate limits and safe request metadata", async () => {
    const { provider } = createHarness(
      jsonResponse({ metadata: { request_id: "dg-rate-request" } }, 429, {
        "Retry-After": "7",
      }),
    );
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: {
        code: "rate-limited",
        httpStatus: 429,
        retryable: true,
        retryAfterSeconds: 7,
        providerReference: "dg-rate-request",
      },
    });
  });

  it("maps generic provider HTTP errors without leaking the body", async () => {
    const { provider } = createHarness(
      jsonResponse({ error: "sensitive upstream detail" }, 500),
    );
    const outcome = await provider.transcribe(audio(), {});
    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "provider-http-error", httpStatus: 500, retryable: true },
    });
    expect(JSON.stringify(outcome)).not.toContain("sensitive upstream detail");
  });

  it.each([
    {},
    { results: { channels: [] } },
    { results: { channels: [{ alternatives: [{}] }] } },
  ])("maps malformed success responses", async (body) => {
    const { provider } = createHarness(jsonResponse(body));
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: "malformed-provider-response", retryable: false },
    });
  });

  it("maps network failure and makes no retry", async () => {
    let calls = 0;
    const { provider } = createHarness(async () => {
      calls += 1;
      throw new TypeError("network unavailable");
    });

    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: "network-failure", retryable: true },
    });
    expect(calls).toBe(1);
  });

  it("maps client timeout and makes no retry", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { provider } = createHarness(
      async (_input, init) => {
        calls += 1;
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      },
      { requestTimeoutMilliseconds: 5 },
    );

    const pending = provider.transcribe(audio(), {});
    await vi.advanceTimersByTimeAsync(5);
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "request-timeout", retryable: true },
    });
    expect(calls).toBe(1);
  });

  it("shares one provider-neutral prepared audio input across all three adapters", async () => {
    const preparedAudio = audio();
    let deepgramBytes: Uint8Array | undefined;
    let intronBytes = 0;
    let openaiBytes = 0;
    const deepgramFetch: DeepgramTranscriptionFetch = async (_input, init) => {
      deepgramBytes = new Uint8Array(init?.body as ArrayBuffer);
      return jsonResponse(successBody("Deepgram transcript"));
    };
    const intronFetch: IntronFetch = async (_input, init) => {
      const form = init?.body as FormData;
      intronBytes = (form.get("audio_file_blob") as Blob).size;
      return jsonResponse({
        status: "success",
        data: {
          file_id: "intron-file",
          processing_status: "FILE_TRANSCRIBED",
          audio_file_name: "yoruba-test.m4a",
          audio_transcript: "Sahara transcript",
        },
      });
    };
    const openaiFetch: OpenAITranscriptionFetch = async (_input, init) => {
      const form = init?.body as FormData;
      openaiBytes = (form.get("file") as Blob).size;
      return jsonResponse({ text: "OpenAI transcript" });
    };
    const deepgram = new DeepgramTranscriptionSpeechProvider({
      apiKey: "deepgram-key",
      fetch: deepgramFetch,
    });
    const sahara = new IntronSaharaSpeechProvider({
      apiKey: "intron-key",
      fetch: intronFetch,
    });
    const openai = new OpenAITranscriptionSpeechProvider({
      apiKey: "openai-key",
      fetch: openaiFetch,
    });

    const outcomes = await Promise.all([
      deepgram.transcribe(preparedAudio, {}),
      sahara.transcribe(preparedAudio, {}),
      openai.transcribe(preparedAudio, {}),
    ]);

    expect(outcomes.every(({ ok }) => ok)).toBe(true);
    expect([
      deepgram.configuration.providerId,
      sahara.configuration.providerId,
      openai.configuration.providerId,
    ]).toEqual([
      DEEPGRAM_TRANSCRIPTION_PROVIDER_ID,
      INTRON_SAHARA_PROVIDER_ID,
      OPENAI_TRANSCRIPTION_PROVIDER_ID,
    ]);
    expect(deepgramBytes).toEqual(preparedAudio.bytes);
    expect(intronBytes).toBe(preparedAudio.bytes.byteLength);
    expect(openaiBytes).toBe(preparedAudio.bytes.byteLength);
  });
});
