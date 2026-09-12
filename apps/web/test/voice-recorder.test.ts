import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  VoiceRecorderController,
  VoiceTranscriptionError,
  type VoiceRecorderSnapshot,
} from "../src/voice-recorder.js";

class FakeMediaRecorder {
  static supported = true;
  static latest: FakeMediaRecorder | undefined;

  static isTypeSupported(): boolean {
    return FakeMediaRecorder.supported;
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";
  readonly #listeners = new Map<string, Array<(event: BlobEvent) => void>>();

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.latest = this;
  }

  addEventListener(name: string, listener: (event: BlobEvent) => void): void {
    const listeners = this.#listeners.get(name) ?? [];
    listeners.push(listener);
    this.#listeners.set(name, listeners);
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    queueMicrotask(() => this.#emit("stop", new Event("stop") as BlobEvent));
  }

  emitAudio(bytes = new Uint8Array([1, 2, 3])): void {
    this.#emit("dataavailable", {
      data: new Blob([bytes], { type: this.mimeType }),
    } as BlobEvent);
  }

  #emit(name: string, event: BlobEvent): void {
    for (const listener of this.#listeners.get(name) ?? []) listener(event);
  }
}

function harness(
  options: {
    getUserMedia?: () => Promise<MediaStream>;
    transcribe?: () => Promise<{
      transcript: string;
      provider: string;
      latencyMs: number;
    }>;
  } = {},
) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn(options.getUserMedia ?? (async () => stream));
  const transcribe = vi.fn(
    options.transcribe ??
      (async () => ({
        transcript: "I have had a headache since yesterday",
        provider: "intron-sahara",
        latencyMs: 25,
      })),
  );
  const snapshots: VoiceRecorderSnapshot[] = [];
  let now = 1_000;
  let tick: (() => void) | undefined;
  const controller = new VoiceRecorderController({
    mediaDevices: { getUserMedia },
    MediaRecorder: FakeMediaRecorder as unknown as typeof MediaRecorder,
    transcribe,
    onChange: (snapshot) => snapshots.push(snapshot),
    now: () => now,
    setInterval: (handler) => {
      tick = handler;
      return 1;
    },
    clearInterval: vi.fn(),
  });
  return {
    controller,
    getUserMedia,
    transcribe,
    track,
    snapshots,
    advance(milliseconds: number) {
      now += milliseconds;
      tick?.();
    },
  };
}

async function finishRecording(
  created: ReturnType<typeof harness>,
  withAudio = true,
): Promise<void> {
  if (withAudio) FakeMediaRecorder.latest?.emitAudio();
  created.controller.stop();
  await vi.waitFor(() => {
    expect(["transcription-ready", "error"]).toContain(
      created.controller.snapshot.state,
    );
  });
}

describe("voice recorder web flow", () => {
  it("requests microphone permission only after the start action", async () => {
    const created = harness();
    expect(created.getUserMedia).not.toHaveBeenCalled();

    await created.controller.start();

    expect(created.getUserMedia).toHaveBeenCalledOnce();
    expect(created.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(created.controller.snapshot.state).toBe("recording");
  });

  it("keeps a usable error state when permission is denied", async () => {
    const denied = new Error("private browser detail");
    denied.name = "NotAllowedError";
    const created = harness({
      getUserMedia: async () => Promise.reject(denied),
    });

    await created.controller.start();

    expect(created.controller.snapshot).toMatchObject({
      state: "error",
      errorCode: "microphone-permission-denied",
    });
    expect(created.controller.snapshot.errorMessage).not.toContain("private");
  });

  it("starts, times, and stops a recording before transcription", async () => {
    const created = harness();
    await created.controller.start();
    created.advance(2_500);
    expect(created.controller.snapshot.elapsedMilliseconds).toBe(2_500);

    await finishRecording(created);

    expect(created.track.stop).toHaveBeenCalledOnce();
    expect(created.transcribe).toHaveBeenCalledOnce();
    expect(created.controller.snapshot.state).toBe("transcription-ready");
  });

  it("automatically stops at the one-minute recording limit", async () => {
    const created = harness();
    await created.controller.start();
    FakeMediaRecorder.latest?.emitAudio();

    created.advance(60_000);

    await vi.waitFor(() =>
      expect(created.controller.snapshot.state).toBe("transcription-ready"),
    );
    expect(created.controller.snapshot.durationMilliseconds).toBe(60_000);
    expect(created.transcribe).toHaveBeenCalledOnce();
  });

  it("shows the raw transcript separately and submits the edited transcript", async () => {
    const created = harness();
    await created.controller.start();
    await finishRecording(created);

    expect(created.controller.snapshot.rawTranscript).toBe(
      "I have had a headache since yesterday",
    );
    created.controller.updateTranscript(
      "I have had a headache since yesterday and want to see a clinician",
    );

    expect(created.controller.snapshot.rawTranscript).toBe(
      "I have had a headache since yesterday",
    );
    expect(created.controller.transcriptForSubmission()).toBe(
      "I have had a headache since yesterday and want to see a clinician",
    );
  });

  it("does not allow duplicate start actions while processing", async () => {
    let resolveTranscription:
      | ((value: {
          transcript: string;
          provider: string;
          latencyMs: number;
        }) => void)
      | undefined;
    const created = harness({
      transcribe: async () =>
        await new Promise((resolve) => {
          resolveTranscription = resolve;
        }),
    });
    await created.controller.start();
    FakeMediaRecorder.latest?.emitAudio();
    created.controller.stop();
    await Promise.resolve();
    expect(created.controller.snapshot.state).toBe("processing");

    await created.controller.start();

    expect(created.getUserMedia).toHaveBeenCalledOnce();
    resolveTranscription?.({
      transcript: "done",
      provider: "intron-sahara",
      latencyMs: 10,
    });
  });

  it("handles empty audio without calling transcription", async () => {
    const created = harness();
    await created.controller.start();
    await finishRecording(created, false);

    expect(created.controller.snapshot).toMatchObject({
      state: "error",
      errorCode: "empty-audio",
    });
    expect(created.transcribe).not.toHaveBeenCalled();
  });

  it("recovers from a transcription error", async () => {
    const created = harness({
      transcribe: async () => {
        throw new VoiceTranscriptionError(
          "stt-rate-limited",
          "Voice transcription is busy. Type your message instead.",
        );
      },
    });
    await created.controller.start();
    await finishRecording(created);
    expect(created.controller.snapshot.state).toBe("error");

    created.controller.reset();

    expect(created.controller.snapshot.state).toBe("idle");
  });

  it("retains the accessible text fallback in the web document", async () => {
    const html = await readFile(
      fileURLToPath(new URL("../index.html", import.meta.url)),
      "utf8",
    );
    expect(html).toContain("Prefer to type instead?");
    expect(html).toContain('id="utterance-form"');
    expect(html).toContain(
      'aria-label="Start recording your clinic intake request"',
    );
    expect(html).toContain("This is a simulation, not medical advice.");
  });
});
