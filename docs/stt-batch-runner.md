# Batch STT benchmark runner

## Status

Project Bridge has a provider-neutral, resumable v0.1 batch runner for materialized STT manifests. Automated tests use tiny local audio and fake providers. No AfriSwitch batch benchmark has been executed: official materialization remains blocked until gated-dataset access succeeds, and the Sahara/OpenAI/Deepgram comparison must not begin before that materialization and governance review are complete.

The runner does not calculate WER or CER, retry requests, call an LLM, or perform downstream actions. It preserves the exact reference and provider hypothesis needed for a later scoring stage.

## CLI

Dry-run validates the manifest, selected audio paths and checksums, and provider configuration without requiring API keys, making network calls, or writing results:

```bash
pnpm --filter @project-bridge/evaluation benchmark:stt \
  --manifest evaluation/data/afriswitch/yoruba/<revision>/<selection>/manifest.json \
  --providers intron-sahara,openai,deepgram \
  --dry-run
```

A real run requires the three provider credentials and an explicit stable run ID:

```bash
pnpm --filter @project-bridge/evaluation benchmark:stt \
  --manifest evaluation/data/afriswitch/yoruba/<revision>/<selection>/manifest.json \
  --providers intron-sahara,openai,deepgram \
  --run-id afriswitch-yo-challenge-v0.1-run-001
```

The package script forwards these options without requiring a separator, so the examples omit it. The parser also tolerates an optional standalone `--` forwarded by pnpm and does not treat it as an audio or manifest argument. Optional `--sample <id>` and `--provider <id>` restrict one invocation. The restricted provider must still be declared in `--providers`, so the run's complete provider configuration remains stable across resumed invocations. `--output-dir <path>` overrides the default `evaluation/results/stt/<run-id>`. `--concurrency 1` is accepted; other values are rejected in v0.1.

## Preflight and deterministic plan

Before creating result files, the runner:

1. parses and validates the frozen materialized manifest;
2. requires stable manifest/source revision and normalization identities;
3. rejects duplicate sample and provider identities or secret-bearing configuration;
4. resolves each audio path within the manifest directory;
5. verifies that every planned file exists, is a file, has the declared byte length, and matches the declared SHA-256; and
6. orders work by sample ID and then provider ID.

Audio is verified again immediately before its first provider call. All providers receive the same `AudioInput` bytes and declared checksum. The source manifest is never modified.

## Run and result files

Generated files are gitignored:

```text
evaluation/results/stt/<run-id>/
  run.json
  results.jsonl
```

`run.json` has schema `0.1` and freezes the run ID, runner version, manifest ID/version/revision/content checksum, normalization and raw-scoring versions, every sanitized provider configuration, concurrency `1`, automatic retries `0`, and deterministic order.

Each `results.jsonl` line has result schema `0.1` and records:

- a deterministic execution ID;
- run and manifest identity;
- sample ID, audio SHA-256, and exact reference transcript;
- complete sanitized requested provider/model/options snapshot;
- provider-reported model metadata only when returned;
- normalization and raw-scoring version identity;
- execution timestamp, provider timestamps, monotonic latency, and attempt count `1`; and
- either the exact raw hypothesis and safe provider references/status, or a structured transcription failure.

No normalized hypothesis or metric is calculated by the runner. Provider error messages and raw response bodies are not persisted. API keys and authorization headers are rejected if they appear in a configuration snapshot.

## Checkpoint and resume rules

The runner writes and syncs one JSONL record immediately after each provider/sample attempt. A completed success or failure is a terminal checkpoint for that execution identity. On resume, exact checkpoints are skipped without another provider call.

Execution identity covers result schema, run ID, manifest ID/version/content checksum/source revision, sample ID/audio checksum, full requested provider configuration, and normalization/scoring versions. Changing a model, option, endpoint, timeout, normalization version, manifest content, or run ID changes identity. If `run.json` differs from the requested manifest or provider set, the runner refuses the directory and requires a new run ID/output directory.

Duplicate identities and mismatched existing records are rejected. A final partial JSONL fragment caused by process interruption is truncated on resume while earlier newline-complete, synced checkpoints remain intact. There are no automatic retries or hidden sleeps.

## Limitations

- Sequential concurrency only; provider-order rotation and randomized scheduling remain future protocol decisions.
- A persisted provider failure is skipped on normal resume. A future explicit retry/attempt policy must create separately identified attempts rather than overwrite it.
- Metric computation and aggregate reporting remain separate follow-up work.
- The v0.1 manifest loader targets the current materialized manifest contract and local filesystem; object storage and databases are not supported.
