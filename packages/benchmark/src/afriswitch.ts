import type { SampleId } from "@project-bridge/shared";
import {
  normalizeYorubaTranscript,
  yorubaDiacriticInsensitiveAnalysisProfile,
  yorubaStrictNormalizationProfile,
} from "./yoruba.js";

export const AFRISWITCH_DATASET_ID = "intronhealth/AfriSwitch";
export const AFRISWITCH_YORUBA_CONFIG = "yoruba";
export const AFRISWITCH_TEST_SPLIT = "test";
export const AFRISWITCH_SOURCE_LICENSE = "CC-BY-NC-SA-4.0";
export const AFRISWITCH_YORUBA_MANIFEST_ID = "afriswitch-yoruba-challenge-v0.1";
export const AFRISWITCH_SELECTION_ALGORITHM =
  "quantile-stratified-seeded-round-robin-v1";

export interface AfriSwitchSourceRow {
  readonly rowIndex: number;
  readonly filename: string;
  readonly audioUrl: string;
  readonly transcription: string;
  readonly transcriptionTagged: string;
  readonly language: string;
  readonly durationSeconds: number;
  readonly cmi: number;
  readonly numSwitchPoints: number;
}

export interface AfriSwitchMappedSample {
  readonly id: SampleId;
  readonly source: Readonly<{
    datasetId: typeof AFRISWITCH_DATASET_ID;
    datasetConfig: typeof AFRISWITCH_YORUBA_CONFIG;
    split: typeof AFRISWITCH_TEST_SPLIT;
    revision: string;
    rowIndex: number;
    license: typeof AFRISWITCH_SOURCE_LICENSE;
  }>;
  readonly filename: string;
  readonly sourceAudioUrl: string;
  readonly primaryLanguage: string;
  readonly referenceTranscript: Readonly<{
    raw: string;
    tagged: string;
    strictNormalized: string;
    diacriticInsensitiveAnalysis: string;
  }>;
  readonly durationSeconds: number;
  readonly cmi: number;
  readonly numSwitchPoints: number;
  readonly downstream: null;
}

export interface AfriSwitchMaterializedSample
  extends Omit<AfriSwitchMappedSample, "sourceAudioUrl"> {
  readonly audio: Readonly<{
    assetId: string;
    relativePath: string;
    contentSha256: string;
    byteLength: number;
    mediaType: string;
    transformation: "none-original-source-bytes";
  }>;
}

export interface AfriSwitchSelectionConfiguration {
  readonly seed: string;
  readonly requestedSampleCount: number;
}

export interface AfriSwitchFrozenManifest {
  readonly id: typeof AFRISWITCH_YORUBA_MANIFEST_ID;
  readonly version: "0.1";
  readonly status: "frozen-no-results";
  readonly preparedAt: string;
  readonly source: Readonly<{
    datasetId: typeof AFRISWITCH_DATASET_ID;
    datasetConfig: typeof AFRISWITCH_YORUBA_CONFIG;
    split: typeof AFRISWITCH_TEST_SPLIT;
    revision: string;
    license: typeof AFRISWITCH_SOURCE_LICENSE;
  }>;
  readonly selection: Readonly<{
    algorithm: typeof AFRISWITCH_SELECTION_ALGORITHM;
    seed: string;
    requestedSampleCount: number;
    actualSampleCount: number;
    strata: readonly ["cmi", "switch-points", "duration"];
    providerPerformanceUsed: false;
  }>;
  readonly normalization: Readonly<{
    primaryProfileId: string;
    primaryProfileVersion: string;
    optionalAnalysisProfileId: string;
    optionalAnalysisProfileVersion: string;
    rawReferencePreserved: true;
  }>;
  readonly audioPolicy: Readonly<{
    preprocessing: "none";
    transcoding: "none";
    providerComparison: "same-materialized-bytes-required";
    compatibility: "verify-before-provider-run";
  }>;
  readonly metricScope: readonly ["wer", "cer", "latency"];
  readonly samples: readonly AfriSwitchMaterializedSample[];
}

export interface AfriSwitchValidationIssue {
  readonly sampleId: string;
  readonly code: string;
  readonly message: string;
}

