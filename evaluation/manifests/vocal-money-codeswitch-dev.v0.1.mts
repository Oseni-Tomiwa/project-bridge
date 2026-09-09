import {
  VOCAL_MONEY_DATASET_CONFIG,
  VOCAL_MONEY_DATASET_ID,
  VOCAL_MONEY_DATASET_SPLIT,
  VOCAL_MONEY_DEV_SAMPLE_COUNT,
  VOCAL_MONEY_DEV_SEED,
  VOCAL_MONEY_EXPECTED_SAMPLE_COUNT,
  VOCAL_MONEY_MANIFEST_ID,
  VOCAL_MONEY_SELECTION_ALGORITHM,
  VOCAL_MONEY_SOURCE_LICENSE,
} from "@project-bridge/benchmark";

/**
 * Committed preparation definition only. A preparation run must resolve and
 * freeze the public dataset revision, audio checksums, and selected samples.
 */
export const vocalMoneyCodeswitchDevPreparation = {
  id: VOCAL_MONEY_MANIFEST_ID,
  version: "0.1",
  status: "preparation-defined-no-results",
  role: "secondary-development-benchmark",
  primaryChallengeBenchmark: "afriswitch-yoruba-challenge-v0.1",
  source: {
    datasetId: VOCAL_MONEY_DATASET_ID,
    datasetConfig: VOCAL_MONEY_DATASET_CONFIG,
    split: VOCAL_MONEY_DATASET_SPLIT,
    revision: null,
    expectedRows: VOCAL_MONEY_EXPECTED_SAMPLE_COUNT,
    license: VOCAL_MONEY_SOURCE_LICENSE,
    derivativeOf: "intronhealth/AfriSwitch",
  },
  selection: {
    mode: "development-subset",
    algorithm: VOCAL_MONEY_SELECTION_ALGORITHM,
    sampleCount: VOCAL_MONEY_DEV_SAMPLE_COUNT,
    seed: VOCAL_MONEY_DEV_SEED,
    sourceCmiBandHandling: "preserve-verbatim",
    selectionCmiBuckets: ["low", "medium", "high"],
    selectionThresholds: "low:<10;medium:10-through-25;high:>25",
    targetPerSelectionBucket: 10,
    providerPerformanceUsed: false,
  },
  publishedHypotheses: {
    handling: "excluded-from-project-bridge-results",
    reason: "source-only-comparison-metadata",
  },
} as const;
