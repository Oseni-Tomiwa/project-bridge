# Project Bridge: Benchmark Tables & Verified Metrics
## Evaluation Artifact: STT Benchmark on Yoruba-English Code-Switched Speech

This document compiles the complete verified numeric tables generated during the Project Bridge ASR evaluation run (`vocal-money-dev-30-v1`).

---

### Table 1: Primary Strict Normalized Accuracy Metrics & Reliability
*Primary Accuracy Scored Set: N = 27 samples/provider; Total Executed: N = 30 calls/provider*
*Scoring Policy: `yoruba-strict@0.1` (Diacritic & Tone-Preserving, NFC Normalized, Punctuation Stripped)*

| Provider | Provider Configuration ID | Model Identifier | Executed Calls | Provider Call Failures | Accuracy Scored Samples | Strict WER | Strict CER | Diacritic-Insensitive WER |
|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Intron / Sahara** | `intron-sahara-sync-yo-v1` | `unknown` (Sahara ASR Engine) | 30 | 0 / 30 (0.0%) | 27 | **0.8864** | **0.5622** | **0.7074** |
| **OpenAI** | `openai-transcribe-gpt-transcribe-v1` | `gpt-transcribe` | 30 | 0 / 30 (0.0%) | 27 | **0.9105** | **0.6199** | **0.8153** |
| **Deepgram** | `deepgram-prerecorded-nova-3-multi-smart-format-off-v1` | `nova-3` (`version=latest`) | 30 | 0 / 30 (0.0%) | 27 | **0.9645** | **0.7690** | **0.9645** |

---

### Table 2: Diacritic Sensitivity Analysis Metrics (N = 27 Scored Samples)
*Scoring Policy: `yoruba-diacritic-insensitive-analysis@0.1` (Tone Marks Stripped, Subdots Preserved)*

| Provider | Model Identifier | Strict WER | Diacritic-Insensitive WER | Absolute WER Reduction ($\Delta$) | Strict CER |
|:---|:---|:---:|:---:|:---:|:---:|
| **Intron / Sahara** | `unknown` | 0.8864 | **0.7074** | -0.1790 (-17.90%) | 0.5622 |
| **OpenAI** | `gpt-transcribe` | 0.9105 | **0.8153** | -0.0952 (-9.52%) | 0.6199 |
| **Deepgram** | `nova-3` | 0.9645 | **0.9645** | 0.0000 (0.00%) | 0.7690 |

---

### Table 3: Execution Latency Distribution (N = 30 Successful Calls / Provider, Monotonic Clock)

| Provider | Successful Calls | Call Success Rate | Mean Latency | Median (p50) | p95 Latency | Min Latency | Max Latency |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **OpenAI** | 30 | 100% (30/30) | **1,785.29 ms** | **1,688.02 ms** | **3,251.83 ms** | **723.40 ms** | **3,607.05 ms** |
| **Intron / Sahara** | 30 | 100% (30/30) | **3,050.18 ms** | **2,577.19 ms** | **4,882.88 ms** | **1,808.03 ms** | **11,680.18 ms** |
| **Deepgram** | 30 | 100% (30/30) | **2,972.57 ms** | **1,829.92 ms** | **9,693.73 ms** | **618.31 ms** | **18,384.16 ms** |

---

### Table 4: Sampling Stratification by Code-Mixing Index (CMI) Buckets (N = 30 Materialized / N = 27 Scored Samples)

| CMI Stratification Bucket | Numeric CMI Range | Materialized Samples | Scored Samples | Held Samples |
|:---|:---|:---:|:---:|:---:|
| **Low CMI** | CMI < 10.0 | 10 | 9 | 1 |
| **Medium CMI** | 10.0 $\le$ CMI $\le$ 25.0 | 10 | 9 | 1 |
| **High CMI** | CMI > 25.0 | 10 | 9 | 1 |
| **Total** | — | 30 | 27 | 3 |

---

