import type { JsonValue, RunId, SampleId } from "@project-bridge/shared";
import type {
  AudioInput,
  SpeechProvider,
  SpeechProviderConfiguration,
} from "@project-bridge/speech";

export interface RecordingDeviceMetadata {
  readonly category: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly recordingApplication?: string;
  readonly sampleRateHz?: number;
  readonly channelCount?: number;
  readonly codec?: string;
}

export interface EvaluationMetadata {
  readonly languagePair: readonly [string, string];
  readonly codeSwitchPattern?: string;
  readonly domain: string;
  readonly scenario: string;
  readonly countryCode: string;
  readonly accentLabel: string;
  readonly device: RecordingDeviceMetadata;
  readonly noise: Readonly<{
    condition: "clean" | "noisy";
    label?: string;
    signalToNoiseRatioDb?: number;
  }>;
  readonly split: "development" | "test";
  readonly speakerPartitionId: string;
}

export interface EvaluationAudioReference {
  readonly assetId: string;
  readonly contentSha256: string;
  readonly mediaType: string;
  readonly durationMilliseconds: number;
}

export interface EvaluationDataGovernance {
  readonly provenance: Readonly<{
    sourceType: "participant-recording" | "licensed-dataset" | "synthetic";
    collectionId: string;
    recordedAt?: string;
    scriptReference?: string;
  }>;
  readonly consent: Readonly<{
    status: "documented" | "not-applicable";
    recordReference?: string;
    allowedUses: readonly string[];
    thirdPartyProviderProcessingAllowed: boolean;
  }>;
  readonly license: Readonly<{
    status: "documented" | "not-applicable" | "review-required";
    identifier?: string;
  }>;
  readonly retention: Readonly<{
    policyId: string;
    deleteAfter?: string;
  }>;
}

export interface ReferenceTranscript {
  readonly text: string;
  readonly annotationProtocolId: string;
  readonly annotationVersion: string;
  readonly reviewerCount: number;
}

export interface DownstreamReference {
  readonly intent: string;
  readonly entities: Readonly<Record<string, JsonValue>>;
  readonly expectedTaskOutcome: string;
}

/** Serializable, versionable metadata. It deliberately contains no audio bytes. */
export interface EvaluationSample {
  readonly id: SampleId;
  readonly audio: EvaluationAudioReference;
  readonly referenceTranscript: ReferenceTranscript;
  readonly metadata: EvaluationMetadata;
  readonly governance: EvaluationDataGovernance;
  readonly downstream?: DownstreamReference;
}

/** Runtime pairing of a manifest sample with its locally resolved audio bytes. */
export interface PreparedEvaluationSample {
  readonly sample: EvaluationSample;
  readonly audio: AudioInput &
    Required<Pick<AudioInput, "sampleId" | "contentSha256">>;
}

export interface NormalizationProfile {
  readonly id: string;
  readonly version: string;
  readonly unicodeForm: "NFC" | "NFKC";
  readonly lowercase: boolean;
  readonly removePunctuation: boolean;
  readonly collapseWhitespace: boolean;
}

export interface WordErrorMetrics {
  readonly substitutions: number;
  readonly deletions: number;
  readonly insertions: number;
  readonly referenceWordCount: number;
  readonly wer: number | null;
}

export interface TranscriptionAccuracyResult {
  /** Whitespace-tokenized text with no case, punctuation, or Unicode changes. */
  readonly rawWordError: WordErrorMetrics;
  readonly normalizedWordError: WordErrorMetrics;
  readonly normalizationProfileId: string;
  readonly normalizationProfileVersion: string;
}

export interface IntentEvaluationResult {
  readonly expected: string;
  readonly predicted?: string;
  readonly result: "correct" | "incorrect" | "not-evaluated";
}

export interface EntitySlotEvaluationResult {
  readonly expected: Readonly<Record<string, JsonValue>>;
  readonly predicted: Readonly<Record<string, JsonValue>>;
  readonly matchingPolicyId: string;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
}

export interface DownstreamTaskEvaluationResult {
  readonly expectedOutcome: string;
  readonly observedOutcome?: string;
  readonly result: "completed" | "not-completed" | "not-attempted" | "failed";
}

export interface BenchmarkFailure {
  readonly stage: "audio-load" | "transcription" | "interpretation" | "action";
  readonly code: string;
  readonly retryable: boolean;
  readonly message?: string;
}

export interface ProviderEvaluationResult {
  readonly runId: RunId;
  readonly sampleId: SampleId;
  readonly providerConfiguration: SpeechProviderConfiguration;
  readonly referenceTranscript: string;
  readonly hypothesisTranscript?: Readonly<{
    raw: string;
    normalized: string;
  }>;
  readonly transcriptionAccuracy?: TranscriptionAccuracyResult;
  readonly timing: Readonly<{
    startedAt: string;
    completedAt: string;
    latencyMilliseconds: number;
    attemptCount: number;
  }>;
  readonly failure: BenchmarkFailure | null;
  readonly intent?: IntentEvaluationResult;
  readonly entities?: EntitySlotEvaluationResult;
  readonly downstreamTask?: DownstreamTaskEvaluationResult;
}

