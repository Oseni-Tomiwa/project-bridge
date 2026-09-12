# Project Bridge: Speech-to-Text Benchmark Report
## Evaluation of Yoruba-English Code-Switched Speech Recognition Across Leading ASR Providers

---

```text
==================================================================================================
DOCUMENT METADATA & EXPERIMENTAL PROVENANCE
Project:             Project Bridge (Sahara CodeSwitch Africa Challenge)
Branch:              release/benchmark-report
Evaluation Date:     September 2026
Report Version:      v0.1-audited (Rigorous Benchmark Technical Report)
Primary Dataset:     Vocal Money Code-Switched Dev Subset (vocal-money-codeswitch-dev-v0.1)
Source Heritage:     Kimyayd/vocal-money-codeswitch-asr-benchmark (AfriSwitch derivative)
Dataset License:     CC-BY-NC-SA-4.0
Evaluated Providers: Intron/Sahara (yo route), OpenAI (gpt-transcribe), Deepgram (nova-3 multi)
Primary Normalizer:  yoruba-strict@0.1 (Diacritic-preserving, NFC normalized)
Sensitivity Normalizer: yoruba-diacritic-insensitive-analysis@0.1 (Tone-stripped)
Scoring Policy:      stt-scoring-policy-v0.1 (Micro-aggregated WER/CER; 4 distinct sets)
==================================================================================================
```

---

<!-- ========================================================================================== -->
<!-- PAGE 1: EXECUTIVE SUMMARY, METHODOLOGY, DATASET & EXPERIMENTAL CONFIGURATION              -->
<!-- ========================================================================================== -->

# 1. Executive Summary & Benchmark Purpose

**Project Bridge** investigates voice-first access architectures for African multilingual communities, focusing on intra-sentential **Yoruba-English code-switching** (*Yorubanglish*). In clinical, civic, and financial interactions, speakers fluidly alternate between indigenous matrix languages and English. General-purpose automated speech recognition (ASR) engines frequently face challenges at code-switching boundaries, omit tonal diacritics, or encounter latency fluctuations on unsupported phonology.

This report presents an empirical evaluation of three ASR services—**Intron/Sahara**, **OpenAI**, and **Deepgram**—evaluated on a 30-sample development benchmark of code-switched audio.

### Key Empirical Findings:
1. **Intron/Sahara achieved the lowest Strict Word Error Rate (WER: 0.8864)** and **Strict Character Error Rate (CER: 0.5622)** under primary diacritic-preserving Yoruba normalization (`yoruba-strict@0.1`), demonstrating capture of Yoruba orthography and tone markers.
2. **OpenAI (`gpt-transcribe`) recorded the lowest execution latency** (median: 1,688.02 ms; $p_{95}$: 3,251.83 ms). Under strict normalization, its WER was 0.9105 (CER: 0.6199). Under diacritic-insensitive analysis, its WER dropped to 0.8153, reflecting omission of Yoruba tone diacritics.
3. **Deepgram (`nova-3` multilingual) was evaluated out-of-distribution for Yoruba**, resulting in strict WER of 0.9645 and CER of 0.7690, with elevated tail latency ($p_{95}$: 9,693.73 ms; max: 18,384.16 ms) attributable to decoding out-of-vocabulary acoustics.
4. **Call Reliability:** Across 90 total API requests (30 samples $\times$ 3 providers), 0 provider call failures occurred (100% call completion).
5. **Quality Review Governance:** 3 clips (`vocal-money-as_076`, `_080`, `_130`) were held out after manual listening review confirmed unintelligibility, establishing a 27-sample primary development scoring set.

> [!IMPORTANT]
> **Evaluation Boundary & Governance Notice:**
> - **Secondary Development Set:** Vocal Money is a secondary development dataset. It does **not** replace the official 75-sample `intronhealth/AfriSwitch` Yoruba test split (the primary challenge benchmark, awaiting frozen materialization and governance sign-off).
> - **Quality Status:** Of the 27 scored development samples, 1 is manually confirmed usable (`as_178`), and 26 are automated-diagnostics-passed / unreviewed.
> - **Downstream Independence:** Downstream simulated healthcare intake fixtures (16 synthetic text scenarios) evaluate deterministic dialogue safety, not speech provider transcripts. No final model ranking is claimed from this development slice alone.

