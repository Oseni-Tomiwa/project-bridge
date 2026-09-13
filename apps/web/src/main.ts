import "./style.css";

import {
  VoiceRecorderController,
  VoiceTranscriptionError,
  type VoiceRecorderSnapshot,
  type VoiceTranscription,
} from "./voice-recorder.js";

document.documentElement.dataset.javascript = "enabled";

const apiBase = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";
const history = requiredElement<HTMLOListElement>("history");
const interaction = requiredElement<HTMLDivElement>("interaction");
const form = requiredElement<HTMLFormElement>("utterance-form");
const textarea = requiredElement<HTMLTextAreaElement>("utterance");
const sendButton = requiredElement<HTMLButtonElement>("send");
const confirmation = requiredElement<HTMLDivElement>("confirmation");
const proposalSummary =
  requiredElement<HTMLParagraphElement>("proposal-summary");
const confirmButton = requiredElement<HTMLButtonElement>("confirm");
const status = requiredElement<HTMLParagraphElement>("status");
const flowState = requiredElement<HTMLParagraphElement>("flow-state");
const voicePanel = requiredElement<HTMLElement>("voice-panel");
const voiceHeading = requiredElement<HTMLHeadingElement>("voice-heading");
const voiceState = requiredElement<HTMLParagraphElement>("voice-state");
const recordButton = requiredElement<HTMLButtonElement>("record");
const recordingControls = requiredElement<HTMLDivElement>("recording-controls");
const recordingTime = requiredElement<HTMLTimeElement>("recording-time");
const stopButton = requiredElement<HTMLButtonElement>("stop-recording");
const cancelButton = requiredElement<HTMLButtonElement>("cancel-recording");
const transcriptForm = requiredElement<HTMLFormElement>("transcript-form");
const rawTranscript = requiredElement<HTMLElement>("raw-transcript");
const transcript = requiredElement<HTMLTextAreaElement>("transcript");
const continueButton = requiredElement<HTMLButtonElement>(
  "continue-transcript",
);
const recordAgainButton = requiredElement<HTMLButtonElement>("record-again");
const utteranceLabel = requiredElement<HTMLLabelElement>("utterance-label");

// Enhanced UI Elements
const emergencyCard = document.getElementById("emergency-card") as HTMLElement | null;
const intakePass = document.getElementById("intake-pass") as HTMLElement | null;
const passReferenceCode = document.getElementById("pass-reference-code");
const passDetails = document.getElementById("pass-details");
const btnCopyRef = document.getElementById("btn-copy-ref");
const btnNewIntake = document.getElementById("btn-new-intake");
const btnShowSamples = document.getElementById("btn-show-samples");
const btnShowBenchmark = document.getElementById("btn-show-benchmark");
const btnResetSession = document.getElementById("btn-reset-session");
const benchmarkModal = document.getElementById("benchmark-modal") as HTMLDialogElement | null;
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCloseModalBottom = document.getElementById("btn-close-modal-bottom");
const demoTray = document.getElementById("demo-tray");
const triageCard = document.getElementById("triage-card");
const transcriptLatency = document.getElementById("transcript-latency");
const textFallback = document.getElementById("text-fallback") as HTMLDetailsElement | null;

interface Proposal {
  id: string;
  conversationRevision: number;
  summary: string;
}

