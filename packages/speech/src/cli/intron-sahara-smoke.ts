import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import {
  INTRON_SAHARA_PROVIDER_ID,
  IntronSaharaSpeechProvider,
} from "../providers/intron-sahara.js";

async function main(): Promise<void> {
  const apiKey = process.env.INTRON_API_KEY?.trim();
  const audioPath = process.argv[2];
  if (apiKey === undefined || apiKey === "") {
    safeFailure("missing-api-key");
    process.exitCode = 1;
    return;
  }
  if (audioPath === undefined || audioPath.trim() === "") {
    safeFailure("missing-audio-path");
    process.exitCode = 1;
    return;
  }

  const language = process.env.INTRON_STT_LANGUAGE?.trim() || "yo";
  if (language !== "yo") {
    safeFailure("unsupported-language-configuration");
    process.exitCode = 1;
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(audioPath);
  } catch {
    safeFailure("unreadable-audio-file");
    process.exitCode = 1;
    return;
  }

  let provider: IntronSaharaSpeechProvider;
  try {
    provider = new IntronSaharaSpeechProvider({
      apiKey,
      language: "yo",
      ...(process.env.INTRON_STT_BASE_URL?.trim()
        ? { baseUrl: process.env.INTRON_STT_BASE_URL.trim() }
        : {}),
    });
  } catch {
    safeFailure("invalid-provider-configuration");
    process.exitCode = 1;
    return;
  }
  const outcome = await provider.transcribe(
    {
      bytes,
      fileName: basename(audioPath),
      mediaType: mediaTypeForExtension(extname(audioPath)),
    },
    {},
  );

  console.log(`provider: ${INTRON_SAHARA_PROVIDER_ID}`);
  if (outcome.ok) {
    console.log("status: success");
    console.log(`latency_ms: ${outcome.value.latencyMilliseconds}`);
    console.log(`transcript: ${outcome.value.text}`);
    if (outcome.value.rawResponseReference !== undefined) {
      console.log(`file_id: ${outcome.value.rawResponseReference}`);
    }
    return;
  }

  console.log(`status: ${outcome.error.code}`);
  console.log(`latency_ms: ${outcome.error.latencyMilliseconds}`);
  if (outcome.error.providerReference !== undefined) {
    console.log(`file_id: ${outcome.error.providerReference}`);
  }
  process.exitCode = 1;
}

function safeFailure(status: string): void {
  console.log(`provider: ${INTRON_SAHARA_PROVIDER_ID}`);
  console.log(`status: ${status}`);
  console.log("latency_ms: 0");
}

function mediaTypeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".mp4":
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}

await main();
