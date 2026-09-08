import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runSttBenchmarkBatch } from "./stt-benchmark-runner.mjs";
import { createConfiguredSttProviders } from "./stt-provider-registry.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const providers = createConfiguredSttProviders(
    options.providers,
    process.env,
    { dryRun: options.dryRun },
  );
  const outputDirectory =
    options.outputDirectory ??
    (options.runId === undefined
      ? resolve(projectRoot, "evaluation/results/stt/dry-run-unused")
      : resolve(projectRoot, "evaluation/results/stt", options.runId));

  const result = await runSttBenchmarkBatch({
    manifestPath: options.manifestPath,
    providers,
    dryRun: options.dryRun,
    outputDirectory,
    ...(options.runId === undefined ? {} : { runId: options.runId }),
    ...(options.sampleId === undefined ? {} : { sampleId: options.sampleId }),
    ...(options.providerId === undefined
      ? {}
      : { providerId: options.providerId }),
  });

  console.log(`status: ${result.dryRun ? "dry-run-valid" : "completed"}`);
  if (options.runId !== undefined) console.log(`run_id: ${options.runId}`);
  console.log(`samples: ${result.sampleCount}`);
  console.log(`providers: ${result.providerCount}`);
  console.log(`planned_pairs: ${result.plannedPairCount}`);
  console.log(`executed_pairs: ${result.executedPairCount}`);
  console.log(`skipped_pairs: ${result.skippedPairCount}`);
  console.log(`failure_records: ${result.failureCount}`);
  if (!result.dryRun) {
    console.log(`run_metadata: ${result.runMetadataPath}`);
    console.log(`results: ${result.resultsPath}`);
  }
}

export function parseArguments(arguments_) {
  const args = arguments_.filter((argument) => argument !== "--");
  const values = new Map();
  let dryRun = false;
  const valueOptions = new Set([
    "--manifest",
    "--providers",
    "--run-id",
    "--output-dir",
    "--sample",
    "--provider",
    "--concurrency",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      if (dryRun) throw new Error("Duplicate argument: --dry-run.");
      dryRun = true;
      continue;
    }
    if (!valueOptions.has(argument) || values.has(argument)) {
      throw new Error(`Unknown or duplicate argument: ${argument}.`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const manifest = values.get("--manifest")?.trim();
  const providerText = values.get("--providers")?.trim();
  if (
    manifest === undefined ||
    manifest === "" ||
    providerText === undefined ||
    providerText === ""
  ) {
    throw new Error(
      "Usage: --manifest <path> --providers <id,id> [--run-id <id>] [--sample <id>] [--provider <id>] [--dry-run]",
    );
  }
  const providers = providerText
    .split(",")
    .map((provider) => provider.trim())
    .filter((provider) => provider !== "");
  if (providers.length === 0)
    throw new Error("At least one provider is required.");

  const runId = values.get("--run-id")?.trim();
  if (!dryRun && (runId === undefined || runId === "")) {
    throw new Error("--run-id is required unless --dry-run is used.");
  }
  if (runId !== undefined && !/^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(runId)) {
    throw new Error("--run-id must be a path-safe identifier.");
  }
  if ((values.get("--concurrency") ?? "1") !== "1") {
    throw new Error("The v0.1 runner supports only --concurrency 1.");
  }

  return {
    manifestPath: resolve(process.cwd(), manifest),
    providers,
    dryRun,
    ...(runId === undefined || runId === "" ? {} : { runId }),
    ...(values.get("--output-dir") === undefined
      ? {}
      : {
          outputDirectory: resolve(process.cwd(), values.get("--output-dir")),
        }),
    ...(values.get("--sample") === undefined
      ? {}
      : { sampleId: values.get("--sample") }),
    ...(values.get("--provider") === undefined
      ? {}
      : { providerId: values.get("--provider") }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error("status: benchmark-failed");
    console.error(
      `message: ${error instanceof Error ? error.message : "Unknown benchmark failure."}`,
    );
    process.exitCode = 1;
  }
}
