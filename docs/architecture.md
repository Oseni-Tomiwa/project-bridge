# Architecture

## Status

This document describes the implemented voice-first financial-support slice and provider-neutral boundaries. Intron/Sahara is wired into the product flow through the API; OpenAI and Deepgram remain evaluation adapters. No comparative benchmark has been run.

## Shape

```text
browser voice capture --raw audio--> API --server credential--> Intron/Sahara
        |                              |
        |                         TranscriptionResult
        |                              |
        +<---- visible/editable transcript
        |
web typed text or user-approved transcript
        |
        v
canonical conversation utterance API
        |
        +--> conversation interpreter --> intent + entities + missing fields
        |                                  |
        |                                  v
        +--------------------------> domain action registry
                                           |
                                           v
                                    downstream adapter

evaluation runner --> identical sample --> provider adapters --> metrics/results
```

## Current decisions

- Use a TypeScript pnpm monorepo with strict compiler settings.
- Keep applications deployable together initially; package boundaries are not microservice boundaries.
- Depend on contracts rather than provider SDKs in core flows.
- Identify a speech provider by configuration and inject its adapter.
- Use Intron/Sahara as the configurable v0.1 product provider without browser-held credentials or runtime benchmark selection.
- Keep each provider's HTTP, authentication, payload, query, and response details inside its speech adapter.
- Pass the same immutable evaluation sample to each selected provider.
- Keep conversation interpretation separate from transcription and action execution. The interpreter accepts a channel-neutral `UserUtterance`, so text fallback and reference-transcript evaluation do not depend on a speech-provider result.
- Let vertical implementations contribute action definitions and domain metadata through `DomainModule`. The initial financial-support implementation currently lives beside that contract in `packages/domain` to keep the challenge workspace small.
- Represent action confirmation requirements explicitly.
- Hide the in-memory support-case store behind `SupportCaseRepository`; durable persistence remains unselected.

## Package responsibilities

| Package        | Owns                                                                        | Must not own                                    |
| -------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `speech`       | audio input, provider contract, transcript results, three provider adapters | vendor assumptions in conversation/domain types |
| `conversation` | turns, state, intents, entities, clarification outcome                      | executing downstream side effects               |
| `actions`      | action definition/executor contracts, confirmation policy                   | hard-coded healthcare workflows                 |
| `benchmark`    | sample/result schemas, runner contract, normalization/WER                   | fabricated or manually altered scores           |
| `domain`       | extension contract and initial financial-support workflow                   | platform-wide provider selection                |
| `shared`       | identifiers and small cross-cutting primitives                              | domain business logic                           |

## Key interfaces

The source definitions in `packages/*/src` are the canonical executable contracts. Important concepts include:

- `SpeechProvider.transcribe(audio, context)`
- `SpeechProviderConfiguration` with provider, model identifier/version, and sanitized options
- `TranscriptionResult` with text, segments, provider configuration, optional provider-reported model metadata, and provider latency
- `TranscriptionFailure` with safe failure code, provider configuration, timestamps, latency, and optional HTTP/retry/provider-reference metadata
- `ConversationState`, channel-neutral `UserUtterance`, and `ConversationInterpreter.interpret(...)`
- `ActionDefinition` consequence classification, `ActionRequest` confirmation evidence, and platform-level request validation that produces the only request type accepted by executors
- `ActionExecutor.execute(...)` returning a typed outcome
- `BenchmarkRunner.run(samples, providers, config)`
- `EvaluationSample`, immutable provider configuration snapshots, distinct transcription/semantic/task results, and data-governance metadata

## Implemented request flow

1. An explicit browser gesture requests microphone access and starts a bounded `MediaRecorder` capture.
2. The browser sends the original audio bytes to `POST /speech/transcriptions`; the API validates and passes request-scoped bytes to the injected Intron/Sahara adapter.
3. The browser displays the exact transcript and requires an explicit Continue action after optional correction.
4. The approved transcript and typed fallback both submit to the same `/conversations/:id/utterances` boundary.
5. Deterministic domain rules derive the `failed_transfer` intent and known fields.
6. The service asks for each missing required field or creates a proposal and summary.
7. The client submits explicit confirmation containing the proposal ID and revision.
8. Generic action validation rejects mismatched confirmation before execution.
9. The financial-support executor creates one simulated case through `SupportCaseRepository` and returns its reference.

Audio exists only in browser and API/provider request scope; it is not written to Project Bridge storage. Product orchestration depends only on `SpeechProvider`, and no provider-specific type crosses into conversation/domain packages. The benchmark runner remains a separate entry point.

## Failure and safety posture

- Treat low confidence, ambiguity, unavailable providers, and timeouts as ordinary states.
- Do not silently execute when required fields or confirmation are absent.
- Treat every action classified as consequential as requiring explicit confirmation.
- Tie explicit confirmation to a proposal, conversation revision, summarized action, and input fingerprint; executors must reject mismatched or stale evidence.
- Use idempotency keys for actions that may be retried.
- Separate user-visible messages from internal error details.
- Record the minimal telemetry required, with retention and access rules defined before collection.

## Open technical decisions

Sahara model/version identity, browser-format coverage, product-provider fallback policy, OpenAI alias/version and language-hint policy, Deepgram version/language experiment policy, post-prototype interpretation/LLM approach, deployment platform, persistence, authentication, observability, text-to-speech, and detailed confidence calibration are unresolved.

## TypeScript build strategy

Workspace manifests are the dependency graph and pnpm runs package builds topologically. Type declarations resolve from package source during local typechecking, while runtime exports resolve from `dist`. TypeScript project references are intentionally deferred at this repository size; if packages are published independently or incremental builds become important, declaration exports and project references should be revisited together.
