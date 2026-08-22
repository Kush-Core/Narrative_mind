# Graph RAG — Implementation Plan

Plan only: what to create, what to modify, in what order, and which decisions
must be made before any of it. No implementation.

## 1. Goal

Today the two `/ai` routes are stateless: `/ai/describe` and `/ai/extract` see
only the prompt body. Neither reads the caller's world. Graph RAG closes that —
a natural-language question is answered **from the asker's own graph**, with the
retrieved entities cited.

The retrieval loop, end to end:

1. **Embed** the question into a query vector.
2. **Seed** — vector-similarity search over the caller's entities, top-K.
3. **Expand** — walk 1–2 hops from the seeds to collect the induced subgraph.
   This is the step plain RAG does not have, and the reason a graph is worth
   having: the answer to "who would object if Aria took Kestrelwatch?" is not in
   any one node's text, it is in the edges around it.
4. **Serialize** the subgraph into a bounded context block.
5. **Generate** an answer constrained to that context.
6. **Validate** the citations against the retrieved ids before returning.

And the ingestion half, which must exist first: every entity carries an
embedding of its own text, written on create and refreshed on update.

Scope boundary for V1: no chunking (entity descriptions are capped at 2000
chars, so one embedding per node is the whole story), no re-ranker, no
conversation memory, no write-back of extracted entities.

---

## 2. Three decisions to make before writing anything

These are load-bearing. Getting them wrong means re-embedding every node later.

### 2.1 Embedding provider — the blocking issue

> **The chat providers do not change.** Ollama-local / Groq-deployed stays
> exactly as it is, and serves `/ai/describe`, `/ai/extract`, and the new
> `/ai/ask` alike. Nothing in this plan replaces them. The only edit to
> `providers/llm.py` is *removing* `embed()` from the Protocol — the one method
> Groq already cannot implement. Everything below concerns a second, independent
> provider axis that exists only for RAG.

`LLMProvider` declares `embed()`, and `GroqProvider.embed` raises
`NotImplementedError`. Production runs `LLM_PROVIDER=groq`. **Groq has no
embeddings endpoint at all**, so today's provider seam cannot carry RAG into the
environment it actually deploys to.

Embeddings must therefore become a *separate* provider axis from chat, with its
own env var, resolved independently of `LLM_PROVIDER`.

Do not reach for `sentence-transformers` as the production answer. It pulls
torch, and the Vercel Python builder caps an unzipped function bundle at 250 MB.
It will not fit. Production embeddings have to be a hosted API call.

Recommendation: **OpenAI `text-embedding-3-small`** as the hosted provider. It
supports the `dimensions` parameter (Matryoshka truncation), which means you can
pin it to whatever width you like, and its SDK shape is already familiar here
because the Groq client is OpenAI-shaped. Voyage AI is the quality-competitive
alternative if you would rather not hold an OpenAI key.

### 2.2 One embedding model for both environments, or one per environment?

First, the hard constraint: embedding vectors from two different models are
**not comparable**. Within any single database, the stored vectors and the query
vector must come from the same model, or cosine scores are meaningless — a
dimension mismatch at least errors loudly, but two models of equal width fail
silently. **Switching embedding models therefore requires re-embedding the whole
corpus**, which is what `scripts/backfill_embeddings.py` in Phase 3 is for.

That constraint is per-database, not global. Local Neo4j and Aura are separate
databases, so *Ollama-local / hosted-prod is correct* as long as each
environment is internally consistent and data is never copied between them
without a backfill.

What the split actually costs is **tuning transfer**. Cosine score
*distributions* differ per model, so any absolute threshold tuned locally
against `nomic-embed-text` is meaningless against a hosted model's vectors. You
also cannot reproduce a production retrieval bug locally.

The mitigation: **rank by score and take top-K; never gate on an absolute
similarity threshold.** Top-K is scale-invariant, so the model difference costs
almost nothing. (This is why `rag_min_score` is deliberately absent from the
Phase 4 settings list.)

| Stance | What it costs |
|---|---|
| **Ollama in dev, hosted in prod** (recommended) | Approximate tuning parity — acceptable under top-K ranking. Keeps local dev offline, free, and key-less, matching the pattern this repo already established for chat. |
| **Same hosted provider in both** | An API key and network for local work (embedding 27 starter entities is fractions of a cent). Exact dev/prod parity. |

Recommendation: **mirror the chat axis** — Ollama locally, hosted in production
— with a deterministic fake embedder for the test suite (Phase 6) so tests stay
offline and free. That is the same posture the codebase already takes with
`_StubLLM` in `tests/test_ai_service.py`. Take the second row instead if you
expect to debug retrieval quality against production data.