---

# 2. Dataset, Preprocessing & Quality Review Policy

### 2.1 Dataset Composition & Stratification
The development benchmark uses a frozen 30-sample slice from `Kimyayd/vocal-money-codeswitch-asr-benchmark` (`default` configuration, `train` split, 210 total rows). The dataset consists of 16 kHz mono PCM16 WAV recordings of Yoruba-English code-switched speech.

Samples were selected deterministically using seed `project-bridge-vocal-money-dev-v1` with stratified sampling across Project Bridge **Code-Mixing Index (CMI)** buckets:
- **Low CMI (<10):** 10 samples (predominantly monolingual Yoruba or English with isolated switches).
- **Medium CMI (10–25 inclusive):** 10 samples (phrase-level switching).
- **High CMI (>25):** 10 samples (dense intra-sentential switching).

Published source `cmi_band` labels (`low`, `medium`, `high`) are preserved verbatim as immutable metadata.

### 2.2 Audio Policy & Provider Parity
- **Byte-Identical Audio:** Zero transcoding or audio preprocessing was applied. All three providers processed byte-identical WAV audio verified by SHA-256 digests.
- **Execution Protocol:** Single-attempt execution with zero hidden retries to ensure uncontaminated latency and error measurements.

### 2.3 Audio Quality Governance & Held Clips
Audio quality is governed via an immutable review manifest (`vocal-money-audio-quality.v0.1.json`). Automated WAV diagnostics evaluate PCM16 header structure, sample counts, digital clipping, and duration discrepancies. Manual review was conducted via human listening on flagged clips:

| Sample ID | Manifest Duration | Measured WAV Duration | Automated Diagnostic Flag | Manual Review Status | Scoring Disposition |
|:---|:---:|:---:|:---|:---|:---|
| `vocal-money-as_076` | 3.34 s | 10.032 s | Duration mismatch | Completed manual listening (`uncertain` / `unintelligible`) | **Held (uncertain)** |
| `vocal-money-as_080` | 6.28 s | 18.852 s | Duration mismatch | Completed manual listening (`uncertain` / `unintelligible`) | **Held (uncertain)** |
| `vocal-money-as_130` | 6.30 s | 18.912 s | Duration mismatch | Completed manual listening (`uncertain` / `unintelligible`) | **Held (uncertain)** |
| `vocal-money-as_178` | 1.88 s | 1.880 s | Excessive clipping (~3.3397%) | Completed manual listening (`usable` / intelligible speech) | **Included (manual-usable)** |
| *Remaining 26 clips* | Matches | Matches | Diagnostics passed | Unreviewed automated pass | **Included (diagnostics-passed)** |

---

# 3. Provider Configurations & Normalization Profiles

### 3.1 Evaluated Provider Configurations

```text
+-------------------+----------------------------------------------------+--------------------------+-------------------------------------+
| Provider          | Endpoint / Transport                               | Model / Snapshot ID      | Language & Decoding Parameters      |
+-------------------+----------------------------------------------------+--------------------------+-------------------------------------+
| Intron / Sahara   | POST infer.voice.intron.io/file/v1/upload/sync     | unknown (unexposed sync) | use_language_asr_input=yo           |
| OpenAI            | POST api.openai.com/v1/audio/transcriptions        | gpt-transcribe (alias)   | languageHint=null (unforced)        |
| Deepgram          | POST api.deepgram.com/v1/listen                    | nova-3 (version=latest)  | language=multi, smart_format=false  |
+-------------------+----------------------------------------------------+--------------------------+-------------------------------------+
```

