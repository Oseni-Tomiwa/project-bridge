import {
  yorubaDiacriticInsensitiveAnalysisProfile,
  yorubaStrictNormalizationProfile,
} from "@project-bridge/benchmark";

/** Versioned profile registry used by the Yoruba-first fixture manifest. */
export const yorubaNormalizationProfiles = {
  primaryCandidate: yorubaStrictNormalizationProfile,
  optionalAnalysis: yorubaDiacriticInsensitiveAnalysisProfile,
} as const;
