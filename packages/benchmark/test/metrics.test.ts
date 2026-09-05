import { describe, expect, it } from "vitest";

import {
  calculateTranscriptionAccuracy,
  normalizeTranscript,
} from "../src/index.js";

describe("normalizeTranscript", () => {
  it("normalizes case, punctuation, and whitespace", () => {
    expect(normalizeTranscript("  Hello,   WORLD! ")).toBe("hello world");
  });

  it("preserves letters from different scripts", () => {
    expect(normalizeTranscript("Hello—Báwo")).toBe("hello báwo");
  });
});

describe("calculateTranscriptionAccuracy", () => {
  it("counts a substitution in raw and normalized WER", () => {
    const result = calculateTranscriptionAccuracy(
      "send ten now",
      "send two now",
    );

    expect(result.rawWordError).toEqual({
      substitutions: 1,
      deletions: 0,
      insertions: 0,
      referenceWordCount: 3,
      wer: 1 / 3,
    });
    expect(result.normalizedWordError).toEqual(result.rawWordError);
  });

  it("keeps raw and normalized WER distinct", () => {
    const result = calculateTranscriptionAccuracy(
      "Hello, WORLD!",
      "hello world",
    );

    expect(result.rawWordError.wer).toBe(1);
    expect(result.normalizedWordError.wer).toBe(0);
  });

  it("leaves WER undefined for an empty reference", () => {
    expect(
      calculateTranscriptionAccuracy("", "unexpected").normalizedWordError,
    ).toMatchObject({
      insertions: 1,
      referenceWordCount: 0,
      wer: null,
    });
  });
});
