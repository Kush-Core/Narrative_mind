# Repository Analysis — Narrative Mind

> Factual knowledge base of the repository as it currently exists. Every statement
> below is derived from files present in the repository. Where a detail cannot be
> verified from the codebase, it is explicitly marked **UNKNOWN**. This document
> describes the current state only; it proposes no improvements and includes no
> future plans beyond what the source files themselves declare.

Analysis date: 2026-07-18. Branch: `main`.

---

# Project Overview

Narrative Mind is described in [backend/README.md](../backend/README.md) as "a
platform for building, understanding, and reasoning about fictional worlds." The
project metadata in [backend/pyproject.toml](../backend/pyproject.toml) names the
package `narrative-mind`, version `0.1.0`, description "Narrative Mind — a
Narrative Intelligence Platform", author Kushagra Singh
(`kushagra10010@gmail.com`).

The implemented capability is the **Narrative Graph (V1)**: an async FastAPI
service backed by Neo4j and a local Ollama LLM. It models four fictional-world
entity types — `Character`, `Location`, `Faction`, `Event` — as graph nodes,
supports relationships between them, and exposes two AI endpoints (prose
description and schema-constrained entity extraction).

The README states that longer-term platform capabilities (Character Management,
Timeline, Rich Text Editing, World Encyclopedia, AI Reasoning, Consistency
Checking, Knowledge Search) are "none of which are implemented yet." These are
mentioned only as narrative vision in the README and have no corresponding code.

Recent git history shows the project was rebranded from "Codex" to "Narrative
Mind" (commit `9abaf59`) and the backend was relocated into a `backend/`
directory for a "v2 monorepo layout" (commits `5af102b`, `2b0e132`).

---

# Repository Structure

The repository root contains a single application directory, `backend/`. There is
**no `frontend/` directory and no `docs/` directory** prior to this analysis
(verified by directory listing).

```
narrative_mind/                 (repo root)
├── .gitignore                  (contains only ".env")
├── .vscode/settings.json       (pytest config for the "backend" folder)
├── .pytest_cache/              (tooling cache, not tracked)
├── .ruff_cache/                (tooling cache, not tracked)
└── backend/
    ├── .env                    (present in working tree; gitignored)
    ├── .env.example
    ├── .gitignore              (Python artifacts, .venv, .env)
    ├── .python-version         ("3.12")
    ├── README.md
    ├── pyproject.toml
    ├── uv.lock
    └── src/narrative_mind/
        ├── __init__.py         (defines main() -> prints a greeting)
        ├── main.py             (FastAPI app factory + lifespan)
        ├── api/
        │   ├── deps.py         (all FastAPI dependency wiring)
        │   └── routers/
        │       ├── __init__.py (aggregates api_router)
        │       ├── systems.py  (/health)
        │       ├── characters.py
        │       ├── locations.py
        │       ├── factions.py
        │       ├── events.py
        │       ├── graph.py
        │       └── ai.py
        ├── core/
        │   ├── config.py       (Settings via pydantic-settings)
        │   ├── exceptions.py   (domain exception hierarchy)
        │   ├── error_handlers.py
        │   └── logging.py
        ├── db/
        │   ├── neo4j.py        (async driver lifecycle + session dep)
        │   └── migrations.py   (constraints + indexes)
        ├── domain/
        │   ├── common.py       (CharacterStatus, SortOrder, Page[T])
        │   ├── character.py
        │   ├── location.py
        │   ├── faction.py
        │   ├── event.py
        │   └── ai.py
        ├── providers/
        │   ├── deps.py         (LLM provider DI)
        │   └── llm.py          (LLMProvider Protocol + OllamaProvider)
        ├── repositories/
        │   ├── character_repo.py
        │   ├── location_repo.py
        │   ├── faction_repo.py
        │   ├── event_repo.py
        │   └── graph_repo.py
        ├── services/
        │   ├── character_service.py
        │   ├── location_service.py
        │   ├── faction_service.py
        │   ├── event_service.py
        │   ├── graph_service.py
        │   └── ai_service.py
        └── tests/
            ├── conftest.py
            ├── test_health.py
            ├── test_characters.py
            ├── test_events.py
            ├── test_factions.py
            ├── test_locations.py
            ├── test_graph.py
            ├── test_ai_service.py
            └── test_pydantic_models.py
```

