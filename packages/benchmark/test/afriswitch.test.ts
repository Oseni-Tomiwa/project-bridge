import { describe, expect, it } from "vitest";

import {
  AFRISWITCH_DATASET_ID,
  AFRISWITCH_SOURCE_LICENSE,
  AFRISWITCH_TEST_SPLIT,
  AFRISWITCH_YORUBA_CONFIG,
  associateAfriSwitchAudio,
  createAfriSwitchFrozenManifest,
  mapAfriSwitchYorubaRow,
  projectBridgeAfriSwitchSampleId,
  selectAfriSwitchSubset,
  validateAfriSwitchManifest,
  validateAfriSwitchSourceRows,
  type AfriSwitchSourceRow,
} from "../src/index.js";

const revision = "1234567890abcdef1234567890abcdef12345678";
const checksum = "a".repeat(64);

function row(
  rowIndex: number,
  overrides: Partial<AfriSwitchSourceRow> = {},
): AfriSwitchSourceRow {
  return {
    rowIndex,
    filename: `clip-${rowIndex}.wav`,
    audioUrl: `https://datasets-server.huggingface.co/audio/${rowIndex}.wav`,
    transcription: `Ìtumọ̀ àkọsílẹ̀ ${rowIndex} with English`,
    transcriptionTagged: `Ìtumọ̀ àkọsílẹ̀ ${rowIndex} [[EN]]with English[[/EN]]`,
    language: "yoruba",
    durationSeconds: 2 + rowIndex,
    cmi: 5 + rowIndex,
    numSwitchPoints: rowIndex % 9,
    ...overrides,
  };
}

function sourceRows(): readonly AfriSwitchSourceRow[] {
  const rows: AfriSwitchSourceRow[] = [];
  let rowIndex = 0;
  for (const cmi of [5, 35]) {
    for (const numSwitchPoints of [1, 4, 9]) {
      for (const durationSeconds of [2, 8, 18]) {
        rows.push(row(rowIndex, { cmi, numSwitchPoints, durationSeconds }));
        rowIndex += 1;
      }
    }
  }
  return rows;
}

describe("AfriSwitch Yoruba mapping", () => {
  it("pins the official dataset, config, split, and license", () => {
    expect({
      dataset: AFRISWITCH_DATASET_ID,
      config: AFRISWITCH_YORUBA_CONFIG,
      split: AFRISWITCH_TEST_SPLIT,
      license: AFRISWITCH_SOURCE_LICENSE,
    }).toEqual({
      dataset: "intronhealth/AfriSwitch",
      config: "yoruba",
      split: "test",
      license: "CC-BY-NC-SA-4.0",
    });
  });

  it("creates stable Project Bridge IDs from source row indexes", () => {
    expect(projectBridgeAfriSwitchSampleId(0)).toBe(
      "afriswitch-yo-test-000000",
    );
    expect(projectBridgeAfriSwitchSampleId(1876)).toBe(
      "afriswitch-yo-test-001876",
    );
  });

  it("preserves official raw and tagged transcriptions exactly", () => {
    const source = row(7, {
      transcription: "Mo sọ pé owó náà dé—exactly.",
      transcriptionTagged: "Mo sọ pé owó náà dé—[[EN]]exactly[[/EN]].",
    });
    const mapped = mapAfriSwitchYorubaRow(source, revision);

    expect(mapped.referenceTranscript.raw).toBe(source.transcription);
    expect(mapped.referenceTranscript.tagged).toBe(source.transcriptionTagged);
    expect(mapped.referenceTranscript.strictNormalized).toBe(
      "mo sọ pé owó náà dé exactly",
    );
    expect(mapped.referenceTranscript.diacriticInsensitiveAnalysis).toBe(
      "mo sọ pe owo naa de exactly",
    );
    expect(source.transcription).toBe("Mo sọ pé owó náà dé—exactly.");
  });

  it("preserves source metrics and attaches no downstream labels", () => {
    const mapped = mapAfriSwitchYorubaRow(
      row(4, { durationSeconds: 3.25, cmi: 22.5, numSwitchPoints: 6 }),
      revision,
    );
    expect(mapped).toMatchObject({
      durationSeconds: 3.25,
      cmi: 22.5,
      numSwitchPoints: 6,
      downstream: null,
      source: {
        revision,
        rowIndex: 4,
        license: AFRISWITCH_SOURCE_LICENSE,
      },
    });
  });

  it("associates a checksum with one original-byte audio asset", () => {
    const mapped = mapAfriSwitchYorubaRow(row(2), revision);
    const materialized = associateAfriSwitchAudio(mapped, {
      relativePath: "audio/afriswitch-yo-test-000002.wav",
      contentSha256: checksum,
      byteLength: 1234,
      mediaType: "audio/wav",
    });

    expect(materialized.audio).toEqual({
      assetId: "afriswitch-yo-test-000002-audio",
      relativePath: "audio/afriswitch-yo-test-000002.wav",
      contentSha256: checksum,
      byteLength: 1234,
      mediaType: "audio/wav",
      transformation: "none-original-source-bytes",
    });
    expect(materialized).not.toHaveProperty("sourceAudioUrl");
  });
});

