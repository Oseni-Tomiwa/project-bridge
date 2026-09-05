import { describe, expect, it } from "vitest";

import {
  normalizeYorubaTranscript,
  validateYorubaEvaluationFixtures,
  yorubaDiacriticInsensitiveAnalysisProfile,
  yorubaStrictNormalizationProfile,
  type YorubaEvaluationFixture,
} from "@project-bridge/benchmark";
import { yorubaFailedTransferFixtures } from "../fixtures/yoruba-failed-transfer.v0.1.mjs";
import { yorubaFirstEvaluationManifest } from "../manifests/yoruba-first.v0.1.mjs";

describe("Yoruba-first fixture corpus", () => {
  it("contains 36 balanced, uniquely identified synthetic scenarios", () => {
    expect(yorubaFailedTransferFixtures).toHaveLength(36);
    expect(
      new Set(yorubaFailedTransferFixtures.map(({ sampleId }) => sampleId))
        .size,
    ).toBe(36);
    expect(
      new Set(yorubaFailedTransferFixtures.map(({ scenarioId }) => scenarioId))
        .size,
    ).toBe(36);

    const counts = yorubaFailedTransferFixtures.reduce<Record<string, number>>(
      (result, { languageMix }) => ({
        ...result,
        [languageMix]: (result[languageMix] ?? 0) + 1,
      }),
      {},
    );
    expect(counts).toEqual({
      "yoruba-heavy": 9,
      "yoruba-english": 9,
      "yoruba-pidgin": 9,
      "nigerian-english": 9,
    });
  });

  it("passes the fixture contract validator", () => {
    expect(
      validateYorubaEvaluationFixtures(yorubaFailedTransferFixtures),
    ).toEqual([]);
  });

  it("keeps all required ground-truth fields populated", () => {
    for (const fixture of yorubaFailedTransferFixtures) {
      expect(fixture.sampleId).not.toBe("");
      expect(fixture.scenarioId).not.toBe("");
      expect(fixture.userUtterance).not.toBe("");
      expect(fixture.canonicalReferenceTranscript).not.toBe("");
      expect(fixture.normalizedReferenceTranscript.strict).not.toBe("");
      expect(fixture.expectedIntent).toBeTruthy();
      expect(fixture.notes).not.toBe("");
      expect(fixture.tags.length).toBeGreaterThan(0);
    }
  });

  it("does not permit completion while required fields are missing", () => {
    const incomplete = yorubaFailedTransferFixtures.filter(
      ({ requiredFieldsMissing }) => requiredFieldsMissing.length > 0,
    );
    expect(incomplete.length).toBeGreaterThan(0);
    for (const fixture of incomplete) {
      expect(fixture.expectedActionEligibility).toBe("not-eligible");
      expect(fixture.expectedFinalTaskResult).not.toBe(
        "support-case-created-after-confirmation",
      );
    }
  });

  it("rejects credential-bearing scenarios without retaining credential values", () => {
    const sensitive = yorubaFailedTransferFixtures.filter(
      ({ expectedSafetyOutcome }) =>
        expectedSafetyOutcome === "reject-sensitive",
    );
    expect(sensitive).toHaveLength(4);
    for (const fixture of sensitive) {
      expect(fixture.userUtterance).toContain("REDACTED");
      expect(fixture.sensitiveInputCategory).toBeTruthy();
      expect(fixture.expectedEntities).toEqual({});
      expect(fixture.expectedFinalTaskResult).toBe("rejected-sensitive");
      expect(fixture.userUtterance).not.toMatch(
        /\b(?:pin|otp|password|passcode|cvv|card number|account number)\b\D{0,16}\d{3,19}\b/iu,
      );
    }
  });

  it("reports duplicate IDs and invalid completion combinations", () => {
    const source = yorubaFailedTransferFixtures[0];
    if (source === undefined) throw new Error("Expected at least one fixture.");
    const invalid: YorubaEvaluationFixture = {
      ...source,
      requiredFieldsPresent: source.requiredFieldsPresent.slice(1),
      requiredFieldsMissing: [source.requiredFieldsPresent[0]!],
      expectedEntities: Object.fromEntries(
        Object.entries(source.expectedEntities).filter(
          ([key]) => key !== source.requiredFieldsPresent[0],
        ),
      ),
    };
    const issues = validateYorubaEvaluationFixtures([source, invalid]);
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "duplicate-sample-id",
        "duplicate-scenario-id",
        "completed-with-missing-fields",
        "invalid-completed-outcome",
        "invalid-action-eligibility",
      ]),
    );
  });
});

describe("Yoruba normalization profiles", () => {
  it("uses Unicode NFC and preserves tone marks in strict scoring", () => {
    expect(
      normalizeYorubaTranscript(
        "Ọ̀rẹ́, fi ₦25,000 RÁNṢẸ́!",
        yorubaStrictNormalizationProfile,
      ),
    ).toBe("ọ̀rẹ́ fi ₦25,000 ránṣẹ́");
  });

  it("removes only tone marks in optional analysis and keeps Yoruba subdots", () => {
    expect(
      normalizeYorubaTranscript(
        "Ọ̀rẹ́, fi ₦25,000 RÁNṢẸ́!",
        yorubaDiacriticInsensitiveAnalysisProfile,
      ),
    ).toBe("ọrẹ fi ₦25,000 ranṣẹ");
  });

  it("preserves number and currency surface forms", () => {
    expect(
      normalizeYorubaTranscript(
        "₦25,000.50 àti 25k.",
        yorubaStrictNormalizationProfile,
      ),
    ).toBe("₦25,000.50 àti 25k");
  });
});

describe("Yoruba evaluation manifest", () => {
  it("indexes every fixture without claiming audio provenance", () => {
    expect(yorubaFirstEvaluationManifest.fixtureIds).toEqual(
      yorubaFailedTransferFixtures.map(({ sampleId }) => sampleId),
    );
    expect(yorubaFirstEvaluationManifest.audio).toEqual({
      status: "not-collected",
      assets: [],
      note: "No audio or audio provenance is asserted by this manifest.",
    });
  });
});
