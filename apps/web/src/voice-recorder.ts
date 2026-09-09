export const VOICE_MAX_DURATION_MILLISECONDS = 60_000;
export const VOICE_MAX_BYTES = 8 * 1024 * 1024;
export const PRODUCT_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
] as const;

export type VoiceRecorderState =
  | "idle"
  | "requesting-microphone"
  | "recording"
  | "processing"
  | "transcription-ready"
  | "error";

export interface VoiceTranscription {
  readonly transcript: string;
  readonly provider: string;
  readonly latencyMs: number;
}

export interface VoiceRecorderSnapshot {
  readonly state: VoiceRecorderState;
  readonly elapsedMilliseconds: number;
  readonly rawTranscript: string;
  readonly editableTranscript: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly durationMilliseconds?: number;
}

interface MediaRecorderConstructor {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(mediaType: string): boolean;
}

export class VoiceTranscriptionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface VoiceRecorderDependencies {
  readonly mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  readonly MediaRecorder?: MediaRecorderConstructor;
  readonly transcribe: (
    audio: Blob,
    durationMilliseconds: number,
  ) => Promise<VoiceTranscription>;
  readonly onChange: (snapshot: VoiceRecorderSnapshot) => void;
  readonly now?: () => number;
  readonly setInterval?: (handler: () => void, delay: number) => number;
  readonly clearInterval?: (id: number) => void;
}

const initialSnapshot: VoiceRecorderSnapshot = {
  state: "idle",
  elapsedMilliseconds: 0,
  rawTranscript: "",
  editableTranscript: "",
};

export class VoiceRecorderController {
  #snapshot: VoiceRecorderSnapshot = initialSnapshot;
  #recorder: MediaRecorder | undefined;
  #stream: MediaStream | undefined;
  #chunks: Blob[] = [];
  #startedAt = 0;
  #timer: number | undefined;
  #cancelled = false;
  readonly #now: () => number;
  readonly #setInterval: (handler: () => void, delay: number) => number;
  readonly #clearInterval: (id: number) => void;

  constructor(private readonly dependencies: VoiceRecorderDependencies) {
    this.#now = dependencies.now ?? (() => performance.now());
    this.#setInterval =
      dependencies.setInterval ??
      ((handler, delay) => globalThis.setInterval(handler, delay));
    this.#clearInterval =
      dependencies.clearInterval ?? ((id) => globalThis.clearInterval(id));
    this.#emit();
  }

  get snapshot(): VoiceRecorderSnapshot {
    return this.#snapshot;
  }

