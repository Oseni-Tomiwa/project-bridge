import type { SampleId } from "@project-bridge/shared";
import {
  normalizeYorubaTranscript,
  yorubaDiacriticInsensitiveAnalysisProfile,
  yorubaStrictNormalizationProfile,
} from "./yoruba.js";

export const VOCAL_MONEY_DATASET_ID =
  "Kimyayd/vocal-money-codeswitch-asr-benchmark";
export const VOCAL_MONEY_DATASET_CONFIG = "default";
export const VOCAL_MONEY_DATASET_SPLIT = "train";
export const VOCAL_MONEY_SOURCE_LICENSE = "CC-BY-NC-SA-4.0";
export const VOCAL_MONEY_MANIFEST_ID = "vocal-money-codeswitch-dev-v0.1";
export const VOCAL_MONEY_EXPECTED_SAMPLE_COUNT = 210;
export const VOCAL_MONEY_DEV_SAMPLE_COUNT = 30;
export const VOCAL_MONEY_DEV_SEED = "project-bridge-vocal-money-dev-v1";
export const VOCAL_MONEY_SELECTION_ALGORITHM =
  "project-bridge-cmi-threshold-bucket-stratified-seeded-v1";

export type VocalMoneySelectionCmiBucket = "low" | "medium" | "high";

export interface VocalMoneySourceRow {
  readonly rowIndex: number;
  readonly audioUrl: string;
  readonly audioMediaType: "audio/wav";
  readonly clipId: string;
  readonly sourceDataset: string;
  readonly sourceFile: string;
  readonly languagePair: string;
  readonly matrixLanguage: string;
  readonly domain: string;
  readonly countryAccent: string;
  readonly deviceType: string;
  readonly noiseConditions: string;
  readonly durationSeconds: number;
  readonly samplingRateHz: number;
  readonly codeMixingIndex: number;
  /** Exact source-published label; never recomputed or relabeled. */
  readonly sourceCmiBand: string;
  /** Project Bridge's independent numeric-CMI bucket for sampling only. */
  readonly selectionCmiBucket: VocalMoneySelectionCmiBucket;
  readonly numSwitchPoints: number;
  readonly transcription: string;
  readonly transcriptionTagged: string;
}

export interface VocalMoneyMappedSample {
  readonly id: SampleId;
  readonly source: Readonly<{
    datasetId: typeof VOCAL_MONEY_DATASET_ID;
    datasetConfig: typeof VOCAL_MONEY_DATASET_CONFIG;
    split: typeof VOCAL_MONEY_DATASET_SPLIT;
    revision: string;
    rowIndex: number;
    clipId: string;
    sourceDataset: string;
    sourceFile: string;
    license: typeof VOCAL_MONEY_SOURCE_LICENSE;
  }>;
  readonly sourceAudioUrl: string;
  readonly sourceAudioMediaType: "audio/wav";
  readonly languagePair: string;
  readonly matrixLanguage: string;
  readonly domain: string;
  readonly countryAccent: string;
  readonly deviceType: string;
  readonly noiseConditions: string;
  readonly referenceTranscript: Readonly<{
    raw: string;
    tagged: string;
    strictNormalized: string;
    diacriticInsensitiveAnalysis: string;
  }>;
  readonly durationSeconds: number;
  readonly samplingRateHz: number;
  readonly codeMixingIndex: number;
  readonly sourceCmiBand: string;
  readonly selectionCmiBucket: VocalMoneySelectionCmiBucket;
  readonly numSwitchPoints: number;
  readonly downstream: null;
}

export interface VocalMoneyMaterializedSample
  extends Omit<
    VocalMoneyMappedSample,
    "sourceAudioUrl" | "sourceAudioMediaType"
  > {
  readonly audio: Readonly<{
    assetId: string;
    relativePath: string;
    contentSha256: string;
    byteLength: number;
    mediaType: "audio/wav";
    transformation: "none-original-published-bytes";
  }>;
}

export type VocalMoneySelectionConfiguration =
  | Readonly<{
      mode: "development-subset";
      seed: string;
      requestedSampleCount: number;
    }>
  | Readonly<{
      mode: "full-dataset";
      requestedSampleCount: number;
    }>;

