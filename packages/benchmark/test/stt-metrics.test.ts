import { describe, expect, it } from "vitest";
import {
  calculateSttSampleMetrics,
  summarizeLatency,
  yorubaDiacriticInsensitiveAnalysisProfile,
  yorubaStrictNormalizationProfile,
} from "../src/index.js";

function metrics(reference: string, hypothesis: string) {
  return calculateSttSampleMetrics(
    reference,
    hypothesis,
    yorubaStrictNormalizationProfile,
    yorubaDiacriticInsensitiveAnalysisProfile,
  );
}

describe("reproducible STT edit metrics", () => {
  it("scores a perfect match as zero", () => {
    expect(metrics("báwo ni", "báwo ni").strictNormalized).toMatchObject({
      wer: { wer: 0 },
      cer: { cer: 0 },
    });
  });

  it.each([
    ["substitution", "one two three", "one ten three", [1, 0, 0]],
    ["insertion", "one two", "one extra two", [0, 0, 1]],
    ["deletion", "one two three", "one three", [0, 1, 0]],
    ["combined", "one two three", "zero one extra three", [1, 0, 1]],
  ])("counts %s edits", (_name, reference, hypothesis, expected) => {
    const result = metrics(reference, hypothesis).rawSurface.wer;
    expect([result.substitutions, result.deletions, result.insertions]).toEqual(
      expected,
    );
  });

  it("handles empty hypotheses and null-rate empty references", () => {
    expect(metrics("one two", "").rawSurface.wer).toMatchObject({
      deletions: 2,
      referenceWordCount: 2,
      wer: 1,
    });
    expect(metrics("", "extra").rawSurface.wer).toMatchObject({
      insertions: 1,
      referenceWordCount: 0,
      wer: null,
    });
  });

  it("preserves Yoruba diacritics in strict scoring and isolates analysis", () => {
    const result = metrics("ó fẹ́ owó", "o fẹ owo");
    expect(result.strictNormalized.wer.wer).toBeGreaterThan(0);
    expect(result.strictNormalized.cer.cer).toBeGreaterThan(0);
    expect(result.diacriticInsensitiveAnalysis.wer.wer).toBe(0);
    expect(result.diacriticInsensitiveAnalysis.cer.cer).toBe(0);
  });

  it("documents punctuation, number surfaces, and normalized spaces in metrics", () => {
    const result = metrics("Pay ₦25,000!", "pay ₦25000");
    expect(result.rawSurface.wer.wer).toBe(1);
    expect(result.strictNormalized.wer.wer).toBe(0.5);
    expect(result.strictNormalized.cer.referenceCharacterCount).toBe(
      Array.from("pay ₦25,000").length,
    );
  });

  it("counts original whitespace code points in raw CER", () => {
    const result = metrics("a\tb", "a b");
    expect(result.rawSurface.cer).toMatchObject({
      substitutions: 1,
      referenceCharacterCount: 3,
      cer: 1 / 3,
    });
    expect(result.strictNormalized.cer.cer).toBe(0);
  });
});

describe("latency summaries", () => {
  it("calculates mean, median/p50, and interpolated p95", () => {
    expect(summarizeLatency([40, 10, 30, 20])).toEqual({
      count: 4,
      meanMilliseconds: 25,
      medianMilliseconds: 25,
      p50Milliseconds: 25,
      p95Milliseconds: 38.5,
      minMilliseconds: 10,
      maxMilliseconds: 40,
    });
  });
});
