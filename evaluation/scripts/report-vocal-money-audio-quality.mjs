import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  audioQualityScoringDisposition,
  validateAudioQualityReviewManifest,
} from "@project-bridge/benchmark";
import { diagnosePcm16Wav } from "./wav-audio-quality.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultReviewPath = resolve(
  projectRoot,
  "evaluation/reviews/vocal-money-audio-quality.v0.1.json",
);

export async function inspectVocalMoneyAudioQuality(options) {
  const manifestPath =
    options.manifestPath ?? (await discoverSingleVocalMoneyManifest());
  const manifest = await readJson(manifestPath, "materialized manifest");
  const reviewManifest = await readJson(
    options.reviewPath ?? defaultReviewPath,
    "quality review manifest",
  );
  const reviewIssues = validateAudioQualityReviewManifest(reviewManifest);
  if (reviewIssues.length > 0)
    throw new Error(
      `Invalid quality review manifest: ${reviewIssues.join(" ")}`,
    );
  validateReviewIdentity(manifest, reviewManifest);

  const reviewBySample = new Map(
    reviewManifest.reviews.map((review) => [review.sampleId, review]),
  );
  const findings = [];
  for (const sample of manifest.samples) {
    const audioPath = resolveManifestAudioPath(
      manifestPath,
      sample.audio.relativePath,
    );
    const bytes = await readFile(audioPath);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== sample.audio.contentSha256)
      throw new Error(`Audio checksum mismatch for ${sample.id}.`);
    const review = reviewBySample.get(sample.id);
    if (
      review !== undefined &&
      review.audioContentSha256 !== sample.audio.contentSha256
    )
      throw new Error(`Quality review checksum mismatch for ${sample.id}.`);
    const diagnostics = diagnosePcm16Wav(bytes, sample.durationSeconds);
    const scoringDisposition =
      review === undefined
        ? "unreviewed"
        : audioQualityScoringDisposition(review.state);
    if (
      diagnostics.automatedAssessment !== "pass" ||
      scoringDisposition === "exclude" ||
      scoringDisposition === "hold-for-review"
    ) {
      findings.push({
        sampleId: sample.id,
        manifestDurationSeconds: sample.durationSeconds,
        scoringDisposition,
        reviewState: review?.state ?? "unreviewed",
        reviewReasons: review?.reasons ?? [],
        diagnostics,
      });
    }
  }
  return {
    manifestPath,
    reviewPath: options.reviewPath ?? defaultReviewPath,
    sampleCount: manifest.samples.length,
    findings,
  };
}

export function parseArguments(arguments_) {
  const args = arguments_.filter((argument) => argument !== "--");
  const values = new Map();
  const allowed = new Set(["--manifest", "--review"]);
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
  return {
    ...(values.has("--manifest")
      ? { manifestPath: resolve(projectRoot, values.get("--manifest")) }
      : {}),
    ...(values.has("--review")
      ? { reviewPath: resolve(projectRoot, values.get("--review")) }
      : {}),
  };
}

async function main() {
  const report = await inspectVocalMoneyAudioQuality(
    parseArguments(process.argv.slice(2)),
  );
  console.log(`manifest: ${report.manifestPath}`);
  console.log(`samples_inspected: ${report.sampleCount}`);
  console.log(`suspicious_samples: ${report.findings.length}`);
  for (const finding of report.findings) {
    console.log(`sample: ${finding.sampleId}`);
    console.log(`  scoring_disposition: ${finding.scoringDisposition}`);
    console.log(`  review_state: ${finding.reviewState}`);
    console.log(
      `  reasons: ${
        [
          ...new Set([
            ...finding.reviewReasons,
            ...finding.diagnostics.suspiciousReasons,
          ]),
        ].join(",") || "none"
      }`,
    );
    console.log(`  readable_wav: ${finding.diagnostics.readableWav}`);
    console.log(
      `  channels: ${format(finding.diagnostics.format?.channels ?? null)}`,
    );
    console.log(
      `  sample_rate_hz: ${format(finding.diagnostics.format?.sampleRateHz ?? null)}`,
    );
    console.log(
      `  bits_per_sample: ${format(finding.diagnostics.format?.bitsPerSample ?? null)}`,
    );
    console.log(
      `  manifest_duration_seconds: ${format(finding.manifestDurationSeconds)}`,
    );
    console.log(
      `  wav_duration_seconds: ${format(finding.diagnostics.durationSeconds)}`,
    );
    console.log(
      `  non_zero_samples: ${format(finding.diagnostics.nonZeroSampleCount)}`,
    );
    console.log(
      `  peak_amplitude: ${format(finding.diagnostics.peakAmplitude)}`,
    );
    console.log(`  rms_amplitude: ${format(finding.diagnostics.rmsAmplitude)}`);
    console.log(
      `  clipping_percentage: ${format(finding.diagnostics.clippingPercentage)}`,
    );
  }
}

async function discoverSingleVocalMoneyManifest() {
  const root = resolve(projectRoot, "evaluation/data/vocal-money");
  const candidates = await findNamedFiles(root, "manifest.json");
  const matches = [];
  for (const path of candidates) {
    const value = await readJson(path, "materialized manifest");
    if (value.id === "vocal-money-codeswitch-dev-v0.1") matches.push(path);
  }
  if (matches.length !== 1)
    throw new Error(
      `Expected one materialized Vocal Money dev manifest but found ${matches.length}; pass --manifest explicitly.`,
    );
  return matches[0];
}

async function findNamedFiles(directory, fileName) {
  const results = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory())
      results.push(...(await findNamedFiles(path, fileName)));
    else if (entry.isFile() && entry.name === fileName) results.push(path);
  }
  return results.sort();
}

function validateReviewIdentity(manifest, reviewManifest) {
  if (
    manifest.id !== reviewManifest.datasetManifest.id ||
    manifest.version !== reviewManifest.datasetManifest.version ||
    manifest.source?.revision !== reviewManifest.datasetManifest.sourceRevision
  )
    throw new Error(
      "Quality review does not match the materialized manifest identity.",
    );
  const samples = new Map(
    manifest.samples.map((sample) => [sample.id, sample]),
  );
  for (const review of reviewManifest.reviews) {
    const sample = samples.get(review.sampleId);
    if (sample === undefined)
      throw new Error(
        `Quality review references unknown sample ${review.sampleId}.`,
      );
    if (sample.audio.contentSha256 !== review.audioContentSha256)
      throw new Error(
        `Quality review checksum mismatch for ${review.sampleId}.`,
      );
  }
}

function resolveManifestAudioPath(manifestPath, relativePath) {
  if (typeof relativePath !== "string" || isAbsolute(relativePath))
    throw new Error("Manifest audio path must be relative.");
  const root = dirname(resolve(manifestPath));
  const path = resolve(root, relativePath);
  const relation = relative(root, path);
  if (relation === ".." || relation.startsWith(`..${sep}`))
    throw new Error("Manifest audio path escapes its directory.");
  return path;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`Could not read ${label}: ${path}.`);
  }
}

function format(value) {
  return typeof value === "number" ? String(Number(value.toFixed(8))) : "n/a";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    console.error("status: quality-inspection-failed");
    console.error(
      `message: ${error instanceof Error ? error.message : "Unknown quality inspection failure."}`,
    );
    process.exitCode = 1;
  }
}
