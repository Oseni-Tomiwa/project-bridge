# Voice-first product flow

## Status and scope

Project Bridge v0.1 implements one active voice-first healthcare-intake journey. It uses browser `MediaRecorder`, the server-side Intron/Sahara prerecorded adapter, the deterministic healthcare conversation service, and simulated clinic-intake creation. It does not use an LLM or TTS, diagnose, prescribe, recommend treatment, contact a clinic, book an appointment, or access medical records.

## Request path

```text
explicit microphone click
  -> browser MediaRecorder (maximum 60 seconds / 8 MiB)
  -> POST /speech/transcriptions (raw audio request body)
  -> API validation and server-held Sahara credential
  -> Intron/Sahara SpeechProvider
  -> exact transcript shown in the browser
  -> user reviews or edits transcript
  -> POST /conversations/:id/utterances with corrected text
  -> emergency-language stop OR clarification / confirmation / simulated-intake flow
```

Typed messages use the same final utterance endpoint. Speech-provider configuration and benchmark records never enter the healthcare domain model.

## Browser behavior

Microphone permission is requested only after the user activates **Start recording**. The interface exposes idle, permission-request, recording, transcribing, transcript-review, utterance-submission, clarification, emergency-escalation, confirmation, completion, and error states. Recording shows elapsed time, Stop, and Cancel controls and stops automatically at one minute. Processing disables duplicate actions.

The raw provider transcript is labeled **We heard:** and remains visible while a separate editable field holds the candidate utterance. Only an explicit Continue action sends the edited value to the conversation API. The original transcript remains in client memory for that review step and is not added to the clinic intake. Text entry remains available under **Prefer to type instead?**.

## API and privacy boundary

`POST /speech/transcriptions` accepts a raw, non-empty audio body with its real `Content-Type` and an optional `X-Audio-Duration-Ms` header. The v0.1 allowlist is `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-wav`, and `audio/flac`, including codec parameters. Requests are limited to 8 MiB and 60 seconds.

Audio is held only in request memory, passed to the provider, and discarded after the request. Project Bridge does not write it to disk or add it to conversation or intake state. Intron receives the audio to provide transcription, so provider-side handling and retention still depend on the applicable account terms and configuration. Health speech and its transcript are sensitive even without direct identifiers.

`INTRON_API_KEY` remains in the API process. The browser never receives it and never calls Intron directly. Successful responses expose only transcript, provider ID, safe configuration/model identity, and latency. Errors use stable, user-safe codes and messages; authorization headers, raw provider bodies, provider file references, stack traces, and configuration endpoints are not returned.

## Format limitations

The browser selects the first supported recording type from WebM/Opus, MP4/AAC, Ogg/Opus, and their base container types. Browser and operating-system support varies. If none is supported, or the provider rejects the resulting container, the prototype reports the limitation and leaves text entry available. It does not transcode, resample, or silently relabel audio.

## Local use

Copy `.env.example` to `.env`, set `INTRON_API_KEY`, and run:

```bash
pnpm dev
```

Open `http://localhost:5173`. Microphone capture normally requires localhost or HTTPS. Use invented scenarios only; do not enter real health details or identifiers. Automated tests inject fake recorders and speech providers and make no provider requests.
