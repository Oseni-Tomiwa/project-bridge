import type {
  AudioInput,
  ProviderModelMetadata,
  SpeechProvider,
  SpeechProviderConfiguration,
  TranscriptionContext,
  TranscriptionFailure,
  TranscriptionOutcome,
} from "../contracts.js";

export const DEEPGRAM_TRANSCRIPTION_PROVIDER_ID = "deepgram";
export const DEEPGRAM_TRANSCRIPTION_PATH = "/v1/listen";
export const DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL = "nova-3";
export const DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE = "multi";

export interface DeepgramTranscriptionProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly language?: string;
  readonly smartFormat?: boolean;
  readonly baseUrl?: string;
  readonly requestTimeoutMilliseconds?: number;
  readonly fetch?: DeepgramTranscriptionFetch;
  readonly now?: () => Date;
  readonly monotonicMilliseconds?: () => number;
}

export type DeepgramTranscriptionFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

interface ProviderTiming {
  readonly startedAt: string;
  readonly startedMonotonicMilliseconds: number;
}

interface ParsedSuccess {
  readonly transcript: string;
  readonly requestId?: string;
  readonly detectedLanguages?: readonly string[];
  readonly providerModelMetadata?: ProviderModelMetadata;
}

const defaultBaseUrl = "https://api.deepgram.com";
const defaultRequestTimeoutMilliseconds = 120_000;
const requestedModelVersion = "latest";

export class DeepgramTranscriptionSpeechProvider implements SpeechProvider {
  readonly configuration: SpeechProviderConfiguration;

  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: DeepgramTranscriptionFetch;
  readonly #language: string;
  readonly #model: string;
  readonly #now: () => Date;
  readonly #monotonicMilliseconds: () => number;
  readonly #requestTimeoutMilliseconds: number;

  constructor(options: DeepgramTranscriptionProviderOptions) {
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultBaseUrl);
    const model = options.model?.trim() ?? DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL;
    const language =
      options.language?.trim() ?? DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE;
    const smartFormat = options.smartFormat ?? false;
    const requestTimeoutMilliseconds =
      options.requestTimeoutMilliseconds ?? defaultRequestTimeoutMilliseconds;
    if (
      !Number.isFinite(requestTimeoutMilliseconds) ||
      requestTimeoutMilliseconds <= 0
    ) {
      throw new Error(
        "The Deepgram request timeout must be a positive number.",
      );
    }

    const endpoint = new URL(DEEPGRAM_TRANSCRIPTION_PATH, `${baseUrl}/`);
    endpoint.searchParams.set("model", model);
    endpoint.searchParams.set("version", requestedModelVersion);
    endpoint.searchParams.set("language", language);
    endpoint.searchParams.set("smart_format", String(smartFormat));

    this.#apiKey = options.apiKey.trim();
    this.#endpoint = endpoint.toString();
    this.#fetch =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#language = language;
    this.#model = model;
    this.#now = options.now ?? (() => new Date());
    this.#monotonicMilliseconds =
      options.monotonicMilliseconds ?? (() => performance.now());
    this.#requestTimeoutMilliseconds = requestTimeoutMilliseconds;
    this.configuration = {
      id: `deepgram-prerecorded-${configurationIdPart(model)}-${configurationIdPart(language)}-smart-format-${smartFormat ? "on" : "off"}-v1`,
      providerId: DEEPGRAM_TRANSCRIPTION_PROVIDER_ID,
      modelIdentifier: model === "" ? "missing" : model,
      options: {
        endpoint: `${baseUrl}${DEEPGRAM_TRANSCRIPTION_PATH}`,
        transport: "synchronous-prerecorded-binary",
        requestedModelVersion,
        language: language === "" ? null : language,
        smartFormat,
        detectLanguage: false,
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
    if (this.#apiKey === "" || this.#model === "" || this.#language === "") {
      return this.#failure(
        timing,
        "missing-provider-configuration",
        "A Deepgram API key, model, and language configuration are required.",
        false,
      );
    }

    const validationFailure = this.#validateInput(audio, context, timing);
    if (validationFailure !== undefined) return validationFailure;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.#requestTimeoutMilliseconds,
    );

    let response: Response;
    try {
      // Native fetch performs exactly one request; this adapter never retries.
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.#apiKey}`,
          "Content-Type": audio.mediaType,
        },
        body: Uint8Array.from(audio.bytes).buffer,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      const aborted = controller.signal.aborted || isAbortError(error);
      return this.#failure(
        timing,
        aborted ? "request-timeout" : "network-failure",
        aborted
          ? "The Deepgram transcription request timed out."
          : "The Deepgram transcription request could not reach the provider.",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await parseJsonSafely(response);
    const requestId = readRequestId(body, response);
    if (!response.ok) {
      return this.#httpFailure(response, timing, requestId);
    }

