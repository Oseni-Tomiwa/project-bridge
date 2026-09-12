import { describe, expect, it } from "vitest";

import type { ConversationId } from "@project-bridge/shared";
import {
  DeterministicHealthcareIntakeInterpreter,
  HealthcareIntakeError,
  HealthcareIntakeService,
  InMemoryClinicIntakeRepository,
  containsUnnecessaryHealthcareIdentifier,
  detectEmergencySignals,
} from "../src/index.js";

const representativeUtterances = [
  ["Yoruba-heavy", "Orí mi ń dun lati ana, mo fe ri dokita."],
  [
    "Yoruba-English",
    "Mo ti ni headache lati ana and my body dey hot. I want see doctor.",
  ],
  [
    "Yoruba-Pidgin",
    "Orí mi ń dun lati ana, body mi dey hot and I wan see doctor.",
  ],
  [
    "Nigerian English",
    "I have had a headache since yesterday and want to see a clinician.",
  ],
] as const;

function harness() {
  let sequence = 0;
  const intakes = new InMemoryClinicIntakeRepository();
  const service = new HealthcareIntakeService({
    intakes,
    now: () => new Date("2026-09-12T10:00:00.000Z"),
    createId: (kind) => `${kind}-${++sequence}`,
  });
  return { service, intakes };
}

async function interpret(text: string) {
  return new DeterministicHealthcareIntakeInterpreter().interpret(
    { text, source: "text" },
    {
      id: "healthcare-test" as ConversationId,
      revision: 0,
      turns: [],
      entities: [],
    },
  );
}