export interface VocalMoneyFrozenManifest {
  readonly id: typeof VOCAL_MONEY_MANIFEST_ID;
  readonly version: "0.1";
  readonly status: "frozen-no-results";
  readonly purpose: "secondary-development-benchmark";
  readonly preparedAt: string;
  readonly source: Readonly<{
    datasetId: typeof VOCAL_MONEY_DATASET_ID;
    datasetConfig: typeof VOCAL_MONEY_DATASET_CONFIG;
    split: typeof VOCAL_MONEY_DATASET_SPLIT;
    revision: string;
    license: typeof VOCAL_MONEY_SOURCE_LICENSE;
    derivativeOf: "intronhealth/AfriSwitch";
  }>;
  readonly selection: Readonly<{
    mode: VocalMoneySelectionConfiguration["mode"];
    algorithm: typeof VOCAL_MONEY_SELECTION_ALGORITHM;
    seed: string | null;
    requestedSampleCount: number;
    actualSampleCount: number;
    strata: readonly ["low", "medium", "high"];
    sourceCmiBandCounts: Readonly<Record<string, number>>;
    selectionCmiBucketCounts: Readonly<
      Record<VocalMoneySelectionCmiBucket, number>
    >;
    providerPerformanceUsed: false;
    publishedHypothesesUsed: false;
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
    expectedFormat: "16-khz-mono-pcm16-wav";
    providerComparison: "same-materialized-bytes-required";
  }>;
  readonly metricScope: readonly ["wer", "cer", "latency"];
  readonly governance: Readonly<{
    license: typeof VOCAL_MONEY_SOURCE_LICENSE;
    thirdPartyProcessing: "product-team-review-required";
    retention: "local-gitignored-assets";
  }>;
  readonly samples: readonly VocalMoneyMaterializedSample[];
}

export interface VocalMoneyValidationIssue {
  readonly sampleId: string;
  readonly code: string;
  readonly message: string;
}

export function projectBridgeVocalMoneySampleId(clipId: string): SampleId {
  const normalized = clipId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-");
  if (normalized === "") throw new Error("Vocal Money clip_id is required.");
  return `vocal-money-${normalized}` as SampleId;
}

export function mapVocalMoneyRow(
  row: VocalMoneySourceRow,
  revision: string,
): VocalMoneyMappedSample {
  if (revision.trim() === "")
    throw new Error("A resolved dataset revision is required.");
  const issues = validateVocalMoneySourceRows([row]);
  if (issues.length > 0)
    throw new Error(issues.map(({ message }) => message).join(" "));
  return {
    id: projectBridgeVocalMoneySampleId(row.clipId),
    source: {
      datasetId: VOCAL_MONEY_DATASET_ID,
      datasetConfig: VOCAL_MONEY_DATASET_CONFIG,
      split: VOCAL_MONEY_DATASET_SPLIT,
      revision,
      rowIndex: row.rowIndex,
      clipId: row.clipId,
      sourceDataset: row.sourceDataset,
      sourceFile: row.sourceFile,
      license: VOCAL_MONEY_SOURCE_LICENSE,
    },
    sourceAudioUrl: row.audioUrl,
    sourceAudioMediaType: row.audioMediaType,
    languagePair: row.languagePair,
    matrixLanguage: row.matrixLanguage,
    domain: row.domain,
    countryAccent: row.countryAccent,
    deviceType: row.deviceType,
    noiseConditions: row.noiseConditions,
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
    samplingRateHz: row.samplingRateHz,
    codeMixingIndex: row.codeMixingIndex,
    sourceCmiBand: row.sourceCmiBand,
    selectionCmiBucket: row.selectionCmiBucket,
    numSwitchPoints: row.numSwitchPoints,
    downstream: null,
  };
}

