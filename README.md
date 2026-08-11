# Narrative Mind

A narrative intelligence platform for building, understanding, and reasoning
about fictional worlds.

The state of a fiction — who knows whom, who belongs to which faction, where
something happened and who was there — usually lives in a writer's head or
scattered across flat documents, where nothing can be asked of it. Narrative
Mind stores that state as an actual graph and puts a workspace over it: four
entity types (`Character`, `Location`, `Faction`, `Event`), typed relationships
between them, traversal queries across the result, and LLM endpoints that write
prose from an entity or extract entities and relationships out of a passage.

The shipped capability is the **Narrative Graph (V1)**, implemented end-to-end
across both halves of this repository.

## Repository layout

| Path | What it is |
|---|---|
| [`backend/`](backend/) | Async FastAPI service over Neo4j — entities, relationships, graph traversal, AI endpoints, JWT auth. Setup and full API reference: [`backend/README.md`](backend/README.md) |
| [`frontend/`](frontend/) | React + TypeScript workspace — a desktop-class, dark-only UI over the API. Setup and feature list: [`frontend/README.md`](frontend/README.md) |
| [`docs/`](docs/) | Design and analysis documents (see [Documents](#documents) — some are dated snapshots) |
| [`docker-compose.yml`](docker-compose.yml) | Neo4j 5 for local development |

The two halves deploy independently as separate Vercel projects; neither
imports from the other, and the API contract is the only coupling.

## Quickstart

**Prerequisites:** Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js
20.19+, Docker (or any reachable Neo4j 5.x instance), and
[Ollama](https://ollama.com) if you want the `/ai` endpoints.

**1. Neo4j** — from the repository root:

```bash
docker compose up -d neo4j
```

Bolt on `localhost:7687`, browser UI on `localhost:7474`, credentials
`neo4j` / `password123` (matching `backend/.env.example`). Constraints and
indexes are applied automatically on API startup.

**2. Backend** — in `backend/`:

```bash
uv sync
cp .env.example .env
uv run uvicorn narrative_mind.main:app --reload    # http://localhost:8000
```

Interactive API docs at <http://localhost:8000/docs>. For the `/ai` endpoints,
also `ollama pull llama3.2:3b`. See
[`backend/README.md`](backend/README.md#llm-provider-ollama-local-vs-groq-deployed)
for the Ollama-vs-Groq provider choice — local development needs only Ollama,
and no Groq account.

**3. Frontend** — in `frontend/`:

```bash
npm install
cp .env.example .env    # VITE_API_BASE_URL, defaults to http://localhost:8000
npm run dev             # http://localhost:5173
```

Every route except `/health` and `/auth/*` requires a token, so register an
account from the UI before anything else will load.

**Optional — seed a world to explore.** From `backend/`, with Neo4j running:

```bash
uv run python scripts/seed_world.py
```

This **wipes the graph** and rebuilds it as the Verge worldset — 10 characters,
6 locations, 5 factions, 6 events, and the relationships between them. Ids are
derived from slugs, so re-running it reproduces the same graph rather than
duplicating nodes.

## What is implemented

- **Auth** — register, log in, HS256 bearer tokens; every route but `/health`
  and `/auth/*` is protected. No refresh endpoint in V1.
- **Entity management** — full CRUD for characters, locations, factions, and
  events, with paginated lists (search, sort, and a categorical filter for the
  types that have one), rendered from a single entity engine on the frontend.
- **Relationships** — `KNOWS`, `MEMBER_OF`, `LOCATED_IN`, `PARTICIPATED_IN`,
  written from a character; `KNOWS` edges may carry a sentiment.
- **Graph** — ego-network traversal (depth 1–3) and shortest path between two
  characters, rendered as an interactive Cytoscape canvas with connect/edit
  gestures.
- **AI** — `POST /ai/describe` (prose from an entity) and `POST /ai/extract`
  (schema-constrained entity/relationship extraction from a passage), behind a
  swappable provider: Ollama locally, Groq in deployment.

## Not built yet

Roadmap capabilities named in the design documents but absent from the code:
**Timeline**, **Rich Text Editing**, **World Encyclopedia**, **AI Reasoning**,
**Consistency Checking**, and **Knowledge Search**.

Also outstanding:

- No UI reaches the `/ai` endpoints — `frontend/src/features/ai/` and
  `features/world/` are reserved, empty slices.
- No world or campaign switcher; one implicit world per backend instance.
- The frontend's planned world-overview/global-search milestone (M7) and its
  accessibility and polish pass (M8) are unstarted.

## Tech stack

| | |
|---|---|
| **Backend** | Python 3.12, FastAPI (async), Neo4j 5 via Bolt, Pydantic v2, PyJWT, pwdlib/argon2, uv, ruff, pytest |
| **Frontend** | React 19, TypeScript, Vite, Tailwind v4 (CSS-first), shadcn/ui + Radix, TanStack Query & Table, Zustand, React Hook Form + Zod, Cytoscape, Vitest + MSW |
| **Deployed on** | Vercel (two projects), Neo4j Aura, Groq |

## Documents

- [`docs/frontend/`](docs/frontend/) — the frontend's architecture, file
  structure, API integration, state management, component hierarchy, and
  milestone plan. `IMPLEMENTATION_PLAN.md` carries as-built notes per milestone
  and is the closest thing to a build log; the structural documents predate the
  auth slice and some later refactors.
- [`docs/REPOSITORY_ANALYSIS.md`](docs/REPOSITORY_ANALYSIS.md) — a deliberately
  frozen inventory of the backend **as of 2026-07-18, when the repository was
  backend-only**. Useful for internals no README covers (request lifecycle,
  Cypher patterns, DI, error handling); its header lists everything that has
  changed since, and each superseded section says so inline.

## Testing

```bash
cd backend  && uv run pytest -q      # Neo4j must be running for the integration tests
cd frontend && npm run test          # Vitest + MSW, no backend required
```

The backend's model tests and AI stub-provider test run standalone; the rest
execute real Cypher against the configured Neo4j instance. The frontend suite
covers the API, schema, domain-rule, and graph-model layers with the backend
mocked at the network boundary; it has no component tests yet.

## Layering

The backend enforces one-directional dependencies — `api → services →
repositories → db`, with `core`, `domain`, and `providers` as leaves. All
Cypher lives in `repositories/`. The frontend is feature-sliced: `app/`
(composition root and shell), `routes/` (URL map), `features/` (vertical
slices), `shared/` (design system, entity engine, API core). Each README
explains its own half.
