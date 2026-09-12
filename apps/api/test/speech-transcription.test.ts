import { describe, expect, it } from "vitest";

import {
  HealthcareIntakeService,
  InMemoryClinicIntakeRepository,
} from "@project-bridge/domain";
import type {
  AudioInput,
  SpeechProvider,
  TranscriptionOutcome,
} from "@project-bridge/speech";
import {
  PRODUCT_AUDIO_MAX_BYTES,
  ProductSpeechError,
  transcribeProductAudio,
} from "../src/speech-transcription.js";

const voiceFixture = "I have headache and I want to see a doctor";

function fakeProvider(
  outcome: TranscriptionOutcome = successOutcome(voiceFixture),
): SpeechProvider & { calls: AudioInput[] } {
  const calls: AudioInput[] = [];
  return {
    configuration: outcome.ok
      ? outcome.value.providerConfiguration
      : outcome.error.providerConfiguration,
    calls,
    async transcribe(audio: AudioInput): Promise<TranscriptionOutcome> {
      calls.push(audio);
      return outcome;
    },
  };
}

function configuration() {
  return {
    id: "intron-sahara-sync-yo-v1",
    providerId: "intron-sahara",
    modelIdentifier: "unknown",
    options: {
      endpoint: "https://infer.voice.intron.io/file/v1/upload/sync",
      language: "yo",
      authorization: "must-not-leak",
    },
  } as const;
}

function successOutcome(text: string): TranscriptionOutcome {
  return {
    ok: true,
    value: {
      providerConfiguration: configuration(),
      text,
      segments: [],
      startedAt: "2026-09-09T00:00:00.000Z",
      completedAt: "2026-09-09T00:00:00.025Z",
      latencyMilliseconds: 25,
      rawResponseReference: "provider-file-private",
    },
  };
}

function failureOutcome(code: string): TranscriptionOutcome {
  return {
    ok: false,
    error: {
      providerConfiguration: configuration(),
      code,
      message: "raw provider body with must-not-leak",
      retryable: false,
      startedAt: "2026-09-09T00:00:00.000Z",
      completedAt: "2026-09-09T00:00:00.025Z",
      latencyMilliseconds: 25,
      providerReference: "provider-file-private",
    },
  };
}

function upload(
  overrides: Partial<{ bytes: Uint8Array; mediaType: string }> = {},
) {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "audio/webm;codecs=opus",
    durationMilliseconds: 2_000,
    ...overrides,
  };
}

describe("product speech transcription boundary", () => {
  it("passes a valid browser upload to the provider and returns a sanitized response", async () => {
    const provider = fakeProvider();
    const result = await transcribeProductAudio(provider, upload());

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "audio/webm",
      fileName: "browser-recording.webm",
      durationMilliseconds: 2_000,
    });
    expect(result).toEqual({
      transcript: voiceFixture,
      provider: "intron-sahara",
      configuration: {
        id: "intron-sahara-sync-yo-v1",
        modelIdentifier: "unknown",
      },
      latencyMs: 25,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /must-not-leak|provider-file-private|authorization|endpoint/u,
    );
    expect(JSON.stringify(result)).not.toContain("[1,2,3]");
  });

  it.each([
    ["empty audio", upload({ bytes: new Uint8Array() }), "empty-audio", 400],
    [
      "unsupported audio",
      upload({ mediaType: "audio/aac" }),
      "unsupported-audio-format",
      415,
    ],
    [
      "oversized audio",
      upload({ bytes: new Uint8Array(PRODUCT_AUDIO_MAX_BYTES + 1) }),
      "audio-too-large",
      413,
    ],
  ])(
    "rejects %s before calling the provider",
    async (_label, input, code, status) => {
      const provider = fakeProvider();
      await expect(
        transcribeProductAudio(provider, input),
      ).rejects.toMatchObject({
        code,
        status,
      });
      expect(provider.calls).toHaveLength(0);
    },
  );

  it("reports missing server-side configuration safely", async () => {
    await expect(transcribeProductAudio(undefined, upload())).rejects.toEqual(
      expect.objectContaining({ code: "stt-not-configured", status: 503 }),
    );
  });

  it.each([
    ["unauthorized", "stt-unauthorized", 502],
    ["rate-limited", "stt-rate-limited", 429],
    ["request-timeout", "stt-timeout", 504],
    ["processing-timeout", "stt-timeout", 504],
    ["network-failure", "transcription-failed", 502],
    ["provider-http-error", "transcription-failed", 502],
  ])(
    "maps provider failure %s without leaking provider details",
    async (providerCode, publicCode, status) => {
      const provider = fakeProvider(failureOutcome(providerCode));
      let caught: unknown;
      try {
        await transcribeProductAudio(provider, upload());
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ProductSpeechError);
      expect(caught).toMatchObject({ code: publicCode, status });
      expect(JSON.stringify(caught)).not.toMatch(
        /must-not-leak|provider-file-private|raw provider body/u,
      );
    },
  );

  it("feeds the editable transcript into the active healthcare clarification and confirmation flow", async () => {
    const transcript = await transcribeProductAudio(fakeProvider(), upload());
    let sequence = 0;
    const service = new HealthcareIntakeService({
      intakes: new InMemoryClinicIntakeRepository(),
      now: () => new Date("2026-09-09T00:00:00.000Z"),
      createId: (kind) => `${kind}-${++sequence}`,
    });
    const started = service.startConversation();

    const clarification = await service.submitUtterance(
      started.conversationId,
      transcript.transcript,
    );
    expect(clarification).toMatchObject({
      state: "awaiting-input",
      assistantMessage:
        "How long have you had these symptoms? You can say you are not sure.",
    });

    const confirmation = await service.submitUtterance(
      started.conversationId,
      "since yesterday",
    );
    expect(confirmation.state).toBe("awaiting-confirmation");
  });
});
