import { describe, expect, it } from "vitest";
import {
  VOCAL_MONEY_DEV_SEED,
  associateVocalMoneyAudio,
  createVocalMoneyFrozenManifest,
  mapVocalMoneyRow,
  projectBridgeVocalMoneySelectionCmiBucket,
  selectVocalMoneyRows,
  validateVocalMoneySourceRows,
  type VocalMoneySelectionCmiBucket,
  type VocalMoneySourceRow,
} from "../src/index.js";

const revision = "a".repeat(40);

function row(
  index: number,
  bucket: VocalMoneySelectionCmiBucket,
): VocalMoneySourceRow {
  const codeMixingIndex = bucket === "low" ? 5 : bucket === "medium" ? 20 : 40;
  return {
    rowIndex: index,
    audioUrl: `https://assets.example/${index}.wav?signature=secret`,
    audioMediaType: "audio/wav",
    clipId: `AS_${index.toString().padStart(3, "0")}`,
    sourceDataset: "AfriSwitch",
    sourceFile: `clip-${index}.wav`,
    languagePair: "yo-en",
    matrixLanguage: "yo",
    domain: "financial",
    countryAccent: "Nigeria",
    deviceType: "mobile",
    noiseConditions: "clean",
    durationSeconds: 4.25,
    samplingRateHz: 16_000,
    codeMixingIndex,
    sourceCmiBand: bucket,
    selectionCmiBucket:
      projectBridgeVocalMoneySelectionCmiBucket(codeMixingIndex),
    numSwitchPoints: 2,
    transcription: "Mo fẹ́ transfer one thousand naira.",
    transcriptionTagged: "Mo fẹ́ [[EN]]transfer one thousand naira[[/EN]].",
  };
}

function catalog(): readonly VocalMoneySourceRow[] {
  return Array.from({ length: 210 }, (_, index) =>
    row(index, index < 70 ? "low" : index < 140 ? "medium" : "high"),
  );
}

describe("Vocal Money dataset contracts", () => {
  it("preserves references and provenance without provider hypotheses", () => {
    const mapped = mapVocalMoneyRow(row(1, "medium"), revision);
    expect(mapped.id).toBe("vocal-money-as_001");
    expect(mapped.referenceTranscript.raw).toBe(
      "Mo fẹ́ transfer one thousand naira.",
    );
    expect(mapped.referenceTranscript.tagged).toBe(
      "Mo fẹ́ [[EN]]transfer one thousand naira[[/EN]].",
    );
    expect(mapped.source).toMatchObject({
      sourceDataset: "AfriSwitch",
      sourceFile: "clip-1.wav",
      revision,
    });
    expect(mapped.downstream).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain("hyp_");
  });

  it("selects a deterministic, balanced 30-row development subset", () => {
    const rows = catalog();
    const selection = {
      mode: "development-subset" as const,
      requestedSampleCount: 30,
      seed: VOCAL_MONEY_DEV_SEED,
    };
    const first = selectVocalMoneyRows(rows, selection);
    const second = selectVocalMoneyRows(rows, selection);
    expect(first.map(({ clipId }) => clipId)).toEqual(
      second.map(({ clipId }) => clipId),
    );
    expect(first.map(({ clipId }) => clipId)).not.toEqual(
      selectVocalMoneyRows(rows, { ...selection, seed: "different" }).map(
        ({ clipId }) => clipId,
      ),
    );
    expect(
      Object.fromEntries(
        (["low", "medium", "high"] as const).map((bucket) => [
          bucket,
          first.filter((item) => item.selectionCmiBucket === bucket).length,
        ]),
      ),
    ).toEqual({ low: 10, medium: 10, high: 10 });
  });

  it("supports full-dataset selection", () => {
    const rows = catalog();
    expect(
      selectVocalMoneyRows(rows, {
        mode: "full-dataset",
        requestedSampleCount: 210,
      }),
    ).toHaveLength(210);
  });

  it("validates source consistency and frozen materialization", () => {
    expect(
      validateVocalMoneySourceRows([
        row(1, "low"),
        { ...row(2, "low"), clipId: "AS_001", samplingRateHz: 8_000 },
      ]).map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining(["duplicate-clip-id", "invalid-sampling-rate"]),
    );

    const publishedBoundaryRow = {
      ...row(1, "medium"),
      codeMixingIndex: 10,
      sourceCmiBand: "low",
      selectionCmiBucket: "medium" as const,
    };
    expect(validateVocalMoneySourceRows([publishedBoundaryRow])).toEqual([]);
    const mapped = mapVocalMoneyRow(publishedBoundaryRow, revision);
    expect(mapped).toMatchObject({
      sourceCmiBand: "low",
      selectionCmiBucket: "medium",
      codeMixingIndex: 10,
      downstream: null,
    });

    const materialized = associateVocalMoneyAudio(mapped, {
      relativePath: "audio/vocal-money-as_001.wav",
      contentSha256: "b".repeat(64),
      byteLength: 128,
    });
    expect(materialized).not.toHaveProperty("sourceAudioUrl");
    const manifest = createVocalMoneyFrozenManifest({
      revision,
      preparedAt: "2026-09-09T00:00:00.000Z",
      selection: {
        mode: "development-subset",
        requestedSampleCount: 1,
        seed: VOCAL_MONEY_DEV_SEED,
      },
      samples: [materialized],
    });
    expect(manifest.selection).toMatchObject({
      publishedHypothesesUsed: false,
      providerPerformanceUsed: false,
      sourceCmiBandCounts: { low: 1 },
      selectionCmiBucketCounts: { low: 0, medium: 1, high: 0 },
    });
  });
});
