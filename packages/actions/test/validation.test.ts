import { describe, expect, it } from "vitest";

import type { ActionId, ConversationId } from "@project-bridge/shared";
import {
  type ActionDefinition,
  type ActionRequest,
  validateActionRequest,
} from "../src/index.js";

const definition: ActionDefinition = {
  name: "example.submit",
  description: "A domain-neutral example action.",
  consequence: "consequential",
  confirmationPolicy: "explicit",
  requiredInputNames: ["destination"],
};

function request(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    id: "action-1" as ActionId,
    conversationId: "conversation-1" as ConversationId,
    actionName: definition.name,
    input: { destination: "example" },
    idempotencyKey: "idempotency-1",
    proposal: {
      id: "proposal-1",
      conversationRevision: 2,
      inputFingerprint: "sha256:example",
    },
    confirmation: {
      kind: "explicit",
      proposalId: "proposal-1",
      confirmedAt: "2026-01-01T00:00:00.000Z",
      conversationRevision: 2,
      inputFingerprint: "sha256:example",
      actionSummary: "Submit the example request to the selected destination.",
    },
    ...overrides,
  };
}

describe("validateActionRequest", () => {
  it("rejects an explicitly confirmed action without confirmation evidence", () => {
    const result = validateActionRequest(
      definition,
      request({ confirmation: { kind: "not-required" } }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "confirmation-required" },
    });
  });

  it("rejects a request with missing required input", () => {
    const result = validateActionRequest(definition, request({ input: {} }));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "missing-required-input" },
    });
  });

  it("accepts a matching request with required input and confirmation", () => {
    const candidate = request();

    expect(validateActionRequest(definition, candidate)).toEqual({
      ok: true,
      value: candidate,
    });
  });

  it("rejects confirmation for a different proposal revision", () => {
    const result = validateActionRequest(
      definition,
      request({
        confirmation: {
          kind: "explicit",
          proposalId: "proposal-1",
          confirmedAt: "2026-01-01T00:00:00.000Z",
          conversationRevision: 1,
          inputFingerprint: "sha256:example",
          actionSummary: "Submit the example request.",
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "stale-confirmation" },
    });
  });

  it("rejects a consequential definition that disables confirmation", () => {
    const unsafeDefinition: ActionDefinition = {
      ...definition,
      confirmationPolicy: "none",
    };

    expect(validateActionRequest(unsafeDefinition, request())).toMatchObject({
      ok: false,
      error: { code: "unsafe-action-definition" },
    });
  });
});
