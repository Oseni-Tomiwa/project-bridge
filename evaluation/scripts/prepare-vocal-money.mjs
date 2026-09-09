import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  VOCAL_MONEY_DATASET_CONFIG,
  VOCAL_MONEY_DATASET_ID,
  VOCAL_MONEY_DATASET_SPLIT,
  VOCAL_MONEY_EXPECTED_SAMPLE_COUNT,
  associateVocalMoneyAudio,
  createVocalMoneyFrozenManifest,
  mapVocalMoneyRow,
  projectBridgeVocalMoneySelectionCmiBucket,
  selectVocalMoneyRows,
  validateVocalMoneySourceRows,
} from "@project-bridge/benchmark";
import {
  fetchVocalMoneyAudioAsset,
  fetchVocalMoneyRowsPage,
  resolveVocalMoneyRevision,
} from "./vocal-money-dataset-viewer.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const pageSize = 100;

export async function prepareVocalMoney(options) {
  const revision = await resolveVocalMoneyRevision("main");
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== revision
  ) {
    throw new Error(
      `Current dataset revision ${revision} does not match --expected-revision.`,
    );
  }
  const rows = await fetchSourceRows();
  const revisionAfterCatalog = await resolveVocalMoneyRevision("main");
  if (revisionAfterCatalog !== revision) {
    throw new Error(
      "The dataset revision changed during catalog retrieval; rerun preparation.",
    );
  }
  if (rows.length !== VOCAL_MONEY_EXPECTED_SAMPLE_COUNT) {
    throw new Error(
      `Expected ${VOCAL_MONEY_EXPECTED_SAMPLE_COUNT} public rows but received ${rows.length}; inspect source drift before preparation.`,
    );
  }
  const issues = validateVocalMoneySourceRows(rows);
  if (issues.length > 0) {
    throw new Error(
      `Dataset rows failed validation: ${issues
        .map(({ sampleId, code }) => `${sampleId}:${code}`)
        .join(", ")}`,
    );
  }
  const selection = options.all
    ? { mode: "full-dataset", requestedSampleCount: rows.length }
    : {
        mode: "development-subset",
        requestedSampleCount: options.count,
        seed: options.seed,
      };
  const selected = selectVocalMoneyRows(rows, selection);
  const outputDirectory =
    options.outputDirectory ??
    resolve(
      projectRoot,
      "evaluation/data/vocal-money",
      revision,
      options.all
        ? `all-${rows.length}`
        : `count-${options.count}-seed-${safePathPart(options.seed)}`,
    );
  await assertOutputDoesNotExist(outputDirectory);
  const audioDirectory = resolve(outputDirectory, "audio");
  await mkdir(audioDirectory, { recursive: true });

  const samples = [];
  for (const sourceRow of selected) {
    const mapped = mapVocalMoneyRow(sourceRow, revision);
    const outputFile = resolve(audioDirectory, `${mapped.id}.wav`);
    const response = await fetchVocalMoneyAudioAsset(sourceRow.audioUrl);
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
    samples.push(
      associateVocalMoneyAudio(mapped, {
        relativePath: relative(outputDirectory, outputFile),
        contentSha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
      }),
    );
  }

  const manifest = createVocalMoneyFrozenManifest({
    revision,
    preparedAt: new Date().toISOString(),
    selection,
    samples,
  });
  const manifestPath = resolve(outputDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });
  return { audioDirectory, manifest, manifestPath };
}

