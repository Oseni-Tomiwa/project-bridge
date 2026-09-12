# Voice-first healthcare intake

## Purpose and boundary

Healthcare intake is Project Bridge's active challenge MVP. It helps a person describe a health concern in Yoruba, Nigerian English, Pidgin, or Yoruba-English code-switching and create a **simulated** structured request for clinician review. It is clinic intake/navigation, not diagnosis, triage, treatment, prescribing, appointment booking, or medical-record integration. No real clinic is contacted.

Voice matters here because conventional clinic forms can be difficult for people who communicate more naturally by speaking, have limited literacy or digital confidence, or describe concerns through code-switching. Voice does not remove the need for transcript review, privacy notice, a typed fallback, or qualified human care.

## Implemented flow

```text
voice or typed text
→ user-reviewed canonical transcript
→ deterministic clinic_intake_request interpretation
→ conservative emergency-language check
→ one clarification when needed
→ summary of only the user's reported information
→ explicit confirmation bound to proposal/revision/fingerprint
→ idempotent simulated in-memory clinic intake
→ BRG-H-<year>-<opaque> reference
```

The structured fields are `reportedConcern`, `reportedSymptoms`, optional `duration`, optional `requestedService`, `urgencySignals`, deterministic language/code-switch metadata, and confirmation evidence. Symptom labels only normalize phrases the user actually stated. For example, “my body dey hot” may be represented as “feeling hot”; it must not become a diagnosis or an inferred cause.

The action succeeds only when the reported concern is sufficient, an emergency escalation is not active, no unnecessary identifier has been accepted, the exact proposal has been explicitly confirmed, and one simulated intake record has been created. The completion message says that no appointment was booked and no clinic was contacted.

## Emergency escalation boundary

The deterministic boundary recognizes only a short documented set of explicit statements:

- cannot breathe or severe difficulty breathing;
- unconscious or not waking;
- severe/uncontrolled bleeding or bleeding that will not stop;
- an active seizure;
- explicit immediate life-threatening emergency wording.

When detected, the routine intake path stops, creates no proposal or intake, and advises seeking immediate local emergency or urgent medical assistance. It does not name a condition, explain a cause, recommend treatment, or claim comprehensive medical triage. Chest pain alone, for example, is preserved as a reported symptom rather than transformed into an inferred diagnosis by this small rule set. Emergency wording, destinations, local emergency numbers, and escalation ownership require clinical and jurisdictional review before any real-user pilot.

## Privacy and sensitive data

Health text is sensitive information even without a name. Product audio remains in browser memory and API/provider request scope and is not stored by Project Bridge. The prototype holds the user-approved text only in process-local conversation/intake memory and does not log it intentionally. A production system would require notice, lawful basis, access control, encryption, retention/deletion rules, processor review, audit policy, and incident response.

The prototype does not need a national ID, insurance number, medical-record number, patient account, or payment credential. Obvious occurrences are rejected before the text enters conversation state, but this small detector is defense in depth—not production data-loss prevention—and cannot stop sensitive words in audio from reaching the configured transcription provider.

## Example conversations

Normal path:

> User: Mo ti ni headache lati ana and my body dey hot. I want see doctor.
>
> Bridge: You reported: … Symptoms you reported: headache, feeling hot. Duration you reported: lati ana. Requested service: see a clinician. This summarizes your words and is not a diagnosis. Do you confirm that I should create this simulated clinic intake request?
>
> User: Yes.
>
> Bridge: Your simulated clinic intake request has been created. Reference: BRG-H-2026-XXXXX. This is not an appointment confirmation and no clinic was contacted.

Clarification path:

> User: I have headache and I want see doctor.
>
> Bridge: How long have you had these symptoms? You can say you are not sure.

Emergency path:

> User: I cannot breathe.
>
> Bridge: Based only on the emergency words you reported, seek immediate local emergency or urgent medical assistance now. This prototype cannot diagnose the cause or provide treatment instructions.

## Evaluation

The versioned downstream result contract keeps these fields separate from transcription metrics:

- `intakeIntentCorrect`
- `reportedConcernPreserved`
- `symptomPhraseRecall`
- `durationPreserved`
- `urgencySignalPreserved`
- `clarificationAppropriate`
- `unsafeClinicalInference`
- `taskCompleted`

Sixteen synthetic text fixtures cover Yoruba-heavy, Yoruba-English, Yoruba-Pidgin, and Nigerian English normal, clarification, emergency, unsupported, ambiguous, and sensitive-input cases. They are not audio, provider results, clinical validation, or evidence of language coverage.

AfriSwitch remains the primary general code-switched ASR source. AfriSwitchCare may later support a separately governed and separately reported healthcare-speech robustness evaluation because its clinical-conversation context is closer to this vertical. It must not be silently merged with AfriSwitch, treated as downstream task ground truth without annotation review, or used before its provenance, consent, licensing, provider-processing, and retention terms are approved.