describe("AfriSwitch deterministic selection", () => {
  it("returns the same ordered subset for the same seed", () => {
    const rows = sourceRows();
    const configuration = { seed: "challenge-seed", requestedSampleCount: 9 };
    expect(selectAfriSwitchSubset(rows, configuration)).toEqual(
      selectAfriSwitchSubset([...rows].reverse(), configuration),
    );
  });

  it("uses the seed to change deterministic ordering", () => {
    const rows = sourceRows();
    const first = selectAfriSwitchSubset(rows, {
      seed: "seed-a",
      requestedSampleCount: 9,
    }).map(({ rowIndex }) => rowIndex);
    const second = selectAfriSwitchSubset(rows, {
      seed: "seed-b",
      requestedSampleCount: 9,
    }).map(({ rowIndex }) => rowIndex);
    expect(first).not.toEqual(second);
  });

  it("spans code-mixing, switch-point, and duration strata", () => {
    const selected = selectAfriSwitchSubset(sourceRows(), {
      seed: "stratification-seed",
      requestedSampleCount: 12,
    });
    expect(new Set(selected.map(({ cmi }) => cmi))).toEqual(new Set([5, 35]));
    expect(
      new Set(selected.map(({ numSwitchPoints }) => numSwitchPoints)),
    ).toEqual(new Set([1, 4, 9]));
    expect(
      new Set(selected.map(({ durationSeconds }) => durationSeconds)),
    ).toEqual(new Set([2, 8, 18]));
  });

  it("rejects duplicate source rows before selection", () => {
    const duplicate = row(1);
    const issues = validateAfriSwitchSourceRows([duplicate, { ...duplicate }]);
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["duplicate-source-row", "duplicate-sample-id"]),
    );
    expect(() =>
      selectAfriSwitchSubset([duplicate, { ...duplicate }], {
        seed: "seed",
        requestedSampleCount: 1,
      }),
    ).toThrow(/unique/u);
  });

  it("requires the caller to choose an explicit valid sample count", () => {
    expect(() =>
      selectAfriSwitchSubset(sourceRows(), {
        seed: "seed",
        requestedSampleCount: 0,
      }),
    ).toThrow(/requestedSampleCount/u);
  });
});

describe("AfriSwitch frozen manifest", () => {
  it("validates a result-free, checksummed ASR manifest", () => {
    const selected = selectAfriSwitchSubset(sourceRows(), {
      seed: "manifest-seed",
      requestedSampleCount: 3,
    });
    const samples = selected.map((source) =>
      associateAfriSwitchAudio(mapAfriSwitchYorubaRow(source, revision), {
        relativePath: `audio/${projectBridgeAfriSwitchSampleId(source.rowIndex)}.wav`,
        contentSha256: checksum,
        byteLength: 100 + source.rowIndex,
        mediaType: "audio/wav",
      }),
    );
    const manifest = createAfriSwitchFrozenManifest({
      revision,
      preparedAt: "2026-09-08T10:00:00.000Z",
      selection: { seed: "manifest-seed", requestedSampleCount: 3 },
      samples,
    });

    expect(validateAfriSwitchManifest(manifest)).toEqual([]);
    expect(manifest).toMatchObject({
      status: "frozen-no-results",
      source: {
        datasetId: AFRISWITCH_DATASET_ID,
        datasetConfig: AFRISWITCH_YORUBA_CONFIG,
        split: AFRISWITCH_TEST_SPLIT,
        revision,
        license: AFRISWITCH_SOURCE_LICENSE,
      },
      selection: {
        seed: "manifest-seed",
        requestedSampleCount: 3,
        actualSampleCount: 3,
        providerPerformanceUsed: false,
      },
      metricScope: ["wer", "cer", "latency"],
    });
    expect(
      manifest.samples.every(({ downstream }) => downstream === null),
    ).toBe(true);
    expect(JSON.stringify(manifest)).not.toContain("hypothesisTranscript");
  });

  it("rejects invalid checksum association", () => {
    const mapped = mapAfriSwitchYorubaRow(row(0), revision);
    expect(() =>
      associateAfriSwitchAudio(mapped, {
        relativePath: "audio/sample.wav",
        contentSha256: "not-a-checksum",
        byteLength: 10,
        mediaType: "audio/wav",
      }),
    ).toThrow(/SHA-256/u);
  });
});
