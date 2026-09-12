# Project Bridge

> **Status:** challenge prototype. “Project Bridge” is a temporary codename, not a product or brand decision.

Project Bridge explores a voice-first AI access layer through which a person can speak naturally, be understood across code-switched speech, clarify missing information, confirm consequential actions, trigger a downstream task, and receive an accessible response.

The active vertical slice is a simulated healthcare-intake journey. It records an explicitly initiated browser voice message, sends it through the API to Intron/Sahara, shows an editable transcript, then uses deterministic text rules to preserve user-reported concerns, ask narrow clarifications, stop routine intake on explicit emergency language, request confirmation, and create an in-memory simulated clinic intake. Text entry remains available. It does **not** diagnose, recommend treatment, prescribe, contact a clinic, or book an appointment. The former financial-support implementation remains preserved as prior domain work. OpenAI and Deepgram remain benchmark providers rather than product-flow fallbacks. A local three-provider Vocal Money development run exists, but it is not the primary AfriSwitch challenge benchmark and does not establish a final model ranking. An LLM, durable storage, authentication, and TTS are not implemented.

## Decision labels

Documentation uses these labels consistently:

- **Requirement:** stated by the Sahara CodeSwitch Africa Challenge brief.
- **Decision:** currently adopted for this project and revisitable when described as temporary.
- **Assumption:** a working premise that needs validation.
- **Open decision:** unresolved and must not be represented as selected.

## Repository map

```text
apps/
  web/           Accessible voice-first healthcare-intake demo with text fallback
  api/           Server-side STT, conversation, and simulated clinic-intake API
packages/
  speech/        Provider-neutral speech contracts and file-STT adapters
  conversation/  Conversation and interpretation contracts
  actions/       Vertical-neutral downstream action contracts
  benchmark/     Evaluation schemas, runner contracts, and metrics
  domain/        Pluggable vertical/domain contracts
  shared/        Cross-package primitives
evaluation/
  audio/          Local/private audio inputs (ignored by Git)
  data/           Locally materialized external datasets (ignored by Git)
  fixtures/       Synthetic versioned text ground truth
  manifests/      Evaluation-layer fixture manifests
  metadata/       Versioned sample metadata manifests
  profiles/       Versioned normalization profile registry
  results/        Generated benchmark outputs (ignored by Git)
  scripts/        Explicit external-dataset preparation tools
docs/             Product, architecture, evaluation, and safety notes
```

## Prerequisites

- Node.js 22 or later
- pnpm 11 or later

## Local commands

```bash
pnpm install
pnpm dev
pnpm check
```

The web shell defaults to `http://localhost:5173`; the API defaults to `http://127.0.0.1:3000`. Copy `.env.example` to `.env` only when local overrides are needed.

To use voice locally, copy `.env.example` to `.env`, set `INTRON_API_KEY`, and start both applications with `pnpm dev`. Open `http://localhost:5173`, activate the microphone button, stop recording, review or correct the visible transcript, and continue. The API reads the root `.env` in local development; the key is never exposed through Vite or sent to the browser. Text entry remains available. The prototype recognizes a deliberately small set of Yoruba, Nigerian English, Pidgin, and Yoruba-English code-switched phrases. Use invented health scenarios only; do not speak or type real health information or identifiers.

## Documentation

- [Product thesis](docs/product-thesis.md)
- [Challenge requirements](docs/challenge-requirements.md)
- [MVP boundaries](docs/mvp-boundaries.md)
- [Architecture](docs/architecture.md)
- [Voice-first product flow](docs/voice-product-flow.md)
- [Healthcare intake vertical](docs/healthcare-intake.md)
- [Benchmark methodology](docs/benchmark-methodology.md)
- [Batch STT benchmark runner](docs/stt-batch-runner.md)
- [STT metric aggregation](docs/stt-metrics.md)
- [Yoruba-first evaluation plan](docs/yoruba-evaluation-plan.md)
- [AfriSwitch Yoruba dataset preparation](docs/datasets/afriswitch-yoruba.md)
- [Vocal Money secondary development dataset](docs/datasets/vocal-money-codeswitch.md)
- [Intron/Sahara STT adapter](docs/providers/intron-sahara-stt.md)
- [OpenAI STT adapter](docs/providers/openai-stt.md)
- [Deepgram STT adapter](docs/providers/deepgram-stt.md)
- [Responsible AI](docs/responsible-ai.md)
- [Open decisions](docs/open-decisions.md)
- [Preserved financial-support vertical](docs/vertical-financial-support.md)

