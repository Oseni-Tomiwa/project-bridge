import { Buffer } from "node:buffer";

export const NEAR_SILENCE_RMS_THRESHOLD = 0.003;
export const NEAR_SILENCE_PEAK_THRESHOLD = 0.02;
export const EXCESSIVE_CLIPPING_PERCENTAGE = 1;

export function diagnosePcm16Wav(bytes, expectedDurationSeconds) {
  try {
    const parsed = parsePcm16Wav(bytes);
    const amplitudes = measureAmplitude(parsed.samples);
    const silenceHeuristic =
      amplitudes.nonZeroSampleCount === 0
        ? "silent"
        : amplitudes.rmsAmplitude <= NEAR_SILENCE_RMS_THRESHOLD &&
            amplitudes.peakAmplitude <= NEAR_SILENCE_PEAK_THRESHOLD
          ? "near-silent"
          : "signal-present";
    const suspiciousReasons = [];
    if (silenceHeuristic === "silent") suspiciousReasons.push("silent");
    if (silenceHeuristic === "near-silent")
      suspiciousReasons.push("near-silent");
    if (amplitudes.clippingPercentage >= EXCESSIVE_CLIPPING_PERCENTAGE)
      suspiciousReasons.push("excessive-clipping");
    if (
      typeof expectedDurationSeconds === "number" &&
      Number.isFinite(expectedDurationSeconds) &&
      Math.abs(parsed.durationSeconds - expectedDurationSeconds) >
        Math.max(0.1, expectedDurationSeconds * 0.02)
    )
      suspiciousReasons.push("duration-metadata-mismatch");
    return {
      readableWav: true,
      format: {
        audioFormat: "pcm",
        channels: parsed.channels,
        sampleRateHz: parsed.sampleRateHz,
        bitsPerSample: 16,
      },
      durationSeconds: parsed.durationSeconds,
      sampleCount: parsed.samples.length,
      nonZeroSampleCount: amplitudes.nonZeroSampleCount,
      peakAmplitude: amplitudes.peakAmplitude,
      rmsAmplitude: amplitudes.rmsAmplitude,
      clippingPercentage: amplitudes.clippingPercentage,
      silenceHeuristic,
      suspiciousReasons,
      automatedAssessment:
        suspiciousReasons.length === 0 ? "pass" : "suspicious",
      intelligibilityAssessment: "not-evaluated",
    };
  } catch (error) {
    const reason =
      error instanceof WavDiagnosticError ? error.reason : "corrupted-audio";
    return {
      readableWav: false,
      format: null,
      durationSeconds: null,
      sampleCount: null,
      nonZeroSampleCount: null,
      peakAmplitude: null,
      rmsAmplitude: null,
      clippingPercentage: null,
      silenceHeuristic: "unavailable",
      suspiciousReasons: [reason],
      automatedAssessment: "invalid",
      intelligibilityAssessment: "not-evaluated",
    };
  }
}

function parsePcm16Wav(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 12) throw corrupted("WAV header is incomplete.");
  if (bytes.toString("ascii", 0, 4) !== "RIFF")
    throw corrupted("RIFF signature is missing.");
  if (bytes.toString("ascii", 8, 12) !== "WAVE")
    throw corrupted("WAVE signature is missing.");
  const declaredFileLength = bytes.readUInt32LE(4) + 8;
  if (declaredFileLength > bytes.length)
    throw truncated("RIFF size exceeds available bytes.");

  let format;
  let data;
  for (let offset = 12; offset < declaredFileLength; ) {
    if (offset + 8 > declaredFileLength)
      throw truncated("WAV chunk header is incomplete.");
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const contentStart = offset + 8;
    const contentEnd = contentStart + chunkLength;
    if (contentEnd > declaredFileLength || contentEnd > bytes.length)
      throw truncated(`WAV ${chunkId} chunk exceeds available bytes.`);
    if (chunkId === "fmt ") {
      if (chunkLength < 16) throw corrupted("WAV fmt chunk is too short.");
      format = {
        audioFormatCode: bytes.readUInt16LE(contentStart),
        channels: bytes.readUInt16LE(contentStart + 2),
        sampleRateHz: bytes.readUInt32LE(contentStart + 4),
        blockAlign: bytes.readUInt16LE(contentStart + 12),
        bitsPerSample: bytes.readUInt16LE(contentStart + 14),
      };
    }
    if (chunkId === "data") data = bytes.subarray(contentStart, contentEnd);
    offset = contentEnd + (chunkLength % 2);
  }
  if (format === undefined) throw corrupted("WAV fmt chunk is missing.");
  if (data === undefined) throw corrupted("WAV data chunk is missing.");
  if (
    format.audioFormatCode !== 1 ||
    format.channels <= 0 ||
    format.sampleRateHz <= 0 ||
    format.bitsPerSample !== 16 ||
    format.blockAlign !== format.channels * 2
  )
    throw corrupted("WAV is not supported PCM-16 audio.");
  if (data.length === 0) throw corrupted("WAV data chunk is empty.");
  if (data.length % format.blockAlign !== 0)
    throw truncated("WAV data ends within a sample frame.");

  const samples = new Int16Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1)
    samples[index] = data.readInt16LE(index * 2);
  const frameCount = data.length / format.blockAlign;
  return {
    channels: format.channels,
    sampleRateHz: format.sampleRateHz,
    durationSeconds: frameCount / format.sampleRateHz,
    samples,
  };
}

function measureAmplitude(samples) {
  let nonZeroSampleCount = 0;
  let peak = 0;
  let squareSum = 0;
  let clippingSampleCount = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    if (sample !== 0) nonZeroSampleCount += 1;
    if (absolute > peak) peak = absolute;
    if (absolute >= 32_767) clippingSampleCount += 1;
    const normalized = sample / 32_768;
    squareSum += normalized * normalized;
  }
  return {
    nonZeroSampleCount,
    peakAmplitude: peak / 32_768,
    rmsAmplitude: Math.sqrt(squareSum / samples.length),
    clippingPercentage: (clippingSampleCount / samples.length) * 100,
  };
}

class WavDiagnosticError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

function corrupted(message) {
  return new WavDiagnosticError("corrupted-audio", message);
}

function truncated(message) {
  return new WavDiagnosticError("truncated-audio", message);
}
