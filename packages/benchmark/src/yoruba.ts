import type { JsonValue } from "@project-bridge/shared";
import type { NormalizationProfile } from "./normalization.js";

export const YORUBA_LANGUAGE_PROFILE = "yoruba-first-v0.1";

export const failedTransferRequiredFields = [
  "transactionAmount",
  "transactionDateOrRelativeTime",
  "recipientOrDestinationDescription",
  "issueDescription",
] as const;

export type FailedTransferRequiredField =
  (typeof failedTransferRequiredFields)[number];

export type YorubaLanguageMix =
  | "yoruba-heavy"
  | "yoruba-english"
  | "yoruba-pidgin"
  | "nigerian-english";

export interface YorubaNormalizationProfileDesign extends NormalizationProfile {
  readonly analysisOnly: boolean;
  readonly unicodeForm: "NFC";
  readonly lowercase: true;
  readonly removePunctuation: true;
  readonly collapseWhitespace: true;
  readonly punctuationPolicy: "remove-except-apostrophes-currency-and-numeric-separators";
  readonly numberPolicy: "preserve-surface-form";
  readonly currencyPolicy: "preserve-surface-form";
  readonly diacriticPolicy:
    | "preserve"
    | "remove-acute-and-grave-tone-marks-preserve-subdots";
}

export const yorubaStrictNormalizationProfile: YorubaNormalizationProfileDesign =
  {
    id: "yoruba-strict",
    version: "0.1",
    analysisOnly: false,
    unicodeForm: "NFC",
    lowercase: true,
    removePunctuation: true,
    collapseWhitespace: true,
    punctuationPolicy:
      "remove-except-apostrophes-currency-and-numeric-separators",
    numberPolicy: "preserve-surface-form",
    currencyPolicy: "preserve-surface-form",
    diacriticPolicy: "preserve",
  };

export const yorubaDiacriticInsensitiveAnalysisProfile: YorubaNormalizationProfileDesign =
  {
    ...yorubaStrictNormalizationProfile,
    id: "yoruba-diacritic-insensitive-analysis",
    version: "0.1",
    analysisOnly: true,
    diacriticPolicy: "remove-acute-and-grave-tone-marks-preserve-subdots",
  };

export type YorubaExpectedIntent = "failed_transfer" | "unsupported";
export type YorubaActionEligibility =
  | "eligible-after-explicit-confirmation"
  | "not-eligible";
export type YorubaFinalTaskResult =
  | "support-case-created-after-confirmation"
  | "clarification-required"
  | "rejected-unsupported"
  | "rejected-sensitive";
export type YorubaSafetyOutcome =
  | "accept-synthetic"
  | "reject-unsupported"
  | "reject-sensitive";

export interface YorubaEvaluationFixture {
  readonly sampleId: string;
  readonly scenarioId: string;
  readonly languageProfile: typeof YORUBA_LANGUAGE_PROFILE;
  readonly languageMix: YorubaLanguageMix;
  readonly userUtterance: string;
  readonly canonicalReferenceTranscript: string;
  readonly normalizedReferenceTranscript: Readonly<{
    strict: string;
    diacriticInsensitiveAnalysis: string;
  }>;
  readonly expectedIntent: YorubaExpectedIntent;
  readonly expectedEntities: Readonly<Record<string, JsonValue>>;
  readonly requiredFieldsPresent: readonly FailedTransferRequiredField[];
  readonly requiredFieldsMissing: readonly FailedTransferRequiredField[];
  readonly expectedClarification: Readonly<{
    concept: FailedTransferRequiredField;
    question?: string;
  }> | null;
  readonly expectedActionEligibility: YorubaActionEligibility;
  readonly expectedConfirmation: "required" | "not-applicable";
  readonly expectedFinalTaskResult: YorubaFinalTaskResult;
  readonly expectedSafetyOutcome: YorubaSafetyOutcome;
  readonly unsupportedReason?: string;
  readonly sensitiveInputCategory?:
    | "pin"
    | "otp"
    | "password"
    | "cvv"
    | "full-card-number"
    | "full-account-number";
  readonly notes: string;
  readonly tags: readonly string[];
}

export type YorubaEvaluationFixtureSeed = Omit<
  YorubaEvaluationFixture,
  "normalizedReferenceTranscript"
>;

