import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import {
  LATENCY_SUMMARY_POLICY_VERSION,
  NORMALIZED_CHARACTER_TOKENIZATION_VERSION,
  RAW_CHARACTER_TOKENIZATION_VERSION,
  RAW_WORD_TOKENIZATION_VERSION,
  STT_METRIC_SCHEMA_VERSION,
  STT_SCORING_POLICY_VERSION,
  STT_BATCH_RESULT_SCHEMA_VERSION,
  STT_BATCH_RUNNER_VERSION,
  STT_BATCH_RUN_SCHEMA_VERSION,
  aggregateCharacterErrorRates,
  aggregateWordErrorRates,
  audioQualityScoringDisposition,
  calculateSttSampleMetrics,
  summarizeLatency,
  validateAudioQualityReviewManifest,
  yorubaDiacriticInsensitiveAnalysisProfile,
  yorubaStrictNormalizationProfile,
} from "@project-bridge/benchmark";
import { diagnosePcm16Wav } from "./wav-audio-quality.mjs";

export async function loadAndAggregateSttMetrics(input, dependencies = {}) {
  const runDirectory = resolve(input.runDirectory);
  const runPath = resolve(runDirectory, "run.json");
  const resultsPath = resolve(runDirectory, "results.jsonl");
  const reviewPath = resolve(input.reviewPath);
  const [runBytes, resultsBytes, reviewBytes] = await Promise.all([
    readFile(runPath),
    readFile(resultsPath),
    readFile(reviewPath),
  ]);
  const runMetadata = parseJson(runBytes, "run.json");
  const records = parseJsonLines(resultsBytes, "results.jsonl");
  const reviewManifest = parseJson(reviewBytes, "quality review manifest");
  const reviewIssues = validateAudioQualityReviewManifest(reviewManifest);
  if (reviewIssues.length > 0)
    throw new Error(
      `Invalid quality review manifest: ${reviewIssues.join(" ")}`,
    );
  const manifestPath =
    input.manifestPath === undefined
      ? await discoverManifest(runMetadata, input.dataDirectory)
      : resolve(input.manifestPath);
  const manifestBytes = await readFile(manifestPath);
  const manifest = parseJson(manifestBytes, "materialized manifest");
  const hashes = {
    runJsonSha256: sha256(runBytes),
    resultsJsonlSha256: sha256(resultsBytes),
    qualityReviewManifestSha256: sha256(reviewBytes),
    materializedManifestSha256: sha256(manifestBytes),
  };
  if (hashes.materializedManifestSha256 !== runMetadata.manifest?.contentSha256)
    throw new Error("Materialized manifest checksum does not match run.json.");
  const qualityBySample = await inspectQuality(
    manifest,
    manifestPath,
    reviewManifest,
    dependencies.readFile ?? readFile,
  );
  return aggregateSttMetrics({
    runMetadata,
    records,
    manifest,
    reviewManifest,
    qualityBySample,
    hashes,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
  });
}

