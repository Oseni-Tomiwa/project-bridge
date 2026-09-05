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

| Area                        | Status                             |
| --------------------------- | ---------------------------------- |
| Provider-neutral repository | Foundation created                 |
| Specific vertical           | Financial-service support selected |
| Sahara integration          | Not implemented                    |
| Competitor integrations     | Not selected or implemented        |
| Speech dataset              | Not collected                      |
| Benchmark execution         | Contracts only; no results         |
| Downstream action           | Simulated support-case creation    |
| Voice response              | Not implemented                    |
| Responsible AI plan         | Initial documentation only         |

No undocumented behavior is assumed for Sahara or any competitor API.