Whichever you pick, store `embedding_model` and `embedded_at` **on every node**.
That is what makes staleness detectable and the backfill idempotent — without
it, you cannot tell an entity embedded under the old model from a current one.

### 2.3 Vector index vs. exact search — the multi-tenancy trap

This is the sharpest issue in the whole plan, and it falls straight out of the
ownership design.

Neo4j's `db.index.vector.queryNodes()` returns the global top-K across the
**entire database**. It has no pre-filter. In a single-tenant app that is fine.
Here, every node carries `owner_id`, and asking for the top 10 could return ten
nodes belonging to ten other accounts — and the owner-scoped post-filter then
yields **zero results for a caller whose world is perfectly healthy**. The
failure gets worse the more accounts exist, which means it will pass every test
you write on a fresh database and degrade quietly in production.

The two ways out:

| Option | How | When it is right |
|---|---|---|
| **A. Exact cosine, owner-scoped** (recommended for V1) | Match the owner's nodes, score each with Neo4j's `vector.similarity.cosine()`, order, limit. No index involved. | Worlds of tens to low thousands of nodes. The starter world is 27 entities. This is exact, trivially scoped, and fast enough that the index would be premature. |
| **B. Vector index + oversampling** | Query the index for `K × oversample`, post-filter by `owner_id`, hope enough survive. | Only once a single owner's world is large enough that a linear scan hurts. |

Recommendation: **start with A**. It needs no migration, no dimension lock-in,
and cannot leak across accounts. Defer the index until a real world gets big;
graduating later is a repository-internal change, invisible above that layer.

Note `vector.similarity.cosine()` needs Neo4j 5.18+. `docker-compose.yml` pins
the floating `neo4j:5` tag, which resolves current, and AuraDB Free is well past
it. Worth pinning to `neo4j:5.26` (LTS) so local and deployed agree.

---

## 3. Dependencies

Deliberately small. The graph store, the vector math, and the traversal are all
already in Neo4j; nothing here needs a second datastore.

**Add to `[project.dependencies]`:**

| Package | Why |
|---|---|
| `openai` (or `voyageai`) | Hosted **embeddings** for production only. The one genuinely new capability. Pick per §2.1. |

**Already present, no change:**

- `groq` — stays the production **chat** provider; untouched by this plan
- `ollama` — stays the local chat provider, and gains the local embedding path
- `neo4j` — vector storage, `vector.similarity.cosine()`, traversal
- `pydantic` / `pydantic-settings` — the new DTOs and config

**Add to `[dependency-groups].dev` only if needed:**

| Package | Why |
|---|---|
| `pytest-asyncio` | Only if you unit-test the async services directly. The suite currently drives everything through `TestClient`, which needs no async plugin — prefer staying on that path. |

**Deliberately not adding:**

- `langchain` / `llama-index` — they bring their own retriever/store/chain
  abstractions that would sit crosswise to the `api → services → repositories`
  layering and duplicate the provider Protocol. The whole loop here is roughly
  200 lines of your own code; the framework is more surface than it saves.
- `numpy` — Neo4j does the cosine.
- `faiss` / `chromadb` / `pgvector` — a second store to keep in sync with the
  graph, for a corpus that lives in the graph.
- `sentence-transformers` — will not fit in a Vercel function (§2.1).
- `tiktoken` — a character budget is close enough for V1 context capping.

Remember to regenerate the Vercel dependency file after any change:
`uv export --no-hashes --no-dev -o requirements.txt`.

---

## 4. Target layer map

RAG slots into the existing layering without bending it. New modules in
parentheses.

```
api/          routers/rag.py (new)          ── /ai/retrieve, /ai/ask
                deps.py (modified)
services/     rag_service.py (new)          ── prompt, generate, validate citations
              retrieval_service.py (new)    ── embed → seed → expand → serialize
              embedding_service.py (new)    ── canonical text → vector → persist
repositories/ embedding_repo.py (new)       ── vector writes + owner-scoped search
              graph_repo.py (modified)      ── multi-seed subgraph expansion
providers/    embeddings.py (new)           ── EmbeddingProvider Protocol + impls
              llm.py (modified)             ── drop the embed() that Groq cannot honour
domain/       rag.py (new)                  ── Ask/Retrieve DTOs, Citation
core/         config.py (modified)          ── embedding + retrieval settings
```

`RagService` composes `RetrievalService` and `LLMProvider`. Leave the existing
`AIService` alone — `/ai/describe` and `/ai/extract` are genuinely stateless and
should stay that way.

---