export function aggregateSttMetrics(input) {
  validateInputs(input);
  const sampleById = new Map(
    input.manifest.samples.map((sample) => [sample.id, sample]),
  );
  const reviewById = new Map(
    input.reviewManifest.reviews.map((review) => [review.sampleId, review]),
  );
  const providerConfigurations =
    input.runMetadata.providerConfigurations.toSorted((left, right) =>
      left.providerId.localeCompare(right.providerId),
    );
  const perSample = input.records
    .filter((record) => record.outcome.status === "success")
    .map((record) => {
      const sample = sampleById.get(record.sample.id);
      const review = reviewById.get(record.sample.id);
      const quality = input.qualityBySample.get(record.sample.id);
      const reviewDisposition =
        review === undefined
          ? null
          : audioQualityScoringDisposition(review.state);
      const scoringClassification =
        reviewDisposition === "exclude"
          ? "excluded-unusable"
          : reviewDisposition === "hold-for-review"
            ? "held-uncertain"
            : reviewDisposition === "include"
              ? "manual-usable"
              : quality === "pass"
                ? "diagnostics-passed-unreviewed"
                : "held-unreviewed-diagnostic-concern";
      return {
        sampleId: record.sample.id,
        providerId: record.providerConfiguration.providerId,
        providerConfigurationId: record.providerConfiguration.id,
        providerModelMetadata: record.providerModelMetadata ?? null,
        selectionCmiBucket: sample.selectionCmiBucket,
        sourceCmiBand: sample.sourceCmiBand,
        quality: {
          reviewState: review?.state ?? "unreviewed",
          scoringClassification,
          scoringDisposition:
            scoringClassification === "excluded-unusable"
              ? "exclude"
              : scoringClassification.startsWith("held-")
                ? "hold-for-review"
                : "include",
        },
        latencyMilliseconds: record.execution.latencyMilliseconds,
        metrics: calculateSttSampleMetrics(
          record.sample.referenceTranscript,
          record.outcome.hypothesisTranscript,
          yorubaStrictNormalizationProfile,
          yorubaDiacriticInsensitiveAnalysisProfile,
        ),
      };
    })
    .toSorted(
      (left, right) =>
        left.sampleId.localeCompare(right.sampleId) ||
        left.providerId.localeCompare(right.providerId),
    );
  const allSampleIds = new Set(perSample.map(({ sampleId }) => sampleId));
  const scoredSampleIds = new Set(
    perSample
      .filter(({ quality }) => quality.scoringDisposition === "include")
      .map(({ sampleId }) => sampleId),
  );
  const manualUsableIds = new Set(
    perSample
      .filter(
        ({ quality }) => quality.scoringClassification === "manual-usable",
      )
      .map(({ sampleId }) => sampleId),
  );
  const diagnosticIds = new Set(
    perSample
      .filter(
        ({ quality }) =>
          quality.scoringClassification === "diagnostics-passed-unreviewed",
      )
      .map(({ sampleId }) => sampleId),
  );
  const sets = [
    createSet(
      "all-successful-results",
      "All successful raw provider results, including held/excluded samples.",
      allSampleIds,
      perSample,
      providerConfigurations,
    ),
    createSet(
      "scored-development",
      "Primary development aggregate: manual usable plus diagnostics-passed/unreviewed; uncertain and unusable are omitted.",
      scoredSampleIds,
      perSample,
      providerConfigurations,
    ),
    createSet(
      "manually-confirmed-usable",
      "Only samples explicitly reviewed as usable.",
      manualUsableIds,
      perSample,
      providerConfigurations,
    ),
    createSet(
      "diagnostics-passed-unreviewed",
      "Passing automated WAV diagnostics and no human review; not human-approved.",
      diagnosticIds,
      perSample,
      providerConfigurations,
    ),
  ];
  return {
    schemaVersion: STT_METRIC_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    identity: {
      runId: input.runMetadata.runId,
      manifest: input.runMetadata.manifest,
      hashes: input.hashes,
      providerConfigurations,
    },
    policies: {
      scoringPolicyVersion: STT_SCORING_POLICY_VERSION,
      rawWordTokenizationVersion: RAW_WORD_TOKENIZATION_VERSION,
      rawCharacterTokenizationVersion: RAW_CHARACTER_TOKENIZATION_VERSION,
      normalizedCharacterTokenizationVersion:
        NORMALIZED_CHARACTER_TOKENIZATION_VERSION,
      latencySummaryPolicyVersion: LATENCY_SUMMARY_POLICY_VERSION,
      normalizedCerWhitespace: "include-single-collapsed-space-code-points",
    },
    normalization: {
      primary: {
        id: yorubaStrictNormalizationProfile.id,
        version: yorubaStrictNormalizationProfile.version,
        diacritics: "preserved",
      },
      secondaryAnalysis: {
        id: yorubaDiacriticInsensitiveAnalysisProfile.id,
        version: yorubaDiacriticInsensitiveAnalysisProfile.version,
        analysisOnly: true,
      },
    },
    qualityReview: {
      id: input.reviewManifest.id,
      scoringPolicy: input.reviewManifest.scoringPolicy,
      reviewedSampleCount: input.reviewManifest.reviews.length,
    },
    resultCounts: {
      total: input.records.length,
      successful: perSample.length,
      failed: input.records.length - perSample.length,
      byProvider: providerConfigurations.map(({ providerId }) => {
        const providerRecords = input.records.filter(
          (record) => record.providerConfiguration.providerId === providerId,
        );
        const successful = providerRecords.filter(
          (record) => record.outcome.status === "success",
        ).length;
        return {
          providerId,
          total: providerRecords.length,
          successful,
          failed: providerRecords.length - successful,
        };
      }),
    },
    scoringSets: sets,
    perSample,
  };
}

function createSet(
  id,
  description,
  sampleIds,
  perSample,
  providerConfigurations,
) {
  const rows = perSample.filter(({ sampleId }) => sampleIds.has(sampleId));
  const heldSampleCount = new Set(
    perSample
      .filter(({ quality }) => quality.scoringDisposition === "hold-for-review")
      .map(({ sampleId }) => sampleId),
  ).size;
  const excludedSampleCount = new Set(
    perSample
      .filter(({ quality }) => quality.scoringDisposition === "exclude")
      .map(({ sampleId }) => sampleId),
  ).size;
  return {
    id,
    description,
    sampleCount: sampleIds.size,
    heldSampleCount,
    excludedSampleCount,
    providers: providerConfigurations.map((providerConfiguration) => {
      const providerId = providerConfiguration.providerId;
      const providerRows = rows.filter((row) => row.providerId === providerId);
      return {
        providerId,
        providerConfiguration,
        heldSampleCount,
        excludedSampleCount,
        ...aggregateRows(providerRows),
        bySelectionCmiBucket: ["low", "medium", "high"].map((bucket) => ({
          bucket,
          ...aggregateRows(
            providerRows.filter(
              ({ selectionCmiBucket }) => selectionCmiBucket === bucket,
            ),
          ),
        })),
        bySourceCmiBand: [
          ...new Set(rows.map(({ sourceCmiBand }) => sourceCmiBand)),
        ]
          .toSorted()
          .map((band) => ({
            band,
            ...aggregateRows(
              providerRows.filter(
                ({ sourceCmiBand }) => sourceCmiBand === band,
              ),
            ),
          })),
      };
    }),
  };
}

