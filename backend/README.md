# Narrative Mind — Backend

The Narrative Graph API: an async **FastAPI + Neo4j** service that models the
entities of a fictional world — `Character`, `Location`, `Faction`, `Event` —
and the relationships between them as a graph. On top of CRUD and traversal it
exposes two independent AI surfaces, each behind its own swappable provider so
nothing above `providers/` knows which concrete implementation is in use:

- **Chat** (`LLM_PROVIDER`: **Ollama** locally, **Groq** in deployment) —
  `POST /ai/describe` (prose generation) and `POST /ai/extract`
  (schema-constrained entity extraction).
- **Embeddings** (`EMBEDDING_PROVIDER`: **Ollama** locally, **Google** in
  deployment) — power Graph RAG: every entity carries a vector of its own
  text, `POST /ai/retrieve` runs vector search plus graph expansion into a
  citable context block, and `POST /ai/ask` generates a grounded answer from
  it. Groq has no embeddings endpoint, which is why this is a second,
  independent provider axis rather than a third `LLMProvider` method.

This document covers the backend only — setup, the API surface, and deploying
it. For what the project is, how the two halves fit together, and what is and
isn't built, see the [root README](../README.md); for the web workspace that
consumes this API, see [`../frontend/README.md`](../frontend/README.md).

## Architecture

Layered, one-directional dependencies: `api → services → repositories → db`,
with `core`, `domain`, and `providers` as leaves.

- **`api/`** — routers and request-scoped dependency injection (HTTP ↔ domain).
- **`services/`** — business rules and orchestration; raise domain errors only.
  Includes the RAG pipeline: `embedding_service` (canonical text → vector →
  persist), `retrieval_service` (embed → seed → expand → serialize), and
  `rag_service` (prompt, generate, validate citations).
- **`repositories/`** — all Cypher; return plain dicts via map projections.
  `embedding_repo` and `graph_repo` are label-generic — one repo across all
  four entity types rather than a method on each.
- **`providers/`** — two independent `Protocol`-based seams: `LLMProvider`
  (chat — `OllamaProvider`, `GroqProvider`) and `EmbeddingProvider`
  (embeddings — `OllamaEmbeddingProvider`, `GoogleEmbeddingProvider`,
  `FakeEmbeddingProvider` for tests). Each is resolved independently in
  `providers/deps.py`.