## 5. Phases

Each phase leaves the app working and independently verifiable. Do not start a
phase before its predecessor's exit check passes.

### Phase 1 — Split the embedding provider from the chat provider

Makes embeddings obtainable in both environments. Nothing consumes them yet.

**Create**

| File | Responsibility |
|---|---|
| `providers/embeddings.py` | `EmbeddingProvider` Protocol — `embed_documents(texts)`, `embed_query(text)`, and a `model_name` / `dimensions` identity so callers can stamp what produced a vector. Implementations: the hosted one, optionally `OllamaEmbeddingProvider`, and a deterministic `FakeEmbeddingProvider` for tests. |

Keep `embed_query` distinct from `embed_documents` even if they are identical
today — several embedding models want an asymmetric prefix for queries vs.
documents, and retrofitting that split later touches every call site.

**Modify**

| File | Change |
|---|---|
| `providers/llm.py` | Remove `embed()` from the `LLMProvider` Protocol and from both implementations. `GroqProvider.embed`'s `NotImplementedError` disappears with it — the Protocol stops promising something one implementation cannot do. |
| `providers/deps.py` | Add `get_embedder` → `EmbedderDep`, cached with `lru_cache` on its settings tuple, mirroring `_build_ollama_provider` / `_build_groq_provider`. |
| `core/config.py` | `embedding_provider`, `embedding_model`, `embedding_dimensions`, the hosted provider's API key, and `embed_on_write`. |
| `backend/.env.example`, `backend/README.md` | The new env table rows. |
| `tests/test_ai_service.py` | `_FakeLLM` / `_StubLLM` both declare `embed()`; drop it to match the narrowed Protocol. |

**Exit check** — a throwaway script gets a vector of the configured width from
the configured provider, and `uv run pytest -q` is still green.

### Phase 2 — Projection hygiene (do this before writing a single vector)

Every entity read uses a `{.*}` map projection — 16 of them across the four
entity repos. The moment nodes carry an `embedding` property, **every one of
those starts hauling a 768-float array out of the database**. A 100-row list
page would move 76,800 floats to be silently discarded by Pydantic (which
ignores undeclared fields, exactly as it already does for `owner_id`).

Nothing breaks visibly. It just gets slow, and the cause is invisible in the
response body. Fix the projections *before* the vectors exist, so the two
changes are never tangled together.

**Modify**

| File | Change |
|---|---|
| `repositories/character_repo.py` | Replace the 4 `{.*}` projections with explicit property lists (or an equivalent exclusion). |
| `repositories/location_repo.py` | Same, 4 sites. |
| `repositories/faction_repo.py` | Same, 4 sites. |
| `repositories/event_repo.py` | Same, 4 sites. |
| `repositories/graph_repo.py` | Already projects explicitly (`x {.id, .name, ...}`) — verify, no change expected. |
| `repositories/user_repo.py` | Untouched; `:User` nodes get no embedding. |

**Exit check** — the suite is green, and responses are byte-identical to before.
This phase is pure prophylaxis.

### Phase 3 — The write path: every entity gets a vector

**Create**

| File | Responsibility |
|---|---|
| `repositories/embedding_repo.py` | Owner-scoped, constructed with `owner_id` like its siblings. Writes a vector + `embedding_model` + `embedded_at` to a node by id; finds nodes missing or stale for the current model; and (used in Phase 4) runs the owner-scoped similarity search. One repo for all four labels rather than a method on each — the operation is label-generic and duplicating it four times is how one copy drifts. |
| `services/embedding_service.py` | Owns the **canonical embedding text** per label: name, aliases, status/region/ideology, description/summary, flattened to one deterministic string. Calls the provider, persists via the repo. Exposes single-entity and bulk-backfill entry points. |
| `scripts/backfill_embeddings.py` | Embeds everything missing or stale, for one account by email or for all. Follows the `scripts/seed_world.py` shape — argv, driver, `run_migrations`, session, explicit output. This is your recovery tool for every model switch and every dropped background task; write it in this phase, not later. |

On canonical text: embed the entity's **own** text only for V1. Folding in
neighbour names makes vector search itself graph-aware, but creates an
invalidation cascade — renaming one faction staleness-marks every member. The
graph expansion in Phase 4 recovers that context anyway.

**Modify**

