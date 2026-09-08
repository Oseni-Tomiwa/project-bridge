import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AFRISWITCH_DATASET_ID,
  AFRISWITCH_TEST_SPLIT,
  AFRISWITCH_YORUBA_CONFIG,
  associateAfriSwitchAudio,
  createAfriSwitchFrozenManifest,
  mapAfriSwitchYorubaRow,
  selectAfriSwitchSubset,
  validateAfriSwitchSourceRows,
} from "@project-bridge/benchmark";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const viewerBaseUrl = "https://datasets-server.huggingface.co";
const hubBaseUrl = "https://huggingface.co";
const pageSize = 100;

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const token = process.env.HF_TOKEN?.trim();
  const revision = await resolveDatasetRevision("main", token);
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== revision
  ) {
    throw new Error(
      `Current dataset revision ${revision} does not match --expected-revision.`,
    );
  }
  const rows = await fetchSourceRows(token);
  const revisionAfterCatalog = await resolveDatasetRevision("main", token);
  if (revisionAfterCatalog !== revision) {
    throw new Error(
      "The dataset revision changed while row metadata was being fetched; rerun preparation against a fixed revision.",
    );
  }
  const issues = validateAfriSwitchSourceRows(rows);
  if (issues.length > 0) {
    throw new Error(
      `Dataset viewer rows failed validation: ${issues
        .map(({ code, sampleId }) => `${sampleId}:${code}`)
        .join(", ")}`,
    );
  }

  const selection = {
    seed: options.seed,
    requestedSampleCount: options.count,
  };
  const selected = selectAfriSwitchSubset(rows, selection);
  const outputDirectory =
    options.outputDirectory ??
    resolve(
      projectRoot,
      "evaluation/data/afriswitch/yoruba",
      revision,
      `count-${options.count}-seed-${safePathPart(options.seed)}`,
    );
  await assertOutputDoesNotExist(outputDirectory);
  const audioDirectory = resolve(outputDirectory, "audio");
  await mkdir(audioDirectory, { recursive: true });

  const samples = [];
  for (const sourceRow of selected) {
    const mapped = mapAfriSwitchYorubaRow(sourceRow, revision);
    const extension = safeAudioExtension(sourceRow.filename);
    const outputFile = resolve(audioDirectory, `${mapped.id}${extension}`);
    // The rows API returns a signed asset URL. Do not forward the Hub token to
    // that potentially different host.
    const response = await fetch(sourceRow.audioUrl);
    if (!response.ok) {
      throw new Error(
        `Audio download failed for source row ${sourceRow.rowIndex}: HTTP ${response.status}.`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error(`Source row ${sourceRow.rowIndex} returned empty audio.`);
    }
    await writeFile(outputFile, bytes, { flag: "wx" });
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    samples.push(
      associateAfriSwitchAudio(mapped, {
        relativePath: relative(outputDirectory, outputFile),
        contentSha256,
        byteLength: bytes.byteLength,
        mediaType:
          response.headers.get("content-type")?.split(";", 1)[0]?.trim() ||
          mediaTypeForExtension(extension),
      }),
    );
  }

  const manifest = createAfriSwitchFrozenManifest({
    revision,
    preparedAt: new Date().toISOString(),
    selection,
    samples,
  });
  const manifestPath = resolve(outputDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });

  console.log(`dataset: ${AFRISWITCH_DATASET_ID}`);
  console.log(`config: ${AFRISWITCH_YORUBA_CONFIG}`);
  console.log(`split: ${AFRISWITCH_TEST_SPLIT}`);
  console.log(`revision: ${revision}`);
  console.log(`selected_samples: ${samples.length}`);
  console.log(`manifest: ${manifestPath}`);
}

