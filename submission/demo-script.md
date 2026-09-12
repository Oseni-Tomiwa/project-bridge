# Project Bridge: 5-Minute Video Demonstration Script

---

```text
==================================================================================================
VIDEO SPECIFICATIONS
Target Duration:     4:30 – 4:45 (Strict hard cap: 5:00)
Presenter:           Product & Technical Lead
Platform / Screen:   Project Bridge Web UI (apps/web) running locally or on staging
Resolution:          1080p (1920x1080) at 60fps / Clear Audio Narration
Primary Audio Sample: "Mo ti ni headache lati ana and my body dey hot. I want see doctor."
==================================================================================================
```

---

## Script Breakdown & Timeline

### 0:00 – 0:35 | Problem Framing & Project Vision
* **Visual:** Title slide / Camera on presenter + Screen showing the clean Project Bridge landing page.
* **Narration:**
  > "Hello, judges. Across Africa, millions of people communicate by naturally code-switching between indigenous languages and English. Yet almost every digital public service demands typed, formal English forms. For individuals with limited literacy, typing difficulty, or conversational language habits, this creates a major barrier to healthcare access.
  > 
  > Welcome to **Project Bridge**, a voice-first access layer that enables users to speak naturally in Yoruba, Nigerian English, Pidgin, or code-switching, verify what was heard, and generate structured clinic intake requests safely."

---

### 0:35 – 1:00 | User Speaks a Code-Switched Request
* **Visual:** Close-up on the web UI. Presenter clicks the large microphone button (Record Voice).
* **Action:** Presenter speaks clearly:
  > *"Mo ti ni headache lati ana and my body dey hot. I want see doctor."*
* **Narration (during processing):**
  > "I just spoke a realistic, intra-sententially code-switched sentence in Yoruba, Nigerian English, and Pidgin: *'Mo ti ni headache lati ana and my body dey hot. I want see doctor.'* The audio is sent directly to our API using Sahara’s Yoruba-English code-switched speech route."

---

### 1:00 – 1:20 | Sahara Transcription Appears
* **Visual:** The web UI displays the transcription result with latency metadata.
* **Narration:**
  > "Sahara processes the audio synchronously, capturing Yoruba verb phrases like *'Mo ti ni'* and time markers like *'lati ana'*, alongside English clinical terms like *'headache'* and Pidgin phrasing *'my body dey hot'*."

---

### 1:20 – 1:45 | User-in-the-Loop Review & Editable Transcript
* **Visual:** Presenter clicks into the transcript field, highlights the text, and demonstrates that it is fully editable.
* **Narration:**
  > "Because code-switched speech recognition carries natural acoustic variability, Project Bridge enforces a strict **user-in-the-loop** architecture. We never send raw ASR hypotheses directly to downstream actions. The user can review, edit, or type corrections immediately before continuing."

---

### 1:45 – 2:10 | Deterministic Healthcare Intake Interpretation
* **Visual:** Presenter clicks **"Continue"**. The system transitions to the conversation view and extracts reported fields.
* **Narration:**
  > "Bridge parses the user-approved text using deterministic extraction rules. Notice what it does—and what it doesn't do:
  > - It extracts the reported symptoms: *headache*, *feeling hot*.
  > - It preserves the duration: *lati ana* (since yesterday).
  > - It identifies the requested service: *see a clinician*.
  > Crucially, it does **not** diagnose, suggest malaria or migraine, or prescribe medication."

---

### 2:10 – 2:35 | Optional Preferred-Name Step
* **Visual:** Bridge asks: *"Before I prepare your intake, what should I call you? You can give me just your first name or a nickname, or say skip."*
* **Action:** Presenter types or speaks *"Tomiwa"*.
* **Narration:**
  > "To respect user privacy and data minimization, Bridge only asks for an optional preferred first name or nickname. It does not demand national IDs, dates of birth, or home addresses. The user can easily say 'skip'."

---

### 2:35 – 3:00 | Non-Diagnostic Summary
* **Visual:** Bridge displays the structured proposal summary.
* **Narration:**
  > "Bridge presents a clean summary:
  > *'You reported: Symptoms: headache, feeling hot. Duration: lati ana. Requested service: see a clinician. This summarizes your words and is not a diagnosis. Do you confirm?'*
  > The user sees exactly what will be recorded."

---

### 3:00 – 3:20 | Explicit Confirmation Gate
* **Visual:** Presenter clicks the **"Confirm & Create Intake"** button.
* **Narration:**
  > "No consequential state transition occurs without explicit user confirmation. This prevents accidental submissions and ensures patient agency."

---

### 3:20 – 3:45 | Simulated Intake Reference Created
* **Visual:** Success card appears showing Reference ID: `BRG-H-2026-XXXXX` and clear boundary disclaimer.
* **Narration:**
  > "The simulated clinic intake is created with an immutable reference: `BRG-H-2026-78492`. The UI clearly states: *'This is a simulated intake request for clinician review. No clinic was contacted and no appointment was booked.'*"

---

### 3:45 – 4:15 | Narrow Deterministic Emergency Escalation Boundary
* **Visual:** Presenter starts a new session, enters text/voice: *"Mi ò lè mí, mo nilo iranwọ pajawiri bayi."* or *"I cannot breathe."*
* **Narration:**
  > "Safety is central to Bridge. If a user states a life-threatening emergency like *'I cannot breathe'* or *'Mi ò lè mí'*, the routine intake immediately halts. Bridge triggers a narrow deterministic emergency escalation boundary, bypassing intake creation to direct the user to seek immediate local emergency medical assistance."

---

### 4:15 – 4:35 | Empirical STT Benchmark Slide
* **Visual:** Benchmark comparison slide / Table on screen.
* **Narration:**
  > "Behind Bridge is an empirical STT benchmark across 30 Yoruba-English code-switched samples from the Vocal Money dataset across 3 providers:
  > - **Intron/Sahara** achieved the best Strict WER of 0.8864 and CER of 0.5622, demonstrating strong Yoruba diacritic retention.
  > - **OpenAI (`gpt-transcribe`)** had the fastest median latency (1.68 seconds) but omitted Yoruba tone marks.
  > - **Deepgram (`nova-3` multi)** proved out-of-distribution on Yoruba, with elevated tail latency.
  > All 90 provider calls succeeded with zero call failures."

---

### 4:35 – 4:45 | Closing Impact Statement
* **Visual:** Presenter camera / GitHub repository URL and Project Bridge logo.
* **Narration:**
  > "Project Bridge demonstrates that combining specialized African speech models like Sahara with deterministic safety gates and user-in-the-loop design creates a practical, dignifying, and safe voice-first access layer for multilingual communities. Thank you!"

---

## Fallback & Recording Contingency Strategy

If live microphone capture or network latency fluctuates during recording:
1. **Fallback Option A (Pre-recorded Audio Injection):** Use the web client's test fixture loader or audio upload toggle to pass the exact consented sample `vocal-money-as_012.wav` into the Sahara adapter.
2. **Fallback Option B (Typed Input Demonstration):** Demonstrate the text input fallback on screen to show that keyboard entry functions identically through the transcript review and downstream state machine.
3. **Audio Preflight:** Test the microphone input in browser settings prior to recording to verify mono 16 kHz capture.
