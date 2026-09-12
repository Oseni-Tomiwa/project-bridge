# Project Bridge: Benchmark & Evaluation Submission Directory

Welcome to the **Project Bridge Evaluation & Benchmark Submission Package** for the Sahara CodeSwitch Africa Challenge.

---

## Package Contents & Manifest

This directory contains the verified benchmark report and technical evidence for Project Bridge's Speech-to-Text (STT) evaluation on Yoruba-English code-switched speech:

1. **[`BENCHMARK_REPORT.md`](./BENCHMARK_REPORT.md)**: The core 3-page judge-ready benchmark report covering methodology, experimental setup, provider configurations, strict vs. sensitivity metrics, latency distributions, downstream architecture separation, and research roadmap.
2. **[`TABLES.md`](./TABLES.md)**: Complete standalone verified metric tables (strict WER/CER, diacritic sensitivity, latency percentiles, CMI breakdowns, quality review sets, and provider configuration snapshots).
3. **[`QUALITATIVE_EXAMPLES.md`](./QUALITATIVE_EXAMPLES.md)**: In-depth qualitative error analysis, non-cherry-picked transcript comparisons across CMI strata, and detailed explanations of held-out clips.
4. **[`PDF_PRINT_GUIDE.md`](./PDF_PRINT_GUIDE.md)**: Formatting specification and instructions for rendering `BENCHMARK_REPORT.md` to a 3-page PDF.

---

## Summary of Verified Benchmark Results

```text
==================================================================================================
SUMMARY OF VERIFIED BENCHMARK EVIDENCE
--------------------------------------------------------------------------------------------------
Provider Execution:     30 calls/provider (90 total executed requests; 0 failures, 100% success)
Accuracy Scored Set:    27 samples/provider (3 held out due to human-verified unintelligibility)
Latency Population:     Calculated over all N = 30 successful calls/provider
--------------------------------------------------------------------------------------------------
Provider        Configured Model      Strict WER   Strict CER   Diacritic-Free WER   Median Latency
Intron/Sahara   Sahara Engine (yo)    0.8864       0.5622       0.7074               2,577.19 ms
OpenAI          gpt-transcribe        0.9105       0.6199       0.8153               1,688.02 ms
Deepgram        nova-3 (multi, OOD)   0.9645       0.7690       0.9645               1,829.92 ms
==================================================================================================
```

---

## Reproducibility & Source Verification

All metrics are programmatically computed by the `@project-bridge/benchmark` package using versioned normalization profiles (`yoruba-strict@0.1` and `yoruba-diacritic-insensitive-analysis@0.1`).

To inspect or run the metric aggregation pipeline locally:
```bash
# Run automated benchmark and metric aggregation tests
pnpm --filter @project-bridge/evaluation test

# Run metric aggregation on raw run output
pnpm --filter @project-bridge/evaluation metrics:stt \
  --run-dir results/stt/vocal-money-dev-30-v1 \
  --review-file reviews/vocal-money-audio-quality.v0.1.json
```

---
*Project Bridge — Sahara CodeSwitch Africa Challenge Submission.*