export interface FixtureValidationIssue {
  readonly sampleId: string;
  readonly code: string;
  readonly message: string;
}

export function createYorubaEvaluationFixture(
  seed: YorubaEvaluationFixtureSeed,
): YorubaEvaluationFixture {
  return {
    ...seed,
    normalizedReferenceTranscript: {
      strict: normalizeYorubaTranscript(
        seed.canonicalReferenceTranscript,
        yorubaStrictNormalizationProfile,
      ),
      diacriticInsensitiveAnalysis: normalizeYorubaTranscript(
        seed.canonicalReferenceTranscript,
        yorubaDiacriticInsensitiveAnalysisProfile,
      ),
    },
  };
}

export function normalizeYorubaTranscript(
  input: string,
  profile: YorubaNormalizationProfileDesign,
): string {
  let value = input.normalize(profile.unicodeForm).toLowerCase();

  if (
    profile.diacriticPolicy ===
    "remove-acute-and-grave-tone-marks-preserve-subdots"
  ) {
    value = value
      .normalize("NFD")
      .replace(/[\u0300\u0301]/gu, "")
      .normalize("NFC");
  }

  value = value.replace(
    /[\p{P}\p{S}]/gu,
    (character: string, offset: number, source: string) => {
      if (character === "'" || character === "’" || /\p{Sc}/u.test(character)) {
        return character;
      }
      if (
        (character === "," || character === ".") &&
        /\d/u.test(source[offset - 1] ?? "") &&
        /\d/u.test(source[offset + 1] ?? "")
      ) {
        return character;
      }
      return " ";
    },
  );

  return value.replace(/\s+/gu, " ").trim();
}

