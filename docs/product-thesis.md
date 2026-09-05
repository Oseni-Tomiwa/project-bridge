# Product thesis

## Confirmed problem framing

Many digital and AI services assume that a user can read and write comfortably, type, navigate conventional interfaces, and formulate prompts. Those assumptions can disadvantage people with limited literacy or digital skills, older users, and people who naturally communicate through African languages, accents, and code-switching.

## Current product decisions

- The system is a **voice-first AI access layer**, not a speech-to-text product.
- The intended interaction is: speak naturally → transcribe/understand → determine intent → clarify missing information → confirm consequential actions → perform a downstream task → communicate the result, including by voice where appropriate.
- The core must remain vertical-neutral. Domain behavior belongs behind explicit extension boundaries.
- “Project Bridge” is a temporary codename.

## Assumptions to validate

- Voice can reduce friction for at least some people who struggle with conventional digital interfaces.
- Code-switched speech performance will differ materially across language pairs, accents, devices, and acoustic conditions.
- Short, plain-language clarification and confirmation turns can make action completion both usable and safe.
- A focused first vertical can demonstrate the general platform without permanently coupling the architecture to that vertical.

## Not yet decided

The first **challenge** vertical is now financial-service support, limited to a simulated failed/pending-transfer support case. This does not make the long-term product financial-services-specific.

The final product name, post-challenge vertical roadmap, speech competitors, hosting provider, LLM/provider, production database, initial benchmark language pairs, and target countries remain open.

## Evidence needed

Discovery interviews, participatory usability sessions, consented speech samples, model benchmarking, downstream task testing, and safety review should test this thesis. Benchmark quality alone will not establish product value; the team must also measure whether intended users can successfully and confidently complete a real task.