All package `__init__.py` files are empty except `api/routers/__init__.py`
(12 lines, aggregates routers) and the top-level `narrative_mind/__init__.py`
(defines `main()`).

The package is built with the `uv_build` backend and layout `src/narrative_mind/`
(a src-layout package named `narrative_mind`).

---

# Backend Architecture

The README documents a layered architecture with one-directional dependencies:

```
api → services → repositories → db
```

with `core`, `domain`, and `providers` as leaf modules. This layering is
consistent with the imports observed in the source:

- **`api/`** — FastAPI routers plus `deps.py`, which constructs every
  dependency (repositories, services, pagination, settings, sessions, LLM).
- **`services/`** — business logic; each service depends only on a repository (or
  the LLM provider for `AIService`) and raises domain exceptions.
- **`repositories/`** — all Cypher lives here; methods return plain `dict`s from
  Neo4j map projections (`n {.*}`).
- **`providers/`** — the LLM abstraction (`LLMProvider` Protocol,
  `OllamaProvider` implementation).
- **`domain/`** — Pydantic v2 models organized as Create/Update/Read triads plus
  a generic `Page[T]`.
- **`core/`** — settings, logging, exception classes, exception→HTTP handlers.
- **`db/`** — async Neo4j driver lifecycle (module-global singleton), a session
  generator dependency, and idempotent migrations.

The app is assembled in [backend/src/narrative_mind/main.py](../backend/src/narrative_mind/main.py)
via a `create_app()` factory. `app = create_app()` is instantiated at module
import for ASGI servers.

---

# Request Lifecycle

Verified from `main.py` and the router/deps wiring:

1. **Startup (`lifespan`)** — `get_settings()` loads `Settings`;
   `configure_logging(settings.debug)` sets up stdout logging;
   `neo4j.connect(settings)` creates the async driver and calls
   `verify_connectivity()`; `run_migrations(driver)` applies constraints/indexes.
   On shutdown, `neo4j.close()` closes the driver.

2. **Middleware** — Two middleware are registered:
   - `CORSMiddleware` with `allow_origins=settings.cors_origins`,
     `allow_credentials=True`, and `allow_methods=["*"]`, `allow_headers=["*"]`.
   - A custom `add_timing` HTTP middleware that measures wall-clock duration,
     adds an `X-Process-Time-ms` response header, and logs
     `METHOD PATH -> STATUS (Nms)` at INFO level.

3. **Routing** — `register_error_handlers(app)` installs exception handlers, then
   `app.include_router(api_router)` mounts all routers.

4. **Per-request DI** — Route handlers declare `Annotated[..., Depends(...)]`
   dependencies. A request that touches the graph obtains an `AsyncSession` from
   `get_session()`, which is injected into a repository, which is injected into a
   service, which the router calls. Sessions are opened per-request via
   `async with get_driver().session() as session`.

5. **Response** — Handlers return Pydantic models; FastAPI serializes them using
   the declared `response_model`. Domain exceptions are converted to JSON error
   bodies by the registered handlers.

---

# Repository Layer

Location: [backend/src/narrative_mind/repositories/](../backend/src/narrative_mind/repositories/).

Common patterns across `character_repo.py`, `location_repo.py`,
`faction_repo.py`, `event_repo.py`:

- Each repository is constructed with an `AsyncSession` (`__init__(self, session)`).
- Public methods delegate to `session.execute_read` / `session.execute_write`
  with a `@staticmethod` transaction function (managed transactions).
- Reads and writes return plain dicts via map projection `RETURN x {.*} AS ...`.
- `create` raises `RuntimeError("Failed to create <entity>")` if no record
  returns.
- `delete` returns a `bool` derived from `count(x) AS deleted` after
  `DETACH DELETE`.
- `update` uses `SET x += $props` and returns the updated node dict or `None`.
- Each repository defines a class-level `_SORTABLE` whitelist and a `<Entity>_list`
  method (note the capitalized method names: `Character_list`, `Location_list`,
  `Faction_list`, `Event_list`).

