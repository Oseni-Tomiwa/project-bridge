import { describe, expect, it } from "vitest";

import {
  INTRON_SAHARA_PROVIDER_ID,
  IntronSaharaSpeechProvider,
  type AudioInput,
  type IntronFetch,
  type IntronSaharaProviderOptions,
} from "../src/index.js";

const successPayload = {
  data: {
    file_id: "file-123",
    processing_status: "FILE_TRANSCRIBED",
    audio_file_name: "sample.wav",
    audio_transcript: "Owó náà kò dé.",
    processed_audio_duration_in_seconds: 2,
  },
  message: "file status found",
  status: "Ok",
};

function audio(overrides: Partial<AudioInput> = {}): AudioInput {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "audio/wav",
    fileName: "sample.wav",
    durationMilliseconds: 2_000,
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
  responseOrFetch: Response | IntronFetch = jsonResponse(successPayload),
  overrides: Partial<IntronSaharaProviderOptions> = {},
) {
  const calls: Array<{
    readonly input: string | URL;
    readonly init?: RequestInit;
  }> = [];
  const implementation =
    responseOrFetch instanceof Response
      ? async () => responseOrFetch
      : responseOrFetch;
  const fetch: IntronFetch = async (input, init) => {
    calls.push({ input, ...(init === undefined ? {} : { init }) });
    return implementation(input, init);
  };
  const provider = new IntronSaharaSpeechProvider({
    apiKey: "test-secret-key",
    requestTimeoutMilliseconds: 100,
    fetch,
    ...overrides,
  });
  return { provider, calls };
}

describe("Intron/Sahara synchronous STT adapter", () => {
  it("constructs the documented Yoruba synchronous request", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "https://infer.voice.intron.io/file/v1/upload/sync",
    );
    expect(calls[0]?.init?.method).toBe("POST");
  });

  it("creates the Bearer header without placing the key in configuration", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});

    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer test-secret-key",
    );
    expect(JSON.stringify(provider.configuration)).not.toContain(
      "test-secret-key",
    );
  });

  it("uploads filename and bytes as multipart form data", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});

    const body = calls[0]?.init?.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("audio_file_name")).toBe("sample.wav");
    const blob = form.get("audio_file_blob");
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).size).toBe(3);
    expect(new Headers(calls[0]?.init?.headers).has("Content-Type")).toBe(
      false,
    );
  });

  it("sets the Yoruba-English language route to yo", async () => {
    const { provider, calls } = createHarness();
    await provider.transcribe(audio(), {});
    const form = calls[0]?.init?.body as FormData;
    expect(form.get("use_language_asr_input")).toBe("yo");
  });

  it("parses the documented success response", async () => {
    const { provider } = createHarness();
    const outcome = await provider.transcribe(audio(), {});
    expect(outcome).toMatchObject({
      ok: true,
      value: {
        providerStatus: "FILE_TRANSCRIBED",
        rawResponseReference: "file-123",
      },
    });
  });

  it("maps transcript and timing into the provider-neutral result", async () => {
    const dates = [
      new Date("2026-09-05T10:00:00.000Z"),
      new Date("2026-09-05T10:00:00.035Z"),
    ];
    const monotonic = [100, 135];
    const { provider } = createHarness(jsonResponse(successPayload), {
      now: () => dates.shift()!,
      monotonicMilliseconds: () => monotonic.shift()!,
    });
    const outcome = await provider.transcribe(audio(), {});
    expect(outcome).toEqual({
      ok: true,
      value: {
        providerConfiguration: provider.configuration,
        text: "Owó náà kò dé.",
        segments: [],
        detectedLanguages: ["yo"],
        providerStatus: "FILE_TRANSCRIBED",
        startedAt: "2026-09-05T10:00:00.000Z",
        completedAt: "2026-09-05T10:00:00.035Z",
        latencyMilliseconds: 35,
        rawResponseReference: "file-123",
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

  it("maps unauthorized responses without exposing credentials", async () => {
    const { provider } = createHarness(jsonResponse({}, 401));
    const outcome = await provider.transcribe(audio(), {});
    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "unauthorized", retryable: false, httpStatus: 401 },
    });
    expect(JSON.stringify(outcome)).not.toContain("test-secret-key");
  });

  it("maps rate limits and Retry-After seconds", async () => {
    const { provider } = createHarness(
      jsonResponse({}, 429, { "Retry-After": "17" }),
    );
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: {
        code: "rate-limited",
        retryable: true,
        httpStatus: 429,
        retryAfterSeconds: 17,
      },
    });
  });

  it("preserves a file ID from a 503 processing timeout", async () => {
    const { provider } = createHarness(
      jsonResponse({ data: { file_id: "pending-503" } }, 503),
    );
    await expect(provider.transcribe(audio(), {})).resolves.toMatchObject({
      ok: false,
      error: {
        code: "processing-timeout",
        retryable: false,
        httpStatus: 503,
        providerReference: "pending-503",
      },
    });
  });

  it("models a 503 without a usable file ID", async () => {
    const { provider } = createHarness(jsonResponse({ data: {} }, 503));
    const outcome = await provider.transcribe(audio(), {});
    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "processing-timeout", httpStatus: 503 },
    });
    if (outcome.ok) throw new Error("Expected a failure.");
    expect(outcome.error.providerReference).toBeUndefined();
  });

  it("maps network failures without returning raw exception details", async () => {
    const { provider } = createHarness(async () => {
      throw new TypeError("getaddrinfo ENOTFOUND with-sensitive-detail");
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

  it("rejects file extensions outside the documented list", async () => {
    const { provider, calls } = createHarness();
    await expect(
      provider.transcribe(audio({ fileName: "sample.aac" }), {}),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported-audio-format", retryable: false },
    });
    expect(calls).toHaveLength(0);
  });

  it("rejects known audio duration above 120 seconds", async () => {
    const { provider, calls } = createHarness();
    await expect(
      provider.transcribe(audio({ durationMilliseconds: 120_001 }), {}),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported-audio-duration", retryable: false },
    });
    expect(calls).toHaveLength(0);
  });

  it("exposes a sanitized, reproducible provider configuration", () => {
    const { provider } = createHarness();
    expect(provider.configuration).toEqual({
      id: "intron-sahara-sync-yo-v1",
      providerId: INTRON_SAHARA_PROVIDER_ID,
      modelIdentifier: "unknown",
      options: {
        endpoint: "https://infer.voice.intron.io/file/v1/upload/sync",
        language: "yo",
        transport: "synchronous-file-upload",
        requestTimeoutMilliseconds: 100,
        maximumKnownDurationMilliseconds: 120_000,
      },
    });
    expect(provider.configuration.modelVersion).toBeUndefined();
  });
});
