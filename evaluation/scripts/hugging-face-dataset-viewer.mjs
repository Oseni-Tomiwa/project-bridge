import {
  AFRISWITCH_DATASET_ID,
  AFRISWITCH_TEST_SPLIT,
  AFRISWITCH_YORUBA_CONFIG,
} from "@project-bridge/benchmark";

export const HUGGING_FACE_DATASET_VIEWER_BASE_URL =
  "https://datasets-server.huggingface.co";
export const HUGGING_FACE_HUB_BASE_URL = "https://huggingface.co";
export const HUGGING_FACE_DATASET_VIEWER_ROWS_PATH = "/rows";

export function buildDatasetViewerRowsUrl(offset, length) {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Dataset Viewer row offset must be non-negative.");
  }
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new Error("Dataset Viewer row length must be positive.");
  }

  const url = new URL(
    HUGGING_FACE_DATASET_VIEWER_ROWS_PATH,
    HUGGING_FACE_DATASET_VIEWER_BASE_URL,
  );
  url.searchParams.set("dataset", AFRISWITCH_DATASET_ID);
  url.searchParams.set("config", AFRISWITCH_YORUBA_CONFIG);
  url.searchParams.set("split", AFRISWITCH_TEST_SPLIT);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(length));
  return url;
}

export function buildDatasetRevisionUrl(requestedRevision) {
  const revision = requestedRevision.trim();
  if (revision === "") {
    throw new Error("A Hugging Face dataset revision is required.");
  }
  return new URL(
    `/api/datasets/${AFRISWITCH_DATASET_ID}/revision/${encodeURIComponent(revision)}`,
    HUGGING_FACE_HUB_BASE_URL,
  );
}

export async function resolveDatasetRevision(
  requestedRevision,
  token,
  fetchImplementation = globalThis.fetch,
) {
  const url = buildDatasetRevisionUrl(requestedRevision);
  const value = await fetchHuggingFaceJson(
    url,
    token,
    "Hugging Face Hub dataset-revision request",
    fetchImplementation,
  );
  if (!isRecord(value) || typeof value.sha !== "string" || value.sha === "") {
    throw new Error("Hugging Face did not return a resolved dataset revision.");
  }
  return value.sha;
}

export async function fetchDatasetViewerRowsPage(
  offset,
  length,
  token,
  fetchImplementation = globalThis.fetch,
) {
  const url = buildDatasetViewerRowsUrl(offset, length);
  return await fetchHuggingFaceJson(
    url,
    token,
    "Hugging Face Dataset Viewer rows request",
    fetchImplementation,
  );
}

export async function fetchSignedAudioAsset(
  url,
  fetchImplementation = globalThis.fetch,
) {
  // Signed asset URLs carry their own authorization. Never attach HF_TOKEN or
  // any other Hub request headers to this separate request.
  return await fetchImplementation(url);
}

async function fetchHuggingFaceJson(
  url,
  token,
  requestLabel,
  fetchImplementation,
) {
  const response = await fetchImplementation(url, {
    headers: authorizationHeaders(token),
  });
  if (!response.ok) {
    throw new Error(diagnosticForHttpFailure(requestLabel, url, response));
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${requestLabel} returned invalid JSON for ${url}.`);
  }
}

function diagnosticForHttpFailure(requestLabel, url, response) {
  const prefix = `${requestLabel} failed with HTTP ${response.status} for ${url}.`;
  if (
    response.status === 404 &&
    url.origin === HUGGING_FACE_DATASET_VIEWER_BASE_URL
  ) {
    return `${prefix} Dataset Viewer could not access ${AFRISWITCH_DATASET_ID}; verify that the authenticated Hugging Face account has accepted or been granted access to the manually gated dataset.`;
  }
  if (response.status === 401 || response.status === 403) {
    return `${prefix} Verify HF_TOKEN authentication and repository access.`;
  }
  return prefix;
}

function authorizationHeaders(token) {
  return token === undefined || token === ""
    ? {}
    : { Authorization: `Bearer ${token}` };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
