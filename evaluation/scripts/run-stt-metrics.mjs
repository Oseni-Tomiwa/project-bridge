import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadAndAggregateSttMetrics } from "./stt-metric-aggregation.mjs";

const evaluationRoot = fileURLToPath(new URL("../", import.meta.url));

export function parseArguments(arguments_) {
  const args = arguments_.filter((argument) => argument !== "--");
  const values = new Map();
  const allowed = new Set(["--run-dir", "--review-file", "--manifest"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.has(argument) || values.has(argument))
      throw new Error(`Unknown or duplicate argument: ${argument}.`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`Missing value for ${argument}.`);
    values.set(argument, value);
    index += 1;
  }
  if (!values.has("--run-dir") || !values.has("--review-file"))
    throw new Error(
      "Usage: --run-dir <path> --review-file <path> [--manifest <path>]",
    );
  return {
    runDirectory: resolve(evaluationRoot, values.get("--run-dir")),
    reviewPath: resolve(evaluationRoot, values.get("--review-file")),
    dataDirectory: resolve(evaluationRoot, "data"),
    ...(values.has("--manifest")
      ? { manifestPath: resolve(evaluationRoot, values.get("--manifest")) }
      : {}),
  };
}

export async function generateMetricOutputs(options, dependencies = {}) {
  const metrics = await loadAndAggregateSttMetrics(options, dependencies);
  const outputs = {
    metrics: resolve(options.runDirectory, "metrics.json"),
    summaryCsv: resolve(options.runDirectory, "summary.csv"),
    summaryMarkdown: resolve(options.runDirectory, "summary.md"),
    perSampleCsv: resolve(options.runDirectory, "per-sample.csv"),
  };
  await Promise.all([
    writeAtomic(outputs.metrics, `${JSON.stringify(metrics, null, 2)}\n`),
    writeAtomic(outputs.summaryCsv, renderSummaryCsv(metrics)),
    writeAtomic(outputs.summaryMarkdown, renderSummaryMarkdown(metrics)),
    writeAtomic(outputs.perSampleCsv, renderPerSampleCsv(metrics)),
  ]);
  return { metrics, outputs };
}

export function renderSummaryCsv(metrics) {
  const set = findSet(metrics, "scored-development");
  const headings = [
    "provider",
    "scored_sample_count",
    "raw_wer",
    "raw_cer",
    "strict_normalized_wer",
    "strict_normalized_cer",
    "diacritic_insensitive_wer",
    "diacritic_insensitive_cer",
    "median_latency_ms",
    "p95_latency_ms",
    "held_sample_count",
    "excluded_sample_count",
  ];
  return `${[
    headings,
    ...set.providers.map((provider) => summaryRow(provider, set)),
  ]
    .map(csvRow)
    .join("\n")}\n`;
}

export function renderSummaryMarkdown(metrics) {
  const set = findSet(metrics, "scored-development");
  const lines = [
    "# Vocal Money development STT summary",
    "",
    `Run: \`${metrics.identity.runId}\``,
    "",
    "Secondary/development benchmark only. This is not a final challenge ranking; AfriSwitch remains the official primary benchmark.",
    "",
    "| Provider | Scored | Raw WER | Raw CER | Strict WER | Strict CER | Median latency (ms) | p95 latency (ms) | Held | Excluded |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...set.providers.map((provider) =>
      [
        provider.providerId,
        provider.sampleCount,
        decimal(provider.metrics.rawSurface.wer.wer),
        decimal(provider.metrics.rawSurface.cer.cer),
        decimal(provider.metrics.strictNormalized.wer.wer),
        decimal(provider.metrics.strictNormalized.cer.cer),
        decimal(provider.latency.medianMilliseconds, 2),
        decimal(provider.latency.p95Milliseconds, 2),
        set.heldSampleCount,
        set.excludedSampleCount,
      ]
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    ),
    "",
    `Generated: ${metrics.generatedAt}`,
    "",
  ];
  return lines.join("\n");
}

export function renderPerSampleCsv(metrics) {
  const headings = [
    "sample_id",
    "provider",
    "provider_configuration_id",
    "selection_cmi_bucket",
    "source_cmi_band",
    "review_state",
    "scoring_classification",
    "scoring_disposition",
    "raw_wer",
    "raw_cer",
    "strict_normalized_wer",
    "strict_normalized_cer",
    "diacritic_insensitive_wer",
    "diacritic_insensitive_cer",
    "latency_ms",
  ];
  const rows = metrics.perSample.map((row) => [
    row.sampleId,
    row.providerId,
    row.providerConfigurationId,
    row.selectionCmiBucket,
    row.sourceCmiBand,
    row.quality.reviewState,
    row.quality.scoringClassification,
    row.quality.scoringDisposition,
    row.metrics.rawSurface.wer.wer,
    row.metrics.rawSurface.cer.cer,
    row.metrics.strictNormalized.wer.wer,
    row.metrics.strictNormalized.cer.cer,
    row.metrics.diacriticInsensitiveAnalysis.wer.wer,
    row.metrics.diacriticInsensitiveAnalysis.cer.cer,
    row.latencyMilliseconds,
  ]);
  return `${[headings, ...rows].map(csvRow).join("\n")}\n`;
}

function summaryRow(provider, set) {
  return [
    provider.providerId,
    provider.sampleCount,
    provider.metrics.rawSurface.wer.wer,
    provider.metrics.rawSurface.cer.cer,
    provider.metrics.strictNormalized.wer.wer,
    provider.metrics.strictNormalized.cer.cer,
    provider.metrics.diacriticInsensitiveAnalysis.wer.wer,
    provider.metrics.diacriticInsensitiveAnalysis.cer.cer,
    provider.latency.medianMilliseconds,
    provider.latency.p95Milliseconds,
    set.heldSampleCount,
    set.excludedSampleCount,
  ];
}

function findSet(metrics, id) {
  const set = metrics.scoringSets.find((candidate) => candidate.id === id);
  if (set === undefined) throw new Error(`Metrics set ${id} is missing.`);
  return set;
}

function csvRow(values) {
  return values
    .map((value) => {
      const text = value === null ? "" : String(value);
      return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}

function decimal(value, digits = 4) {
  return typeof value === "number" ? value.toFixed(digits) : "n/a";
}

async function writeAtomic(path, content) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

async function main() {
  const { metrics, outputs } = await generateMetricOutputs(
    parseArguments(process.argv.slice(2)),
  );
  const scored = findSet(metrics, "scored-development");
  console.log(`run_id: ${metrics.identity.runId}`);
  console.log(`successful_results: ${metrics.resultCounts.successful}`);
  console.log(`scored_samples: ${scored.sampleCount}`);
  console.log(`held_samples: ${scored.heldSampleCount}`);
  console.log(`excluded_samples: ${scored.excludedSampleCount}`);
  console.log(`metrics: ${outputs.metrics}`);
  console.log(`summary_csv: ${outputs.summaryCsv}`);
  console.log(`summary_markdown: ${outputs.summaryMarkdown}`);
  console.log(`per_sample_csv: ${outputs.perSampleCsv}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    console.error("status: metric-aggregation-failed");
    console.error(
      `message: ${error instanceof Error ? error.message : "Unknown metric aggregation failure."}`,
    );
    process.exitCode = 1;
  }
}