**List query construction** (all four entity repositories): a `WHERE` clause is
built from only the filters that were provided (each optional filter appends a
clause and a bound parameter). Sorting interpolates `sort_by` and `order_kw`
directly into the Cypher string — the code comments note this is "safe here"
because `sort_by` is whitelisted against `_SORTABLE` (falling back to `"name"`)
and `order_kw` is derived to exactly `"ASC"` or `"DESC"`. The count and page are
computed in a single query using `collect(x) AS all_x` → `size(all_x) AS total`
→ `UNWIND` → `ORDER BY` → `SKIP $offset LIMIT $limit`.

**Filter columns per entity:**
- Character: `status` (equality), `name_contains` (case-insensitive CONTAINS).
- Location: `region` (equality), `name_contains`.
- Faction: `ideology` (equality), `name_contains`.
- Event: `name_contains` only.

**Sortable columns per entity (`_SORTABLE`):**
- Character: `name`, `created_at`, `status`.
- Location: `name`, `created_at`, `region`.
- Faction: `name`, `created_at`, `ideology`.
- Event: `name`, `created_at`, `timeline_order`.

**`CharacterRepository` extra method:** `touch_indexed_at(character_id)` sets
`c.last_indexed_at = <ISO timestamp>` (imports `datetime` inside the transaction
function). No other repository has this method.

**`GraphRepository`** ([graph_repo.py](../backend/src/narrative_mind/repositories/graph_repo.py)):
- `ego_network(character_id, depth)` — clamps `depth` to `max(1, min(depth, 3))`
  before interpolating it into a variable-length pattern
  `(c)-[*1..{depth}]-(n)`; returns `{"center", "neighbors"}` where neighbors are
  distinct nodes projected as `{.id, .name, labels: labels(n)}`, filtered to
  those with a non-null `id`. Returns `None` if the center character does not
  exist.
- `shortest_path(source, target)` — matches two `Character` nodes and computes
  `shortestPath((a)-[*..6]-(b))`; returns `{"hops": [...], "distance": length}`
  or `None`.
- `node_exists(node_id)` — `MATCH (n {id:$id}) RETURN count(n) > 0`; matches any
  label.
- `link(source_id, rel_type, target_id, sentiment)` — matches a `Character`
  source and an unlabeled target by id, then `MERGE (source)-[r:{rel_type}]->(target)`.
  `rel_type` is interpolated into the query string (validated upstream in
  `GraphService`, see below). If `sentiment` is not None it is set on the edge.
  Returns `{source_id, target_id, rel_type, sentiment}`.

---

# Service Layer

Location: [backend/src/narrative_mind/services/](../backend/src/narrative_mind/services/).

The four entity services (`character_service.py`, `location_service.py`,
`faction_service.py`, `event_service.py`) follow an identical shape:

- Constructed with their repository.
- `create(payload)` — builds the full Read model from the Create DTO
  (`Character(**payload.model_dump())`), persists `model.model_dump()`, and
  re-validates the returned row into the Read model. (For `Character`, the dump
  excludes the computed `display_name` field: `model_dump(exclude={"display_name"})`.)
- `get(id)` — returns the model or raises `NotFoundError`.
- `list(...)` — delegates to the repo and wraps results in `Page[Model]`.
- `update(id, payload)` — dumps the update DTO with `exclude_none=True`, applies
  it, and raises `NotFoundError` if the row is missing.
- `delete(id)` — raises `NotFoundError` if nothing was deleted.

**`CharacterService`** additionally has `reindex(character_id)`, which calls
`repo.touch_indexed_at` and logs via `logging.getLogger("narrative_mind.tasks")`.
It is scheduled as a FastAPI `BackgroundTask` after character creation (see the
Characters router).

**`GraphService`** ([graph_service.py](../backend/src/narrative_mind/services/graph_service.py)):
- Class-level `_ALLOWED_REL_TYPES = {"KNOWS", "MEMBER_OF", "LOCATED_IN", "PARTICIPATED_IN"}`.
- `link(character_id, payload)` — upper-cases and strips `rel_type`, raises
  `ValidationError` if not in the allow-list, checks both nodes exist via
  `node_exists` (raising `NotFoundError` otherwise), then calls `repo.link`.
- `get_network(character_id, depth)` and `shortest_path(source, target)` — wrap
  the repository methods and raise `NotFoundError` on a `None` result.

