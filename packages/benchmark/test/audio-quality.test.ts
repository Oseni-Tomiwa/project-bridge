import { describe, expect, it } from "vitest";
import {
  audioQualityScoringDisposition,
  validateAudioQualityReviewManifest,
} from "../src/index.js";

const baseManifest = {
  schemaVersion: "0.1",
  id: "review-v0.1",
  datasetManifest: {
    id: "dataset-v0.1",
    version: "0.1",
    sourceRevision: "a".repeat(40),
  },
  scoringPolicy: {
    usable: "include",
    unusable: "exclude",
    uncertain: "hold-for-review",
    preserveProviderResults: true,
  },
  reviews: [
    {
      sampleId: "sample-1",
      audioContentSha256: "b".repeat(64),
      state: "uncertain",
      reasons: ["other"],
      reviewStatus: "pending-manual",
    },
  ],
};

describe("audio quality review contracts", () => {
  it("separates scoring disposition from preserved provider results", () => {
    expect(audioQualityScoringDisposition("usable")).toBe("include");
    expect(audioQualityScoringDisposition("unusable")).toBe("exclude");
    expect(audioQualityScoringDisposition("uncertain")).toBe("hold-for-review");
    expect(validateAudioQualityReviewManifest(baseManifest)).toEqual([]);
  });

  it("rejects a final state disguised as pending manual review", () => {
    expect(
      validateAudioQualityReviewManifest({
        ...baseManifest,
        reviews: [{ ...baseManifest.reviews[0], state: "unusable" }],
      }),
    ).toContain("reviews[0] pending manual review must remain uncertain.");
  });
});