function parseArguments(arguments_) {
  const values = new Map();
  const allowed = new Set([
    "--count",
    "--seed",
    "--expected-revision",
    "--output-dir",
  ]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument ?? "<missing>"}.`);
    }
    if (!allowed.has(argument) || values.has(argument)) {
      throw new Error(`Unknown or duplicate argument: ${argument}.`);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const countText = values.get("--count");
  const seed = values.get("--seed")?.trim();
  if (countText === undefined || seed === undefined || seed === "") {
    throw new Error(
      "Usage: --count <explicit-number> --seed <stable-seed> [--expected-revision <commit-sha>] [--output-dir <path>]",
    );
  }
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("--count must be a positive integer.");
  }
  if (count < 50 || count > 100) {
    console.warn(
      "warning: the planned first challenge slice is 50–100 clips; the explicit count is outside that range.",
    );
  }
  const outputDirectory = values.get("--output-dir");
  return {
    count,
    seed,
    ...(values.get("--expected-revision") === undefined
      ? {}
      : { expectedRevision: values.get("--expected-revision") }),
    ...(outputDirectory === undefined
      ? {}
      : { outputDirectory: resolve(projectRoot, outputDirectory) }),
  };
}

async function resolveDatasetRevision(requestedRevision, token) {
  const url = new URL(
    `/api/datasets/${AFRISWITCH_DATASET_ID}/revision/${encodeURIComponent(requestedRevision)}`,
    hubBaseUrl,
  );
  const value = await fetchJson(url, token);
  if (!isRecord(value) || typeof value.sha !== "string" || value.sha === "") {
    throw new Error("Hugging Face did not return a resolved dataset revision.");
  }
  return value.sha;
}

async function fetchSourceRows(token) {
  const rows = [];
  let total = undefined;
  for (
    let offset = 0;
    total === undefined || offset < total;
    offset += pageSize
  ) {
    const url = new URL("/rows", viewerBaseUrl);
    url.searchParams.set("dataset", AFRISWITCH_DATASET_ID);
    url.searchParams.set("config", AFRISWITCH_YORUBA_CONFIG);
    url.searchParams.set("split", AFRISWITCH_TEST_SPLIT);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", String(pageSize));
    const payload = await fetchJson(url, token);
    if (
      !isRecord(payload) ||
      !Array.isArray(payload.rows) ||
      typeof payload.num_rows_total !== "number" ||
      payload.partial === true
    ) {
      throw new Error("Unexpected or partial Hugging Face rows response.");
    }
    total = payload.num_rows_total;
    for (const item of payload.rows) rows.push(parseViewerRow(item));
  }
  return rows;
}

function parseViewerRow(value) {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.row_idx) ||
    !isRecord(value.row) ||
    (Array.isArray(value.truncated_cells) && value.truncated_cells.length > 0)
  ) {
    throw new Error("Unexpected or truncated Hugging Face dataset row.");
  }
  const row = value.row;
  const audio = row.audio;
  if (
    !isRecord(audio) ||
    typeof audio.src !== "string" ||
    typeof row.filename !== "string" ||
    typeof row.transcription !== "string" ||
    typeof row.transcription_tagged !== "string" ||
    typeof row.language !== "string" ||
    typeof row.duration !== "number" ||
    typeof row.cmi !== "number" ||
    !Number.isSafeInteger(row.num_switch_points)
  ) {
    throw new Error(`Unexpected AfriSwitch schema at row ${value.row_idx}.`);
  }
  return {
    rowIndex: value.row_idx,
    filename: row.filename,
    audioUrl: audio.src,
    transcription: row.transcription,
    transcriptionTagged: row.transcription_tagged,
    language: row.language,
    durationSeconds: row.duration,
    cmi: row.cmi,
    numSwitchPoints: row.num_switch_points,
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: authorizationHeaders(token) });
  if (!response.ok) {
    throw new Error(
      `Hugging Face request failed with HTTP ${response.status}.`,
    );
  }
  return await response.json();
}

function authorizationHeaders(token) {
  return token === undefined || token === ""
    ? {}
    : { Authorization: `Bearer ${token}` };
}

async function assertOutputDoesNotExist(path) {
  try {
    await stat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Output directory already exists: ${path}.`);
}

function safeAudioExtension(filename) {
  const extension = extname(filename).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/u.test(extension)) {
    throw new Error(`Unsupported source filename extension: ${filename}.`);
  }
  return extension;
}

function mediaTypeForExtension(extension) {
  switch (extension) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".flac":
      return "audio/flac";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

function safePathPart(value) {
  const result = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (result === "")
    throw new Error("--seed must contain a path-safe character.");
  return result;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}

try {
  await main();
} catch (error) {
  console.error("status: preparation-failed");
  console.error(
    `message: ${error instanceof Error ? error.message : "Unknown preparation failure."}`,
  );
  process.exitCode = 1;
}
