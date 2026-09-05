# Intron/Sahara synchronous STT adapter

## Implemented scope

Project Bridge implements one provider adapter for Intron's synchronous file-transcription endpoint. It uses the runtime `fetch`, `FormData`, `Blob`, and `AbortController` APIs; there is no provider SDK dependency. Conversation and domain packages receive only provider-neutral speech results and do not import Intron types.

No live request runs in tests or CI. No retry or file-status polling is automatic, so benchmark latency will not be distorted by hidden attempts.

## Verified API contract

The following details are from the official [Upload File Sync documentation](https://docs.voice.intron.io/docs/stt/file-upload-sync) and [supported-language list](https://docs.voice.intron.io/docs/stt/supported-languages):

- Endpoint: `POST https://infer.voice.intron.io/file/v1/upload/sync`
- Authentication: `Authorization: Bearer <API_KEY>`
- Body: `multipart/form-data`
- Required fields: `audio_file_name` and `audio_file_blob`
- Project Bridge language field: `use_language_asr_input=yo`
- `yo` denotes the documented Yoruba-English code-switched route; `pcm` is separately documented for Pidgin-English and is not selected by this adapter.
- Maximum synchronous duration: 120 seconds
- Documented extensions: `.wav`, `.mp3`, `.mp4`, `.m4a`, `.ogg`, `.webm`, and `.flac`
- Rate limit: 30 requests per minute; `Retry-After` may specify delay seconds
- HTTP 503 can report a processing timeout and may include a `file_id` for later status lookup

The adapter preserves a 503 `file_id` but does not poll it. It maps the documented success fields `file_id`, `processing_status`, and `audio_transcript` into the provider-neutral outcome. It validates `audio_file_name` as part of response-shape checking but does not expose the provider response object outside the speech package.

## Request and configuration

The adapter sends exactly these form fields:

```text
audio_file_name=<supplied filename>
audio_file_blob=<supplied bytes and MIME type>
use_language_asr_input=yo
```

Configuration uses:

```dotenv
INTRON_API_KEY=
INTRON_STT_BASE_URL=https://infer.voice.intron.io
INTRON_STT_LANGUAGE=yo
```

The provider snapshot records `providerId=intron-sahara`, the endpoint, `language=yo`, synchronous transport, configured request timeout, and the 120-second limit. The API key and Authorization header are excluded. The sync response does not document a deployed model identifier or version, so `modelIdentifier` is explicitly `unknown` and `modelVersion` is absent.

## Failure mapping

| Condition                        | Provider-neutral code            | Retryable flag | Preserved metadata                                |
| -------------------------------- | -------------------------------- | -------------- | ------------------------------------------------- |
| Missing/empty input              | `invalid-audio-input`            | no             | timing, configuration                             |
| Unsupported extension            | `unsupported-audio-format`       | no             | timing, configuration                             |
| Known duration above 120 seconds | `unsupported-audio-duration`     | no             | timing, configuration                             |
| Partial-result request           | `unsupported-transcription-mode` | no             | timing, configuration                             |
| Client timeout/abort             | `request-timeout`                | yes            | timing, configuration                             |
| Network failure                  | `network-failure`                | yes            | timing, configuration                             |
| HTTP 401/403                     | `unauthorized`                   | no             | HTTP status                                       |
| HTTP 429                         | `rate-limited`                   | yes            | HTTP status and valid delay-seconds `Retry-After` |
| HTTP 503                         | `processing-timeout`             | no             | HTTP status and `file_id` when usable             |
| Other HTTP error                 | `provider-http-error`            | only for 5xx   | HTTP status                                       |
| Invalid HTTP 200 body            | `malformed-provider-response`    | no             | HTTP status                                       |

The adapter does not include provider response bodies or caught exception text in failures. Callers must make any retry explicit and record it as another attempt.

If duration is unknown, the adapter cannot inspect encoded audio without adding a media parser; the provider remains responsible for enforcing the server-side limit. Benchmark audio metadata should always supply known duration.

## Opt-in smoke test

This command makes a paid/external request. Run it only with a deliberately supplied local file whose upload is permitted:

```bash
cp .env.example .env
set -a
source .env
set +a
pnpm --filter @project-bridge/speech smoke:intron -- /absolute/path/to/consented-sample.wav
```

The script requires `INTRON_API_KEY` and an explicit path. It prints only provider, status, latency, transcript on success, and `file_id` when returned. It never prints the key and is not referenced by normal tests or CI.

## Unresolved questions

- Exact deployed Sahara v2.5 model identifier/version, if exposed by this endpoint
- Whether challenge accounts need a challenge-specific option
- Whether `yo` automatically selects the Sahara v2.5 challenge model
- The official file-status contract to use for 503 continuation
- Streaming STT integration contract
- Any participant-specific code-switching option not present in the public documentation
