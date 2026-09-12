# Project Bridge: Final Submission Checklist

---

```text
==================================================================================================
CHALLENGE SUBMISSION DEADLINE READINESS
Target Date:         September 2026 (< 48 Hours Remaining)
Project Codename:    Project Bridge
Branch Target:       release/submission-assets -> main
Challenge:           Sahara CodeSwitch Africa Challenge
==================================================================================================
```

---

## 1. Codebase & Repository Hygiene
- [ ] **Clean Git Working Tree:** All submission assets placed in `submission/`; no temporary uncommitted scratch files.
- [ ] **No Committed Secrets:** Verify `.env`, API keys (`INTRON_API_KEY`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`), and bearer tokens are absent from Git history.
- [ ] **Branch Merge Readiness:** Merge `release/benchmark-report` and `release/submission-assets` into `main` clean without merge conflicts.
- [ ] **Repository Visibility:** Confirm the GitHub repository visibility is set to **Public** (or appropriately shared with challenge evaluators).

---

## 2. Live Application & Cloud Deployment
- [ ] **Deployment Environment:** Verify live deployment on Railway (or chosen cloud hosting) for both API (`apps/api`) and Web (`apps/web`).
- [ ] **Environment Variables on Staging:** Confirm `INTRON_API_KEY`, `INTRON_STT_BASE_URL`, `INTRON_STT_LANGUAGE=yo`, and `PORT` are configured in production environment.
- [ ] **Live Smoke Test:** Perform an end-to-end voice test on the deployed URL to verify mic capture, Sahara transcription, editable review, and simulated intake generation.
- [ ] **Text Fallback Verification:** Verify that typed keyboard entry functions reliably on staging without microphone permissions.

---

## 3. Video Demonstration (Hard Cap: 5 Minutes)
- [ ] **Strict Duration Check:** Confirm total video duration is strictly $\le 5\text{ minutes}$ (recommended: 4:30 – 4:45).
- [ ] **Code-Switching Visibly Demonstrated:** Spoken audio explicitly demonstrates intra-sentential Yoruba-English code-switching (*"Mo ti ni headache lati ana and my body dey hot. I want see doctor."*).
- [ ] **Sahara Integration Highlighted:** Sahara API call, transcription result, and latency metadata are clearly visible.
- [ ] **Key Flows Covered:**
  - [ ] User-in-the-loop transcript editing
  - [ ] Non-diagnostic symptom/duration extraction
  - [ ] Optional preferred name step
  - [ ] Explicit confirmation gate
  - [ ] Simulated intake reference (`BRG-H-2026-XXXXX`)
  - [ ] Narrow deterministic emergency escalation boundary (*"cannot breathe"*)
  - [ ] Empirical benchmark comparison table
- [ ] **Audio/Video Quality:** 1080p resolution, crisp voice audio, no background hum, no private screen clutter.
- [ ] **YouTube / Video Hosting:** Upload video to YouTube with visibility set to **Unlisted** or **Public**, and verify link plays back cleanly in an incognito window.

---

## 4. Benchmark Technical Report (Hard Cap: 3 Pages)
- [ ] **Page Count Enforcement:** Ensure `submission/BENCHMARK_REPORT.md` renders to exactly $\le 3\text{ pages}$ in PDF format.
- [ ] **Verified Headline Metrics:**
  - [ ] Sahara: Strict WER `0.8864`, Strict CER `0.5622`, Diacritic-Insensitive WER `0.7074`
  - [ ] OpenAI: Strict WER `0.9105`, Strict CER `0.6199`, Diacritic-Insensitive WER `0.8153`
  - [ ] Deepgram: Strict WER `0.9645`, Strict CER `0.7690`, Diacritic-Insensitive WER `0.9645`
- [ ] **Population Disambiguation:**
  - [ ] Executed calls: $30\text{ calls / provider}$ ($0/30$ failures)
  - [ ] Accuracy-scored set: $27\text{ samples / provider}$ ($3\text{ held out}$)
  - [ ] Latency population: $N = 30\text{ successful calls / provider}$
- [ ] **Deepgram Caveat:** Deepgram explicitly noted as out-of-distribution baseline for Yoruba.
- [ ] **Held Clips Documented:** Exact manifest/WAV durations for `as_076`, `as_080`, and `as_130` documented.

---

## 5. Submission Form & Copy
- [ ] **Form Answers Prepared:** Text copied directly from `submission/form-answers.md`.
- [ ] **Character/Word Count Check:** Ensure Problem (~50w), Users (~50w), Solution (~50w), Task (~50w), Tech Overview (~250w), and Ethics (~100w) comply with form limits.
- [ ] **No Unsupported Claims:** 
  - [ ] No claim of clinical diagnosis, treatment, or prescribing.
  - [ ] No claim of real hospital integration or real appointment booking.
  - [ ] No claim of clinical validation trials or user cohort statistics.
  - [ ] No claim of definitive global model rankings.
- [ ] **Links Tested:** Test all GitHub repository links, video URLs, and live app URLs from an unauthenticated browser session.
