# Project Bridge: Video Demo Shot List & Execution Guide

---

```text
==================================================================================================
RECORDING PREFLIGHT CHECKLIST
Camera / Mic:       1080p WebCam / Dedicated Condenser Microphone (48kHz/24bit)
Environment:        Clean browser window (Chrome 1280x720 or 1920x1080), DevTools closed
Local Server:       pnpm dev running (API on :3000, Web on :5173 with INTRON_API_KEY set)
Backup Fixtures:    evaluation/fixtures/ ready for fast copy-paste if live network drops
Target Duration:    4 minutes 30 seconds to 4 minutes 45 seconds (Hard cap: 5:00)
==================================================================================================
```

---

## Comprehensive Shot List

| # | Timestamp | Screen / State | User / Presenter Action | Spoken Narration Summary | Expected UI State / Result | Backup / Fallback Plan |
|---|:---:|---|---|---|---|---|
| **1** | `0:00 - 0:35` | Title Slide / Web App Home Screen | Presenter on camera; transition to clean UI | Introduce linguistic code-switching barrier in digital health; introduce Project Bridge | Landing page visible; microphone button prominent; clear layout | Show slide 1 if browser takes time to load |
| **2** | `0:35 - 1:00` | Recording Active State | Click **"Record Voice"**; speak: *"Mo ti ni headache lati ana and my body dey hot. I want see doctor."*; click **"Stop"** | Explain spoken phrase mix (Yoruba + English + Pidgin); explain Sahara integration | Pulse animation while recording; transition to "Transcribing with Sahara..." spinner | If mic permission fails, use audio upload fixture |
| **3** | `1:00 - 1:20` | Transcript Review State | Point cursor to generated text card | Explain Sahara's handling of code-switched Yoruba grammar and English clinical words | Transcript displayed in editable textarea: *"Mo ti ni headache lati ana and my body dey hot. I want see doctor."* | If ASR drops a word, demonstrate editing it live |
| **4** | `1:20 - 1:45` | Transcript Editing Demonstration | Click into textarea, briefly edit or re-verify text; click **"Continue"** | Explain architectural importance of user-in-the-loop review before downstream actions | Text remains highlighted; button triggers transition to conversation state | Proceed directly to continue if text is already perfect |
| **5** | `1:45 - 2:10` | Conversation Flow State | Scroll slightly to show parsed fields in dialogue bubble | Explain deterministic slot extraction (symptoms, duration) without open-ended medical hallucination | Assistant outputs parsed symptom list (*headache*, *feeling hot*) and duration (*lati ana*) | If API delays, show conversational bubble |
| **6** | `2:10 - 2:35` | Preferred Name Prompt | Type or speak: *"Tomiwa"* into input field; submit | Explain privacy minimization (optional nickname/first name only, no sensitive national IDs) | Assistant acknowledges name: *"Thanks, Tomiwa."* and generates proposal summary | Type "skip" if demonstrating skippable path |
| **7** | `2:35 - 3:00` | Non-Diagnostic Proposal State | Hover over proposal card | Explain that summary reflects only user-stated facts and explicitly disclaims diagnosis | Structured card displays: Reported Symptoms, Reported Duration, Service Requested | Visual card layout renders cleanly |
| **8** | `3:00 - 3:20` | Explicit Confirmation Gate | Click **"Confirm & Submit Intake"** button | Explain that consequential actions require affirmative confirmation | Confirmation button states change to processing | Proceed smoothly to success card |
| **9** | `3:20 - 3:45` | Intake Reference Created | Point to green success banner and Reference ID | Explain simulated record creation (`BRG-H-2026-XXXXX`) and non-clinical boundary disclaimer | Reference ID `BRG-H-2026-XXXXX` displayed with clear "No real clinic contacted" notice | Refresh page for emergency demo |
| **10** | `3:45 - 4:15` | Emergency Escalation Demo | Click **"New Intake"**; type or speak: *"I cannot breathe, I need emergency help"* | Explain narrow deterministic emergency escalation boundary that halts routine intake for acute life threats | Emergency banner appears immediately with urgent local care instructions | Type text directly for rapid demonstration |
| **11** | `4:15 - 4:35` | Benchmark Slide / Screen | Switch tab to Benchmark Summary Slide or `BENCHMARK_REPORT.md` | Highlight 30-sample Vocal Money benchmark, 100% call reliability, Sahara Strict WER 0.8864 vs. OpenAI vs. Deepgram | Clean comparison table visible on screen | Show PDF viewer with Table 1 and Table 2 |
| **12** | `4:35 - 4:45` | Conclusion Slide / Camera | Presenter on camera; display GitHub repo URL | Summarize mission: combining specialized African speech models with safe agentic design | Closing slide with Project Bridge links and team attribution | End recording cleanly at ~4:45 |

---

## One-Take / Two-Take Optimization Strategy

1. **Pre-populate Session:** Open two browser tabs before starting:
   - **Tab 1:** Active web client for live voice demonstration (`http://localhost:5173`).
   - **Tab 2:** Benchmark comparison slide or PDF summary.
2. **Audio Setup:** Set microphone gain so vocal volume is clear and ambient room noise is minimal.
3. **Pacing:** Keep narration brisk and conversational; avoid long pauses during network round-trips by narrating the architecture during processing states.