    const parsed = parseSuccess(body, requestId);
    if (parsed === undefined) {
      return this.#failure(
        timing,
        "malformed-provider-response",
        "Deepgram returned a success response without a usable transcript.",
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
        text: parsed.transcript,
        segments: [],
        providerStatus: `http-${response.status}`,
        startedAt: timing.startedAt,
        completedAt: completed.completedAt,
        latencyMilliseconds: completed.latencyMilliseconds,
        ...(parsed.detectedLanguages === undefined
          ? {}
          : { detectedLanguages: parsed.detectedLanguages }),
        ...(parsed.providerModelMetadata === undefined
          ? {}
          : { providerModelMetadata: parsed.providerModelMetadata }),
        ...(parsed.requestId === undefined
          ? {}
          : { rawResponseReference: parsed.requestId }),
      },
    };
  }

  #validateInput(
    audio: AudioInput,
    context: TranscriptionContext,
    timing: ProviderTiming,
  ): TranscriptionOutcome | undefined {
    if (audio.bytes.byteLength === 0 || audio.mediaType.trim() === "") {
      return this.#failure(
        timing,
        "invalid-audio-input",
        "Audio bytes and a MIME type are required.",
        false,
      );
    }
    if (!isSupportedMediaType(audio.mediaType)) {
      return this.#failure(
        timing,
        "unsupported-audio-format",
        "Deepgram prerecorded transcription requires an audio or supported media Content-Type.",
        false,
      );
    }
    if (context.enablePartialResults === true) {
      return this.#failure(
        timing,
        "unsupported-transcription-mode",
        "The Deepgram prerecorded adapter does not support partial results.",
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
        "Deepgram rejected the transcription credentials.",
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
        "Deepgram rate-limited the transcription request.",
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
      `Deepgram returned HTTP ${response.status}.`,
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
    throw new Error("The Deepgram base URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/u, "");
}

function configurationIdPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized === "" ? "missing" : normalized;
}

function isSupportedMediaType(value: string): boolean {
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType?.startsWith("audio/") === true ||
    mediaType === "video/mp4" ||
    mediaType === "video/webm"
  );
}

function parseSuccess(
  body: unknown,
  requestId: string | undefined,
): ParsedSuccess | undefined {
  if (!isRecord(body) || !isRecord(body.results)) return undefined;
  const channels = body.results.channels;
  if (!Array.isArray(channels) || channels.length === 0) return undefined;

  const transcripts: string[] = [];
  const languages = new Set<string>();
  for (const channel of channels) {
    if (!isRecord(channel) || !Array.isArray(channel.alternatives)) {
      return undefined;
    }
    const alternative = channel.alternatives[0];
    if (!isRecord(alternative) || typeof alternative.transcript !== "string") {
      return undefined;
    }
    transcripts.push(alternative.transcript);
    addLanguage(languages, channel.detected_language);
    if (Array.isArray(alternative.languages)) {
      for (const language of alternative.languages)
        addLanguage(languages, language);
    }
  }

  const providerModelMetadata = parseModelMetadata(body);
  return {
    transcript: transcripts.join("\n"),
    ...(requestId === undefined ? {} : { requestId }),
    ...(languages.size === 0 ? {} : { detectedLanguages: [...languages] }),
    ...(providerModelMetadata === undefined ? {} : { providerModelMetadata }),
  };
}

function parseModelMetadata(
  body: Record<string, unknown>,
): ProviderModelMetadata | undefined {
  if (!isRecord(body.metadata)) return undefined;
  const models = Array.isArray(body.metadata.models)
    ? body.metadata.models.filter(
        (model): model is string => typeof model === "string" && model !== "",
      )
    : [];
  const reference = models[0];
  const modelInfo = isRecord(body.metadata.model_info)
    ? body.metadata.model_info
    : undefined;
  const info =
    reference !== undefined &&
    modelInfo !== undefined &&
    isRecord(modelInfo[reference])
      ? modelInfo[reference]
      : undefined;
  const identifier = readNonEmptyString(info?.name);
  const version = readNonEmptyString(info?.version);
  const architecture = readNonEmptyString(info?.arch);
  if (
    reference === undefined &&
    identifier === undefined &&
    version === undefined &&
    architecture === undefined
  ) {
    return undefined;
  }
  return {
    ...(identifier === undefined ? {} : { identifier }),
    ...(version === undefined ? {} : { version }),
    ...(reference === undefined ? {} : { reference }),
    ...(architecture === undefined ? {} : { architecture }),
  };
}

function addLanguage(languages: Set<string>, value: unknown): void {
  const language = readNonEmptyString(value);
  if (language !== undefined) languages.add(language);
}

function readRequestId(body: unknown, response: Response): string | undefined {
  if (isRecord(body) && isRecord(body.metadata)) {
    const value = readNonEmptyString(body.metadata.request_id);
    if (value !== undefined) return value;
  }
  return readNonEmptyString(response.headers.get("dg-request-id"));
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
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
