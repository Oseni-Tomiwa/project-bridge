# STT metric aggregation

Project Bridge's provider-neutral metric stage scores an immutable STT batch run without changing its `run.json`, `results.jsonl`, provider output, reference transcript, or audio. Generated artifacts remain beside the run under the gitignored `evaluation/results/stt/<run-id>/` directory.

## Definitions

Word error rate is `(substitutions + deletions + insertions) / reference word count`, using Levenshtein distance. Raw WER tokenizes the untouched strings on Unicode whitespace under `whitespace-tokenization-v1`. Strict normalized WER first applies `yoruba-strict@0.1`.

Character error rate uses the same edit calculation over Unicode code points. Raw CER includes every original whitespace code point. Strict normalized CER applies `yoruba-strict@0.1`, then includes the single U+0020 spaces produced by that profile's whitespace collapse. Yoruba letters and diacritics are preserved. `yoruba-diacritic-insensitive-analysis@0.1` produces separately labeled WER/CER sensitivity measures and never replaces the primary strict score. A zero-length reference has a null rate while its edit counts remain available.

Corpus WER/CER are micro-aggregates: edit counts and reference denominators are summed before division. Latency is the recorded provider execution latency in milliseconds; mean, min, max, median/p50, and p95 are calculated over successful rows, with quantiles using linear interpolation over sorted values. Build and aggregation time are excluded.

## Scoring sets and quality

The output keeps four sets distinct:

- `all-successful-results`: every successful result, including held or excluded samples.
- `scored-development`: manually usable plus diagnostics-passed/unreviewed samples; `uncertain` and `unusable` are omitted.
- `manually-confirmed-usable`: only samples reviewed as usable.
- `diagnostics-passed-unreviewed`: samples that pass non-speech WAV diagnostics but have no human approval.

Held and excluded counts remain visible. Automated diagnostics do not establish intelligibility. For `vocal-money-dev-30-v1`, three uncertain clips (`vocal-money-as_076`, `_080`, and `_130`) are held out, no clip is marked unusable, one is manually usable, and 26 are diagnostics-passed/unreviewed. The primary development set therefore contains 27 samples per provider.

## CLI and outputs

From the repository root:

```bash
pnpm --filter @project-bridge/evaluation metrics:stt \
  --run-dir results/stt/vocal-money-dev-30-v1 \
  --review-file reviews/vocal-money-audio-quality.v0.1.json
```

An optional standalone `--` is tolerated. The command writes `metrics.json`, `summary.csv`, `summary.md`, and `per-sample.csv` atomically. `metrics.json` contains versioned policies, exact provider configuration snapshots, per-provider and per-CMI aggregates, source-band aggregates, per-sample metrics, model metadata when present, quality dispositions, counts, generation time, and SHA-256 bindings for the run, raw results, review, and materialized dataset manifest.

Aggregation refuses unknown schema/profile versions, identity or checksum mismatches, duplicate provider/sample or execution records, incomplete result matrices, invalid latency, missing successful hypotheses/references, and review/sample mismatches.

Vocal Money is a secondary development benchmark. AfriSwitch remains the official primary challenge benchmark, and no final challenge model ranking should be inferred from this development slice alone.