export function validateYorubaEvaluationFixtures(
  fixtures: readonly YorubaEvaluationFixture[],
): readonly FixtureValidationIssue[] {
  const issues: FixtureValidationIssue[] = [];
  const sampleIds = new Set<string>();
  const scenarioIds = new Set<string>();

  for (const fixture of fixtures) {
    const add = (code: string, message: string): void => {
      issues.push({ sampleId: fixture.sampleId || "<missing>", code, message });
    };

    if (fixture.sampleId.trim() === "")
      add("missing-sample-id", "sampleId is required.");
    if (sampleIds.has(fixture.sampleId))
      add("duplicate-sample-id", "sampleId must be unique.");
    sampleIds.add(fixture.sampleId);

    if (fixture.scenarioId.trim() === "")
      add("missing-scenario-id", "scenarioId is required.");
    if (scenarioIds.has(fixture.scenarioId))
      add("duplicate-scenario-id", "scenarioId must be unique.");
    scenarioIds.add(fixture.scenarioId);

    if (fixture.languageProfile !== YORUBA_LANGUAGE_PROFILE) {
      add(
        "invalid-language-profile",
        "Fixture uses an unexpected language profile.",
      );
    }
    if (fixture.expectedIntent.trim() === "")
      add("missing-intent", "expectedIntent is required.");
    if (
      fixture.userUtterance.trim() === "" ||
      fixture.canonicalReferenceTranscript.trim() === ""
    ) {
      add("missing-transcript", "User and canonical transcripts are required.");
    }

    const strict = normalizeYorubaTranscript(
      fixture.canonicalReferenceTranscript,
      yorubaStrictNormalizationProfile,
    );
    const analysis = normalizeYorubaTranscript(
      fixture.canonicalReferenceTranscript,
      yorubaDiacriticInsensitiveAnalysisProfile,
    );
    if (fixture.normalizedReferenceTranscript.strict !== strict) {
      add(
        "stale-strict-normalization",
        "Strict normalized reference is stale.",
      );
    }
    if (
      fixture.normalizedReferenceTranscript.diacriticInsensitiveAnalysis !==
      analysis
    ) {
      add(
        "stale-analysis-normalization",
        "Analysis normalized reference is stale.",
      );
    }

    const present = new Set(fixture.requiredFieldsPresent);
    const missing = new Set(fixture.requiredFieldsMissing);
    for (const field of failedTransferRequiredFields) {
      if (present.has(field) === missing.has(field)) {
        add(
          "invalid-field-partition",
          `${field} must be present or missing, but not both.`,
        );
      }
      if (present.has(field) && fixture.expectedEntities[field] === undefined) {
        add(
          "missing-expected-entity",
          `${field} is marked present without a value.`,
        );
      }
      if (missing.has(field) && fixture.expectedEntities[field] !== undefined) {
        add("unexpected-entity", `${field} is marked missing but has a value.`);
      }
    }

    const isComplete = fixture.requiredFieldsMissing.length === 0;
    const isSuccessful =
      fixture.expectedFinalTaskResult ===
      "support-case-created-after-confirmation";
    if (
      isSuccessful &&
      (!isComplete ||
        fixture.expectedIntent !== "failed_transfer" ||
        fixture.expectedActionEligibility !==
          "eligible-after-explicit-confirmation" ||
        fixture.expectedConfirmation !== "required" ||
        fixture.expectedSafetyOutcome !== "accept-synthetic")
    ) {
      if (!isComplete) {
        add(
          "completed-with-missing-fields",
          "A completed task cannot have missing required fields.",
        );
      }
      add(
        "invalid-completed-outcome",
        "A completed task requires safe, complete failed-transfer data, eligibility, and explicit confirmation.",
      );
    }
    if (
      fixture.expectedActionEligibility ===
        "eligible-after-explicit-confirmation" &&
      (!isComplete ||
        fixture.expectedIntent !== "failed_transfer" ||
        fixture.expectedConfirmation !== "required" ||
        fixture.expectedSafetyOutcome !== "accept-synthetic")
    ) {
      add(
        "invalid-action-eligibility",
        "Eligible actions require complete safe failed-transfer data and confirmation.",
      );
    }
    if (
      fixture.expectedActionEligibility ===
        "eligible-after-explicit-confirmation" &&
      fixture.expectedFinalTaskResult !==
        "support-case-created-after-confirmation"
    ) {
      add(
        "invalid-task-outcome",
        "Eligible action must map to the confirmed support-case outcome.",
      );
    }
    if (
      fixture.expectedFinalTaskResult === "clarification-required" &&
      (isComplete ||
        fixture.expectedClarification === null ||
        fixture.expectedIntent !== "failed_transfer" ||
        fixture.expectedActionEligibility !== "not-eligible" ||
        fixture.expectedConfirmation !== "not-applicable" ||
        fixture.expectedSafetyOutcome !== "accept-synthetic")
    ) {
      add(
        "invalid-clarification",
        "Clarification requires missing fields and a clarification concept.",
      );
    }
    if (
      fixture.expectedClarification !== null &&
      !missing.has(fixture.expectedClarification.concept)
    ) {
      add(
        "clarification-not-missing",
        "Clarification concept must name a missing field.",
      );
    }
    if (containsCredentialDigits(fixture.userUtterance)) {
      add(
        "credential-value-in-fixture",
        "Fixtures must use a REDACTED placeholder, not credential digits.",
      );
    }
    if (fixture.expectedSafetyOutcome === "reject-sensitive") {
      if (
        fixture.sensitiveInputCategory === undefined ||
        fixture.expectedActionEligibility !== "not-eligible" ||
        fixture.expectedFinalTaskResult !== "rejected-sensitive"
      ) {
        add(
          "invalid-sensitive-outcome",
          "Sensitive fixtures must be rejected and ineligible.",
        );
      }
    }
    if (
      fixture.expectedSafetyOutcome === "accept-synthetic" &&
      fixture.sensitiveInputCategory !== undefined
    ) {
      add(
        "accepted-sensitive-input",
        "Accepted fixtures cannot carry a sensitive-input category.",
      );
    }
    if (containsSensitiveEntity(fixture.expectedEntities)) {
      add(
        "sensitive-retained-entity",
        "Expected entities cannot retain credential fields or long digit strings.",
      );
    }
  }

  return issues;
}

function containsCredentialDigits(value: string): boolean {
  return /\b(?:pin|otp|password|passcode|cvv|card number|account number)\b\D{0,16}\d{3,19}\b/iu.test(
    value,
  );
}

function containsSensitiveEntity(
  entities: Readonly<Record<string, JsonValue>>,
): boolean {
  const sensitiveKey =
    /pin|otp|password|passcode|cvv|cardnumber|accountnumber/iu;
  return Object.entries(entities).some(
    ([key, value]) =>
      sensitiveKey.test(key.replaceAll(/[_-]/gu, "")) ||
      (typeof value === "string" && /(?:\d[ -]?){10,19}/u.test(value)),
  );
}
