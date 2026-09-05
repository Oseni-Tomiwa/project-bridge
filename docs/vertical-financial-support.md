# Financial-support vertical slice

## Target user and problem

The prototype is for a person who needs help reporting a failed or pending transfer and may find a form or conventional support navigation difficult. English, Nigerian Pidgin, and simple English/Yoruba code-switching are representative interaction styles, not claims of comprehensive language support.

## Exact workflow

1. Start a conversation and type a natural transfer report.
2. Recognize only the `failed_transfer` intent and extract known fields.
3. Ask one short question for each missing required field.
4. Present a concise summary and ask whether to create a support case.
5. Bind confirmation to the proposal ID, conversation revision, and input fingerprint.
6. Create one simulated, in-memory support case and return a `BRG-<year>-<opaque>` reference.

Required fields are `transactionAmount`, `transactionDateOrRelativeTime`, `recipientOrDestinationDescription`, and `issueDescription`. Optional contract fields are a partial transaction reference, channel, and urgency notes. Currency is currently NGN when an amount is parsed.

## Safety boundary

The action creates a support-request record only. It cannot move money, read balances, authenticate a customer, connect to a bank, change credentials, freeze an account/card, or perform any other financial action. The system never requires a PIN, OTP, password, CVV, full card number, or full account number. Obvious occurrences are rejected before the utterance enters conversation state, but the detector is intentionally small and must not be treated as production-grade redaction or data-loss prevention.

## Demo limitations

- Text simulates a future transcribed utterance; there is no recording or speech support.
- Rules cover representative phrases only. They are not comprehensive NLP and have no calibrated confidence.
- Dates remain relative text such as `yesterday`; amounts currently assume NGN.
- Conversations and cases disappear when the API process restarts and are not safe for multiple API instances.
- There is no authentication, authorization, encryption layer, audit log, rate limiting, human escalation, or real service integration.
- The demo fingerprint uses a versioned deterministic non-cryptographic algorithm for stale-confirmation detection, not as a security primitive.

## Future voice and benchmark mapping

A future provider-neutral transcription result can supply the existing `UserUtterance` without changing this domain flow. Speech-provider selection must remain outside the domain package.

The versioned fixtures exported as `financialSupportEvaluationFixtures` contain an evaluation sample ID, utterance, expected intent, expected entities, and expected task result. They are seed examples for later mapping into the benchmark package’s full governed evaluation manifests. They are not audio samples, a benchmark dataset, or measured results. Future scoring must keep transcription, intent, entity/slot, clarification/confirmation behavior, and downstream task success separate.
