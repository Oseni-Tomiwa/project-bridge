import {
  normalizeYorubaTranscript,
  type YorubaNormalizationProfileDesign,
} from "./yoruba.js";

export const STT_METRIC_SCHEMA_VERSION = "stt-metrics-v0.1";
export const STT_SCORING_POLICY_VERSION = "stt-scoring-policy-v0.1";
export const RAW_WORD_TOKENIZATION_VERSION = "whitespace-tokenization-v1";
export const RAW_CHARACTER_TOKENIZATION_VERSION =
  "unicode-code-points-including-whitespace-v1";
export const NORMALIZED_CHARACTER_TOKENIZATION_VERSION =
  "normalized-unicode-code-points-including-single-spaces-v1";
export const LATENCY_SUMMARY_POLICY_VERSION =
  "milliseconds-linear-percentile-v1";

export interface EditCounts {
  readonly substitutions: number;
  readonly deletions: number;
  readonly insertions: number;
}

export interface WordErrorRate extends EditCounts {
  readonly referenceWordCount: number;
  readonly wer: number | null;
}

export interface CharacterErrorRate extends EditCounts {
  readonly referenceCharacterCount: number;
  readonly cer: number | null;
}

export interface SttSampleMetricBundle {
  readonly rawSurface: Readonly<{
    wer: WordErrorRate;
    cer: CharacterErrorRate;
  }>;
  readonly strictNormalized: Readonly<{
    profileId: string;
    profileVersion: string;
    wer: WordErrorRate;
    cer: CharacterErrorRate;
  }>;
  readonly diacriticInsensitiveAnalysis: Readonly<{
    profileId: string;
    profileVersion: string;
    analysisOnly: true;
    wer: WordErrorRate;
    cer: CharacterErrorRate;
  }>;
}

export interface LatencySummary {
  readonly count: number;
  readonly meanMilliseconds: number | null;
  readonly medianMilliseconds: number | null;
  readonly p50Milliseconds: number | null;
  readonly p95Milliseconds: number | null;
  readonly minMilliseconds: number | null;
  readonly maxMilliseconds: number | null;
}

export function calculateSttSampleMetrics(
  reference: string,
  hypothesis: string,
  strictProfile: YorubaNormalizationProfileDesign,
  diacriticInsensitiveProfile: YorubaNormalizationProfileDesign,
): SttSampleMetricBundle {
  assertProfile(strictProfile, false);
  assertProfile(diacriticInsensitiveProfile, true);
  const strictReference = normalizeYorubaTranscript(reference, strictProfile);
  const strictHypothesis = normalizeYorubaTranscript(hypothesis, strictProfile);
  const analysisReference = normalizeYorubaTranscript(
    reference,
    diacriticInsensitiveProfile,
  );
  const analysisHypothesis = normalizeYorubaTranscript(
    hypothesis,
    diacriticInsensitiveProfile,
  );
  return {
    rawSurface: {
      wer: calculateWordErrorRate(
        tokenizeWords(reference),
        tokenizeWords(hypothesis),
      ),
      cer: calculateCharacterErrorRate(
        tokenizeCodePoints(reference),
        tokenizeCodePoints(hypothesis),
      ),
    },
    strictNormalized: {
      profileId: strictProfile.id,
      profileVersion: strictProfile.version,
      wer: calculateWordErrorRate(
        tokenizeWords(strictReference),
        tokenizeWords(strictHypothesis),
      ),
      cer: calculateCharacterErrorRate(
        tokenizeCodePoints(strictReference),
        tokenizeCodePoints(strictHypothesis),
      ),
    },
    diacriticInsensitiveAnalysis: {
      profileId: diacriticInsensitiveProfile.id,
      profileVersion: diacriticInsensitiveProfile.version,
      analysisOnly: true,
      wer: calculateWordErrorRate(
        tokenizeWords(analysisReference),
        tokenizeWords(analysisHypothesis),
      ),
      cer: calculateCharacterErrorRate(
        tokenizeCodePoints(analysisReference),
        tokenizeCodePoints(analysisHypothesis),
      ),
    },
  };
}

export function calculateWordErrorRate(
  referenceTokens: readonly string[],
  hypothesisTokens: readonly string[],
): WordErrorRate {
  const counts = calculateEditCounts(referenceTokens, hypothesisTokens);
  return {
    ...counts,
    referenceWordCount: referenceTokens.length,
    wer: rate(counts, referenceTokens.length),
  };
}

