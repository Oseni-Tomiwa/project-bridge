import {
  DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE,
  DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL,
  DEEPGRAM_TRANSCRIPTION_PROVIDER_ID,
  DeepgramTranscriptionSpeechProvider,
} from "../providers/deepgram-transcription.js";
import { loadLocalAudio, resolveAudioPathFromArgv } from "./local-audio.js";

async function main(): Promise<void> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  const model =
    process.env.DEEPGRAM_STT_MODEL?.trim() ||
    DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL;
  const language =
    process.env.DEEPGRAM_STT_LANGUAGE?.trim() ||
    DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE;
  const smartFormat = parseBooleanOption(process.env.DEEPGRAM_STT_SMART_FORMAT);
  const audioPath = resolveAudioPathFromArgv(process.argv, process.cwd());

  if (apiKey === undefined || apiKey === "") {
    safeFailure(model, "missing-api-key");
    process.exitCode = 1;
    return;
  }
  if (smartFormat === undefined) {
    safeFailure(model, "invalid-smart-format-configuration");
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

  let provider: DeepgramTranscriptionSpeechProvider;
  try {
    provider = new DeepgramTranscriptionSpeechProvider({
      apiKey,
      model,
      language,
      smartFormat,
      ...(process.env.DEEPGRAM_STT_BASE_URL === undefined
        ? {}
        : { baseUrl: process.env.DEEPGRAM_STT_BASE_URL }),
    });
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

  console.log(`provider: ${DEEPGRAM_TRANSCRIPTION_PROVIDER_ID}`);
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

function parseBooleanOption(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return false;
  if (value.trim().toLowerCase() === "true") return true;
  if (value.trim().toLowerCase() === "false") return false;
  return undefined;
}

function safeFailure(model: string, status: string): void {
  console.log(`provider: ${DEEPGRAM_TRANSCRIPTION_PROVIDER_ID}`);
  console.log(`model: ${model}`);
  console.log(`status: ${status}`);
  console.log("latency_ms: 0");
}

await main();
