import {
  AFRISWITCH_DATASET_ID,
  AFRISWITCH_SELECTION_ALGORITHM,
  AFRISWITCH_SOURCE_LICENSE,
  AFRISWITCH_TEST_SPLIT,
  AFRISWITCH_YORUBA_CONFIG,
  AFRISWITCH_YORUBA_MANIFEST_ID,
  yorubaDiacriticInsensitiveAnalysisProfile,
  yorubaStrictNormalizationProfile,
} from "@project-bridge/benchmark";

/**
 * Versioned preparation definition. The opt-in materializer resolves the
 * source revision and writes a frozen, checksummed manifest under ignored
 * local data. The v0.1 sample count and deterministic seed are frozen here.
 */
export const afriSwitchYorubaChallengePreparation = {
  id: AFRISWITCH_YORUBA_MANIFEST_ID,
  version: "0.1",
  status: "selection-config-frozen-awaiting-materialization",
  source: {
    datasetId: AFRISWITCH_DATASET_ID,
    datasetConfig: AFRISWITCH_YORUBA_CONFIG,
    split: AFRISWITCH_TEST_SPLIT,
    revision: null,
    license: AFRISWITCH_SOURCE_LICENSE,
  },
  selection: {
    algorithm: AFRISWITCH_SELECTION_ALGORITHM,
    seed: "project-bridge-challenge-v1",
    requestedSampleCount: 75,
    actualSampleCount: 0,
    plannedRange: { minimum: 50, maximum: 100 },
    providerPerformanceUsed: false,
  },
  normalization: {
    primary: yorubaStrictNormalizationProfile,
    optionalAnalysis: yorubaDiacriticInsensitiveAnalysisProfile,
    rawReferencePreserved: true,
  },
  audioPolicy: {
    preprocessing: "none",
    transcoding: "none",
    providerComparison: "same-materialized-bytes-required",
  },
  metricScope: ["wer", "cer", "latency"],
  downstreamLabels: "not-provided",
  benchmarkResults: [],
} as const;