export function projectBridgeAfriSwitchSampleId(rowIndex: number): SampleId {
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) {
    throw new Error("AfriSwitch rowIndex must be a non-negative integer.");
  }
  return `afriswitch-yo-test-${rowIndex.toString().padStart(6, "0")}` as SampleId;
}

export function mapAfriSwitchYorubaRow(
  row: AfriSwitchSourceRow,
  revision: string,
): AfriSwitchMappedSample {
  if (revision.trim() === "") {
    throw new Error("A resolved AfriSwitch dataset revision is required.");
  }
  const issues = validateAfriSwitchSourceRows([row]);
  if (issues.length > 0) {
    throw new Error(issues.map(({ message }) => message).join(" "));
  }

  return {
    id: projectBridgeAfriSwitchSampleId(row.rowIndex),
    source: {
      datasetId: AFRISWITCH_DATASET_ID,
      datasetConfig: AFRISWITCH_YORUBA_CONFIG,
      split: AFRISWITCH_TEST_SPLIT,
      revision,
      rowIndex: row.rowIndex,
      license: AFRISWITCH_SOURCE_LICENSE,
    },
    filename: row.filename,
    sourceAudioUrl: row.audioUrl,
    primaryLanguage: row.language,
    referenceTranscript: {
      raw: row.transcription,
      tagged: row.transcriptionTagged,
      strictNormalized: normalizeYorubaTranscript(
        row.transcription,
        yorubaStrictNormalizationProfile,
      ),
      diacriticInsensitiveAnalysis: normalizeYorubaTranscript(
        row.transcription,
        yorubaDiacriticInsensitiveAnalysisProfile,
      ),
    },
    durationSeconds: row.durationSeconds,
    cmi: row.cmi,
    numSwitchPoints: row.numSwitchPoints,
    downstream: null,
  };
}

export function validateAfriSwitchSourceRows(
  rows: readonly AfriSwitchSourceRow[],
): readonly AfriSwitchValidationIssue[] {
  const issues: AfriSwitchValidationIssue[] = [];
  const rowIndexes = new Set<number>();
  const sampleIds = new Set<string>();

  for (const row of rows) {
    const sampleId =
      Number.isSafeInteger(row.rowIndex) && row.rowIndex >= 0
        ? String(projectBridgeAfriSwitchSampleId(row.rowIndex))
        : "<invalid-row-index>";
    const add = (code: string, message: string): void => {
      issues.push({ sampleId, code, message });
    };

    if (!Number.isSafeInteger(row.rowIndex) || row.rowIndex < 0) {
      add("invalid-row-index", "Source row index must be non-negative.");
      continue;
    }
    if (rowIndexes.has(row.rowIndex)) {
      add("duplicate-source-row", "Source row index must be unique.");
    }
    rowIndexes.add(row.rowIndex);
    if (sampleIds.has(sampleId)) {
      add("duplicate-sample-id", "Project Bridge sample ID must be unique.");
    }
    sampleIds.add(sampleId);

    if (row.filename.trim() === "") {
      add("missing-filename", "filename is required.");
    }
    if (!isHttpUrl(row.audioUrl)) {
      add("invalid-audio-url", "A valid HTTP(S) source audio URL is required.");
    }
    if (row.transcription.trim() === "") {
      add("missing-transcription", "Official transcription is required.");
    }
    if (row.transcriptionTagged.trim() === "") {
      add("missing-tagged-transcription", "Tagged transcription is required.");
    }
    if (row.language.trim() === "") {
      add("missing-language", "Primary language is required.");
    }
    if (!Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0) {
      add("invalid-duration", "Duration must be a positive number.");
    }
    if (!Number.isFinite(row.cmi) || row.cmi < 0) {
      add("invalid-cmi", "CMI must be a non-negative number.");
    }
    if (!Number.isSafeInteger(row.numSwitchPoints) || row.numSwitchPoints < 0) {
      add(
        "invalid-switch-points",
        "Switch-point count must be a non-negative integer.",
      );
    }
  }

  return issues;
}