**`AIService`** ([ai_service.py](../backend/src/narrative_mind/services/ai_service.py)):
- Constructed with an `LLMProvider`.
- `describe(req)` — builds a two-sentence prompt from name/traits/tone, calls
  `llm.generate(...)` with a system prompt, returns `DescribeResponse`.
- `extract(passage)` — requests structured output using
  `ExtractResponse.model_json_schema()` as the format schema, then post-filters
  the model output. The filtering logic includes:
  - `_ENTITY_TYPE_MAP` — normalizes lowercased type strings to
    `Character | Location | Faction | Event`; entities with unknown types are
    dropped.
  - `_RELATION_TYPE_MAP` — maps a wide set of raw relation labels to canonical
    labels (`MEMBER_OF`, `KNOWS`, `ALLIED_WITH`, `LEADS`, `WORKS_AT`,
    `LOCATED_IN`, `MET_IN`, `RELATED_TO`).
  - `_RELATION_SIGNATURES` — allowed `(source_type, target_type)` pairs per
    relation; mismatches are dropped.
  - `_RELATION_EVIDENCE` — keyword evidence required in the passage for a
    relation to survive; relations lacking textual evidence are dropped.
    Special handling collapses `LEADS`/`WORKS_AT`/`MEMBER_OF` to `MEMBER_OF`
    when phrases like "captain of"/"member of"/"part of" appear.
  - Relationships are de-duplicated by `(source, rel_type, target)`.
  - JSON parsing falls back from `model_validate_json` to
    `model_validate(json.loads(raw))` on `ValueError`.

Note: the canonical relation labels produced by `AIService.extract`
(`ALLIED_WITH`, `LEADS`, `WORKS_AT`, `MET_IN`, `RELATED_TO`) are a **broader set**
than the `_ALLOWED_REL_TYPES` that `GraphService.link` will persist. The AI
extraction output is not written to the graph by any current code path; it is
returned to the caller only.

---

# API Surface

Routers are aggregated in
[api/routers/__init__.py](../backend/src/narrative_mind/api/routers/__init__.py)
in the order: systems, characters, locations, factions, events, graph, ai.

| Method | Path | Handler / Router | Notes |
|---|---|---|---|
| GET | `/health` | systems | Returns `{"status":"ok","environment":<env>}` |
| POST | `/characters` | characters | 201; schedules `reindex` background task |
| GET | `/characters` | characters | `Page[Character]`; filters + sort + pagination |
| GET | `/characters/{character_id}` | characters | 200 / 404 |
| PATCH | `/characters/{character_id}` | characters | Partial update |
| DELETE | `/characters/{character_id}` | characters | 204 |
| POST | `/characters/{character_id}/relationships` | characters | 201; delegates to `GraphService.link` |
| POST | `/locations` | locations | 201 |
| GET | `/locations` | locations | `Page[Location]`; `region` filter |
| GET/PATCH/DELETE | `/locations/{location_id}` | locations | Read / update / delete |
| POST | `/factions` | factions | 201 |
| GET | `/factions` | factions | `Page[Faction]`; `ideology` filter |
| GET/PATCH/DELETE | `/factions/{faction_id}` | factions | Read / update / delete |
| POST | `/events` | events | 201 |
| GET | `/events` | events | `Page[Event]`; `name_contains` only |
| GET/PATCH/DELETE | `/events/{event_id}` | events | Read / update / delete |
| GET | `/graph/characters/{character_id}/network` | graph | `depth` query, `ge=1, le=3`, default 1 |
| GET | `/graph/shortest-path` | graph | `source` & `target` query params |
| POST | `/ai/describe` | ai | Prose generation |
| POST | `/ai/extract` | ai | Schema-constrained extraction |

**List query parameters** (characters/locations/factions/events):
- `limit` (`Query(20, ge=1, le=100)`) and `offset` (`Query(0, ge=0)`) via the
  shared `pagination_params` dependency (default limit 20, max 100).
- `name_contains` (`min_length=1`), `sort_by` (default `"name"`), `order`
  (`SortOrder`, default `asc`).
- One categorical filter each: characters `status` (`CharacterStatus`),
  locations `region`, factions `ideology`. Events have no categorical filter.

The `create_character` handler is the only create endpoint that registers a
`BackgroundTasks` job (`svc.reindex`). The other three entity create endpoints do
not.

