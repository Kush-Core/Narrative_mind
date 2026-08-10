# Narrative Mind — A Narrative Intelligence Platform

Narrative Mind is a platform for building, understanding, and reasoning about
fictional worlds. Its foundational capability is the **Narrative Graph**: an
async **FastAPI + Neo4j + Ollama** backend that models the entities of a
fictional world — `Character`, `Location`, `Faction`, `Event` — and the
relationships between them as a graph, and exposes two AI endpoints (prose
generation and schema-constrained entity extraction) behind a swappable LLM
provider.

This repository currently implements the Narrative Graph (V1). The longer-term
platform vision layers additional narrative intelligence capabilities on top
of it — Character Management, Timeline, Rich Text Editing, World Encyclopedia,
AI Reasoning, Consistency Checking, and Knowledge Search — none of which are
implemented yet.

## Architecture

Layered, one-directional dependencies: `api → services → repositories → db`,
with `core`, `domain`, and `providers` as leaves.

- **`api/`** — routers and request-scoped dependency injection (HTTP ↔ domain).
- **`services/`** — business rules and orchestration; raise domain errors only.
- **`repositories/`** — all Cypher; return plain dicts via map projections.
- **`providers/`** — the LLM behind a `Protocol` (`OllamaProvider`).
- **`domain/`** — Pydantic v2 models (Create/Update/Read DTO triads, `Page[T]`).
- **`core/`** — config, logging, exception hierarchy, error handlers.
- **`db/`** — async Neo4j driver lifecycle, session dependency, idempotent migrations.

## Prerequisites

- **Python 3.12+**
- **[uv](https://docs.astral.sh/uv/)** — packaging and virtual-environment manager
- **Neo4j 5.x** — reachable via the Bolt protocol (local Docker or a managed instance)
- **[Ollama](https://ollama.com)** — local LLM runtime (required for the `/ai` endpoints)

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

Environment variables (matched case-insensitively to `Settings` fields):

| Variable | Purpose | Example |
|---|---|---|
| `ENVIRONMENT` | `development` or `production` | `development` |
| `DEBUG` | Verbose logging / debug mode | `true` |
| `NEO4J_URI` | Bolt URI of the Neo4j server | `neo4j://127.0.0.1:7687` |
| `NEO4J_USER` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | `password123` |
| `OLLAMA_HOST` | Ollama server base URL | `http://localhost:11434` |
| `OLLAMA_CHAT_MODEL` | Chat model for `/ai/describe` and `/ai/extract` | `llama3.2:3b` |
| `OLLAMA_EMBED_MODEL` | Embedding model (reserved for RAG in V2) | `nomic-embed-text-v2-moe:latest` |
| `CORS_ORIGINS` | JSON array of allowed browser origins | `["http://localhost:5173"]` |

`.env` is gitignored; never commit real secrets.

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

```bash
ollama pull llama3.2:3b            # required for /ai/describe and /ai/extract
ollama pull nomic-embed-text-v2-moe   # optional in V1 (used by RAG in V2)
```

## Running the API

```bash
uv run uvicorn narrative_mind.main:app --reload
```

- Interactive API docs: <http://localhost:8000/docs>
- Liveness probe: <http://localhost:8000/health>

## API surface (V1)

| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness probe |
| `POST /characters` · `GET /characters` | Create · list (pagination/filter/sort) |
| `GET/PATCH/DELETE /characters/{id}` | Read · partial update · delete |
| `POST /characters/{id}/relationships` | Link a character to another node |
| `GET /graph/characters/{id}/network?depth=` | Ego-network traversal |
| `GET /graph/shortest-path?source=&target=` | Shortest path between two characters |
| `POST /ai/describe` | Generate a prose description |
| `POST /ai/extract` | Schema-constrained entity extraction |

`/locations`, `/factions`, and `/events` expose the same five CRUD routes as
`/characters`. List endpoints accept `limit`, `offset`, `name_contains`,
`sort_by`, `order`, plus one categorical filter each (`status` for characters,
`region` for locations, `ideology` for factions).

## Example requests

Create a character:

```bash
curl -X POST localhost:8000/characters \
  -H 'content-type: application/json' \
  -d '{"name":"Aria Vane","status":"alive","aliases":["The Vane"]}'
```

List with filter, sort, and pagination:

```bash
curl "localhost:8000/characters?status=alive&sort_by=name&order=desc&limit=10&offset=0"
```

Create a faction and link a character to it (use the ids returned above):

```bash
curl -X POST localhost:8000/factions \
  -H 'content-type: application/json' -d '{"name":"Iron Pact","ideology":"Order"}'

curl -X POST localhost:8000/characters/<CHARACTER_ID>/relationships \
  -H 'content-type: application/json' \
  -d '{"rel_type":"MEMBER_OF","target_id":"<FACTION_ID>"}'
```

Allowed `rel_type` values: `KNOWS`, `MEMBER_OF`, `LOCATED_IN`, `PARTICIPATED_IN`.
`KNOWS` edges may carry an optional `sentiment`.

Traverse the graph:

```bash
curl "localhost:8000/graph/characters/<CHARACTER_ID>/network?depth=2"
curl "localhost:8000/graph/shortest-path?source=<ID_A>&target=<ID_B>"
```

AI generation and extraction (require Ollama running with the chat model):

```bash
curl -X POST localhost:8000/ai/describe \
  -H 'content-type: application/json' \
  -d '{"name":"Aria Vane","traits":["cunning","loyal"],"tone":"ominous"}'

curl -X POST localhost:8000/ai/extract \
  -H 'content-type: application/json' \
  -d '{"passage":"Aria Vane, a captain of the Iron Pact, met Borin in the city of Dunhollow."}'
```

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
