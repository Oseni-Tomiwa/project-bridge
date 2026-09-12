import { randomBytes, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";

import {
  FinancialSupportError,
  FinancialSupportService,
  HealthcareIntakeError,
  HealthcareIntakeService,
  InMemoryClinicIntakeRepository,
  InMemorySupportCaseRepository,
} from "@project-bridge/domain";
import type { SpeechProvider } from "@project-bridge/speech";
import {
  PRODUCT_AUDIO_MAX_BYTES,
  ProductSpeechError,
  createDefaultProductSpeechProvider,
  transcribeProductAudio,
} from "./speech-transcription.ts";

export function createDefaultFinancialSupportService(): FinancialSupportService {
  return new FinancialSupportService({
    cases: new InMemorySupportCaseRepository(),
    now: () => new Date(),
    createId(kind) {
      return kind === "case"
        ? randomBytes(3).toString("hex")
        : `${kind}-${randomUUID()}`;
    },
  });
}

export function createDefaultHealthcareIntakeService(): HealthcareIntakeService {
  return new HealthcareIntakeService({
    intakes: new InMemoryClinicIntakeRepository(),
    now: () => new Date(),
    createId(kind) {
      return kind === "intake"
        ? randomBytes(3).toString("hex")
        : `${kind}-${randomUUID()}`;
    },
  });
}

export function createApiServer(
  service: HealthcareIntakeService = createDefaultHealthcareIntakeService(),
  speechProvider:
    | SpeechProvider
    | undefined = createDefaultProductSpeechProvider(),
) {
  return createServer((request, response) => {
    void route(request, response, service, speechProvider);
  });
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  service: HealthcareIntakeService,
  speechProvider: SpeechProvider | undefined,
): Promise<void> {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Audio-Duration-Ms",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  try {
    if (
      request.method === "POST" &&
      url.pathname === "/speech/transcriptions"
    ) {
      const upload = await readAudioUpload(request);
      send(response, 200, await transcribeProductAudio(speechProvider, upload));
      return;
    }
    const body = request.method === "POST" ? await readJson(request) : {};
    const result = await dispatchApiRequest(
      service,
      request.method ?? "GET",
      url.pathname,
      body,
    );
    send(response, result.status, result.body);
  } catch (error) {
    const result = apiErrorResponse(error);
    send(response, result.status, result.body);
  }
}

export interface ApiDispatchResult {
  readonly status: number;
  readonly body: unknown;
}

/** Application-level router, exported so route behavior is testable without a socket. */
export async function dispatchApiRequest(
  service: HealthcareIntakeService,
  method: string,
  path: string,
  body: Readonly<Record<string, unknown>> = {},
): Promise<ApiDispatchResult> {
  if (method === "GET" && path === "/health") {
    return { status: 200, body: { status: "ok" } };
  }
  if (method === "GET" && path === "/capabilities") {
    return {
      status: 200,
      body: {
        codename: "Project Bridge",
        status: "prototype",
        implemented: [
          "deterministic healthcare-intake interpretation",
          "conservative emergency-language escalation",
          "clarification and explicit confirmation",
          "simulated in-memory clinic intakes",
          "request-scoped Intron/Sahara voice transcription",
        ],
        notImplemented: [
          "text-to-speech",
          "diagnosis, treatment, or prescription guidance",
          "real clinic, appointment, or medical-record integrations",
          "authentication",
          "durable persistence",
        ],
      },
    };
  }
  if (method === "POST" && path === "/conversations") {
    return { status: 201, body: service.startConversation() };
  }

  const utteranceMatch = path.match(/^\/conversations\/([^/]+)\/utterances$/u);
  if (method === "POST" && utteranceMatch?.[1]) {
    if (typeof body.text !== "string") {
      throw new HealthcareIntakeError(
        "invalid-request",
        "A string 'text' field is required.",
        400,
      );
    }
    return {
      status: 200,
      body: await service.submitUtterance(
        decodeURIComponent(utteranceMatch[1]),
        body.text,
      ),
    };
  }

  const confirmationMatch = path.match(
    /^\/conversations\/([^/]+)\/confirmations$/u,
  );
  if (method === "POST" && confirmationMatch?.[1]) {
    if (
      typeof body.proposalId !== "string" ||
      typeof body.conversationRevision !== "number"
    ) {
      throw new HealthcareIntakeError(
        "invalid-request",
        "proposalId and numeric conversationRevision are required.",
        400,
      );
    }
    return {
      status: 200,
      body: await service.confirm(
        decodeURIComponent(confirmationMatch[1]),
        body.proposalId,
        body.conversationRevision,
      ),
    };
  }

  const intakeMatch = path.match(/^\/clinic-intakes\/([^/]+)$/u);
  if (method === "GET" && intakeMatch?.[1]) {
    return {
      status: 200,
      body: await service.getIntake(decodeURIComponent(intakeMatch[1])),
    };
  }
  return {
    status: 404,
    body: { error: { code: "not-found", message: "Not found" } },
  };
}

export function apiErrorResponse(error: unknown): ApiDispatchResult {
  if (error instanceof ProductSpeechError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }
  if (error instanceof FinancialSupportError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }
  if (error instanceof HealthcareIntakeError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "internal-error",
        message: "An unexpected error occurred.",
      },
    },
  };
}

async function readAudioUpload(request: IncomingMessage): Promise<{
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly durationMilliseconds?: number;
}> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > PRODUCT_AUDIO_MAX_BYTES) {
      tooLarge = true;
    } else {
      chunks.push(buffer);
    }
  }
  if (tooLarge) {
    throw new ProductSpeechError(
      "audio-too-large",
      "The recording is too large. Record a shorter message or type it instead.",
      413,
    );
  }

  const durationHeader = request.headers["x-audio-duration-ms"];
  const durationText = Array.isArray(durationHeader)
    ? durationHeader[0]
    : durationHeader;
  const durationMilliseconds =
    durationText === undefined ? undefined : Number(durationText);
  if (
    durationMilliseconds !== undefined &&
    (!Number.isFinite(durationMilliseconds) || durationMilliseconds < 0)
  ) {
    throw new ProductSpeechError(
      "invalid-audio-duration",
      "The audio duration header must be a non-negative number.",
      400,
    );
  }

  return {
    bytes: new Uint8Array(Buffer.concat(chunks)),
    mediaType: request.headers["content-type"] ?? "",
    ...(durationMilliseconds === undefined ? {} : { durationMilliseconds }),
  };
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += String(chunk);
    if (raw.length > 16_384) {
      throw new HealthcareIntakeError(
        "request-too-large",
        "Request body is too large.",
        413,
      );
    }
  }
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HealthcareIntakeError(
      "invalid-json",
      "Request body must be a JSON object.",
      400,
    );
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status).end(JSON.stringify(body));
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const host = process.env.API_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.API_PORT ?? "3000", 10);
  createApiServer().listen(port, host, () => {
    console.log(`Project Bridge API listening at http://${host}:${port}`);
  });
}
