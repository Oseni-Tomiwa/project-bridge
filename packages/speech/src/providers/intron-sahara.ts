import type {
  AudioInput,
  SpeechProvider,
  SpeechProviderConfiguration,
  TranscriptionContext,
  TranscriptionFailure,
  TranscriptionOutcome,
} from "../contracts.js";

export const INTRON_SAHARA_PROVIDER_ID = "intron-sahara";
export const INTRON_SYNC_PATH = "/file/v1/upload/sync";
export const INTRON_SYNC_MAX_DURATION_MILLISECONDS = 120_000;
export const INTRON_SYNC_SUPPORTED_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".mp4",
  ".m4a",
  ".ogg",
  ".webm",
  ".flac",
] as const;

export interface IntronSaharaProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly language?: "yo";
  readonly requestTimeoutMilliseconds?: number;
  readonly fetch?: IntronFetch;
  readonly now?: () => Date;
  readonly monotonicMilliseconds?: () => number;
}

export type IntronFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

interface ProviderTiming {
  readonly startedAt: string;
  readonly startedMonotonicMilliseconds: number;
}

interface IntronSuccessData {
  readonly fileId: string;
  readonly processingStatus: string;
  readonly audioFileName: string;
  readonly transcript: string;
}

const defaultBaseUrl = "https://infer.voice.intron.io";
const defaultRequestTimeoutMilliseconds = 125_000;

export class IntronSaharaSpeechProvider implements SpeechProvider {
  readonly configuration: SpeechProviderConfiguration;

  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: IntronFetch;
  readonly #now: () => Date;
  readonly #monotonicMilliseconds: () => number;
  readonly #requestTimeoutMilliseconds: number;

  constructor(options: IntronSaharaProviderOptions) {
    if (options.apiKey.trim() === "") {
      throw new Error("An Intron API key is required.");
    }

    const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultBaseUrl);
    const language = options.language ?? "yo";
    const requestTimeoutMilliseconds =
      options.requestTimeoutMilliseconds ?? defaultRequestTimeoutMilliseconds;
    if (
      !Number.isFinite(requestTimeoutMilliseconds) ||
      requestTimeoutMilliseconds <= 0
    ) {
      throw new Error("The Intron request timeout must be a positive number.");
    }

