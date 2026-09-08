import type { SampleId } from "@project-bridge/shared";

/**
 * Preparation metadata only. It intentionally contains no provider output,
 * score, unverified checksum, or claim about consent/provenance.
 */
export const realYorubaComparisonPreparation = {
  schemaVersion: "0.1",
  sample: {
    id: "real-yo-001" as SampleId,
    referenceTranscript: "mo transfer 50 thousands is account mi me o de re",
    intendedMeaning: "I transferred 50,000 to my account and I can't find it.",
    audio: {
      assetId: "real-yo-001-source-audio",
      localPathHint: "~/Downloads/yoruba-test.m4a",
      handling: "byte-identical-source-required",
      governanceStatus: "review-required",
    },
  },
  providerResultSlots: [
    { providerId: "intron-sahara", status: "not-imported" },
    { providerId: "openai", status: "not-run" },
    {
      providerId: "deepgram",
      status: "not-run",
      configurationId: "deepgram-prerecorded-nova-3-multi-smart-format-off-v1",
    },
  ],
} as const;
