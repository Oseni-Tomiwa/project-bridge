import type { SampleId } from "@project-bridge/shared";

export const AUDIO_QUALITY_REVIEW_SCHEMA_VERSION = "0.1";

export type AudioQualityState = "usable" | "unusable" | "uncertain";

export type AudioQualityReason =
  | "silent"
  | "near-silent"
  | "corrupted-audio"
  | "truncated-audio"
  | "reference-audio-mismatch"
  | "unintelligible"
  | "excessive-clipping"
  | "duration-metadata-mismatch"
  | "other";

export type AudioQualityReviewStatus = "pending-manual" | "completed-manual";

export interface AudioQualityReviewEntry {
  readonly sampleId: SampleId;
  readonly audioContentSha256: string;
  readonly state: AudioQualityState;
  readonly reasons: readonly AudioQualityReason[];
  readonly reviewStatus: AudioQualityReviewStatus;
  readonly note?: string;
  readonly reviewedAt?: string;
  readonly reviewerId?: string;
}

export interface AudioQualityReviewManifest {
  readonly schemaVersion: typeof AUDIO_QUALITY_REVIEW_SCHEMA_VERSION;
  readonly id: string;
  readonly datasetManifest: Readonly<{
    id: string;
    version: string;
    sourceRevision: string;
  }>;
  readonly scoringPolicy: Readonly<{
    usable: "include";
    unusable: "exclude";
    uncertain: "hold-for-review";
    preserveProviderResults: true;
  }>;
  readonly reviews: readonly AudioQualityReviewEntry[];
}

export type AudioQualityScoringDisposition =
  | "include"
  | "exclude"
  | "hold-for-review";

export function audioQualityScoringDisposition(
  state: AudioQualityState,
): AudioQualityScoringDisposition {
  switch (state) {
    case "usable":
      return "include";
    case "unusable":
      return "exclude";
    case "uncertain":
      return "hold-for-review";
  }
}

export function validateAudioQualityReviewManifest(
  value: unknown,
): readonly string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["Quality review manifest must be an object."];
  if (value.schemaVersion !== AUDIO_QUALITY_REVIEW_SCHEMA_VERSION)
    issues.push("Unsupported quality review schemaVersion.");
  if (!isNonEmptyString(value.id))
    issues.push("Review manifest id is required.");
  if (!isRecord(value.datasetManifest)) {
    issues.push("datasetManifest is required.");
  } else {
    for (const field of ["id", "version", "sourceRevision"] as const)
      if (!isNonEmptyString(value.datasetManifest[field]))
        issues.push(`datasetManifest.${field} is required.`);
  }
  if (!isRecord(value.scoringPolicy)) {
    issues.push("scoringPolicy is required.");
  } else if (
    value.scoringPolicy.usable !== "include" ||
    value.scoringPolicy.unusable !== "exclude" ||
    value.scoringPolicy.uncertain !== "hold-for-review" ||
    value.scoringPolicy.preserveProviderResults !== true
  ) {
    issues.push("scoringPolicy must use the Project Bridge v0.1 dispositions.");
  }
  if (!Array.isArray(value.reviews)) {
    issues.push("reviews must be an array.");
    return issues;
  }
  const sampleIds = new Set<string>();
  for (const [index, review] of value.reviews.entries()) {
    const prefix = `reviews[${index}]`;
    if (!isRecord(review)) {
      issues.push(`${prefix} must be an object.`);
      continue;
    }
    if (!isNonEmptyString(review.sampleId))
      issues.push(`${prefix}.sampleId is required.`);
    else if (sampleIds.has(review.sampleId))
      issues.push(`Duplicate quality review sample ID: ${review.sampleId}.`);
    else sampleIds.add(review.sampleId);
    if (
      typeof review.audioContentSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(review.audioContentSha256)
    )
      issues.push(`${prefix}.audioContentSha256 must be a SHA-256 digest.`);
    if (!isAudioQualityState(review.state))
      issues.push(`${prefix}.state is invalid.`);
    if (
      !Array.isArray(review.reasons) ||
      review.reasons.length === 0 ||
      review.reasons.some((reason) => !isAudioQualityReason(reason))
    )
      issues.push(`${prefix}.reasons must contain recognized reasons.`);
    if (
      review.reviewStatus !== "pending-manual" &&
      review.reviewStatus !== "completed-manual"
    )
      issues.push(`${prefix}.reviewStatus is invalid.`);
    if (
      review.reviewStatus === "pending-manual" &&
      review.state !== "uncertain"
    )
      issues.push(`${prefix} pending manual review must remain uncertain.`);
    if (
      review.reviewStatus === "completed-manual" &&
      (!isNonEmptyString(review.reviewedAt) ||
        !isNonEmptyString(review.reviewerId))
    )
      issues.push(
        `${prefix} completed manual review requires reviewedAt and reviewerId.`,
      );
  }
  return issues;
}

function isAudioQualityState(value: unknown): value is AudioQualityState {
  return value === "usable" || value === "unusable" || value === "uncertain";
}

function isAudioQualityReason(value: unknown): value is AudioQualityReason {
  return (
    value === "silent" ||
    value === "near-silent" ||
    value === "corrupted-audio" ||
    value === "truncated-audio" ||
    value === "reference-audio-mismatch" ||
    value === "unintelligible" ||
    value === "excessive-clipping" ||
    value === "duration-metadata-mismatch" ||
    value === "other"
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
