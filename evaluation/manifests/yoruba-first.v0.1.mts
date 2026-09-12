import { YORUBA_LANGUAGE_PROFILE } from "@project-bridge/benchmark";
import { yorubaFailedTransferFixtures } from "../fixtures/yoruba-failed-transfer.v0.1.mjs";
import { yorubaNormalizationProfiles } from "../profiles/yoruba-normalization.v0.1.mjs";

export const yorubaFirstEvaluationManifest = {
  id: YORUBA_LANGUAGE_PROFILE,
  version: "0.1",
  status: "preserved-prior-domain-text-ground-truth-only",
  domain: "financial-support-prior",
  activeChallengeManifestId: "yoruba-healthcare-intake-v0.1",
  intent: "failed_transfer",
  fixtureIds: yorubaFailedTransferFixtures.map((fixture) => fixture.sampleId),
  normalizationProfileIds: [
    yorubaNormalizationProfiles.primaryCandidate.id,
    yorubaNormalizationProfiles.optionalAnalysis.id,
  ],
  audio: {
    status: "not-collected",
    assets: [],
    note: "No audio or audio provenance is asserted by this manifest.",
  },
} as const;
