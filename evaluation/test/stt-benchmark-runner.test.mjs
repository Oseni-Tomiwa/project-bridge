import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSttBenchmarkPlan,
  createSttExecutionId,
  loadSttBenchmarkManifest,
  runSttBenchmarkBatch,
} from "../scripts/stt-benchmark-runner.mjs";
import { parseArguments } from "../scripts/run-stt-benchmark.mjs";
import { createConfiguredSttProviders } from "../scripts/stt-provider-registry.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(sampleCount = 2) {
  const directory = await mkdtemp(join(tmpdir(), "project-bridge-stt-"));
  temporaryDirectories.push(directory);
  const audioDirectory = resolve(directory, "audio");
  await mkdir(audioDirectory);
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const bytes = new Uint8Array([index + 1, index + 2, index + 3]);
    const relativePath = `audio/sample-${index}.wav`;
    await writeFile(resolve(directory, relativePath), bytes);
    samples.push({
      id: `sample-${index}`,
      source: {
        datasetId: "test/dataset",
        datasetConfig: "yoruba",
        split: "test",
        revision: "revision-1",
        rowIndex: index,
      },
      filename: `sample-${index}.wav`,
      referenceTranscript: {
        raw: `Reference ${index}`,
        tagged: `Reference ${index}`,
        strictNormalized: `reference ${index}`,
        diacriticInsensitiveAnalysis: `reference ${index}`,
      },
      durationSeconds: 1,
      audio: {
        relativePath,
        contentSha256: sha256(bytes),
        byteLength: bytes.byteLength,
        mediaType: "audio/wav",
        transformation: "none-original-source-bytes",
      },
      downstream: null,
    });
  }
  const manifest = {
    id: "test-manifest",
    version: "0.1",
    status: "frozen-no-results",
    source: {
      datasetId: "test/dataset",
      datasetConfig: "yoruba",
      split: "test",
      revision: "revision-1",
    },
    selection: {
      actualSampleCount: samples.length,
      requestedSampleCount: samples.length,
    },
    normalization: {
      primaryProfileId: "yoruba-strict",
      primaryProfileVersion: "0.1",
    },
    samples,
  };
  const manifestPath = resolve(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    directory,
    outputDirectory: resolve(directory, "results"),
    manifest,
    manifestPath,
  };
}

function fakeProvider(providerId, options = {}) {
  const calls = [];
  const configuration = {
    id: `${providerId}-${options.configurationSuffix ?? "config-v1"}`,
    providerId,
    modelIdentifier: `${providerId}-model`,
    options: { language: "multi", ...(options.configurationOptions ?? {}) },
  };
  return {
    configuration,
    calls,
    async transcribe(audio) {
      calls.push(audio);
      if (options.throwError === true) throw new Error("provider exploded");
      if (options.failure === true) {
        return {
          ok: false,
          error: {
            code: "rate-limited",
            message: "safe message",
            retryable: true,
            httpStatus: 429,
            retryAfterSeconds: 4,
            providerConfiguration: configuration,
            startedAt: "2026-09-08T12:00:00.000Z",
            completedAt: "2026-09-08T12:00:00.010Z",
            latencyMilliseconds: 10,
          },
        };
      }
      return {
        ok: true,
        value: {
          providerConfiguration: configuration,
          text: `RAW ${audio.sampleId}`,
          segments: [],
          providerModelMetadata: {
            identifier: `${providerId}-reported-model`,
            version: "2026-09",
          },
          startedAt: "2026-09-08T12:00:00.000Z",
          completedAt: "2026-09-08T12:00:00.010Z",
          latencyMilliseconds: 10,
          rawResponseReference: `${providerId}-request`,
        },
      };
    },
  };
}

function runInput(created, providers, overrides = {}) {
  return {
    manifestPath: created.manifestPath,
    providers,
    runId: "test-run",
    outputDirectory: created.outputDirectory,
    ...overrides,
  };
}

