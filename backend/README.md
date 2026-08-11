# Narrative Mind — Backend

The Narrative Graph API: an async **FastAPI + Neo4j** service that models the
entities of a fictional world — `Character`, `Location`, `Faction`, `Event` —
and the relationships between them as a graph, and exposes two AI endpoints
(prose generation and schema-constrained entity extraction) behind a swappable
LLM provider: **Ollama** for local development, **Groq** in deployment. One
`LLM_PROVIDER` env var chooses between them and nothing above `providers/`
knows which is in use.

This document covers the backend only — setup, the API surface, and deploying
it. For what the project is, how the two halves fit together, and what is and
isn't built, see the [root README](../README.md); for the web workspace that
consumes this API, see [`../frontend/README.md`](../frontend/README.md).

## Architecture

Layered, one-directional dependencies: `api → services → repositories → db`,
with `core`, `domain`, and `providers` as leaves.

- **`api/`** — routers and request-scoped dependency injection (HTTP ↔ domain).
- **`services/`** — business rules and orchestration; raise domain errors only.
- **`repositories/`** — all Cypher; return plain dicts via map projections.
- **`providers/`** — the LLM behind a `Protocol` (`LLMProvider`), implemented
  twice: `OllamaProvider` and `GroqProvider`.
- **`domain/`** — Pydantic v2 models (Create/Update/Read DTO triads, `Page[T]`).
- **`core/`** — config, logging, exception hierarchy, error handlers.
- **`db/`** — async Neo4j driver lifecycle, session dependency, idempotent migrations.

## Prerequisites

