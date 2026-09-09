# Vocal Money code-switched ASR benchmark

## Role and source

`Kimyayd/vocal-money-codeswitch-asr-benchmark` is Project Bridge's **secondary development benchmark**. It does not replace the official `intronhealth/AfriSwitch` Yoruba `test` split as the primary challenge benchmark. The public dataset is an AfriSwitch-derived Yoruba-English code-switched set published with 210 rows in the Hugging Face `default` configuration and `train` split.

The source declares 16 kHz mono PCM16 WAV audio and publishes three CMI band labels with 70 rows each: `low`, `medium`, and `high`. Preparation preserves each label verbatim along with the numeric CMI, reference transcript, tagged transcript, switch-point count, duration, device/noise fields, source dataset/file identifiers, and resolved repository commit SHA. Project Bridge does not recompute or validate the source label: three live rows publish `low` at numeric CMI `10.0`.

The source is marked `CC-BY-NC-SA-4.0`, which carries attribution, non-commercial, and ShareAlike conditions. The dataset card also states that speakers did not consent specifically to this derivative dataset and that source-corpus terms still apply. This repository records those notices but does not interpret whether a proposed use, provider upload, derived artifact, or publication complies with them. Product/legal approval remains required. Because the dataset is public, the integration does not read or send `HF_TOKEN`.

## Frozen development slice

The v0.1 development configuration is:

```text
manifest: vocal-money-codeswitch-dev-v0.1
sampleCount: 30
seed: project-bridge-vocal-money-dev-v1
selection: project-bridge-cmi-threshold-bucket-stratified-seeded-v1
selection buckets: low <10 / medium 10–25 inclusive / high >25
target distribution: 10 per Project Bridge selection bucket
```

Selection depends only on numeric CMI and the seed. Project Bridge derives a separate sampling-only `selectionCmiBucket`: low for CMI `<10`, medium for `10–25` inclusive, and high for `>25`. Live metadata currently contains 67/73/70 rows in those buckets, independently of the published 70/70/70 source-label distribution. The 30-row subset selects 10 from each Project Bridge bucket. It never uses provider performance. `--all` materializes all 210 rows in source-row order for a full-dataset experiment.

## Preparation

Preparation is explicit and is not run by install, test, typecheck, or build:

```bash
pnpm --filter @project-bridge/evaluation prepare:vocal-money --count 30 --seed project-bridge-vocal-money-dev-v1
pnpm --filter @project-bridge/evaluation prepare:vocal-money --all
```

The script resolves `main` through the Hugging Face Hub API before and after Dataset Viewer retrieval, refuses source drift or a row count other than 210, downloads only the selected audio, and writes a frozen manifest with the resolved commit, byte lengths, and SHA-256 checksums. Use `--expected-revision <sha>` to require a previously reviewed revision. Output is written under gitignored `evaluation/data/vocal-money/` and the script refuses to overwrite an existing preparation directory.

The prepared manifest uses the same provider-neutral audio and reference fields consumed by the STT batch runner. The identical materialized bytes can therefore be scheduled across Sahara, OpenAI, and Deepgram without provider-specific copies.

## Published hypotheses are not results

The public table includes columns whose names begin with `hyp_`. Project Bridge deliberately omits them from mapped samples and frozen manifests. They are source-published comparison metadata, not results from a Project Bridge run, and cannot be combined with current provider outputs, latency, configurations, or run IDs. A future analysis may import them only into a separately named source-analysis artifact with their original provenance and limitations.

## Boundaries and unresolved governance

- Raw audio and generated manifests remain local and gitignored.
- No downstream intent, entity, action, or task-success labels are inferred from these ASR references.
- Strict Yoruba normalization remains primary; diacritic-insensitive normalization remains a separately identified sensitivity analysis.
- The dataset card's notice that speakers did not consent specifically to this derivative, participant terms inherited from the source corpus, third-party provider processing, retention/deletion, attribution, ShareAlike obligations, and non-commercial scope require explicit review before provider calls or publication.
- No Project Bridge Vocal Money provider run or metric is currently claimed.