async function readRecords(path) {
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("STT benchmark manifest and planning", () => {
  it("loads a valid materialized manifest", async () => {
    const created = await fixture();
    const loaded = await loadSttBenchmarkManifest(created.manifestPath);

    expect(loaded.manifest.id).toBe("test-manifest");
    expect(loaded.manifest.samples).toHaveLength(2);
    expect(loaded.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects malformed manifests", async () => {
    const created = await fixture();
    await writeFile(created.manifestPath, '{"id":"incomplete"}\n');

    await expect(
      loadSttBenchmarkManifest(created.manifestPath),
    ).rejects.toThrow(/version/u);
  });

  it("plans deterministically by sample ID then provider ID", async () => {
    const created = await fixture();
    created.manifest.samples.reverse();
    const providers = [fakeProvider("z-provider"), fakeProvider("a-provider")];

    expect(
      createSttBenchmarkPlan(created.manifest, providers).map(
        ({ sample, provider }) =>
          `${sample.id}:${provider.configuration.providerId}`,
      ),
    ).toEqual([
      "sample-0:a-provider",
      "sample-0:z-provider",
      "sample-1:a-provider",
      "sample-1:z-provider",
    ]);
  });

  it("rejects an unknown provider filter", async () => {
    const created = await fixture();
    expect(() =>
      createSttBenchmarkPlan(created.manifest, [fakeProvider("known")], {
        providerId: "unknown",
      }),
    ).toThrow("Unknown provider: unknown");
  });

  it("creates stable identities and changes them with provider configuration", async () => {
    const created = await fixture(1);
    const loaded = await loadSttBenchmarkManifest(created.manifestPath);
    const normalization = {
      profileId: "yoruba-strict",
      profileVersion: "0.1",
      rawScoringPolicyVersion: "whitespace-tokenization-v1",
    };
    const base = {
      runId: "run-1",
      manifest: loaded.manifest,
      manifestContentSha256: loaded.contentSha256,
      normalization,
      sample: loaded.manifest.samples[0],
    };
    const first = createSttExecutionId({
      ...base,
      providerConfiguration: fakeProvider("provider-a").configuration,
    });
    const same = createSttExecutionId({
      ...base,
      providerConfiguration: fakeProvider("provider-a").configuration,
    });
    const changed = createSttExecutionId({
      ...base,
      providerConfiguration: fakeProvider("provider-a", {
        configurationOptions: { smartFormat: true },
      }).configuration,
    });

    expect(first).toBe(same);
    expect(changed).not.toBe(first);
  });
});

describe("STT benchmark execution and checkpointing", () => {
  it("rejects missing audio before provider execution", async () => {
    const created = await fixture(1);
    await rm(resolve(created.directory, "audio/sample-0.wav"));
    const provider = fakeProvider("provider-a");

    await expect(
      runSttBenchmarkBatch(runInput(created, [provider])),
    ).rejects.toThrow(/Audio file missing/u);
    expect(provider.calls).toHaveLength(0);
  });

  it("rejects a checksum mismatch before provider execution", async () => {
    const created = await fixture(1);
    await writeFile(
      resolve(created.directory, "audio/sample-0.wav"),
      new Uint8Array([99]),
    );
    const provider = fakeProvider("provider-a");

    await expect(
      runSttBenchmarkBatch(runInput(created, [provider])),
    ).rejects.toThrow(/checksum mismatch/u);
    expect(provider.calls).toHaveLength(0);
  });

  it("persists each raw result immediately with reproducibility identity", async () => {
    const created = await fixture(1);
    const provider = fakeProvider("provider-a");
    let checkpoint;
    const result = await runSttBenchmarkBatch(runInput(created, [provider]), {
      afterRecordPersisted: async (_record, paths) => {
        checkpoint = await readRecords(paths.resultsPath);
      },
    });

    expect(checkpoint).toHaveLength(1);
    expect(result.executedPairCount).toBe(1);
    const [record] = checkpoint;
    expect(record).toMatchObject({
      schemaVersion: "0.1",
      runId: "test-run",
      manifest: {
        id: "test-manifest",
        version: "0.1",
        sourceRevision: "revision-1",
      },
      sample: {
        id: "sample-0",
        referenceTranscript: "Reference 0",
      },
      providerModelMetadata: {
        identifier: "provider-a-reported-model",
        version: "2026-09",
      },
      normalization: {
        profileId: "yoruba-strict",
        profileVersion: "0.1",
        rawScoringPolicyVersion: "whitespace-tokenization-v1",
      },
      execution: { attemptCount: 1 },
      outcome: {
        status: "success",
        hypothesisTranscript: "RAW sample-0",
      },
    });
    expect(record.sample.audioContentSha256).toBe(
      created.manifest.samples[0].audio.contentSha256,
    );
  });

  it("resumes by skipping exact completed pairs", async () => {
    const created = await fixture();
    const provider = fakeProvider("provider-a");
    await runSttBenchmarkBatch(runInput(created, [provider]));
    const resumed = await runSttBenchmarkBatch(runInput(created, [provider]));

    expect(provider.calls).toHaveLength(2);
    expect(resumed.executedPairCount).toBe(0);
    expect(resumed.skippedPairCount).toBe(2);
    expect(await readRecords(resumed.resultsPath)).toHaveLength(2);
  });

  it("refuses to reuse a run after provider configuration changes", async () => {
    const created = await fixture(1);
    await runSttBenchmarkBatch(runInput(created, [fakeProvider("provider-a")]));
    const changed = fakeProvider("provider-a", {
      configurationOptions: { smartFormat: true },
    });

    await expect(
      runSttBenchmarkBatch(runInput(created, [changed])),
    ).rejects.toThrow(/does not match.*new run ID/u);
    expect(changed.calls).toHaveLength(0);
  });

  it("persists provider failures as terminal first-class records", async () => {
    const created = await fixture(1);
    const result = await runSttBenchmarkBatch(
      runInput(created, [fakeProvider("provider-a", { failure: true })]),
    );
    const [record] = await readRecords(result.resultsPath);

    expect(result.failureCount).toBe(1);
    expect(record.outcome).toEqual({
      status: "failure",
      failure: {
        stage: "transcription",
        code: "rate-limited",
        retryable: true,
        httpStatus: 429,
        retryAfterSeconds: 4,
      },
    });
  });

  it("recovers after interruption without losing or duplicating checkpoints", async () => {
    const created = await fixture();
    const firstProvider = fakeProvider("provider-a");
    await expect(
      runSttBenchmarkBatch(runInput(created, [firstProvider]), {
        afterRecordPersisted: async () => {
          throw new Error("simulated interruption");
        },
      }),
    ).rejects.toThrow("simulated interruption");

    const resumedProvider = fakeProvider("provider-a");
    const resumed = await runSttBenchmarkBatch(
      runInput(created, [resumedProvider]),
    );
    expect(firstProvider.calls).toHaveLength(1);
    expect(resumedProvider.calls).toHaveLength(1);
    expect(resumed.skippedPairCount).toBe(1);
    expect(resumed.executedPairCount).toBe(1);
    expect(await readRecords(resumed.resultsPath)).toHaveLength(2);
  });

  it("rejects duplicate persisted result identities", async () => {
    const created = await fixture(1);
    const provider = fakeProvider("provider-a");
    const result = await runSttBenchmarkBatch(runInput(created, [provider]));
    const text = await readFile(result.resultsPath, "utf8");
    await appendFile(result.resultsPath, text);

    await expect(
      runSttBenchmarkBatch(runInput(created, [provider])),
    ).rejects.toThrow(/Duplicate persisted result/u);
  });

  it("repairs only an incomplete trailing JSONL fragment on resume", async () => {
    const created = await fixture(1);
    const provider = fakeProvider("provider-a");
    const first = await runSttBenchmarkBatch(runInput(created, [provider]));
    await appendFile(first.resultsPath, '{"incomplete":');

    const resumed = await runSttBenchmarkBatch(runInput(created, [provider]));

    expect(resumed.skippedPairCount).toBe(1);
    expect(provider.calls).toHaveLength(1);
    expect(await readRecords(first.resultsPath)).toHaveLength(1);
  });

  it("dry-run verifies bytes but calls no provider and writes nothing", async () => {
    const created = await fixture();
    const provider = fakeProvider("provider-a");
    const result = await runSttBenchmarkBatch(
      runInput(created, [provider], { dryRun: true, runId: undefined }),
    );

    expect(result).toMatchObject({
      dryRun: true,
      plannedPairCount: 2,
      executedPairCount: 0,
    });
    expect(provider.calls).toHaveLength(0);
    await expect(stat(created.outputDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses secret-bearing provider configuration before persistence", async () => {
    const created = await fixture(1);
    const provider = fakeProvider("provider-a", {
      configurationOptions: { apiKey: "must-never-persist" },
    });

    await expect(
      runSttBenchmarkBatch(runInput(created, [provider])),
    ).rejects.toThrow(/Secret-bearing field/u);
    expect(provider.calls).toHaveLength(0);
    await expect(stat(created.outputDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("STT provider registry", () => {
  it("resolves all primary configurations for dry-run without retaining credentials", () => {
    const providers = createConfiguredSttProviders(
      ["intron-sahara", "openai", "deepgram"],
      {},
      { dryRun: true },
    );

    expect(
      providers.map(({ configuration }) => configuration.providerId),
    ).toEqual(["intron-sahara", "openai", "deepgram"]);
    expect(
      JSON.stringify(providers.map(({ configuration }) => configuration)),
    ).not.toContain("dry-run-credential-not-used");
  });

  it("rejects unknown providers without making a request", () => {
    expect(() =>
      createConfiguredSttProviders(["unknown"], {}, { dryRun: true }),
    ).toThrow("Unknown provider: unknown");
  });

  it.each([
    ["with pnpm's standalone separator", ["--"]],
    ["without a separator", []],
  ])("parses CLI options %s", (_description, prefix) => {
    const parsed = parseArguments([
      ...prefix,
      "--manifest",
      "fixtures/manifest.json",
      "--providers",
      "intron-sahara,openai,deepgram",
      "--run-id",
      "run-001",
      "--sample",
      "sample-7",
      "--provider",
      "deepgram",
    ]);

    expect(parsed).toMatchObject({
      providers: ["intron-sahara", "openai", "deepgram"],
      runId: "run-001",
      sampleId: "sample-7",
      providerId: "deepgram",
      dryRun: false,
    });
    expect(parsed.manifestPath).toBe(resolve("fixtures/manifest.json"));
  });
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
