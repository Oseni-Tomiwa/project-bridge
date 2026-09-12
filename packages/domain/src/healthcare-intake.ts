import {
  type ActionDefinition,
  type ActionExecutor,
  type ActionOutcome,
  type ActionRequest,
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

export const CLINIC_INTAKE_INTENT = "clinic_intake_request";
export const CREATE_CLINIC_INTAKE_ACTION = "healthcare.create-clinic-intake";

export type UrgencySignal =
  | "cannot-breathe"
  | "unconscious-or-not-waking"
  | "severe-uncontrolled-bleeding"
  | "active-seizure"
  | "explicit-life-threatening-emergency";

export type HealthcareLanguageMix =
  | "yoruba-heavy"
  | "yoruba-english"
  | "yoruba-pidgin"
  | "nigerian-english"
  | "undetermined";

export interface HealthcareIntakeFields {
  readonly reportedConcern: string;
  readonly reportedSymptoms: readonly string[];
  readonly duration?: string;
  readonly requestedService?: string;
  readonly preferredName?: string;
  readonly urgencySignals: readonly UrgencySignal[];
  readonly language: Readonly<{
    mix: HealthcareLanguageMix;
    basis: "deterministic-text-signals";
  }>;
}

export interface ClinicIntake {
  readonly reference: string;
  readonly intent: typeof CLINIC_INTAKE_INTENT;
  readonly status: "created";
  readonly simulated: true;
  readonly createdAt: string;
  readonly conversationId: ConversationId;
  readonly fields: HealthcareIntakeFields;
  readonly summary: string;
  readonly proposalId: string;
  readonly confirmation: Readonly<{
    state: "confirmed";
    confirmedAt: string;
    conversationRevision: number;
    inputFingerprint: string;
  }>;
}

export interface ClinicIntakeRepository {
  findByReference(reference: string): Promise<ClinicIntake | undefined>;
  findByIdempotencyKey(key: string): Promise<ClinicIntake | undefined>;
  save(intake: ClinicIntake, idempotencyKey: string): Promise<void>;
}

export class InMemoryClinicIntakeRepository implements ClinicIntakeRepository {
  readonly #byReference = new Map<string, ClinicIntake>();
  readonly #byIdempotencyKey = new Map<string, ClinicIntake>();

  async findByReference(reference: string): Promise<ClinicIntake | undefined> {
    return this.#byReference.get(reference);
  }

  async findByIdempotencyKey(key: string): Promise<ClinicIntake | undefined> {
    return this.#byIdempotencyKey.get(key);
  }

  async save(intake: ClinicIntake, idempotencyKey: string): Promise<void> {
    this.#byReference.set(intake.reference, intake);
    this.#byIdempotencyKey.set(idempotencyKey, intake);
  }
}

export interface HealthcareIntakeDependencies {
  readonly intakes: ClinicIntakeRepository;
  readonly now: () => Date;
  readonly createId: (
    kind: "conversation" | "proposal" | "action" | "intake",
  ) => string;
}

interface ActiveHealthcareConversation extends ConversationState {
  readonly id: ConversationId;
  revision: number;
  turns: Array<{
    role: "user" | "assistant";
    text: string;
    occurredAt: string;
  }>;
  entities: EntityValue[];
  fields: HealthcareIntakeFields | undefined;
  proposal?: HealthcareIntakeProposal;
  intakeReference?: string;
  emergencyEscalated?: boolean;
}

export interface HealthcareIntakeProposal {
  readonly id: string;
  readonly conversationRevision: number;
  readonly inputFingerprint: string;
  readonly summary: string;
  readonly fields: HealthcareIntakeFields;
}

export type HealthcareIntakeReply =
  | {
      readonly state: "awaiting-input";
      readonly conversationId: ConversationId;
      readonly revision: number;
      readonly assistantMessage: string;
      readonly missingFields: readonly (
        | "reportedConcern"
        | "duration"
        | "requestedService"
        | "preferredName"
      )[];
    }
  | {
      readonly state: "awaiting-confirmation";
      readonly conversationId: ConversationId;
      readonly revision: number;
      readonly assistantMessage: string;
      readonly proposal: HealthcareIntakeProposal;
    }
  | {
      readonly state: "emergency-escalation";
      readonly conversationId: ConversationId;
      readonly revision: number;
      readonly assistantMessage: string;
      readonly urgencySignals: readonly UrgencySignal[];
      readonly intakeCreated: false;
    }
  | {
      readonly state: "intake-created";
      readonly conversationId: ConversationId;
      readonly revision: number;
      readonly assistantMessage: string;
      readonly intakeReference: string;
    };

export class HealthcareIntakeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const unnecessaryIdentifierPatterns: readonly RegExp[] = [
  /\b(?:pin|otp|password|passcode|cvv)\b\s*(?:is|:|-)?\s*\w+/iu,
  /\b(?:national\s+id|nin|insurance(?:\s+(?:number|id))?|medical\s+record(?:\s+(?:number|id))?)\b\D{0,8}[a-z0-9-]{6,24}\b/iu,
  /\b(?:card(?:\s+number)?|account(?:\s+number)?)\b\D{0,8}\d{10,19}\b/iu,
  /\b(?:phone|telephone|mobile)(?:\s+number)?\b\D{0,8}\+?(?:\d[ -]?){10,15}\b/iu,
  /\b(?:email|e-mail)(?:\s+address)?\b\s*(?:is|:|-)?\s*[^\s@]+@[^\s@]+/iu,
];

export function containsUnnecessaryHealthcareIdentifier(text: string): boolean {
  return unnecessaryIdentifierPatterns.some((pattern) => pattern.test(text));
}

export function detectEmergencySignals(text: string): readonly UrgencySignal[] {
  const patterns: ReadonlyArray<readonly [UrgencySignal, RegExp]> = [
    [
      "cannot-breathe",
      /\b(?:cannot|can'?t|unable to|no fit)\s+breathe\b|\bsevere difficulty breathing\b|mi\s+[oòọ]\s+l[eèẹ]\s+m[ií](?:\s+daadaa)?/iu,
    ],
    [
      "unconscious-or-not-waking",
      /\b(?:unconscious|not waking(?: up)?|won'?t wake(?: up)?)\b|\bko ji\b/iu,
    ],
    [
      "severe-uncontrolled-bleeding",
      /\b(?:severe|heavy|uncontrolled)\s+bleeding\b|\bbleeding (?:will not|won'?t|no) stop\b/iu,
    ],
    ["active-seizure", /\b(?:having|active|ongoing)\s+(?:a\s+)?seizure\b/iu],
    [
      "explicit-life-threatening-emergency",
      /\b(?:life[- ]threatening emergency|immediate life[- ]threatening|emergency right now)\b/iu,
    ],
  ];
  return patterns.flatMap(([signal, pattern]) =>
    pattern.test(text) ? [signal] : [],
  );
}

const symptomPatterns: ReadonlyArray<readonly [string, RegExp]> = [
  ["headache", /\bheadache\b|\bor[ií] (?:mi )?(?:n|ń) dun\b/iu],
  [
    "feeling hot",
    /\bbody (?:mi )?(?:dey|is) hot\b|\bmo n gbona\b|\bfeeling hot\b/iu,
  ],
  ["chest pain", /\bchest pain\b|\baya (?:mi )?(?:n|ń) dun\b/iu],
  ["stomach pain", /\b(?:stomach|belly) pain\b|\binu (?:mi )?(?:n|ń) dun\b/iu],
  ["cough", /\bcough(?:ing)?\b|(?<!\p{L})ik[oọ](?!\p{L})/iu],
  ["dizziness", /\bdizz(?:y|iness)\b/iu],
  ["vomiting", /\bvomit(?:ing)?\b/iu],
  ["weakness", /\b(?:weak|weakness)\b/iu],
];

function extractSymptoms(text: string): readonly string[] {
  return symptomPatterns.flatMap(([label, pattern]) =>
    pattern.test(text) ? [label] : [],
  );
}

function extractDuration(text: string): string | undefined {
  const match = text.match(
    /\b(?:since yesterday|lati ana|from yesterday|this morning|since morning|for (?:about )?\d+ (?:hours?|days?|weeks?)|\d+ (?:hours?|days?|weeks?) ago|for (?:a|one) week)\b/iu,
  );
  return match?.[0]?.toLowerCase();
}

function extractRequestedService(text: string): string | undefined {
  return /\b(?:see|talk to|speak (?:with|to)|meet)\s+(?:a\s+)?(?:doctor|clinician|nurse)\b|\b(?:go|come) (?:to )?(?:the )?clinic\b|\b(?:doctor|clinician) appointment\b|\bmo fe ri dokita\b/iu.test(
    text,
  )
    ? "see a clinician"
    : undefined;
}

const preferredNamePattern =
  /^[\p{L}\p{M}][\p{L}\p{M}'’-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}'’-]*){0,2}$/u;
const preferredNamePrompt =
  "Before I prepare your intake, what should I call you? You can give me just your first name or a nickname, or say skip.";

function extractExplicitPreferredName(text: string): string | undefined {
  const match = text.match(
    /\b(?:my name is|call me|you can call me)\s+([\p{L}\p{M}][\p{L}\p{M}'’-]*(?:\s+(?!and\b)[\p{L}\p{M}][\p{L}\p{M}'’-]*){0,2})(?=\s*(?:[,.!?]|$|\band\b))/iu,
  );
  return match?.[1];
}

function extractPreferredNameAnswer(text: string): string | undefined {
  const candidate = text
    .trim()
    .replace(/[,.!?]+$/u, "")
    .trim();
  return candidate.length <= 50 && preferredNamePattern.test(candidate)
    ? candidate
    : undefined;
}

function declinesPreferredName(text: string): boolean {
  return /^(?:skip|no(?: name)?|i(?:'d| would) rather not say|(?:i )?(?:would )?prefer not to say|rather not say|don'?t want to say|jẹ́ ká má lo orúkọ)[.!]?$/iu.test(
    text.trim(),
  );
}

function inferLanguageMix(text: string): HealthcareLanguageMix {
  const yoruba = /\b(?:mo|mi|lati|ana|dokita|ori|inu|aya|gbona|ko ji)\b/iu.test(
    text,
  );
  const pidgin = /\b(?:dey|no fit|wetin|wan|body)\b/iu.test(text);
  const english = /\b(?:have|since|doctor|clinician|pain|want|see|my)\b/iu.test(
    text,
  );
  if (yoruba && pidgin) return "yoruba-pidgin";
  if (yoruba && english) return "yoruba-english";
  if (yoruba) return "yoruba-heavy";
  if (pidgin || english) return "nigerian-english";
  return "undetermined";
}

function cleanedConcern(text: string): string {
  return text.trim().replace(/\s+/gu, " ").slice(0, 500);
}

function recognizesHealthcareRequest(text: string): boolean {
  return (
    extractSymptoms(text).length > 0 ||
    extractRequestedService(text) !== undefined ||
    /\b(?:health|sick|unwell|not feeling well|something is wrong with my body)\b/iu.test(
      text,
    )
  );
}

function requestsClinicalAdvice(text: string): boolean {
  return /\b(?:diagnose|what disease|what illness|prescribe|medicine should i take|what drug|treatment should i use|oogun wo ni)\b/iu.test(
    text,
  );
}

function fieldsFromText(text: string): HealthcareIntakeFields {
  const duration = extractDuration(text);
  const requestedService = extractRequestedService(text);
  const preferredName = extractExplicitPreferredName(text);
  return {
    reportedConcern: cleanedConcern(text),
    reportedSymptoms: extractSymptoms(text),
    ...(duration === undefined ? {} : { duration }),
    ...(requestedService === undefined ? {} : { requestedService }),
    ...(preferredName === undefined ? {} : { preferredName }),
    urgencySignals: detectEmergencySignals(text),
    language: {
      mix: inferLanguageMix(text),
      basis: "deterministic-text-signals",
    },
  };
}

function fieldsFromEntities(
  entities: readonly EntityValue[],
): HealthcareIntakeFields | undefined {
  const entries = Object.fromEntries(
    entities.map(({ name, value }) => [name, value]),
  );
  return parseHealthcareActionInput(entries);
}

function entitiesFromFields(fields: HealthcareIntakeFields): EntityValue[] {
  return Object.entries(fields).map(([name, value]) => ({ name, value }));
}

function mergeFields(
  existing: HealthcareIntakeFields | undefined,
  text: string,
): HealthcareIntakeFields {
  const additions = fieldsFromText(text);
  if (existing === undefined) return additions;
  return {
    reportedConcern: existing.reportedConcern,
    reportedSymptoms: [
      ...new Set([...existing.reportedSymptoms, ...additions.reportedSymptoms]),
    ],
    ...(additions.duration === undefined && existing.duration === undefined
      ? {}
      : { duration: additions.duration ?? existing.duration }),
    ...(additions.requestedService === undefined &&
    existing.requestedService === undefined
      ? {}
      : {
          requestedService:
            additions.requestedService ?? existing.requestedService,
        }),
    ...(additions.preferredName === undefined &&
    existing.preferredName === undefined
      ? {}
      : { preferredName: additions.preferredName ?? existing.preferredName }),
    urgencySignals: [
      ...new Set([...existing.urgencySignals, ...additions.urgencySignals]),
    ],
    language: {
      mix:
        existing.language.mix === "undetermined"
          ? additions.language.mix
          : existing.language.mix,
      basis: "deterministic-text-signals",
    },
  };
}

function hasAsked(state: ConversationState, fragment: string): boolean {
  return state.turns.some(
    ({ role, text }) => role === "assistant" && text.includes(fragment),
  );
}

export class DeterministicHealthcareIntakeInterpreter
  implements ConversationInterpreter
{
  async interpret(
    utterance: UserUtterance,
    state: ConversationState,
  ): Promise<Interpretation> {
    const emergencySignals = detectEmergencySignals(utterance.text);
    if (emergencySignals.length > 0) {
      const fields: HealthcareIntakeFields = {
        reportedConcern: containsUnnecessaryHealthcareIdentifier(utterance.text)
          ? "User reported explicit emergency language; an unnecessary identifier was omitted."
          : cleanedConcern(utterance.text),
        reportedSymptoms: extractSymptoms(utterance.text),
        urgencySignals: emergencySignals,
        language: {
          mix: inferLanguageMix(utterance.text),
          basis: "deterministic-text-signals",
        },
      };
      return {
        kind: "safety-escalation",
        category: "health-emergency",
        intent: { name: CLINIC_INTAKE_INTENT },
        entities: entitiesFromFields(fields),
        reason:
          "Based only on the emergency words you reported, seek immediate local emergency or urgent medical assistance now. This prototype cannot diagnose the cause or provide treatment instructions.",
      };
    }
    if (containsUnnecessaryHealthcareIdentifier(utterance.text)) {
      return {
        kind: "unsupported",
        reason:
          "Do not share passwords, payment credentials, national IDs, insurance numbers, or medical-record numbers.",
      };
    }
    if (requestsClinicalAdvice(utterance.text)) {
      return {
        kind: "unsupported",
        reason:
          "This prototype cannot diagnose, prescribe, or recommend treatment. It can only prepare a simulated clinic intake request.",
      };
    }
    const existing = fieldsFromEntities(state.entities);
    if (
      !recognizesHealthcareRequest(utterance.text) &&
      existing === undefined
    ) {
      return {
        kind: "unsupported",
        reason:
          "This prototype only prepares a simulated clinic intake request from information you report.",
      };
    }
    let fields = mergeFields(existing, utterance.text);
    const wasAskedForPreferredName = hasAsked(
      state,
      "Before I prepare your intake, what should I call you?",
    );
    if (
      fields.requestedService === undefined &&
      hasAsked(state, "Would you like this simulated request") &&
      /\b(?:yes|b[eẹ][eè]ni|please|i do)\b/iu.test(utterance.text)
    ) {
      fields = { ...fields, requestedService: "see a clinician" };
    }
    if (
      fields.preferredName === undefined &&
      wasAskedForPreferredName &&
      !declinesPreferredName(utterance.text)
    ) {
      const preferredName = extractPreferredNameAnswer(utterance.text);
      if (preferredName !== undefined) fields = { ...fields, preferredName };
    }
    let entities = entitiesFromFields(fields);
    if (fields.reportedConcern === "") {
      return clarification(
        "What health concern would you like the clinic to know about?",
        ["reportedConcern"],
        entities,
      );
    }
    if (
      fields.reportedSymptoms.length > 0 &&
      fields.duration === undefined &&
      !hasAsked(state, "How long have you had")
    ) {
      return clarification(
        "How long have you had these symptoms? You can say you are not sure.",
        ["duration"],
        entities,
      );
    }
    if (fields.requestedService === undefined) {
      return clarification(
        "Would you like this simulated request sent for a clinician to review?",
        ["requestedService"],
        entities,
      );
    }
    if (fields.preferredName === undefined && !wasAskedForPreferredName) {
      return clarification(preferredNamePrompt, ["preferredName"], entities);
    }
    entities = entitiesFromFields(fields);
    return {
      kind: "action-proposed",
      intent: { name: CLINIC_INTAKE_INTENT },
      entities,
      proposedAction: {
        proposalId: `interpreted-${stableFingerprint(fields)}`,
        actionName: CREATE_CLINIC_INTAKE_ACTION,
        input: fieldsToActionInput(fields),
        proposedAtRevision: state.revision,
        inputFingerprint: stableFingerprint(fields),
        confirmation: { status: "required" },
      },
    };
  }
}

function clarification(
  question: string,
  missingEntities: readonly string[],
  entities: readonly EntityValue[],
): Interpretation {
  return {
    kind: "clarification-required",
    question,
    missingEntities,
    entities,
    intent: { name: CLINIC_INTAKE_INTENT },
  };
}

export function summarizeHealthcareIntake(
  fields: HealthcareIntakeFields,
): string {
  const symptoms =
    fields.reportedSymptoms.length === 0
      ? "No specific symptom phrase was identified"
      : `Symptoms you reported: ${fields.reportedSymptoms.join(", ")}`;
  const duration =
    fields.duration === undefined
      ? "Duration was not stated"
      : `Duration you reported: ${fields.duration}`;
  const service =
    fields.requestedService === undefined
      ? "No service preference was stated"
      : `Requested service: ${fields.requestedService}`;
  return `You reported: ${fields.reportedConcern}. ${symptoms}. ${duration}. ${service}. This summarizes your words and is not a diagnosis.`;
}

function stableFingerprint(fields: HealthcareIntakeFields): string {
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

export class HealthcareIntakeService {
  readonly #conversations = new Map<string, ActiveHealthcareConversation>();
  readonly #interpreter = new DeterministicHealthcareIntakeInterpreter();
  readonly #action: ActionExecutor;

  constructor(private readonly dependencies: HealthcareIntakeDependencies) {
    this.#action = createClinicIntakeExecutor(dependencies);
  }

  startConversation(): HealthcareIntakeReply {
    const id = this.dependencies.createId("conversation") as ConversationId;
    const assistantMessage =
      "Tell me the health concern you want a clinician to review. This simulation cannot diagnose or recommend treatment. Do not share identifiers such as a national ID, insurance number, or medical-record number.";
    this.#conversations.set(id, {
      id,
      revision: 0,
      entities: [],
      fields: undefined,
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
      missingFields: ["reportedConcern"],
    };
  }

  async submitUtterance(
    conversationId: string,
    text: string,
  ): Promise<HealthcareIntakeReply> {
    const conversation = this.getConversation(conversationId);
    if (
      conversation.proposal !== undefined ||
      conversation.intakeReference !== undefined ||
      conversation.emergencyEscalated === true
    ) {
      throw new HealthcareIntakeError(
        "invalid-state",
        "This conversation is not accepting another utterance.",
        409,
      );
    }
    if (text.trim() === "")
      throw new HealthcareIntakeError(
        "invalid-utterance",
        "Utterance text is required.",
        400,
      );
    const hasUnnecessaryIdentifier =
      containsUnnecessaryHealthcareIdentifier(text);
    const emergencySignals = detectEmergencySignals(text);
    if (hasUnnecessaryIdentifier && emergencySignals.length === 0) {
      throw new HealthcareIntakeError(
        "sensitive-input",
        "Unnecessary sensitive identifiers were rejected and not retained. Remove them and try again.",
        400,
      );
    }

    const now = this.dependencies.now().toISOString();
    conversation.turns.push({
      role: "user",
      text: hasUnnecessaryIdentifier
        ? "[Emergency statement with unnecessary identifier redacted]"
        : text.trim(),
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
      throw new HealthcareIntakeError(
        "unsupported-intent",
        interpretation.reason,
        422,
      );
    }
    conversation.entities = [...interpretation.entities];
    conversation.fields = fieldsFromEntities(interpretation.entities);
    if (interpretation.kind === "safety-escalation") {
      conversation.emergencyEscalated = true;
      conversation.turns.push({
        role: "assistant",
        text: interpretation.reason,
        occurredAt: now,
      });
      return {
        state: "emergency-escalation",
        conversationId: conversation.id,
        revision: conversation.revision,
        assistantMessage: interpretation.reason,
        urgencySignals: (conversation.fields?.urgencySignals ??
          []) as readonly UrgencySignal[],
        intakeCreated: false,
      };
    }
    if (interpretation.kind === "clarification-required") {
      conversation.turns.push({
        role: "assistant",
        text: interpretation.question,
        occurredAt: now,
      });
      return {
        state: "awaiting-input",
        conversationId: conversation.id,
        revision: conversation.revision,
        assistantMessage: interpretation.question,
        missingFields: interpretation.missingEntities as readonly (
          | "reportedConcern"
          | "duration"
          | "requestedService"
          | "preferredName"
        )[],
      };
    }
    const fields = conversation.fields;
    if (fields === undefined)
      throw new HealthcareIntakeError(
        "invalid-intake-input",
        "The clinic intake information could not be structured.",
        422,
      );
    const summary = summarizeHealthcareIntake(fields);
    const proposal: HealthcareIntakeProposal = {
      id: this.dependencies.createId("proposal"),
      conversationRevision: conversation.revision,
      inputFingerprint: stableFingerprint(fields),
      summary,
      fields,
    };
    conversation.proposal = proposal;
    const latestUserText = text.trim();
    const nameAcknowledgement =
      fields.preferredName === undefined
        ? declinesPreferredName(latestUserText)
          ? "That's okay. I can create the simulated intake without a name. "
          : ""
        : hasAsked(
              conversation,
              "Before I prepare your intake, what should I call you?",
            )
          ? `Thanks, ${fields.preferredName}. `
          : "";
    const assistantMessage = `${nameAcknowledgement}${summary} Do you confirm that I should create this simulated clinic intake request?`;
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
  ): Promise<HealthcareIntakeReply> {
    const conversation = this.getConversation(conversationId);
    if (conversation.emergencyEscalated === true)
      throw new HealthcareIntakeError(
        "emergency-intake-blocked",
        "A routine intake cannot be created after emergency escalation.",
        409,
      );
    if (conversation.intakeReference !== undefined)
      throw new HealthcareIntakeError(
        "already-executed",
        "This simulated clinic intake has already been created.",
        409,
      );
    const proposal = conversation.proposal;
    if (proposal === undefined)
      throw new HealthcareIntakeError(
        "no-proposal",
        "There is no clinic intake proposal to confirm.",
        409,
      );
    const confirmedAt = this.dependencies.now().toISOString();
    const request: ActionRequest = {
      id: this.dependencies.createId("action") as ActionId,
      conversationId: conversation.id,
      actionName: CREATE_CLINIC_INTAKE_ACTION,
      input: fieldsToActionInput(proposal.fields),
      idempotencyKey: `clinic-intake:${conversation.id}:${proposal.id}`,
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
      throw new HealthcareIntakeError(
        validation.error.code,
        validation.error.message,
        409,
      );
    const outcome = await this.#action.execute(validation.value);
    if (!outcome.ok || outcome.status !== "completed")
      throw new HealthcareIntakeError(
        outcome.ok ? "action-incomplete" : outcome.error.code,
        outcome.userMessage,
        500,
      );
    const reference = outcome.output.reference;
    if (typeof reference !== "string")
      throw new HealthcareIntakeError(
        "invalid-action-output",
        "The simulated clinic intake could not be created.",
        500,
      );
    conversation.intakeReference = reference;
    conversation.revision += 1;
    conversation.turns.push({
      role: "assistant",
      text: outcome.userMessage,
      occurredAt: confirmedAt,
    });
    return {
      state: "intake-created",
      conversationId: conversation.id,
      revision: conversation.revision,
      assistantMessage: outcome.userMessage,
      intakeReference: reference,
    };
  }

  async getIntake(reference: string): Promise<ClinicIntake> {
    const intake = await this.dependencies.intakes.findByReference(reference);
    if (intake === undefined)
      throw new HealthcareIntakeError(
        "intake-not-found",
        "Simulated clinic intake not found.",
        404,
      );
    return intake;
  }

  private getConversation(id: string): ActiveHealthcareConversation {
    const conversation = this.#conversations.get(id);
    if (conversation === undefined)
      throw new HealthcareIntakeError(
        "conversation-not-found",
        "Conversation not found.",
        404,
      );
    return conversation;
  }
}

export const createClinicIntakeDefinition: ActionDefinition = {
  name: CREATE_CLINIC_INTAKE_ACTION,
  description: "Create a simulated clinic intake request.",
  consequence: "consequential",
  confirmationPolicy: "explicit",
  requiredInputNames: [
    "reportedConcern",
    "reportedSymptoms",
    "urgencySignals",
    "language",
  ],
};

export function createClinicIntakeExecutor(
  dependencies: HealthcareIntakeDependencies,
): ActionExecutor {
  return {
    definition: createClinicIntakeDefinition,
    async execute(request): Promise<ActionOutcome> {
      const existing = await dependencies.intakes.findByIdempotencyKey(
        request.idempotencyKey,
      );
      if (existing !== undefined)
        return {
          ok: true,
          status: "completed",
          output: { reference: existing.reference },
          userMessage: `Your simulated clinic intake request is already recorded. Reference: ${existing.reference}`,
        };
      const fields = parseHealthcareActionInput(request.input);
      if (fields === undefined || fields.urgencySignals.length > 0)
        return {
          ok: false,
          status: "rejected",
          error: {
            code:
              fields === undefined
                ? "invalid-intake-input"
                : "emergency-intake-blocked",
            message:
              "A routine clinic intake cannot be created from incomplete or emergency-escalated input.",
            retryable: false,
          },
          userMessage: "The simulated clinic intake request was not created.",
        };
      if (request.confirmation.kind !== "explicit")
        return {
          ok: false,
          status: "rejected",
          error: {
            code: "confirmation-required",
            message: "Explicit confirmation is required.",
            retryable: false,
          },
          userMessage:
            "Please confirm before the simulated clinic intake is created.",
        };
      const reference = `BRG-H-${dependencies.now().getUTCFullYear()}-${dependencies.createId("intake").toUpperCase()}`;
      const intake: ClinicIntake = {
        reference,
        intent: CLINIC_INTAKE_INTENT,
        status: "created",
        simulated: true,
        createdAt: dependencies.now().toISOString(),
        conversationId: request.conversationId,
        fields,
        summary: request.confirmation.actionSummary,
        proposalId: request.proposal.id,
        confirmation: {
          state: "confirmed",
          confirmedAt: request.confirmation.confirmedAt,
          conversationRevision: request.confirmation.conversationRevision,
          inputFingerprint: request.confirmation.inputFingerprint,
        },
      };
      await dependencies.intakes.save(intake, request.idempotencyKey);
      return {
        ok: true,
        status: "completed",
        output: { reference },
        userMessage: `Your simulated clinic intake request has been created. Reference: ${reference}. This is not an appointment confirmation and no clinic was contacted.`,
      };
    },
  };
}

export function createHealthcareIntakeDomainModule(
  dependencies: HealthcareIntakeDependencies,
) {
  return {
    id: "healthcare-intake",
    displayName: "Voice-first clinic intake",
    interpreter: new DeterministicHealthcareIntakeInterpreter(),
    actions: [createClinicIntakeExecutor(dependencies)],
  };
}

function fieldsToActionInput(
  fields: HealthcareIntakeFields,
): Readonly<Record<string, JsonValue>> {
  return {
    reportedConcern: fields.reportedConcern,
    reportedSymptoms: [...fields.reportedSymptoms],
    ...(fields.duration === undefined ? {} : { duration: fields.duration }),
    ...(fields.requestedService === undefined
      ? {}
      : { requestedService: fields.requestedService }),
    ...(fields.preferredName === undefined
      ? {}
      : { preferredName: fields.preferredName }),
    urgencySignals: [...fields.urgencySignals],
    language: { ...fields.language },
  };
}

function parseHealthcareActionInput(
  input: Readonly<Record<string, JsonValue>>,
): HealthcareIntakeFields | undefined {
  const concern = input.reportedConcern;
  const symptoms = input.reportedSymptoms;
  const urgency = input.urgencySignals;
  const language = input.language;
  const urgencySignals = new Set<UrgencySignal>([
    "cannot-breathe",
    "unconscious-or-not-waking",
    "severe-uncontrolled-bleeding",
    "active-seizure",
    "explicit-life-threatening-emergency",
  ]);
  const languageMixes = new Set<HealthcareLanguageMix>([
    "yoruba-heavy",
    "yoruba-english",
    "yoruba-pidgin",
    "nigerian-english",
    "undetermined",
  ]);
  if (
    typeof concern !== "string" ||
    concern.trim() === "" ||
    !Array.isArray(symptoms) ||
    symptoms.some((item) => typeof item !== "string") ||
    !Array.isArray(urgency) ||
    urgency.some(
      (item) =>
        typeof item !== "string" || !urgencySignals.has(item as UrgencySignal),
    ) ||
    language === null ||
    Array.isArray(language) ||
    typeof language !== "object" ||
    typeof language.mix !== "string" ||
    !languageMixes.has(language.mix as HealthcareLanguageMix) ||
    language.basis !== "deterministic-text-signals" ||
    (input.preferredName !== undefined &&
      !isValidPreferredName(input.preferredName))
  ) {
    return undefined;
  }
  return {
    reportedConcern: concern,
    reportedSymptoms: symptoms as string[],
    ...(typeof input.duration === "string" ? { duration: input.duration } : {}),
    ...(typeof input.requestedService === "string"
      ? { requestedService: input.requestedService }
      : {}),
    ...(isValidPreferredName(input.preferredName)
      ? { preferredName: input.preferredName }
      : {}),
    urgencySignals: urgency as UrgencySignal[],
    language: {
      mix: language.mix as HealthcareLanguageMix,
      basis: "deterministic-text-signals",
    },
  };
}

function isValidPreferredName(value: JsonValue | undefined): value is string {
  if (value === undefined) return false;
  if (typeof value !== "string" || value.length > 50) return false;
  return preferredNamePattern.test(value);
}
