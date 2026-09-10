import { describe, expect, it } from "vitest";

import { aggregateSttMetrics } from "../scripts/stt-metric-aggregation.mjs";
import { parseArguments } from "../scripts/run-stt-metrics.mjs";

const manifestIdentity = {
  id: "vocal-money-codeswitch-dev-v0.1",
  version: "0.1",
  sourceRevision: "revision-1",
  contentSha256: "a".repeat(64),
};
const normalization = {
  profileId: "yoruba-strict",
  profileVersion: "0.1",
  rawScoringPolicyVersion: "whitespace-tokenization-v1",
};
const providers = ["provider-b", "provider-a"].map((providerId) => ({
  id: `${providerId}-configuration`,
  providerId,
  modelIdentifier: `${providerId}-model`,
  options: {},
}));
const samples = [
  sample("sample-1", "low", "low", "báwo ni"),
  sample("sample-2", "medium", "low", "ó fẹ́ owó"),
  sample("sample-3", "high", "high", "send money"),
  sample("sample-4", "low", "low", "hello world"),
];
const manifest = {
  id: manifestIdentity.id,
  version: manifestIdentity.version,
  source: { revision: manifestIdentity.sourceRevision },
  normalization: {
    primaryProfileId: "yoruba-strict",
    primaryProfileVersion: "0.1",
    optionalAnalysisProfileId: "yoruba-diacritic-insensitive-analysis",
    optionalAnalysisProfileVersion: "0.1",
  },
  samples,
};
const runMetadata = {
  schemaVersion: "0.1",
  runnerVersion: "stt-batch-runner-v0.1",
  runId: "run-1",
  manifest: manifestIdentity,
  normalization,
  providerConfigurations: providers,
};
const reviews = [
  review("sample-2", "uncertain", ["unintelligible"]),
  review("sample-3", "unusable", ["corrupted-audio"]),
  review("sample-4", "usable", []),
];
const reviewManifest = {
  schemaVersion: "0.1",
  id: "review-1",
  datasetManifest: {
    id: manifest.id,
    version: manifest.version,
    sourceRevision: manifest.source.revision,
  },
  scoringPolicy: {
    usable: "include",
    unusable: "exclude",
    uncertain: "hold-for-review",
    preserveProviderResults: true,
  },
  reviews,
};
const records = providers.flatMap((provider, providerIndex) =>
  samples.map((item, sampleIndex) => ({
    schemaVersion: "0.1",
    executionId: `${provider.providerId}-${item.id}`,
    runId: runMetadata.runId,
    manifest: manifestIdentity,
    normalization,
    providerConfiguration: provider,
    sample: {
      id: item.id,
      audioContentSha256: item.audio.contentSha256,
      referenceTranscript: item.referenceTranscript.raw,
    },
    execution: {
      latencyMilliseconds: 10 + providerIndex * 10 + sampleIndex * 10,
    },
    outcome: {
      status: "success",
      hypothesisTranscript:
        provider.providerId === "provider-a"
          ? item.referenceTranscript.raw
          : `${item.referenceTranscript.raw} extra`,
    },
  })),
);
const qualityBySample = new Map([
  ["sample-1", "pass"],
  ["sample-2", "reviewed"],
  ["sample-3", "reviewed"],
  ["sample-4", "reviewed"],
]);

function sample(id, selectionCmiBucket, sourceCmiBand, reference) {
  return {
    id,
    selectionCmiBucket,
    sourceCmiBand,
    audio: { contentSha256: id.slice(-1).repeat(64) },
    referenceTranscript: { raw: reference },
  };
}

function review(sampleId, state, reasons) {
  const item = samples.find(({ id }) => id === sampleId);
  return {
    sampleId,
    audioContentSha256: item.audio.contentSha256,
    state,
    reasons,
    reviewStatus: "completed-manual",
    reviewMethod: "human-listening",
    reviewedAt: "2026-09-10",
  };
}

function aggregate(overrides = {}) {
  return aggregateSttMetrics({
    runMetadata,
    manifest,
    reviewManifest,
    records,
    qualityBySample,
    hashes: {
      runJsonSha256: "1".repeat(64),
      resultsJsonlSha256: "2".repeat(64),
      qualityReviewManifestSha256: "3".repeat(64),
      materializedManifestSha256: manifestIdentity.contentSha256,
    },
    generatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  });
}

