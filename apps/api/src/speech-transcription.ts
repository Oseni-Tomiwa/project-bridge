import {
  IntronSaharaSpeechProvider,
  type SpeechProvider,
} from "@project-bridge/speech";

export const PRODUCT_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const PRODUCT_AUDIO_MAX_DURATION_MILLISECONDS = 60_000;

const supportedMediaTypes = new Map([
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/flac", "flac"],
]);

export interface ProductAudioUpload {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly durationMilliseconds?: number;
}

export interface ProductTranscriptionSuccess {
  readonly transcript: string;
  readonly provider: string;
  readonly configuration: Readonly<{
    id: string;
    modelIdentifier: string;
    modelVersion?: string;
  }>;
  readonly latencyMs: number;
}

export class ProductSpeechError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createDefaultProductSpeechProvider(
  environment: NodeJS.ProcessEnv = process.env,
): SpeechProvider | undefined {
  const apiKey = environment.INTRON_API_KEY?.trim();
  if (!apiKey) return undefined;

  return new IntronSaharaSpeechProvider({
    apiKey,
    ...(environment.INTRON_STT_BASE_URL?.trim()
      ? { baseUrl: environment.INTRON_STT_BASE_URL.trim() }
      : {}),
    language: "yo",
  });
}

export async function transcribeProductAudio(
  provider: SpeechProvider | undefined,
  upload: ProductAudioUpload,
): Promise<ProductTranscriptionSuccess> {
  const mediaType = normalizeMediaType(upload.mediaType);
  const extension = supportedMediaTypes.get(mediaType);
  if (extension === undefined) {
    throw new ProductSpeechError(
      "unsupported-audio-format",
      "This audio format is not supported. Try typing your message instead.",
      415,
    );
  }
  if (upload.bytes.byteLength === 0) {
    throw new ProductSpeechError(
      "empty-audio",
      "No audio was captured. Try recording again or type your message.",
      400,
    );
  }
  if (upload.bytes.byteLength > PRODUCT_AUDIO_MAX_BYTES) {
    throw new ProductSpeechError(
      "audio-too-large",
      "The recording is too large. Record a shorter message or type it instead.",
      413,
    );
  }
  if (
    upload.durationMilliseconds !== undefined &&
    (!Number.isFinite(upload.durationMilliseconds) ||
      upload.durationMilliseconds < 0 ||
      upload.durationMilliseconds > PRODUCT_AUDIO_MAX_DURATION_MILLISECONDS)
  ) {
    throw new ProductSpeechError(
      "audio-too-long",
      "Recordings must be one minute or shorter.",
      413,
    );
  }
  if (provider === undefined) {
    throw new ProductSpeechError(
      "stt-not-configured",
      "Voice transcription is not configured. You can still type your message.",
      503,
    );
  }

  const outcome = await provider.transcribe(
    {
      bytes: upload.bytes,
      mediaType,
      fileName: `browser-recording.${extension}`,
      ...(upload.durationMilliseconds === undefined
        ? {}
        : { durationMilliseconds: upload.durationMilliseconds }),
    },
    { languageHints: ["yo"] },
  );

  if (!outcome.ok) throw mapProviderFailure(outcome.error.code);
  return {
    transcript: outcome.value.text,
    provider: outcome.value.providerConfiguration.providerId,
    configuration: {
      id: outcome.value.providerConfiguration.id,
      modelIdentifier: outcome.value.providerConfiguration.modelIdentifier,
      ...(outcome.value.providerConfiguration.modelVersion === undefined
        ? {}
        : {
            modelVersion: outcome.value.providerConfiguration.modelVersion,
          }),
    },
    latencyMs: outcome.value.latencyMilliseconds,
  };
}

export function isSupportedProductAudioType(mediaType: string): boolean {
  return supportedMediaTypes.has(normalizeMediaType(mediaType));
}

function normalizeMediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function mapProviderFailure(code: string): ProductSpeechError {
  switch (code) {
    case "unauthorized":
      return new ProductSpeechError(
        "stt-unauthorized",
        "Voice transcription is temporarily unavailable. You can still type your message.",
        502,
      );
    case "rate-limited":
      return new ProductSpeechError(
        "stt-rate-limited",
        "Voice transcription is busy. Wait a moment or type your message.",
        429,
      );
    case "request-timeout":
    case "processing-timeout":
      return new ProductSpeechError(
        "stt-timeout",
        "Voice transcription took too long. Try again or type your message.",
        504,
      );
    case "unsupported-audio-format":
    case "invalid-audio-input":
      return new ProductSpeechError(
        "unsupported-audio-format",
        "This audio format is not supported. Try typing your message instead.",
        415,
      );
    default:
      return new ProductSpeechError(
        "transcription-failed",
        "We could not transcribe that recording. Try again or type your message.",
        502,
      );
  }
}