- **Python 3.12+**
- **[uv](https://docs.astral.sh/uv/)** — packaging and virtual-environment manager
- **Neo4j 5.x** — reachable via the Bolt protocol (local Docker or a managed instance)
- **[Ollama](https://ollama.com)** — local LLM runtime; required for the `/ai`
  endpoints under the default provider, and not needed at all if you point
  `LLM_PROVIDER` at Groq. Everything else works without it.

## Setup

### 1. Install dependencies

```bash
uv sync
```

This creates `.venv/` and installs the exact locked dependency set from `uv.lock`.

### 2. Configure environment

Copy the example file and adjust values as needed:

```bash
cp .env.example .env
```

Every setting below is a field on `Settings` (`core/config.py`), matched
case-insensitively, read from `.env` or the real environment. Unknown variables
are ignored rather than rejected (`extra="ignore"`), so a stray var from another
project's config won't stop the app booting. The **Default** column is the value
the app falls back to when the variable is absent — not what `.env.example`
ships, which is called out where the two differ.

**Application**

| Variable | Purpose | Default |
|---|---|---|
| `APP_NAME` | FastAPI title, shown at `/docs` | `Narrative Mind` |
| `ENVIRONMENT` | `development` or `production`; echoed back by `/health` | `development` |
| `DEBUG` | Verbose logging and FastAPI debug mode | `true` |
| `CORS_ORIGINS` | JSON array of allowed browser origins | `[]` — i.e. no browser origin is allowed until you set it |

**Neo4j**

| Variable | Purpose | Default |
|---|---|---|
| `NEO4J_URI` | Bolt URI of the server (`neo4j+s://…` for Aura) | `bolt://localhost:7687` |
| `NEO4J_USERNAME` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password — **must be set**; the empty default won't authenticate | `""` (`.env.example` ships `password123`, matching the compose file) |

**LLM provider** — only affects the two `/ai` routes

| Variable | Purpose | Default |
|---|---|---|
| `LLM_PROVIDER` | `ollama` or `groq`; compared lowercased and stripped | `ollama` |
| `OLLAMA_HOST` | Ollama server base URL | `http://localhost:11434` |
| `OLLAMA_CHAT_MODEL` | Chat model for `/ai/describe` and `/ai/extract` | `llama3.2:3b` |
| `OLLAMA_EMBED_MODEL` | Embedding model — Ollama only, and unused in V1 (reserved for RAG in V2; `GroqProvider.embed` raises `NotImplementedError`) | `nomic-embed-text-v2-moe:latest` |
| `GROQ_API_KEY` | **Required when `LLM_PROVIDER=groq`**; never read otherwise | `""` |
| `GROQ_CHAT_MODEL` | Groq chat model. Keep this an `openai/gpt-oss-*` model — `/ai/extract` sends a `json_schema` response format that only those support | `openai/gpt-oss-120b` |

**Authentication**

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET_KEY` | HS256 signing key — **must be set to a real random value** (`openssl rand -hex 32`). PyJWT rejects an empty HMAC key, so with the default left blank `/auth/register` still succeeds but `/auth/login` fails with a 500 | `""` |
| `JWT_ALGORITHM` | Token signing algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime in minutes | `30` |

**Worlds**

| Variable | Purpose | Default |
|---|---|---|
| `SEED_NEW_USER_WORLD` | Give each new account its own copy of the starter world at registration, so a first login opens onto a populated graph. Set `false` for empty accounts — the test suite does, since a world arriving unasked is indistinguishable from data a test created | `true` |

`.env` is gitignored; never commit real secrets. The `.env.example` values for
`GROQ_API_KEY` and `JWT_SECRET_KEY` are placeholders, not working credentials.

### 3. Start Neo4j

Any Neo4j 5.x instance works. From the repo root, a `docker-compose.yml` is
provided for local development:

```bash
docker compose up -d neo4j
```

This starts Neo4j 5 on `localhost:7687` (Bolt) and `localhost:7474` (browser
UI) with credentials `neo4j` / `password123`, matching `.env.example`, and
persists data in a named volume across restarts.

Constraints and indexes are created automatically on application startup
(see `db/migrations.py`); no manual schema step is required.

### 4. Start Ollama and pull the model

Only for the default `LLM_PROVIDER=ollama`; skip this if you are running against
Groq (see the next section).

```bash
ollama pull llama3.2:3b            # required for /ai/describe and /ai/extract
ollama pull nomic-embed-text-v2-moe   # optional in V1 (used by RAG in V2)
```

## LLM provider: Ollama (local) vs Groq (deployed)

This app supports two interchangeable `LLMProvider` implementations
(`providers/llm.py`), selected by the `LLM_PROVIDER` env var:

- **`ollama`** (default) — talks to a local Ollama server. This is what
  `.env.example` ships with and what you should use for local development,
  per the steps above.
- **`groq`** — talks to the hosted [Groq](https://console.groq.com) API.
  This exists solely because the production deployment runs on Vercel
  serverless functions, which have no persistent process to host a local
  model against — there is no VPS running Ollama in production. Groq is
  **deployment-only**; you don't need it (or a Groq account) to develop or
  run this project locally.

If you forked this repo and only want to run it locally, `LLM_PROVIDER=ollama`
(the default) is already correct — no changes needed. If your `.env` was
copied from a deployment config and has `LLM_PROVIDER=groq`, switch back:

1. In `.env`, set `LLM_PROVIDER=ollama` (or delete the line — `ollama` is
   the default).
2. Make sure `OLLAMA_HOST`, `OLLAMA_CHAT_MODEL`, and `OLLAMA_EMBED_MODEL`
   point at your local server (see `.env.example`).
3. Complete step 4 above (start Ollama, pull the model) if you haven't.
4. Restart the API — `GROQ_API_KEY` can stay blank; it's only read when
   `LLM_PROVIDER=groq`.

## Running the API

```bash
uv run uvicorn narrative_mind.main:app --reload
```

- Interactive API docs: <http://localhost:8000/docs>
- Liveness probe: <http://localhost:8000/health>

## API surface (V1)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | — | Liveness probe |
| `POST /auth/register` | — | Create an account |
| `POST /auth/login` | — | Exchange credentials for a bearer token |
| `POST /characters` · `GET /characters` | ✓ | Create · list (pagination/filter/sort) |
| `GET/PATCH/DELETE /characters/{id}` | ✓ | Read · partial update · delete |
| `POST /characters/{id}/relationships` | ✓ | Link a character to another node |
| `GET /graph/characters/{id}/network?depth=` | ✓ | Ego-network traversal |
| `GET /graph/shortest-path?source=&target=` | ✓ | Shortest path between two characters |
| `POST /ai/describe` | ✓ | Generate a prose description |
| `POST /ai/extract` | ✓ | Schema-constrained entity extraction |

`/locations`, `/factions`, and `/events` expose the same five CRUD routes as
`/characters` (all ✓ auth). List endpoints accept `limit`, `offset`,
`name_contains`, `sort_by`, `order`, plus one categorical filter each
(`status` for characters, `region` for locations, `ideology` for factions).

## Authentication

Every route except `/health` and `/auth/*` requires a JWT bearer token
(`api/deps.py:get_current_user`, backed by `HTTPBearer`). Register, log in,
and pass the token on every subsequent request:

```bash
curl -X POST localhost:8000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"gm@example.com","password":"correct-horse-battery-staple"}'

TOKEN=$(curl -s -X POST localhost:8000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"gm@example.com","password":"correct-horse-battery-staple"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
```

Tokens are signed HS256 and expire after `ACCESS_TOKEN_EXPIRE_MINUTES`
(default 30). There is no refresh endpoint in V1 — an expired token means
logging in again.

### Worlds are per account

Registering creates the account **and** its own copy of the starter world (27
entities, 69 relationships), so the token above already has a graph behind it.

Every entity node carries an `owner_id`, and the four entity repositories plus
`GraphRepository` are constructed with the authenticated user's id and filter
every query by it. Nothing above the repository layer passes an owner or knows
one exists: `get_*_repository` in `api/deps.py` injects it, which also means a
repository cannot be built without a valid token, and no method added later can
forget to scope itself.

Consequences worth knowing:

- Another account's entity responds **404, not 403** — it is absent from the
  match rather than hidden from the response, which is the answer that reveals
  least.
- Relationships cannot cross accounts. `POST /characters/{id}/relationships`
  requires both endpoints to be yours, which is what keeps the graph partitioned
  and traversals unable to walk out of your own world.
- `owner_id` is on the node but not in any response body, so the API contract is
  the same as before ownership existed.
- To reset an account's world: `uv run python scripts/seed_world.py <email>`.

## Example requests

Every example below assumes `TOKEN` is set as shown above.

Create a character:

```bash
curl -X POST localhost:8000/characters \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Aria Vane","status":"alive","aliases":["The Vane"]}'
```

List with filter, sort, and pagination:

```bash
curl "localhost:8000/characters?status=alive&sort_by=name&order=desc&limit=10&offset=0" \
  -H "authorization: Bearer $TOKEN"
```

Create a faction and link a character to it (use the ids returned above):

```bash
curl -X POST localhost:8000/factions \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Iron Pact","ideology":"Order"}'

curl -X POST localhost:8000/characters/<CHARACTER_ID>/relationships \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"rel_type":"MEMBER_OF","target_id":"<FACTION_ID>"}'
```

Allowed `rel_type` values: `KNOWS`, `MEMBER_OF`, `LOCATED_IN`, `PARTICIPATED_IN`.
`KNOWS` edges may carry an optional `sentiment`.

Traverse the graph:

```bash
curl "localhost:8000/graph/characters/<CHARACTER_ID>/network?depth=2" \
  -H "authorization: Bearer $TOKEN"
curl "localhost:8000/graph/shortest-path?source=<ID_A>&target=<ID_B>" \
  -H "authorization: Bearer $TOKEN"
```

AI generation and extraction (require whichever provider `LLM_PROVIDER` selects
to be reachable — by default, Ollama running with the chat model pulled):

```bash
curl -X POST localhost:8000/ai/describe \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Aria Vane","traits":["cunning","loyal"],"tone":"ominous"}'

curl -X POST localhost:8000/ai/extract \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"passage":"Aria Vane, a captain of the Iron Pact, met Borin in the city of Dunhollow."}'
```

## Deployment (Vercel + Neo4j Aura + Groq)

Production runs the backend as Vercel serverless functions, backed by a
managed Neo4j Aura instance and Groq for the `/ai` endpoints (see
[LLM provider](#llm-provider-ollama-local-vs-groq-deployed) above for why
Ollama isn't used in production).

**One-time setup:**

1. **Neo4j** — create a free instance at
   [console.neo4j.io](https://console.neo4j.io) (AuraDB Free). Save the
   generated `NEO4J_URI` (`neo4j+s://...`), username, and password.
2. **Groq** — create an API key at
   [console.groq.com](https://console.groq.com).
3. **Vercel project** — import this repo, set **Root Directory** to
   `backend`. The repo already includes `backend/vercel.json` (routes all
   requests to the FastAPI `app`) and `backend/requirements.txt` (pinned
   deps, since Vercel's Python builder doesn't read `uv.lock` — regenerate
   it after dependency changes with
   `uv export --no-hashes --no-dev -o requirements.txt`).
4. **Environment variables** — set these in the Vercel project's
   **Settings → Environment Variables** (they are separate from your local
   `.env` and from the frontend Vercel project's variables):

   | Variable | Value |
   |---|---|
   | `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` | from the Aura instance |
   | `LLM_PROVIDER` | `groq` |
   | `GROQ_API_KEY` | from console.groq.com |
   | `GROQ_CHAT_MODEL` | `openai/gpt-oss-120b` |
   | `JWT_SECRET_KEY` | a real random value, e.g. `openssl rand -hex 32` — never the `.env.example` placeholder |
   | `JWT_ALGORITHM` | `HS256` |
   | `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` |
   | `CORS_ORIGINS` | JSON array of the deployed **frontend** origin, e.g. `["https://your-app.vercel.app"]` |
   | `ENVIRONMENT` / `DEBUG` | `production` / `false` |

5. Deploy. Vercel auto-suggests env var names it finds in `.env.example`
   files anywhere in the repo — including the frontend's `VITE_*` vars —
   when setting up a project; ignore/delete any that don't belong to this
   project rather than filling them in.

**Gotchas hit in practice, worth checking first if something breaks:**

- **CORS preflight fails (400 on `OPTIONS`)** — `CORS_ORIGINS` must be
  valid JSON (`["https://exact-origin.vercel.app"]`, matching scheme and
  no trailing slash) and must be redeployed after editing; env var changes
  don't apply to already-built deployments.
- **`/ai/*` routes fail in production but the Groq key works via curl** —
  confirm `LLM_PROVIDER` is set to lowercase `groq` in the Vercel env vars
  (the app normalizes case, but double-check nothing else is misspelled)
  and that you redeployed after adding the env vars.
- **Frontend loads blank** — check the browser console first; a blank page
  with no console error usually means the build output/routing is fine and
  the real failure is a backend call failing (CORS, wrong
  `VITE_API_BASE_URL`, etc.), not the frontend itself.

## Development

Lint, format, and test:

```bash
uv run ruff check .        # lint
uv run ruff format .       # format
uv run pytest -q           # run the test suite
```

The model tests (`tests/test_pydantic_models.py`) and the AI stub-provider test
(`tests/test_ai_service.py`) run without external services. The remaining tests
are integration tests that exercise real Cypher against the configured Neo4j
instance, so **Neo4j must be running** for the full suite to pass. Each
integration test uses uniquely suffixed names and deletes the nodes it creates.
