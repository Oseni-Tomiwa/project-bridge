# AfriSwitch Yoruba benchmark preparation

## Selected source

Project Bridge uses the official [Intron AfriSwitch dataset](https://huggingface.co/datasets/intronhealth/AfriSwitch) as its primary external code-switching ASR benchmark source:

- dataset: `intronhealth/AfriSwitch`
- configuration/subset: `yoruba`
- split: `test`
- published scope: 1,877 Yoruba-English utterances totaling approximately 5 hours
- license: CC BY-NC-SA 4.0

The dataset is evaluation-only. Its Yoruba rows include 16 kHz audio, filename, primary language, verbatim human transcription, a transcription with English spans tagged as `[[EN]]…[[/EN]]`, duration, Code-Mixing Index (CMI), and switch-point count.

AfriSwitch is preferred over AfriSwitchCare for the primary Project Bridge benchmark because AfriSwitch contains general conversational code-switching, whereas AfriSwitchCare is a simulated clinical-conversation dataset. AfriSwitchCare may later be considered as a separately reported secondary robustness dataset; it is not ingested here.

## What the preparation layer does

The opt-in materializer:

1. resolves the requested Hugging Face dataset revision to a commit SHA;
2. reads row metadata through the Hugging Face dataset-viewer `/rows` API in pages;
3. validates and deterministically selects the caller's requested count;
4. downloads only the selected audio assets;
5. saves each asset once without transcoding or preprocessing;
6. computes a SHA-256 checksum from the materialized bytes; and
7. writes a frozen, result-free `manifest.json` beside the local audio.

Ordinary tests do not call Hugging Face or download audio. The TypeScript monorepo has no Python or Hugging Face runtime dependency; the explicit script uses Node's built-in `fetch`, filesystem, and cryptography support.

Downloaded data is stored under `evaluation/data/afriswitch/yoruba/` by default and is ignored by Git. The frozen manifest intentionally omits expiring signed source URLs. It preserves dataset/config/split/revision, source row index, filename, Project Bridge sample ID, exact raw and tagged transcriptions, language, duration, CMI, switch points, license, local audio identity/path, byte count, media type, and checksum.

## Deterministic subset selection

The selection algorithm is `quantile-stratified-seeded-round-robin-v1`. It computes strata from the complete row metadata using:

- lower/higher CMI around the dataset median;
- lower/middle/higher switch-point terciles; and
- short/middle/long duration terciles.

Rows in each stratum are ordered by a stable seed-derived rank incorporating source index, filename, and the official transcript. Selection proceeds round-robin across strata. This improves coverage of mixing and length conditions while making the exact ordered subset reproducible. It is not a statistical sampling guarantee or a substitute for reviewing the selected distribution. Exact duplicate source indexes and Project Bridge IDs are rejected. Provider outputs never participate in selection, so the process cannot cherry-pick clips based on model performance.

**Project Bridge v0.1 decision:** the first challenge slice is frozen at 75 clips with deterministic seed `project-bridge-challenge-v1`. This sits within the proposed 50–100 range:

- a larger subset offers stronger statistics and broader coverage, but costs more API time and money;
- a smaller subset is faster and cheaper, but is less representative and produces less stable slice estimates.

## Local preparation command

From the repository root, materialize the frozen Project Bridge v0.1 configuration:

```bash
pnpm --filter @project-bridge/evaluation prepare:afriswitch:yoruba -- \
  --count 75 \
  --seed project-bridge-challenge-v1
```

The count and seed above are the selected v0.1 values. Keep them unchanged for the first challenge benchmark. To require a known current dataset revision or choose another ignored local directory:

```bash
pnpm --filter @project-bridge/evaluation prepare:afriswitch:yoruba -- \
  --count 75 \
  --seed project-bridge-challenge-v1 \
  --expected-revision <hugging-face-commit-sha> \
  --output-dir evaluation/data/afriswitch/yoruba/custom-selection
```

The materializer resolves `main` before and after reading the row catalog and aborts if it changes. `--expected-revision` adds an explicit equality check; the rows API cannot request an arbitrary historical revision, so this option must not be described as a historical checkout.

`HF_TOKEN` is required for gated Dataset Viewer access and is optional only for public Hub metadata. It is used only for Hugging Face API requests, is never recorded, and is not forwarded to signed audio asset hosts. The command refuses to overwrite an existing output directory. If preparation fails partway through, inspect or remove that incomplete ignored directory before retrying.

AfriSwitch is currently manually gated on Hugging Face even though its repository is public. The account associated with `HF_TOKEN` must be granted dataset access. The Hub revision endpoint can expose public repository metadata even when that token/account cannot retrieve Dataset Viewer rows, so a successful revision lookup alone does not prove row access. A rows HTTP 404 is reported with the sanitized request URL and an explicit gated-access diagnostic. The `/rows` request contains only `dataset`, `config`, `split`, `offset`, and `length`; the resolved revision is verified separately through the Hub API before and after catalog retrieval and is never appended to the Dataset Viewer query.

## Transcript and audio policy

The official `transcription` remains byte-for-byte unchanged in the `raw` field. Yoruba diacritics are not rewritten. Strict Project Bridge normalization and the optional diacritic-insensitive sensitivity view are stored separately; neither replaces the source text. The tagged transcript is also preserved separately.

Each selected audio file is downloaded and checksummed once. Sahara, OpenAI, and future Deepgram runs must receive those same materialized bytes wherever all providers accept the source format. The preparation layer performs no silent provider-specific transcoding. If compatibility requires a conversion, stop: define one canonical shared transformation, record its tool/version/options and input/output checksums, and use that same representation for every provider.

## Supported and unsupported evaluation

AfriSwitch supports external ASR evaluation using raw/normalized WER, future CER, provider failures, and provider-request latency. The current repository implements WER but not yet CER calculation. Latency exists only after real provider requests and is not part of this preparation manifest.

General AfriSwitch utterances do not automatically describe failed transfers. The mapper therefore sets downstream labels to `null`. It does not invent financial intent, entity/slot, clarification, action, or task-success ground truth. Those measurements remain tied to Project Bridge's separately identified synthetic/domain recordings unless a specific external sample receives justified, reviewed annotation later.

Official AfriSwitch samples, Project Bridge's 36 synthetic text fixtures, and `real-yo-001` must remain separate dataset sources and result slices. They may be summarized together only with source-specific counts and metrics clearly identified.

## Governance and limitations

CC BY-NC-SA 4.0 imposes attribution, noncommercial, and share-alike obligations. The product/legal team must determine whether provider processing, result distribution, retained derivatives, and the intended challenge/product use comply. The dataset card provides dataset-level source information but not per-row original-media links, speaker partitions, recording-device details, accent labels, or participant consent records. The preparation layer does not fabricate them.

Before the first provider run, approve local retention/deletion, access, attribution, result-sharing, provider data controls, and whether the source formats are accepted byte-identically by all compared providers. No benchmark result has been produced by this integration.
