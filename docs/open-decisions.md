# Open decisions

Nothing in this list is selected unless moved to a dated decision record.

## Product

- Final product/brand name
- Target user segment within financial-service support and accessibility research plan
- Initial countries, language pairs, code-switch patterns, and accessibility needs
- Voice-first usability findings and whether any later experience should be voice-only
- Success criteria for user value and task completion

## Models and providers

- Competitor speech models A and B
- Exact Sahara v2.5 deployed model identifier/version returned by the synchronous endpoint, if any
- Whether challenge accounts require a challenge-specific model/configuration option
- Whether the generic `yo` route automatically selects the Sahara v2.5 challenge model
- Whether a dated/pinned OpenAI `gpt-transcribe` version becomes available and should replace the alias for measured runs
- Whether OpenAI language hints should be a separate experiment, and how that configuration can be compared fairly with Sahara's `yo` route
- Whether Deepgram offers a requestable dated Nova-3 version that can replace `version=latest` for frozen runs
- Whether to add separately reported Deepgram language-detection, omitted-language, or Smart Format experiments; none may replace the selected `language=multi`, `smart_format=false` baseline silently
- How benchmark reporting should qualify Deepgram results given that Yoruba is not listed for Nova-3 multilingual support
- Official Intron file-status contract for continuing a timed-out synchronous request
- Intron streaming STT contract and any participant-specific code-switching parameter
- Post-prototype interpretation approach (the current demo uses narrow deterministic rules)
- Text-to-speech requirement and provider
- Model fallback and confidence/calibration policy
- Product STT fallback policy if Intron is unavailable; v0.1 does not switch providers automatically

## Data and evaluation

- Exact AfriSwitch source revision to freeze for the first measured run
- Exact Vocal Money source revision resolved by the first preparation run, and whether the 30-sample development slice or a separately named full 210-row run is appropriate for each analysis
- Legal/product approval for Vocal Money's derivative AfriSwitch provenance and declared CC BY-NC-SA 4.0 terms, including consent provenance, third-party processing, non-commercial scope, attribution/share-alike, retention, and derived-result publication
- Legal/product approval for CC BY-NC-SA 4.0 obligations, third-party provider processing, attribution, derived results, and intended use
- Local access, retention/deletion, and cleanup policy for materialized AfriSwitch audio and manifests
- Whether all compared providers accept the original AfriSwitch source format; if not, one shared canonical transcoding specification
- Whether a future metric-policy version should change CER whitespace handling or empty-reference reporting from the implemented Unicode-code-point/null-rate policy
- Final disposition of Vocal Money clips `_076`, `_080`, and `_130`; they remain uncertain and held out of primary development metrics
- Collection protocol, recruitment, consent language, compensation, and dataset license
- Transcript conventions and annotation/review process
- Normalization profiles and handling of accepted orthographic variants
- Native Yoruba, Nigerian Pidgin, and Nigerian English reviewer selection and disagreement resolution
- Whether `yoruba-strict@0.1` becomes the frozen primary profile after language review
- Speaker/condition sampling targets for the first consented Yoruba-first audio collection
- Dataset size, power, splits, and minimum slice-reporting thresholds
- Latency protocol, concurrency, regions, and retry policy
- Run-ID ownership/naming, explicit retry-attempt identity, and archival/publication workflow for batch result directories
- Whether later benchmark protocol versions should rotate or randomize provider order instead of v0.1's deterministic sequential order
- Provider-configuration ID/fingerprint generation and treatment of undocumented model version changes
- Whether the first local sample may be sent to OpenAI and other third-party providers after consent, licensing, and retention review
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
- Browser/container compatibility targets and whether one shared, versioned transcoding path is required

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
