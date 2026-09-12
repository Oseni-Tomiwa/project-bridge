# Project Bridge: Qualitative Error Observations & Quality Review Audit
## STT Provider Behavior on Yoruba-English Code-Switched Speech

---

## 1. Provider Error Patterns on Yoruba-English Speech

Analysis of provider outputs across the 27 scored development samples demonstrates distinct error patterns:

### 1.1 Intron/Sahara (`yo` Route)
- **Strengths:** 
  - Designed specifically for Yoruba-English code-switched audio.
  - Generates Yoruba tonal diacritics (acute and grave marks) and subdots (`ẹ`, `ọ`, `ṣ`).
  - Achieves the lowest Strict WER (0.8864), Strict CER (0.5622), and Diacritic-Insensitive WER (0.7074).
- **Observed Challenges:**
  - Occasional substitution between standard Yoruba vocabulary and spoken English loanwords (e.g., standard Yoruba *àkọ́ọ́lẹ̀* vs. colloquial *account*).

### 1.2 OpenAI (`gpt-transcribe`)
- **Strengths:**
  - Fast execution latency (median: 1,688.02 ms; $p_{95}$: 3,251.83 ms).
  - High fidelity on English lexical tokens and numbers.
  - Good phonetic capture of Yoruba word sequences.
- **Observed Challenges:**
  - Omits Yoruba tone diacritics and subdots in standard transcription mode.
  - Diacritic absence causes high Strict WER (0.9105) under `yoruba-strict@0.1`, which drops to 0.8153 when tone marks are removed under `yoruba-diacritic-insensitive-analysis@0.1`.

### 1.3 Deepgram (`nova-3` Multilingual)
- **Strengths:**
  - Standard fast transcription for supported global languages.
- **Observed Challenges:**
  - **Out-of-Distribution Baseline:** Yoruba is not an officially supported language in Nova-3 multilingual mode.
  - In the absence of a Yoruba acoustic/language model, the decoder substitutes English phonetic approximations for Yoruba utterances.
  - Decoding unsupported phonemes results in elevated tail latency ($p_{95}$: 9,693.73 ms; max: 18,384.16 ms) and a Strict WER of 0.9645.

---

## 2. Audio Quality Review Audit & Held Clips

Audio quality governance is recorded in `evaluation/reviews/vocal-money-audio-quality.v0.1.json`. The review protocol specifies that `usable` clips are included, `unusable` clips are excluded, and `uncertain` clips are held for review.

```text
+--------------------+-------------------+--------------------+----------------------------+-------------------------------------------------------------+---------------------+
| Sample ID          | Manifest Duration | Measured Duration  | Diagnostic Flag            | Recorded Review Note                                        | Scoring Disposition |
+--------------------+-------------------+--------------------+----------------------------+-------------------------------------------------------------+---------------------+
| vocal-money-as_076 | 3.34 s            | 10.032 s           | duration-metadata-mismatch | Speech is not sufficiently clear for confident human        | Held (uncertain)    |
|                    |                   |                    |                            | verification.                                               |                     |
| vocal-money-as_080 | 6.28 s            | 18.852 s           | duration-metadata-mismatch | Speech is not sufficiently clear for confident human        | Held (uncertain)    |
|                    |                   |                    |                            | verification.                                               |                     |
| vocal-money-as_130 | 6.30 s            | 18.912 s           | duration-metadata-mismatch | Speech is not sufficiently clear for confident human        | Held (uncertain)    |
|                    |                   |                    |                            | verification.                                               |                     |
| vocal-money-as_178 | 1.88 s            | 1.880 s            | excessive-clipping         | Human listening confirmed intelligible speech despite       | Included (usable)   |
|                    |                   |                    | (~3.3397%)                 | automated clipping flag.                                    |                     |
+--------------------+-------------------+--------------------+----------------------------+-------------------------------------------------------------+---------------------+
```

### Review Methodology & Governance Notes:
- **Review Method:** Single manual reviewer using human listening (`completed-manual`, `human-listening`, reviewed on 2026-09-09).
- **Holding Policy:** Samples `as_076`, `as_080`, and `as_130` are held out of the primary 27-sample `scored-development` aggregate to prevent penalizing ASR models on audio where ground-truth reference alignment cannot be verified by human listening.
- **Audit Preservation:** All 30 executions (including the 3 held clips) remain fully preserved in the `all-successful-results` aggregate.

---
*Documented under Project Bridge Benchmark Infrastructure.*
