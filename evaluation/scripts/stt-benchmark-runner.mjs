import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  truncate,
  unlink,
} from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

import {
  STT_BATCH_RESULT_SCHEMA_VERSION,
  STT_BATCH_RUNNER_VERSION,
  STT_BATCH_RUN_SCHEMA_VERSION,
  rawWerPolicyVersion,
} from "@project-bridge/benchmark";

const runMetadataFileName = "run.json";
const resultsFileName = "results.jsonl";

export async function loadSttBenchmarkManifest(manifestPath) {
  const resolvedPath = resolve(manifestPath);
  let bytes;
  try {
    bytes = await readFile(resolvedPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Benchmark manifest not found: ${resolvedPath}.`);
    }
    throw new Error(`Benchmark manifest could not be read: ${resolvedPath}.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Benchmark manifest is not valid JSON.");
  }
  validateManifestShape(manifest);

  return {
    manifest,
    resolvedPath,
    directory: resolve(resolvedPath, ".."),
    contentSha256: sha256(bytes),
  };
}

export function createSttBenchmarkPlan(manifest, providers, filters = {}) {
  assertProviderConfigurations(providers);
  const providerIds = new Set(
    providers.map(({ configuration }) => configuration.providerId),
  );
  if (
    filters.providerId !== undefined &&
    !providerIds.has(filters.providerId)
  ) {
    throw new Error(`Unknown provider: ${filters.providerId}.`);
  }

  const sampleIds = new Set(manifest.samples.map(({ id }) => id));
  if (filters.sampleId !== undefined && !sampleIds.has(filters.sampleId)) {
    throw new Error(`Unknown sample: ${filters.sampleId}.`);
  }

  const samples = manifest.samples
    .filter(
      ({ id }) => filters.sampleId === undefined || id === filters.sampleId,
    )
    .toSorted((left, right) => left.id.localeCompare(right.id));
  const selectedProviders = providers
    .filter(
      ({ configuration }) =>
        filters.providerId === undefined ||
        configuration.providerId === filters.providerId,
    )
    .toSorted((left, right) =>
      left.configuration.providerId.localeCompare(
        right.configuration.providerId,
      ),
    );

  return samples.flatMap((sample) =>
    selectedProviders.map((provider) => ({ sample, provider })),
  );
}

export function createSttExecutionId({
  runId,
  manifest,
  manifestContentSha256,
  normalization,
  sample,
  providerConfiguration,
}) {
  const identity = {
    resultSchemaVersion: STT_BATCH_RESULT_SCHEMA_VERSION,
    runId,
    manifest: {
      id: manifest.id,
      version: manifest.version,
      sourceRevision: manifest.source.revision,
      contentSha256: manifestContentSha256,
    },
    sample: {
      id: sample.id,
      audioContentSha256: sample.audio.contentSha256,
    },
    providerConfiguration,
    normalization,
  };
  return `stt-${sha256(canonicalJson(identity)).slice(0, 32)}`;
}

export async function runSttBenchmarkBatch(input, dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const monotonicMilliseconds =
    dependencies.monotonicMilliseconds ?? (() => performance.now());
  const loaded = await loadSttBenchmarkManifest(input.manifestPath);
  const normalization = {
    profileId: loaded.manifest.normalization.primaryProfileId,
    profileVersion: loaded.manifest.normalization.primaryProfileVersion,
    rawScoringPolicyVersion: rawWerPolicyVersion,
  };
  const plan = createSttBenchmarkPlan(loaded.manifest, input.providers, {
    ...(input.sampleId === undefined ? {} : { sampleId: input.sampleId }),
    ...(input.providerId === undefined ? {} : { providerId: input.providerId }),
  });

  const samples = uniquePlannedSamples(plan);
  for (const sample of samples) {
    await loadAndVerifyAudio(sample, loaded.directory);
  }

  if (input.dryRun === true) {
    return {
      dryRun: true,
      plannedPairCount: plan.length,
      sampleCount: samples.length,
      providerCount: new Set(
        plan.map(({ provider }) => provider.configuration.providerId),
      ).size,
      executedPairCount: 0,
      skippedPairCount: 0,
      failureCount: 0,
    };
  }

  const runId = requireNonEmptyString(input.runId, "runId");
  const outputDirectory = resolve(
    requireNonEmptyString(input.outputDirectory, "outputDirectory"),
  );
  const manifestIdentity = {
    id: loaded.manifest.id,
    version: loaded.manifest.version,
    sourceRevision: loaded.manifest.source.revision,
    contentSha256: loaded.contentSha256,
  };
  const providerConfigurations = input.providers
    .map(({ configuration }) => configuration)
    .toSorted((left, right) => left.providerId.localeCompare(right.providerId));
  const proposedRun = {
    schemaVersion: STT_BATCH_RUN_SCHEMA_VERSION,
    runId,
    runnerVersion: STT_BATCH_RUNNER_VERSION,
    createdAt: now().toISOString(),
    manifest: manifestIdentity,
    normalization,
    providerConfigurations,
    executionPolicy: {
      concurrency: 1,
      automaticRetries: 0,
      order: "sample-id-then-provider-id",
    },
  };

  await mkdir(outputDirectory, { recursive: true });
  const runMetadataPath = resolve(outputDirectory, runMetadataFileName);
  const resultsPath = resolve(outputDirectory, resultsFileName);
  const runMetadata = await ensureRunMetadata(
    runMetadataPath,
    resultsPath,
    proposedRun,
  );
  const existingRecords = await loadExistingResults(resultsPath);
  const executionIds = validateExistingResults(
    existingRecords,
    loaded.manifest,
    runMetadata,
  );

  let executedPairCount = 0;
  let skippedPairCount = 0;
  let failureCount = existingRecords.filter(
    (record) => record.outcome?.status === "failure",
  ).length;
  let currentSampleId;
  let currentAudio;

  for (const item of plan) {
    const executionId = createSttExecutionId({
      runId,
      manifest: loaded.manifest,
      manifestContentSha256: loaded.contentSha256,
      normalization,
      sample: item.sample,
      providerConfiguration: item.provider.configuration,
    });
    if (executionIds.has(executionId)) {
      skippedPairCount += 1;
      continue;
    }

    if (currentSampleId !== item.sample.id) {
      currentAudio = await loadAndVerifyAudio(item.sample, loaded.directory);
      currentSampleId = item.sample.id;
    }
    const record = await executePair({
      executionId,
      runId,
      manifestIdentity,
      normalization,
      sample: item.sample,
      audio: currentAudio,
      provider: item.provider,
      now,
      monotonicMilliseconds,
    });
    if (executionIds.has(record.executionId)) {
      throw new Error(`Duplicate result identity: ${record.executionId}.`);
    }
    await appendJsonLineDurably(resultsPath, record);
    executionIds.add(record.executionId);
    executedPairCount += 1;
    if (record.outcome.status === "failure") failureCount += 1;
    await dependencies.afterRecordPersisted?.(record, {
      runMetadataPath,
      resultsPath,
    });
  }

  return {
    dryRun: false,
    plannedPairCount: plan.length,
    sampleCount: samples.length,
    providerCount: new Set(
      plan.map(({ provider }) => provider.configuration.providerId),
    ).size,
    executedPairCount,
    skippedPairCount,
    failureCount,
    runMetadataPath,
    resultsPath,
  };
}

async function executePair({
  executionId,
  runId,
  manifestIdentity,
  normalization,
  sample,
  audio,
  provider,
  now,
  monotonicMilliseconds,
}) {
  const wrapperStartedAt = now().toISOString();
  const wrapperStartedMonotonic = monotonicMilliseconds();
  let outcome;
  try {
    outcome = await provider.transcribe(audio, {});
  } catch {
    const completedAt = now().toISOString();
    return {
      schemaVersion: STT_BATCH_RESULT_SCHEMA_VERSION,
      executionId,
      runId,
      manifest: manifestIdentity,
      sample: sampleIdentity(sample),
      providerConfiguration: provider.configuration,
      normalization,
      execution: {
        executedAt: wrapperStartedAt,
        startedAt: wrapperStartedAt,
        completedAt,
        latencyMilliseconds: Math.max(
          0,
          monotonicMilliseconds() - wrapperStartedMonotonic,
        ),
        attemptCount: 1,
      },
      outcome: {
        status: "failure",
        failure: {
          stage: "transcription",
          code: "provider-exception",
          retryable: false,
        },
      },
    };
  }

  const returnedConfiguration = outcome.ok
    ? outcome.value.providerConfiguration
    : outcome.error.providerConfiguration;
  if (
    canonicalJson(returnedConfiguration) !==
    canonicalJson(provider.configuration)
  ) {
    throw new Error(
      `Provider ${provider.configuration.providerId} returned a mismatched configuration snapshot.`,
    );
  }

  if (outcome.ok) {
    return {
      schemaVersion: STT_BATCH_RESULT_SCHEMA_VERSION,
      executionId,
      runId,
      manifest: manifestIdentity,
      sample: sampleIdentity(sample),
      providerConfiguration: provider.configuration,
      ...(outcome.value.providerModelMetadata === undefined
        ? {}
        : { providerModelMetadata: outcome.value.providerModelMetadata }),
      normalization,
      execution: {
        executedAt: outcome.value.startedAt,
        startedAt: outcome.value.startedAt,
        completedAt: outcome.value.completedAt,
        latencyMilliseconds: outcome.value.latencyMilliseconds,
        attemptCount: 1,
      },
      outcome: {
        status: "success",
        hypothesisTranscript: outcome.value.text,
        ...(outcome.value.providerStatus === undefined
          ? {}
          : { providerStatus: outcome.value.providerStatus }),
        ...(outcome.value.rawResponseReference === undefined
          ? {}
          : { providerReference: outcome.value.rawResponseReference }),
        ...(outcome.value.detectedLanguages === undefined
          ? {}
          : { detectedLanguages: outcome.value.detectedLanguages }),
      },
    };
  }

  return {
    schemaVersion: STT_BATCH_RESULT_SCHEMA_VERSION,
    executionId,
    runId,
    manifest: manifestIdentity,
    sample: sampleIdentity(sample),
    providerConfiguration: provider.configuration,
    normalization,
    execution: {
      executedAt: outcome.error.startedAt,
      startedAt: outcome.error.startedAt,
      completedAt: outcome.error.completedAt,
      latencyMilliseconds: outcome.error.latencyMilliseconds,
      attemptCount: 1,
    },
    outcome: {
      status: "failure",
      failure: {
        stage: "transcription",
        code: outcome.error.code,
        retryable: outcome.error.retryable,
        ...(outcome.error.httpStatus === undefined
          ? {}
          : { httpStatus: outcome.error.httpStatus }),
        ...(outcome.error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: outcome.error.retryAfterSeconds }),
        ...(outcome.error.providerReference === undefined
          ? {}
          : { providerReference: outcome.error.providerReference }),
      },
    },
  };
}

