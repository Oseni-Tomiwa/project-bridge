# OpenAI speech-to-text adapter

## Implemented behavior

The speech package implements an opt-in OpenAI file-transcription adapter behind the provider-neutral `SpeechProvider` contract. It sends one multipart `POST` request to `https://api.openai.com/v1/audio/transcriptions` using native `fetch` and maps the JSON transcript into `TranscriptionResult`.

The default model is exactly `gpt-transcribe`, OpenAI's current high-accuracy transcription model. `OPENAI_TRANSCRIPTION_MODEL` can select another model deliberately; the adapter does not silently substitute a fallback. The model identifier is preserved in every configuration snapshot. The current model page exposes `gpt-transcribe` as an alias but no distinct dated version for this model, so `modelVersion` is omitted.

Native HTTP keeps the request contract small and avoids adding an SDK dependency. It also makes the effective retry policy explicit: **one request attempt and zero automatic retries**. A benchmark runner may define a separate visible attempt policy later, but hidden retries are not permitted because they would distort latency and failure comparisons.

The request contains only:

- `file`: the supplied bytes and filename;
- `model`: the configured model identifier; and
- `response_format`: `json`.

No prompt, temperature, translation, or language hint is added. The configuration snapshot records `languageHint: null`. This avoids forcing English and does not imply that OpenAI exposes a Sahara-like Yoruba/code-switch route. A future language-hint experiment must be separately configured and recorded before it is compared with another provider.

OpenAI's transcription endpoint documents these input extensions: `flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`, `wav`, and `webm`. Validation is OpenAI-specific and does not weaken the common audio contract. Local file read failures remain the CLI loader's responsibility. The adapter does not transcode, normalize, translate, or calculate WER.

Successful results contain the raw transcript, configuration snapshot, request timestamps, monotonic request latency, and the `x-request-id` response header when supplied. The endpoint's JSON transcript object does not expose a model version or detected language in this request mode, so neither is invented.

Failures are mapped to safe codes for missing configuration, invalid or unsupported audio, unauthorized responses, rate limiting, other HTTP errors, malformed success responses, network failures, and client timeout/abort. Provider response bodies and credentials are not exposed. The safe OpenAI request ID is retained when available.

## Configuration and smoke test

Set local values without committing them:

```dotenv
OPENAI_API_KEY=
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
```

Then explicitly run:

```bash
pnpm --filter @project-bridge/speech smoke:openai -- ~/Downloads/yoruba-test.m4a
```

The command reuses the same local-audio loader as the Intron smoke test. It prints only provider, configured model, status, provider-request latency, transcript on success, and OpenAI request ID when available. It is not part of CI or `pnpm check`.

Only upload audio whose consent, license, allowed uses, third-party processing permission, and retention treatment have been approved. For the first comparison, use the exact same `~/Downloads/yoruba-test.m4a` bytes supplied to Sahara. Stop and update the comparison protocol if any provider requires transcoding.

## Test and benchmark status

Automated tests mock the HTTP boundary and spend no API credits. They verify request construction, mapping, failure handling, configuration hygiene, one-attempt behavior, and byte-identical input reuse across the Sahara and OpenAI adapters.

No live OpenAI request or OpenAI benchmark result has been produced by this implementation. The repository therefore makes no quality or latency comparison between OpenAI and Sahara.

## Known limitations

- `gpt-transcribe` is currently an alias rather than a dated snapshot, so exact server-side model revision cannot be pinned or recorded unless OpenAI exposes one later.
- No language hint is configured; the product/research team must decide whether a language-hinted experiment is methodologically appropriate and how to align it with Sahara's `yo` route.
- The adapter uses non-streaming JSON file transcription and does not request timestamps, diarization, partial results, or confidence values.
- Official service-side size/duration limits and data-control requirements should be rechecked immediately before a governed benchmark run.