function aggregateRows(rows) {
  return {
    sampleCount: rows.length,
    metrics: {
      rawSurface: {
        wer: aggregateWordErrorRates(
          rows.map(({ metrics }) => metrics.rawSurface.wer),
        ),
        cer: aggregateCharacterErrorRates(
          rows.map(({ metrics }) => metrics.rawSurface.cer),
        ),
      },
      strictNormalized: {
        wer: aggregateWordErrorRates(
          rows.map(({ metrics }) => metrics.strictNormalized.wer),
        ),
        cer: aggregateCharacterErrorRates(
          rows.map(({ metrics }) => metrics.strictNormalized.cer),
        ),
      },
      diacriticInsensitiveAnalysis: {
        wer: aggregateWordErrorRates(
          rows.map(({ metrics }) => metrics.diacriticInsensitiveAnalysis.wer),
        ),
        cer: aggregateCharacterErrorRates(
          rows.map(({ metrics }) => metrics.diacriticInsensitiveAnalysis.cer),
        ),
      },
    },
    latency: summarizeLatency(
      rows.map(({ latencyMilliseconds }) => latencyMilliseconds),
    ),
  };
}

function validateInputs(input) {
  const { runMetadata, records, manifest, reviewManifest, qualityBySample } =
    input;
  if (
    runMetadata.schemaVersion !== STT_BATCH_RUN_SCHEMA_VERSION ||
    runMetadata.runnerVersion !== STT_BATCH_RUNNER_VERSION ||
    records.some(
      (record) => record.schemaVersion !== STT_BATCH_RESULT_SCHEMA_VERSION,
    )
  )
    throw new Error("Unknown STT run/result schema or runner version.");
  if (
    runMetadata.normalization?.profileId !==
      yorubaStrictNormalizationProfile.id ||
    runMetadata.normalization?.profileVersion !==
      yorubaStrictNormalizationProfile.version ||
    manifest.normalization?.primaryProfileId !==
      yorubaStrictNormalizationProfile.id ||
    manifest.normalization?.primaryProfileVersion !==
      yorubaStrictNormalizationProfile.version ||
    manifest.normalization?.optionalAnalysisProfileId !==
      yorubaDiacriticInsensitiveAnalysisProfile.id ||
    manifest.normalization?.optionalAnalysisProfileVersion !==
      yorubaDiacriticInsensitiveAnalysisProfile.version ||
    runMetadata.normalization?.rawScoringPolicyVersion !==
      RAW_WORD_TOKENIZATION_VERSION
  )
    throw new Error("Unknown normalization profile in run or manifest.");
  if (
    reviewManifest.datasetManifest.id !== manifest.id ||
    reviewManifest.datasetManifest.version !== manifest.version ||
    reviewManifest.datasetManifest.sourceRevision !== manifest.source?.revision
  )
    throw new Error(
      "Quality review identity does not match the dataset manifest.",
    );
  const sampleById = new Map(
    manifest.samples.map((sample) => [sample.id, sample]),
  );
  for (const sample of manifest.samples)
    if (typeof sample.referenceTranscript?.raw !== "string")
      throw new Error(`Missing reference transcript for ${sample.id}.`);
  const providerIds = runMetadata.providerConfigurations.map(
    ({ providerId }) => providerId,
  );
  if (new Set(providerIds).size !== providerIds.length)
    throw new Error("Run contains duplicate provider configurations.");
  const configurationByCanonical = new Map(
    runMetadata.providerConfigurations.map((configuration) => [
      canonicalJson(configuration),
      configuration,
    ]),
  );
  const executionIds = new Set();
  const pairs = new Set();
  for (const record of records) {
    if (record.runId !== runMetadata.runId)
      throw new Error("Result run ID does not match run.json.");
    if (
      canonicalJson(record.manifest) !== canonicalJson(runMetadata.manifest) ||
      canonicalJson(record.normalization) !==
        canonicalJson(runMetadata.normalization)
    )
      throw new Error("Run metadata and result identities mismatch.");
    if (executionIds.has(record.executionId))
      throw new Error(`Duplicate execution record: ${record.executionId}.`);
    executionIds.add(record.executionId);
    const configuration = configurationByCanonical.get(
      canonicalJson(record.providerConfiguration),
    );
    if (configuration === undefined)
      throw new Error("Result provider configuration is absent from run.json.");
    const sample = sampleById.get(record.sample?.id);
    if (sample === undefined)
      throw new Error(`Result references unknown sample ${record.sample?.id}.`);
    const pair = `${record.sample.id}\u0000${configuration.providerId}`;
    if (pairs.has(pair))
      throw new Error(
        `Duplicate provider/sample record: ${configuration.providerId}/${record.sample.id}.`,
      );
    pairs.add(pair);
    if (
      typeof record.sample?.referenceTranscript !== "string" ||
      record.sample.audioContentSha256 !== sample.audio.contentSha256 ||
      record.sample.referenceTranscript !== sample.referenceTranscript.raw
    )
      throw new Error(
        `Result sample identity mismatch for ${record.sample.id}.`,
      );
    if (
      !Number.isFinite(record.execution?.latencyMilliseconds) ||
      record.execution.latencyMilliseconds < 0
    )
      throw new Error(`Invalid latency for ${record.sample.id}.`);
    if (
      record.outcome?.status === "success" &&
      typeof record.outcome.hypothesisTranscript !== "string"
    )
      throw new Error(
        `Successful result lacks a hypothesis for ${record.sample.id}.`,
      );
    if (
      record.outcome?.status !== "success" &&
      record.outcome?.status !== "failure"
    )
      throw new Error(`Invalid outcome for ${record.sample.id}.`);
  }
  const expectedPairs =
    manifest.samples.length * runMetadata.providerConfigurations.length;
  if (pairs.size !== expectedPairs)
    throw new Error(
      `Run results are incomplete: expected ${expectedPairs} provider/sample records, found ${pairs.size}.`,
    );
  for (const review of reviewManifest.reviews) {
    const sample = sampleById.get(review.sampleId);
    if (
      sample === undefined ||
      sample.audio.contentSha256 !== review.audioContentSha256
    )
      throw new Error(
        `Quality review identity/checksum mismatch for ${review.sampleId}.`,
      );
  }
  for (const sample of manifest.samples)
    if (!qualityBySample.has(sample.id))
      throw new Error(`Missing audio diagnostic status for ${sample.id}.`);
}

