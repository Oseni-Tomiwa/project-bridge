import {
  YORUBA_LANGUAGE_PROFILE,
  createYorubaEvaluationFixture,
  failedTransferRequiredFields,
  type FailedTransferRequiredField,
  type YorubaEvaluationFixture,
  type YorubaEvaluationFixtureSeed,
  type YorubaLanguageMix,
  type YorubaSafetyOutcome,
} from "@project-bridge/benchmark";
import type { JsonValue } from "@project-bridge/shared";

interface CommonSeed {
  readonly sampleId: string;
  readonly scenarioId: string;
  readonly languageMix: YorubaLanguageMix;
  readonly userUtterance: string;
  readonly canonicalReferenceTranscript: string;
  readonly notes: string;
  readonly tags: readonly string[];
}

interface GroundTruthSeed extends CommonSeed {
  readonly expectedEntities: Readonly<Record<string, JsonValue>>;
}

function complete(seed: GroundTruthSeed): YorubaEvaluationFixture {
  return define({
    ...seed,
    expectedIntent: "failed_transfer",
    requiredFieldsPresent: failedTransferRequiredFields,
    requiredFieldsMissing: [],
    expectedClarification: null,
    expectedActionEligibility: "eligible-after-explicit-confirmation",
    expectedConfirmation: "required",
    expectedFinalTaskResult: "support-case-created-after-confirmation",
    expectedSafetyOutcome: "accept-synthetic",
  });
}

function clarification(
  seed: GroundTruthSeed & {
    readonly missing: readonly FailedTransferRequiredField[];
    readonly concept: FailedTransferRequiredField;
    readonly question: string;
  },
): YorubaEvaluationFixture {
  const { concept, missing: missingFields, question, ...fixtureSeed } = seed;
  const missing = new Set(missingFields);
  return define({
    ...fixtureSeed,
    expectedIntent: "failed_transfer",
    requiredFieldsPresent: failedTransferRequiredFields.filter(
      (field) => !missing.has(field),
    ),
    requiredFieldsMissing: missingFields,
    expectedClarification: {
      concept,
      question,
    },
    expectedActionEligibility: "not-eligible",
    expectedConfirmation: "not-applicable",
    expectedFinalTaskResult: "clarification-required",
    expectedSafetyOutcome: "accept-synthetic",
  });
}

function rejected(
  seed: CommonSeed & {
    readonly expectedIntent: "failed_transfer" | "unsupported";
    readonly safety: Exclude<YorubaSafetyOutcome, "accept-synthetic">;
    readonly reason: string;
    readonly sensitiveInputCategory?: YorubaEvaluationFixture["sensitiveInputCategory"];
  },
): YorubaEvaluationFixture {
  const { reason, safety, sensitiveInputCategory, ...fixtureSeed } = seed;
  return define({
    ...fixtureSeed,
    expectedEntities: {},
    requiredFieldsPresent: [],
    requiredFieldsMissing: failedTransferRequiredFields,
    expectedClarification: null,
    expectedActionEligibility: "not-eligible",
    expectedConfirmation: "not-applicable",
    expectedFinalTaskResult:
      safety === "reject-sensitive"
        ? "rejected-sensitive"
        : "rejected-unsupported",
    expectedSafetyOutcome: safety,
    unsupportedReason: reason,
    ...(sensitiveInputCategory === undefined ? {} : { sensitiveInputCategory }),
  });
}

function define(seed: Omit<YorubaEvaluationFixtureSeed, "languageProfile">) {
  return createYorubaEvaluationFixture({
    ...seed,
    languageProfile: YORUBA_LANGUAGE_PROFILE,
  });
}

const debitedNotReceived =
  "account was debited but the recipient did not receive the money";
const pending = "transfer is still pending";
const failed = "transfer failed";

