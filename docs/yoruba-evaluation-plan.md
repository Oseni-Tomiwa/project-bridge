# Yoruba-first evaluation fixture plan

## Status and scope

**Decision:** the active challenge fixture layer is Yoruba-first and limited to simulated healthcare intake. It contains 16 synthetic, text-only scenarios, four each across Yoruba-heavy, Yoruba-English, Yoruba-Pidgin, and Nigerian English. The earlier 36 failed-transfer fixtures remain preserved as prior-domain work. Neither corpus is collected speech, a model benchmark, clinical validation, evidence of model behavior, or a claim of comprehensive language support.

**Decision:** the official `intronhealth/AfriSwitch` Yoruba `test` split remains the primary external ASR benchmark source. Project Bridge v0.1 freezes the first challenge slice at 75 samples with seed `project-bridge-challenge-v1`; its Hugging Face revision will be resolved and frozen during the first materialization run. Its general conversational Yoruba-English utterances remain separate from Project Bridge synthetic/domain fixtures and `real-yo-001`. AfriSwitch supplies ASR references and mixing metadata, not automatic healthcare-intake ground truth.

**Decision:** the public `Kimyayd/vocal-money-codeswitch-asr-benchmark` `default/train` split is a secondary development source only. The v0.1 development slice uses 30 samples, seed `project-bridge-vocal-money-dev-v1`, and equal targets across Project Bridge's independently derived numeric-CMI selection buckets. Published `cmi_band` labels are retained separately and verbatim. Its completed local Sahara/OpenAI/Deepgram run is development evidence only: three uncertain clips are held out, leaving 27 scored samples per provider (one manually usable and 26 diagnostics-passed/unreviewed). It cannot replace, enlarge, or be silently combined with the primary AfriSwitch test slice, and it does not support a final challenge ranking. Source-published provider hypotheses remain excluded.

The active fixtures live in `evaluation/fixtures/yoruba-healthcare-intake.v0.1.mts`. They cover complete intake requests, duration/request clarification, explicit emergency language, unsupported clinical-advice requests, ambiguity, and unnecessary sensitive identifiers. The preserved `yoruba-failed-transfer.v0.1.mts` corpus is not silently relabeled as healthcare data.

Yoruba is the initial focus because the project needs one concrete language context in which to test code-switching, orthographic variation, clarification, and safety labels. This is a project sequencing decision, not an empirical conclusion that one language, dialect, or provider is more important or performs better.

## Annotation model

Every fixture records:

- stable sample and scenario IDs;
- the declared language profile and mix;
- the synthetic user utterance, canonical reference transcript, and versioned normalized references;
- expected `clinic_intake_request` intent and user-reported symptom, duration, requested-service, and urgency fields where supplied;
- missing/optional intake concepts;
- the expected clarification concept and representative question;
- action eligibility and whether explicit confirmation is required;
- expected final task result and safety outcome;
- annotation notes and searchable tags.

The annotations separate transcription, intent, reported-concern preservation, symptom-phrase recall, duration, urgency-signal preservation, clarification, unsafe clinical inference, and downstream task completion. A task succeeds only for a sufficient non-emergency request after explicit confirmation. Emergency, unsupported, and sensitive-input cases cannot count as completed intake actions.

All people, utterances, and situations are synthetic. Sensitive fixtures use the literal `REDACTED`; they contain no real national ID, insurance number, medical-record number, credential, or patient identifier. Fixture validation rejects embedded identifier values and unsafe outcome combinations.

## Normalization profiles

The primary candidate, `yoruba-strict@0.1`, applies Unicode NFC, lowercase, whitespace collapse, and limited punctuation removal. It preserves Yoruba diacritics, apostrophes, currency symbols, and number surface forms such as `₦25,000` and `25k`.

The optional `yoruba-diacritic-insensitive-analysis@0.1` profile removes acute and grave tone marks but preserves Yoruba underdots. It exists only for sensitivity analysis and must not silently replace the declared primary score. Raw transcripts and raw WER/CER remain separate from either normalized view. The Vocal Money development run uses `yoruba-strict@0.1`; future policy changes require a new version and separate reporting.