async function inspectQuality(manifest, manifestPath, reviewManifest, read) {
  const reviewById = new Map(
    reviewManifest.reviews.map((review) => [review.sampleId, review]),
  );
  const result = new Map();
  for (const sample of manifest.samples) {
    const bytes = await read(
      resolveWithin(dirname(manifestPath), sample.audio.relativePath),
    );
    if (sha256(bytes) !== sample.audio.contentSha256)
      throw new Error(`Audio checksum mismatch for ${sample.id}.`);
    if (reviewById.has(sample.id)) {
      result.set(sample.id, "reviewed");
    } else {
      const diagnostic = diagnosePcm16Wav(bytes, sample.durationSeconds);
      result.set(
        sample.id,
        diagnostic.automatedAssessment === "pass" ? "pass" : "concern",
      );
    }
  }
  return result;
}

async function discoverManifest(runMetadata, dataDirectory) {
  const candidates = await findNamedFiles(
    resolve(dataDirectory),
    "manifest.json",
  );
  const matches = [];
  for (const path of candidates) {
    const bytes = await readFile(path);
    if (sha256(bytes) !== runMetadata.manifest?.contentSha256) continue;
    const manifest = parseJson(bytes, "materialized manifest");
    if (
      manifest.id === runMetadata.manifest.id &&
      manifest.version === runMetadata.manifest.version &&
      manifest.source?.revision === runMetadata.manifest.sourceRevision
    )
      matches.push(path);
  }
  if (matches.length !== 1)
    throw new Error(
      `Expected one materialized manifest matching run.json but found ${matches.length}.`,
    );
  return matches[0];
}

async function findNamedFiles(directory, name) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory())
      results.push(...(await findNamedFiles(path, name)));
    else if (entry.isFile() && entry.name === name) results.push(path);
  }
  return results.toSorted();
}

function resolveWithin(root, relativePath) {
  const path = resolve(root, relativePath);
  const relation = relative(root, path);
  if (relation === ".." || relation.startsWith(`..${sep}`))
    throw new Error("Manifest audio path escapes its directory.");
  return path;
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function parseJsonLines(bytes, label) {
  const text = bytes.toString("utf8");
  if (text.trim() === "") throw new Error(`${label} is empty.`);
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`${label} line ${index + 1} is invalid JSON.`);
      }
    });
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