export interface BenchmarkRunConfiguration {
  readonly runId: RunId;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly runnerVersion: string;
  readonly sourceRevision: string;
  readonly normalization: NormalizationProfile;
  readonly rawWerPolicyVersion: string;
  readonly providers: readonly SpeechProviderConfiguration[];
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly startedAt: string;
}

export interface BenchmarkRunner {
  run(
    samples: readonly PreparedEvaluationSample[],
    providers: readonly SpeechProvider[],
    configuration: BenchmarkRunConfiguration,
  ): Promise<readonly ProviderEvaluationResult[]>;
}

/**
 * Guards persisted results against a provider configuration that was not part
 * of the frozen run configuration. Secret-bearing options must be removed
 * before either value reaches this function.
 */
export function providerConfigurationMatchesRun(
  result: ProviderEvaluationResult,
  run: BenchmarkRunConfiguration,
): boolean {
  if (result.runId !== run.runId) return false;

  const expected = run.providers.find(
    (provider) => provider.id === result.providerConfiguration.id,
  );
  return (
    expected !== undefined &&
    canonicalJson(expected) === canonicalJson(result.providerConfiguration)
  );
}

export const rawWerPolicyVersion = "whitespace-tokenization-v1";

export const defaultNormalizationProfile: NormalizationProfile = {
  id: "unicode-case-punctuation-whitespace",
  version: "1",
  unicodeForm: "NFKC",
  lowercase: true,
  removePunctuation: true,
  collapseWhitespace: true,
};

export function normalizeTranscript(
  input: string,
  profile: NormalizationProfile = defaultNormalizationProfile,
): string {
  let value = input.normalize(profile.unicodeForm);

  if (profile.lowercase) value = value.toLocaleLowerCase();
  if (profile.removePunctuation) {
    value = value.replace(/[\p{P}\p{S}]+/gu, " ");
  }
  if (profile.collapseWhitespace) value = value.replace(/\s+/gu, " ").trim();

  return value;
}

export function calculateTranscriptionAccuracy(
  reference: string,
  hypothesis: string,
  profile: NormalizationProfile = defaultNormalizationProfile,
): TranscriptionAccuracyResult {
  return {
    rawWordError: calculateWordErrorFromTokens(
      tokenizeRaw(reference),
      tokenizeRaw(hypothesis),
    ),
    normalizedWordError: calculateWordErrorFromTokens(
      tokenizeNormalized(reference, profile),
      tokenizeNormalized(hypothesis, profile),
    ),
    normalizationProfileId: profile.id,
    normalizationProfileVersion: profile.version,
  };
}

function tokenizeRaw(value: string): readonly string[] {
  const trimmed = value.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/u);
}

function tokenizeNormalized(
  value: string,
  profile: NormalizationProfile,
): readonly string[] {
  const normalized = normalizeTranscript(value, profile);
  return normalized === "" ? [] : normalized.split(" ");
}

function calculateWordErrorFromTokens(
  reference: readonly string[],
  hypothesis: readonly string[],
): WordErrorMetrics {
  const edits = editCounts(reference, hypothesis);
  const errors = edits.substitutions + edits.deletions + edits.insertions;

  return {
    ...edits,
    referenceWordCount: reference.length,
    wer: reference.length === 0 ? null : errors / reference.length,
  };
}

type EditCounts = Pick<
  WordErrorMetrics,
  "substitutions" | "deletions" | "insertions"
>;

function editCounts(
  reference: readonly string[],
  hypothesis: readonly string[],
): EditCounts {
  const rows: EditCounts[][] = Array.from(
    { length: reference.length + 1 },
    () =>
      Array.from({ length: hypothesis.length + 1 }, () => ({
        substitutions: 0,
        deletions: 0,
        insertions: 0,
      })),
  );

  for (let i = 1; i <= reference.length; i += 1) {
    rows[i]![0] = { substitutions: 0, deletions: i, insertions: 0 };
  }
  for (let j = 1; j <= hypothesis.length; j += 1) {
    rows[0]![j] = { substitutions: 0, deletions: 0, insertions: j };
  }

  for (let i = 1; i <= reference.length; i += 1) {
    for (let j = 1; j <= hypothesis.length; j += 1) {
      if (reference[i - 1] === hypothesis[j - 1]) {
        rows[i]![j] = rows[i - 1]![j - 1]!;
        continue;
      }

      rows[i]![j] = bestEdit(
        increment(rows[i - 1]![j - 1]!, "substitutions"),
        increment(rows[i - 1]![j]!, "deletions"),
        increment(rows[i]![j - 1]!, "insertions"),
      );
    }
  }

  return rows[reference.length]![hypothesis.length]!;
}

function increment(counts: EditCounts, key: keyof EditCounts): EditCounts {
  return { ...counts, [key]: counts[key] + 1 };
}

function bestEdit(...candidates: readonly EditCounts[]): EditCounts {
  return candidates.reduce((best, candidate) =>
    total(candidate) < total(best) ? candidate : best,
  );
}

function total(counts: EditCounts): number {
  return counts.substitutions + counts.deletions + counts.insertions;
}

function canonicalJson(value: JsonValue | SpeechProviderConfiguration): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}
