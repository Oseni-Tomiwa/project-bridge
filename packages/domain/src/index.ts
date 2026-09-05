import {
  type ActionDefinition,
  type ActionExecutor,
  type ActionRequest,
  type ActionOutcome,
  validateActionRequest,
} from "@project-bridge/actions";
import type {
  ConversationInterpreter,
  ConversationState,
  EntityValue,
  Interpretation,
  UserUtterance,
} from "@project-bridge/conversation";
import type {
  ActionId,
  ConversationId,
  JsonValue,
} from "@project-bridge/shared";

export interface DomainModule {
  readonly id: string;
  readonly displayName: string;
  readonly interpreter: ConversationInterpreter;
  readonly actions: readonly ActionExecutor[];
}

export function validateDomainModule(module: DomainModule): readonly string[] {
  const issues: string[] = [];

  if (module.id.trim() === "")
    issues.push("Domain module id must not be empty.");
  if (module.displayName.trim() === "") {
    issues.push("Domain module display name must not be empty.");
  }

  const actionNames = module.actions.map((action) => action.definition.name);
  const duplicateNames = actionNames.filter(
    (name, index) => actionNames.indexOf(name) !== index,
  );
  for (const name of new Set(duplicateNames)) {
    issues.push(`Duplicate action name: ${name}`);
  }

  return issues;
}

export const FAILED_TRANSFER_INTENT = "failed_transfer";
export const CREATE_SUPPORT_CASE_ACTION = "financial-support.create-case";

export interface FailedTransferFields {
  readonly transactionAmount?: number;
  readonly currency?: "NGN";
  readonly transactionDateOrRelativeTime?: string;
  readonly recipientOrDestinationDescription?: string;
  readonly issueDescription?: string;
  readonly transactionReferencePartial?: string;
  readonly channel?: string;
  readonly urgencyNotes?: string;
}

export type RequiredFailedTransferField =
  | "transactionAmount"
  | "transactionDateOrRelativeTime"
  | "recipientOrDestinationDescription"
  | "issueDescription";

export const requiredFailedTransferFields: readonly RequiredFailedTransferField[] =
  [
    "transactionAmount",
    "transactionDateOrRelativeTime",
    "recipientOrDestinationDescription",
    "issueDescription",
  ];

export interface SupportCase {
  readonly reference: string;
  readonly intent: typeof FAILED_TRANSFER_INTENT;
  readonly status: "created";
  readonly createdAt: string;
  readonly conversationId: ConversationId;
  readonly fields: Readonly<
    Required<Pick<FailedTransferFields, RequiredFailedTransferField>> &
      FailedTransferFields
  >;
  readonly summary: string;
  readonly proposalId: string;
  readonly confirmation: Readonly<{
    confirmedAt: string;
    conversationRevision: number;
    inputFingerprint: string;
  }>;
}

export interface SupportCaseRepository {
  findByReference(reference: string): Promise<SupportCase | undefined>;
  findByIdempotencyKey(key: string): Promise<SupportCase | undefined>;
  save(caseRecord: SupportCase, idempotencyKey: string): Promise<void>;
}

export class InMemorySupportCaseRepository implements SupportCaseRepository {
  readonly #byReference = new Map<string, SupportCase>();
  readonly #byIdempotencyKey = new Map<string, SupportCase>();

  async findByReference(reference: string): Promise<SupportCase | undefined> {
    return this.#byReference.get(reference);
  }

  async findByIdempotencyKey(key: string): Promise<SupportCase | undefined> {
    return this.#byIdempotencyKey.get(key);
  }

  async save(caseRecord: SupportCase, idempotencyKey: string): Promise<void> {
    this.#byReference.set(caseRecord.reference, caseRecord);
    this.#byIdempotencyKey.set(idempotencyKey, caseRecord);
  }
}

export interface FinancialSupportDependencies {
  readonly cases: SupportCaseRepository;
  readonly now: () => Date;
  readonly createId: (
    kind: "conversation" | "proposal" | "action" | "case",
  ) => string;
}

interface ActiveConversation extends ConversationState {
  readonly id: ConversationId;
  revision: number;
  turns: Array<{
    role: "user" | "assistant";
    text: string;
    occurredAt: string;
  }>;
  entities: EntityValue[];
  fields: FailedTransferFields;
  proposal?: FinancialSupportProposal;
  caseReference?: string;
}