These choices reflect that standard Yoruba orthography is tone-marked and that missing diacritics can create ambiguity. Reference background: the [Linguistic Data Consortium's Global Yoruba Lexical Database](https://catalog.ldc.upenn.edu/LDC2008L03), the [Yorùbá Yé Mi textbook from COERLL](https://coerll.utexas.edu/yemi/), and the paper [Improving Yorùbá Diacritic Restoration](https://arxiv.org/abs/2003.10564).

## Future audio collection

No healthcare-specific participant audio has been collected or committed. Before recording, the product and research teams must approve clinical safety oversight, recruitment, compensation, consent language, allowed downstream-provider processing, licensing, withdrawal, storage access, and retention/deletion rules. Consent evidence and identity mappings must remain outside the versioned public manifest.

A future collection should deliberately sample speakers and conditions rather than treating one recording style as representative. Subject to ethical recruitment and participant self-description, the plan should include multiple speakers, age groups, genders, regions, and language-mix preferences. Conditions should include quiet rooms, phone microphones, background conversation, television or radio, and street noise. Demographics, accent, or proficiency must not be inferred from voice.

Each accepted recording will need a stable audio asset ID, byte checksum, codec/sample rate/channel metadata, duration, collection/source provenance, annotation protocol and reviewer state, speaker-isolated split, consent/allowed-use reference, license status, third-party processing permission, and retention/deletion policy. Direct identifiers must not enter version control.

For a fair Sahara/OpenAI/Deepgram comparison, the runner should send byte-identical audio through the provider-neutral speech boundary wherever APIs permit. Provider-required transcoding must be recorded as part of the run. The same frozen sample IDs and ground truth should be used for each provider, while provider, model identifier/version, sanitized options, region, retry/failure state, latency, run ID, timestamps, and source revision are recorded independently. All three file-transcription adapters exist and their HTTP boundaries are tested with mocks. The local Vocal Money development run follows the shared-input protocol, but it remains distinct from the not-yet-run governed AfriSwitch challenge benchmark.

The selected Deepgram baseline is Nova-3 with explicit `language=multi`, requested version `latest`, `smart_format=false`, and no automatic detection. Nova-3 multilingual baseline evaluated out-of-distribution on Yoruba-English code-switched speech; Yoruba is not an officially supported Nova-3 multilingual language. Smart Format or another language/detection setting would be a separately identified experiment, never a silent change to the primary comparison.

The preparation record `evaluation/manifests/real-yo-001-comparison.v0.1.mts` reserves one shared sample/audio identity and separate provider-result slots without duplicating its human reference. It does not promote the local file into the governed dataset or assert missing checksum, provenance, consent, license, retention, device, reviewer, or technical metadata. The exact reference text must remain unchanged. Any live comparison should use byte-identical `~/Downloads/yoruba-test.m4a`; if transcoding becomes necessary, stop and revise the protocol before collecting results.

The batch runner is ready for local/mock manifests and fake-provider tests. It verifies checksums and checkpoints raw provider/sample outcomes, but it has not executed AfriSwitch or produced comparative evidence. Sahara/OpenAI/Deepgram batch execution begins only after the official 75-sample materialization succeeds and its governance gates are approved.

## Downstream metric mapping

- Transcription scoring will compare each provider hypothesis with the canonical reference, retaining raw WER and separately applying the frozen normalization profile for normalized WER.
- `intakeIntentCorrect` compares the interpreted intent with the reviewed fixture intent; it is not inferred from WER.
- `reportedConcernPreserved`, `symptomPhraseRecall`, and `durationPreserved` score preservation of user-stated meaning without diagnosis or unsupported transformation.
- `urgencySignalPreserved` checks only the reviewed deterministic emergency signal; it is not a comprehensive triage score.
- `clarificationAppropriate` checks whether the expected clarification concept was requested.
- `unsafeClinicalInference` identifies added diagnoses, causes, treatment, prescriptions, or other unsupported clinical claims.
- `taskCompleted` requires a safe, sufficient, explicitly confirmed simulated clinic intake. Transcription and every downstream measure remain distinct records.
- Provider latency will be recorded only when real provider calls exist and will not be fabricated for these text fixtures.

For the external AfriSwitch slice, preserve the official raw and tagged transcripts, then compute strict normalized WER/CER and the optional diacritic-insensitive sensitivity view separately with the versioned metric implementation. Intent/entity/task evaluation is absent unless a particular utterance later receives justified, reviewed domain annotation; it must never be inferred from the dataset's ASR labels.

The same transcription-only separation applies to Vocal Money. Preserve its exact raw/tagged references and code-switch metadata, but do not derive healthcare intent, symptom, urgency, action, or downstream-success labels from its source domain label or wording.

AfriSwitchCare may later be considered as a separately governed healthcare-speech robustness source. It must remain distinct from the primary AfriSwitch ASR slice, and its clinical-conversation context must not be treated as Project Bridge intake/task ground truth without reviewed annotation, provenance, consent, licensing, provider-processing, and retention approval.

## Known limitations and review gates

- The corpus is small, hand-authored, synthetic, and scoped to one intent; it cannot estimate real-world accuracy.
- Yoruba wording, tone marks, dialect coverage, code-switch naturalness, and clarification phrasing require review by qualified native Yoruba speakers before use as benchmark ground truth.
- Nigerian Pidgin and Nigerian English phrasing also require community-informed review.
- Canonical transcripts sometimes restore Yoruba diacritics omitted from the synthetic user-text variant; the annotation guide must decide whether that mirrors the eventual audio transcription policy.
- Slice sizes are useful for fixture coverage, not statistical comparison.
- The exact audio protocol, primary normalization profile, entity matching rules, and task-success rubric remain product/research decisions.
- The AfriSwitch source revision, license/commercial-use interpretation, provider-processing approval, attribution/share-alike treatment, and retention policy remain unresolved before materialization or provider runs.
- Vocal Money's derivative provenance and `CC-BY-NC-SA-4.0` declaration do not resolve the dataset card's notice that speakers did not consent specifically to the derivative, source-corpus terms, third-party provider-upload permission, non-commercial scope, attribution/ShareAlike handling, or retention; these remain review gates.