There is **no root (`/`) route** and **no `/docs` customization** beyond FastAPI
defaults; interactive docs are served at `/docs` per the README.

---

# DTOs & Models

Location: [backend/src/narrative_mind/domain/](../backend/src/narrative_mind/domain/).
All models are Pydantic v2 `BaseModel`.

**`common.py`:**
- `CharacterStatus(StrEnum)` — `alive`, `dead`, `unknown`.
- `SortOrder(StrEnum)` — `asc`, `desc`.
- `Page[T](BaseModel)` — generic page with `items`, `total`, `limit`, `offset`
  and a `has_more` computed property (`offset + len(items) < total`).

**Entity model triads.** Each of Character, Location, Faction, Event defines a
`Base` (with `model_config` and validators), a `Create` (subclasses Base,
currently a pass-through), an `Update` (independent model, all fields optional,
with a `model_validator` that rejects an empty update via
`if not self.model_fields_set`), and a Read model (subclasses Base, adds `id` and
`created_at`).

- **Character** ([character.py](../backend/src/narrative_mind/domain/character.py)):
  fields `name` (1–120), `aliases` (list, max 10, deduped case-insensitively via
  validator), `status` (`CharacterStatus`, default `alive`), `description`
  (≤2000). `model_config` uses `str_strip_whitespace`, `populate_by_name`,
  `use_enum_values`. Read model adds `id` (default `uuid4`, accepts alias `id`
  or `uuid`), `created_at` (ISO UTC), and a computed `display_name` property
  (`"<name> (<first alias>)"` or just name). Also defines
  `CharacterRelationshipCreate` (`rel_type`, `target_id`, optional `sentiment`).
- **Location**: `name`, `region` (≤120), `description` (≤2000).
- **Faction**: `name`, `ideology` (≤500), `description` (≤2000).
- **Event**: `name`, `summary` (≤2000), `timeline_order` (int, default 0).

All four entity Base models share a `name_not_blank` field validator and 1–120
length bounds on `name`.

**`ai.py`:**
- `DescribeRequest` — `name`, `traits` (list, default empty), `tone`
  (default `"neutral"`).
- `DescribeResponse` — `description`.
- `ExtractRequest` — `passage` (10–5000 chars).
- `ExtractedEntity` — `name`, `type`.
- `ExtractedRelationship` — `source`, `rel_type`, `target`.
- `ExtractResponse` — `entities`, `relationships`.

---

# Dependency Injection

Two DI modules:

**[api/deps.py](../backend/src/narrative_mind/api/deps.py)** defines the full
graph of FastAPI `Annotated[..., Depends(...)]` aliases:

- `Settings_Dep` → `get_settings` (an `lru_cache`d singleton).
- `Session_Dep` → `get_session` (per-request Neo4j `AsyncSession`).
- Per-entity repository providers and `*_Dep` aliases, each constructed from
  `Session_Dep`.
- `Pagination` dataclass + `pagination_params` (`limit`, `offset` with bounds)
  and `PaginationDep`.
- Per-entity service providers and `*_Dep` aliases, each constructed from the
  corresponding repository dep.
- `get_ai_service` → `AIService(llm)` and `AIServiceDep`, constructed from
  `LLMDep`.

Naming is inconsistent across the aliases: most use the `Name_Dep` /
`NameService_Dep` convention, but the AI/pagination ones use `AIServiceDep`,
`AIServiceDep`, `PaginationDep`, `LLMDep` (no underscore before `Dep`).

**[providers/deps.py](../backend/src/narrative_mind/providers/deps.py)** builds
the LLM provider. `get_llm` reads `Settings` and calls an `lru_cache`d
`_build_provider(host, chat, embed)` that constructs a fresh `Settings(...)` from
those three values and returns an `OllamaProvider`. `LLMDep` is the injectable
alias. Because `_build_provider` is cached on its three string arguments, a single
`OllamaProvider` instance is reused across requests for a given configuration.

Tests override DI via `app.dependency_overrides[get_llm]` (see
`test_ai_service.py`).

---

# Neo4j Integration