export interface FinancialSupportProposal {
  readonly id: string;
  readonly conversationRevision: number;
  readonly inputFingerprint: string;
  readonly summary: string;
  readonly fields: Readonly<
    Required<Pick<FailedTransferFields, RequiredFailedTransferField>> &
      FailedTransferFields
  >;
}

export type FinancialSupportReply =
  | {
      readonly state: "awaiting-input";
      readonly conversationId: ConversationId;
      readonly revision: number;
      readonly assistantMessage: string;
      readonly missingFields: readonly RequiredFailedTransferField[];
    }
  | {
      readonly state: "awaiting-confirmation";
      readonly conversationId: ConversationId;
      readonly revision: number;
      readonly assistantMessage: string;
      readonly proposal: FinancialSupportProposal;
    }
  | {
      readonly state: "case-created";
      readonly conversationId: ConversationId;
      readonly revision: number;
      readonly assistantMessage: string;
      readonly caseReference: string;
    };

export class FinancialSupportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sensitivePatterns: ReadonlyArray<RegExp> = [
  /\b(?:pin|otp|password|passcode|cvv)\b\s*(?:is|:|-)?\s*\w+/iu,
  /\b(?:card(?:\s+number)?|account(?:\s+number)?)\b\D{0,8}\d{10,19}\b/iu,
  /\b(?:\d[ -]?){15,19}\b/u,
];

export function containsSensitiveFinancialInput(text: string): boolean {
  return sensitivePatterns.some((pattern) => pattern.test(text));
}

function cleanDescription(value: string): string {
  return value
    .trim()
    .replace(/[.!?]+$/u, "")
    .slice(0, 120);
}

function parseAmount(text: string): number | undefined {
  const match = text.match(/(?:₦|ngn\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/iu);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * (match[2] ? 1_000 : 1));
}

function extractRecipient(text: string): string | undefined {
  const patterns = [
    /\b(?:sent|transfer(?:red)?)\s+(?:it|the money|\w+)?\s*to\s+([^,.!?]+)/iu,
    /\b(?:to|give)\s+(my\s+[^,.!?]+)/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanDescription(match[1]);
  }
  return undefined;
}

function extractTime(text: string): string | undefined {
  const relative = text.match(
    /\b(yesterday|today|this morning|last night|on monday|on tuesday|on wednesday|on thursday|on friday|on saturday|on sunday)\b/iu,
  );
  return relative?.[1]?.toLowerCase();
}

function recognizesFailedTransfer(text: string): boolean {
  const lower = text.toLowerCase();
  const transfer = /\b(sent|transfer(?:red)?|send|payment)\b/u.test(lower);
  const failure =
    /(fail|pending|never receive|not receive|didn'?t receive|no receive|money no enter|owo ti kuro|debited|deducted)/u.test(
      lower,
    );
  return transfer && failure;
}

function inferIssue(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (
    /owo ti kuro|debit(?:ed)?|deducted/.test(lower) &&
    /never receive|not receive|didn'?t receive|no receive|money no enter/.test(
      lower,
    )
  ) {
    return "account was debited but the recipient did not receive the money";
  }
  if (/pending/.test(lower)) return "transfer is still pending";
  if (/fail/.test(lower)) return "transfer failed";
  if (
    /never receive|not receive|didn'?t receive|no receive|money no enter/.test(
      lower,
    )
  ) {
    return "recipient did not receive the money";
  }
  return undefined;
}

function parseInitialFields(text: string): FailedTransferFields {
  const amount = parseAmount(text);
  const time = extractTime(text);
  const recipient = extractRecipient(text);
  const issue = inferIssue(text);
  return {
    ...(amount === undefined
      ? {}
      : { transactionAmount: amount, currency: "NGN" as const }),
    ...(time === undefined ? {} : { transactionDateOrRelativeTime: time }),
    ...(recipient === undefined
      ? {}
      : { recipientOrDestinationDescription: recipient }),
    ...(issue === undefined ? {} : { issueDescription: issue }),
  };
}

function entityValues(fields: FailedTransferFields): EntityValue[] {
  return Object.entries(fields).flatMap(([name, value]) =>
    value === undefined ? [] : [{ name, value }],
  );
}