| File | Change |
|---|---|
| `services/character_service.py` | `reindex` currently just stamps `last_indexed_at`. Make it compute and persist the embedding — this is the hook the codebase already built and left empty. |
| `services/location_service.py`, `faction_service.py`, `event_service.py` | Add the equivalent hook. None of the three has one today. |
| `api/routers/characters.py` | Already enqueues `reindex` on create. **Add the same on `PATCH`** — see below. |
| `api/routers/locations.py`, `factions.py`, `events.py` | Add the hook to create and update. |
| `api/deps.py` | `EmbeddingRepository_Dep`, `EmbeddingService_Dep`, both owner-scoped via the existing `OwnerDep`. |
| `repositories/world_repo.py` | Starter-world seeding must produce embeddings too, or every new account opens onto a world RAG cannot see. |

Two things to get right here:

**Update currently has no hook at all.** Only `POST /characters` enqueues
`reindex`; `PATCH` does not. If embeddings are only written on create, then
editing a description leaves a vector describing text that no longer exists —
retrieval silently answers from stale content. Every mutation path needs the
hook.

**`BackgroundTasks` are not reliable on Vercel.** The serverless function may be
frozen or reclaimed once the response is sent, so a queued task can simply never
run. Dropping a `last_indexed_at` timestamp was harmless, which is why the
existing hook gets away with it. Dropping an *embedding* write means an entity
is permanently invisible to retrieval, with no error anywhere. Write embeddings
**synchronously** on create and update (one hosted call, ~100–300 ms), and keep
background/bulk work for the backfill script. The `embedding_model` /
`embedded_at` stamps make anything that slipped through recoverable.

**Starter world — the free optimisation.** `entity_id(owner_id, slug)` derives
ids per owner, but the *text* of all 27 entities is byte-identical for every
account. So their embeddings are identical too. Compute them once, ship them as
a data file next to `domain/starter_world.py`, and have the seed transaction
write them directly. Registration then stays fast and needs no network at all.
The tradeoff: the file is model-specific, so name it for the model and
regenerate it whenever §2.1 changes. If you would rather not carry the file,
the fallback is to let the backfill script cover new accounts — but then a
first login opens onto a world RAG cannot answer about until it runs.

**Exit check** — register a fresh account, confirm all 27 starter entities carry
a vector of the right width and the current model name; edit one and confirm its
`embedded_at` moves.

### Phase 4 — Retrieval, testable without the LLM

Build and tune retrieval *before* generation. Nondeterministic output on top of
untuned retrieval is very hard to debug; a retrieval-only endpoint lets you see
exactly what the model would have been given.

**Create**

| File | Responsibility |
|---|---|
| `domain/rag.py` | `RetrieveRequest` (question, optional depth/K overrides), `RetrievedEntity` (id, label, name, score), `RetrievedRelationship`, `RetrievalResult` (seeds, expanded set, edges, the serialized context block, token/char count). |
| `services/retrieval_service.py` | The pipeline: embed query → seed via `embedding_repo` → expand via `graph_repo` → dedupe and rank → serialize to a bounded context block. |
| `api/routers/rag.py` | `POST /ai/retrieve` — returns `RetrievalResult`. Auth-gated like everything else. Keep it in V1 permanently; it is the only window into why an answer was wrong. |

**Modify**

| File | Change |
|---|---|
| `repositories/graph_repo.py` | Add multi-seed, any-label induced-subgraph expansion. The existing `ego_network` is close but single-centre and Character-only. Reuse its key insight — collect the node set first, then match every edge whose *both* endpoints are in scope — so the context block states real relations rather than implying adjacency. |
| `api/deps.py` | `RetrievalService_Dep`. |
| `api/routers/__init__.py` | Register the new router. |
| `core/config.py` | `rag_seed_top_k`, `rag_expand_depth` (clamp 1–2), `rag_max_context_entities`. Note the absence of a minimum-score setting — see §2.2 on why absolute thresholds are the wrong knob here. |

On the context block: give every entity a stable id in the text. That is what
lets the model cite, and what lets you *validate* the citations in Phase 5. A
compact line-per-entity form followed by a line-per-edge form reads well to a
model and stays cheap in tokens. Cap both the entity count and the total
characters — an unbounded subgraph at depth 2 on a dense node can be most of the
world.

**Exit check** — questions naming a starter-world character return that
character among the seeds and its faction/location among the expanded set. Tune
K and depth here, on real output, before adding the model.

### Phase 5 — Generation

**Create**

| File | Responsibility |
|---|---|
| `services/rag_service.py` | Compose the prompt (system instruction + context block + question), call `LLMProvider.generate`, parse the answer, and **validate every citation against the retrieved id set**, dropping any the model invented. |

**Modify**

