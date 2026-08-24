# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Narrative Mind stores a fictional world as a graph — four entity types
(`Character`, `Location`, `Faction`, `Event`) and typed relationships between
them — and puts an API and UI over it. Two independently deployed halves:
`backend/` (FastAPI + Neo4j) and `frontend/` (React + TypeScript). Neither
imports from the other; the API contract is the only coupling.

## Commands

**Backend** (run from `backend/`):

```bash
uv sync                                            # install deps
docker compose up -d neo4j                         # from repo root; Neo4j must be running
uv run uvicorn narrative_mind.main:app --reload     # dev server on :8000
uv run ruff check .                                 # lint
uv run ruff format .                                # format
uv run pytest -q                                    # full suite (Neo4j must be running)
uv run pytest src/narrative_mind/tests/test_characters.py -q          # one file
uv run pytest src/narrative_mind/tests/test_characters.py::test_name -q  # one test
```

Only `tests/test_pydantic_models.py` and the AI stub-provider test in
`tests/test_ai_service.py` run standalone; every other test fires real Cypher
against the configured Neo4j instance. Each integration test registers its own
account and cleans up everything that account owns, so the suite is
self-isolating and idempotent to re-run.

**Frontend** (run from `frontend/`):

```bash
npm install
npm run dev             # :5173, requires the backend running on :8000
npm run typecheck
npm run lint             # / lint:fix
npm run format:check     # / format
npm run test              # Vitest, no backend required — mocked at the network boundary (MSW)
```

**Resetting a dev account's world** (from `backend/`):

```bash
uv run python scripts/seed_world.py you@example.com
```

## Backend architecture

One-directional layering: `api → services → repositories → db`, with `core`,
`domain`, and `providers` as leaves. **All Cypher lives in `repositories/`** —
nothing above that layer writes a query.

- **`api/`** — routers plus `deps.py`, the request-scoped DI graph.
- **`services/`** — business rules and orchestration; raise domain errors only.
- **`repositories/`** — all Cypher; return plain dicts via explicit map
  projections (`n {.id, .name, ...}`, never `{.*}` — see "Ownership" below for
  why that matters more than usual here).
- **`providers/`** — external model calls behind `Protocol`s, never called
  directly by anything above `services/`.
- **`domain/`** — Pydantic v2 models: a Create/Update/Read DTO triad per
  entity, plus `Page[T]`.
- **`core/`** — `Settings` (env-driven config), exception hierarchy, error
  handlers.
- **`db/`** — async Neo4j driver lifecycle, session dependency, idempotent
  startup migrations (constraints/indexes — `db/migrations.py`).

### Ownership is structural, not a filter

Every entity node carries `owner_id`, and the entity repositories
(`CharacterRepository`, `LocationRepository`, `FactionRepository`,
`EventRepository`, `GraphRepository`) are **constructed with the
authenticated user's id** rather than taking it per-method call. `api/deps.py`
injects it from the JWT via `OwnerDep`, so a repository literally cannot be
built without a valid token, and no method — present or future — can forget to
scope a query, because there's no code path that has a session without also
having an owner. Consequences that follow from this, not bolted on top of it:

- Another account's entity returns **404, not 403** — absent from the match
  rather than hidden from the response.
- `POST /characters/{id}/relationships` requires both endpoints to belong to
  the caller, which is what keeps a traversal from ever walking out of one
  account's world.
- `UserRepository` and `WorldRepository` are deliberately **not** scoped this
  way — `UserRepository` resolves the current user (scoping it would be a
  cycle), and `WorldRepository` serves registration, where the owner is a user
  that doesn't exist yet.

The `{.*}` vs. explicit-projection distinction in repositories is a direct
consequence: once nodes carry a 768-float `embedding` property, a `{.*}`
projection on a list endpoint hauls that vector to the API layer just to have
Pydantic silently drop it — invisible until it's slow. Every entity repository
now uses explicit property lists for this reason.

### Providers: two independent swap axes

Two separate `Protocol`-based provider seams, each selected by its own env
var and resolved once in `providers/deps.py` — never conflate them:

- **Chat** (`LLMProvider`, in `llm.py`): `ollama` (local dev) or `groq`
  (deployment — Vercel has no persistent process to host a local model
  against). Powers `/ai/describe` and `/ai/extract`.
- **Embeddings** (`EmbeddingProvider`, in `embeddings.py`): `ollama` (local)
  or `google` (deployment — Groq has no embeddings endpoint at all, which is
  why this couldn't just be a third `LLMProvider` method). Implementations:
  `OllamaEmbeddingProvider`, `GoogleEmbeddingProvider`, and
  `FakeEmbeddingProvider` (deterministic, no network — the only embedder the
  test suite ever sees, wired in via a `get_embedder` dependency override in
  `tests/conftest.py`).

Both axes are `lru_cache`d builder functions mirroring each other
(`_build_ollama_provider`/`_build_groq_provider` and
`_build_ollama_embedder`/`_build_google_embedder`); nothing above
`providers/deps.py` knows which concrete implementation is live.

### Embeddings / Graph RAG (in progress)

An in-progress Graph RAG feature layers on top of the CRUD API: every entity
gets a vector embedding of its own canonical text (name, aliases,
status/region/ideology, description), written synchronously on create and
update via `EmbeddingService`/`EmbeddingRepository` — synchronously because
`BackgroundTasks` are not reliable on Vercel's serverless runtime, so a
fire-and-forget embed could simply never run.

The governing document is `docs/backend/GRAPH_RAG_PLAN.md` — read it before
touching anything embedding- or retrieval-related; it defines seven phases and
three load-bearing decisions made up front, the sharpest being **§2.3: exact
owner-scoped cosine similarity, not `db.index.vector.queryNodes()`**, for V1.
The reason matters: Neo4j's vector index returns the global top-K across the
*entire* database with no pre-filter, so in this multi-tenant schema it can
return another account's nodes and starve the caller after an owner-scoped
post-filter — a bug invisible on a fresh test database that degrades silently
in production. Reach for the vector index only once the plan says the linear
scan has actually become a problem.

The starter world's 27 entities get their embeddings from a precomputed,
model-named JSON file (`domain/starter_world_embeddings.<model>.json`,
generated by `scripts/precompute_starter_world_embeddings.py`) rather than a
live provider call at registration — every account's copy of the starter
world is byte-identical text, so the vectors are too. `scripts/
backfill_embeddings.py` is the recovery path for anything that falls through
(a new model with no precomputed file yet, a failed write) — it is not the
primary path.

## Frontend architecture

Feature-sliced: `src/app` (composition root/shell), `src/routes` (URL map),
`src/features` (vertical slices — `auth`, `characters`, `locations`,
`factions`, `events`, `graph`; `ai` and `world` are reserved/empty), `src/
shared` (design system, entity engine, API core), `src/styles` (dark-only
design tokens). All four CRUD entity features are built on one
`createEntityResource` factory over the four parallel backend routers rather
than four hand-written copies — extend that factory, don't duplicate it, when
adding entity-level behavior.

`docs/frontend/` is the source of truth for structure, state management, and
API integration — read the relevant doc there before restructuring anything
non-trivial on this side. Tests are network-boundary-mocked with MSW
(`onUnhandledRequest: "error"`, so an unmodeled request fails loudly rather
than passing silently) and cover the API/schema/domain-rule/graph-model
layers; there are no component tests yet (scheduled as milestone M8 in
`docs/frontend/IMPLEMENTATION_PLAN.md`).

## Cross-cutting notes

- `docs/REPOSITORY_ANALYSIS.md` is a **frozen snapshot as of 2026-07-18**,
  from when the repo was backend-only — useful for internals no README
  covers (request lifecycle, Cypher patterns, DI, error handling), but check
  its header for what's since changed before trusting a section.
- Backend secrets live in `backend/.env` (gitignored) — never read it into a
  commit or a shared artifact. `.env.example` holds placeholders only.
- Env var changes on Vercel don't apply to already-built deployments —
  redeploy after editing, for both `CORS_ORIGINS` on the backend and
  `VITE_API_BASE_URL` on the frontend.