export function validateVocalMoneySourceRows(
  rows: readonly VocalMoneySourceRow[],
): readonly VocalMoneyValidationIssue[] {
  const issues: VocalMoneyValidationIssue[] = [];
  const indexes = new Set<number>();
  const clips = new Set<string>();
  const ids = new Set<string>();
  for (const row of rows) {
    const sampleId =
      row.clipId.trim() === ""
        ? "<missing-clip-id>"
        : String(projectBridgeVocalMoneySampleId(row.clipId));
    const add = (code: string, message: string): void => {
      issues.push({ sampleId, code, message });
    };
    if (!Number.isSafeInteger(row.rowIndex) || row.rowIndex < 0)
      add("invalid-row-index", "Source row index must be non-negative.");
    else if (indexes.has(row.rowIndex))
      add("duplicate-source-row", "Source row index must be unique.");
    indexes.add(row.rowIndex);
    if (row.clipId.trim() === "")
      add("missing-clip-id", "clip_id is required.");
    else if (clips.has(row.clipId))
      add("duplicate-clip-id", "clip_id must be unique.");
    clips.add(row.clipId);
    if (ids.has(sampleId))
      add("duplicate-sample-id", "Project Bridge sample ID must be unique.");
    ids.add(sampleId);
    if (!isHttpUrl(row.audioUrl))
      add("invalid-audio-url", "A valid HTTP(S) audio URL is required.");
    if (row.audioMediaType !== "audio/wav")
      add(
        "invalid-audio-media-type",
        "Published audio media type must be audio/wav.",
      );
    for (const [field, value] of [
      ["source_dataset", row.sourceDataset],
      ["source_file", row.sourceFile],
      ["language_pair", row.languagePair],
      ["matrix_language", row.matrixLanguage],
      ["domain", row.domain],
      ["country_accent", row.countryAccent],
      ["device_type", row.deviceType],
      ["noise_conditions", row.noiseConditions],
      ["transcription", row.transcription],
      ["transcription_tagged", row.transcriptionTagged],
    ] as const)
      if (value.trim() === "") add(`missing-${field}`, `${field} is required.`);
    if (!Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0)
      add("invalid-duration", "duration_s must be positive.");
    if (row.samplingRateHz !== 16_000)
      add("invalid-sampling-rate", "sampling_rate must be 16000 Hz.");
    if (
      !Number.isFinite(row.codeMixingIndex) ||
      row.codeMixingIndex < 0 ||
      row.codeMixingIndex > 100
    )
      add("invalid-cmi", "code_mixing_index must be between 0 and 100.");
    if (row.sourceCmiBand.trim() === "")
      add("missing-source-cmi-band", "Published cmi_band is required.");
    if (
      Number.isFinite(row.codeMixingIndex) &&
      row.codeMixingIndex >= 0 &&
      row.codeMixingIndex <= 100 &&
      row.selectionCmiBucket !==
        projectBridgeVocalMoneySelectionCmiBucket(row.codeMixingIndex)
    )
      add(
        "selection-cmi-bucket-mismatch",
        "Selection CMI bucket must match the Project Bridge numeric-CMI policy.",
      );
    if (!Number.isSafeInteger(row.numSwitchPoints) || row.numSwitchPoints < 0)
      add("invalid-switch-points", "num_switch_points must be non-negative.");
  }
  return issues;
}

export function selectVocalMoneyRows(
  rows: readonly VocalMoneySourceRow[],
  configuration: VocalMoneySelectionConfiguration,
): readonly VocalMoneySourceRow[] {
  const issues = validateVocalMoneySourceRows(rows);
  if (issues.length > 0)
    throw new Error(issues.map(({ message }) => message).join(" "));
  if (
    !Number.isSafeInteger(configuration.requestedSampleCount) ||
    configuration.requestedSampleCount <= 0 ||
    configuration.requestedSampleCount > rows.length
  ) {
    throw new Error(
      "requestedSampleCount must be positive and no larger than the source rows.",
    );
  }
  if (configuration.mode === "full-dataset") {
    if (configuration.requestedSampleCount !== rows.length)
      throw new Error("Full-dataset selection must include every source row.");
    return [...rows].sort((left, right) => left.rowIndex - right.rowIndex);
  }
  if (configuration.seed.trim() === "")
    throw new Error("A non-empty deterministic seed is required.");
  const groups = (["low", "medium", "high"] as const).map((bucket) =>
    rows
      .filter((row) => row.selectionCmiBucket === bucket)
      .sort((left, right) =>
        compareRankedRows(left, right, configuration.seed),
      ),
  );
  const selected: VocalMoneySourceRow[] = [];
  for (
    let depth = 0;
    selected.length < configuration.requestedSampleCount;
    depth += 1
  ) {
    let added = false;
    for (const group of groups) {
      const row = group[depth];
      if (row === undefined) continue;
      selected.push(row);
      added = true;
      if (selected.length === configuration.requestedSampleCount) break;
    }
    if (!added) break;
  }
  return selected;
}

