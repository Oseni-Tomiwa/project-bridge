import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";
import { diagnosePcm16Wav } from "../scripts/wav-audio-quality.mjs";

function pcm16Wav(samples, options = {}) {
  const sampleRate = options.sampleRate ?? 16_000;
  const channels = options.channels ?? 1;
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataLength + (options.extraDeclaredBytes ?? 0), 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataLength + (options.extraDeclaredBytes ?? 0), 40);
  samples.forEach((sample, index) =>
    buffer.writeInt16LE(sample, 44 + index * 2),
  );
  return buffer;
}

describe("PCM-16 WAV audio diagnostics", () => {
  it("detects fully silent audio", () => {
    const result = diagnosePcm16Wav(pcm16Wav(Array(160).fill(0)), 0.01);
    expect(result).toMatchObject({
      readableWav: true,
      silenceHeuristic: "silent",
      nonZeroSampleCount: 0,
      suspiciousReasons: ["silent"],
      intelligibilityAssessment: "not-evaluated",
    });
  });

  it("detects near-silent non-zero audio", () => {
    const result = diagnosePcm16Wav(pcm16Wav(Array(160).fill(10)), 0.01);
    expect(result).toMatchObject({
      readableWav: true,
      silenceHeuristic: "near-silent",
      nonZeroSampleCount: 160,
      suspiciousReasons: ["near-silent"],
    });
    expect(result.rmsAmplitude).toBeGreaterThan(0);
  });

  it("reports valid signal measurements", () => {
    const result = diagnosePcm16Wav(
      pcm16Wav([4_000, -4_000, 2_000, -2_000]),
      4 / 16_000,
    );
    expect(result).toMatchObject({
      readableWav: true,
      automatedAssessment: "pass",
      silenceHeuristic: "signal-present",
      sampleCount: 4,
      nonZeroSampleCount: 4,
      suspiciousReasons: [],
    });
    expect(result.peakAmplitude).toBeCloseTo(4_000 / 32_768);
    expect(result.rmsAmplitude).toBeGreaterThan(0.05);
  });

  it("reports malformed WAV bytes without throwing", () => {
    expect(diagnosePcm16Wav(Buffer.from("not a wav"))).toMatchObject({
      readableWav: false,
      automatedAssessment: "invalid",
      suspiciousReasons: ["corrupted-audio"],
    });
  });

  it("distinguishes truncated WAV data", () => {
    expect(
      diagnosePcm16Wav(pcm16Wav([1, 2, 3, 4], { extraDeclaredBytes: 20 })),
    ).toMatchObject({
      readableWav: false,
      suspiciousReasons: ["truncated-audio"],
    });
  });
});