describe("deterministic healthcare-intake interpretation", () => {
  it.each(representativeUtterances)(
    "recognizes the %s representative example without diagnosis",
    async (_label, utterance) => {
      const result = await interpret(utterance);
      expect(result).toMatchObject({
        kind: "action-proposed",
        intent: { name: "clinic_intake_request" },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /heart attack|malaria|diagnosis|prescription/iu,
      );
    },
  );

  it("extracts only user-reported facts", async () => {
    const result = await interpret(
      "Mo ti ni headache lati ana and my body dey hot. I want see doctor.",
    );
    expect(result).toMatchObject({
      kind: "action-proposed",
      entities: expect.arrayContaining([
        { name: "reportedSymptoms", value: ["headache", "feeling hot"] },
        { name: "duration", value: "lati ana" },
        { name: "requestedService", value: "see a clinician" },
        {
          name: "urgencySignals",
          value: [],
        },
      ]),
    });
  });

  it("detects narrowly defined emergency statements", () => {
    expect(detectEmergencySignals("I cannot breathe")).toEqual([
      "cannot-breathe",
    ]);
    expect(
      detectEmergencySignals("She is unconscious and not waking up"),
    ).toEqual(["unconscious-or-not-waking"]);
    expect(detectEmergencySignals("I have chest pain")).toEqual([]);
    expect(detectEmergencySignals("Mi ò lè mí")).toEqual(["cannot-breathe"]);
  });

  it("rejects unnecessary identifiers", () => {
    expect(
      containsUnnecessaryHealthcareIdentifier(
        "My insurance number is AB-928311",
      ),
    ).toBe(true);
    expect(
      containsUnnecessaryHealthcareIdentifier(
        "My phone number is 0801 234 5678",
      ),
    ).toBe(true);
    expect(containsUnnecessaryHealthcareIdentifier("I have a headache")).toBe(
      false,
    );
  });

  it("recognizes Yoruba cough and Yoruba-Pidgin feeling-hot phrases", async () => {
    await expect(
      interpret("Mo ni ikọ, mo fe ri dokita."),
    ).resolves.toMatchObject({
      kind: "clarification-required",
      missingEntities: ["duration"],
      entities: expect.arrayContaining([
        { name: "reportedSymptoms", value: ["cough"] },
      ]),
    });
    await expect(
      interpret("Orí mi ń dun lati ana, body mi dey hot and I wan see doctor."),
    ).resolves.toMatchObject({
      kind: "action-proposed",
      entities: expect.arrayContaining([
        { name: "reportedSymptoms", value: ["headache", "feeling hot"] },
      ]),
    });
  });
});

describe("healthcare-intake journey", () => {
  it("clarifies duration, confirms, and creates a simulated intake", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const first = await service.submitUtterance(
      started.conversationId,
      "I have headache and my body dey hot. I want see doctor.",
    );
    expect(first).toMatchObject({
      state: "awaiting-input",
      missingFields: ["duration"],
    });

    const proposalReply = await service.submitUtterance(
      started.conversationId,
      "Since yesterday.",
    );
    expect(proposalReply.state).toBe("awaiting-confirmation");
    if (proposalReply.state !== "awaiting-confirmation") return;
    expect(proposalReply.proposal.fields).toMatchObject({
      reportedSymptoms: ["headache", "feeling hot"],
      duration: "since yesterday",
      requestedService: "see a clinician",
      urgencySignals: [],
    });
    expect(proposalReply.proposal.summary).toContain("not a diagnosis");

    const completed = await service.confirm(
      started.conversationId,
      proposalReply.proposal.id,
      proposalReply.proposal.conversationRevision,
    );
    expect(completed).toMatchObject({
      state: "intake-created",
      intakeReference: "BRG-H-2026-INTAKE-4",
    });
    if (completed.state !== "intake-created") return;
    await expect(
      service.getIntake(completed.intakeReference),
    ).resolves.toMatchObject({
      intent: "clinic_intake_request",
      simulated: true,
      confirmation: {
        state: "confirmed",
        conversationRevision: proposalReply.proposal.conversationRevision,
        inputFingerprint: proposalReply.proposal.inputFingerprint,
      },
    });
  });

  it("asks what service is requested when needed", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const first = await service.submitUtterance(
      started.conversationId,
      "I have headache since yesterday.",
    );
    expect(first).toMatchObject({
      state: "awaiting-input",
      missingFields: ["requestedService"],
    });
    const next = await service.submitUtterance(
      started.conversationId,
      "I want to see a clinician.",
    );
    expect(next.state).toBe("awaiting-confirmation");
  });

  it("escalates emergency language and blocks routine intake creation", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const response = await service.submitUtterance(
      started.conversationId,
      "I cannot breathe and this is an emergency right now.",
    );
    expect(response).toMatchObject({
      state: "emergency-escalation",
      intakeCreated: false,
      urgencySignals: ["cannot-breathe", "explicit-life-threatening-emergency"],
    });
    expect(response.assistantMessage).toContain(
      "seek immediate local emergency or urgent medical assistance",
    );
    expect(response.assistantMessage).not.toMatch(
      /heart attack|stroke|take (?:a|this) medicine/iu,
    );
    await expect(
      service.confirm(started.conversationId, "anything", 1),
    ).rejects.toMatchObject({ code: "emergency-intake-blocked" });
  });

  it("rejects identifiers without retaining the utterance", async () => {
    const { service } = harness();
    const started = service.startConversation();
    await expect(
      service.submitUtterance(
        started.conversationId,
        "My insurance number is AB-928311 and I have a headache",
      ),
    ).rejects.toEqual(
      new HealthcareIntakeError(
        "sensitive-input",
        "Unnecessary sensitive identifiers were rejected and not retained. Remove them and try again.",
        400,
      ),
    );
    const next = await service.submitUtterance(
      started.conversationId,
      "I have headache since yesterday and want to see a clinician.",
    );
    expect(next).toMatchObject({
      state: "awaiting-confirmation",
      revision: 1,
    });
  });

  it("keeps confirmation bound and execution idempotent", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const reply = await service.submitUtterance(
      started.conversationId,
      "I have headache since yesterday and want to see a clinician.",
    );
    if (reply.state !== "awaiting-confirmation")
      throw new Error("Expected healthcare proposal.");
    await expect(
      service.confirm(
        started.conversationId,
        "stale-proposal",
        reply.proposal.conversationRevision,
      ),
    ).rejects.toMatchObject({ code: "stale-confirmation" });
    await service.confirm(
      started.conversationId,
      reply.proposal.id,
      reply.proposal.conversationRevision,
    );
    await expect(
      service.confirm(
        started.conversationId,
        reply.proposal.id,
        reply.proposal.conversationRevision,
      ),
    ).rejects.toMatchObject({ code: "already-executed" });
  });
});
