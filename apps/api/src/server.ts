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
  InMemorySupportCaseRepository,
} from "@project-bridge/domain";

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

export function createApiServer(
  service: FinancialSupportService = createDefaultFinancialSupportService(),
) {
  return createServer((request, response) => {
    void route(request, response, service);
  });
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  service: FinancialSupportService,
): Promise<void> {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  try {
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
  service: FinancialSupportService,
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
          "deterministic failed-transfer interpretation",
          "clarification and explicit confirmation",
          "simulated in-memory support cases",
        ],
        notImplemented: [
          "speech integrations",
          "real financial-service integrations",
          "authentication",
          "durable persistence",
          "benchmark execution",
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
      throw new FinancialSupportError(
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
      throw new FinancialSupportError(
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

  const caseMatch = path.match(/^\/support-cases\/([^/]+)$/u);
  if (method === "GET" && caseMatch?.[1]) {
    return {
      status: 200,
      body: await service.getCase(decodeURIComponent(caseMatch[1])),
    };
  }
  return {
    status: 404,
    body: { error: { code: "not-found", message: "Not found" } },
  };
}

export function apiErrorResponse(error: unknown): ApiDispatchResult {
  if (error instanceof FinancialSupportError) {
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

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += String(chunk);
    if (raw.length > 16_384) {
      throw new FinancialSupportError(
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
    throw new FinancialSupportError(
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