- **`domain/`** — Pydantic v2 models (Create/Update/Read DTO triads, `Page[T]`,
  `rag.py`'s retrieval/ask DTOs).
- **`core/`** — config, logging, exception hierarchy, error handlers.
- **`db/`** — async Neo4j driver lifecycle, session dependency, idempotent migrations.

### The two Graph RAG decisions worth knowing before you change anything

**1. Retrieval is an exact, owner-scoped cosine scan — not
`db.index.vector.queryNodes()`.** Neo4j's vector index returns the global
top-K across the *entire database* and has no pre-filter. In a single-tenant
app that is fine. Here every node carries an `owner_id`, so asking the index
for the top 10 can return ten nodes belonging to ten other accounts, and the
owner-scoped post-filter then yields **zero results for a caller whose world is
perfectly healthy**. The failure gets worse the more accounts exist — which
means it passes every test written against a fresh database and degrades
silently in production. `EmbeddingRepository` instead matches the owner's nodes
first and scores each with `vector.similarity.cosine()` (Neo4j 5.18+), so
scoping lives in the `MATCH` itself and cannot be forgotten. That is exact,
needs no migration, and is comfortably fast for worlds of tens to low
thousands of nodes — the starter world is 27 entities. The index becomes worth
revisiting only once a *single* owner's world is large enough that the linear
scan hurts; graduating to it later is a repository-internal change, invisible
above that layer. `tests/test_rag_isolation.py` is the regression test.

**2. Embedding models are never mixed within one database.** Vectors from two
different models are not comparable; a width mismatch at least errors loudly,
but two models of equal width fail *silently*. Every node therefore stores
`embedding_model` and `embedded_at` alongside its vector, which is what makes
staleness detectable and `scripts/backfill_embeddings.py` idempotent. The
constraint is per database, not global — local Neo4j and Aura are separate
databases, so Ollama-local / Google-hosted is correct as long as each side is
internally consistent and data is never copied between them without a
backfill. What the split costs is tuning transfer: cosine score
*distributions* differ per model, so any absolute threshold tuned against one
model is meaningless against another's. The mitigation is structural — rank by
score and take top-K, never gate on a minimum score. That is why no
`RAG_MIN_SCORE` setting exists.

## Prerequisites

- **Python 3.12+**
- **[uv](https://docs.astral.sh/uv/)** — packaging and virtual-environment manager
- **Neo4j 5.x** — reachable via the Bolt protocol (local Docker or a managed instance)
- **[Ollama](https://ollama.com)** — local runtime for both the default chat
  provider (`/ai/describe`, `/ai/extract`) and the default embedding provider
  (`/ai/retrieve`, `/ai/ask`, and every entity's embedding on create/update).
  Not needed at all if you point `LLM_PROVIDER` at Groq **and**
  `EMBEDDING_PROVIDER` at Google — the two are independent, so you can mix
  local chat with hosted embeddings or vice versa. Everything else works
  without it.

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

**LLM provider (chat only)** — `/ai/describe` and `/ai/extract`; independent
of the embedding provider below (see [Architecture](#architecture))

| Variable | Purpose | Default |
|---|---|---|
| `LLM_PROVIDER` | `ollama` or `groq`; compared lowercased and stripped | `ollama` |
| `OLLAMA_HOST` | Ollama server base URL | `http://localhost:11434` |
| `OLLAMA_CHAT_MODEL` | Chat model for `/ai/describe` and `/ai/extract` | `llama3.2:3b` |
| `GROQ_API_KEY` | **Required when `LLM_PROVIDER=groq`**; never read otherwise | `""` |
| `GROQ_CHAT_MODEL` | Groq chat model. Keep this an `openai/gpt-oss-*` model — `/ai/extract` sends a `json_schema` response format that only those support | `openai/gpt-oss-120b` |

**Embedding provider** — powers Graph RAG (`/ai/retrieve`, `/ai/ask`, and
every entity's embedding on create/update); independent of `LLM_PROVIDER`,
since Groq has no embeddings endpoint

| Variable | Purpose | Default |
|---|---|---|
| `EMBEDDING_PROVIDER` | `ollama` or `google`; compared lowercased and stripped | `ollama` |
| `OLLAMA_EMBED_MODEL` | Ollama embedding model | `nomic-embed-text-v2-moe:latest` |
| `OLLAMA_EMBED_DIMENSIONS` | Vector width the Ollama model produces | `768` |
| `GOOGLE_API_KEY` | **Required when `EMBEDDING_PROVIDER=google`**; never read otherwise | `""` |
| `GOOGLE_EMBED_MODEL` | Google embedding model. Must support `embedContent` — `gemini-embedding-001` does, `text-embedding-004` does not (confirmed 404) | `""` |
| `GOOGLE_EMBED_DIMENSIONS` | Truncates the model's native output via `output_dimensionality` — `gemini-embedding-001` natively outputs 3072 | `768` |

Switching either `EMBEDDING_PROVIDER` or its model is not a config-only
change: vectors from two different models are never comparable, even at the
same width, so every existing entity's embedding becomes stale and needs
`scripts/backfill_embeddings.py` re-run against it (see
[Deployment](#deployment-vercel--neo4j-aura--groq-and-google) below).

**Graph RAG retrieval** — `/ai/retrieve` and `/ai/ask`

| Variable | Purpose | Default |
|---|---|---|
| `RAG_SEED_TOP_K` | How many entities the vector search seeds retrieval with | `8` |
| `RAG_EXPAND_DEPTH` | Hops the graph expansion walks out from the seeds (clamped 1–2) | `1` |
| `RAG_MAX_CONTEXT_ENTITIES` | Cap on entities in the serialized context block; seeds are kept first, expansion-only entities are dropped first | `30` |

No minimum-similarity-score setting exists on purpose — cosine score
distributions differ per embedding model, so an absolute threshold tuned
against one model is meaningless against another's. Retrieval always ranks by
top-K instead.

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
`GROQ_API_KEY`, `GOOGLE_API_KEY`, and `JWT_SECRET_KEY` are placeholders, not
working credentials.

### 3. Start Neo4j

Any Neo4j 5.x instance works. From the repo root, a `docker-compose.yml` is
provided for local development:

```bash
docker compose up -d neo4j
```

This starts Neo4j 5.26 on `localhost:7687` (Bolt) and `localhost:7474`
(browser UI) with credentials `neo4j` / `password123`, matching
`.env.example`, and persists data in a named volume across restarts. Pinned
to 5.26 (LTS) rather than a floating `5` tag because Graph RAG's similarity
search uses `vector.similarity.cosine()`, which needs Neo4j 5.18+ — a managed
Aura instance is already well past that, so this keeps local and deployed in
step.

Constraints and indexes are created automatically on application startup
(see `db/migrations.py`); no manual schema step is required.

### 4. Start Ollama and pull the models

Only for the default `LLM_PROVIDER=ollama` / `EMBEDDING_PROVIDER=ollama`; skip
whichever one you're not using against a local server (see the next two
sections).

```bash
ollama pull llama3.2:3b               # chat: /ai/describe, /ai/extract
ollama pull nomic-embed-text-v2-moe   # embeddings: every entity write, /ai/retrieve, /ai/ask
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
2. Make sure `OLLAMA_HOST` and `OLLAMA_CHAT_MODEL` point at your local server
   (see `.env.example`).
3. Complete step 4 above (start Ollama, pull `llama3.2:3b`) if you haven't.
4. Restart the API — `GROQ_API_KEY` can stay blank; it's only read when
   `LLM_PROVIDER=groq`.

## Embedding provider: Ollama (local) vs Google (deployed)

The same pattern, one axis over — `EmbeddingProvider` implementations
(`providers/embeddings.py`), selected by `EMBEDDING_PROVIDER`, independent of
`LLM_PROVIDER`:

- **`ollama`** (default) — talks to the same local Ollama server as chat,
  using a separate embedding model (`OLLAMA_EMBED_MODEL`). What
  `.env.example` ships with.
- **`google`** — talks to the hosted Google Gemini embeddings API
  (`embedContent`). **Deployment-only**, for the same reason as Groq: Vercel
  serverless functions have no persistent process for a local model.
  (Google, not Groq, because Groq has no embeddings endpoint at all.)

If your `.env` was copied from a deployment config and has
`EMBEDDING_PROVIDER=google`, switch back the same way: set
`EMBEDDING_PROVIDER=ollama` (or delete the line), make sure `OLLAMA_HOST` and
`OLLAMA_EMBED_MODEL` point at your local server, pull the embedding model if
you haven't, and restart — `GOOGLE_API_KEY` can stay blank.

## Real Embedding Evaluation

Graph RAG retrieval (`RetrievalService`, above) is correct by construction —
the test suite proves it *runs* right. It says nothing about whether it
*retrieves well*. That's a separate, measured question, and this project
answers it with a graph-recall metric: given a question whose answer is known
to live in a specific set of entities and relationships in the starter world,
what fraction of that set actually reaches the serialized context block.

**The metric, in full.** For each of the 12 hand-authored queries in the
`verge-starter-v1` dataset (`evaluation/dataset.py`), a *reference graph* names
the entity slugs `R_q` and the directed edges `E_q` that an answer genuinely
depends on. Retrieval runs, and the entities and relationships that survive
into the context block form the *retrieved graph* `Ĝ_q`, `Ê_q`.

| Metric | Definition | Role |
|---|---|---|
| **Node recall (macro)** | mean over queries of `\|R_q ∩ Ĝ_q\| / \|R_q\|` | **Primary** |
| **Edge recall (macro)** | mean of `\|E_q ∩ Ê_q\| / \|E_q\|` over queries with `\|E_q\| > 0` | **Co-primary** — reported beside node recall, never blended into it |
| Node/edge recall (micro) | pooled numerators over pooled denominators | Supporting: a large macro/micro gap localizes failure to the big fan-out queries |
| Seed recall | node recall against the *vector seeds* alone, before expansion | Supporting |
| Expansion gain | node recall − seed recall, always ≥ 0 | Supporting: what the graph traversal buys over vector search alone |
| Per-label node recall | micro node recall restricted to each label | Diagnostic: `canonical_text` differs per label, so label bias is real and actionable |
| Anchor hit rate | fraction of queries whose declared anchors all reach the seeds | Diagnostic: high node recall with a low anchor rate means expansion is carrying a weak vector step |

Macro is primary because reference sizes vary from 1 to 7 entities and each
hand-authored question deserves equal weight. Recall only, no precision: the
context block is *deliberately* over-inclusive — expansion pulls in neighbours
precisely so the model can find the connection — so penalising extra entities
would be penalising the design.

Edge cases are decided rather than defaulted, and `tests/test_graph_recall.py`
pins each one: a query with an empty reference *node* set is a dataset
validation error (recall would be undefined); a query with an empty reference
*edge* set is excluded from the edge aggregates entirely — scoring it 0.0
would deflate the number and 1.0 would inflate it; an empty retrieved graph
scores 0.0, which is well-defined because `|R_q| ≥ 1` always.

**`uv run pytest -q` is offline and deterministic.** It uses
`FakeEmbeddingProvider`, a SHA-256 stub with no semantics whatsoever, so it
needs no embedding server, no API key, no network access, and no downloaded
model. It validates metric correctness (node/edge recall, aggregation, the
edge cases in the plan's §10.5), dataset integrity (every annotated slug and
edge really exists in `domain/starter_world.py`, direction-sensitive), and
that the pipeline is wired correctly end to end.

The same metric can also be run against **real semantic embedding models** —
`ollama` locally, `google` in deployment — via
`scripts/evaluate_graph_recall.py`, using the project's existing
`EmbeddingProvider` abstraction (`providers/deps.get_embedder`; the script
never instantiates a provider directly and never fakes a score).

**Real-model evaluation is deliberately separate from `pytest`.** It needs a
reachable model or provider credentials, makes real network calls, and its
numbers vary by model and change when a model is swapped — the opposite of
what a `pytest` assertion should depend on. It is a benchmark you run and
read, not a pass/fail gate.

### Reproducing a run

```bash
uv sync
docker compose up -d neo4j                          # from the repo root
ollama pull nomic-embed-text-v2-moe                  # if evaluating against ollama
# configure .env (see "Configure environment variables" above)
uv run python scripts/seed_world.py you@example.com  # or register through the app
uv run python scripts/precompute_starter_world_embeddings.py
uv run python scripts/backfill_embeddings.py you@example.com
uv run python scripts/evaluate_graph_recall.py you@example.com --depth 1
```

The last two steps make sure every entity is embedded under the model this
run will query with — `evaluate_graph_recall.py` refuses to run against a
world with stale or missing embeddings rather than silently score against
mismatched vectors.

**Example — illustrative only.** Real output from one run against
`nomic-embed-text-v2-moe:latest` (Ollama, local), `top_k=8`, `depth=1`.
Numbers depend on the model and will differ on yours; do not treat this as an
achieved benchmark for your configuration:

```
Graph Recall Evaluation
───────────────────────────────────────────────────────────────────
Provider      OllamaEmbeddingProvider
Model         nomic-embed-text-v2-moe:latest (768d)
Account       you@example.com
World         starter-world · Character 10 / Location 6 / Faction 5 / Event 6 · 69 edges
Dataset       verge-starter-v1
Examples      12 queries
Top-K         8
Depth         1
Max context   30 entities
Started       2026-08-25T08:12:08+00:00
Duration      1.21s

query                                  node    edge   seed  ents  edges  chars
q01-kestrelwatch-long-winter          1.000   0.500  1.000    21     27   3950
q02-kestrel-order-members             1.000   1.000  1.000    21     27   3946
...
q12-thea-ivo-connection               1.000   1.000  0.667    22     26   3913

Graph Recall (node, macro)          1.000        <-- PRIMARY
Graph Recall (node, micro)          1.000
Edge recall (macro)                 0.708        (10 of 12 queries scored)
Edge recall (micro)                 0.689
Seed recall (macro)                 0.787
Expansion gain                      +0.213        graph expansion over vector search alone
Anchor hit rate                     1.000
```

The script also takes `--provider`, `--model`, `--dimensions`, `--top-k`,
`--max-entities`, and `--json <path>` to write the full report out
alongside the table.

Running the same account again at `--depth 2` reproduces the tradeoff the
metric exists to surface: node recall was already at its ceiling from depth
1's expansion, so depth 2 buys nothing more there, while edge recall *drops*
(0.708 → 0.661 in that same run). The cause is the 4000-character context
budget in `retrieval_service.py`: it truncates the larger depth-2 edge set in
Cypher's `collect(DISTINCT r)` order, which carries no stability guarantee.
Two consequences worth carrying: **exact edge-recall assertions are only sound
at depth 1**, and a depth-2 edge-recall figure is a *noisy* number that can
move between runs on identical data. A node-only metric would never have shown
any of this; it's the reason the metric reports edge recall as a co-primary
number instead of folding it away.

Two more limits to read the numbers against. `RAG_MAX_CONTEXT_ENTITIES=30`
never binds on a 27-entity world, so a default run says nothing about whether
the entity cap behaves — `--max-entities` exists to induce it deliberately.
And `RAG_EXPAND_DEPTH` is clamped to 1–2 in both `graph_repo.expand` and
`RetrieveRequest`, so depth 0 and depth 3+ cannot be benchmarked at all;
depth 0 is covered for free by the seed-recall number.

### Why the split

Deterministic correctness testing and real-world semantic evaluation answer
different questions. `pytest` proves the retrieval pipeline and the recall
metric itself behave correctly on inputs whose expected output is known in
advance — that has to be reproducible on every machine, every CI run, with no
external dependency. Real-model evaluation asks whether *this* embedding
model actually finds the right entities for *these* questions — that depends
on the model, can only be answered by calling it, and is expected to change
as models change. Conflating the two would either make the test suite
flaky and network-dependent, or make the benchmark meaninglessly
deterministic. Keeping them apart, and always reporting which one produced a
given number, is what makes both trustworthy.

## Running the API

```bash
uv run uvicorn narrative_mind.main:app --reload
```

- Interactive API docs: <http://localhost:8000/docs>
- Liveness probe: <http://localhost:8000/health>

## API surface (V1)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /` | — | 307 to `/docs`, so the bare domain isn't a JSON 404 (hidden from the schema) |
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
| `POST /ai/retrieve` | ✓ | Graph RAG retrieval only — seeds, expanded entities, edges, and the serialized context block, no LLM call |
| `POST /ai/ask` | ✓ | Graph RAG end to end — a grounded answer with citations validated against the retrieved entity ids |

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

Graph RAG (require whichever provider `EMBEDDING_PROVIDER` selects to be
reachable for `/ai/retrieve`, plus `LLM_PROVIDER`'s for `/ai/ask`; both work
against the starter world out of the box, since every entity in it already
carries a vector):

```bash
curl -X POST localhost:8000/ai/retrieve \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"question":"who rules Kestrelwatch?","top_k":5}'

curl -X POST localhost:8000/ai/ask \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"question":"who rules Kestrelwatch?","debug":true}'
```

`top_k` and `depth` on either endpoint override `RAG_SEED_TOP_K` /
`RAG_EXPAND_DEPTH` for that one request. `debug:true` on `/ai/ask` includes
the full retrieval trace behind the answer — the seeds, the expanded entities,
and the context block the model actually saw.

## Deployment (Vercel + Neo4j Aura + Groq and Google)

Production runs the backend as Vercel serverless functions, backed by a
managed Neo4j Aura instance, Groq for chat, and Google for embeddings (see
[LLM provider](#llm-provider-ollama-local-vs-groq-deployed) and
[Embedding provider](#embedding-provider-ollama-local-vs-google-deployed)
above for why Ollama isn't used in production).

**One-time setup:**

1. **Neo4j** — create a free instance at
   [console.neo4j.io](https://console.neo4j.io) (AuraDB Free). Save the
   generated `NEO4J_URI` (`neo4j+s://...`), username, and password.
2. **Groq** — create an API key at
   [console.groq.com](https://console.groq.com).
3. **Google** — create an API key for the Gemini API at
   [aistudio.google.com](https://aistudio.google.com/apikey), for embeddings.
4. **Vercel project** — import this repo, set **Root Directory** to
   `backend`. The repo already includes `backend/vercel.json` (routes all
   requests to the FastAPI `app`) and `backend/requirements.txt` (pinned
   deps, since Vercel's Python builder doesn't read `uv.lock` — regenerate
   it after dependency changes with
   `uv export --no-hashes --no-dev -o requirements.txt`).
5. **Environment variables** — set these in the Vercel project's
   **Settings → Environment Variables** (they are separate from your local
   `.env` and from the frontend Vercel project's variables):

   | Variable | Value |
   |---|---|
   | `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` | from the Aura instance |
   | `LLM_PROVIDER` | `groq` |
   | `GROQ_API_KEY` | from console.groq.com |
   | `GROQ_CHAT_MODEL` | `openai/gpt-oss-120b` |
   | `EMBEDDING_PROVIDER` | `google` |
   | `GOOGLE_API_KEY` | from aistudio.google.com |
   | `GOOGLE_EMBED_MODEL` | `models/gemini-embedding-001` |
   | `GOOGLE_EMBED_DIMENSIONS` | `768` |
   | `RAG_SEED_TOP_K` / `RAG_EXPAND_DEPTH` / `RAG_MAX_CONTEXT_ENTITIES` | optional — defaults (`8` / `1` / `30`) are fine to start |
   | `JWT_SECRET_KEY` | a real random value, e.g. `openssl rand -hex 32` — never the `.env.example` placeholder |
   | `JWT_ALGORITHM` | `HS256` |
   | `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` |
   | `CORS_ORIGINS` | JSON array of the deployed **frontend** origin, e.g. `["https://your-app.vercel.app"]` |
   | `ENVIRONMENT` / `DEBUG` | `production` / `false` |

6. Deploy. Vercel auto-suggests env var names it finds in `.env.example`
   files anywhere in the repo — including the frontend's `VITE_*` vars —
   when setting up a project; ignore/delete any that don't belong to this
   project rather than filling them in.
7. **Backfill embeddings once.** New accounts embed their starter world from
   the precomputed file (`domain/starter_world_embeddings.<model>.json`,
   already committed for `gemini-embedding-001`), so registration needs no
   extra step. But any account that existed **before** this deploy — or any
   account on a fresh Aura instance you're migrating data into — has entities
   with no vector at all, and `/ai/ask` will answer every question with "not
   in this world" until they get one:

   ```bash
   # from backend/, pointed at the deployed .env (Aura credentials, Google key)
   uv run python scripts/backfill_embeddings.py --all
   ```

   Re-run this any time `EMBEDDING_PROVIDER` or its model changes — vectors
   from two different models are never comparable, so a model switch stales
   every embedding in the database at once.

**Gotchas hit in practice, worth checking first if something breaks:**

- **CORS preflight fails (400 on `OPTIONS`)** — `CORS_ORIGINS` must be
  valid JSON (`["https://exact-origin.vercel.app"]`, matching scheme and
  no trailing slash) and must be redeployed after editing; env var changes
  don't apply to already-built deployments.
- **`/ai/describe` and `/ai/extract` fail in production but the Groq key
  works via curl** — confirm `LLM_PROVIDER` is set to lowercase `groq` in the
  Vercel env vars (the app normalizes case, but double-check nothing else is
  misspelled) and that you redeployed after adding the env vars.
- **`/ai/ask` always says the world doesn't cover the question, even for
  things obviously in it** — almost always means the account's entities have
  no embedding yet. Confirm `EMBEDDING_PROVIDER=google` and `GOOGLE_API_KEY`
  are set, then run the backfill step above; `/ai/retrieve` with `debug`
  unset still returns an empty `seeds` list when this is the cause.
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

97 tests, of which 42 need nothing but Python:

- `tests/test_pydantic_models.py` (9) — the DTO triads and `Page[T]`.
- `tests/test_graph_recall.py` (25) — metric correctness, aggregation, the
  edge cases above, and dataset integrity: every annotated slug and edge is
  checked to exist in `domain/starter_world.py`, direction-sensitively.
- `tests/test_ai_service.py` (2) — the AI service against a stub provider.
- The four `canonical_text` tests in `tests/test_embeddings.py`.
- `test_context_entity_cap_holds` in `tests/test_retrieval.py`, and
  `test_root_redirects_to_docs` in `tests/test_health.py` (which builds the
  app without its lifespan, so it touches neither Neo4j nor auth).

The remaining 55 are integration tests that exercise real Cypher against the
configured Neo4j instance, so **Neo4j must be running** for the full suite to
pass. Each registers its own account, works inside that account's world, and
deletes the account and everything it owns afterwards — a suite run leaves the
database exactly as it found it.

No test ever calls a real embedding or chat provider. `get_embedder` is
overridden with the deterministic `FakeEmbeddingProvider` for the whole suite
(`tests/conftest.py`), and `tests/test_rag.py` / `tests/test_rag_isolation.py`
override `get_llm` with a stub per test. The flip side is stated plainly
because it matters: **nothing in `pytest` can tell you retrieval is *good*.**
`FakeEmbeddingProvider` is a SHA-256 stub with no semantics at all — that is
what [Real Embedding Evaluation](#real-embedding-evaluation) is for.

`tests/test_rag_isolation.py` is the one worth reading even if you skip the
rest: it is the regression test for the multi-tenancy trap described under
[Architecture](#the-two-graph-rag-decisions-worth-knowing-before-you-change-anything)
— exact owner-scoped cosine vs. `db.index.vector.queryNodes()` — proving one
account's retrieval can never surface another's entity even when the two are
byte-identical.
