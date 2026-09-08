import type { RunId, SampleId } from "@project-bridge/shared";
import type {
  ProviderModelMetadata,
  SpeechProviderConfiguration,
} from "@project-bridge/speech";

export const STT_BATCH_RUN_SCHEMA_VERSION = "0.1";
export const STT_BATCH_RESULT_SCHEMA_VERSION = "0.1";
export const STT_BATCH_RUNNER_VERSION = "stt-batch-runner-v0.1";

export interface SttBenchmarkManifestIdentity {
  readonly id: string;
  readonly version: string;
  readonly sourceRevision: string;
  readonly contentSha256: string;
}

export interface SttBenchmarkNormalizationIdentity {
  readonly profileId: string;
  readonly profileVersion: string;
  readonly rawScoringPolicyVersion: string;
}

export interface SttBenchmarkRunMetadata {
  readonly schemaVersion: typeof STT_BATCH_RUN_SCHEMA_VERSION;
  readonly runId: RunId;
  readonly runnerVersion: typeof STT_BATCH_RUNNER_VERSION;
  readonly createdAt: string;
  readonly manifest: SttBenchmarkManifestIdentity;
  readonly normalization: SttBenchmarkNormalizationIdentity;
  readonly providerConfigurations: readonly SpeechProviderConfiguration[];
  readonly executionPolicy: Readonly<{
    concurrency: 1;
    automaticRetries: 0;
    order: "sample-id-then-provider-id";
  }>;
}

export interface SttBenchmarkSampleIdentity {
  readonly id: SampleId;
  readonly audioContentSha256: string;
  readonly referenceTranscript: string;
}

export interface SttBenchmarkExecutionTiming {
  readonly executedAt: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly latencyMilliseconds: number;
  readonly attemptCount: 1;
}

export type SttBenchmarkTranscriptionOutcome =
  | Readonly<{
      status: "success";
      hypothesisTranscript: string;
      providerStatus?: string;
      providerReference?: string;
      detectedLanguages?: readonly string[];
    }>
  | Readonly<{
      status: "failure";
      failure: Readonly<{
        stage: "transcription";
        code: string;
        retryable: boolean;
        httpStatus?: number;
        retryAfterSeconds?: number;
        providerReference?: string;
      }>;
    }>;

export interface SttBenchmarkResultRecord {
  readonly schemaVersion: typeof STT_BATCH_RESULT_SCHEMA_VERSION;
  readonly executionId: string;
  readonly runId: RunId;
  readonly manifest: SttBenchmarkManifestIdentity;
  readonly sample: SttBenchmarkSampleIdentity;
  readonly providerConfiguration: SpeechProviderConfiguration;
  readonly providerModelMetadata?: ProviderModelMetadata;
  readonly normalization: SttBenchmarkNormalizationIdentity;
  readonly execution: SttBenchmarkExecutionTiming;
  readonly outcome: SttBenchmarkTranscriptionOutcome;
}