function fieldsFromEntities(
  entities: readonly EntityValue[],
): FailedTransferFields {
  const result: Record<string, string | number> = {};
  for (const entity of entities) {
    if (typeof entity.value === "string" || typeof entity.value === "number") {
      result[entity.name] = entity.value;
    }
  }
  return parseActionInput(result) ?? (result as FailedTransferFields);
}

export class DeterministicFinancialSupportInterpreter
  implements ConversationInterpreter
{
  async interpret(
    utterance: UserUtterance,
    state: ConversationState,
  ): Promise<Interpretation> {
    if (containsSensitiveFinancialInput(utterance.text)) {
      return {
        kind: "unsupported",
        reason:
          "Do not share a PIN, OTP, password, CVV, full card number, or full account number.",
      };
    }
    if (
      !recognizesFailedTransfer(utterance.text) &&
      state.entities.length === 0
    ) {
      return {
        kind: "unsupported",
        reason:
          "This prototype only handles failed or pending transfer support.",
      };
    }
    const existingFields = fieldsFromEntities(state.entities);
    const missingBefore = requiredFailedTransferFields.filter(
      (name) => existingFields[name] === undefined,
    );
    let additions = parseInitialFields(utterance.text);
    if (
      state.entities.length > 0 &&
      entityValues(additions).length === 0 &&
      missingBefore[0] !== undefined
    ) {
      additions = parseFollowUp(missingBefore[0], utterance.text);
    }
    const fields = { ...existingFields, ...additions };
    const entities = entityValues(fields);
    const known = new Set([
      ...state.entities.map((entity) => entity.name),
      ...entities.map((entity) => entity.name),
    ]);
    const missing = requiredFailedTransferFields.filter(
      (name) => !known.has(name),
    );
    if (missing.length > 0) {
      return {
        kind: "clarification-required",
        question: questionFor(missing[0]),
        missingEntities: missing,
        entities,
        intent: { name: FAILED_TRANSFER_INTENT },
      };
    }
    return {
      kind: "action-proposed",
      intent: { name: FAILED_TRANSFER_INTENT },
      entities,
      proposedAction: {
        proposalId: `interpreted-${stableFingerprint(fields)}`,
        actionName: CREATE_SUPPORT_CASE_ACTION,
        input: fieldsToActionInput(fields),
        proposedAtRevision: state.revision,
        inputFingerprint: stableFingerprint(fields),
        confirmation: { status: "required" },
      },
    };
  }
}

function questionFor(field: RequiredFailedTransferField | undefined): string {
  switch (field) {
    case "transactionAmount":
      return "How much was the transfer?";
    case "transactionDateOrRelativeTime":
      return "When did you make the transfer?";
    case "recipientOrDestinationDescription":
      return "Who was the transfer sent to?";
    case "issueDescription":
      return "What happened with the transfer?";
    default:
      return "Please tell me a little more about the transfer.";
  }
}

function assertCompleteFields(
  fields: FailedTransferFields,
): asserts fields is Required<
  Pick<FailedTransferFields, RequiredFailedTransferField>
> &
  FailedTransferFields {
  for (const name of requiredFailedTransferFields) {
    if (fields[name] === undefined) throw new Error(`Missing ${name}`);
  }
}

