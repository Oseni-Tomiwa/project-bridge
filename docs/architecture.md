# Architecture

## Status

This document describes **current architectural decisions** and conceptual interfaces. It does not claim that external integrations or a full workflow are implemented.

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
- Pass the same immutable evaluation sample to each selected provider.
- Keep conversation interpretation separate from transcription and action execution. The interpreter accepts a channel-neutral `UserUtterance`, so text fallback and reference-transcript evaluation do not depend on a speech-provider result.
- Let vertical packages contribute action definitions and domain metadata through `DomainModule`.
- Represent action confirmation requirements explicitly.
- Avoid persistence until a concrete requirement and data lifecycle are defined.

## Package responsibilities

| Package        | Owns                                                        | Must not own                                |
| -------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `speech`       | audio input, provider contract, transcript segments/results | vendor-specific assumptions in shared types |
| `conversation` | turns, state, intents, entities, clarification outcome      | executing downstream side effects           |
| `actions`      | action definition/executor contracts, confirmation policy   | hard-coded healthcare workflows             |
| `benchmark`    | sample/result schemas, runner contract, normalization/WER   | fabricated or manually altered scores       |
| `domain`       | extension contract for a selected vertical                  | platform-wide provider selection            |
| `shared`       | identifiers and small cross-cutting primitives              | domain business logic                       |

## Key interfaces

The source definitions in `packages/*/src` are the canonical executable contracts. Important concepts include:

- `SpeechProvider.transcribe(audio, context)`
- `SpeechProviderConfiguration` with provider, model identifier/version, and sanitized options
- `TranscriptionResult` with text, segments, provider configuration, and provider latency
- `ConversationState`, channel-neutral `UserUtterance`, and `ConversationInterpreter.interpret(...)`
- `ActionDefinition` consequence classification, `ActionRequest` confirmation evidence, and platform-level request validation that produces the only request type accepted by executors
- `ActionExecutor.execute(...)` returning a typed outcome
- `BenchmarkRunner.run(samples, providers, config)`
- `EvaluationSample`, immutable provider configuration snapshots, distinct transcription/semantic/task results, and data-governance metadata

## Intended request flow

1. A channel captures user consent and audio.
2. A configured speech adapter returns a provider-neutral transcription result.
3. The interpreter derives intent/entities and identifies missing information.
4. The conversation layer asks a clarification or proposes an action.
5. The system explains and confirms a consequential action.
6. A domain action adapter validates and executes the task.
7. The channel communicates a plain-language outcome.

## Failure and safety posture

- Treat low confidence, ambiguity, unavailable providers, and timeouts as ordinary states.
- Do not silently execute when required fields or confirmation are absent.
- Treat every action classified as consequential as requiring explicit confirmation.
- Tie explicit confirmation to a proposal, conversation revision, summarized action, and input fingerprint; executors must reject mismatched or stale evidence.
- Use idempotency keys for actions that may be retried.
- Separate user-visible messages from internal error details.
- Record the minimal telemetry required, with retention and access rules defined before collection.

## Open technical decisions

Provider SDKs, orchestration/LLM approach, deployment platform, persistence, authentication, observability, text-to-speech, and detailed confidence calibration are unresolved.

## TypeScript build strategy

Workspace manifests are the dependency graph and pnpm runs package builds topologically. Type declarations resolve from package source during local typechecking, while runtime exports resolve from `dist`. TypeScript project references are intentionally deferred at this repository size; if packages are published independently or incremental builds become important, declaration exports and project references should be revisited together.
