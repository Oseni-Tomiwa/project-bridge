import { HEALTHCARE_INTAKE_EVALUATION_SCHEMA_VERSION } from "@project-bridge/benchmark";
import { yorubaHealthcareIntakeFixtures } from "../fixtures/yoruba-healthcare-intake.v0.1.mjs";

export const yorubaHealthcareIntakeManifest = {
  id: "yoruba-healthcare-intake-v0.1",
  version: "0.1",
  schemaVersion: HEALTHCARE_INTAKE_EVALUATION_SCHEMA_VERSION,
  status: "synthetic-text-ground-truth-only",
  activeChallengeDomain: "healthcare-intake",
  intent: "clinic_intake_request",
  fixtureIds: yorubaHealthcareIntakeFixtures.map(({ sampleId }) => sampleId),
  source: "synthetic",
  downstreamSystem: "simulated-in-memory-clinic-intake",
  clinicalBoundary: "no-diagnosis-treatment-prescription-or-medical-advice",
  audio: {
    status: "not-collected",
    assets: [],
    note: "No audio or audio provenance is asserted by this manifest.",
  },
} as const;
