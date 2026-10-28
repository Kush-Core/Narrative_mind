# CLAUDE.md

Narrative Mind stores a fictional world as a Neo4j graph (`Character`, `Location`,
`Faction`, `Event` + typed relationships). `backend/` is FastAPI, `frontend/` is
React + TypeScript; they share nothing but the HTTP API. The three READMEs are the
current-state docs; read `backend/README.md` before touching retrieval or embeddings.

## Commands

Backend, from `backend/`:

```bash
docker compose up -d neo4j                           # from repo root; most tests need it
uv sync
uv run uvicorn narrative_mind.main:app --reload      # :8000
uv run ruff check . && uv run ruff format .
uv run pytest -q                                     # or a path / path::test_name
uv run python scripts/seed_world.py you@example.com  # reset one account's world
```

Frontend, from `frontend/` (tests need no backend):

```bash
npm run dev                                          # :5173, expects backend on :8000
npm run format:check && npm run typecheck && npm run lint && npm test && npm run build
```

- Containerized API: `docker compose up --build` from the repo root. It reads
  `backend/.env`, and compose overrides `NEO4J_URI` and `OLLAMA_HOST`.
- Real-model retrieval eval lives outside pytest because it calls real providers.
  The scripts are `precompute_starter_world_embeddings.py`, `backfill_embeddings.py`
  and `evaluate_graph_recall.py`; usage is in `backend/README.md`.

## CI gates (`.github/workflows/ci.yml`)

- All of the above lint/format/test/build commands, with `ruff format --check`.
- After any backend dependency change, run
  `uv export --no-hashes --no-dev -o requirements.txt`. CI fails if that file
  drifts from `uv.lock`, and Vercel installs from it.
- `pip-audit`, `npm audit --audit-level=high`, and gitleaks over the full history.
- Docker: the image must run as uid 10001, reach healthy against Neo4j, and pass
  Trivy (Dockerfile config + image, HIGH/CRITICAL).

## Backend

`api → services → repositories → db`, one direction only; `core`, `domain`,
`providers` are leaves. `evaluation/` is the offline graph-recall harness used by
`scripts/evaluate_graph_recall.py` and its tests, not by the app.

- **Application Cypher lives in `repositories/`.** The exceptions are the startup
  constraints and indexes in `db/migrations.py`, and tests, which query Neo4j
  directly.
- **Entity repositories use explicit projections** (`n {.id, .name, ...}`), never
  `{.*}`, because entity nodes carry a 768-float `embedding`. `UserRepository` is
  the exception: it returns `u {.*}`, so its rows include `password_hash`, which
  login needs.
- **Ownership is structural.** Entity repos, `GraphRepository` and
  `EmbeddingRepository` take `owner_id` in their constructor (from the JWT via `OwnerDep` in `api/deps.py`), so no query
  can run unscoped. Other accounts' entities are 404, not 403, and both relationship
  endpoints must belong to the caller. `UserRepository` and `WorldRepository` are
  unscoped on purpose.
- **List queries tiebreak on `id`** (`ORDER BY x.{sort}, x.id`) so pages never
  repeat or skip.
- **Two provider axes, never conflated**, resolved only in `providers/deps.py`:
  chat (`LLM_PROVIDER`: `ollama` | `groq`) and embeddings (`EMBEDDING_PROVIDER`:
  `ollama` | `google`). Groq has no embeddings endpoint. Tests only ever see
  `FakeEmbeddingProvider` and stub LLMs.
- **Embeddings are written synchronously** on every create/update, because Vercel
  serverless doesn't reliably run `BackgroundTasks`.
- **Retrieval is an exact owner-scoped cosine scan, never
  `db.index.vector.queryNodes()`**, which returns a global top-K across all accounts
  before any owner filter. `tests/test_rag_isolation.py` guards this.
- **One embedding model per database, and no minimum-score cutoff**: rank by top-K.
  Changing the embedding provider or model requires a full backfill.
- Registration copies starter-world vectors from
  `domain/starter_world_embeddings.<model>.json` and never calls the provider.
  Only the `models/gemini-embedding-001` file ships, so under the local Ollama
  default a new account's 27 starter entities have no vectors and retrieval can't
  find them. Run `scripts/backfill_embeddings.py <email>` for existing accounts, or
  `scripts/precompute_starter_world_embeddings.py` once so later registrations get
  vectors.

## Frontend

Feature-sliced: `src/app` (shell), `src/routes`, `src/features/*`, `src/shared`
(UI kit, entity-kit, API core), `src/styles` (dark-only tokens). `features/world`
is an empty placeholder. `docs/frontend/` holds the original design docs, which
source comments cite by section. They predate auth (`routes/guards/` is described
as empty) and show folders that no longer exist (`characters/queries/`), so trust
the tree over them. `IMPLEMENTATION_PLAN.md` there is the milestone log.

- The four entity features share `createEntityResource` (`shared/api/resource.ts`)
  and `shared/entity-kit/`. Extend those instead of copying per entity.
- Bundle boundaries only show up in built chunks, not in typecheck, lint or tests:
  - Entity descriptors import `DescribeAssist` from `features/ai/assist.ts`,
    never `features/ai/index.ts`.
  - `shared/entity-kit/route-params.ts` must stay import-free because it is in the
    eager bundle.
- `/ai/*` calls are mutations with no query keys or cache. Cancellation lives in
  `features/ai/queries/useAiRequest.ts`.
- Tests are pure TypeScript with MSW (`onUnhandledRequest: "error"`). There are no
  component tests, so verify rendering and interaction by hand.

## Rules

- Never read `backend/.env` into a commit, artifact, or Docker build context.
- Deployment is Vercel (`vercel.json` + `requirements.txt`). Docker is for local
  use and CI only. Vercel env var changes (`CORS_ORIGINS`, `VITE_API_BASE_URL`)
  need a redeploy.
