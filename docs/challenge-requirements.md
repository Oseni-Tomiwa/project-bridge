# Challenge requirements

## Confirmed requirements from the supplied brief

1. Voice must lead to a downstream or agentic task; transcription alone is insufficient.
2. The submission must target a specific vertical or use case.
3. Code-switched audio must be benchmarked across at least three speech models:
   - Sahara / Intron Sahara API
   - competitor A
   - competitor B
4. Benchmarking must support normalized WER, accuracy, and latency, with room for downstream intent accuracy, entity/slot accuracy, and task completion.
5. Test metadata must support language pair, domain, accent/country, device, and noise conditions.
6. Responsible AI coverage must include privacy, consent, safety, and responsible data use.
7. Final deliverables include the problem and solution, a working prototype/demo, code and technical documentation, benchmark results, and Responsible AI documentation.

## Current implementation status

| Area                        | Status                                                                         |
| --------------------------- | ------------------------------------------------------------------------------ |
| Provider-neutral repository | Foundation created                                                             |
| Specific vertical           | Healthcare intake/navigation active                                            |
| Sahara integration          | Default product STT via API                                                    |
| Competitor integrations     | OpenAI and Deepgram adapters added                                             |
| Speech dataset              | AfriSwitch primary planned; Vocal Money development slice materialized locally |
| Benchmark execution         | Vocal Money development run complete; primary AfriSwitch not run               |
| Downstream action           | Confirmed simulated clinic-intake creation                                     |
| Voice input                 | Browser recording and review added                                             |
| Voice response              | Not implemented                                                                |
| Responsible AI plan         | Initial documentation only                                                     |

No undocumented behavior is assumed for Sahara or any competitor API.

The healthcare workflow satisfies the downstream-task requirement only by creating a confirmed structured simulated clinic intake. It does not diagnose, prescribe, recommend treatment, contact a clinic, or claim an appointment. Emergency-language handling is a conservative safety stop, not comprehensive medical triage.
