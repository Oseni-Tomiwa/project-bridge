import { describe, expect, it } from "vitest";

import type { RunId, SampleId } from "@project-bridge/shared";
import type { SpeechProviderConfiguration } from "@project-bridge/speech";
import {
  type BenchmarkRunConfiguration,
  type ProviderEvaluationResult,
  defaultNormalizationProfile,
  providerConfigurationMatchesRun,
  rawWerPolicyVersion,
} from "../src/index.js";

const providerConfiguration: SpeechProviderConfiguration = {
  id: "provider-model-config-1",
  providerId: "provider-a",
  modelIdentifier: "model-a",
  modelVersion: "2026-01",
  region: "example-region",
  options: { languageHints: ["lang-a", "lang-b"], diarization: false },
};

const run: BenchmarkRunConfiguration = {
  runId: "run-1" as RunId,
  datasetId: "dataset-1",
  datasetVersion: "1",
  runnerVersion: "1",
  sourceRevision: "example-revision",
  normalization: defaultNormalizationProfile,
  rawWerPolicyVersion,
  providers: [providerConfiguration],
  concurrency: 1,
  maxRetries: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
};

function result(
  configuration: SpeechProviderConfiguration,
): ProviderEvaluationResult {
  return {
    runId: run.runId,
    sampleId: "sample-1" as SampleId,
    providerConfiguration: configuration,
    referenceTranscript: "example",
    hypothesisTranscript: { raw: "example", normalized: "example" },
    timing: {
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.100Z",
      latencyMilliseconds: 100,
      attemptCount: 1,
    },
    failure: null,
  };
}

describe("providerConfigurationMatchesRun", () => {
  it("accepts the frozen run configuration regardless of option key order", () => {
    expect(
      providerConfigurationMatchesRun(
        result({
          ...providerConfiguration,
          options: { diarization: false, languageHints: ["lang-a", "lang-b"] },
        }),
        run,
      ),
    ).toBe(true);
  });

  it("rejects a result from another model version", () => {
    expect(
      providerConfigurationMatchesRun(
        result({ ...providerConfiguration, modelVersion: "2026-02" }),
        run,
      ),
    ).toBe(false);
  });
});
