import {
  DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE,
  DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL,
  DeepgramTranscriptionSpeechProvider,
  IntronSaharaSpeechProvider,
  OPENAI_DEFAULT_TRANSCRIPTION_MODEL,
  OpenAITranscriptionSpeechProvider,
} from "@project-bridge/speech";

export const STT_BENCHMARK_PROVIDER_IDS = [
  "intron-sahara",
  "openai",
  "deepgram",
];

export function createConfiguredSttProviders(
  requestedProviderIds,
  environment,
  options = {},
) {
  const uniqueIds = [...new Set(requestedProviderIds)];
  if (uniqueIds.length !== requestedProviderIds.length) {
    throw new Error("Provider list must not contain duplicates.");
  }
  for (const providerId of uniqueIds) {
    if (!STT_BENCHMARK_PROVIDER_IDS.includes(providerId)) {
      throw new Error(`Unknown provider: ${providerId}.`);
    }
  }

  return uniqueIds.map((providerId) => {
    switch (providerId) {
      case "intron-sahara":
        return createIntronProvider(environment, options.dryRun === true);
      case "openai":
        return new OpenAITranscriptionSpeechProvider({
          apiKey: credential(
            environment.OPENAI_API_KEY,
            "OPENAI_API_KEY",
            options.dryRun === true,
          ),
          model:
            environment.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
            OPENAI_DEFAULT_TRANSCRIPTION_MODEL,
        });
      case "deepgram":
        return new DeepgramTranscriptionSpeechProvider({
          apiKey: credential(
            environment.DEEPGRAM_API_KEY,
            "DEEPGRAM_API_KEY",
            options.dryRun === true,
          ),
          model:
            environment.DEEPGRAM_STT_MODEL?.trim() ||
            DEEPGRAM_DEFAULT_TRANSCRIPTION_MODEL,
          language:
            environment.DEEPGRAM_STT_LANGUAGE?.trim() ||
            DEEPGRAM_DEFAULT_TRANSCRIPTION_LANGUAGE,
          smartFormat: parseBoolean(
            environment.DEEPGRAM_STT_SMART_FORMAT,
            "DEEPGRAM_STT_SMART_FORMAT",
          ),
          ...(environment.DEEPGRAM_STT_BASE_URL?.trim()
            ? { baseUrl: environment.DEEPGRAM_STT_BASE_URL.trim() }
            : {}),
        });
    }
  });
}

function createIntronProvider(environment, dryRun) {
  const language = environment.INTRON_STT_LANGUAGE?.trim() || "yo";
  if (language !== "yo") {
    throw new Error("INTRON_STT_LANGUAGE must be yo for this adapter.");
  }
  return new IntronSaharaSpeechProvider({
    apiKey: credential(environment.INTRON_API_KEY, "INTRON_API_KEY", dryRun),
    language,
    ...(environment.INTRON_STT_BASE_URL?.trim()
      ? { baseUrl: environment.INTRON_STT_BASE_URL.trim() }
      : {}),
  });
}

function credential(value, name, dryRun) {
  const normalized = value?.trim();
  if (normalized !== undefined && normalized !== "") return normalized;
  if (dryRun) return "dry-run-credential-not-used";
  throw new Error(`${name} is required for a non-dry benchmark run.`);
}

function parseBoolean(value, name) {
  if (value === undefined || value.trim() === "") return false;
  if (value.trim().toLowerCase() === "true") return true;
  if (value.trim().toLowerCase() === "false") return false;
  throw new Error(`${name} must be true or false.`);
}
