# Open decisions

Nothing in this list is selected unless moved to a dated decision record.

## Product

- Final product/brand name
- Target user segment within financial-service support and accessibility research plan
- Initial countries, language pairs, code-switch patterns, and accessibility needs
- Voice-only versus voice-first channel experience
- Success criteria for user value and task completion

## Models and providers

- Competitor speech models A and B
- Exact Sahara v2.5 deployed model identifier/version returned by the synchronous endpoint, if any
- Whether challenge accounts require a challenge-specific model/configuration option
- Whether the generic `yo` route automatically selects the Sahara v2.5 challenge model
- Official Intron file-status contract for continuing a timed-out synchronous request
- Intron streaming STT contract and any participant-specific code-switching parameter
- Post-prototype interpretation approach (the current demo uses narrow deterministic rules)
- Text-to-speech requirement and provider
- Model fallback and confidence/calibration policy

## Data and evaluation

- Collection protocol, recruitment, consent language, compensation, and dataset license
- Transcript conventions and annotation/review process
- Normalization profiles and handling of accepted orthographic variants
- Native Yoruba, Nigerian Pidgin, and Nigerian English reviewer selection and disagreement resolution
- Whether `yoruba-strict@0.1` becomes the frozen primary profile after language review
- Speaker/condition sampling targets for the first consented Yoruba-first audio collection
- Dataset size, power, splits, and minimum slice-reporting thresholds
- Latency protocol, concurrency, regions, and retry policy
- Provider-configuration ID/fingerprint generation and treatment of undocumented model version changes
- Allowed-use vocabulary and systems of record for consent, licensing, and retention evidence
- Definition of “transcription accuracy” in addition to WER
- Task-completion rubric and safety error taxonomy
- Canonical action-input fingerprint algorithm and confirmation expiry policy

## Architecture and operations

- Deployment provider and region(s)
- Authentication and authorization approach
- Whether support-case persistence is required beyond the current process-local in-memory repository; if so, database and retention design
- Observability, cost controls, queueing, and provider failover
- API/channel protocol and streaming requirements

## Responsible AI and governance

- Risk tier of the selected action and confirmation requirements
- Applicable countries, laws, regulatory obligations, and review owners
- Data retention/deletion periods and third-party training opt-outs
- Human review, escalation, incident response, and user redress
- Whether a later pilot should go beyond the currently selected simulated downstream system

## Decision record template

When resolving an item, record:

- date and owner
- decision and status (trial or final)
- evidence and alternatives considered
- consequences and reversal trigger
- privacy, safety, evaluation, and cost implications
