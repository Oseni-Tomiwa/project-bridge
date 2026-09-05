import type { ConversationId, JsonValue } from "@project-bridge/shared";

export interface UserUtterance {
  readonly text: string;
  readonly source: "voice" | "text";
  readonly confidence?: number;
}

export interface EntityValue {
  readonly name: string;
  readonly value: JsonValue;
  readonly sourceText?: string;
  readonly confidence?: number;
}

export interface IntentCandidate {
  readonly name: string;
  readonly confidence?: number;
}

export interface ConversationTurn {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly occurredAt: string;
}

export interface PendingAction {
  readonly proposalId: string;
  readonly actionName: string;
  readonly input: Readonly<Record<string, JsonValue>>;
  readonly proposedAtRevision: number;
  readonly inputFingerprint: string;
  readonly confirmation:
    | { readonly status: "not-required" }
    | { readonly status: "required" }
    | {
        readonly status: "confirmed";
        readonly confirmedAt: string;
      };
}

export interface ConversationState {
  readonly id: ConversationId;
  readonly revision: number;
  readonly turns: readonly ConversationTurn[];
  readonly entities: readonly EntityValue[];
  readonly pendingAction?: PendingAction;
}

export type Interpretation =
  | {
      readonly kind: "clarification-required";
      readonly question: string;
      readonly missingEntities: readonly string[];
      readonly intent?: IntentCandidate;
    }
  | {
      readonly kind: "action-proposed";
      readonly intent: IntentCandidate;
      readonly entities: readonly EntityValue[];
      readonly proposedAction: PendingAction;
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
    };

export interface ConversationInterpreter {
  interpret(
    utterance: UserUtterance,
    state: ConversationState,
  ): Promise<Interpretation>;
}