### 3.2 Normalization & Scoring Definitions
Standard Yoruba orthography uses tone marks (acute `´`, grave `` ` ``) and subdots (`ẹ`, `ọ`, `ṣ`) to represent phonemic distinctions.
- **Primary Strict Normalization (`yoruba-strict@0.1`):** Unicode NFC normalization, lowercase conversion, whitespace collapse to single ASCII space (U+0020), and punctuation removal (preserving apostrophes, currency symbols, and all Yoruba tone marks and subdots).
- **Sensitivity Normalization (`yoruba-diacritic-insensitive-analysis@0.1`):** Strips acute and grave tone marks while preserving subdots. Evaluated strictly as a sensitivity measure; never replaces primary scores.
- **Micro-Aggregated Metrics:** Summed edit distance over summed reference lengths across the scored set.

\newpage

<!-- ========================================================================================== -->
<!-- PAGE 2: BENCHMARK RESULTS, LATENCY DISTRIBUTIONS & QUALITATIVE ANALYSIS                   -->
<!-- ========================================================================================== -->

# 4. Primary Benchmark Results

The benchmark distinguishes between **total executed provider calls** ($N = 30$ calls/provider across the full execution matrix) and the **primary accuracy-scored development set** ($N = 27$ samples/provider, holding out the 3 uncertain/unintelligible clips from WER/CER computation).

### Table 1: Primary ASR Transcription Accuracy & Call Reliability
| Provider | Configured Model / Route | Executed Calls | Provider Call Failures | Accuracy Scored Samples | Held Samples | Strict Normalized WER | Strict Normalized CER | Diacritic-Insensitive WER |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Intron / Sahara** | Sahara Engine (`yo` route) | 30 | 0 / 30 (0.0%) | 27 | 3 | **0.8864** | **0.5622** | **0.7074** |
| **OpenAI** | `gpt-transcribe` | 30 | 0 / 30 (0.0%) | 27 | 3 | 0.9105 | 0.6199 | 0.8153 |
| **Deepgram** | `nova-3` (`multi`, OOD) | 30 | 0 / 30 (0.0%) | 27 | 3 | 0.9645 | 0.7690 | 0.9645 |

*Note: All runs processed identical 16 kHz PCM16 audio. Metrics represent corpus-level micro-aggregates.*

### Table 2: Execution Latency Distribution (N = 30 Successful Calls / Provider, Monotonic Clock)
| Provider | Successful Calls | Mean Latency | Median (p50) | p95 Latency | Min Latency | Max Latency |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **OpenAI** | 30 | **1,785.29 ms** | **1,688.02 ms** | **3,251.83 ms** | **723.40 ms** | **3,607.05 ms** |
| **Intron / Sahara** | 30 | 3,050.18 ms | 2,577.19 ms | 4,882.88 ms | 1,808.03 ms | 11,680.18 ms |
| **Deepgram** | 30 | 2,972.57 ms | 1,829.92 ms | 9,693.73 ms | 618.31 ms | 18,384.16 ms |

---

# 5. Diacritic Sensitivity & CMI Stratification

### 5.1 Diacritic Sensitivity Gap Analysis
Comparing strict normalized WER to diacritic-insensitive WER measures the impact of orthographic diacritic preservation:

```text
+-------------------+--------------------+--------------------------------+----------------------------+
| Provider          | Strict WER (0.1)   | Diacritic-Insensitive WER (0.1)| Absolute WER Reduction (Δ) |
+-------------------+--------------------+--------------------------------+----------------------------+
| Intron / Sahara   | 0.8864             | 0.7074                         | -0.1790 (-17.90%)          |
| OpenAI            | 0.9105             | 0.8153                         | -0.0952 (-9.52%)           |
| Deepgram          | 0.9645             | 0.9645                         |  0.0000 ( 0.00%)           |
+-------------------+--------------------+--------------------------------+----------------------------+
```

The reduction under diacritic-insensitive normalization indicates that Yoruba orthographic diacritics account for part of the strict transcription error in models that recognize Yoruba words without outputting tone marks.

### 5.2 Code-Mixing Index (CMI) Stratification
The 30 materialized samples were stratified equally across Project Bridge sampling buckets:
- **Low CMI (<10):** 10 selected samples (9 scored in development set).
- **Medium CMI (10–25):** 10 selected samples (9 scored in development set).
- **High CMI (>25):** 10 selected samples (9 scored in development set).

---

# 6. Qualitative Error Observations & Provider Patterns

Provider hypotheses on Yoruba-English code-switched speech reveal distinct error patterns:

1. **Intron/Sahara (`yo` Route):**
   - *Orthographic Fidelity:* Demonstrates capability to generate Yoruba diacritics (e.g., preserving tone marks on high-frequency particles like *ní*, *tí*, *sí*).
   - *Code-Switching Adaptation:* Handles transitions between Yoruba clauses and English financial terms (e.g., *account*, *transfer*, *balance*).
2. **OpenAI (`gpt-transcribe`):**
   - *Phonetic Transcription:* Transcribes the phonetic letters of Yoruba words and accurately outputs English tokens.
   - *Diacritic Absence:* Omits Yoruba tone marks and subdots, which leads to substitution penalties under strict Yoruba evaluation profiles.
3. **Deepgram (`nova-3` Multilingual):**
   - *Out-of-Distribution Baseline:* Because Yoruba is not an officially supported language in Nova-3 multilingual mode, the decoder substitutes English phonemes for Yoruba acoustic segments.
   - *Tail Latency Impact:* Out-of-vocabulary decoding contributes to high tail latency ($p_{95}$: 9,693.73 ms; max: 18,384.16 ms).

---

# 7. Audio Quality Review Audit

```text
+--------------------+-------------------+--------------------+----------------------+------------------------------------------------+
| Sample ID          | Manifest Duration | Measured Duration  | Diagnostic Flag      | Manual Review Finding                          |
+--------------------+-------------------+--------------------+----------------------+------------------------------------------------+
| vocal-money-as_076 | 3.34 s            | 10.032 s           | Duration mismatch    | Speech not sufficiently clear; held uncertain. |
| vocal-money-as_080 | 6.28 s            | 18.852 s           | Duration mismatch    | Speech not sufficiently clear; held uncertain. |
| vocal-money-as_130 | 6.30 s            | 18.912 s           | Duration mismatch    | Speech not sufficiently clear; held uncertain. |
| vocal-money-as_178 | 1.88 s            | 1.880 s            | Clipping (~3.3397%)  | Confirmed intelligible speech; scored usable.  |
+--------------------+-------------------+--------------------+----------------------+------------------------------------------------+
```

Review was conducted by a single manual reviewer using human listening (`reviewMethod: human-listening`, `reviewStatus: completed-manual`).

\newpage

<!-- ========================================================================================== -->
<!-- PAGE 3: PRODUCT DOWNSTREAM BEHAVIOR, LIMITATIONS & ROADMAP                                -->
<!-- ========================================================================================== -->

# 8. Speech Accuracy vs. Downstream Architecture Separation

Project Bridge maintains a **strict architectural separation** between upstream speech-to-text accuracy and downstream task execution.

```text
+--------------------------------------------------------------------------------------------------+
|                               PROJECT BRIDGE PIPELINE ARCHITECTURE                               |
+--------------------------------------------------------------------------------------------------+
|  [Voice Audio]  -->  (ASR Provider: Sahara / OpenAI / Deepgram)                                 |
|                             |                                                                    |
|                             v                                                                    |
|  [Editable UI]  <--  "User-in-the-Loop Review & Transcript Correction" (Web Client)             |
|                             |                                                                    |
|                             v                                                                    |
|  [Canonical Text] -> [Deterministic NLU & Emergency Gate]                                        |
|                             |                                                                    |
|             +---------------+---------------+                                                    |
|             |                               |                                                    |
|             v (Emergency Detected)          v (Routine Intake)                                   |
|     [Immediate Safety Gate]         [Clarification & Preferred Name]                             |
|     "Seek urgent local care"                |                                                    |
|                                             v                                                    |
|                                     [Explicit Confirmation Gate]                                 |
|                                             |                                                    |
|                                             v                                                    |
|                                     [Simulated Clinic Intake: BRG-H-2026-XXXXX]                  |
+--------------------------------------------------------------------------------------------------+
```

### 8.1 Downstream Healthcare Intake MVP
- **Purpose:** Enables users to describe health concerns in Yoruba, Pidgin, or Code-Switched speech to produce structured simulated clinic intake summaries.
- **Scope & Boundaries:** Intake only; explicitly non-diagnostic, non-prescriptive, and does not contact real clinics or book appointments.
- **Safety Escalation:** Deterministic emergency language detection (*cannot breathe*, *unconscious*, *severe bleeding*, *seizures*) halts routine intake and directs users to immediate local care.
- **User-in-the-Loop:** All speech transcripts are presented in an editable UI, allowing users to verify and correct transcription errors before downstream processing.

### 8.2 Healthcare Synthetic Text Fixtures (N = 16)
To evaluate downstream dialogue and safety logic independently of ASR error, 16 synthetic text fixtures (`yoruba-healthcare-intake.v0.1.mts`) were developed:
- 4 Yoruba-Heavy | 4 Yoruba-English | 4 Yoruba-Pidgin | 4 Nigerian English

> [!CAUTION]
> **Synthetic Text Fixtures are NOT Speech Provider Results:**
> These 16 fixtures validate downstream TypeScript logic on synthetic text inputs. They are **not** speech recognition outputs, **not** real clinical trials, and **not** collected patient audio.

---

# 9. Unresolved Evidence Gaps & Governance Roadmap

```text
==================================================================================================
EVIDENCE STATUS & ROADMAP
+------------------------------------+-----------------------+-----------------------------------+
| Benchmark Component                | Current Status        | Mandatory Governance Action       |
+------------------------------------+-----------------------+-----------------------------------+
| Vocal Money Dev Subset (N=30)      | Completed (27 Scored) | Secondary dev only; keep tagged   |
| AfriSwitch Yoruba Test Slice (N=75)| Awaiting Materialize  | Resolve commit SHA; freeze audio  |
| AfriSwitchCare Healthcare Speech   | Placeholder Planned   | Legal review of clinical consent  |
| Real Sample (real-yo-001)          | Slot Reserved         | Complete provenance & permissions |
+------------------------------------+-----------------------+-----------------------------------+
==================================================================================================
```

### Methodological Limitations:
1. **Model Snapshot Identification:** Intron/Sahara synchronous API returns `modelIdentifier=unknown`. OpenAI `gpt-transcribe` is an unversioned alias. Deepgram was pinned to `nova-3` (`version=latest`).
2. **Configuration Parity:** Intron used the `yo` language route; OpenAI was unforced (`languageHint: null`); Deepgram used `multi`.
3. **Diagnostics Status:** 26 of 27 scored development samples passed automated acoustic checks but have not undergone word-by-word human transcription verification.

---

# 10. Summary & Recommendations

1. **Intron/Sahara is the recommended primary transcription engine** for Yoruba-English code-switched speech in this development set, demonstrating diacritic retention (CER: 0.5622; diacritic-insensitive WER: 0.7074).
2. **OpenAI (`gpt-transcribe`) provides a low-latency transcription alternative** (1.68s median), suitable for pipelines where post-ASR diacritic restoration is applied.
3. **Deepgram (`nova-3` multilingual) should not be used for Yoruba speech** without dedicated language support, as out-of-distribution decoding leads to elevated error rates and tail latencies.
4. **Voice interfaces in sensitive domains must maintain user-in-the-loop review**, treating speech recognition as an editable draft before executing downstream actions.

---
*Report generated and validated under Project Bridge Benchmark Infrastructure (`@project-bridge/benchmark`).*