**Driver lifecycle** ([db/neo4j.py](../backend/src/narrative_mind/db/neo4j.py)):
- A module-global `_driver: AsyncDriver | None`.
- `connect(settings)` lazily creates `AsyncGraphDatabase.driver(uri, auth=(user, password))`
  and calls `verify_connectivity()`; idempotent (returns existing driver).
- `close()` closes and clears the driver.
- `get_driver()` raises `RuntimeError` if not yet connected.
- `get_session()` is an async generator yielding a session from
  `get_driver().session()` inside an `async with` block. Used as a FastAPI
  dependency.

**Migrations** ([db/migrations.py](../backend/src/narrative_mind/db/migrations.py)):
- `CONSTRAINTS` — unique `id` constraints for `Character`, `Location`, `Faction`,
  `Event` (all `IF NOT EXISTS`).
- `INDEXES` — `name` indexes for `Character`, `Location`, `Faction`. **There is
  no `name` index for `Event`** (verified; the `INDEXES` list has only three
  entries).
- `run_migrations(driver)` runs all statements in a single session on startup.

**Cypher usage** is confined to the repositories (see Repository Layer). Nodes
carry a string `id` (UUID by default), a `name`, entity-specific properties, and
`created_at`. Characters may also carry `last_indexed_at`. Relationships used in
tests/code: `KNOWS` (optional `sentiment`), `MEMBER_OF`. `GraphService`
additionally permits `LOCATED_IN` and `PARTICIPATED_IN`.

**Version note:** [pyproject.toml](../backend/pyproject.toml) pins
`neo4j>=6.2.0` (the Python driver), while the README's prose and Docker example
reference "Neo4j 5.x" (the server). The `.env.example` default URI is
`bolt://localhost:7687`; the README table example uses `neo4j://127.0.0.1:7687`.

---

# Error Handling

**Exception hierarchy** ([core/exceptions.py](../backend/src/narrative_mind/core/exceptions.py)):
- `NarrativeMindError(Exception)` — base, stores `message`.
- `NotFoundError`, `ConflictError`, `ValidationError` — subclasses.

**Handlers** ([core/error_handlers.py](../backend/src/narrative_mind/core/error_handlers.py)),
registered on the app:
- `NotFoundError` → 404, code `not_found`.
- `ConflictError` → 409, code `conflict`.
- `ValidationError` → 422, code `domain_validation`.
- `NarrativeMindError` (fallback) → 400, code `bad_request`.

All produce a body shaped `{"error": {"code": <code>, "message": <message>}}`.
Tests assert on `error.code` (e.g. `not_found`, `domain_validation`).

`ConflictError` is defined and handled but **is not raised anywhere** in the
current source (verified by inspection — only `NotFoundError` and
`ValidationError` are raised, in the services). Pydantic request-validation
errors are handled by FastAPI's built-in 422 mechanism, not these custom
handlers.

---

# Configuration

**Settings** ([core/config.py](../backend/src/narrative_mind/core/config.py)):
`Settings(BaseSettings)` from `pydantic-settings`, `model_config` uses
`env_file=".env"`, `env_file_encoding="utf-8"`, `extra="ignore"`. Fields with
defaults:

| Field | Default |
|---|---|
| `app_name` | `"Narrative Mind"` |
| `environment` | `"development"` |
| `debug` | `True` |
| `neo4j_uri` | `"bolt://localhost:7687"` |
| `neo4j_user` | `"neo4j"` |
| `neo4j_password` | `"password123"` |
| `ollama_host` | `"http://localhost:11434"` |
| `ollama_chat_model` | `"llama3.2:3b"` |
| `ollama_embed_model` | `"nomic-embed-text-v2-moe:latest"` |
| `cors_origins` | `["http://localhost:5173"]` |

`get_settings()` is `lru_cache`d. Environment variables are matched
case-insensitively to field names (per pydantic-settings). `.env.example`
documents these; `.env` exists in the working tree and is gitignored (both root
`.gitignore` — a single line `.env` — and `backend/.gitignore` exclude it).

A code comment marks Ollama settings as "used from Phase 10", and the README
describes `ollama_embed_model` as "reserved for RAG in V2". The `embed` method
exists on the provider but no service currently calls it.

**Logging** ([core/logging.py](../backend/src/narrative_mind/core/logging.py)):
`configure_logging(debug)` sets root level to DEBUG or INFO and logs to stdout
with format `%(asctime)s %(levelname)s %(name)s %(message)s`.