function formatNaira(amount: number): string {
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function summarizeFailedTransfer(fields: FailedTransferFields): string {
  assertCompleteFields(fields);
  const issue = fields.issueDescription.replace(/^account/u, "Your account");
  return `You are reporting a transfer of ${formatNaira(fields.transactionAmount)} sent ${fields.transactionDateOrRelativeTime} to ${fields.recipientOrDestinationDescription}. ${issue[0]?.toUpperCase() ?? ""}${issue.slice(1)}.`;
}

function stableFingerprint(fields: FailedTransferFields): string {
  const canonical = JSON.stringify(
    Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)),
  );
  let hash = 2_166_136_261;
  for (const character of canonical) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `demo-fnv1a-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export class FinancialSupportService {
  readonly #conversations = new Map<string, ActiveConversation>();
  readonly #interpreter = new DeterministicFinancialSupportInterpreter();
  readonly #action: ActionExecutor;

  constructor(private readonly dependencies: FinancialSupportDependencies) {
    this.#action = createSupportCaseExecutor(dependencies);
  }

  startConversation(): FinancialSupportReply {
    const id = this.dependencies.createId("conversation") as ConversationId;
    const assistantMessage =
      "Tell me about your failed or pending transfer. Do not share a PIN, OTP, password, CVV, full card number, or full account number.";
    this.#conversations.set(id, {
      id,
      revision: 0,
      fields: {},
      entities: [],
      turns: [
        {
          role: "assistant",
          text: assistantMessage,
          occurredAt: this.dependencies.now().toISOString(),
        },
      ],
    });
    return {
      state: "awaiting-input",
      conversationId: id,
      revision: 0,
      assistantMessage,
      missingFields: requiredFailedTransferFields,
    };
  }

  async submitUtterance(
    conversationId: string,
    text: string,
  ): Promise<FinancialSupportReply> {
    const conversation = this.getConversation(conversationId);
    if (conversation.proposal || conversation.caseReference) {
      throw new FinancialSupportError(
        "invalid-state",
        "This conversation is not accepting another utterance.",
        409,
      );
    }
    if (text.trim() === "")
      throw new FinancialSupportError(
        "invalid-utterance",
        "Utterance text is required.",
        400,
      );
    if (containsSensitiveFinancialInput(text)) {
      throw new FinancialSupportError(
        "sensitive-input",
        "Sensitive credentials were rejected and were not retained. Remove them and try again.",
        400,
      );
    }

    const now = this.dependencies.now().toISOString();
    conversation.turns.push({
      role: "user",
      text: text.trim(),
      occurredAt: now,
    });
    conversation.revision += 1;
    const interpretation = await this.#interpreter.interpret(
      { text, source: "text" },
      conversation,
    );
    if (interpretation.kind === "unsupported") {
      conversation.turns.pop();
      conversation.revision -= 1;
      throw new FinancialSupportError(
        "unsupported-intent",
        interpretation.reason,
        422,
      );
    }
    conversation.entities = [...interpretation.entities];
    conversation.fields = fieldsFromEntities(interpretation.entities);
    if (interpretation.kind === "clarification-required") {
      const assistantMessage = interpretation.question;
      conversation.turns.push({
        role: "assistant",
        text: assistantMessage,
        occurredAt: now,
      });
      return {
        state: "awaiting-input",
        conversationId: conversation.id,
        revision: conversation.revision,
        assistantMessage,
        missingFields:
          interpretation.missingEntities as readonly RequiredFailedTransferField[],
      };
    }

    assertCompleteFields(conversation.fields);
    const summary = summarizeFailedTransfer(conversation.fields);
    const proposal: FinancialSupportProposal = {
      id: this.dependencies.createId("proposal"),
      conversationRevision: conversation.revision,
      inputFingerprint: stableFingerprint(conversation.fields),
      summary,
      fields: { ...conversation.fields },
    };
    conversation.proposal = proposal;
    const assistantMessage = `${summary} Do you want me to create a support case?`;
    conversation.turns.push({
      role: "assistant",
      text: assistantMessage,
      occurredAt: now,
    });
    return {
      state: "awaiting-confirmation",
      conversationId: conversation.id,
      revision: conversation.revision,
      assistantMessage,
      proposal,
    };
  }

  async confirm(
    conversationId: string,
    proposalId: string,
    conversationRevision: number,
  ): Promise<FinancialSupportReply> {
    const conversation = this.getConversation(conversationId);
    if (conversation.caseReference) {
      throw new FinancialSupportError(
        "already-executed",
        "This support case has already been created.",
        409,
      );
    }
    const proposal = conversation.proposal;
    if (!proposal)
      throw new FinancialSupportError(
        "no-proposal",
        "There is no support case proposal to confirm.",
        409,
      );
    const confirmedAt = this.dependencies.now().toISOString();
    const request: ActionRequest = {
      id: this.dependencies.createId("action") as ActionId,
      conversationId: conversation.id,
      actionName: CREATE_SUPPORT_CASE_ACTION,
      input: fieldsToActionInput(proposal.fields),
      idempotencyKey: `support-case:${conversation.id}:${proposal.id}`,
      proposal: {
        id: proposal.id,
        conversationRevision: proposal.conversationRevision,
        inputFingerprint: proposal.inputFingerprint,
      },
      confirmation: {
        kind: "explicit",
        proposalId,
        confirmedAt,
        conversationRevision,
        inputFingerprint: proposal.inputFingerprint,
        actionSummary: proposal.summary,
      },
    };
    const validation = validateActionRequest(this.#action.definition, request);
    if (!validation.ok)
      throw new FinancialSupportError(
        validation.error.code,
        validation.error.message,
        409,
      );
    const outcome = await this.#action.execute(validation.value);
    if (!outcome.ok || outcome.status !== "completed") {
      throw new FinancialSupportError(
        outcome.ok ? "action-incomplete" : outcome.error.code,
        outcome.userMessage,
        500,
      );
    }
    const reference = outcome.output.reference;
    if (typeof reference !== "string")
      throw new FinancialSupportError(
        "invalid-action-output",
        "The support case could not be created.",
        500,
      );
    conversation.caseReference = reference;
    conversation.revision += 1;
    conversation.turns.push({
      role: "assistant",
      text: outcome.userMessage,
      occurredAt: confirmedAt,
    });
    return {
      state: "case-created",
      conversationId: conversation.id,
      revision: conversation.revision,
      assistantMessage: outcome.userMessage,
      caseReference: reference,
    };
  }

  async getCase(reference: string): Promise<SupportCase> {
    const result = await this.dependencies.cases.findByReference(reference);
    if (!result)
      throw new FinancialSupportError(
        "case-not-found",
        "Support case not found.",
        404,
      );
    return result;
  }

  private getConversation(id: string): ActiveConversation {
    const conversation = this.#conversations.get(id);
    if (!conversation)
      throw new FinancialSupportError(
        "conversation-not-found",
        "Conversation not found.",
        404,
      );
    return conversation;
  }
}

function fieldsToActionInput(
  fields: FailedTransferFields,
): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === "string" || typeof entry[1] === "number",
    ),
  );
}

function parseFollowUp(
  field: RequiredFailedTransferField,
  text: string,
): FailedTransferFields {
  const cleaned = cleanDescription(
    text.replace(/^(?:it was|it is|about|my)\s+/iu, (match) =>
      match.toLowerCase() === "my " ? "my " : "",
    ),
  );
  if (cleaned === "") {
    throw new FinancialSupportError(
      "invalid-field",
      "Please provide a short answer without sensitive credentials.",
      422,
    );
  }
  switch (field) {
    case "transactionAmount": {
      const amount = parseAmount(text);
      if (amount === undefined)
        throw new FinancialSupportError(
          "invalid-field",
          "Please enter an amount, for example 25000 or 25k.",
          422,
        );
      return { transactionAmount: amount, currency: "NGN" };
    }
    case "transactionDateOrRelativeTime":
      return { transactionDateOrRelativeTime: extractTime(text) ?? cleaned };
    case "recipientOrDestinationDescription":
      return { recipientOrDestinationDescription: cleaned };
    case "issueDescription":
      return { issueDescription: inferIssue(text) ?? cleaned };
  }
}

export const createSupportCaseDefinition: ActionDefinition = {
  name: CREATE_SUPPORT_CASE_ACTION,
  description: "Create a simulated failed-transfer support case.",
  consequence: "consequential",
  confirmationPolicy: "explicit",
  requiredInputNames: [...requiredFailedTransferFields],
};

export function createSupportCaseExecutor(
  dependencies: FinancialSupportDependencies,
): ActionExecutor {
  return {
    definition: createSupportCaseDefinition,
    async execute(request): Promise<ActionOutcome> {
      const existing = await dependencies.cases.findByIdempotencyKey(
        request.idempotencyKey,
      );
      if (existing)
        return {
          ok: true,
          status: "completed",
          output: { reference: existing.reference },
          userMessage: `Your support case is already recorded. Reference: ${existing.reference}`,
        };
      const fields = parseActionInput(request.input);
      if (!fields) {
        return {
          ok: false,
          status: "rejected",
          error: {
            code: "invalid-case-input",
            message: "Required support case fields are missing.",
            retryable: false,
          },
          userMessage:
            "I could not create the support case because required information is missing.",
        };
      }
      const reference = `BRG-${dependencies.now().getUTCFullYear()}-${dependencies.createId("case").toUpperCase()}`;
      const confirmation = request.confirmation;
      if (confirmation.kind !== "explicit") {
        return {
          ok: false,
          status: "rejected",
          error: {
            code: "confirmation-required",
            message: "Explicit confirmation is required.",
            retryable: false,
          },
          userMessage: "Please confirm before the support case is created.",
        };
      }
      const caseRecord: SupportCase = {
        reference,
        intent: FAILED_TRANSFER_INTENT,
        status: "created",
        createdAt: dependencies.now().toISOString(),
        conversationId: request.conversationId,
        fields: { ...fields },
        summary: confirmation.actionSummary,
        proposalId: request.proposal.id,
        confirmation: {
          confirmedAt: confirmation.confirmedAt,
          conversationRevision: confirmation.conversationRevision,
          inputFingerprint: confirmation.inputFingerprint,
        },
      };
      await dependencies.cases.save(caseRecord, request.idempotencyKey);
      return {
        ok: true,
        status: "completed",
        output: { reference },
        userMessage: `Your simulated support case was created. Reference: ${reference}`,
      };
    },
  };
}

export function createFinancialSupportDomainModule(
  dependencies: FinancialSupportDependencies,
): DomainModule {
  return {
    id: "financial-support",
    displayName: "Financial-service support",
    interpreter: new DeterministicFinancialSupportInterpreter(),
    actions: [createSupportCaseExecutor(dependencies)],
  };
}

function parseActionInput(
  input: Readonly<Record<string, JsonValue>>,
):
  | (Required<Pick<FailedTransferFields, RequiredFailedTransferField>> &
      FailedTransferFields)
  | undefined {
  const amount = input.transactionAmount;
  const time = input.transactionDateOrRelativeTime;
  const recipient = input.recipientOrDestinationDescription;
  const issue = input.issueDescription;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof time !== "string" ||
    time.trim() === "" ||
    typeof recipient !== "string" ||
    recipient.trim() === "" ||
    typeof issue !== "string" ||
    issue.trim() === ""
  ) {
    return undefined;
  }
  return {
    transactionAmount: amount,
    transactionDateOrRelativeTime: time,
    recipientOrDestinationDescription: recipient,
    issueDescription: issue,
    ...(input.currency === "NGN" ? { currency: "NGN" as const } : {}),
    ...(typeof input.transactionReferencePartial === "string"
      ? { transactionReferencePartial: input.transactionReferencePartial }
      : {}),
    ...(typeof input.channel === "string" ? { channel: input.channel } : {}),
    ...(typeof input.urgencyNotes === "string"
      ? { urgencyNotes: input.urgencyNotes }
      : {}),
  };
}

export const financialSupportEvaluationFixtures = [
  {
    id: "failed-transfer-en-001",
    utterance:
      "I sent 25000 yesterday and was debited, but the recipient did not receive it.",
    expectedIntent: FAILED_TRANSFER_INTENT,
    expectedEntities: {
      transactionAmount: 25000,
      transactionDateOrRelativeTime: "yesterday",
      issueDescription:
        "account was debited but the recipient did not receive the money",
    },
    expectedTaskResult: "support-case-created-after-explicit-confirmation",
  },
  {
    id: "failed-transfer-pidgin-001",
    utterance:
      "I send 25k yesterday, dem debit me but the person no receive am.",
    expectedIntent: FAILED_TRANSFER_INTENT,
    expectedEntities: {
      transactionAmount: 25000,
      transactionDateOrRelativeTime: "yesterday",
      issueDescription:
        "account was debited but the recipient did not receive the money",
    },
    expectedTaskResult: "support-case-created-after-explicit-confirmation",
  },
  {
    id: "failed-transfer-en-yo-001",
    utterance:
      "I sent 25k yesterday, owo ti kuro but the person never receive am.",
    expectedIntent: FAILED_TRANSFER_INTENT,
    expectedEntities: {
      transactionAmount: 25000,
      transactionDateOrRelativeTime: "yesterday",
      issueDescription:
        "account was debited but the recipient did not receive the money",
    },
    expectedTaskResult: "support-case-created-after-explicit-confirmation",
  },
] as const;
