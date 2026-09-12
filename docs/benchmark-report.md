# STT benchmark report: Yoruba-English code-switching

This document provides the in-tree documentation summary of the Project Bridge speech-to-text benchmark report on Yoruba-English code-switched speech. For the full judge-ready 3-page submission package, refer to [`submission/BENCHMARK_REPORT.md`](../submission/BENCHMARK_REPORT.md).

---

## Executive summary

Project Bridge evaluated three leading ASR engines—**Intron/Sahara**, **OpenAI (`gpt-transcribe`)**, and **Deepgram (`nova-3` multi)**—across a 30-sample development benchmark of Yoruba-English code-switched financial speech from the `Kimyayd/vocal-money-codeswitch-asr-benchmark` dataset.

### Summary of primary metrics (Scored Set N = 27 / Executed Calls N = 30)

| Provider | Configured Model | Executed Calls | Provider Call Failures | Accuracy Scored Samples | Strict WER (`yoruba-strict@0.1`) | Strict CER | Diacritic-Insensitive WER | Median Latency | p95 Latency | Min Latency | Max Latency |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Intron / Sahara** | Sahara Engine (`yo` route) | 30 | 0 / 30 (0.0%) | 27 | **0.8864** | **0.5622** | **0.7074** | 2,577.19 ms | 4,882.88 ms | 1,808.03 ms | 11,680.18 ms |
| **OpenAI** | `gpt-transcribe` | 30 | 0 / 30 (0.0%) | 27 | 0.9105 | 0.6199 | 0.8153 | **1,688.02 ms** | **3,251.83 ms** | 723.40 ms | 3,607.05 ms |
| **Deepgram** | `nova-3` (`language=multi`, OOD) | 30 | 0 / 30 (0.0%) | 27 | 0.9645 | 0.7690 | 0.9645 | 1,829.92 ms | 9,693.73 ms | 618.31 ms | 18,384.16 ms |

---

## Quality review & held clips

In accordance with [`evaluation/reviews/vocal-money-audio-quality.v0.1.json`](../evaluation/reviews/vocal-money-audio-quality.v0.1.json):
- **3 clips held out (`uncertain`):** `vocal-money-as_076` (3.34s manifest vs 10.032s WAV), `vocal-money-as_080` (6.28s manifest vs 18.852s WAV), and `vocal-money-as_130` (6.30s manifest vs 18.912s WAV) were flagged by audio diagnostics for duration mismatch and confirmed by manual human listening to be unintelligible.
- **1 clip manually included (`usable`):** `vocal-money-as_178` (1.88s) was flagged for digital clipping (~3.3397%) but verified by human listening to contain clear, intelligible speech.
- **26 clips included as `diagnostics-passed-unreviewed`:** Passed automated PCM16 WAV signal checks but have not undergone human reference audit.

---

## Code-Mixing Index (CMI) stratification

The 30 materialized samples were selected across three CMI buckets (10 Low $<10$, 10 Medium $10\text{--}25$, 10 High $>25$). In the 27 scored development set, each bucket has 9 scored samples.

---

## Key insights & architectural relevance

1. **Orthography & Diacritics:** The reduction under diacritic-insensitive normalization indicates that Yoruba orthographic diacritics account for part of the strict transcription error ($-17.90\%$ for Sahara, $-9.52\%$ for OpenAI).
2. **Out-of-Distribution Baseline:** Deepgram Nova-3 multilingual does not support Yoruba, resulting in out-of-distribution phoneme substitutions and elevated tail latency ($p_{95}$: 9,693.73 ms; max: 18,384.16 ms).
3. **Downstream Separation:** Downstream healthcare intake evaluation (16 synthetic fixtures in `evaluation/fixtures/yoruba-healthcare-intake.v0.1.mts`) tests deterministic dialogue rules and emergency escalation, not live speech provider transcripts.
4. **User-in-the-Loop Necessity:** High baseline error rates across all providers in code-switched environments mandate that voice-first systems incorporate visual/editable transcript verification before committing actions.

---

## Governance & next steps

- **AfriSwitch Yoruba Test Slice:** Official 75-sample primary challenge benchmark remains awaiting frozen revision materialization and governance approval.
- **AfriSwitchCare:** Future potential evaluation of clinical code-switching speech robustness.
- **Full Report:** See [`submission/BENCHMARK_REPORT.md`](../submission/BENCHMARK_REPORT.md) for full methodology, citations, and analysis.
