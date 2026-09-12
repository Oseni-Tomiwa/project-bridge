import { describe, expect, it } from "vitest";

import {
  HealthcareIntakeService,
  InMemoryClinicIntakeRepository,
} from "@project-bridge/domain";
import { apiErrorResponse, dispatchApiRequest } from "../src/server.js";

async function api() {
  let sequence = 0;
  const service = new HealthcareIntakeService({
    intakes: new InMemoryClinicIntakeRepository(),
    now: () => new Date("2026-09-12T12:00:00.000Z"),
    createId: (kind) => `${kind}-${++sequence}`,
  });
  return {
    async request(path: string, init: { method?: string; body?: string } = {}) {
      const body = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
      try {
        const result = await dispatchApiRequest(
          service,
          init.method ?? "GET",
          path,
          body,
        );
        return {
          response: { status: result.status },
          body: result.body as Record<string, unknown>,
        };
      } catch (error) {
        const result = apiErrorResponse(error);
        return {
          response: { status: result.status },
          body: result.body as Record<string, unknown>,
        };
      }
    },
  };
}

describe("healthcare-intake API", () => {
  it("runs the happy path and reads the simulated intake", async () => {
    const client = await api();
    const start = await client.request("/conversations", { method: "POST" });
    expect(start.response.status).toBe(201);
    const conversationId = String(start.body.conversationId);

    const utterance = await client.request(
      `/conversations/${conversationId}/utterances`,
      {
        method: "POST",
        body: JSON.stringify({
          text: "I have headache since yesterday and want to see a clinician.",
        }),
      },
    );
    expect(utterance.body).toMatchObject({
      state: "awaiting-input",
      missingFields: ["preferredName"],
    });
    const named = await client.request(
      `/conversations/${conversationId}/utterances`,
      {
        method: "POST",
        body: JSON.stringify({ text: "Tomiwa" }),
      },
    );
    expect(named.body.state).toBe("awaiting-confirmation");
    const proposal = named.body.proposal as {
      id: string;
      conversationRevision: number;
    };

    const confirmation = await client.request(
      `/conversations/${conversationId}/confirmations`,
      {
        method: "POST",
        body: JSON.stringify({
          proposalId: proposal.id,
          conversationRevision: proposal.conversationRevision,
        }),
      },
    );
    expect(confirmation.body).toMatchObject({
      state: "intake-created",
      intakeReference: "BRG-H-2026-INTAKE-4",
    });

    const intakeResult = await client.request(
      `/clinic-intakes/${String(confirmation.body.intakeReference)}`,
    );
    expect(intakeResult.body).toMatchObject({
      status: "created",
      simulated: true,
      intent: "clinic_intake_request",
      conversationId,
      fields: { preferredName: "Tomiwa" },
    });
  });

  it("returns emergency escalation without creating an intake", async () => {
    const client = await api();
    const start = await client.request("/conversations", { method: "POST" });
    const conversationId = String(start.body.conversationId);
    const response = await client.request(
      `/conversations/${conversationId}/utterances`,
      {
        method: "POST",
        body: JSON.stringify({ text: "I cannot breathe" }),
      },
    );
    expect(response.body).toMatchObject({
      state: "emergency-escalation",
      intakeCreated: false,
      urgencySignals: ["cannot-breathe"],
    });
  });

  it("returns explicit errors for invalid state and invalid requests", async () => {
    const client = await api();
    const missing = await client.request("/conversations/not-real/utterances", {
      method: "POST",
      body: JSON.stringify({ text: "hello" }),
    });
    expect(missing).toMatchObject({
      response: { status: 404 },
      body: { error: { code: "conversation-not-found" } },
    });

    const start = await client.request("/conversations", { method: "POST" });
    const invalid = await client.request(
      `/conversations/${String(start.body.conversationId)}/confirmations`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(invalid).toMatchObject({
      response: { status: 400 },
      body: { error: { code: "invalid-request" } },
    });
  });
});