## Data and secrets

Do not commit credentials, raw participant audio, direct identifiers, consent evidence, or generated evaluation results that may contain personal data. The audio, result, and private-metadata paths are ignored by default. Metadata intended for version control must be de-identified and reviewed first.

The active synthetic fixture layer contains 16 healthcare-intake text fixtures across Yoruba-heavy, Yoruba-English, Yoruba-Pidgin, and Nigerian English slices. The earlier 36 failed-transfer fixtures remain preserved separately. These fixtures contain no audio, provider output, scores, real patient information, or fabricated metrics; their language and clinical-safety annotations require qualified review before benchmark use.

The official `intronhealth/AfriSwitch` Yoruba `test` split is configured as the primary external code-switching ASR source. Project Bridge v0.1 freezes its first challenge slice at 75 samples with seed `project-bridge-challenge-v1`; the Hugging Face revision remains unresolved until the first materialization run. No dataset audio is committed or downloaded by normal checks. The opt-in preparation script downloads only the selected clips and writes a checksummed local manifest; see the [dataset guide](docs/datasets/afriswitch-yoruba.md). AfriSwitch results must remain identified separately from Project Bridge's synthetic and domain-specific samples.

The public `Kimyayd/vocal-money-codeswitch-asr-benchmark` dataset is configured only as a secondary development benchmark. Its frozen v0.1 preparation selects 30 of 210 rows with seed `project-bridge-vocal-money-dev-v1`, targeting 10 samples from each independently derived Project Bridge CMI selection bucket while preserving the dataset's published band labels verbatim. It remains separately identified from the primary AfriSwitch challenge slice. Source-published `hyp_*` columns are excluded from Project Bridge results. A completed local `vocal-money-dev-30-v1` run has 90 successful Sahara/OpenAI/Deepgram results; metric aggregation holds three uncertain clips and scores 27 samples per provider. Generated audio, raw results, and metrics stay gitignored. See the [dataset guide](docs/datasets/vocal-money-codeswitch.md) and [metrics guide](docs/stt-metrics.md).

A sequential, resumable STT batch runner can validate local/mock or materialized manifests, verify audio checksums, and checkpoint provider/sample successes or failures under the gitignored `evaluation/results/` directory. Automated tests use fake providers only. The Vocal Money development run does not change the requirement that the primary three-provider AfriSwitch comparison begins only after official materialization and governance approval. See the [runner guide](docs/stt-batch-runner.md).

Each real provider adapter has a separate, explicit smoke test. None is run by normal checks:

```bash
pnpm --filter @project-bridge/speech smoke:intron -- /absolute/path/to/consented-sample.wav
pnpm --filter @project-bridge/speech smoke:openai -- /absolute/path/to/consented-sample.m4a
pnpm --filter @project-bridge/speech smoke:deepgram -- /absolute/path/to/consented-sample.m4a
```

The commands require their respective API keys; read the provider guides before uploading any audio. Automated tests use mocked HTTP and do not make paid calls. No live OpenAI or Deepgram result is recorded in the repository. Nova-3 multilingual baseline evaluated out-of-distribution on Yoruba-English code-switched speech; Yoruba is not an officially supported Nova-3 multilingual language.

## Current vertical

The challenge MVP vertical is healthcare intake/navigation, limited to creating a confirmed simulated clinic intake or stopping at a conservative emergency-escalation boundary. It provides no diagnosis, treatment, prescription, appointment, or real clinical action. Generic speech, conversation, action, and benchmark contracts remain reusable across domains, and the earlier financial-support domain remains in the repository as inactive prior work.
