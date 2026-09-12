# Project Bridge: Executive Project Summary

---

## 1. Problem Framing
Digital healthcare navigation and public services in multilingual African nations predominantly rely on typed, formal, monolingual English interfaces. However, large segments of the population communicate most comfortably through natural code-switching between indigenous languages and English. Individuals with limited digital literacy, motor constraints, or colloquial language habits face steep friction when attempting to document symptoms, request clinical assistance, or navigate clinic intake forms.

---

## 2. Why Voice & Code-Switching?
- **Voice as an Equalizer:** Speaking eliminates the barrier of complex keyboards, orthographic spelling uncertainty, and rigid form layouts.
- **Linguistic Reality:** In urban and regional Nigeria, daily conversation is inherently code-switched (Yoruba-English code-switching / Pidgin). Standard monolingual speech systems either fail to parse alternating language boundaries or misinterpret indigenous vocabulary as phonetic English homophones. Specialized African speech technology is essential to bridge this gap.

---

## 3. Why Healthcare Intake?
Healthcare intake represents a high-impact, entry-level clinical touchpoint. It bridges the gap between a patient’s raw, unstructured concern and a structured summary prepared for human clinician triage. 
Crucially, intake is **not diagnosis**:
- It structures what the patient said (symptoms, duration, service requested).
- It applies a narrow deterministic emergency escalation boundary for urgent red flags.
- It prepares a clean draft for qualified human healthcare workers without making unverified clinical judgments.

---

## 4. What Makes Project Bridge Agentic?
Project Bridge is not a passive speech-to-text dictation box; it executes a multi-step, goal-directed task:
1. **Understands & Extracts:** Parses unstructured natural language into structured symptom and duration slots.
2. **Clarifies Missing Details:** Identifies missing vital context (e.g., symptom duration) and initiates clarifying dialogue loops.
3. **Applies Safety Boundary:** Evaluates a narrow deterministic emergency escalation boundary to immediately halt routine intake upon detecting life-threatening language (*cannot breathe*, *unconscious*, *severe bleeding*).
4. **Executes Consequential Action:** Prepares an immutable, idempotent simulated clinic intake record with reference ID `BRG-H-2026-XXXXX` following explicit user confirmation.

---

## 5. The Critical Role of User-in-the-Loop Review
State-of-the-art ASR on African code-switched speech exhibits real-world error rates exceeding 70% under strict orthographic evaluation. In critical domains like healthcare, feeding raw, unverified ASR output directly to autonomous agents creates unacceptable risks of hallucinated symptoms or lost clinical context. Project Bridge enforces an **editable review interface**, allowing users to visually inspect and correct transcripts before any downstream action is triggered.

---

## 6. Benchmark Evidence Summary
Project Bridge evaluated three leading speech recognition engines across 30 Yoruba-English code-switched samples from the Vocal Money dataset:
- **Intron/Sahara (`yo` route):** Achieved the lowest Strict Word Error Rate (0.8864) and Strict Character Error Rate (0.5622). Its diacritic-insensitive WER dropped to 0.7074, confirming capability in capturing Yoruba orthography.
- **OpenAI (`gpt-transcribe`):** Provided high throughput and lowest latency (median: 1,688.02 ms; $p_{95}$: 3,251.83 ms), but omitted Yoruba diacritics (Strict WER: 0.9105; Diacritic-Insensitive WER: 0.8153).
- **Deepgram (`nova-3` multilingual):** Evaluated as an out-of-distribution baseline (Yoruba unsupported), resulting in 0.9645 Strict WER and elevated tail latency ($p_{95}$: 9,693.73 ms).
- **Reliability:** 100% provider call completion across all 90 executed requests (0 failures).

---

## 7. Methodological Limitations & Governance Boundaries
1. **Secondary Development Benchmark:** Vocal Money is a secondary development dataset ($N=27$ scored development samples after holding 3 unintelligible clips); it is not the primary 75-sample AfriSwitch challenge benchmark.
2. **Unreviewed Diagnostic Samples:** 26 of 27 scored development clips passed automated signal diagnostics but have not been audited word-by-word by human linguists.
3. **Simulated Actions:** The current intake action is an in-memory simulation; no live electronic medical record (EMR) or hospital system is contacted.
4. **Synthetic Downstream Fixtures:** The 16 synthetic healthcare evaluation fixtures are synthetic text test cases, not empirical speech-provider task-completion runs.

---

## 8. Future Roadmap
- **AfriSwitch Challenge Benchmark:** Materialize and score the frozen 75-sample AfriSwitch Yoruba test split once source revision and governance gates are approved.
- **AfriSwitchCare Evaluation:** Explore clinical code-switching speech robustness.
- **Post-ASR Diacritic Restoration:** Integrate lightweight Yoruba tone-restoration models to enhance downstream semantic comprehension.
- **Low-Bandwidth Mobile Client:** Package the interface for lightweight web and USSD/telephony integration across regional health posts.
