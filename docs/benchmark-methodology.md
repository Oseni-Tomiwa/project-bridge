# Benchmark methodology

## Purpose

Evaluate code-switched speech providers fairly and reproducibly, then measure whether transcription quality carries through to the selected downstream task. No benchmark has been run and this repository contains no scores.

The initial text-only ground-truth layer and its limitations are documented in the [Yoruba-first evaluation plan](yoruba-evaluation-plan.md). It does not alter the governed audio-manifest and run requirements below.

The primary external code-switching ASR source is the official `intronhealth/AfriSwitch` dataset with config `yoruba` and split `test`. Project Bridge v0.1 freezes its first challenge slice at 75 samples with seed `project-bridge-challenge-v1`; the source revision remains unresolved until materialization. Its deterministic, opt-in preparation process is documented in the [AfriSwitch Yoruba guide](datasets/afriswitch-yoruba.md). Official-source, Project Bridge synthetic, and Project Bridge domain-recording results are distinct dataset slices and must not be pooled without source labels and separate counts.

## Dataset design

Each de-identified sample should have a stable ID, an audio asset ID and SHA-256 digest, a human-verified reference transcript with annotation protocol/version, and stratification metadata:

- language pair and switching direction/pattern
- vertical/domain and scenario
- country and self-described accent label as separate fields
- recording device/category, model where known, codec, sample rate, and channels
- clean/noisy environment and a controlled noise label where applicable
- speaker/sample split identifier that prevents leakage
- expected intent, entities/slots, and task outcome when downstream labels exist

Each sample also carries governance references for source/collection provenance, consent status and allowed uses, third-party provider-processing permission, license status/identifier, and retention policy/deletion date. Identity mappings and consent evidence remain outside versioned public metadata.

Do not infer sensitive demographic attributes from a voice. Avoid treating country as a proxy for accent or language competence.

## Collection and splits

**Assumption:** both naturally occurring and consented scripted/semi-scripted utterances may be useful. Record their provenance separately. Define train/development/test splits by speaker before tuning normalization, prompts, thresholds, or mappings. Keep a frozen blind test set for final reporting.

Report sample counts and audio duration overall and per slice. Identify repeated utterances, speaker imbalance, missing metadata, and unsuitable recordings before a run.

## Reproducible run protocol

1. Freeze a named/versioned metadata manifest, reference transcripts, and audio checksums.
2. Assign every sanitized provider configuration a stable configuration ID and record provider, model identifier, model version when exposed, region, request options, normalization profile/version, raw-WER policy version, runner version, source revision, and UTC timestamps. Never place credentials in recorded options.
3. Use byte-identical source audio per provider; document any provider-required transcoding.
4. Warm up providers separately if warm-up is part of the declared protocol.
5. Randomize or rotate provider order to reduce time-of-day and network bias.
6. Bound concurrency equally and record retries, failures, and rate limiting.
7. Store raw provider responses privately when terms and consent allow; derive immutable result records.
8. Calculate metrics from code, not by hand, and preserve the run configuration with outputs.

For AfriSwitch, the preparation manifest requires one downloaded/checksummed audio asset per selected source row and declares no preprocessing or transcoding. All provider runs reference that one asset. If any provider cannot accept the original format, preparation must stop until one canonical conversion policy can be applied equally and recorded with transformation provenance and input/output checksums.

Every persisted result repeats its sanitized provider configuration snapshot. The foundation exposes a consistency check that compares the result snapshot with the matching configuration ID in the frozen run; a runner must reject the result if the run ID, model version, region, or options differ.

The implemented Intron/Sahara synchronous adapter records the `yo` language route, endpoint, transport, timeout, known duration limit, request timestamps, monotonic latency, success/failure state, and provider `file_id` when returned. It performs no hidden retry and does not calculate WER. Because the documented response does not expose the deployed model/version, the current configuration records the model identifier as `unknown` and omits model version; this limitation must accompany any future result.

The implemented OpenAI adapter records the configured model identifier (default `gpt-transcribe`), endpoint, synchronous file-upload transport, JSON response mode, explicit absence of a language hint, client timeout, zero automatic retries, timestamps, monotonic request latency, success/failure state, and OpenAI request ID when returned. It sends one native HTTP attempt and does not calculate or normalize metrics. The currently documented `gpt-transcribe` alias has no distinct dated version, so `modelVersion` remains absent and alias drift must be treated as a reproducibility limitation.

