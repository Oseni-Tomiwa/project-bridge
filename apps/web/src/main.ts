import "./style.css";

document.documentElement.dataset.javascript = "enabled";

const apiBase = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";
const history = requiredElement<HTMLOListElement>("history");
const form = requiredElement<HTMLFormElement>("utterance-form");
const textarea = requiredElement<HTMLTextAreaElement>("utterance");
const sendButton = requiredElement<HTMLButtonElement>("send");
const confirmation = requiredElement<HTMLDivElement>("confirmation");
const proposalSummary =
  requiredElement<HTMLParagraphElement>("proposal-summary");
const confirmButton = requiredElement<HTMLButtonElement>("confirm");
const status = requiredElement<HTMLParagraphElement>("status");

interface Proposal {
  id: string;
  conversationRevision: number;
  summary: string;
}

interface ApiReply {
  state: "awaiting-input" | "awaiting-confirmation" | "case-created";
  conversationId: string;
  revision: number;
  assistantMessage: string;
  proposal?: Proposal;
  caseReference?: string;
}

let conversationId: string | undefined;
let currentProposal: Proposal | undefined;

function requiredElement<ElementType extends HTMLElement>(
  id: string,
): ElementType {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as ElementType;
}

function addTurn(role: "You" | "Bridge", text: string): void {
  const item = document.createElement("li");
  item.className = role === "You" ? "turn user" : "turn assistant";
  const label = document.createElement("strong");
  label.textContent = role;
  const message = document.createElement("p");
  message.textContent = text;
  item.append(label, message);
  history.append(item);
  item.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function request(path: string, init?: RequestInit): Promise<ApiReply> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as ApiReply & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      body.error?.message ?? "The request could not be completed.",
    );
  }
  return body;
}

function applyReply(reply: ApiReply): void {
  status.setAttribute("role", "status");
  conversationId = reply.conversationId;
  addTurn("Bridge", reply.assistantMessage);
  currentProposal = reply.proposal;
  confirmation.hidden = reply.state !== "awaiting-confirmation";
  form.hidden = reply.state !== "awaiting-input";
  if (reply.proposal) proposalSummary.textContent = reply.proposal.summary;
  if (reply.state === "case-created") {
    status.textContent = `Support case reference: ${reply.caseReference ?? "unavailable"}`;
    status.className = "status success";
  }
}

async function start(): Promise<void> {
  setBusy(true, "Starting a local demo conversation…");
  try {
    applyReply(await request("/conversations", { method: "POST" }));
    status.textContent = "";
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textarea.value.trim();
  if (!conversationId || text === "") return;
  textarea.value = "";
  setBusy(true, "Checking your message…");
  void request(
    `/conversations/${encodeURIComponent(conversationId)}/utterances`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
  )
    .then((reply) => {
      status.textContent = "";
      status.className = "status";
      addTurn("You", text);
      applyReply(reply);
      textarea.focus();
    })
    .catch(showError)
    .finally(() => setBusy(false));
});

confirmButton.addEventListener("click", () => {
  if (!conversationId || !currentProposal) return;
  setBusy(true, "Creating the simulated support case…");
  void request(
    `/conversations/${encodeURIComponent(conversationId)}/confirmations`,
    {
      method: "POST",
      body: JSON.stringify({
        proposalId: currentProposal.id,
        conversationRevision: currentProposal.conversationRevision,
      }),
    },
  )
    .then((reply) => {
      confirmation.hidden = true;
      applyReply(reply);
    })
    .catch(showError)
    .finally(() => setBusy(false));
});

function setBusy(busy: boolean, message = ""): void {
  textarea.disabled = busy;
  sendButton.disabled = busy;
  confirmButton.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
  confirmation.setAttribute("aria-busy", String(busy));
  if (message) status.textContent = message;
}

function showError(error: unknown): void {
  status.textContent =
    error instanceof Error ? error.message : "Something went wrong. Try again.";
  status.className = "status error";
  status.setAttribute("role", "alert");
  if (!form.hidden) textarea.focus();
}

void start();
