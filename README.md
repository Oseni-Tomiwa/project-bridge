# Project Bridge

> **Status:** challenge prototype. “Project Bridge” is a temporary codename, not a product or brand decision.

Project Bridge explores a voice-first AI access layer through which a person can speak naturally, be understood across code-switched speech, clarify missing information, confirm consequential actions, trigger a downstream task, and receive an accessible response.

The first vertical slice is a simulated failed/pending-transfer support journey. It uses deterministic text rules, asks for missing information, presents a summary for explicit confirmation, and creates an in-memory support case. It does **not** connect to a bank or perform a banking action. Speech providers, an LLM, durable storage, authentication, and benchmark execution are not implemented.

## Decision labels

Documentation uses these labels consistently:

- **Requirement:** stated by the Sahara CodeSwitch Africa Challenge brief.
- **Decision:** currently adopted for this project and revisitable when described as temporary.
- **Assumption:** a working premise that needs validation.
- **Open decision:** unresolved and must not be represented as selected.

## Repository map

```text
apps/
  web/           Accessible text-based financial-support demo
  api/           Conversation and simulated support-case HTTP API
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

Start both applications with `pnpm dev`, then type a representative failed-transfer report. The prototype recognizes a deliberately small set of English, Nigerian Pidgin, and English/Yoruba code-switch phrases. Do not enter real financial or authentication data.

## Documentation

- [Product thesis](docs/product-thesis.md)
- [Challenge requirements](docs/challenge-requirements.md)
- [MVP boundaries](docs/mvp-boundaries.md)
- [Architecture](docs/architecture.md)
- [Benchmark methodology](docs/benchmark-methodology.md)
- [Responsible AI](docs/responsible-ai.md)
- [Open decisions](docs/open-decisions.md)
- [Financial-support vertical](docs/vertical-financial-support.md)

## Data and secrets

Do not commit credentials, raw participant audio, direct identifiers, consent evidence, or generated evaluation results that may contain personal data. The audio, result, and private-metadata paths are ignored by default. Metadata intended for version control must be de-identified and reviewed first.

## Current vertical

The challenge MVP vertical is financial-service support, limited to creating a simulated support case for a failed or pending transfer. Generic speech, conversation, action, and benchmark contracts remain reusable across domains.
