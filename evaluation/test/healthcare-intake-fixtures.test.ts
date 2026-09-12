import { describe, expect, it } from "vitest";

import {
  HEALTHCARE_INTAKE_EVALUATION_SCHEMA_VERSION,
  healthcareIntakeEvaluationFieldDefinitions,
  validateHealthcareIntakeEvaluationFixtures,
  validateHealthcareIntakeEvaluationResult,
  type HealthcareIntakeDownstreamEvaluation,
} from "@project-bridge/benchmark";
import { yorubaHealthcareIntakeFixtures } from "../fixtures/yoruba-healthcare-intake.v0.1.mjs";
import { yorubaHealthcareIntakeManifest } from "../manifests/yoruba-healthcare-intake.v0.1.mjs";

describe("healthcare intake evaluation fixtures", () => {
  it("contains four scenarios for each declared language mix", () => {
    expect(yorubaHealthcareIntakeFixtures).toHaveLength(16);
    const counts = yorubaHealthcareIntakeFixtures.reduce<
      Record<string, number>
    >(
      (result, { languageMix }) => ({
        ...result,
        [languageMix]: (result[languageMix] ?? 0) + 1,
      }),
      {},
    );
    expect(counts).toEqual({
      "yoruba-heavy": 4,
      "yoruba-english": 4,
      "yoruba-pidgin": 4,
      "nigerian-english": 4,
    });
  });

  it("passes strict fixture validation", () => {
    expect(
      validateHealthcareIntakeEvaluationFixtures(
        yorubaHealthcareIntakeFixtures,
      ),
    ).toEqual([]);
  });

  it("covers normal, clarification, emergency, unsupported, ambiguous, and sensitive flows", () => {
    const flows = new Set(
      yorubaHealthcareIntakeFixtures.map(({ expectedFlow }) => expectedFlow),
    );
    expect(flows).toEqual(
      new Set([
        "proposal-after-sufficient-input",
        "clarification-required",
        "emergency-escalation",
        "rejected-unsupported",
        "rejected-sensitive",
      ]),
    );
    expect(
      yorubaHealthcareIntakeFixtures.some(({ scenarioId }) =>
        scenarioId.includes("ambiguous"),
      ),
    ).toBe(true);
  });

  it("indexes fixtures without claiming audio or real clinical action", () => {
    expect(yorubaHealthcareIntakeManifest).toMatchObject({
      schemaVersion: HEALTHCARE_INTAKE_EVALUATION_SCHEMA_VERSION,
      activeChallengeDomain: "healthcare-intake",
      downstreamSystem: "simulated-in-memory-clinic-intake",
      audio: { status: "not-collected", assets: [] },
    });
    expect(yorubaHealthcareIntakeManifest.fixtureIds).toEqual(
      yorubaHealthcareIntakeFixtures.map(({ sampleId }) => sampleId),
    );
  });

  it("defines and validates the downstream comparison fields", () => {
    expect(Object.keys(healthcareIntakeEvaluationFieldDefinitions)).toEqual([
      "intakeIntentCorrect",
      "reportedConcernPreserved",
      "symptomPhraseRecall",
      "durationPreserved",
      "urgencySignalPreserved",
      "clarificationAppropriate",
      "unsafeClinicalInference",
      "taskCompleted",
    ]);
    const result: HealthcareIntakeDownstreamEvaluation = {
      schemaVersion: "0.1",
      intakeIntentCorrect: true,
      reportedConcernPreserved: true,
      symptomPhraseRecall: 1,
      durationPreserved: true,
      urgencySignalPreserved: true,
      clarificationAppropriate: true,
      unsafeClinicalInference: false,
      taskCompleted: true,
    };
    expect(validateHealthcareIntakeEvaluationResult(result)).toEqual([]);
    expect(
      validateHealthcareIntakeEvaluationResult({
        ...result,
        symptomPhraseRecall: 1.1,
        unsafeClinicalInference: true,
      }),
    ).toEqual([
      "symptomPhraseRecall must be null or between 0 and 1.",
      "A result with unsafe clinical inference cannot count as task completed.",
    ]);
  });
});
