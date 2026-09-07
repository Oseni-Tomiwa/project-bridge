import { describe, expect, it } from "vitest";

import {
  INTRON_SAHARA_PROVIDER_ID,
  IntronSaharaSpeechProvider,
  OPENAI_DEFAULT_TRANSCRIPTION_MODEL,
  OPENAI_TRANSCRIPTION_PROVIDER_ID,
  OpenAITranscriptionSpeechProvider,
  type AudioInput,
  type IntronFetch,
  type OpenAITranscriptionFetch,
  type OpenAITranscriptionProviderOptions,
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

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createHarness(
  responseOrFetch: Response | OpenAITranscriptionFetch = jsonResponse({
    text: "mo transfer owó náà",
  }),
  overrides: Partial<OpenAITranscriptionProviderOptions> = {},
) {
  const calls: Array<{
    readonly input: string | URL;
    readonly init?: RequestInit;
  }> = [];
  const implementation =
    responseOrFetch instanceof Response
      ? async () => responseOrFetch
      : responseOrFetch;
  const fetch: OpenAITranscriptionFetch = async (input, init) => {
    calls.push({ input, ...(init === undefined ? {} : { init }) });
    return implementation(input, init);
  };
  const provider = new OpenAITranscriptionSpeechProvider({
    apiKey: "test-openai-secret",
    requestTimeoutMilliseconds: 100,
    fetch,
    ...overrides,
  });
  return { provider, calls };
}

describe("OpenAI file-transcription adapter", () => {
  it("constructs one multipart request to the official endpoint", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData);
    expect(new Headers(calls[0]?.init?.headers).has("Content-Type")).toBe(
      false,
    );
  });

  it("uploads the exact audio bytes and filename", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});
    const form = calls[0]?.init?.body as FormData;
    const file = form.get("file");

    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).size).toBe(3);
    expect((file as File).name).toBe("yoruba-test.m4a");
  });

  it("uses gpt-transcribe by default", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});
    const form = calls[0]?.init?.body as FormData;

    expect(provider.configuration.modelIdentifier).toBe(
      OPENAI_DEFAULT_TRANSCRIPTION_MODEL,
    );
    expect(form.get("model")).toBe("gpt-transcribe");
    expect(form.get("response_format")).toBe("json");
    expect(form.has("language")).toBe(false);
    expect(form.has("prompt")).toBe(false);
  });

  it("preserves an explicitly configured model identifier", async () => {
    const { provider, calls } = createHarness(undefined, {
      model: "gpt-transcribe-experimental",
    });
    await provider.transcribe(audio(), {});
    const form = calls[0]?.init?.body as FormData;

    expect(provider.configuration.modelIdentifier).toBe(
      "gpt-transcribe-experimental",
    );
    expect(form.get("model")).toBe("gpt-transcribe-experimental");
  });

  it("keeps credentials out of the configuration snapshot", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});

    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer test-openai-secret",
    );
    expect(JSON.stringify(provider.configuration)).not.toContain(
      "test-openai-secret",
    );
    expect(JSON.stringify(provider.configuration)).not.toContain(
      "Authorization",
    );
  });

  it("maps transcript, request ID, and monotonic timing", async () => {
    const dates = [
      new Date("2026-09-07T10:00:00.000Z"),
      new Date("2026-09-07T10:00:00.045Z"),
    ];
    const monotonic = [900, 945];
    const { provider } = createHarness(
      jsonResponse({ text: "Mo fi owó ránṣẹ́." }, 200, {
        "x-request-id": "req_openai_123",
      }),
      {
        now: () => dates.shift()!,
        monotonicMilliseconds: () => monotonic.shift()!,
      },
    );

    await expect(provider.transcribe(audio(), {})).resolves.toEqual({
      ok: true,
      value: {
        providerConfiguration: provider.configuration,
        text: "Mo fi owó ránṣẹ́.",
        segments: [],
        startedAt: "2026-09-07T10:00:00.000Z",
        completedAt: "2026-09-07T10:00:00.045Z",
        latencyMilliseconds: 45,
        rawResponseReference: "req_openai_123",
      },
    });
  });

  it("returns structured missing-configuration failures without a request", async () => {
    const calls: unknown[] = [];
    const provider = new OpenAITranscriptionSpeechProvider({
      apiKey: "",
      fetch: async (...args) => {
        calls.push(args);
        return jsonResponse({ text: "must not run" });
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

  it("rejects extensions outside the documented OpenAI list", async () => {
    const { provider, calls } = createHarness();
    await expect(
      provider.transcribe(audio({ fileName: "sample.aac" }), {}),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported-audio-format", retryable: false },
    });
    expect(calls).toHaveLength(0);
  });

  it("accepts every officially documented file extension", async () => {
    const extensions = [
      "flac",
      "mp3",
      "mp4",
      "mpeg",
      "mpga",
      "m4a",
      "ogg",
      "wav",
      "webm",
    ];
    for (const extension of extensions) {
      const { provider, calls } = createHarness();
      const outcome = await provider.transcribe(
        audio({ fileName: `sample.${extension}` }),
        {},
      );
      expect(outcome.ok, extension).toBe(true);
      expect(calls, extension).toHaveLength(1);
    }
  });

  it("maps unauthorized responses without exposing provider details", async () => {
    const { provider } = createHarness(
      jsonResponse({ error: { message: "sensitive provider text" } }, 401, {
        "x-request-id": "req_unauthorized",
      }),
    );
    const outcome = await provider.transcribe(audio(), {});

    expect(outcome).toMatchObject({
      ok: false,
      error: {
        code: "unauthorized",
        retryable: false,
        httpStatus: 401,
        providerReference: "req_unauthorized",
      },
    });
    expect(JSON.stringify(outcome)).not.toContain("sensitive provider text");
  });

  it("maps rate limits and Retry-After seconds", async () => {
    const { provider } = createHarness(
      jsonResponse({}, 429, { "Retry-After": "23" }),
    );
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: {
        code: "rate-limited",
        retryable: true,
        httpStatus: 429,
        retryAfterSeconds: 23,
      },
    });
  });

  it("maps generic provider HTTP errors", async () => {
    const { provider } = createHarness(jsonResponse({}, 500));
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: {
        code: "provider-http-error",
        retryable: true,
        httpStatus: 500,
      },
    });
  });

  it("returns a structured malformed-response failure", async () => {
    const { provider } = createHarness(
      new Response("not-json", { status: 200 }),
    );
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: "malformed-provider-response", httpStatus: 200 },
    });
  });

  it("maps network errors without returning raw exception details", async () => {
    const { provider } = createHarness(async () => {
      throw new TypeError("network failure with-sensitive-detail");
    });
    const outcome = await provider.transcribe(audio(), {});

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "network-failure", retryable: true },
    });
    expect(JSON.stringify(outcome)).not.toContain("with-sensitive-detail");
  });

  it("aborts and maps a client-side request timeout", async () => {
    const { provider } = createHarness(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
      { requestTimeoutMilliseconds: 5 },
    );
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: "request-timeout", retryable: true },
    });
  });

  it("does not retry failed HTTP requests", async () => {
    const { provider, calls } = createHarness(jsonResponse({}, 503));
    await provider.transcribe(audio(), {});
    expect(calls).toHaveLength(1);
  });

  it("exposes a sanitized, reproducible provider configuration", () => {
    const { provider } = createHarness();
    expect(provider.configuration).toEqual({
      id: "openai-file-gpt-transcribe-v1",
      providerId: OPENAI_TRANSCRIPTION_PROVIDER_ID,
      modelIdentifier: "gpt-transcribe",
      options: {
        endpoint: "https://api.openai.com/v1/audio/transcriptions",
        transport: "synchronous-file-upload",
        responseFormat: "json",
        languageHint: null,
        requestTimeoutMilliseconds: 100,
        automaticRetries: 0,
      },
    });
    expect(provider.configuration.modelVersion).toBeUndefined();
  });

  it("sends the same prepared AudioInput through Sahara and OpenAI", async () => {
    const preparedAudio = audio({ contentSha256: "sha256-example" });
    let intronBlobSize = 0;
    const intronFetch: IntronFetch = async (_input, init) => {
      const form = init?.body as FormData;
      intronBlobSize = (form.get("audio_file_blob") as Blob).size;
      return jsonResponse({
        data: {
          file_id: "file-same-audio",
          processing_status: "FILE_TRANSCRIBED",
          audio_file_name: "yoruba-test.m4a",
          audio_transcript: "Sahara transcript",
        },
      });
    };
    let openaiBlobSize = 0;
    const openaiFetch: OpenAITranscriptionFetch = async (_input, init) => {
      const form = init?.body as FormData;
      openaiBlobSize = (form.get("file") as Blob).size;
      return jsonResponse({ text: "OpenAI transcript" });
    };
    const sahara = new IntronSaharaSpeechProvider({
      apiKey: "intron-test-key",
      fetch: intronFetch,
    });
    const openai = new OpenAITranscriptionSpeechProvider({
      apiKey: "openai-test-key",
      fetch: openaiFetch,
    });

    const [saharaResult, openaiResult] = await Promise.all([
      sahara.transcribe(preparedAudio, {}),
      openai.transcribe(preparedAudio, {}),
    ]);

    expect(saharaResult.ok).toBe(true);
    expect(openaiResult.ok).toBe(true);
    expect(sahara.configuration.providerId).toBe(INTRON_SAHARA_PROVIDER_ID);
    expect(openai.configuration.providerId).toBe(
      OPENAI_TRANSCRIPTION_PROVIDER_ID,
    );
    expect(intronBlobSize).toBe(preparedAudio.bytes.byteLength);
    expect(openaiBlobSize).toBe(preparedAudio.bytes.byteLength);
    expect(preparedAudio.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});
