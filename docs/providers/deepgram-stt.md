# Deepgram prerecorded speech-to-text adapter

## Implemented behavior

The speech package implements an opt-in Deepgram prerecorded-transcription adapter behind the provider-neutral `SpeechProvider` contract. It sends one native `fetch` request to `POST https://api.deepgram.com/v1/listen`, using `Authorization: Token …`, the supplied audio bytes as the body, and the supplied media type as `Content-Type`. It does not use an SDK, retry, transcode, normalize, or calculate WER.

The Project Bridge primary comparison configuration is:

```text
model=nova-3
version=latest
language=multi
smart_format=false
detect_language=false (not sent)
```

Deepgram documents English as the default when `language` is omitted, so the adapter explicitly requests Nova-3 multilingual mode rather than silently forcing English. Nova-3 multilingual baseline evaluated out-of-distribution on Yoruba-English code-switched speech; Yoruba is not an officially supported Nova-3 multilingual language. Project Bridge must report that limitation with any comparison.

Automatic language detection is not enabled. Deepgram documents a supported-language list for detection that does not include Yoruba and notes that detection can select a fallback model when the requested model does not support the detected language. That would weaken model control in a benchmark. If language detection is later evaluated, it must use a new configuration ID and be reported as a separate experiment.

Smart Format remains explicitly `false` for primary WER because it can alter currency, number, date, phone, email, and punctuation surface forms. `DEEPGRAM_STT_SMART_FORMAT=true` is supported only as a separate, visibly recorded experiment and produces a different configuration ID.

References: [prerecorded API](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded), [Nova model and language support](https://developers.deepgram.com/docs/models-languages-overview/), [language detection](https://developers.deepgram.com/docs/language-detection), [Smart Format](https://developers.deepgram.com/docs/smart-format), and [supported audio formats](https://developers.deepgram.com/docs/supported-audio-formats).

## Configuration snapshot and response mapping

Every request snapshot records the endpoint, transport, requested model alias/version, explicit language, Smart Format value, disabled language detection, timeout, and zero automatic retries. It never records the API key or authorization header.

A successful response maps:

- the first alternative from each returned channel into one raw transcript, joining multiple channel transcripts with a newline;
- `metadata.request_id`, or the safe `dg-request-id` header fallback, to the raw response reference;
- returned `metadata.models` and matching `metadata.model_info` name/version/architecture into provider-neutral reported-model metadata;
- returned channel `detected_language` and alternative `languages` values only when present;
- HTTP success to `providerStatus` and client timestamps plus monotonic elapsed request latency.

Requested configuration and provider-reported model identity are separate. This preserves an actual model UUID/version when Deepgram returns one without pretending that the `latest` alias is itself a fixed version. The raw provider response is not exposed by the adapter.

Failures use safe structured codes for missing configuration, invalid input, unsupported media Content-Type or partial-result mode, unauthorized responses, rate limiting, other HTTP errors, malformed success responses, network failure, and request timeout. Provider bodies, caught exception text, and credentials are not included. HTTP/provider request identifiers and numeric `Retry-After` values are retained when available. No failure triggers an automatic retry.

Deepgram documents broad support for prerecorded audio, including M4A, MP4, MP3, AAC, WAV, FLAC, Ogg, Opus, and WebM. The adapter accepts audio media types plus MP4/WebM media containers and passes the declared Content-Type through. It rejects generic binary content because raw, headerless encodings require additional explicit encoding/sample-rate configuration that this benchmark adapter does not currently expose.

## Smoke test

Set local values without committing them:

```dotenv
DEEPGRAM_API_KEY=
DEEPGRAM_STT_BASE_URL=https://api.deepgram.com
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_STT_LANGUAGE=multi
DEEPGRAM_STT_SMART_FORMAT=false
```

Then explicitly run:

```bash
pnpm --filter @project-bridge/speech smoke:deepgram -- ~/Downloads/yoruba-test.m4a
```

The command uses the shared local-audio loader and prints only provider, configured model, status, provider-request latency, transcript on success, and request ID when available. It is not part of CI or `pnpm check`.

Only upload audio after consent, license, allowed-use, third-party processing, and retention approval. The `real-yo-001` preparation manifest reserves Deepgram as the third not-yet-run slot. It contains no Deepgram transcript, latency, or fabricated outcome.

## Known limitations and decisions still required

- Nova-3 multilingual baseline evaluated out-of-distribution on Yoruba-English code-switched speech; Yoruba is not an officially supported Nova-3 multilingual language.
- `version=latest` is not a frozen server-side version. Measured results must retain returned model UUID/version metadata, and the product/research team must decide whether Deepgram permits a dated version to be requested and frozen.
- The configured `multi` baseline, an omitted/default language, any single-language setting, and detection are distinct experiments; only the first is selected here.
- Multi-channel transcript joining is defined for completeness, but the challenge audio protocol should freeze channel handling before measured runs.
- Service limits, data controls, regional routing, pricing, and retention terms must be reviewed immediately before governed uploads.
