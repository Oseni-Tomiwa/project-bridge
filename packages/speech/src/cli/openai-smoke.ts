import {
  OPENAI_DEFAULT_TRANSCRIPTION_MODEL,
  OPENAI_TRANSCRIPTION_PROVIDER_ID,
  OpenAITranscriptionSpeechProvider,
} from "../providers/openai-transcription.js";
import { loadLocalAudio, resolveAudioPathFromArgv } from "./local-audio.js";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model =
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
    OPENAI_DEFAULT_TRANSCRIPTION_MODEL;
  const audioPath = resolveAudioPathFromArgv(process.argv, process.cwd());

  if (apiKey === undefined || apiKey === "") {
    safeFailure(model, "missing-api-key");
    process.exitCode = 1;
    return;
  }
  if (audioPath === undefined || audioPath.trim() === "") {
    safeFailure(model, "missing-audio-path");
    process.exitCode = 1;
    return;
  }

  const audio = await loadLocalAudio(audioPath);
  if (!audio.ok) {
    safeFailure(model, audio.status);
    process.exitCode = 1;
    return;
  }

  let provider: OpenAITranscriptionSpeechProvider;
  try {
    provider = new OpenAITranscriptionSpeechProvider({ apiKey, model });
  } catch {
    safeFailure(model, "invalid-provider-configuration");
    process.exitCode = 1;
    return;
  }

  const outcome = await provider.transcribe(
    {
      bytes: audio.value.bytes,
      fileName: audio.value.fileName,
      mediaType: audio.value.mediaType,
    },
    {},
  );

  console.log(`provider: ${OPENAI_TRANSCRIPTION_PROVIDER_ID}`);
  console.log(`model: ${provider.configuration.modelIdentifier}`);
  if (outcome.ok) {
    console.log("status: success");
    console.log(`latency_ms: ${outcome.value.latencyMilliseconds}`);
    console.log(`transcript: ${outcome.value.text}`);
    if (outcome.value.rawResponseReference !== undefined) {
      console.log(`request_id: ${outcome.value.rawResponseReference}`);
    }
    return;
  }

  console.log(`status: ${outcome.error.code}`);
  console.log(`latency_ms: ${outcome.error.latencyMilliseconds}`);
  if (outcome.error.providerReference !== undefined) {
    console.log(`request_id: ${outcome.error.providerReference}`);
  }
  process.exitCode = 1;
}

function safeFailure(model: string, status: string): void {
  console.log(`provider: ${OPENAI_TRANSCRIPTION_PROVIDER_ID}`);
  console.log(`model: ${model}`);
  console.log(`status: ${status}`);
  console.log("latency_ms: 0");
}

await main();