`evaluation/manifests/real-yo-001-comparison.v0.1.mts` prepares one reference/audio identity with separate Sahara, OpenAI, and future Deepgram result slots. It is not a runnable governed sample yet: checksum, duration, technical metadata, provenance, consent, third-party processing permission, license, retention, and reviewer state remain unverified. Provider hypotheses and latency do not belong in that preparation record and no OpenAI result is asserted.

## Metrics

### Normalized word error rate

WER = `(substitutions + deletions + insertions) / reference word count`. Record two separate measurements: raw WER using the versioned whitespace-tokenization policy without case, punctuation, or Unicode changes; and normalized WER using a declared, versioned normalization profile. Report corpus-level micro WER by summing edit counts before division, plus per-utterance distributions. Empty-reference samples produce a null WER and must not be silently discarded.

Normalization choices—Unicode form, case folding, punctuation, whitespace, number handling, filler words, and orthographic variants—can change the result. Preserve both raw and normalized text. Do not transliterate or translate unless that is a separate, declared analysis.

The Yoruba fixture layer defines `yoruba-strict@0.1` as the current primary candidate and `yoruba-diacritic-insensitive-analysis@0.1` as an optional sensitivity view. The latter must never be substituted silently for the primary result. The product/research team must review and freeze the primary profile before a measured run.

### Other transcription metrics

- Exact-match or token accuracy only with an explicit definition.
- Character error rate where word boundaries are ambiguous. CER is planned for the AfriSwitch ASR slice but is not implemented yet.
- Language/code-switch preservation measures once language pairs are selected.
- Failure/empty transcript rate.

### Latency

Record client-observed end-to-end latency using a monotonic clock. Separate time to first partial and final transcript when streaming is later evaluated. Report median, p90/p95, distribution, failures, and sample duration-normalized real-time factor where meaningful.

### Downstream metrics

- Intent accuracy: exact match against reviewed intent labels.
- Entity/slot performance: per-type and micro precision, recall, and F1 using a declared matching policy.
- Task completion: success only when the expected validated downstream outcome occurs; report clarification and confirmation behavior separately.
- Safety failures: unintended action, action without required confirmation, or misleading success response.

These are separate result objects rather than aliases for “accuracy”:

- transcription compares reference and hypothesis text;
- intent compares expected and predicted intent labels;
- entity/slot scoring compares expected and predicted structured values under a named matching policy;
- downstream task scoring compares the expected and observed task outcome.

A successful transcript does not imply semantic correctness or task completion.

AfriSwitch is used primarily for WER, future CER, failure, and latency analysis. Its general conversational rows receive no fabricated financial intent, entity, action, or downstream task labels. Those evaluations remain on separately identified Project Bridge domain fixtures and recordings.

## Analysis and reporting

Report aggregate results and slices by language pair, domain, accent/country, device, and noise condition when sample sizes permit. Include confidence intervals and paired comparisons because providers process the same samples. Publish limitations, exclusions, missingness, failed requests, provider configuration, dataset composition, and cost where permitted.

Avoid ranking providers on a single aggregate number. A provider may have lower WER but worse entity recall or task completion for a particular slice.

## Contamination and tuning

Do not tune prompts, normalization rules, aliases, or thresholds on the final test set. Log every material configuration change and rerun under a new run ID. Human reference transcripts and labels require documented review guidelines and disagreement resolution.

## Initial artifact layout

- `evaluation/audio/`: local/private recordings; ignored by Git.
- `evaluation/data/`: locally materialized external datasets and their frozen manifests; ignored by Git.
- `evaluation/metadata/`: reviewed, de-identified manifests safe to version; private subdirectories and `*.private.*` files are ignored.
- `evaluation/results/`: generated/private outputs; ignored by Git.

The TypeScript schemas are in `packages/benchmark/src`. A serializable `EvaluationSample` never embeds audio bytes; `PreparedEvaluationSample` pairs the frozen manifest entry with locally resolved bytes at runtime. The runner must verify the resolved bytes against the manifest checksum before provider calls. These schemas will evolve before data collection.