export function selectAfriSwitchSubset(
  rows: readonly AfriSwitchSourceRow[],
  configuration: AfriSwitchSelectionConfiguration,
): readonly AfriSwitchSourceRow[] {
  const issues = validateAfriSwitchSourceRows(rows);
  if (issues.length > 0) {
    throw new Error(issues.map(({ message }) => message).join(" "));
  }
  if (configuration.seed.trim() === "") {
    throw new Error("A non-empty deterministic selection seed is required.");
  }
  if (
    !Number.isSafeInteger(configuration.requestedSampleCount) ||
    configuration.requestedSampleCount <= 0 ||
    configuration.requestedSampleCount > rows.length
  ) {
    throw new Error(
      "requestedSampleCount must be a positive integer no larger than the source rows.",
    );
  }

  const cmiMedian = quantile(
    rows.map(({ cmi }) => cmi),
    0.5,
  );
  const switchThresholds = tercileThresholds(
    rows.map(({ numSwitchPoints }) => numSwitchPoints),
  );
  const durationThresholds = tercileThresholds(
    rows.map(({ durationSeconds }) => durationSeconds),
  );
  const groups = new Map<string, AfriSwitchSourceRow[]>();

  for (const row of rows) {
    const key = [
      row.cmi <= cmiMedian ? "lower-cmi" : "higher-cmi",
      numericBand(row.numSwitchPoints, switchThresholds),
      numericBand(row.durationSeconds, durationThresholds),
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const orderedGroups = [...groups.entries()]
    .map(([key, group]) => ({
      key,
      rows: [...group].sort((left, right) =>
        compareRankedRows(left, right, configuration.seed),
      ),
    }))
    .sort((left, right) =>
      deterministicRank(`${configuration.seed}\u0000${left.key}`).localeCompare(
        deterministicRank(`${configuration.seed}\u0000${right.key}`),
      ),
    );

  const selected: AfriSwitchSourceRow[] = [];
  let depth = 0;
  while (selected.length < configuration.requestedSampleCount) {
    let addedAtDepth = false;
    for (const group of orderedGroups) {
      const candidate = group.rows[depth];
      if (candidate === undefined) continue;
      selected.push(candidate);
      addedAtDepth = true;
      if (selected.length === configuration.requestedSampleCount) break;
    }
    if (!addedAtDepth) break;
    depth += 1;
  }

  return selected;
}

export function associateAfriSwitchAudio(
  sample: AfriSwitchMappedSample,
  audio: Readonly<{
    relativePath: string;
    contentSha256: string;
    byteLength: number;
    mediaType: string;
  }>,
): AfriSwitchMaterializedSample {
  validateMaterializedAudio(audio);
  return {
    id: sample.id,
    source: sample.source,
    filename: sample.filename,
    primaryLanguage: sample.primaryLanguage,
    referenceTranscript: sample.referenceTranscript,
    durationSeconds: sample.durationSeconds,
    cmi: sample.cmi,
    numSwitchPoints: sample.numSwitchPoints,
    downstream: sample.downstream,
    audio: {
      assetId: `${sample.id}-audio`,
      ...audio,
      transformation: "none-original-source-bytes",
    },
  };
}

export function createAfriSwitchFrozenManifest(
  input: Readonly<{
    revision: string;
    preparedAt: string;
    selection: AfriSwitchSelectionConfiguration;
    samples: readonly AfriSwitchMaterializedSample[];
  }>,
): AfriSwitchFrozenManifest {
  const manifest: AfriSwitchFrozenManifest = {
    id: AFRISWITCH_YORUBA_MANIFEST_ID,
    version: "0.1",
    status: "frozen-no-results",
    preparedAt: input.preparedAt,
    source: {
      datasetId: AFRISWITCH_DATASET_ID,
      datasetConfig: AFRISWITCH_YORUBA_CONFIG,
      split: AFRISWITCH_TEST_SPLIT,
      revision: input.revision,
      license: AFRISWITCH_SOURCE_LICENSE,
    },
    selection: {
      algorithm: AFRISWITCH_SELECTION_ALGORITHM,
      seed: input.selection.seed,
      requestedSampleCount: input.selection.requestedSampleCount,
      actualSampleCount: input.samples.length,
      strata: ["cmi", "switch-points", "duration"],
      providerPerformanceUsed: false,
    },
    normalization: {
      primaryProfileId: yorubaStrictNormalizationProfile.id,
      primaryProfileVersion: yorubaStrictNormalizationProfile.version,
      optionalAnalysisProfileId: yorubaDiacriticInsensitiveAnalysisProfile.id,
      optionalAnalysisProfileVersion:
        yorubaDiacriticInsensitiveAnalysisProfile.version,
      rawReferencePreserved: true,
    },
    audioPolicy: {
      preprocessing: "none",
      transcoding: "none",
      providerComparison: "same-materialized-bytes-required",
      compatibility: "verify-before-provider-run",
    },
    metricScope: ["wer", "cer", "latency"],
    samples: input.samples,
  };

  const issues = validateAfriSwitchManifest(manifest);
  if (issues.length > 0) {
    throw new Error(issues.join(" "));
  }
  return manifest;
}

export function validateAfriSwitchManifest(
  manifest: AfriSwitchFrozenManifest,
): readonly string[] {
  const issues: string[] = [];
  if (manifest.source.revision.trim() === "") {
    issues.push("A resolved source revision is required.");
  }
  if (manifest.selection.seed.trim() === "") {
    issues.push("A selection seed is required.");
  }
  if (
    manifest.selection.actualSampleCount !== manifest.samples.length ||
    manifest.selection.requestedSampleCount !== manifest.samples.length
  ) {
    issues.push("Requested, actual, and listed sample counts must match.");
  }
  const ids = new Set<string>();
  const sourceRows = new Set<number>();
  for (const sample of manifest.samples) {
    if (ids.has(sample.id)) issues.push(`Duplicate sample ID: ${sample.id}.`);
    ids.add(sample.id);
    if (sourceRows.has(sample.source.rowIndex)) {
      issues.push(`Duplicate source row: ${sample.source.rowIndex}.`);
    }
    sourceRows.add(sample.source.rowIndex);
    if (sample.source.revision !== manifest.source.revision) {
      issues.push(`Sample ${sample.id} has a mismatched source revision.`);
    }
    if (sample.downstream !== null) {
      issues.push(`Sample ${sample.id} must not contain downstream labels.`);
    }
    if (!/^[a-f0-9]{64}$/u.test(sample.audio.contentSha256)) {
      issues.push(`Sample ${sample.id} has an invalid SHA-256 checksum.`);
    }
    if (sample.audio.transformation !== "none-original-source-bytes") {
      issues.push(`Sample ${sample.id} uses an undeclared transformation.`);
    }
  }
  return issues;
}

function validateMaterializedAudio(
  audio: Readonly<{
    relativePath: string;
    contentSha256: string;
    byteLength: number;
    mediaType: string;
  }>,
): void {
  if (audio.relativePath.trim() === "" || audio.relativePath.startsWith("/")) {
    throw new Error(
      "Materialized audio path must be a non-empty relative path.",
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(audio.contentSha256)) {
    throw new Error(
      "Materialized audio requires a lowercase SHA-256 checksum.",
    );
  }
  if (!Number.isSafeInteger(audio.byteLength) || audio.byteLength <= 0) {
    throw new Error("Materialized audio byteLength must be positive.");
  }
  if (audio.mediaType.trim() === "") {
    throw new Error("Materialized audio mediaType is required.");
  }
}

function compareRankedRows(
  left: AfriSwitchSourceRow,
  right: AfriSwitchSourceRow,
  seed: string,
): number {
  const leftRank = deterministicRank(
    `${seed}\u0000${left.rowIndex}\u0000${left.filename}\u0000${left.transcription}`,
  );
  const rightRank = deterministicRank(
    `${seed}\u0000${right.rowIndex}\u0000${right.filename}\u0000${right.transcription}`,
  );
  return leftRank.localeCompare(rightRank) || left.rowIndex - right.rowIndex;
}

function deterministicRank(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function tercileThresholds(
  values: readonly number[],
): readonly [number, number] {
  return [quantile(values, 1 / 3), quantile(values, 2 / 3)];
}

function quantile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.floor((ordered.length - 1) * fraction);
  const value = ordered[index];
  if (value === undefined) throw new Error("Cannot stratify an empty dataset.");
  return value;
}

function numericBand(
  value: number,
  thresholds: readonly [number, number],
): "lower" | "middle" | "higher" {
  if (value <= thresholds[0]) return "lower";
  if (value <= thresholds[1]) return "middle";
  return "higher";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