function sampleIdentity(sample) {
  return {
    id: sample.id,
    audioContentSha256: sample.audio.contentSha256,
    referenceTranscript: sample.referenceTranscript.raw,
  };
}

async function loadAndVerifyAudio(sample, manifestDirectory) {
  const audioPath = resolveSafeAudioPath(
    manifestDirectory,
    sample.audio.relativePath,
    sample.id,
  );
  let fileInfo;
  try {
    fileInfo = await stat(audioPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Audio file missing for sample ${sample.id}.`);
    }
    throw new Error(`Audio file unreadable for sample ${sample.id}.`);
  }
  if (!fileInfo.isFile()) {
    throw new Error(`Audio path is not a file for sample ${sample.id}.`);
  }

  let bytes;
  try {
    bytes = await readFile(audioPath);
  } catch {
    throw new Error(`Audio file unreadable for sample ${sample.id}.`);
  }
  const actualChecksum = sha256(bytes);
  if (actualChecksum !== sample.audio.contentSha256) {
    throw new Error(`Audio checksum mismatch for sample ${sample.id}.`);
  }
  if (
    Number.isSafeInteger(sample.audio.byteLength) &&
    sample.audio.byteLength !== bytes.byteLength
  ) {
    throw new Error(`Audio byte length mismatch for sample ${sample.id}.`);
  }

  return {
    sampleId: sample.id,
    bytes: new Uint8Array(bytes),
    mediaType: sample.audio.mediaType,
    fileName: sample.filename || basename(audioPath),
    contentSha256: actualChecksum,
    ...(Number.isFinite(sample.durationSeconds)
      ? { durationMilliseconds: sample.durationSeconds * 1_000 }
      : {}),
  };
}

function resolveSafeAudioPath(manifestDirectory, relativePath, sampleId) {
  if (isAbsolute(relativePath)) {
    throw new Error(`Audio path must be relative for sample ${sampleId}.`);
  }
  const resolvedPath = resolve(manifestDirectory, relativePath);
  const pathFromManifest = relative(manifestDirectory, resolvedPath);
  if (
    pathFromManifest === ".." ||
    pathFromManifest.startsWith(`..${sep}`) ||
    isAbsolute(pathFromManifest)
  ) {
    throw new Error(
      `Audio path escapes the manifest directory for sample ${sampleId}.`,
    );
  }
  return resolvedPath;
}

async function ensureRunMetadata(runPath, resultsPath, proposedRun) {
  let existing;
  try {
    existing = JSON.parse(await readFile(runPath, "utf8"));
  } catch (error) {
    if (!(isNodeError(error) && error.code === "ENOENT")) {
      throw new Error("Existing run metadata is unreadable or malformed.");
    }
  }
  if (existing !== undefined) {
    if (
      canonicalJson(runCompatibilityFields(existing)) !==
      canonicalJson(runCompatibilityFields(proposedRun))
    ) {
      throw new Error(
        "Existing run metadata does not match the manifest or provider configuration; select a new run ID/output directory.",
      );
    }
    return existing;
  }

  try {
    const resultInfo = await stat(resultsPath);
    if (resultInfo.size > 0) {
      throw new Error("Results exist without matching run metadata.");
    }
  } catch (error) {
    if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
  }
  await writeJsonAtomically(runPath, proposedRun);
  return proposedRun;
}

function runCompatibilityFields(run) {
  return {
    schemaVersion: run.schemaVersion,
    runId: run.runId,
    runnerVersion: run.runnerVersion,
    manifest: run.manifest,
    normalization: run.normalization,
    providerConfigurations: run.providerConfigurations,
    executionPolicy: run.executionPolicy,
  };
}

async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function appendJsonLineDurably(path, value) {
  const line = `${JSON.stringify(value)}\n`;
  const handle = await open(path, "a");
  try {
    await handle.write(line, undefined, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function loadExistingResults(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw new Error("Existing result checkpoint could not be read.");
  }
  if (text === "") return [];

  let completeText = text;
  if (!text.endsWith("\n")) {
    const lastNewline = text.lastIndexOf("\n");
    const trailing = text.slice(lastNewline + 1);
    try {
      JSON.parse(trailing);
      await appendFile(path, "\n", "utf8");
      completeText = `${text}\n`;
    } catch {
      const retainedLength = lastNewline < 0 ? 0 : lastNewline + 1;
      await truncate(path, Buffer.byteLength(text.slice(0, retainedLength)));
      completeText = text.slice(0, retainedLength);
    }
  }

  return completeText
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(
          `Malformed persisted result at JSONL line ${index + 1}.`,
        );
      }
    });
}

function validateExistingResults(records, manifest, runMetadata) {
  const ids = new Set();
  const sampleById = new Map(
    manifest.samples.map((sample) => [sample.id, sample]),
  );
  for (const record of records) {
    if (!isRecord(record) || typeof record.executionId !== "string") {
      throw new Error("Persisted result has an invalid result identity.");
    }
    if (ids.has(record.executionId)) {
      throw new Error(`Duplicate persisted result: ${record.executionId}.`);
    }
    const sample = sampleById.get(record.sample?.id);
    const providerConfiguration = runMetadata.providerConfigurations.find(
      (configuration) =>
        canonicalJson(configuration) ===
        canonicalJson(record.providerConfiguration),
    );
    if (sample === undefined || providerConfiguration === undefined) {
      throw new Error(
        "Persisted result does not match this run configuration.",
      );
    }
    const expectedId = createSttExecutionId({
      runId: runMetadata.runId,
      manifest,
      manifestContentSha256: runMetadata.manifest.contentSha256,
      normalization: runMetadata.normalization,
      sample,
      providerConfiguration,
    });
    if (
      record.schemaVersion !== STT_BATCH_RESULT_SCHEMA_VERSION ||
      record.runId !== runMetadata.runId ||
      canonicalJson(record.manifest) !== canonicalJson(runMetadata.manifest) ||
      canonicalJson(record.normalization) !==
        canonicalJson(runMetadata.normalization) ||
      record.executionId !== expectedId
    ) {
      throw new Error("Persisted result identity does not match this run.");
    }
    ids.add(record.executionId);
  }
  return ids;
}

function uniquePlannedSamples(plan) {
  const samples = new Map();
  for (const { sample } of plan) samples.set(sample.id, sample);
  return [...samples.values()];
}

function validateManifestShape(manifest) {
  if (!isRecord(manifest))
    throw new Error("Benchmark manifest must be an object.");
  requireNonEmptyString(manifest.id, "manifest.id");
  requireNonEmptyString(manifest.version, "manifest.version");
  if (!isRecord(manifest.source))
    throw new Error("Benchmark manifest source is required.");
  for (const field of ["datasetId", "datasetConfig", "split", "revision"]) {
    requireNonEmptyString(manifest.source[field], `manifest.source.${field}`);
  }
  if (!isRecord(manifest.normalization)) {
    throw new Error("Benchmark manifest normalization is required.");
  }
  requireNonEmptyString(
    manifest.normalization.primaryProfileId,
    "manifest.normalization.primaryProfileId",
  );
  requireNonEmptyString(
    manifest.normalization.primaryProfileVersion,
    "manifest.normalization.primaryProfileVersion",
  );
  if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
    throw new Error("Benchmark manifest must contain samples.");
  }

  const ids = new Set();
  for (const sample of manifest.samples) {
    if (!isRecord(sample))
      throw new Error("Benchmark sample must be an object.");
    const id = requireNonEmptyString(sample.id, "sample.id");
    if (ids.has(id)) throw new Error(`Duplicate benchmark sample ID: ${id}.`);
    ids.add(id);
    if (!isRecord(sample.source))
      throw new Error(`Sample ${id} source is required.`);
    if (sample.source.revision !== manifest.source.revision) {
      throw new Error(
        `Sample ${id} source revision does not match the manifest.`,
      );
    }
    if (!isRecord(sample.referenceTranscript)) {
      throw new Error(`Sample ${id} reference transcript is required.`);
    }
    if (typeof sample.referenceTranscript.raw !== "string") {
      throw new Error(`Sample ${id} raw reference transcript is required.`);
    }
    if (!isRecord(sample.audio))
      throw new Error(`Sample ${id} audio is required.`);
    requireNonEmptyString(sample.audio.relativePath, `sample ${id} audio path`);
    requireNonEmptyString(sample.audio.mediaType, `sample ${id} media type`);
    if (!/^[a-f0-9]{64}$/u.test(sample.audio.contentSha256)) {
      throw new Error(`Sample ${id} has an invalid audio checksum.`);
    }
    if (
      !Number.isSafeInteger(sample.audio.byteLength) ||
      sample.audio.byteLength <= 0
    ) {
      throw new Error(`Sample ${id} has an invalid audio byte length.`);
    }
  }
  if (
    isRecord(manifest.selection) &&
    Number.isSafeInteger(manifest.selection.actualSampleCount) &&
    manifest.selection.actualSampleCount !== manifest.samples.length
  ) {
    throw new Error(
      "Benchmark manifest sample count does not match its samples.",
    );
  }
}

function assertProviderConfigurations(providers) {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error("At least one speech provider is required.");
  }
  const providerIds = new Set();
  const configurationIds = new Set();
  for (const provider of providers) {
    if (!isRecord(provider) || !isRecord(provider.configuration)) {
      throw new Error("Speech provider configuration is required.");
    }
    const { configuration } = provider;
    requireNonEmptyString(configuration.id, "provider configuration ID");
    requireNonEmptyString(configuration.providerId, "provider ID");
    requireNonEmptyString(
      configuration.modelIdentifier,
      "provider model identifier",
    );
    if (providerIds.has(configuration.providerId)) {
      throw new Error(`Duplicate provider ID: ${configuration.providerId}.`);
    }
    if (configurationIds.has(configuration.id)) {
      throw new Error(
        `Duplicate provider configuration ID: ${configuration.id}.`,
      );
    }
    providerIds.add(configuration.providerId);
    configurationIds.add(configuration.id);
    assertSanitizedValue(configuration, "providerConfiguration");
  }
}

function assertSanitizedValue(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSanitizedValue(item, `${path}[${index}]`),
    );
    return;
  }
  if (!isRecord(value)) {
    if (
      typeof value === "string" &&
      /\b(?:bearer|token)\s+[a-z0-9._-]{8,}/iu.test(value)
    ) {
      throw new Error(`Secret-like value is not allowed in ${path}.`);
    }
    if (typeof value === "string" && /^https?:\/\//iu.test(value)) {
      const url = new URL(value);
      if (url.username !== "" || url.password !== "") {
        throw new Error(`URL credentials are not allowed in ${path}.`);
      }
      for (const key of url.searchParams.keys()) {
        if (/key|token|secret|auth/iu.test(key)) {
          throw new Error(
            `Secret-bearing URL query is not allowed in ${path}.`,
          );
        }
      }
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      /(?:api.?key|authorization|credential|password|secret|access.?token)/iu.test(
        key,
      )
    ) {
      throw new Error(`Secret-bearing field is not allowed in ${path}.`);
    }
    assertSanitizedValue(item, `${path}.${key}`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
