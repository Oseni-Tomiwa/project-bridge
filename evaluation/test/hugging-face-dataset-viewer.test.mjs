import { describe, expect, it, vi } from "vitest";

import {
  HUGGING_FACE_DATASET_VIEWER_BASE_URL,
  buildDatasetRevisionUrl,
  buildDatasetViewerRowsUrl,
  fetchDatasetViewerRowsPage,
  fetchSignedAudioAsset,
  resolveDatasetRevision,
} from "../scripts/hugging-face-dataset-viewer.mjs";

describe("Hugging Face Dataset Viewer integration", () => {
  it("uses the official Dataset Viewer base and rows endpoint", () => {
    const url = buildDatasetViewerRowsUrl(0, 100);

    expect(HUGGING_FACE_DATASET_VIEWER_BASE_URL).toBe(
      "https://datasets-server.huggingface.co",
    );
    expect(url.origin).toBe(HUGGING_FACE_DATASET_VIEWER_BASE_URL);
    expect(url.pathname).toBe("/rows");
  });

  it("constructs the exact frozen dataset, config, split, and page query", () => {
    const url = buildDatasetViewerRowsUrl(200, 100);

    expect(Object.fromEntries(url.searchParams)).toEqual({
      dataset: "intronhealth/AfriSwitch",
      config: "yoruba",
      split: "test",
      offset: "200",
      length: "100",
    });
    expect(url.toString()).toBe(
      "https://datasets-server.huggingface.co/rows?dataset=intronhealth%2FAfriSwitch&config=yoruba&split=test&offset=200&length=100",
    );
  });

  it("does not append an unsupported revision parameter to rows requests", () => {
    const url = buildDatasetViewerRowsUrl(0, 100);

    expect(url.searchParams.has("revision")).toBe(false);
    expect(url.toString()).not.toContain("revision");
  });

  it("resolves revisions separately through the Hub API", async () => {
    const fetchImplementation = vi.fn(async () =>
      globalThis.Response.json({
        sha: "c24748242a2b435392f9b4c38ac7d3a96fc82ef9",
      }),
    );

    await expect(
      resolveDatasetRevision("main", "test-token", fetchImplementation),
    ).resolves.toBe("c24748242a2b435392f9b4c38ac7d3a96fc82ef9");
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(String(url)).toBe(
      "https://huggingface.co/api/datasets/intronhealth/AfriSwitch/revision/main",
    );
    expect(new globalThis.Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
  });

  it("keeps revision values URL-encoded in Hub requests", () => {
    expect(buildDatasetRevisionUrl("refs/pr/12").toString()).toBe(
      "https://huggingface.co/api/datasets/intronhealth/AfriSwitch/revision/refs%2Fpr%2F12",
    );
  });

  it("reports a useful sanitized Dataset Viewer 404", async () => {
    const fetchImplementation = vi.fn(async () =>
      globalThis.Response.json(
        { error: "upstream detail must not leak" },
        { status: 404 },
      ),
    );

    let caught;
    try {
      await fetchDatasetViewerRowsPage(
        0,
        100,
        "highly-sensitive-test-token",
        fetchImplementation,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).toMatch(
      /Dataset Viewer rows request failed with HTTP 404.*intronhealth%2FAfriSwitch.*manually gated dataset/u,
    );
    expect(String(caught)).not.toContain("highly-sensitive-test-token");
    expect(String(caught)).not.toContain("upstream detail must not leak");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("never forwards the Hub token to an external signed audio host", async () => {
    const fetchImplementation = vi.fn(
      async () => new globalThis.Response(new Uint8Array([1, 2, 3])),
    );
    const signedUrl =
      "https://cdn-lfs.hf.co/datasets/example/audio.wav?signature=signed";

    await fetchSignedAudioAsset(signedUrl, fetchImplementation);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(signedUrl);
    expect(fetchImplementation.mock.calls[0]).toHaveLength(1);
  });
});