---

# Naming Conventions

Verified observations (descriptive, not prescriptive):

- **Modules/packages:** lowercase, snake_case (`character_repo.py`,
  `error_handlers.py`).
- **Classes:** PascalCase (`CharacterRepository`, `AIService`, `Settings`).
- **Functions/variables:** snake_case.
- **Domain model triads:** `<Entity>Base`, `<Entity>Create`, `<Entity>Update`,
  `<Entity>` (Read).
- **Inconsistencies present in the code:**
  - Repository list methods are capitalized (`Character_list`, `Location_list`,
    `Faction_list`, `Event_list`) — mixing PascalCase-prefixed method names with
    snake_case, unlike every other method.
  - DI alias naming mixes `Name_Dep` (e.g. `CharacterService_Dep`) and `NameDep`
    (e.g. `PaginationDep`, `LLMDep`, `AIServiceDep`).
- **Relationship types:** UPPER_SNAKE_CASE Cypher labels (`MEMBER_OF`, `KNOWS`).
- **Error codes:** lower_snake strings (`not_found`, `domain_validation`).

---

# Existing Documentation

- **[backend/README.md](../backend/README.md)** — the primary documentation:
  overview, architecture summary, prerequisites, setup (uv sync, `.env`, Neo4j
  Docker, Ollama), run command, an API-surface table, example curl requests, and
  development commands (ruff check/format, pytest). It documents the allowed
  `rel_type` values and notes which tests need external services.
- **[backend/.env.example](../backend/.env.example)** — annotated environment
  template.
- **Inline comments** — present in list-query construction (SQL-injection-safety
  rationale), the graph depth clamp, and the AI test (explaining why the
  TestClient is used without a context manager). Docstrings are sparse and mostly
  on the exception classes and the `LLMProvider` protocol.
- No `CHANGELOG`, `CONTRIBUTING`, `LICENSE`, architecture-decision records, or
  OpenAPI export file are present.
- Prior to this analysis there was **no `docs/` directory** and no root README.

---

# Third-Party Dependencies

From [backend/pyproject.toml](../backend/pyproject.toml). Requires Python `>=3.12`
(pinned to `3.12` in `.python-version`).

**Runtime dependencies:**
- `fastapi[standard]>=0.137.2` — web framework (the `standard` extra pulls in
  uvicorn, the CLI, etc.).
- `neo4j>=6.2.0` — official async Neo4j driver.
- `ollama>=0.6.2` — Ollama Python client (`AsyncClient`).
- `pydantic-settings>=2.14.2` — settings management (Pydantic v2 is pulled in
  transitively and used directly for models).

**Dev dependencies (`[dependency-groups].dev`):**
- `httpx2>=2.5.0`
- `pytest>=9.1.1`
- `ruff>=0.15.18`

**Build system:** `uv_build>=0.11.18,<0.12.0` (`[tool.uv] package = true`).
An exact lockfile [backend/uv.lock](../backend/uv.lock) is committed. A
`.venv/` is present in the working tree (gitignored).

**Tooling config (in pyproject):**
- Ruff: `line-length = 100`, `target-version = "py312"`, lint rules
  `["E", "F", "I", "B", "UP", "SIM"]`, format `quote-style = "double"`.

**Console script:** `narrative-mind = "narrative_mind:main"` (prints
"Hello from Narrative Mind!").

**Note on the test HTTP client:** the dev dependency is `httpx2`, but the test
suite uses `fastapi.testclient.TestClient`. **UNKNOWN** whether `httpx2` (vs. the
`httpx` that `TestClient` normally requires) is actually the client backing
`TestClient`; this cannot be confirmed without inspecting the installed
environment/lockfile resolution.

---

# Testing Structure

Location: [backend/src/narrative_mind/tests/](../backend/src/narrative_mind/tests/).
Test framework is pytest. VS Code is configured
([.vscode/settings.json](../.vscode/settings.json)) to run pytest against the
`backend` folder. There is no separate `pytest.ini`, `tox.ini`, or root
`conftest.py`; the only `conftest.py` is inside the tests package.

- **`conftest.py`** — a `client` fixture that builds the app via `create_app()`
  and yields a `TestClient` inside a context manager (so app lifespan runs,
  opening the Neo4j connection).
