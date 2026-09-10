# Evaluation results

Generated results belong here and are ignored by Git. Do not hand-edit or publish results without their run configuration, dataset version, provider/model identifiers, exclusions, and limitations.

The STT batch runner writes `stt/<run-id>/run.json` plus an incrementally synced `results.jsonl`. Keep both together: the JSONL records are valid only against their matching immutable run metadata. These files may contain raw speech transcripts and provider request references; apply the dataset's access and retention policy.

The metric CLI adds `metrics.json`, `summary.csv`, `summary.md`, and `per-sample.csv` beside a run. These are derived artifacts bound to run/result/review/manifest SHA-256 values and should be regenerated rather than hand-edited. See `docs/stt-metrics.md`.
