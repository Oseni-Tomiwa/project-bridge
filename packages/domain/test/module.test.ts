import { describe, expect, it } from "vitest";

import type { ActionExecutor } from "@project-bridge/actions";
import type { ConversationInterpreter } from "@project-bridge/conversation";
import { validateDomainModule } from "../src/index.js";

const interpreter: ConversationInterpreter = {
  async interpret() {
    return { kind: "unsupported", reason: "Test interpreter" };
  },
};

function executor(name: string): ActionExecutor {
  return {
    definition: {
      name,
      description: "Test action",
      consequence: "low",
      confirmationPolicy: "none",
      requiredInputNames: [],
    },
    async execute() {
      return {
        ok: true,
        status: "completed",
        output: {},
        userMessage: "Completed",
      };
    },
  };
}

describe("validateDomainModule", () => {
  it("allows a small domain module with unique action names", () => {
    expect(
      validateDomainModule({
        id: "example",
        displayName: "Example",
        interpreter,
        actions: [executor("example.lookup"), executor("example.submit")],
      }),
    ).toEqual([]);
  });

  it("reports duplicate action names", () => {
    expect(
      validateDomainModule({
        id: "example",
        displayName: "Example",
        interpreter,
        actions: [executor("example.submit"), executor("example.submit")],
      }),
    ).toContain("Duplicate action name: example.submit");
  });
});