describe("STT metric aggregation", () => {
  it("aggregates providers, buckets, latency, and quality sets", () => {
    const result = aggregate();
    expect(result.resultCounts).toMatchObject({
      total: 8,
      successful: 8,
      failed: 0,
      byProvider: [
        { providerId: "provider-a", total: 4, successful: 4, failed: 0 },
        { providerId: "provider-b", total: 4, successful: 4, failed: 0 },
      ],
    });
    expect(result.perSample.map(({ providerId }) => providerId)).toEqual([
      "provider-a",
      "provider-b",
      "provider-a",
      "provider-b",
      "provider-a",
      "provider-b",
      "provider-a",
      "provider-b",
    ]);
    const scored = result.scoringSets.find(
      ({ id }) => id === "scored-development",
    );
    expect(scored).toMatchObject({
      sampleCount: 2,
      heldSampleCount: 1,
      excludedSampleCount: 1,
    });
    expect(scored.providers.map(({ providerId }) => providerId)).toEqual([
      "provider-a",
      "provider-b",
    ]);
    expect(scored.providers[0]).toMatchObject({
      sampleCount: 2,
      metrics: { strictNormalized: { wer: { wer: 0 }, cer: { cer: 0 } } },
      latency: {
        count: 2,
        meanMilliseconds: 35,
        medianMilliseconds: 35,
        p50Milliseconds: 35,
        p95Milliseconds: 48.5,
      },
      bySelectionCmiBucket: [
        { bucket: "low", sampleCount: 2 },
        { bucket: "medium", sampleCount: 0 },
        { bucket: "high", sampleCount: 0 },
      ],
    });
    expect(
      result.scoringSets.find(
        ({ id }) => id === "diagnostics-passed-unreviewed",
      ).sampleCount,
    ).toBe(1);
    expect(
      result.scoringSets.find(({ id }) => id === "manually-confirmed-usable")
        .sampleCount,
    ).toBe(1);
    expect(
      result.perSample.find(
        ({ sampleId, providerId }) =>
          sampleId === "sample-2" && providerId === "provider-a",
      ).quality,
    ).toMatchObject({
      scoringClassification: "held-uncertain",
      scoringDisposition: "hold-for-review",
    });
    expect(
      result.perSample.find(
        ({ sampleId, providerId }) =>
          sampleId === "sample-3" && providerId === "provider-a",
      ).quality,
    ).toMatchObject({
      scoringClassification: "excluded-unusable",
      scoringDisposition: "exclude",
    });
  });

  it("rejects duplicate provider/sample records", () => {
    const duplicatePair = {
      ...records[0],
      executionId: "different-execution-id",
    };
    expect(() =>
      aggregate({ records: [...records.slice(0, -1), duplicatePair] }),
    ).toThrow("Duplicate provider/sample record");
  });

  it("rejects run/review identity mismatches", () => {
    expect(() =>
      aggregate({
        reviewManifest: {
          ...reviewManifest,
          datasetManifest: {
            ...reviewManifest.datasetManifest,
            sourceRevision: "wrong",
          },
        },
      }),
    ).toThrow("Quality review identity does not match");

    const wrongChecksumReviews = reviewManifest.reviews.map((item, index) =>
      index === 0 ? { ...item, audioContentSha256: "f".repeat(64) } : item,
    );
    expect(() =>
      aggregate({
        reviewManifest: {
          ...reviewManifest,
          reviews: wrongChecksumReviews,
        },
      }),
    ).toThrow("Quality review identity/checksum mismatch");
  });

  it("rejects a missing success hypothesis", () => {
    const invalid = {
      ...records[0],
      outcome: { status: "success" },
    };
    expect(() =>
      aggregate({ records: [invalid, ...records.slice(1)] }),
    ).toThrow("Successful result lacks a hypothesis");
  });

  it("rejects missing references and unknown schema/profile versions", () => {
    const missingReference = {
      ...records[0],
      sample: { ...records[0].sample, referenceTranscript: undefined },
    };
    expect(() =>
      aggregate({ records: [missingReference, ...records.slice(1)] }),
    ).toThrow("Result sample identity mismatch");
    expect(() =>
      aggregate({
        runMetadata: { ...runMetadata, schemaVersion: "future" },
      }),
    ).toThrow("Unknown STT run/result schema");
    expect(() =>
      aggregate({
        runMetadata: {
          ...runMetadata,
          normalization: { ...normalization, profileVersion: "future" },
        },
      }),
    ).toThrow("Unknown normalization profile");
  });

  it("parses CLI paths with or without a standalone separator", () => {
    const args = [
      "--run-dir",
      "results/stt/run-1",
      "--review-file",
      "reviews/review.json",
    ];
    expect(parseArguments(["--", ...args])).toEqual(parseArguments(args));
  });
});