| File | Change |
|---|---|
| `domain/rag.py` | `AskRequest`, `AskResponse` (answer, citations, optionally the retrieval trace behind a debug flag). |
| `api/routers/rag.py` | `POST /ai/ask`. |
| `api/deps.py` | `RagService_Dep`. |
| `core/exceptions.py` | Add `ProviderUnavailableError`. Today an unreachable Ollama or a Groq outage surfaces as an unhandled 500 with a stack trace; RAG makes provider calls far more frequent, so this is worth doing now. |
| `core/error_handlers.py` | Map it to 503. |

Citation validation is not optional, and it is continuous with what this
codebase already does: `AIService._filter_extract_response` distrusts the
model's output and re-checks it in Python against evidence in the source text.
Apply the same posture — instruct the model to answer only from the context and
to say so when the context does not cover the question, then enforce it by
intersecting the returned citations with the retrieved ids.

**Exit check** — a question answerable from the starter world returns a grounded
answer with valid citations; a question about something absent returns an
explicit "not in this world" rather than an invention.

### Phase 6 — Tests

**Create**

| File | Covers |
|---|---|
| `tests/test_embeddings.py` | Canonical text is deterministic and covers each label's fields; create and update both persist a vector; the model stamp is written. |
| `tests/test_retrieval.py` | Seeds rank sensibly against a known fixture world; expansion returns the induced edge set; the context cap holds. |
| `tests/test_rag.py` | End-to-end `/ai/ask` against a stub LLM; invented citations are stripped. |
| `tests/test_rag_isolation.py` | **The important one.** Account A's question must never retrieve, cite, or expand into account B's entities — including when B's world contains a near-identical entity that would outrank A's own on raw similarity. This is the test that would catch a regression to global-index search (§2.3). |

**Modify**

| File | Change |
|---|---|
| `tests/conftest.py` | Override `get_embedder` with the deterministic fake, following the `get_llm` override pattern already in `test_ai_service.py`. Add a fixture that gives one account a small known world — note the suite sets `SEED_NEW_USER_WORLD=false`, so RAG tests must build their own fixture or re-enable seeding locally. |

Keep the suite offline: the fake embedder must produce stable vectors from text
without a network call, so retrieval assertions stay deterministic.

### Phase 7 — Deployment

**Modify**

| File | Change |
|---|---|
| `backend/requirements.txt` | Regenerate — Vercel does not read `uv.lock`. |
| `backend/README.md` | New env vars, the `/ai/ask` and `/ai/retrieve` rows in the API surface table, and a note that switching embedding models requires a backfill. |
| `backend/.env.example` | Same vars, placeholders only. |
| `docker-compose.yml` | Pin `neo4j:5.26` so local matches Aura's feature set (§2.3). |

Vercel environment variables to add: the embedding provider selector, its API
key, the model name, and the dimension. Redeploy after — env changes do not
apply to already-built deployments, the same trap the README already documents
for `CORS_ORIGINS`.

Then run `scripts/backfill_embeddings.py` against Aura once, for every existing
account. Accounts registered before Phase 3 have no vectors and will answer
every question with "not in this world" until it runs.

---

## 6. Summary of file churn

**Created (10)**

```
providers/embeddings.py
repositories/embedding_repo.py
services/embedding_service.py
services/retrieval_service.py
services/rag_service.py
domain/rag.py
api/routers/rag.py
scripts/backfill_embeddings.py
tests/test_embeddings.py · test_retrieval.py · test_rag.py · test_rag_isolation.py
```

**Modified (~20)**

```
core/config.py · core/exceptions.py · core/error_handlers.py
providers/llm.py · providers/deps.py
repositories/{character,location,faction,event}_repo.py   (projections)
repositories/graph_repo.py · repositories/world_repo.py
services/{character,location,faction,event}_service.py
api/deps.py · api/routers/__init__.py
api/routers/{characters,locations,factions,events}.py
tests/conftest.py · tests/test_ai_service.py
backend/README.md · .env.example · requirements.txt · docker-compose.yml
```

## 7. The five traps, collected

1. **Groq cannot embed** — production's chat provider has no embeddings
   endpoint. Split the provider axes (§2.1). Blocking.
2. **The global vector index ignores `owner_id`** — index-based top-K will
   return other accounts' nodes and starve the caller. Use exact owner-scoped
   cosine for V1 (§2.3). Passes on a fresh DB, degrades in production.
3. **16 `{.*}` projections** will start returning vectors to no one. Fix before
   the vectors exist (Phase 2).
4. **`PATCH` has no reindex hook** — embeddings go stale on every edit unless
   one is added (Phase 3).
5. **`BackgroundTasks` can be dropped on Vercel** — fine for a timestamp, not
   for an embedding. Write synchronously; keep the backfill script as the net
   (Phase 3).
