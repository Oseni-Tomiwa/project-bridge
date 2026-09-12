# Responsible AI

## Status

This is an initial risk and control plan, not evidence that controls have been implemented or audited.

## Principles

- Make voice use understandable and voluntary.
- Collect the minimum data needed for a stated purpose.
- Give users meaningful notice before recording, storage, or human review.
- Keep consequential actions legible, reversible where possible, and explicitly confirmed.
- Evaluate performance across relevant language, accent, device, and noise slices without stereotyping users.
- Provide a non-voice fallback and a route to human help where the selected use case requires it.

## Consent and participant rights

Before collection, state what is recorded, why, who can access it, whether third-party providers receive it, retention, deletion, compensation, and whether it may be used for model improvement. Consent to use a service is not automatically consent to retain audio for research or share it with model providers. Provide withdrawal and deletion procedures compatible with the study design.

Do not recruit or record minors or vulnerable participants until appropriate safeguarding, legal review, and consent/assent procedures exist.

## Privacy and data handling

- Separate public sample IDs from direct identifiers and consent records.
- Keep opaque consent/license/retention references in evaluation manifests; store the underlying evidence in an access-controlled system outside Git.
- Keep raw audio and raw provider responses out of Git.
- Encrypt data in transit and at rest once storage exists; apply least-privilege access and access logging.
- Define retention and deletion before collection, including backups and provider-side retention.
- Review provider terms for training use, subprocessors, regions, and deletion controls before sending participant data.
- Redact or avoid collecting credentials, identifiers, and health details that are unnecessary for the stated intake purpose. Treat even relevant health text as sensitive.

## Safety controls

Classify each proposed action by consequence. Require explicit, specific confirmation for actions that create commitments, disclose data, move value, alter records, or are difficult to reverse. Repeat the interpreted key fields in plain language. Expire confirmations when context changes and use idempotency for retries.

When confidence is insufficient, ask a neutral clarification or decline safely. Never turn model confidence into a claim of certainty. Distinguish “request accepted,” “action completed,” and “action failed.”

High-risk verticals need domain-specific review, escalation paths, and regulatory analysis before real-world use. This challenge demo uses only a simulated downstream intake and is not suitable for clinical decisions or emergency reliance.

The active healthcare slice only creates a process-local simulated clinic intake after explicit confirmation. It does not diagnose, triage comprehensively, recommend treatment, prescribe, access a medical record, contact a clinic, book an appointment, or replace professional care. The prior financial-support code remains present but is not the active API workflow.

The deterministic emergency boundary is intentionally narrow. It reacts to explicit inability to breathe, unconscious/not-waking language, severe uncontrolled bleeding, active seizure, or explicit immediate life-threatening wording by blocking routine intake and advising immediate local emergency or urgent assistance. It must not be represented as comprehensive medical triage; clinical owners must review its phrases, false-negative risk, accessibility, jurisdiction-specific destinations, and emergency numbers before real use.

Microphone permission is requested only after the user activates recording. The UI warns that health information is sensitive, exposes the raw transcript for review, and requires Continue before the transcript becomes an utterance. Text remains available if voice is unsupported or permission is denied.

Project Bridge holds product-flow audio only in browser memory and API/provider request scope; v0.1 does not persist it. Intron receives the audio for transcription, so this is not a claim that no third party processes or retains it. Provider terms, account settings, notice, lawful basis, and retention/deletion behavior require review before real-user use.

The API rejects obvious national-ID, insurance-number, medical-record-number, credential, and long card/account-number patterns before adding the user-approved transcript or typed text to conversation state. This server-side check remains authoritative, but it occurs after voice transcription and therefore cannot prevent spoken health data or identifiers from reaching the speech provider. The pattern check is defense in depth for a demo, not reliable data-loss prevention. Logs, reverse proxies, browsers, and future integrations require their own controls before real user data is accepted.

## Fairness and evaluation

Recruit with community participation and compensate fairly. Document who is represented and missing. Report slice-level errors and uncertainty without publishing tiny cells that risk re-identification. Include qualitative review of harmful substitutions, especially names, amounts, locations, negation, urgency, and other action-critical entities.

## Abuse and security considerations

Threats include replayed audio, impersonation, prompt injection spoken through audio, unintended bystander capture, abusive content, malicious action parameters, provider outages, and misleading synthesized voice. Before integration, define authentication, authorization, rate limits, allowlisted actions, input validation, audit logs, and incident response appropriate to the vertical.

## Pre-pilot checklist

- Selected vertical risk assessment and owner
- Reviewed participant information and separate consent choices
- Data inventory, flow diagram, retention/deletion schedule, and processor review
- Threat model and action authorization policy
- Confirmation, clarification, fallback, and human-escalation tests
- Slice-based model evaluation and documented limitations
- Accessibility and community review
- Incident response and user redress path

## Open policy decisions

Jurisdictions, participant population, retention period, hosting/data regions, provider data-use settings, human review process, age policy, and domain-specific regulatory obligations remain unresolved.

The current TypeScript contracts can record governance status and references, but they do not implement consent verification, retention deletion, or access control. Those controls must exist before real evaluation data is processed.
