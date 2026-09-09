import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { URL } from "node:url";

import {
  associateVocalMoneyAudio,
  createVocalMoneyFrozenManifest,
  mapVocalMoneyRow,
} from "@project-bridge/benchmark";
import { describe, expect, it, vi } from "vitest";
import {
  parseArguments,
  parseViewerRow,
} from "../scripts/prepare-vocal-money.mjs";
import {
  buildVocalMoneyRowsUrl,
  fetchVocalMoneyAudioAsset,
  fetchVocalMoneyRowsPage,
  resolveVocalMoneyRevision,
} from "../scripts/vocal-money-dataset-viewer.mjs";
import {
  loadSttBenchmarkManifest,
  runSttBenchmarkBatch,
} from "../scripts/stt-benchmark-runner.mjs";

const viewerRow = {
  row_idx: 7,
  row: {
    audio: { src: "https://cdn.example/clip.wav?token=signed" },
    clip_id: "AS_007",
    source_dataset: "AfriSwitch",
    source_file: "source-7.wav",
    language_pair: "yo-en",
    matrix_language: "yo",
    domain: "financial",
    country_accent: "Nigeria",
    device_type: "mobile",
    noise_conditions: "clean",
    duration_s: 4.2,
    sampling_rate: 16000,
    code_mixing_index: 20,
    cmi_band: "medium",
    num_switch_points: 2,
    transcription: "Mo fẹ́ transfer owó.",
    transcription_tagged: "Mo fẹ́ [[EN]]transfer[[/EN]] owó.",
    hyp_whisper_large_v3: "published provider output",
  },
  truncated_cells: [],
};

describe("Vocal Money public preparation", () => {
  it("constructs the exact public viewer request", () => {
    const url = buildVocalMoneyRowsUrl(0, 100);
    expect(url.origin).toBe("https://datasets-server.huggingface.co");
    expect(url.pathname).toBe("/rows");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      dataset: "Kimyayd/vocal-money-codeswitch-asr-benchmark",
      config: "default",
      split: "train",
      offset: "0",
      length: "100",
    });
    expect(url.toString()).toContain(
      "dataset=Kimyayd%2Fvocal-money-codeswitch-asr-benchmark",
    );
  });

  it("uses no authorization for public metadata or signed assets", async () => {
    const metadataFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [], num_rows_total: 0 }),
    }));
    await fetchVocalMoneyRowsPage(0, 100, metadataFetch);
    expect(metadataFetch).toHaveBeenCalledWith(expect.any(URL));

    const revisionFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sha: "abc123" }),
    }));
    await expect(
      resolveVocalMoneyRevision("main", revisionFetch),
    ).resolves.toBe("abc123");
    expect(revisionFetch).toHaveBeenCalledWith(expect.any(URL));

    const assetFetch = vi.fn(async () => ({ ok: true }));
    await fetchVocalMoneyAudioAsset(
      "https://external.example/audio.wav?signature=value",
      assetFetch,
    );
    expect(assetFetch).toHaveBeenCalledWith(
      "https://external.example/audio.wav?signature=value",
    );
  });

  it("maps source fields while excluding published hypotheses", () => {
    const parsed = parseViewerRow(viewerRow);
    expect(parsed).toMatchObject({
      clipId: "AS_007",
      transcription: "Mo fẹ́ transfer owó.",
      transcriptionTagged: "Mo fẹ́ [[EN]]transfer[[/EN]] owó.",
      cmiBand: "medium",
      samplingRateHz: 16000,
    });
    expect(parsed).not.toHaveProperty("hyp_whisper_large_v3");
    expect(JSON.stringify(parsed)).not.toContain("published provider output");
  });

  it("parses development and full commands with an optional separator", () => {
    const args = [
      "--count",
      "30",
      "--seed",
      "project-bridge-vocal-money-dev-v1",
    ];
    expect(parseArguments(args)).toMatchObject({ all: false, count: 30 });
    expect(parseArguments(["--", ...args])).toEqual(parseArguments(args));
    expect(parseArguments(["--all"])).toMatchObject({ all: true, count: 210 });
  });

  it("produces a manifest accepted by the provider-neutral STT runner", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "vocal-money-test-"));
    await mkdir(resolve(directory, "audio"));
    const bytes = new Uint8Array([82, 73, 70, 70]);
    const audioPath = resolve(directory, "audio/vocal-money-as_007.wav");
    await writeFile(audioPath, bytes);
    const revision = "a".repeat(40);
    const sample = associateVocalMoneyAudio(
      mapVocalMoneyRow(parseViewerRow(viewerRow), revision),
      {
        relativePath: "audio/vocal-money-as_007.wav",
        contentSha256:
          "a40ff3d5900fb7698b8c865041347cb49eccedc8f93945f89629ad104aaecce4",
        byteLength: bytes.byteLength,
      },
    );
    const manifest = createVocalMoneyFrozenManifest({
      revision,
      preparedAt: "2026-09-09T00:00:00.000Z",
      selection: {
        mode: "development-subset",
        requestedSampleCount: 1,
        seed: "test-seed",
      },
      samples: [sample],
    });
    const manifestPath = resolve(directory, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(loadSttBenchmarkManifest(manifestPath)).resolves.toMatchObject(
      {
        manifest: {
          id: "vocal-money-codeswitch-dev-v0.1",
          samples: [{ id: "vocal-money-as_007" }],
        },
      },
    );
    const provider = {
      configuration: {
        id: "fake-v1",
        providerId: "fake",
        modelIdentifier: "fake-model",
        options: {},
      },
      transcribe: vi.fn(),
    };
    await expect(
      runSttBenchmarkBatch({
        manifestPath,
        providers: [provider],
        dryRun: true,
      }),
    ).resolves.toMatchObject({ dryRun: true, plannedPairCount: 1 });
    expect(provider.transcribe).not.toHaveBeenCalled();
  });
});
