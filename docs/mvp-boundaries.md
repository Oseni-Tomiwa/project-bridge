# MVP boundaries

## Selected challenge MVP boundary

**Decision (2026-09-05):** prove one narrow, end-to-end financial-service support journey while keeping provider and domain boundaries reusable.

### Implemented in the first vertical slice

- Explicit-gesture browser microphone capture with visible recording state, Stop/Cancel controls, elapsed time, and a one-minute/8 MiB bound.
- Server-side Intron/Sahara transcription with request-scoped audio and no Project Bridge audio persistence.
- Visible raw transcript, intentional user correction, and explicit Continue before conversation submission.
- Text entry as an accessible fallback converging on the same canonical utterance endpoint.
- Deterministic recognition of representative failed/pending-transfer phrases.
- Required-field collection, one simple follow-up at a time, and concise summary generation.
- Explicit confirmation bound to the exact proposal and conversation revision.
- Creation and retrieval of a simulated, in-memory support case with an opaque reference.
- Rejection without retention when obvious PIN, OTP, password, CVV, full card-number, or full account-number patterns are detected.

### Planned but not implemented

- Run the same audio through three speech providers.
- Normalize and compare transcripts with reproducible configuration.
- Replace deterministic interpretation only after an evaluated provider-neutral approach is selected.
- Add spoken output; completion and failure are currently communicated visually in plain language.
- Record privacy-conscious operational and evaluation telemetry.

### Out of scope for the initial challenge MVP

- A general-purpose assistant covering many verticals.
- Autonomous high-impact decisions.
- Real clinical diagnosis or treatment guidance.
- Movement of real money, irreversible government filings, or other high-risk production actions.
- Balance or account access, customer authentication, credential handling, card/account controls, or a live-bank connection.
- A production-scale identity, billing, or data platform.
- Kubernetes, independent microservices, and a database without a validated persistence need.
- Training foundation speech models.

## Current gate

The simulated workflow may be demonstrated with invented spoken or typed data through the configured Intron service. It is not approved for real customer data or participant research. Any such use remains gated on unresolved notice, consent/lawful-basis, provider-processing, retention, security, evaluation, and regulatory decisions.
