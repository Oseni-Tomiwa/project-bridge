# Architecture

## Status

This document describes the implemented text-based financial-support slice, provider-neutral boundaries, and opt-in Intron/Sahara synchronous STT adapter. The adapter is not wired into the application flow and no benchmark has been run.

## Shape

```text
web or other channel
        |
        v
API / orchestration boundary
        |
        +--> speech provider adapter(s) --> TranscriptionResult
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
- Keep Intron HTTP, authentication, multipart, and response details inside the speech package's Sahara adapter.
- Pass the same immutable evaluation sample to each selected provider.
- Keep conversation interpretation separate from transcription and action execution. The interpreter accepts a channel-neutral `UserUtterance`, so text fallback and reference-transcript evaluation do not depend on a speech-provider result.
- Let vertical implementations contribute action definitions and domain metadata through `DomainModule`. The initial financial-support implementation currently lives beside that contract in `packages/domain` to keep the challenge workspace small.
- Represent action confirmation requirements explicitly.
- Hide the in-memory support-case store behind `SupportCaseRepository`; durable persistence remains unselected.

## Package responsibilities

| Package        | Owns                                                                  | Must not own                                             |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `speech`       | audio input, provider contract, transcript results, provider adapters | vendor-specific assumptions in conversation/domain types |
| `conversation` | turns, state, intents, entities, clarification outcome                | executing downstream side effects                        |
| `actions`      | action definition/executor contracts, confirmation policy             | hard-coded healthcare workflows                          |
| `benchmark`    | sample/result schemas, runner contract, normalization/WER             | fabricated or manually altered scores                    |
| `domain`       | extension contract and initial financial-support workflow             | platform-wide provider selection                         |
| `shared`       | identifiers and small cross-cutting primitives                        | domain business logic                                    |

## Key interfaces

The source definitions in `packages/*/src` are the canonical executable contracts. Important concepts include:

- `SpeechProvider.transcribe(audio, context)`
- `SpeechProviderConfiguration` with provider, model identifier/version, and sanitized options
- `TranscriptionResult` with text, segments, provider configuration, and provider latency
- `TranscriptionFailure` with safe failure code, provider configuration, timestamps, latency, and optional HTTP/retry/provider-reference metadata
- `ConversationState`, channel-neutral `UserUtterance`, and `ConversationInterpreter.interpret(...)`
- `ActionDefinition` consequence classification, `ActionRequest` confirmation evidence, and platform-level request validation that produces the only request type accepted by executors
- `ActionExecutor.execute(...)` returning a typed outcome
- `BenchmarkRunner.run(samples, providers, config)`
- `EvaluationSample`, immutable provider configuration snapshots, distinct transcription/semantic/task results, and data-governance metadata

## Implemented request flow

1. The web client starts an in-memory conversation and submits text.
2. Deterministic domain rules derive the `failed_transfer` intent and known fields.
3. The service asks for each missing required field or creates a proposal and summary.
4. The client submits explicit confirmation containing the proposal ID and revision.
5. Generic action validation rejects mismatched confirmation before execution.
6. The financial-support executor creates one simulated case through `SupportCaseRepository` and returns its reference.

Later voice input ends at the existing channel-neutral `UserUtterance` boundary. It must not change the financial workflow or couple it to a speech vendor.

## Failure and safety posture

- Treat low confidence, ambiguity, unavailable providers, and timeouts as ordinary states.
- Do not silently execute when required fields or confirmation are absent.
- Treat every action classified as consequential as requiring explicit confirmation.
- Tie explicit confirmation to a proposal, conversation revision, summarized action, and input fingerprint; executors must reject mismatched or stale evidence.
- Use idempotency keys for actions that may be retried.
- Separate user-visible messages from internal error details.
- Record the minimal telemetry required, with retention and access rules defined before collection.

## Open technical decisions

Additional providers, Sahara model/version selection, post-prototype interpretation/LLM approach, deployment platform, persistence, authentication, observability, text-to-speech, and detailed confidence calibration are unresolved.

## TypeScript build strategy

Workspace manifests are the dependency graph and pnpm runs package builds topologically. Type declarations resolve from package source during local typechecking, while runtime exports resolve from `dist`. TypeScript project references are intentionally deferred at this repository size; if packages are published independently or incremental builds become important, declaration exports and project references should be revisited together.
