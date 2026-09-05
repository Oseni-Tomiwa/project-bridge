import { describe, expect, it } from "vitest";

import {
  FinancialSupportService,
  InMemorySupportCaseRepository,
} from "@project-bridge/domain";
import { apiErrorResponse, dispatchApiRequest } from "../src/server.js";

async function api() {
  let sequence = 0;
  const service = new FinancialSupportService({
    cases: new InMemorySupportCaseRepository(),
    now: () => new Date("2026-09-05T12:00:00.000Z"),
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

describe("financial-support API", () => {
  it("runs the happy path and reads the created case", async () => {
    const client = await api();
    const start = await client.request("/conversations", { method: "POST" });
    expect(start.response.status).toBe(201);
    const conversationId = String(start.body.conversationId);

    const utterance = await client.request(
      `/conversations/${conversationId}/utterances`,
      {
        method: "POST",
        body: JSON.stringify({
          text: "I sent 25k yesterday to my brother, I was debited but he did not receive it.",
        }),
      },
    );
    expect(utterance.body.state).toBe("awaiting-confirmation");
    const proposal = utterance.body.proposal as {
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
      state: "case-created",
      caseReference: "BRG-2026-CASE-4",
    });

    const caseResult = await client.request(
      `/support-cases/${String(confirmation.body.caseReference)}`,
    );
    expect(caseResult.body).toMatchObject({
      status: "created",
      intent: "failed_transfer",
      conversationId,
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