    this.#apiKey = options.apiKey;
    this.#endpoint = `${baseUrl}${INTRON_SYNC_PATH}`;
    this.#fetch =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#now = options.now ?? (() => new Date());
    this.#monotonicMilliseconds =
      options.monotonicMilliseconds ?? (() => performance.now());
    this.#requestTimeoutMilliseconds = requestTimeoutMilliseconds;
    this.configuration = {
      id: `intron-sahara-sync-${language}-v1`,
      providerId: INTRON_SAHARA_PROVIDER_ID,
      modelIdentifier: "unknown",
      options: {
        endpoint: this.#endpoint,
        language,
        transport: "synchronous-file-upload",
        requestTimeoutMilliseconds,
        maximumKnownDurationMilliseconds: INTRON_SYNC_MAX_DURATION_MILLISECONDS,
      },
    };
  }

  async transcribe(
    audio: AudioInput,
    context: TranscriptionContext,
  ): Promise<TranscriptionOutcome> {
    const timing = this.#startTiming();
    const validationFailure = this.#validateInput(audio, context, timing);
    if (validationFailure !== undefined) return validationFailure;

    const form = new FormData();
    form.append("audio_file_name", audio.fileName!);
    form.append(
      "audio_file_blob",
      new Blob([Uint8Array.from(audio.bytes).buffer], {
        type: audio.mediaType,
      }),
      audio.fileName!,
    );
    form.append("use_language_asr_input", "yo");

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.#requestTimeoutMilliseconds,
    );

    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.#apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      const aborted = controller.signal.aborted || isAbortError(error);
      return this.#failure(
        timing,
        aborted ? "request-timeout" : "network-failure",
        aborted
          ? "The Intron transcription request timed out."
          : "The Intron transcription request could not reach the provider.",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await parseJsonSafely(response);
    if (!response.ok) {
      return this.#httpFailure(response, body, timing);
    }

    const parsed = parseSuccess(body);
    if (parsed === undefined) {
      return this.#failure(
        timing,
        "malformed-provider-response",
        "Intron returned a success response without the documented transcription fields.",
        false,
        { httpStatus: response.status },
      );
    }

    const completed = this.#completeTiming(timing);
    return {
      ok: true,
      value: {
        providerConfiguration: this.configuration,
        text: parsed.transcript,
        segments: [],
        detectedLanguages: ["yo"],
        providerStatus: parsed.processingStatus,
        startedAt: timing.startedAt,
        completedAt: completed.completedAt,
        latencyMilliseconds: completed.latencyMilliseconds,
        rawResponseReference: parsed.fileId,
      },
    };
  }

  #validateInput(
    audio: AudioInput,
    context: TranscriptionContext,
    timing: ProviderTiming,
  ): TranscriptionOutcome | undefined {
    if (audio.fileName === undefined || audio.fileName.trim() === "") {
      return this.#failure(
        timing,
        "invalid-audio-input",
        "The Intron synchronous API requires an audio filename.",
        false,
      );
    }
    if (audio.bytes.byteLength === 0 || audio.mediaType.trim() === "") {
      return this.#failure(
        timing,
        "invalid-audio-input",
        "Audio bytes and a MIME type are required.",
        false,
      );
    }
    if (!hasSupportedExtension(audio.fileName)) {
      return this.#failure(
        timing,
        "unsupported-audio-format",
        `Intron synchronous transcription supports only ${INTRON_SYNC_SUPPORTED_EXTENSIONS.join(", ")}.`,
        false,
      );
    }
    if (
      audio.durationMilliseconds !== undefined &&
      audio.durationMilliseconds > INTRON_SYNC_MAX_DURATION_MILLISECONDS
    ) {
      return this.#failure(
        timing,
        "unsupported-audio-duration",
        "Intron synchronous transcription supports audio up to 120 seconds.",
        false,
      );
    }
    if (context.enablePartialResults === true) {
      return this.#failure(
        timing,
        "unsupported-transcription-mode",
        "The Intron synchronous adapter does not support partial results.",
        false,
      );
    }
    return undefined;
  }

  #httpFailure(
    response: Response,
    body: unknown,
    timing: ProviderTiming,
  ): TranscriptionOutcome {
    const fileId = readFileId(body);
    if (response.status === 503) {
      return this.#failure(
        timing,
        "processing-timeout",
        fileId === undefined
          ? "Intron timed out while processing and returned no usable file ID."
          : "Intron timed out while processing; the file ID was preserved for future status lookup.",
        false,
        {
          httpStatus: 503,
          ...(fileId === undefined ? {} : { providerReference: fileId }),
        },
      );
    }
    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get("Retry-After"),
      );
      return this.#failure(
        timing,
        "rate-limited",
        "Intron rate-limited the transcription request.",
        true,
        {
          httpStatus: 429,
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        },
      );
    }
    if (response.status === 401 || response.status === 403) {
      return this.#failure(
        timing,
        "unauthorized",
        "Intron rejected the transcription credentials.",
        false,
        { httpStatus: response.status },
      );
    }
    return this.#failure(
      timing,
      "provider-http-error",
      `Intron returned HTTP ${response.status}.`,
      response.status >= 500,
      { httpStatus: response.status },
    );
  }

  #startTiming(): ProviderTiming {
    return {
      startedAt: this.#now().toISOString(),
      startedMonotonicMilliseconds: this.#monotonicMilliseconds(),
    };
  }

  #completeTiming(timing: ProviderTiming): {
    readonly completedAt: string;
    readonly latencyMilliseconds: number;
  } {
    return {
      completedAt: this.#now().toISOString(),
      latencyMilliseconds: Math.max(
        0,
        this.#monotonicMilliseconds() - timing.startedMonotonicMilliseconds,
      ),
    };
  }

  #failure(
    timing: ProviderTiming,
    code: string,
    message: string,
    retryable: boolean,
    details: Pick<
      TranscriptionFailure,
      "httpStatus" | "providerReference" | "retryAfterSeconds"
    > = {},
  ): TranscriptionOutcome {
    const completed = this.#completeTiming(timing);
    return {
      ok: false,
      error: {
        code,
        message,
        retryable,
        providerConfiguration: this.configuration,
        startedAt: timing.startedAt,
        completedAt: completed.completedAt,
        latencyMilliseconds: completed.latencyMilliseconds,
        ...details,
      },
    };
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The Intron base URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/u, "");
}

function hasSupportedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return INTRON_SYNC_SUPPORTED_EXTENSIONS.some((extension) =>
    lower.endsWith(extension),
  );
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseSuccess(value: unknown): IntronSuccessData | undefined {
  if (!isRecord(value) || !isRecord(value.data)) return undefined;
  const data = value.data;
  if (
    typeof data.file_id !== "string" ||
    data.file_id.trim() === "" ||
    typeof data.processing_status !== "string" ||
    data.processing_status.trim() === "" ||
    typeof data.audio_file_name !== "string" ||
    data.audio_file_name.trim() === "" ||
    typeof data.audio_transcript !== "string"
  ) {
    return undefined;
  }
  return {
    fileId: data.file_id,
    processingStatus: data.processing_status,
    audioFileName: data.audio_file_name,
    transcript: data.audio_transcript,
  };
}

function readFileId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = isRecord(value.data) ? value.data.file_id : value.file_id;
  return typeof candidate === "string" && candidate.trim() !== ""
    ? candidate
    : undefined;
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (value === null || !/^\d+$/u.test(value.trim())) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(value: unknown): boolean {
  return (
    value instanceof Error &&
    (value.name === "AbortError" || value.name === "TimeoutError")
  );
}
