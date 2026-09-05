import { describe, expect, it } from "vitest";

import type { ConversationId } from "@project-bridge/shared";
import {
  DeterministicFinancialSupportInterpreter,
  FinancialSupportError,
  FinancialSupportService,
  InMemorySupportCaseRepository,
  containsSensitiveFinancialInput,
} from "../src/index.js";

const representativeUtterances = [
  [
    "English",
    "I sent 25000 yesterday and was debited, but the recipient did not receive it.",
  ],
  [
    "Nigerian Pidgin",
    "I send 25k yesterday, dem debit me but the person no receive am.",
  ],
  [
    "English/Yoruba code-switch",
    "I sent 25k yesterday, owo ti kuro but the person never receive am.",
  ],
] as const;

function harness() {
  let sequence = 0;
  const cases = new InMemorySupportCaseRepository();
  const service = new FinancialSupportService({
    cases,
    now: () => new Date("2026-09-05T12:00:00.000Z"),
    createId: (kind) => `${kind}-${++sequence}`,
  });
  return { service, cases };
}

async function interpret(text: string) {
  return new DeterministicFinancialSupportInterpreter().interpret(
    { text, source: "text" },
    {
      id: "conversation-test" as ConversationId,
      revision: 0,
      turns: [],
      entities: [],
    },
  );
}

describe("deterministic failed-transfer interpretation", () => {
  it.each(representativeUtterances)(
    "recognizes the %s representative example",
    async (_label, utterance) => {
      expect(await interpret(utterance)).toMatchObject({
        kind: "clarification-required",
        intent: { name: "failed_transfer" },
      });
    },
  );

  it("detects the missing recipient field", async () => {
    expect(
      await interpret(
        "I sent 25k yesterday, owo ti kuro but the person never receive am.",
      ),
    ).toMatchObject({
      kind: "clarification-required",
      question: "Who was the transfer sent to?",
      missingEntities: ["recipientOrDestinationDescription"],
    });
  });

  it("detects credential-like input", () => {
    expect(containsSensitiveFinancialInput("My OTP is 928311")).toBe(true);
    expect(
      containsSensitiveFinancialInput("My card number is 4242424242424242"),
    ).toBe(true);
    expect(containsSensitiveFinancialInput("Reference ending AB12")).toBe(
      false,
    );
  });
});

describe("financial-support journey", () => {
  it("completes a missing field, creates a proposal, and binds confirmation", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const first = await service.submitUtterance(
      started.conversationId,
      "I sent 25k yesterday, owo ti kuro but the person never receive am.",
    );
    expect(first).toMatchObject({
      state: "awaiting-input",
      missingFields: ["recipientOrDestinationDescription"],
    });

    const proposalReply = await service.submitUtterance(
      started.conversationId,
      "My brother.",
    );
    expect(proposalReply.state).toBe("awaiting-confirmation");
    if (proposalReply.state !== "awaiting-confirmation") return;
    expect(proposalReply.proposal).toMatchObject({
      fields: {
        transactionAmount: 25000,
        transactionDateOrRelativeTime: "yesterday",
        recipientOrDestinationDescription: "my brother",
      },
    });
    expect(proposalReply.proposal.summary).toContain("₦25,000");

    const completed = await service.confirm(
      started.conversationId,
      proposalReply.proposal.id,
      proposalReply.proposal.conversationRevision,
    );
    expect(completed).toMatchObject({
      state: "case-created",
      caseReference: "BRG-2026-CASE-4",
    });
    if (completed.state !== "case-created") return;
    await expect(
      service.getCase(completed.caseReference),
    ).resolves.toMatchObject({
      intent: "failed_transfer",
      proposalId: proposalReply.proposal.id,
      confirmation: {
        conversationRevision: proposalReply.proposal.conversationRevision,
        inputFingerprint: proposalReply.proposal.inputFingerprint,
      },
    });
  });

  it("rejects confirmation bound to a different proposal", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const reply = await service.submitUtterance(
      started.conversationId,
      "I sent 25k yesterday to my brother, I was debited but he did not receive it.",
    );
    expect(reply.state).toBe("awaiting-confirmation");
    if (reply.state !== "awaiting-confirmation") return;
    await expect(
      service.confirm(
        started.conversationId,
        "stale-proposal",
        reply.proposal.conversationRevision,
      ),
    ).rejects.toMatchObject({ code: "stale-confirmation" });
  });

  it("rejects confirmation bound to a stale conversation revision", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const reply = await service.submitUtterance(
      started.conversationId,
      "I sent 25k yesterday to my brother, I was debited but he did not receive it.",
    );
    expect(reply.state).toBe("awaiting-confirmation");
    if (reply.state !== "awaiting-confirmation") return;
    await expect(
      service.confirm(
        started.conversationId,
        reply.proposal.id,
        reply.proposal.conversationRevision - 1,
      ),
    ).rejects.toMatchObject({ code: "stale-confirmation" });
  });

  it("does not retain a rejected sensitive utterance", async () => {
    const { service } = harness();
    const started = service.startConversation();
    await expect(
      service.submitUtterance(
        started.conversationId,
        "My OTP is 928311 and the transfer failed",
      ),
    ).rejects.toEqual(
      new FinancialSupportError(
        "sensitive-input",
        "Sensitive credentials were rejected and were not retained. Remove them and try again.",
        400,
      ),
    );
    const next = await service.submitUtterance(
      started.conversationId,
      "I sent 25k yesterday to my brother, I was debited but he did not receive it.",
    );
    expect(next).toMatchObject({
      state: "awaiting-confirmation",
      revision: 1,
    });
  });

  it("prevents duplicate execution", async () => {
    const { service } = harness();
    const started = service.startConversation();
    const reply = await service.submitUtterance(
      started.conversationId,
      "I sent 25k yesterday to my brother, I was debited but he did not receive it.",
    );
    if (reply.state !== "awaiting-confirmation")
      throw new Error("Expected proposal");
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