export function associateVocalMoneyAudio(
  sample: VocalMoneyMappedSample,
  audio: Readonly<{
    relativePath: string;
    contentSha256: string;
    byteLength: number;
  }>,
): VocalMoneyMaterializedSample {
  if (audio.relativePath.trim() === "" || audio.relativePath.startsWith("/"))
    throw new Error("Audio path must be relative.");
  if (!/^[a-f0-9]{64}$/u.test(audio.contentSha256))
    throw new Error("Audio requires a lowercase SHA-256 checksum.");
  if (!Number.isSafeInteger(audio.byteLength) || audio.byteLength <= 0)
    throw new Error("Audio byteLength must be positive.");
  return {
    id: sample.id,
    source: sample.source,
    languagePair: sample.languagePair,
    matrixLanguage: sample.matrixLanguage,
    domain: sample.domain,
    countryAccent: sample.countryAccent,
    deviceType: sample.deviceType,
    noiseConditions: sample.noiseConditions,
    referenceTranscript: sample.referenceTranscript,
    durationSeconds: sample.durationSeconds,
    samplingRateHz: sample.samplingRateHz,
    codeMixingIndex: sample.codeMixingIndex,
    sourceCmiBand: sample.sourceCmiBand,
    selectionCmiBucket: sample.selectionCmiBucket,
    numSwitchPoints: sample.numSwitchPoints,
    downstream: sample.downstream,
    audio: {
      assetId: `${sample.id}-audio`,
      relativePath: audio.relativePath,
      contentSha256: audio.contentSha256,
      byteLength: audio.byteLength,
      mediaType: sample.sourceAudioMediaType,
      transformation: "none-original-published-bytes",
    },
  };
}

export function createVocalMoneyFrozenManifest(
  input: Readonly<{
    revision: string;
    preparedAt: string;
    selection: VocalMoneySelectionConfiguration;
    samples: readonly VocalMoneyMaterializedSample[];
  }>,
): VocalMoneyFrozenManifest {
  const sourceCmiBandCounts = countSourceCmiBands(input.samples);
  const selectionCmiBucketCounts = countSelectionCmiBuckets(input.samples);
  const manifest: VocalMoneyFrozenManifest = {
    id: VOCAL_MONEY_MANIFEST_ID,
    version: "0.1",
    status: "frozen-no-results",
    purpose: "secondary-development-benchmark",
    preparedAt: input.preparedAt,
    source: {
      datasetId: VOCAL_MONEY_DATASET_ID,
      datasetConfig: VOCAL_MONEY_DATASET_CONFIG,
      split: VOCAL_MONEY_DATASET_SPLIT,
      revision: input.revision,
      license: VOCAL_MONEY_SOURCE_LICENSE,
      derivativeOf: "intronhealth/AfriSwitch",
    },
    selection: {
      mode: input.selection.mode,
      algorithm: VOCAL_MONEY_SELECTION_ALGORITHM,
      seed:
        input.selection.mode === "development-subset"
          ? input.selection.seed
          : null,
      requestedSampleCount: input.selection.requestedSampleCount,
      actualSampleCount: input.samples.length,
      strata: ["low", "medium", "high"],
      sourceCmiBandCounts,
      selectionCmiBucketCounts,
      providerPerformanceUsed: false,
      publishedHypothesesUsed: false,
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
      expectedFormat: "16-khz-mono-pcm16-wav",
      providerComparison: "same-materialized-bytes-required",
    },
    metricScope: ["wer", "cer", "latency"],
    governance: {
      license: VOCAL_MONEY_SOURCE_LICENSE,
      thirdPartyProcessing: "product-team-review-required",
      retention: "local-gitignored-assets",
    },
    samples: input.samples,
  };
  const validation = validateVocalMoneyManifest(manifest);
  if (validation.length > 0) throw new Error(validation.join(" "));
  return manifest;
}