interface ApiReply {
  state:
    | "awaiting-input"
    | "awaiting-confirmation"
    | "emergency-escalation"
    | "intake-created";
  conversationId: string;
  revision: number;
  assistantMessage: string;
  proposal?: Proposal;
  intakeReference?: string;
  missingFields?: readonly string[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

type ProductState =
  | "idle"
  | "requesting-microphone"
  | "recording"
  | "processing/transcribing"
  | "transcription-ready"
  | "submitting-utterance"
  | "clarification"
  | "confirmation"
  | "emergency-escalation"
  | "completed"
  | "error";

let conversationId: string | undefined;
let currentProposal: Proposal | undefined;
let productState: ProductState = "idle";
let interactionBusy = false;
let voiceOperationBusy = false;
let lastTranscription: VoiceTranscription | undefined;

function requiredElement<ElementType extends HTMLElement>(
  id: string,
): ElementType {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as ElementType;
}

function setProductState(next: ProductState): void {
  productState = next;
  document.documentElement.dataset.productState = productState;
}

function addTurn(role: "You" | "Bridge", text: string, scroll = true): void {
  const item = document.createElement("li");
  item.className = role === "You" ? "turn user" : "turn assistant";
  const label = document.createElement("strong");
  label.textContent = role === "You" ? "You (Patient)" : "Bridge Clinical Assistant";
  const message = document.createElement("p");
  message.textContent = text;
  item.append(label, message);
  history.append(item);
  if (scroll) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function request<ResponseBody>(
  path: string,
  init?: RequestInit,
): Promise<ResponseBody> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(
      "The demo service is unavailable. Restart the demo and try again.",
    );
  }
  let body: ResponseBody & ApiErrorBody;
  try {
    body = (await response.json()) as ResponseBody & ApiErrorBody;
  } catch {
    throw new Error("The demo could not read the response. Try again.");
  }
  if (!response.ok) {
    throw new Error(
      body.error?.message ?? "The request could not be completed.",
    );
  }
  return body;
}

async function transcribeAudio(
  audio: Blob,
  durationMilliseconds: number,
): Promise<VoiceTranscription> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/speech/transcriptions`, {
      method: "POST",
      headers: {
        "Content-Type": audio.type,
        "X-Audio-Duration-Ms": String(Math.round(durationMilliseconds)),
      },
      body: audio,
    });
  } catch {
    throw new VoiceTranscriptionError(
      "api-unavailable",
      "The transcription service is unavailable. Try again or type your message.",
    );
  }
  let body: Partial<VoiceTranscription> & ApiErrorBody;
  try {
    body = (await response.json()) as Partial<VoiceTranscription> &
      ApiErrorBody;
  } catch {
    throw new VoiceTranscriptionError(
      "invalid-transcription-response",
      "The transcription response was unreadable. Try again or type your message.",
    );
  }
  if (!response.ok) {
    throw new VoiceTranscriptionError(
      body.error?.code ?? "transcription-failed",
      body.error?.message ??
        "The recording could not be transcribed. Try again or type your message.",
    );
  }
  if (
    typeof body.transcript !== "string" ||
    typeof body.provider !== "string" ||
    typeof body.latencyMs !== "number"
  ) {
    throw new VoiceTranscriptionError(
      "invalid-transcription-response",
      "The transcription response was incomplete. Try again or type your message.",
    );
  }
  lastTranscription = {
    transcript: body.transcript,
    provider: body.provider,
    latencyMs: body.latencyMs,
  };
  return lastTranscription;
}

const voice = new VoiceRecorderController({
  ...(navigator.mediaDevices === undefined
    ? {}
    : { mediaDevices: navigator.mediaDevices }),
  ...(globalThis.MediaRecorder === undefined
    ? {}
    : { MediaRecorder: globalThis.MediaRecorder }),
  transcribe: transcribeAudio,
  onChange: renderVoice,
});

function renderVoice(snapshot: VoiceRecorderSnapshot): void {
  voiceOperationBusy =
    snapshot.state === "requesting-microphone" ||
    snapshot.state === "recording" ||
    snapshot.state === "processing";
  recordingTime.textContent = formatDuration(snapshot.elapsedMilliseconds);
  recordingControls.hidden = snapshot.state !== "recording";
  voicePanel.hidden = snapshot.state === "transcription-ready";
  transcriptForm.hidden = snapshot.state !== "transcription-ready";
  recordButton.hidden = snapshot.state === "recording";
  recordButton.disabled =
    interactionBusy ||
    snapshot.state === "requesting-microphone" ||
    snapshot.state === "processing";
  stopButton.disabled = interactionBusy;
  cancelButton.disabled = interactionBusy;
  transcript.disabled = interactionBusy;
  continueButton.disabled = interactionBusy;
  recordAgainButton.disabled = interactionBusy;
  textarea.disabled = interactionBusy || voiceOperationBusy;
  sendButton.disabled = interactionBusy || voiceOperationBusy;

  if (transcriptLatency && lastTranscription) {
    transcriptLatency.textContent = `~${(lastTranscription.latencyMs / 1000).toFixed(1)}s`;
  }

  switch (snapshot.state) {
    case "idle":
      setProductState("idle");
      voiceState.textContent =
        "Microphone access is requested only when you start recording.";
      voiceState.setAttribute("role", "status");
      break;
    case "requesting-microphone":
      setProductState("requesting-microphone");
      voiceState.textContent = "Requesting microphone permission…";
      break;
    case "recording":
      setProductState("recording");
      voiceState.textContent =
        "Recording is active. Stop when you have finished speaking.";
      break;
    case "processing":
      setProductState("processing/transcribing");
      voiceState.textContent = "Transcribing your recording with Sahara ASR…";
      break;
    case "transcription-ready":
      setProductState("transcription-ready");
      rawTranscript.textContent = snapshot.rawTranscript;
      transcript.value = snapshot.editableTranscript;
      queueMicrotask(() => transcript.focus());
      break;
    case "error":
      setProductState("error");
      voiceState.textContent =
        snapshot.errorMessage ??
        "Voice input failed. Type your message instead.";
      voiceState.setAttribute("role", "alert");
      break;
  }
}

function renderTriageCard(summary: string): void {
  if (!triageCard) return;
  triageCard.innerHTML = "";

  const concernMatch = summary.match(/You reported:\s*([^.]+)/i);
  const symptomsMatch = summary.match(/Symptoms you reported:\s*([^.]+)/i);
  const durationMatch = summary.match(/Duration you reported:\s*([^.]+)/i);
  const serviceMatch = summary.match(/Requested service:\s*([^.]+)/i);

  const rows: Array<{ label: string; value: string }> = [];
  if (concernMatch?.[1]) {
    rows.push({ label: "Reported Concern", value: concernMatch[1].trim() });
  }
  if (symptomsMatch?.[1]) {
    rows.push({ label: "Identified Symptoms", value: symptomsMatch[1].trim() });
  }
  if (durationMatch?.[1]) {
    rows.push({ label: "Duration", value: durationMatch[1].trim() });
  }
  if (serviceMatch?.[1]) {
    rows.push({ label: "Requested Service", value: serviceMatch[1].trim() });
  }

  if (rows.length === 0) {
    rows.push({ label: "Intake Summary", value: summary });
  }

  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "triage-row";
    const labelEl = document.createElement("span");
    labelEl.className = "triage-field-label";
    labelEl.textContent = row.label;
    const valEl = document.createElement("span");
    valEl.className = "triage-field-val";
    valEl.textContent = row.value;
    rowEl.append(labelEl, valEl);
    triageCard.append(rowEl);
  }
}

function applyReply(reply: ApiReply): void {
  conversationId = reply.conversationId;
  addTurn("Bridge", reply.assistantMessage, reply.revision > 0);
  currentProposal = reply.proposal;
  confirmation.hidden = reply.state !== "awaiting-confirmation";
  interaction.hidden = reply.state !== "awaiting-input";
  if (reply.proposal) {
    proposalSummary.textContent = reply.proposal.summary;
    renderTriageCard(reply.proposal.summary);
  }

  if (reply.state === "awaiting-input") {
    setProductState(reply.revision === 0 ? "idle" : "clarification");
    if (emergencyCard) emergencyCard.hidden = true;
    if (intakePass) intakePass.hidden = true;

    const askingForName =
      reply.missingFields?.includes("preferredName") === true;
    flowState.textContent = askingForName
      ? "Optional name"
      : reply.revision === 0
        ? "Ready for your concern"
        : "Clarification needed";
    voiceHeading.textContent = askingForName
      ? "Say what we should call you—or say skip"
      : reply.revision === 0
        ? "Tell us your health concern"
        : "Reply to continue your intake";
    utteranceLabel.textContent = askingForName
      ? "First name, nickname, or “skip”"
      : reply.revision === 0
        ? "What should the clinic know?"
        : "Your answer";
    textarea.placeholder = askingForName
      ? "Example: Tomiwa, Big Tee, or skip"
      : reply.revision === 0
        ? "Example: Mo ti ni headache lati ana and my body dey hot. I want see doctor."
        : "Type your answer here";
  } else if (reply.state === "awaiting-confirmation") {
    setProductState("confirmation");
    flowState.textContent = "Confirmation required";
    if (emergencyCard) emergencyCard.hidden = true;
    if (intakePass) intakePass.hidden = true;
  } else if (reply.state === "emergency-escalation") {
    setProductState("emergency-escalation");
    flowState.textContent = "Emergency guidance";
    status.textContent = "No routine clinic intake was created.";
    status.className = "status error";
    status.setAttribute("role", "alert");
    if (emergencyCard) {
      emergencyCard.hidden = false;
      emergencyCard.scrollIntoView({ behavior: "smooth" });
    }
    if (intakePass) intakePass.hidden = true;
  } else {
    setProductState("completed");
    flowState.textContent = "Simulated intake created";
    const ref = reply.intakeReference ?? "unavailable";
    status.textContent = `Simulated clinic intake reference: ${ref}`;
    status.className = "status success";
    if (emergencyCard) emergencyCard.hidden = true;
    if (intakePass) {
      intakePass.hidden = false;
      if (passReferenceCode) passReferenceCode.textContent = ref;
      if (passDetails && currentProposal) {
        passDetails.textContent = currentProposal.summary;
      }
      intakePass.scrollIntoView({ behavior: "smooth" });
    }
  }
}

async function start(): Promise<void> {
  setBusy(true, "Starting a local demo conversation…");
  try {
    applyReply(await request<ApiReply>("/conversations", { method: "POST" }));
    clearStatus();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function submitCanonicalUtterance(text: string): Promise<void> {
  const cleaned = text.trim();
  if (
    !conversationId ||
    cleaned === "" ||
    interactionBusy ||
    voiceOperationBusy
  ) {
    return;
  }
  setProductState("submitting-utterance");
  setBusy(true, "Checking your message…");
  try {
    const reply = await request<ApiReply>(
      `/conversations/${encodeURIComponent(conversationId)}/utterances`,
      { method: "POST", body: JSON.stringify({ text: cleaned }) },
    );
    clearStatus();
    addTurn("You", cleaned);
    voice.reset();
    textarea.value = "";
    applyReply(reply);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitCanonicalUtterance(textarea.value);
});

transcriptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  voice.updateTranscript(transcript.value);
  const correctedTranscript = voice.transcriptForSubmission();
  if (correctedTranscript !== undefined) {
    void submitCanonicalUtterance(correctedTranscript);
  }
});

transcript.addEventListener("input", () => {
  voice.updateTranscript(transcript.value);
});

recordButton.addEventListener("click", () => void voice.start());
stopButton.addEventListener("click", () => voice.stop());
cancelButton.addEventListener("click", () => voice.cancel());
recordAgainButton.addEventListener("click", () => {
  voice.reset();
  void voice.start();
});

confirmButton.addEventListener("click", () => {
  if (!conversationId || !currentProposal || interactionBusy) return;
  setBusy(true, "Creating the simulated clinic intake request…");
  void request<ApiReply>(
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
  interactionBusy = busy;
  textarea.disabled = busy;
  sendButton.disabled = busy;
  confirmButton.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
  transcriptForm.setAttribute("aria-busy", String(busy));
  confirmation.setAttribute("aria-busy", String(busy));
  const currentProductState = productState;
  renderVoice(voice.snapshot);
  setProductState(currentProductState);
  if (message) status.textContent = message;
}

function clearStatus(): void {
  status.textContent = "";
  status.className = "status";
  status.setAttribute("role", "status");
}

function showError(error: unknown): void {
  setProductState("error");
  status.textContent =
    error instanceof Error ? error.message : "Something went wrong. Try again.";
  status.className = "status error";
  status.setAttribute("role", "alert");
  flowState.textContent = "Needs attention";
  if (!interaction.hidden) textarea.focus();
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function resetSession(): void {
  history.innerHTML = "";
  voice.reset();
  textarea.value = "";
  if (emergencyCard) emergencyCard.hidden = true;
  if (intakePass) intakePass.hidden = true;
  confirmation.hidden = true;
  interaction.hidden = false;
  clearStatus();
  void start();
}

// Wire up Quick Demo & Navigation Actions
btnShowSamples?.addEventListener("click", () => {
  demoTray?.scrollIntoView({ behavior: "smooth" });
});

btnShowBenchmark?.addEventListener("click", () => {
  benchmarkModal?.showModal();
});

btnCloseModal?.addEventListener("click", () => {
  benchmarkModal?.close();
});

btnCloseModalBottom?.addEventListener("click", () => {
  benchmarkModal?.close();
});

benchmarkModal?.addEventListener("click", (event) => {
  if (event.target === benchmarkModal) benchmarkModal.close();
});

btnCopyRef?.addEventListener("click", async () => {
  const code = passReferenceCode?.textContent?.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    const span = btnCopyRef.querySelector("span");
    if (span) {
      const original = span.textContent;
      span.textContent = "Copied! ✓";
      setTimeout(() => {
        span.textContent = original;
      }, 2000);
    }
  } catch {
    // Clipboard permission or focus fallback
  }
});

btnNewIntake?.addEventListener("click", resetSession);
btnResetSession?.addEventListener("click", resetSession);

document.querySelectorAll<HTMLButtonElement>(".demo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const phrase = chip.dataset.phrase;
    if (!phrase) return;
    if (textFallback) textFallback.open = true;
    textarea.value = phrase;
    void submitCanonicalUtterance(phrase);
  });
});

void start();

