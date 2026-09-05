# MVP boundaries

## Proposed MVP boundary

**Assumption:** the challenge MVP should prove one narrow, end-to-end journey in a selected vertical while keeping provider and domain boundaries reusable.

### In scope after vertical selection

- Capture or upload consented speech for selected language pairs.
- Run the same audio through three speech providers.
- Normalize and compare transcripts with reproducible configuration.
- Interpret intent and required entities for one narrow workflow.
- Ask a simple clarification when required information is missing.
- Require explicit confirmation before a consequential action.
- Execute a safe, demonstrable downstream action through a domain adapter.
- Communicate completion or failure in plain language; include voice output if selected for the demo.
- Record privacy-conscious operational and evaluation telemetry.

### Out of scope for the initial challenge MVP

- A general-purpose assistant covering many verticals.
- Autonomous high-impact decisions.
- Real clinical diagnosis or treatment guidance.
- Movement of real money, irreversible government filings, or other high-risk production actions.
- A production-scale identity, billing, or data platform.
- Kubernetes, independent microservices, and a database without a validated persistence need.
- Training foundation speech models.

## MVP gate

Implementation of the end-to-end journey should not begin until the team records the selected vertical, user, task, language pair(s), action consequence level, success criteria, and data/consent plan in `docs/open-decisions.md` or a successor decision record.