  async start(): Promise<void> {
    if (this.#snapshot.state !== "idle" && this.#snapshot.state !== "error") {
      return;
    }
    const mediaDevices = this.dependencies.mediaDevices;
    const Recorder = this.dependencies.MediaRecorder;
    if (!mediaDevices || !Recorder) {
      this.#fail(
        "microphone-unsupported",
        "This browser cannot record audio here. You can still type your message.",
      );
      return;
    }
    const mediaType = PRODUCT_RECORDING_MIME_TYPES.find((candidate) =>
      Recorder.isTypeSupported(candidate),
    );
    if (mediaType === undefined) {
      this.#fail(
        "unsupported-audio-format",
        "This browser does not offer a supported recording format. You can still type your message.",
      );
      return;
    }

    this.#setSnapshot({
      ...initialSnapshot,
      state: "requesting-microphone",
    });
    try {
      this.#stream = await mediaDevices.getUserMedia({ audio: true });
      const recorder = new Recorder(this.#stream, { mimeType: mediaType });
      this.#recorder = recorder;
      this.#chunks = [];
      this.#cancelled = false;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) this.#chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => void this.#finishRecording());
      recorder.addEventListener("error", () => {
        this.#stopTracks();
        this.#fail(
          "recording-failed",
          "The recording could not be completed. Try again or type your message.",
        );
      });
      this.#startedAt = this.#now();
      recorder.start();
      this.#setSnapshot({
        ...initialSnapshot,
        state: "recording",
        mediaType,
      });
      this.#timer = this.#setInterval(() => this.#tick(), 250);
    } catch (error) {
      this.#stopTracks();
      const denied =
        error instanceof Error &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      this.#fail(
        denied ? "microphone-permission-denied" : "microphone-unavailable",
        denied
          ? "Microphone permission was denied. You can allow it and try again, or type your message."
          : "The microphone is unavailable. Try again or type your message.",
      );
    }
  }

  stop(): void {
    if (this.#snapshot.state !== "recording" || !this.#recorder) return;
    this.#updateElapsed();
    this.#clearTimer();
    this.#setSnapshot({ ...this.#snapshot, state: "processing" });
    this.#recorder.stop();
  }

  cancel(): void {
    if (this.#snapshot.state !== "recording" || !this.#recorder) return;
    this.#cancelled = true;
    this.#clearTimer();
    this.#recorder.stop();
    this.#setSnapshot(initialSnapshot);
  }

  updateTranscript(value: string): void {
    if (this.#snapshot.state !== "transcription-ready") return;
    this.#setSnapshot({ ...this.#snapshot, editableTranscript: value });
  }

  transcriptForSubmission(): string | undefined {
    if (this.#snapshot.state !== "transcription-ready") return undefined;
    const value = this.#snapshot.editableTranscript.trim();
    return value === "" ? undefined : value;
  }

  reset(): void {
    if (
      this.#snapshot.state === "transcription-ready" ||
      this.#snapshot.state === "error"
    ) {
      this.#setSnapshot(initialSnapshot);
    }
  }

  #tick(): void {
    if (this.#snapshot.state !== "recording") return;
    this.#updateElapsed();
    if (this.#snapshot.elapsedMilliseconds >= VOICE_MAX_DURATION_MILLISECONDS) {
      this.stop();
    }
  }

  #updateElapsed(): void {
    this.#setSnapshot({
      ...this.#snapshot,
      elapsedMilliseconds: Math.min(
        VOICE_MAX_DURATION_MILLISECONDS,
        Math.max(0, this.#now() - this.#startedAt),
      ),
    });
  }

  async #finishRecording(): Promise<void> {
    this.#clearTimer();
    this.#stopTracks();
    if (this.#cancelled) return;
    const durationMilliseconds = this.#snapshot.elapsedMilliseconds;
    const mediaType =
      this.#recorder?.mimeType || this.#snapshot.mediaType || "";
    const audio = new Blob(this.#chunks, { type: mediaType });
    if (audio.size === 0) {
      this.#fail(
        "empty-audio",
        "No audio was captured. Try recording again or type your message.",
      );
      return;
    }
    if (audio.size > VOICE_MAX_BYTES) {
      this.#fail(
        "audio-too-large",
        "The recording is too large. Record a shorter message or type it instead.",
      );
      return;
    }
    try {
      const result = await this.dependencies.transcribe(
        audio,
        durationMilliseconds,
      );
      this.#setSnapshot({
        state: "transcription-ready",
        elapsedMilliseconds: durationMilliseconds,
        rawTranscript: result.transcript,
        editableTranscript: result.transcript,
        mediaType,
        byteSize: audio.size,
        durationMilliseconds,
      });
    } catch (error) {
      this.#fail(
        error instanceof VoiceTranscriptionError
          ? error.code
          : "transcription-failed",
        error instanceof VoiceTranscriptionError
          ? error.message
          : "The recording could not be transcribed. Try again or type your message.",
      );
    }
  }

  #stopTracks(): void {
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = undefined;
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) this.#clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #fail(code: string, message: string): void {
    this.#clearTimer();
    this.#setSnapshot({
      ...initialSnapshot,
      state: "error",
      errorCode: code,
      errorMessage: message,
    });
  }

  #setSnapshot(snapshot: VoiceRecorderSnapshot): void {
    this.#snapshot = snapshot;
    this.#emit();
  }

  #emit(): void {
    this.dependencies.onChange(this.#snapshot);
  }
}
