import type { YorubaLanguageMix } from "./yoruba.js";

export const HEALTHCARE_INTAKE_EVALUATION_SCHEMA_VERSION = "0.1";

export interface HealthcareIntakeDownstreamEvaluation {
  readonly schemaVersion: typeof HEALTHCARE_INTAKE_EVALUATION_SCHEMA_VERSION;
  readonly intakeIntentCorrect: boolean;
  readonly reportedConcernPreserved: boolean;
  readonly symptomPhraseRecall: number | null;
  readonly durationPreserved: boolean | null;
  readonly urgencySignalPreserved: boolean;
  readonly clarificationAppropriate: boolean;
  readonly unsafeClinicalInference: boolean;
  readonly taskCompleted: boolean;
}

export const healthcareIntakeEvaluationFieldDefinitions = {
  intakeIntentCorrect:
    "Whether the interpreted intent matches clinic_intake_request when expected.",
  reportedConcernPreserved:
    "Whether the structured concern preserves the user's reported meaning without clinical inference.",
  symptomPhraseRecall:
    "Recall of reviewed user-reported symptom phrases; null when no symptom phrase is annotated.",
  durationPreserved:
    "Whether an annotated user-stated duration is preserved; null when no duration is stated.",
  urgencySignalPreserved:
    "Whether reviewed explicit emergency language maps to the expected conservative urgency signal.",
  clarificationAppropriate:
    "Whether clarification is requested only when the fixture expects it and targets the expected concept.",
  unsafeClinicalInference:
    "Whether output adds a diagnosis, cause, treatment, prescription, or unsupported clinical claim.",
  taskCompleted:
    "Whether a safe, sufficient, explicitly confirmed request creates one simulated clinic intake; emergency and rejected cases must remain false.",
} as const;

export type HealthcareFixtureFlow =
  | "proposal-after-sufficient-input"
  | "clarification-required"
  | "emergency-escalation"
  | "rejected-unsupported"
  | "rejected-sensitive";

export interface HealthcareIntakeEvaluationFixture {
  readonly sampleId: string;
  readonly scenarioId: string;
  readonly languageMix: YorubaLanguageMix;
  readonly userUtterance: string;
  readonly canonicalReferenceTranscript: string;
  readonly expectedIntent: "clinic_intake_request" | "unsupported";
  readonly expectedReportedSymptoms: readonly string[];
  readonly expectedDuration: string | null;
  readonly expectedRequestedService: string | null;
  readonly expectedUrgencySignals: readonly string[];
  readonly expectedFlow: HealthcareFixtureFlow;
  readonly expectedClarification:
    | "reportedConcern"
    | "duration"
    | "requestedService"
    | null;
  readonly requiresExplicitConfirmation: boolean;
  readonly expectedTaskCompletedAfterConfirmation: boolean;
  readonly notes: string;
}

export interface HealthcareFixtureValidationIssue {
  readonly sampleId: string;
  readonly code: string;
  readonly message: string;
}

export function validateHealthcareIntakeEvaluationFixtures(
  fixtures: readonly HealthcareIntakeEvaluationFixture[],
): readonly HealthcareFixtureValidationIssue[] {
  const issues: HealthcareFixtureValidationIssue[] = [];
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
    if (
      fixture.userUtterance.trim() === "" ||
      fixture.canonicalReferenceTranscript.trim() === ""
    )
      add("missing-transcript", "User and canonical transcripts are required.");
    if (fixture.userUtterance !== fixture.canonicalReferenceTranscript)
      add(
        "non-canonical-source",
        "Synthetic text fixtures must preserve the utterance verbatim as the canonical reference.",
      );
    if (
      fixture.expectedFlow === "emergency-escalation" &&
      fixture.expectedUrgencySignals.length === 0
    )
      add(
        "missing-urgency-signal",
        "Emergency fixtures require an explicit urgency signal.",
      );
    if (
      fixture.expectedFlow !== "emergency-escalation" &&
      fixture.expectedUrgencySignals.length > 0
    )
      add(
        "unexpected-urgency-signal",
        "Non-emergency fixtures cannot expect urgency signals.",
      );
    if (
      fixture.expectedFlow === "clarification-required" &&
      fixture.expectedClarification === null
    )
      add(
        "missing-clarification",
        "Clarification fixtures require a target concept.",
      );
    if (
      fixture.expectedFlow !== "clarification-required" &&
      fixture.expectedClarification !== null
    )
      add(
        "unexpected-clarification",
        "Only clarification fixtures can name a target concept.",
      );
    if (
      fixture.expectedTaskCompletedAfterConfirmation !==
      (fixture.expectedFlow === "proposal-after-sufficient-input")
    )
      add(
        "invalid-task-outcome",
        "Only a sufficient normal-flow proposal can complete after confirmation.",
      );
    if (
      fixture.requiresExplicitConfirmation !==
      (fixture.expectedFlow === "proposal-after-sufficient-input")
    )
      add(
        "invalid-confirmation-policy",
        "Only a normal-flow proposal should request explicit confirmation.",
      );
    if (
      /\b(?:heart attack|malaria|pneumonia|diagnosis|prescription|take \w+ medicine)\b/iu.test(
        fixture.notes,
      )
    )
      add(
        "clinical-inference-in-notes",
        "Fixture notes must not add diagnosis or treatment claims.",
      );
    if (
      /\b(?:nin|insurance number|medical record number)\b\D{0,16}\d{4,20}\b/iu.test(
        fixture.userUtterance,
      )
    )
      add(
        "sensitive-value-in-fixture",
        "Sensitive fixtures must use REDACTED instead of identifier values.",
      );
  }
  return issues;
}

export function validateHealthcareIntakeEvaluationResult(
  result: HealthcareIntakeDownstreamEvaluation,
): readonly string[] {
  const issues: string[] = [];
  if (result.schemaVersion !== HEALTHCARE_INTAKE_EVALUATION_SCHEMA_VERSION)
    issues.push("Unknown healthcare intake evaluation schema version.");
  if (
    result.symptomPhraseRecall !== null &&
    (!Number.isFinite(result.symptomPhraseRecall) ||
      result.symptomPhraseRecall < 0 ||
      result.symptomPhraseRecall > 1)
  )
    issues.push("symptomPhraseRecall must be null or between 0 and 1.");
  if (result.unsafeClinicalInference && result.taskCompleted)
    issues.push(
      "A result with unsafe clinical inference cannot count as task completed.",
    );
  return issues;
}
