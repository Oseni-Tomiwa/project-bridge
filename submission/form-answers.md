# Project Bridge: Challenge Submission Form Answers

---

### Project Title
**Project Bridge: Voice-First Code-Switched Healthcare Intake Assistant**

---

### Problem Statement (~50 words)
Many multilingual Africans communicate naturally by code-switching between indigenous languages and English, yet conventional digital healthcare interfaces demand typed, formal, monolingual English. Users with limited literacy, physical impairments, or conversational language preferences face high digital barriers when trying to articulate medical symptoms and navigate healthcare access.

*(49 words)*

---

### Target Users (~50 words)
Patients and community members in multilingual Nigerian communities who naturally speak Yoruba, Nigerian English, Pidgin, or intra-sentential Yoruba-English code-switching. Target users include individuals who struggle with text-heavy digital forms, visual/typing constraints, or navigating bureaucratic health clinic intake procedures.

*(44 words)*

---

### Proposed Solution (~50 words)
Project Bridge provides an accessible, voice-first clinic navigation layer. It accepts natural code-switched speech, provides an editable transcript for user-in-the-loop review, extracts non-diagnostic symptom summaries via deterministic rules, applies a narrow deterministic emergency escalation boundary for life-threatening statements, and creates structured, simulated clinic intake records upon explicit user confirmation.

*(48 words)*

---

### Code-Switching Support Explanation
Project Bridge is built specifically for intra-sentential code-switching (alternating between languages within a single utterance). Rather than forcing users into a monolingual English or Yoruba mode, Bridge integrates Sahara's specialized Yoruba-English speech route (`use_language_asr_input=yo`). The system is designed to process Yoruba-English code-switched speech across Yoruba grammatical verbs/particles and English clinical or technical nouns (e.g., *"Mo ti ni headache lati ana and my body dey hot. I want see doctor."*). Normalization and downstream slot-filling rules preserve code-switched duration and symptom phrases verbatim without adding unsupported clinical inferences.

---

### Sahara API Usage
**Yes.**  
Project Bridge integrates Intron/Sahara’s synchronous speech-to-text API (`https://infer.voice.intron.io/file/v1/upload/sync`) using the dedicated Yoruba-English code-switched route (`use_language_asr_input=yo`). The implementation resides in a provider-neutral speech package (`@project-bridge/speech`) that records monotonic latency, handles rate limits, and surfaces transcription output directly to the user review interface.

---

### Agentic / Downstream Task Description (~50 words)
Bridge executes an autonomous, multi-step intake flow: it parses unstructured code-switched transcripts, identifies missing details (e.g., duration), prompts narrow clarifications, asks for an optional preferred name, requests explicit user confirmation, and issues an idempotent in-memory simulated clinic intake record with reference ID `BRG-H-2026-XXXXX`.

*(46 words)*

---

### Technical Overview (~250 words)
Project Bridge is built with a modular TypeScript monorepo architecture designed around reliability, safety, and strict evaluation separation:

1. **Provider-Neutral Speech Abstraction:** Speech recognition is isolated behind a common `SpeechProvider` interface (`@project-bridge/speech`). Adapters for Sahara (`yo` route), OpenAI (`gpt-transcribe`), and Deepgram (`nova-3` multilingual) run with identical byte-level WAV inputs, monotonic latency tracking, and zero hidden retries to ensure fair benchmark comparisons.
2. **User-Editable Review Interface:** Because code-switched ASR retains inherent acoustic uncertainty, the web client (`apps/web`) displays an editable transcript immediately after transcription, ensuring users verify their words before downstream processing.
3. **Deterministic Healthcare Boundary:** Rather than relying on unconstrained LLM text generation that risks clinical hallucination, downstream interpretation (`@project-bridge/conversation`) utilizes deterministic rule sets to extract reported symptoms, duration, and requested services. It strictly avoids diagnostic labeling, triage, or prescribing.
4. **Narrow Deterministic Emergency Escalation Boundary:** Life-threatening phrasing (*cannot breathe*, *unconscious*, *severe bleeding*, *seizures*) bypasses routine intake to trigger immediate local emergency escalation instructions.
5. **Explicit Confirmation Before Action:** Downstream state transition requires affirmative user confirmation before writing an immutable, simulated intake record (`BRG-H-2026-XXXXX`). No real clinic is contacted and no persistent medical record is created.
6. **Privacy by Design:** The architecture enforces minimal data collection (asking only for an optional preferred name), avoids persisting raw audio, and isolates the 16 synthetic healthcare evaluation fixtures from empirical speech benchmark runs.

*(248 words)*

---

### Ethics, Safety, and Inclusion (~100 words)
Project Bridge is explicitly non-diagnostic and non-prescriptive. It generates simulated intake summaries for human clinician review, without contacting real health providers. A deterministic safety gate immediately escalates life-threatening emergencies. The system practices data minimization: it asks only for an optional preferred first name/nickname, rejects unnecessary identifiers, and does not store audio recordings. By supporting Yoruba-English code-switching and offering both voice recording and manual text entry, Bridge expands digital accessibility for underserved linguistic communities while maintaining strict user-in-the-loop confirmation before any action is executed.

*(93 words)*
