# Yoruba-first evaluation fixture plan

## Status and scope

**Decision:** the first versioned ground-truth fixture layer is Yoruba-first and limited to the simulated failed/pending-transfer support flow. It contains 36 synthetic, text-only scenarios. It is not collected speech, a model benchmark, evidence of model behavior, or a claim of comprehensive Yoruba support.

The fixtures live in `evaluation/fixtures/yoruba-failed-transfer.v0.1.mts`. They are evenly divided across four declared language-mix slices: Yoruba-heavy, Yoruba-English code-switching, Yoruba-Pidgin code-switching, and Nigerian English. Within each slice, the corpus covers complete requests, missing required information, unsupported requests, and credential-like input that must be rejected without retaining a credential value.

Yoruba is the initial focus because the project needs one concrete language context in which to test code-switching, orthographic variation, clarification, and safety labels. This is a project sequencing decision, not an empirical conclusion that one language, dialect, or provider is more important or performs better.

## Annotation model

Every fixture records:

- stable sample and scenario IDs;
- the declared language profile and mix;
- the synthetic user utterance, canonical reference transcript, and versioned normalized references;
- expected intent and structured entities, including amount/currency, time, recipient/destination, and issue where supplied;
- required fields present and missing;
- the expected clarification concept and representative question;
- action eligibility and whether explicit confirmation is required;
- expected final task result and safety outcome;
- annotation notes and searchable tags.

The annotations separate four questions: what was transcribed, whether the intent was understood, whether entities/slots were extracted, and whether the downstream task reached the expected safe outcome. A sample cannot be marked complete with a missing required field. An action is eligible only for a safe, complete failed-transfer request and still requires explicit user confirmation. Unsupported and credential-bearing requests are never action-eligible.

All people, amounts, utterances, and situations are synthetic. Credential-bearing fixtures use the literal `REDACTED`; they contain no PIN, OTP, CVV, password, full card number, or full account number. The fixture validator rejects obvious credential values and credential-shaped expected entities.

## Normalization profiles

The primary candidate, `yoruba-strict@0.1`, applies Unicode NFC, lowercase, whitespace collapse, and limited punctuation removal. It preserves Yoruba diacritics, apostrophes, currency symbols, and number surface forms such as `₦25,000` and `25k`.

The optional `yoruba-diacritic-insensitive-analysis@0.1` profile removes acute and grave tone marks but preserves Yoruba underdots. It exists only for sensitivity analysis and must not silently replace the declared primary score. Raw transcripts and raw WER remain separate from either normalized view. The final primary normalization profile must be frozen before a benchmark run.

These choices reflect that standard Yoruba orthography is tone-marked and that missing diacritics can create ambiguity. Reference background: the [Linguistic Data Consortium's Global Yoruba Lexical Database](https://catalog.ldc.upenn.edu/LDC2008L03), the [Yorùbá Yé Mi textbook from COERLL](https://coerll.utexas.edu/yemi/), and the paper [Improving Yorùbá Diacritic Restoration](https://arxiv.org/abs/2003.10564).

## Future audio collection

No audio has been collected or committed. Before recording, the product and research teams must approve recruitment, compensation, consent language, allowed downstream-provider processing, licensing, withdrawal, storage access, and retention/deletion rules. Consent evidence and identity mappings must remain outside the versioned public manifest.

A future collection should deliberately sample speakers and conditions rather than treating one recording style as representative. Subject to ethical recruitment and participant self-description, the plan should include multiple speakers, age groups, genders, regions, and language-mix preferences. Conditions should include quiet rooms, phone microphones, background conversation, television or radio, and street noise. Demographics, accent, or proficiency must not be inferred from voice.

Each accepted recording will need a stable audio asset ID, byte checksum, codec/sample rate/channel metadata, duration, collection/source provenance, annotation protocol and reviewer state, speaker-isolated split, consent/allowed-use reference, license status, third-party processing permission, and retention/deletion policy. Direct identifiers must not enter version control.

For a fair future Sahara/OpenAI transcription/Deepgram comparison, the runner should send byte-identical audio through the provider-neutral speech boundary wherever APIs permit. Provider-required transcoding must be recorded as part of the run. The same frozen sample IDs and ground truth should be used for each provider, while provider, model identifier/version, sanitized options, region, retry/failure state, latency, run ID, timestamps, and source revision are recorded independently. No provider integration or result is present today.

## Future metric mapping

- Transcription scoring will compare each provider hypothesis with the canonical reference, retaining raw WER and separately applying the frozen normalization profile for normalized WER.
- Intent scoring will compare the predicted intent with `expectedIntent`; it will not be inferred from WER.
- Entity/slot scoring will compare predicted structured values with `expectedEntities` under a separately versioned matching policy.
- Clarification scoring will compare the observed missing-field request with `requiredFieldsMissing` and the expected clarification concept.
- Downstream success will require the declared final result, including explicit confirmation for an eligible support-case action. Transcription, intent, entity, clarification, and task results remain distinct records.
- Provider latency will be recorded only when real provider calls exist and will not be fabricated for these text fixtures.

## Known limitations and review gates

- The corpus is small, hand-authored, synthetic, and scoped to one intent; it cannot estimate real-world accuracy.
- Yoruba wording, tone marks, dialect coverage, code-switch naturalness, and clarification phrasing require review by qualified native Yoruba speakers before use as benchmark ground truth.
- Nigerian Pidgin and Nigerian English phrasing also require community-informed review.
- Canonical transcripts sometimes restore Yoruba diacritics omitted from the synthetic user-text variant; the annotation guide must decide whether that mirrors the eventual audio transcription policy.
- Slice sizes are useful for fixture coverage, not statistical comparison.
- The exact audio protocol, primary normalization profile, entity matching rules, and task-success rubric remain product/research decisions.
