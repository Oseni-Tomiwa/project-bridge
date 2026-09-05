import type {
  JsonValue,
  OperationFailure,
  SampleId,
} from "@project-bridge/shared";

export type SpeechProviderId = string;

/**
 * A sanitized, immutable snapshot of the settings that can affect a transcript.
 * Credentials and secret-bearing headers must never be included in `options`.
 */
export interface SpeechProviderConfiguration {
  readonly id: string;
  readonly providerId: SpeechProviderId;
  readonly modelIdentifier: string;
  readonly modelVersion?: string;
  readonly region?: string;
  readonly options: Readonly<Record<string, JsonValue>>;
}

export interface AudioInput {
  readonly sampleId?: SampleId;
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly durationMilliseconds?: number;
  readonly fileName?: string;
  readonly contentSha256?: string;
}

export interface TranscriptionContext {
  readonly languageHints?: readonly string[];
  readonly domainHint?: string;
  readonly enablePartialResults?: boolean;
}

export interface TranscriptSegment {
  readonly text: string;
  readonly startMilliseconds: number;
  readonly endMilliseconds: number;
  readonly confidence?: number;
  readonly language?: string;
}

export interface TranscriptionResult {
  readonly providerConfiguration: SpeechProviderConfiguration;
  readonly text: string;
  readonly segments: readonly TranscriptSegment[];
  readonly detectedLanguages?: readonly string[];
  readonly latencyMilliseconds: number;
  readonly rawResponseReference?: string;
}

export type TranscriptionOutcome =
  | { readonly ok: true; readonly value: TranscriptionResult }
  | { readonly ok: false; readonly error: OperationFailure };

export interface SpeechProvider {
  readonly configuration: SpeechProviderConfiguration;
  transcribe(
    audio: AudioInput,
    context: TranscriptionContext,
  ): Promise<TranscriptionOutcome>;
}