export function calculateCharacterErrorRate(
  referenceTokens: readonly string[],
  hypothesisTokens: readonly string[],
): CharacterErrorRate {
  const counts = calculateEditCounts(referenceTokens, hypothesisTokens);
  return {
    ...counts,
    referenceCharacterCount: referenceTokens.length,
    cer: rate(counts, referenceTokens.length),
  };
}

export function calculateEditCounts(
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
  for (let row = 1; row <= reference.length; row += 1)
    rows[row]![0] = { substitutions: 0, deletions: row, insertions: 0 };
  for (let column = 1; column <= hypothesis.length; column += 1)
    rows[0]![column] = {
      substitutions: 0,
      deletions: 0,
      insertions: column,
    };
  for (let row = 1; row <= reference.length; row += 1) {
    for (let column = 1; column <= hypothesis.length; column += 1) {
      if (reference[row - 1] === hypothesis[column - 1]) {
        rows[row]![column] = rows[row - 1]![column - 1]!;
      } else {
        rows[row]![column] = bestEdit(
          increment(rows[row - 1]![column - 1]!, "substitutions"),
          increment(rows[row - 1]![column]!, "deletions"),
          increment(rows[row]![column - 1]!, "insertions"),
        );
      }
    }
  }
  return rows[reference.length]![hypothesis.length]!;
}

export function aggregateWordErrorRates(
  metrics: readonly WordErrorRate[],
): WordErrorRate {
  const counts = sumCounts(metrics);
  const referenceWordCount = metrics.reduce(
    (sum, metric) => sum + metric.referenceWordCount,
    0,
  );
  return {
    ...counts,
    referenceWordCount,
    wer: rate(counts, referenceWordCount),
  };
}

export function aggregateCharacterErrorRates(
  metrics: readonly CharacterErrorRate[],
): CharacterErrorRate {
  const counts = sumCounts(metrics);
  const referenceCharacterCount = metrics.reduce(
    (sum, metric) => sum + metric.referenceCharacterCount,
    0,
  );
  return {
    ...counts,
    referenceCharacterCount,
    cer: rate(counts, referenceCharacterCount),
  };
}

export function summarizeLatency(
  latencyMilliseconds: readonly number[],
): LatencySummary {
  if (latencyMilliseconds.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Latency values must be finite non-negative numbers.");
  if (latencyMilliseconds.length === 0)
    return {
      count: 0,
      meanMilliseconds: null,
      medianMilliseconds: null,
      p50Milliseconds: null,
      p95Milliseconds: null,
      minMilliseconds: null,
      maxMilliseconds: null,
    };
  const ordered = [...latencyMilliseconds].sort((left, right) => left - right);
  const mean = ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
  return {
    count: ordered.length,
    meanMilliseconds: mean,
    medianMilliseconds: percentile(ordered, 0.5),
    p50Milliseconds: percentile(ordered, 0.5),
    p95Milliseconds: percentile(ordered, 0.95),
    minMilliseconds: ordered[0]!,
    maxMilliseconds: ordered.at(-1)!,
  };
}

function tokenizeWords(value: string): readonly string[] {
  const trimmed = value.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/u);
}

function tokenizeCodePoints(value: string): readonly string[] {
  return Array.from(value);
}

function assertProfile(
  profile: YorubaNormalizationProfileDesign,
  analysisOnly: boolean,
): void {
  if (profile.analysisOnly !== analysisOnly)
    throw new Error("Unknown or misclassified normalization profile.");
}

function increment(counts: EditCounts, key: keyof EditCounts): EditCounts {
  return { ...counts, [key]: counts[key] + 1 };
}

function bestEdit(...candidates: readonly EditCounts[]): EditCounts {
  return candidates.reduce((best, candidate) =>
    total(candidate) < total(best) ? candidate : best,
  );
}

function sumCounts(metrics: readonly EditCounts[]): EditCounts {
  return metrics.reduce(
    (sum, metric) => ({
      substitutions: sum.substitutions + metric.substitutions,
      deletions: sum.deletions + metric.deletions,
      insertions: sum.insertions + metric.insertions,
    }),
    { substitutions: 0, deletions: 0, insertions: 0 },
  );
}

function rate(counts: EditCounts, denominator: number): number | null {
  return denominator === 0 ? null : total(counts) / denominator;
}

function total(counts: EditCounts): number {
  return counts.substitutions + counts.deletions + counts.insertions;
}

function percentile(ordered: readonly number[], fraction: number): number {
  const index = (ordered.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = ordered[lower]!;
  const upperValue = ordered[upper]!;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}