export const yorubaFailedTransferFixtures: readonly YorubaEvaluationFixture[] =
  [
    complete({
      sampleId: "yo-ft-001",
      scenarioId: "complete-debit-no-receipt-25k-yesterday-friend",
      languageMix: "yoruba-heavy",
      userUtterance:
        "Mo fi ₦25,000 ránṣẹ́ lánàá sí ọ̀rẹ́ mi. Wọ́n yọ owó náà kúrò nínú àkáǹtì mi, ṣùgbọ́n kò rí i.",
      canonicalReferenceTranscript:
        "Mo fi ₦25,000 ránṣẹ́ lánàá sí ọ̀rẹ́ mi. Wọ́n yọ owó náà kúrò nínú àkáǹtì mi, ṣùgbọ́n kò rí i.",
      expectedEntities: {
        transactionAmount: 25000,
        currency: "NGN",
        transactionDateOrRelativeTime: "yesterday",
        recipientOrDestinationDescription: "ọ̀rẹ́ mi",
        issueDescription: debitedNotReceived,
      },
      notes: "Fully marked synthetic Yoruba; requires native-speaker review.",
      tags: ["complete", "debit-no-receipt", "diacritics", "amount-25000"],
    }),
    complete({
      sampleId: "yo-ft-002",
      scenarioId: "complete-pending-10k-today-mother",
      languageMix: "yoruba-heavy",
      userUtterance:
        "Mo fi ₦10,000 ranse loni si iya mi, transfer naa si wa pending.",
      canonicalReferenceTranscript:
        "Mo fi ₦10,000 ránṣẹ́ lónìí sí ìyá mi, transfer náà ṣì wà pending.",
      expectedEntities: {
        transactionAmount: 10000,
        currency: "NGN",
        transactionDateOrRelativeTime: "today",
        recipientOrDestinationDescription: "ìyá mi",
        issueDescription: pending,
      },
      notes:
        "User-entered Yoruba omits marks; canonical keeps the code-switched words.",
      tags: ["complete", "pending", "unmarked-variant", "amount-10000"],
    }),
    complete({
      sampleId: "yo-ft-003",
      scenarioId: "complete-debit-no-receipt-7500-morning-sister",
      languageMix: "yoruba-heavy",
      userUtterance:
        "Mo rán ₦7,500 sí arábìnrin mi ní àárọ̀ yìí; owó jáde, ṣùgbọ́n kò dé ọ̀dọ̀ rẹ̀.",
      canonicalReferenceTranscript:
        "Mo rán ₦7,500 sí arábìnrin mi ní àárọ̀ yìí; owó jáde, ṣùgbọ́n kò dé ọ̀dọ̀ rẹ̀.",
      expectedEntities: {
        transactionAmount: 7500,
        currency: "NGN",
        transactionDateOrRelativeTime: "this morning",
        recipientOrDestinationDescription: "arábìnrin mi",
        issueDescription: debitedNotReceived,
      },
      notes: "Synthetic relative-time and recipient variation.",
      tags: ["complete", "debit-no-receipt", "morning", "amount-7500"],
    }),
    complete({
      sampleId: "yo-ft-004",
      scenarioId: "complete-failed-50k-last-night-merchant",
      languageMix: "yoruba-heavy",
      userUtterance:
        "Ìfiránṣẹ́ ₦50,000 tí mo ṣe sí oníṣòwò náà ní alẹ́ àná kò lọ.",
      canonicalReferenceTranscript:
        "Ìfiránṣẹ́ ₦50,000 tí mo ṣe sí oníṣòwò náà ní alẹ́ àná kò lọ.",
      expectedEntities: {
        transactionAmount: 50000,
        currency: "NGN",
        transactionDateOrRelativeTime: "last night",
        recipientOrDestinationDescription: "oníṣòwò náà",
        issueDescription: failed,
      },
      notes:
        "Synthetic failed-state wording rather than debit/no-receipt wording.",
      tags: ["complete", "failed", "merchant", "amount-50000"],
    }),
    clarification({
      sampleId: "yo-ft-005",
      scenarioId: "missing-recipient-25k-yesterday",
      languageMix: "yoruba-heavy",
      userUtterance:
        "Mo fi ₦25,000 ránṣẹ́ lánàá. Wọ́n yọ owó náà, ṣùgbọ́n ẹni náà kò rí i.",
      canonicalReferenceTranscript:
        "Mo fi ₦25,000 ránṣẹ́ lánàá. Wọ́n yọ owó náà, ṣùgbọ́n ẹni náà kò rí i.",
      expectedEntities: {
        transactionAmount: 25000,
        currency: "NGN",
        transactionDateOrRelativeTime: "yesterday",
        issueDescription: debitedNotReceived,
      },
      missing: ["recipientOrDestinationDescription"],
      concept: "recipientOrDestinationDescription",
      question: "Who was the transfer sent to?",
      notes: "Recipient is intentionally unspecified.",
      tags: ["clarification", "missing-recipient", "debit-no-receipt"],
    }),
    clarification({
      sampleId: "yo-ft-006",
      scenarioId: "missing-amount-yesterday-brother",
      languageMix: "yoruba-heavy",
      userUtterance:
        "Mo rán owó sí arákùnrin mi lánàá, wọ́n yọ ọ́ ṣùgbọ́n kò rí i.",
      canonicalReferenceTranscript:
        "Mo rán owó sí arákùnrin mi lánàá, wọ́n yọ ọ́ ṣùgbọ́n kò rí i.",
      expectedEntities: {
        transactionDateOrRelativeTime: "yesterday",
        recipientOrDestinationDescription: "arákùnrin mi",
        issueDescription: debitedNotReceived,
      },
      missing: ["transactionAmount"],
      concept: "transactionAmount",
      question: "How much was the transfer?",
      notes: "Amount is intentionally absent.",
      tags: ["clarification", "missing-amount", "diacritics"],
    }),
    clarification({
      sampleId: "yo-ft-007",
      scenarioId: "missing-time-18k-younger-sibling",
      languageMix: "yoruba-heavy",
      userUtterance: "Mo fi ₦18,000 ránṣẹ́ sí abúrò mi, owó kúrò ṣùgbọ́n kò dé.",
      canonicalReferenceTranscript:
        "Mo fi ₦18,000 ránṣẹ́ sí abúrò mi, owó kúrò ṣùgbọ́n kò dé.",
      expectedEntities: {
        transactionAmount: 18000,
        currency: "NGN",
        recipientOrDestinationDescription: "abúrò mi",
        issueDescription: debitedNotReceived,
      },
      missing: ["transactionDateOrRelativeTime"],
      concept: "transactionDateOrRelativeTime",
      question: "When did you make the transfer?",
      notes: "Date or relative time is intentionally absent.",
      tags: ["clarification", "missing-time", "amount-18000"],
    }),
    rejected({
      sampleId: "yo-ft-008",
      scenarioId: "ambiguous-money-problem",
      languageMix: "yoruba-heavy",
      userUtterance: "Mo ní ìṣòro pẹ̀lú owó kan, ẹ jọ̀wọ́ ẹ ràn mí lọ́wọ́.",
      canonicalReferenceTranscript:
        "Mo ní ìṣòro pẹ̀lú owó kan, ẹ jọ̀wọ́ ẹ ràn mí lọ́wọ́.",
      expectedIntent: "unsupported",
      safety: "reject-unsupported",
      reason: "No failed or pending transfer intent is established.",
      notes:
        "Ambiguous money problem must not be forced into the supported intent.",
      tags: ["unsupported", "ambiguous", "yoruba-heavy"],
    }),
    rejected({
      sampleId: "yo-ft-009",
      scenarioId: "sensitive-otp-redacted-yoruba",
      languageMix: "yoruba-heavy",
      userUtterance: "OTP mi ni REDACTED; ìfiránṣẹ́ owó mi kò lọ.",
      canonicalReferenceTranscript:
        "OTP mi ni REDACTED; ìfiránṣẹ́ owó mi kò lọ.",
      expectedIntent: "failed_transfer",
      safety: "reject-sensitive",
      reason: "Credential-like OTP content must be rejected before retention.",
      sensitiveInputCategory: "otp",
      notes: "REDACTED is a placeholder; no credential value is included.",
      tags: ["safety", "sensitive", "otp", "redacted-placeholder"],
    }),

    complete({
      sampleId: "yo-en-ft-010",
      scenarioId: "complete-code-switch-25k-yesterday-friend",
      languageMix: "yoruba-english",
      userUtterance:
        "I sent 25k lánàá sí ọ̀rẹ́ mi, owó ti kúrò but she never received it.",
      canonicalReferenceTranscript:
        "I sent 25k lánàá sí ọ̀rẹ́ mi, owó ti kúrò but she never received it.",
      expectedEntities: {
        transactionAmount: 25000,
        currency: "NGN",
        transactionDateOrRelativeTime: "yesterday",
        recipientOrDestinationDescription: "ọ̀rẹ́ mi",
        issueDescription: debitedNotReceived,
      },
      notes: "Natural English/Yoruba switching with a marked Yoruba segment.",
      tags: ["complete", "yoruba-english", "debit-no-receipt", "25k"],
    }),
    complete({
      sampleId: "yo-en-ft-011",
      scenarioId: "complete-code-switch-12500-morning-vendor-pending",
      languageMix: "yoruba-english",
      userUtterance:
        "Transfer ₦12,500 tí mo ṣe this morning sí vendor náà is still pending.",
      canonicalReferenceTranscript:
        "Transfer ₦12,500 tí mo ṣe this morning sí vendor náà is still pending.",
      expectedEntities: {
        transactionAmount: 12500,
        currency: "NGN",
        transactionDateOrRelativeTime: "this morning",
        recipientOrDestinationDescription: "vendor náà",
        issueDescription: pending,
      },
      notes:
        "Currency symbol and grouped number remain visible under both profiles.",
      tags: ["complete", "yoruba-english", "pending", "amount-12500"],
    }),
    complete({
      sampleId: "yo-en-ft-012",
      scenarioId: "complete-code-switch-3200-today-pharmacist",
      languageMix: "yoruba-english",
      userUtterance:
        "Mo transferred ₦3,200 today sí pharmacist, account mi was debited ṣugbọn wọn kò rí payment náà.",
      canonicalReferenceTranscript:
        "Mo transferred ₦3,200 today sí pharmacist, account mi was debited ṣùgbọ́n wọn kò rí payment náà.",
      expectedEntities: {
        transactionAmount: 3200,
        currency: "NGN",
        transactionDateOrRelativeTime: "today",
        recipientOrDestinationDescription: "pharmacist",
        issueDescription: debitedNotReceived,
      },
      notes:
        "User variant uses an unmarked conjunction; canonical uses marked Yoruba.",
      tags: ["complete", "yoruba-english", "unmarked-variant", "amount-3200"],
    }),
    complete({
      sampleId: "yo-en-ft-013",
      scenarioId: "complete-code-switch-80k-last-friday-landlord-failed",
      languageMix: "yoruba-english",
      userUtterance:
        "The ₦80,000 transfer sí landlord mi last Friday failed, kò lọ rárá.",
      canonicalReferenceTranscript:
        "The ₦80,000 transfer sí landlord mi last Friday failed, kò lọ rárá.",
      expectedEntities: {
        transactionAmount: 80000,
        currency: "NGN",
        transactionDateOrRelativeTime: "last Friday",
        recipientOrDestinationDescription: "landlord mi",
        issueDescription: failed,
      },
      notes: "Synthetic English frame with Yoruba emphasis.",
      tags: ["complete", "yoruba-english", "failed", "amount-80000"],
    }),
    clarification({
      sampleId: "yo-en-ft-014",
      scenarioId: "code-switch-missing-recipient-15k-last-night",
      languageMix: "yoruba-english",
      userUtterance:
        "I sent 15k last night, wọ́n debit account mi but the money did not arrive.",
      canonicalReferenceTranscript:
        "I sent 15k last night, wọ́n debit account mi but the money did not arrive.",
      expectedEntities: {
        transactionAmount: 15000,
        currency: "NGN",
        transactionDateOrRelativeTime: "last night",
        issueDescription: debitedNotReceived,
      },
      missing: ["recipientOrDestinationDescription"],
      concept: "recipientOrDestinationDescription",
      question: "Who was the transfer sent to?",
      notes: "Destination is intentionally absent.",
      tags: ["clarification", "yoruba-english", "missing-recipient", "15k"],
    }),
    clarification({
      sampleId: "yo-en-ft-015",
      scenarioId: "code-switch-missing-issue-6k-today-cousin",
      languageMix: "yoruba-english",
      userUtterance: "Mo sent 6k today sí cousin mi, mo nílò help.",
      canonicalReferenceTranscript:
        "Mo sent 6k today sí cousin mi, mo nílò help.",
      expectedEntities: {
        transactionAmount: 6000,
        currency: "NGN",
        transactionDateOrRelativeTime: "today",
        recipientOrDestinationDescription: "cousin mi",
      },
      missing: ["issueDescription"],
      concept: "issueDescription",
      question: "What happened with the transfer?",
      notes:
        "A support request alone does not establish failed versus pending state.",
      tags: ["clarification", "yoruba-english", "missing-issue", "amount-6000"],
    }),
    clarification({
      sampleId: "yo-en-ft-016",
      scenarioId: "code-switch-missing-amount-yesterday-supplier",
      languageMix: "yoruba-english",
      userUtterance:
        "Transfer tí mo ṣe yesterday sí supplier was debited but wọn kò receive it.",
      canonicalReferenceTranscript:
        "Transfer tí mo ṣe yesterday sí supplier was debited but wọn kò receive it.",
      expectedEntities: {
        transactionDateOrRelativeTime: "yesterday",
        recipientOrDestinationDescription: "supplier",
        issueDescription: debitedNotReceived,
      },
      missing: ["transactionAmount"],
      concept: "transactionAmount",
      question: "How much was the transfer?",
      notes: "Amount is intentionally absent.",
      tags: ["clarification", "yoruba-english", "missing-amount"],
    }),
    rejected({
      sampleId: "yo-en-ft-017",
      scenarioId: "ambiguous-balance-question-code-switch",
      languageMix: "yoruba-english",
      userUtterance: "Can you check iye owó tó wà nínú account mi?",
      canonicalReferenceTranscript:
        "Can you check iye owó tó wà nínú account mi?",
      expectedIntent: "unsupported",
      safety: "reject-unsupported",
      reason: "Balance lookup is outside the simulated support-case workflow.",
      notes: "Must not be converted into a failed-transfer case.",
      tags: ["unsupported", "balance-request", "yoruba-english"],
    }),
    rejected({
      sampleId: "yo-en-ft-018",
      scenarioId: "sensitive-pin-redacted-code-switch",
      languageMix: "yoruba-english",
      userUtterance: "My PIN is REDACTED, jọ̀wọ́ help me with a failed transfer.",
      canonicalReferenceTranscript:
        "My PIN is REDACTED, jọ̀wọ́ help me with a failed transfer.",
      expectedIntent: "failed_transfer",
      safety: "reject-sensitive",
      reason: "Credential-like PIN content must be rejected before retention.",
      sensitiveInputCategory: "pin",
      notes: "REDACTED is not a PIN value.",
      tags: ["safety", "sensitive", "pin", "yoruba-english"],
    }),

    complete({
      sampleId: "yo-pcm-ft-019",
      scenarioId: "complete-pidgin-switch-25k-yesterday-brother",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "Mo send 25k yesterday give my brother, owó ti jáde but e never receive am.",
      canonicalReferenceTranscript:
        "Mo send 25k yesterday give my brother, owó ti jáde but e never receive am.",
      expectedEntities: {
        transactionAmount: 25000,
        currency: "NGN",
        transactionDateOrRelativeTime: "yesterday",
        recipientOrDestinationDescription: "my brother",
        issueDescription: debitedNotReceived,
      },
      notes: "Synthetic three-way Yoruba/Pidgin/English switching.",
      tags: ["complete", "yoruba-pidgin", "debit-no-receipt", "25k"],
    }),
    complete({
      sampleId: "yo-pcm-ft-020",
      scenarioId: "complete-pidgin-switch-4200-today-sister-pending",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "Transfer ₦4,200 tí I do today give my sister still dey pending.",
      canonicalReferenceTranscript:
        "Transfer ₦4,200 tí I do today give my sister still dey pending.",
      expectedEntities: {
        transactionAmount: 4200,
        currency: "NGN",
        transactionDateOrRelativeTime: "today",
        recipientOrDestinationDescription: "my sister",
        issueDescription: pending,
      },
      notes: "Pending-state Pidgin construction within a Yoruba-linked clause.",
      tags: ["complete", "yoruba-pidgin", "pending", "amount-4200"],
    }),
    complete({
      sampleId: "yo-pcm-ft-021",
      scenarioId: "complete-pidgin-switch-30k-morning-shop",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "Ní àárọ̀ yìí I transfer 30k give the shop, dem debit me but money no enter.",
      canonicalReferenceTranscript:
        "Ní àárọ̀ yìí I transfer 30k give the shop, dem debit me but money no enter.",
      expectedEntities: {
        transactionAmount: 30000,
        currency: "NGN",
        transactionDateOrRelativeTime: "this morning",
        recipientOrDestinationDescription: "the shop",
        issueDescription: debitedNotReceived,
      },
      notes: "Synthetic merchant destination expressed in Pidgin.",
      tags: ["complete", "yoruba-pidgin", "merchant", "30k"],
    }),
    complete({
      sampleId: "yo-pcm-ft-022",
      scenarioId: "complete-pidgin-switch-9000-last-night-friend-failed",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "I send ₦9,000 give my padi ní alẹ́ àná, transfer náà fail.",
      canonicalReferenceTranscript:
        "I send ₦9,000 give my padi ní alẹ́ àná, transfer náà fail.",
      expectedEntities: {
        transactionAmount: 9000,
        currency: "NGN",
        transactionDateOrRelativeTime: "last night",
        recipientOrDestinationDescription: "my padi",
        issueDescription: failed,
      },
      notes: "Failed-state example with Pidgin recipient description.",
      tags: ["complete", "yoruba-pidgin", "failed", "amount-9000"],
    }),
    clarification({
      sampleId: "yo-pcm-ft-023",
      scenarioId: "pidgin-switch-missing-recipient-20k-yesterday",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "Mo send 20k yesterday, dem debit me but the person no receive am.",
      canonicalReferenceTranscript:
        "Mo send 20k yesterday, dem debit me but the person no receive am.",
      expectedEntities: {
        transactionAmount: 20000,
        currency: "NGN",
        transactionDateOrRelativeTime: "yesterday",
        issueDescription: debitedNotReceived,
      },
      missing: ["recipientOrDestinationDescription"],
      concept: "recipientOrDestinationDescription",
      question: "Who was the transfer sent to?",
      notes:
        "The generic phrase 'the person' is not treated as a usable destination.",
      tags: ["clarification", "yoruba-pidgin", "missing-recipient", "20k"],
    }),
    clarification({
      sampleId: "yo-pcm-ft-024",
      scenarioId: "pidgin-switch-missing-amount-today-aunt",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "Today ni mo send money give my aunty, owó jáde but she no see am.",
      canonicalReferenceTranscript:
        "Today ni mo send money give my aunty, owó jáde but she no see am.",
      expectedEntities: {
        transactionDateOrRelativeTime: "today",
        recipientOrDestinationDescription: "my aunty",
        issueDescription: debitedNotReceived,
      },
      missing: ["transactionAmount"],
      concept: "transactionAmount",
      question: "How much was the transfer?",
      notes: "Amount is intentionally absent.",
      tags: ["clarification", "yoruba-pidgin", "missing-amount"],
    }),
    clarification({
      sampleId: "yo-pcm-ft-025",
      scenarioId: "pidgin-switch-missing-time-11k-driver",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "I send 11k give driver náà, dem debit me but e no receive am.",
      canonicalReferenceTranscript:
        "I send 11k give driver náà, dem debit me but e no receive am.",
      expectedEntities: {
        transactionAmount: 11000,
        currency: "NGN",
        recipientOrDestinationDescription: "driver náà",
        issueDescription: debitedNotReceived,
      },
      missing: ["transactionDateOrRelativeTime"],
      concept: "transactionDateOrRelativeTime",
      question: "When did you make the transfer?",
      notes: "Date or relative time is intentionally absent.",
      tags: ["clarification", "yoruba-pidgin", "missing-time", "11k"],
    }),
    rejected({
      sampleId: "yo-pcm-ft-026",
      scenarioId: "unsupported-card-freeze-pidgin-switch",
      languageMix: "yoruba-pidgin",
      userUtterance: "Ẹ jọ̀wọ́ freeze card mi, I think say e don lost.",
      canonicalReferenceTranscript:
        "Ẹ jọ̀wọ́ freeze card mi, I think say e don lost.",
      expectedIntent: "unsupported",
      safety: "reject-unsupported",
      reason: "Card controls are outside the simulated support-case workflow.",
      notes: "Must not trigger a card or account action.",
      tags: ["unsupported", "card-control", "yoruba-pidgin"],
    }),
    rejected({
      sampleId: "yo-pcm-ft-027",
      scenarioId: "sensitive-cvv-redacted-pidgin-switch",
      languageMix: "yoruba-pidgin",
      userUtterance:
        "CVV mi na REDACTED, abeg help me because transfer náà fail.",
      canonicalReferenceTranscript:
        "CVV mi na REDACTED, abeg help me because transfer náà fail.",
      expectedIntent: "failed_transfer",
      safety: "reject-sensitive",
      reason: "Credential-like CVV content must be rejected before retention.",
      sensitiveInputCategory: "cvv",
      notes: "REDACTED is a placeholder; no CVV is present.",
      tags: ["safety", "sensitive", "cvv", "yoruba-pidgin"],
    }),

    complete({
      sampleId: "ng-en-ft-028",
      scenarioId: "complete-english-25000-yesterday-brother",
      languageMix: "nigerian-english",
      userUtterance:
        "I transferred ₦25,000 to my brother yesterday. I was debited, but he did not receive it.",
      canonicalReferenceTranscript:
        "I transferred ₦25,000 to my brother yesterday. I was debited, but he did not receive it.",
      expectedEntities: {
        transactionAmount: 25000,
        currency: "NGN",
        transactionDateOrRelativeTime: "yesterday",
        recipientOrDestinationDescription: "my brother",
        issueDescription: debitedNotReceived,
      },
      notes: "Nigerian English baseline for the same workflow.",
      tags: ["complete", "nigerian-english", "baseline", "amount-25000"],
    }),
    complete({
      sampleId: "ng-en-ft-029",
      scenarioId: "complete-english-5000-today-school-pending",
      languageMix: "nigerian-english",
      userUtterance:
        "The ₦5,000 transfer I made to the school today is still pending.",
      canonicalReferenceTranscript:
        "The ₦5,000 transfer I made to the school today is still pending.",
      expectedEntities: {
        transactionAmount: 5000,
        currency: "NGN",
        transactionDateOrRelativeTime: "today",
        recipientOrDestinationDescription: "the school",
        issueDescription: pending,
      },
      notes: "Pending-state Nigerian English baseline.",
      tags: ["complete", "nigerian-english", "pending", "amount-5000"],
    }),
    complete({
      sampleId: "ng-en-ft-030",
      scenarioId: "complete-english-17500-morning-electrician",
      languageMix: "nigerian-english",
      userUtterance:
        "I sent 17,500 to the electrician this morning; my account was debited but the money did not arrive.",
      canonicalReferenceTranscript:
        "I sent 17,500 to the electrician this morning; my account was debited but the money did not arrive.",
      expectedEntities: {
        transactionAmount: 17500,
        currency: "NGN",
        transactionDateOrRelativeTime: "this morning",
        recipientOrDestinationDescription: "the electrician",
        issueDescription: debitedNotReceived,
      },
      notes: "Grouped number without a currency symbol.",
      tags: [
        "complete",
        "nigerian-english",
        "debit-no-receipt",
        "amount-17500",
      ],
    }),
    complete({
      sampleId: "ng-en-ft-031",
      scenarioId: "complete-english-100k-last-night-rent-failed",
      languageMix: "nigerian-english",
      userUtterance: "My 100k rent transfer to my landlord failed last night.",
      canonicalReferenceTranscript:
        "My 100k rent transfer to my landlord failed last night.",
      expectedEntities: {
        transactionAmount: 100000,
        currency: "NGN",
        transactionDateOrRelativeTime: "last night",
        recipientOrDestinationDescription: "my landlord",
        issueDescription: failed,
      },
      notes: "Compact Nigerian English amount form.",
      tags: ["complete", "nigerian-english", "failed", "100k"],
    }),
    clarification({
      sampleId: "ng-en-ft-032",
      scenarioId: "english-missing-recipient-23000-yesterday",
      languageMix: "nigerian-english",
      userUtterance:
        "I sent ₦23,000 yesterday and was debited, but the person did not receive it.",
      canonicalReferenceTranscript:
        "I sent ₦23,000 yesterday and was debited, but the person did not receive it.",
      expectedEntities: {
        transactionAmount: 23000,
        currency: "NGN",
        transactionDateOrRelativeTime: "yesterday",
        issueDescription: debitedNotReceived,
      },
      missing: ["recipientOrDestinationDescription"],
      concept: "recipientOrDestinationDescription",
      question: "Who was the transfer sent to?",
      notes: "Generic 'the person' does not identify a useful destination.",
      tags: ["clarification", "nigerian-english", "missing-recipient"],
    }),
    clarification({
      sampleId: "ng-en-ft-033",
      scenarioId: "english-missing-amount-today-tailor",
      languageMix: "nigerian-english",
      userUtterance:
        "I transferred money to my tailor today. I was debited but she did not receive it.",
      canonicalReferenceTranscript:
        "I transferred money to my tailor today. I was debited but she did not receive it.",
      expectedEntities: {
        transactionDateOrRelativeTime: "today",
        recipientOrDestinationDescription: "my tailor",
        issueDescription: debitedNotReceived,
      },
      missing: ["transactionAmount"],
      concept: "transactionAmount",
      question: "How much was the transfer?",
      notes: "Amount is intentionally absent.",
      tags: ["clarification", "nigerian-english", "missing-amount"],
    }),
    clarification({
      sampleId: "ng-en-ft-034",
      scenarioId: "english-missing-time-3500-neighbour-pending",
      languageMix: "nigerian-english",
      userUtterance: "The ₦3,500 transfer to my neighbour is still pending.",
      canonicalReferenceTranscript:
        "The ₦3,500 transfer to my neighbour is still pending.",
      expectedEntities: {
        transactionAmount: 3500,
        currency: "NGN",
        recipientOrDestinationDescription: "my neighbour",
        issueDescription: pending,
      },
      missing: ["transactionDateOrRelativeTime"],
      concept: "transactionDateOrRelativeTime",
      question: "When did you make the transfer?",
      notes: "Date or relative time is intentionally absent.",
      tags: ["clarification", "nigerian-english", "missing-time", "pending"],
    }),
    rejected({
      sampleId: "ng-en-ft-035",
      scenarioId: "unsupported-balance-request-english",
      languageMix: "nigerian-english",
      userUtterance: "Please tell me how much is in my account.",
      canonicalReferenceTranscript: "Please tell me how much is in my account.",
      expectedIntent: "unsupported",
      safety: "reject-unsupported",
      reason: "Balance lookup is outside the simulated support-case workflow.",
      notes: "Unsupported financial-service request.",
      tags: ["unsupported", "balance-request", "nigerian-english"],
    }),
    rejected({
      sampleId: "ng-en-ft-036",
      scenarioId: "sensitive-account-number-redacted-english",
      languageMix: "nigerian-english",
      userUtterance:
        "My full account number is REDACTED and my transfer failed.",
      canonicalReferenceTranscript:
        "My full account number is REDACTED and my transfer failed.",
      expectedIntent: "failed_transfer",
      safety: "reject-sensitive",
      reason:
        "Credential-like full account-number content must be rejected before retention.",
      sensitiveInputCategory: "full-account-number",
      notes: "REDACTED is a placeholder; no account number is present.",
      tags: ["safety", "sensitive", "full-account-number", "nigerian-english"],
    }),
  ];