export function parseArguments(arguments_) {
  const argumentsWithoutSeparator = arguments_.filter(
    (argument) => argument !== "--",
  );
  const values = new Map();
  let all = false;
  const allowed = new Set([
    "--all",
    "--count",
    "--seed",
    "--expected-revision",
    "--output-dir",
  ]);
  for (let index = 0; index < argumentsWithoutSeparator.length; index += 1) {
    const argument = argumentsWithoutSeparator[index];
    if (!argument?.startsWith("--") || !allowed.has(argument)) {
      throw new Error(`Unexpected argument: ${argument ?? "<missing>"}.`);
    }
    if (argument === "--all") {
      if (all) throw new Error("Duplicate argument: --all.");
      all = true;
      continue;
    }
    if (values.has(argument))
      throw new Error(`Duplicate argument: ${argument}.`);
    const value = argumentsWithoutSeparator[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.`);
    }
    values.set(argument, value);
    index += 1;
  }
  if (all && (values.has("--count") || values.has("--seed"))) {
    throw new Error("--all cannot be combined with --count or --seed.");
  }
  const countText = values.get("--count");
  const seed = values.get("--seed")?.trim();
  if (!all && (countText === undefined || seed === undefined || seed === "")) {
    throw new Error("Use --all or --count <number> --seed <stable-seed>.");
  }
  const count = all ? VOCAL_MONEY_EXPECTED_SAMPLE_COUNT : Number(countText);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("--count must be a positive integer.");
  }
  const outputDirectory = values.get("--output-dir");
  return {
    all,
    count,
    seed: all ? "" : seed,
    ...(values.get("--expected-revision") === undefined
      ? {}
      : { expectedRevision: values.get("--expected-revision") }),
    ...(outputDirectory === undefined
      ? {}
      : { outputDirectory: resolve(projectRoot, outputDirectory) }),
  };
}

export async function fetchSourceRows(fetchPage = fetchVocalMoneyRowsPage) {
  const rows = [];
  let total;
  for (
    let offset = 0;
    total === undefined || offset < total;
    offset += pageSize
  ) {
    const payload = await fetchPage(offset, pageSize);
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

export function parseViewerRow(value) {
  const rowIndex =
    isRecord(value) && Number.isSafeInteger(value.row_idx)
      ? value.row_idx
      : "<unknown>";
  if (!isRecord(value)) {
    throw new Error(
      "Vocal Money schema mismatch at row <unknown>; unexpected required field shapes: row wrapper.",
    );
  }
  if (!Number.isSafeInteger(value.row_idx)) {
    throw new Error(
      "Vocal Money schema mismatch at row <unknown>; unexpected required field shapes: row_idx.",
    );
  }
  if (!isRecord(value.row)) {
    throw new Error(
      `Vocal Money schema mismatch at row ${rowIndex}; unexpected required field shapes: row.`,
    );
  }
  if (
    Array.isArray(value.truncated_cells) &&
    value.truncated_cells.length > 0
  ) {
    throw new Error(
      `Vocal Money schema mismatch at row ${rowIndex}; truncated required fields: ${value.truncated_cells.join(", ")}.`,
    );
  }
  const row = value.row;
  const audio = row.audio;
  const requiredStrings = [
    "clip_id",
    "source_dataset",
    "source_file",
    "language_pair",
    "matrix_language",
    "domain",
    "country_accent",
    "device_type",
    "noise_conditions",
    "cmi_band",
    "transcription",
    "transcription_tagged",
  ];
  const requiredNumbers = [
    "duration_s",
    "sampling_rate",
    "code_mixing_index",
    "num_switch_points",
  ];
  const knownFields = new Set([
    "audio",
    ...requiredStrings,
    ...requiredNumbers,
  ]);
  const missingFields = [...knownFields].filter(
    (field) => !Object.hasOwn(row, field) || row[field] === null,
  );
  const invalidFields = [];
  if (
    !Array.isArray(audio) ||
    audio.length !== 1 ||
    !isRecord(audio[0]) ||
    typeof audio[0].src !== "string" ||
    typeof audio[0].type !== "string"
  ) {
    invalidFields.push("audio");
  }
  invalidFields.push(
    ...requiredStrings.filter(
      (field) =>
        Object.hasOwn(row, field) &&
        row[field] !== null &&
        typeof row[field] !== "string",
    ),
    ...requiredNumbers.filter(
      (field) =>
        Object.hasOwn(row, field) &&
        row[field] !== null &&
        typeof row[field] !== "number",
    ),
  );
  if (
    typeof row.sampling_rate === "number" &&
    !Number.isSafeInteger(row.sampling_rate)
  ) {
    invalidFields.push("sampling_rate");
  }
  if (
    typeof row.num_switch_points === "number" &&
    !Number.isSafeInteger(row.num_switch_points)
  ) {
    invalidFields.push("num_switch_points");
  }
  if (
    typeof row.code_mixing_index === "number" &&
    (!Number.isFinite(row.code_mixing_index) ||
      row.code_mixing_index < 0 ||
      row.code_mixing_index > 100)
  ) {
    invalidFields.push("code_mixing_index");
  }
  const unexpectedFields = Object.keys(row).filter(
    (field) => !knownFields.has(field) && !field.startsWith("hyp_"),
  );
  if (
    missingFields.length > 0 ||
    invalidFields.length > 0 ||
    unexpectedFields.length > 0
  ) {
    const details = [
      ...(missingFields.length === 0
        ? []
        : [`missing required fields: ${missingFields.join(", ")}`]),
      ...(invalidFields.length === 0
        ? []
        : [
            `unexpected required field shapes: ${[
              ...new Set(invalidFields),
            ].join(", ")}`,
          ]),
      ...(unexpectedFields.length === 0
        ? []
        : [`unexpected fields: ${unexpectedFields.join(", ")}`]),
    ];
    throw new Error(
      `Vocal Money schema mismatch at row ${rowIndex}; ${details.join("; ")}.`,
    );
  }
  const audioItem = audio[0];
  // Published hyp_* columns are intentionally not mapped. They are source
  // metadata, never Project Bridge benchmark results.
  return {
    rowIndex: value.row_idx,
    audioUrl: audioItem.src,
    audioMediaType: audioItem.type,
    clipId: row.clip_id,
    sourceDataset: row.source_dataset,
    sourceFile: row.source_file,
    languagePair: row.language_pair,
    matrixLanguage: row.matrix_language,
    domain: row.domain,
    countryAccent: row.country_accent,
    deviceType: row.device_type,
    noiseConditions: row.noise_conditions,
    durationSeconds: row.duration_s,
    samplingRateHz: row.sampling_rate,
    codeMixingIndex: row.code_mixing_index,
    sourceCmiBand: row.cmi_band,
    selectionCmiBucket: projectBridgeVocalMoneySelectionCmiBucket(
      row.code_mixing_index,
    ),
    numSwitchPoints: row.num_switch_points,
    transcription: row.transcription,
    transcriptionTagged: row.transcription_tagged,
  };
}

async function main() {
  const { audioDirectory, manifest, manifestPath } = await prepareVocalMoney(
    parseArguments(process.argv.slice(2)),
  );
  console.log(`dataset: ${VOCAL_MONEY_DATASET_ID}`);
  console.log(`config: ${VOCAL_MONEY_DATASET_CONFIG}`);
  console.log(`split: ${VOCAL_MONEY_DATASET_SPLIT}`);
  console.log(`revision: ${manifest.source.revision}`);
  console.log(`requested_samples: ${manifest.selection.requestedSampleCount}`);
  console.log(`actual_samples: ${manifest.samples.length}`);
  console.log(
    `source_cmi_band_counts: ${JSON.stringify(manifest.selection.sourceCmiBandCounts)}`,
  );
  console.log(
    `selection_cmi_bucket_counts: ${JSON.stringify(manifest.selection.selectionCmiBucketCounts)}`,
  );
  console.log(
    `total_duration_seconds: ${manifest.samples
      .reduce((total, sample) => total + sample.durationSeconds, 0)
      .toFixed(3)}`,
  );
  console.log(`manifest: ${manifestPath}`);
  console.log(`audio_directory: ${audioDirectory}`);
  console.log("failures: 0");
}

async function assertOutputDoesNotExist(path) {
  try {
    await stat(path);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Output directory already exists: ${path}.`);
}

function safePathPart(value) {
  const part = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (part === "")
    throw new Error("--seed must contain a path-safe character.");
  return part;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    console.error("status: preparation-failed");
    console.error(
      `message: ${error instanceof Error ? error.message : "Unknown preparation failure."}`,
    );
    process.exitCode = 1;
  }
}