- **Unit / no-external-service tests:**
  - `test_pydantic_models.py` — validators, computed fields, empty-update
    rejection, `uuid` alias, defaults.
  - `test_ai_service.py` — uses a `_FakeLLM` to test `AIService.extract`
    filtering, and a `_StubLLM` with `dependency_overrides[get_llm]` to test
    `/ai/describe` without Ollama (TestClient used without a context manager to
    skip lifespan/Neo4j).
- **Integration tests (require a running Neo4j):**
  - `test_health.py` — `/health` returns `ok`.
  - `test_characters.py` — CRUD lifecycle, pagination boundaries, relationship
    creation (`MEMBER_OF`), target-not-found (404), invalid rel type (422).
  - `test_events.py`, `test_factions.py`, `test_locations.py` — each contains
    exactly two tests (verified): a missing-entity 404 test and a CRUD lifecycle
    test (create → get → patch → delete → confirm 404, with `finally` cleanup).
    Events assert on `timeline_order`, factions on `ideology`, locations on
    `region`. Unlike `test_characters.py`, these three do **not** cover
    pagination or relationships.
  - `test_graph.py` — ego-network 404, network includes linked neighbor,
    shortest-path between linked characters.

The README states integration tests use uniquely suffixed names (`uuid4().hex`)
and clean up the nodes they create (verified in `test_characters.py` and
`test_graph.py` via `finally` cleanup blocks).

---

# Current Frontend Status

There is **no frontend in the repository** (verified: no `frontend/` directory,
no JS/TS package files, no HTML/CSS assets). The only client-facing surfaces are
the FastAPI JSON API and the auto-generated `/docs` (Swagger UI). The
`cors_origins` default (`http://localhost:5173`, the Vite dev-server default port)
and the commit message mentioning a "v2 monorepo layout" suggest a frontend is
anticipated, but none exists in the current tree.

---

# Observations

Verified facts that are notable but stated here without recommendation:

1. **Event has no name index** while the other three entities do
   (`db/migrations.py`).
2. **`ConflictError` is defined and wired to a 409 handler but never raised** by
   any service or repository.
3. **`OllamaProvider.embed` is implemented but unused** — no service calls it;
   the embed model is documented as reserved for future RAG.
4. **AI extraction produces relation labels outside the graph-writable set** —
   `AIService.extract` can return `ALLIED_WITH`, `LEADS`, `WORKS_AT`, `MET_IN`,
   `RELATED_TO`, while `GraphService.link` only accepts `KNOWS`, `MEMBER_OF`,
   `LOCATED_IN`, `PARTICIPATED_IN`. Extraction results are not persisted by any
   code path.
5. **Naming inconsistencies** exist in repository list-method names
   (`Character_list` etc.) and DI alias suffixes (`_Dep` vs `Dep`).
6. **Neo4j driver version mismatch in documentation** — `pyproject.toml` requires
   the `neo4j>=6.2.0` Python driver while the README prose references Neo4j 5.x
   server; the `.env.example` and README URIs differ in scheme (`bolt://` vs
   `neo4j://`).
7. **Only character creation schedules a background task** (`reindex`); the other
   entity creations do not, and there is no equivalent `last_indexed_at` field or
   reindex path for locations/factions/events.
8. **Graph link target is unlabeled** — `GraphRepository.link` matches the target
   by `id` only (`MATCH (target {id:$target_id})`), so a character may be linked
   to any node type; type-appropriateness is not enforced at the graph layer.
9. **`Page.has_more` is a computed property** but is not part of the serialized
   `Page` schema fields by default (it is a plain `@property`, not a Pydantic
   field or `@computed_field`), so it does not appear in list responses.
   **UNKNOWN** whether this omission is intentional.
10. **The `narrative_mind:main` console entry point** is a placeholder that only
    prints a greeting; the real ASGI entry point is `narrative_mind.main:app`.

**Items that cannot be verified from the codebase (UNKNOWN):**
- The exact resolved version and role of `httpx2` relative to `TestClient`.
- Whether any CI/CD pipeline exists (no CI config files are present in the repo).
- Runtime behavior of the Ollama and Neo4j integrations (requires live services;
  only the code paths are documented here).
