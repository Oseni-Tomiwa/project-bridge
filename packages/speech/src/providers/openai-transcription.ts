import type {
  AudioInput,
  SpeechProvider,
  SpeechProviderConfiguration,
  TranscriptionContext,
  TranscriptionFailure,
  TranscriptionOutcome,
} from "../contracts.js";

export const OPENAI_TRANSCRIPTION_PROVIDER_ID = "openai";
export const OPENAI_TRANSCRIPTION_PATH = "/v1/audio/transcriptions";
export const OPENAI_DEFAULT_TRANSCRIPTION_MODEL = "gpt-transcribe";
export const OPENAI_TRANSCRIPTION_SUPPORTED_EXTENSIONS = [
  ".flac",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".ogg",
  ".wav",
  ".webm",
] as const;

export interface OpenAITranscriptionProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly requestTimeoutMilliseconds?: number;
  readonly fetch?: OpenAITranscriptionFetch;
  readonly now?: () => Date;
  readonly monotonicMilliseconds?: () => number;
}

export type OpenAITranscriptionFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

interface ProviderTiming {
  readonly startedAt: string;
  readonly startedMonotonicMilliseconds: number;
}

const defaultBaseUrl = "https://api.openai.com";
const defaultRequestTimeoutMilliseconds = 120_000;

export class OpenAITranscriptionSpeechProvider implements SpeechProvider {
  readonly configuration: SpeechProviderConfiguration;

  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: OpenAITranscriptionFetch;
  readonly #model: string;
  readonly #now: () => Date;
  readonly #monotonicMilliseconds: () => number;
  readonly #requestTimeoutMilliseconds: number;

  constructor(options: OpenAITranscriptionProviderOptions) {
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultBaseUrl);
    const model = options.model?.trim() ?? OPENAI_DEFAULT_TRANSCRIPTION_MODEL;
    const requestTimeoutMilliseconds =
      options.requestTimeoutMilliseconds ?? defaultRequestTimeoutMilliseconds;
    if (
      !Number.isFinite(requestTimeoutMilliseconds) ||
      requestTimeoutMilliseconds <= 0
    ) {
      throw new Error("The OpenAI request timeout must be a positive number.");
    }

    this.#apiKey = options.apiKey.trim();
    this.#endpoint = `${baseUrl}${OPENAI_TRANSCRIPTION_PATH}`;
    this.#fetch =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#model = model;
    this.#now = options.now ?? (() => new Date());
    this.#monotonicMilliseconds =
      options.monotonicMilliseconds ?? (() => performance.now());
    this.#requestTimeoutMilliseconds = requestTimeoutMilliseconds;
    this.configuration = {
      id: `openai-file-${configurationIdPart(model)}-v1`,
      providerId: OPENAI_TRANSCRIPTION_PROVIDER_ID,
      modelIdentifier: model === "" ? "missing" : model,
      options: {
        endpoint: this.#endpoint,
        transport: "synchronous-file-upload",
        responseFormat: "json",
        languageHint: null,
        requestTimeoutMilliseconds,
        automaticRetries: 0,
      },
    };
  }

  async transcribe(
    audio: AudioInput,
    context: TranscriptionContext,
  ): Promise<TranscriptionOutcome> {
    const timing = this.#startTiming();
    if (this.#apiKey === "" || this.#model === "") {
      return this.#failure(
        timing,
        "missing-provider-configuration",
        "An OpenAI API key and transcription model are required.",
        false,
      );
    }

    const validationFailure = this.#validateInput(audio, context, timing);
    if (validationFailure !== undefined) return validationFailure;

    const form = new FormData();
    form.append(
      "file",
      new Blob([Uint8Array.from(audio.bytes).buffer], {
        type: audio.mediaType,
      }),
      audio.fileName!,
    );
    form.append("model", this.#model);
    form.append("response_format", "json");

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.#requestTimeoutMilliseconds,
    );

    let response: Response;
    try {
      // Native fetch performs one request and has no automatic retry policy.
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
          ? "The OpenAI transcription request timed out."
          : "The OpenAI transcription request could not reach the provider.",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await parseJsonSafely(response);
    const requestId = readRequestId(response);
    if (!response.ok) {
      return this.#httpFailure(response, timing, requestId);
    }
    if (!isRecord(body) || typeof body.text !== "string") {
      return this.#failure(
        timing,
        "malformed-provider-response",
        "OpenAI returned a success response without a transcript.",
        false,
        {
          httpStatus: response.status,
          ...(requestId === undefined ? {} : { providerReference: requestId }),
        },
      );
    }

    const completed = this.#completeTiming(timing);
    return {
      ok: true,
      value: {
        providerConfiguration: this.configuration,
        text: body.text,
        segments: [],
        startedAt: timing.startedAt,
        completedAt: completed.completedAt,
        latencyMilliseconds: completed.latencyMilliseconds,
        ...(requestId === undefined ? {} : { rawResponseReference: requestId }),
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
        "The OpenAI transcription API requires an audio filename.",
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
        `OpenAI file transcription supports only ${OPENAI_TRANSCRIPTION_SUPPORTED_EXTENSIONS.join(", ")}.`,
        false,
      );
    }
    if (context.enablePartialResults === true) {
      return this.#failure(
        timing,
        "unsupported-transcription-mode",
        "The OpenAI file-transcription adapter does not support partial results.",
        false,
      );
    }
    return undefined;
  }

  #httpFailure(
    response: Response,
    timing: ProviderTiming,
    requestId: string | undefined,
  ): TranscriptionOutcome {
    const details = {
      httpStatus: response.status,
      ...(requestId === undefined ? {} : { providerReference: requestId }),
    };
    if (response.status === 401 || response.status === 403) {
      return this.#failure(
        timing,
        "unauthorized",
        "OpenAI rejected the transcription credentials.",
        false,
        details,
      );
    }
    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get("Retry-After"),
      );
      return this.#failure(
        timing,
        "rate-limited",
        "OpenAI rate-limited the transcription request.",
        true,
        {
          ...details,
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        },
      );
    }
    return this.#failure(
      timing,
      "provider-http-error",
      `OpenAI returned HTTP ${response.status}.`,
      response.status >= 500,
      details,
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
    throw new Error("The OpenAI base URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/u, "");
}

function configurationIdPart(model: string): string {
  const normalized = model
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized === "" ? "missing" : normalized;
}

function hasSupportedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return OPENAI_TRANSCRIPTION_SUPPORTED_EXTENSIONS.some((extension) =>
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

function readRequestId(response: Response): string | undefined {
  const value = response.headers.get("x-request-id")?.trim();
  return value === undefined || value === "" ? undefined : value;
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