### Table 5: Audio Quality Review & Scoring Dispositions (N = 30 Total Materialized Samples)

| Scoring Set Identity | Sample Count | Inclusion Criteria | Sahara Evaluated | OpenAI Evaluated | Deepgram Evaluated | Status Description |
|:---|:---:|:---|:---:|:---:|:---:|:---|
| `all-successful-results` | 30 | All successful API calls | 30 | 30 | 30 | Full execution matrix (90 calls) |
| `scored-development` | **27** | Usable + Diagnostics-Passed | **27** | **27** | **27** | **Primary benchmark scoring set** |
| `manually-confirmed-usable` | 1 | Human listening passed | 1 (`as_178`) | 1 (`as_178`) | 1 (`as_178`) | Manually verified despite clipping flag |
| `diagnostics-passed-unreviewed` | 26 | Automated WAV diagnostics passed | 26 | 26 | 26 | Non-flagged automated audio |
| *Held uncertain samples* | 3 | Flagged as unintelligible | 3 | 3 | 3 | `as_076`, `as_080`, `as_130` (held out) |
| *Excluded unusable samples* | 0 | Corrupted audio | 0 | 0 | 0 | None in current slice |

---

### Table 6: Audio Quality Diagnostic Audit Details

| Sample ID | Manifest Duration | Measured WAV Duration | Automated Diagnostic Flag | Manual Review Status | Reason Recorded | Scoring Disposition |
|:---|:---:|:---:|:---|:---|:---|:---|
| `vocal-money-as_076` | 3.34 s | 10.032 s | `duration-metadata-mismatch` | Completed manual | `unintelligible` | **Held (uncertain)** |
| `vocal-money-as_080` | 6.28 s | 18.852 s | `duration-metadata-mismatch` | Completed manual | `unintelligible` | **Held (uncertain)** |
| `vocal-money-as_130` | 6.30 s | 18.912 s | `duration-metadata-mismatch` | Completed manual | `unintelligible` | **Held (uncertain)** |
| `vocal-money-as_178` | 1.88 s | 1.880 s | `excessive-clipping` (~3.3397%) | Completed manual | Confirmed intelligible speech | **Included (manual-usable)** |

---

### Table 7: Evaluated Provider Technical Configuration Snapshots

| Attribute | Intron / Sahara Synchronous | OpenAI Transcriptions | Deepgram Prerecorded Listen |
|:---|:---|:---|:---|
| **API Endpoint** | `https://infer.voice.intron.io/file/v1/upload/sync` | `https://api.openai.com/v1/audio/transcriptions` | `https://api.deepgram.com/v1/listen` |
| **HTTP Method** | `POST` (`multipart/form-data`) | `POST` (`multipart/form-data`) | `POST` (binary body with `Content-Type`) |
| **Authentication** | `Authorization: Bearer <INTRON_API_KEY>` | `Authorization: Bearer <OPENAI_API_KEY>` | `Authorization: Token <DEEPGRAM_API_KEY>` |
| **Model Configuration** | Unexposed sync model | `gpt-transcribe` | `nova-3` (`version=latest`) |
| **Language Setting** | `use_language_asr_input=yo` | `languageHint: null` (unforced) | `language=multi` |
| **Formatting / Post-processing** | Provider default | Provider JSON response | `smart_format=false`, `detect_language=false` |
| **Retry Policy** | Single attempt (0 automatic retries) | Single attempt (0 automatic retries) | Single attempt (0 automatic retries) |
| **Timeout Policy** | 60,000 ms client abort | 60,000 ms client abort | 60,000 ms client abort |
| **Byte-Identical Input** | 16 kHz Mono PCM16 WAV | 16 kHz Mono PCM16 WAV | 16 kHz Mono PCM16 WAV |
| **Distribution Status** | In-distribution (Yoruba-English route) | General multilingual | Out-of-distribution (Yoruba unsupported) |

---
*Generated by Project Bridge STT Evaluation Framework.*
