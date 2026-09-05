# Project Bridge

> **Status:** early repository foundation. “Project Bridge” is a temporary codename, not a product or brand decision.

Project Bridge explores a voice-first AI access layer through which a person can speak naturally, be understood across code-switched speech, clarify missing information, confirm consequential actions, trigger a downstream task, and receive an accessible response.

This repository does **not** yet contain speech-provider integrations, an LLM integration, a production database, a selected vertical, or benchmark results. The included applications are development shells and the packages primarily define provider-neutral boundaries.

## Decision labels

Documentation uses these labels consistently:

- **Requirement:** stated by the Sahara CodeSwitch Africa Challenge brief.
- **Decision:** currently adopted for this project and revisitable when described as temporary.
- **Assumption:** a working premise that needs validation.
- **Open decision:** unresolved and must not be represented as selected.

## Repository map

```text
apps/
  web/           Development-facing web shell
  api/           Minimal HTTP API shell
packages/
  speech/        Provider-neutral speech contracts
  conversation/  Conversation and interpretation contracts
  actions/       Vertical-neutral downstream action contracts
  benchmark/     Evaluation schemas, runner contracts, and metrics
  domain/        Pluggable vertical/domain contracts
  shared/        Cross-package primitives
evaluation/
  audio/          Local/private audio inputs (ignored by Git)
  metadata/       Versioned sample metadata manifests
  results/        Generated benchmark outputs (ignored by Git)
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

## Documentation

- [Product thesis](docs/product-thesis.md)
- [Challenge requirements](docs/challenge-requirements.md)
- [MVP boundaries](docs/mvp-boundaries.md)
- [Architecture](docs/architecture.md)
- [Benchmark methodology](docs/benchmark-methodology.md)
- [Responsible AI](docs/responsible-ai.md)
- [Open decisions](docs/open-decisions.md)

## Data and secrets

Do not commit credentials, raw participant audio, direct identifiers, consent evidence, or generated evaluation results that may contain personal data. The audio, result, and private-metadata paths are ignored by default. Metadata intended for version control must be de-identified and reviewed first.

## Current vertical

No vertical has been selected. Healthcare is one candidate reference implementation only; core packages must remain reusable across domains.
