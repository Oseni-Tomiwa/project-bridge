import {
  VOCAL_MONEY_DATASET_CONFIG,
  VOCAL_MONEY_DATASET_ID,
  VOCAL_MONEY_DATASET_SPLIT,
} from "@project-bridge/benchmark";

export const VOCAL_MONEY_DATASET_VIEWER_BASE_URL =
  "https://datasets-server.huggingface.co";
export const VOCAL_MONEY_HUB_BASE_URL = "https://huggingface.co";

export function buildVocalMoneyRowsUrl(offset, length) {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Dataset Viewer row offset must be non-negative.");
  }
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new Error("Dataset Viewer row length must be positive.");
  }
  const url = new URL("/rows", VOCAL_MONEY_DATASET_VIEWER_BASE_URL);
  url.searchParams.set("dataset", VOCAL_MONEY_DATASET_ID);
  url.searchParams.set("config", VOCAL_MONEY_DATASET_CONFIG);
  url.searchParams.set("split", VOCAL_MONEY_DATASET_SPLIT);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(length));
  return url;
}

export function buildVocalMoneyRevisionUrl(requestedRevision) {
  const revision = requestedRevision.trim();
  if (revision === "") throw new Error("A dataset revision is required.");
  return new URL(
    `/api/datasets/${VOCAL_MONEY_DATASET_ID}/revision/${encodeURIComponent(revision)}`,
    VOCAL_MONEY_HUB_BASE_URL,
  );
}

export async function resolveVocalMoneyRevision(
  requestedRevision = "main",
  fetchImplementation = globalThis.fetch,
) {
  const url = buildVocalMoneyRevisionUrl(requestedRevision);
  const value = await fetchPublicJson(
    url,
    "Hugging Face Hub dataset-revision request",
    fetchImplementation,
  );
  if (!isRecord(value) || typeof value.sha !== "string" || value.sha === "") {
    throw new Error("Hugging Face did not return a resolved dataset revision.");
  }
  return value.sha;
}

export async function fetchVocalMoneyRowsPage(
  offset,
  length,
  fetchImplementation = globalThis.fetch,
) {
  return await fetchPublicJson(
    buildVocalMoneyRowsUrl(offset, length),
    "Hugging Face Dataset Viewer rows request",
    fetchImplementation,
  );
}

export async function fetchVocalMoneyAudioAsset(
  url,
  fetchImplementation = globalThis.fetch,
) {
  // This dataset is public and asset URLs may be signed on another host. No Hub
  // credentials or inherited headers belong on this request.
  return await fetchImplementation(url);
}

async function fetchPublicJson(url, requestLabel, fetchImplementation) {
  // Deliberately omit Authorization: this integration is for a public dataset.
  const response = await fetchImplementation(url);
  if (!response.ok) {
    throw new Error(
      `${requestLabel} failed with HTTP ${response.status} for ${url}.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${requestLabel} returned invalid JSON for ${url}.`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
