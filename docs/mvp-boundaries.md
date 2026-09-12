# MVP boundaries

## Selected challenge MVP boundary

**Decision (2026-09-12):** prove one narrow, end-to-end voice-first healthcare-intake journey while keeping provider and domain boundaries reusable. The financial-support slice remains preserved as prior domain work.

### Implemented in the first vertical slice

- Explicit-gesture browser microphone capture with visible recording state, Stop/Cancel controls, elapsed time, and a one-minute/8 MiB bound.
- Server-side Intron/Sahara transcription with request-scoped audio and no Project Bridge audio persistence.
- Visible raw transcript, intentional user correction, and explicit Continue before conversation submission.
- Text entry as an accessible fallback converging on the same canonical utterance endpoint.
- Deterministic recognition of the single `clinic_intake_request` intent and representative user-reported symptom/request phrases.
- Optional duration and requested-service capture, one simple follow-up when appropriate, and a non-diagnostic summary of the user's own statements.
- A deliberately conservative explicit-emergency-language boundary that blocks routine intake and advises immediate local emergency/urgent assistance without diagnosis or treatment instructions.
- Explicit confirmation bound to the exact proposal and conversation revision.
- Creation and retrieval of a simulated, in-memory clinic intake with a `BRG-H-<year>-<opaque>` reference and explicit wording that no clinic or appointment is real.
- Rejection without retention when obvious national-ID, insurance-number, medical-record-number, or credential patterns are detected.

### Planned but not implemented

- Run governed healthcare-relevant audio through three speech providers; existing Vocal Money results remain separate development evidence.
- Evaluate whether transcript errors preserve intake intent, symptom phrases, duration, urgency language, clarification behavior, and safe task completion.
- Replace deterministic interpretation only after an evaluated provider-neutral approach is selected.
- Add spoken output; completion and failure are currently communicated visually in plain language.
- Record privacy-conscious operational and evaluation telemetry.

### Out of scope for the initial challenge MVP

- A general-purpose assistant covering many verticals.
- Autonomous high-impact decisions.
- Diagnosis, comprehensive triage, prognosis, treatment, prescribing, or medical advice.
- Real clinic routing, appointment booking, patient accounts, insurance processing, health-record integration, or emergency dispatch.
- Movement of real money, irreversible government filings, or other high-risk production actions.
- Re-activating the preserved financial-support slice as the challenge journey, or adding any live-bank capability.
- A production-scale identity, billing, or data platform.
- Kubernetes, independent microservices, and a database without a validated persistence need.
- Training foundation speech models.

## Current gate

The simulated workflow may be demonstrated only with invented spoken or typed health scenarios through the configured Intron service. It is not approved for real patient data, clinical use, emergency reliance, or participant research. Any such use remains gated on clinical safety review, jurisdiction-specific emergency wording, privacy notice, consent/lawful basis, provider processing, retention, security, evaluation, accessibility, and regulatory decisions.