export function validateVocalMoneyManifest(
  manifest: VocalMoneyFrozenManifest,
): readonly string[] {
  const issues: string[] = [];
  if (manifest.source.revision.trim() === "")
    issues.push("A resolved source revision is required.");
  if (
    manifest.selection.requestedSampleCount !== manifest.samples.length ||
    manifest.selection.actualSampleCount !== manifest.samples.length
  )
    issues.push("Requested, actual, and listed sample counts must match.");
  const ids = new Set<string>();
  for (const sample of manifest.samples) {
    if (ids.has(sample.id)) issues.push(`Duplicate sample ID: ${sample.id}.`);
    ids.add(sample.id);
    if (sample.source.revision !== manifest.source.revision)
      issues.push(`Sample ${sample.id} has a mismatched source revision.`);
    if (sample.downstream !== null)
      issues.push(`Sample ${sample.id} must not contain downstream labels.`);
    if (!/^[a-f0-9]{64}$/u.test(sample.audio.contentSha256))
      issues.push(`Sample ${sample.id} has an invalid SHA-256 checksum.`);
    if (sample.audio.transformation !== "none-original-published-bytes")
      issues.push(`Sample ${sample.id} uses an undeclared transformation.`);
    if (
      "hypothesisTranscript" in sample ||
      Object.keys(sample).some((key) => key.startsWith("hyp_"))
    )
      issues.push(
        `Sample ${sample.id} contains a published provider hypothesis.`,
      );
  }
  const actualSourceCounts = countSourceCmiBands(manifest.samples);
  if (
    JSON.stringify(actualSourceCounts) !==
    JSON.stringify(manifest.selection.sourceCmiBandCounts)
  )
    issues.push("Published source CMI band counts do not match the samples.");
  const actualSelectionCounts = countSelectionCmiBuckets(manifest.samples);
  for (const bucket of ["low", "medium", "high"] as const)
    if (
      actualSelectionCounts[bucket] !==
      manifest.selection.selectionCmiBucketCounts[bucket]
    )
      issues.push(`Selection CMI bucket count mismatch for ${bucket}.`);
  return issues;
}

function countSourceCmiBands(
  samples: readonly Pick<VocalMoneyMaterializedSample, "sourceCmiBand">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sample of samples)
    counts[sample.sourceCmiBand] = (counts[sample.sourceCmiBand] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function countSelectionCmiBuckets(
  samples: readonly Pick<VocalMoneyMaterializedSample, "selectionCmiBucket">[],
): Record<VocalMoneySelectionCmiBucket, number> {
  const counts = { low: 0, medium: 0, high: 0 };
  for (const sample of samples) counts[sample.selectionCmiBucket] += 1;
  return counts;
}

export function projectBridgeVocalMoneySelectionCmiBucket(
  cmi: number,
): VocalMoneySelectionCmiBucket {
  if (!Number.isFinite(cmi) || cmi < 0 || cmi > 100)
    throw new Error("CMI must be between 0 and 100 for selection bucketing.");
  if (cmi < 10) return "low";
  if (cmi <= 25) return "medium";
  return "high";
}

function compareRankedRows(
  left: VocalMoneySourceRow,
  right: VocalMoneySourceRow,
  seed: string,
): number {
  return (
    deterministicRank(
      `${seed}\u0000${left.clipId}\u0000${left.sourceFile}`,
    ).localeCompare(
      deterministicRank(
        `${seed}\u0000${right.clipId}\u0000${right.sourceFile}`,
      ),
    ) || left.rowIndex - right.rowIndex
  );
}

function deterministicRank(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
