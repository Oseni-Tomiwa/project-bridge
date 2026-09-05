import type {
  ActionId,
  ConversationId,
  JsonValue,
  OperationFailure,
} from "@project-bridge/shared";

export type ConfirmationPolicy = "none" | "explicit";

export interface ActionDefinition {
  readonly name: string;
  readonly description: string;
  readonly consequence: "low" | "consequential";
  readonly confirmationPolicy: ConfirmationPolicy;
  readonly requiredInputNames: readonly string[];
}

export interface ActionRequest {
  readonly id: ActionId;
  readonly conversationId: ConversationId;
  readonly actionName: string;
  readonly input: Readonly<Record<string, JsonValue>>;
  readonly idempotencyKey: string;
  readonly proposal: Readonly<{
    id: string;
    conversationRevision: number;
    inputFingerprint: string;
  }>;
  readonly confirmation:
    | { readonly kind: "not-required" }
    | {
        readonly kind: "explicit";
        readonly proposalId: string;
        readonly confirmedAt: string;
        readonly conversationRevision: number;
        readonly inputFingerprint: string;
        readonly actionSummary: string;
      };
}

declare const validatedActionRequest: unique symbol;

export type ValidatedActionRequest = ActionRequest & {
  readonly [validatedActionRequest]: true;
};

export type ActionRequestValidation =
  | { readonly ok: true; readonly value: ValidatedActionRequest }
  | { readonly ok: false; readonly error: OperationFailure };

/** Performs platform-level checks; executors still validate domain input values. */
export function validateActionRequest(
  definition: ActionDefinition,
  request: ActionRequest,
): ActionRequestValidation {
  if (request.actionName !== definition.name) {
    return invalid(
      "action-name-mismatch",
      "The action definition does not match the request.",
    );
  }

  if (
    definition.consequence === "consequential" &&
    definition.confirmationPolicy !== "explicit"
  ) {
    return invalid(
      "unsafe-action-definition",
      "Consequential actions must require explicit confirmation.",
    );
  }

  const missingInput = definition.requiredInputNames.find(
    (name) => request.input[name] === undefined,
  );
  if (missingInput !== undefined) {
    return invalid(
      "missing-required-input",
      `The required input '${missingInput}' is missing.`,
    );
  }

  if (
    definition.confirmationPolicy === "explicit" &&
    request.confirmation.kind !== "explicit"
  ) {
    return invalid(
      "confirmation-required",
      "This action requires explicit confirmation.",
    );
  }

  if (
    request.confirmation.kind === "explicit" &&
    (request.confirmation.proposalId !== request.proposal.id ||
      request.confirmation.conversationRevision !==
        request.proposal.conversationRevision ||
      request.confirmation.inputFingerprint !==
        request.proposal.inputFingerprint)
  ) {
    return invalid(
      "stale-confirmation",
      "Confirmation does not match the current action proposal.",
    );
  }

  return { ok: true, value: request as ValidatedActionRequest };
}

function invalid(code: string, message: string): ActionRequestValidation {
  return { ok: false, error: { code, message, retryable: false } };
}

export type ActionOutcome =
  | {
      readonly ok: true;
      readonly status: "accepted" | "completed";
      readonly output: Readonly<Record<string, JsonValue>>;
      readonly userMessage: string;
    }
  | {
      readonly ok: false;
      readonly status: "rejected" | "failed";
      readonly error: OperationFailure;
      readonly userMessage: string;
    };

export interface ActionExecutor {
  readonly definition: ActionDefinition;
  execute(request: ValidatedActionRequest): Promise<ActionOutcome>;
}

export interface ActionRegistry {
  get(actionName: string): ActionExecutor | undefined;
  list(): readonly ActionDefinition[];
}
