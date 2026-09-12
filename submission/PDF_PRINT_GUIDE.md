# Project Bridge: 3-Page Benchmark Report PDF Print Guide

This document outlines the pagination and rendering structure for generating a compact, judge-ready 3-page PDF from `BENCHMARK_REPORT.md`.

---

## Page Layout Specification

- **Page 1: Benchmark Setup, Methodology & Experimental Configurations**
  - Section 1: Executive Summary & Benchmark Purpose
  - Section 2: Dataset, Preprocessing & Quality Review Policy
  - Section 3: Provider Configurations & Normalization Profiles

- **Page 2: Results, Latency Distributions & Qualitative Analysis**
  - Section 4: Primary Benchmark Results (Table 1 & Table 2)
  - Section 5: Stratified Analysis Across Code-Mixing Index (CMI) (Table 3 & Diacritic Gap)
  - Section 6: Qualitative Error Analysis & Representative Transcripts (Cases 1, 2, 3)

- **Page 3: Product Downstream Behavior, Limitations & Governance Roadmap**
  - Section 7: Speech Accuracy vs. Downstream Architecture Separation (Architecture Diagram & Healthcare Intake MVP)
  - Section 8: Unresolved Evidence Gaps & Governance Roadmap (Table & Methodological Limitations)
  - Section 9: Conclusion & Provider Recommendations

---

## How to Render / Print to PDF

Using Chrome, VS Code Markdown PDF, or Pandoc:
```bash
# Using Pandoc with wkhtmltopdf / weasyprint / xelatex:
pandoc BENCHMARK_REPORT.md -o benchmark_report_3page.pdf \
  --pdf-engine=xelatex \
  -V geometry:margin=0.6in \
  -V fontsize=9.5pt
```

In modern browsers or Markdown viewers:
1. Open `BENCHMARK_REPORT.md` in preview mode.
2. Select **Print** $\rightarrow$ **Save as PDF**.
3. Set Paper Size to **Letter** or **A4**, Margins to **Narrow (0.5 in)**, and enable **Background Graphics**.
4. The document includes explicit `\newpage` directives to ensure a clean 3-page distribution.
