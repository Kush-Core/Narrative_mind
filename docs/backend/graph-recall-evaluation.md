# Graph Recall — Evaluation Metric Design

Plan only: what to build, where it goes, what it means, and which semantic
decisions are already settled. No implementation.

Paths in this document are repository-relative. Backend source lives under
`backend/src/narrative_mind/`; where a path appears without that prefix it is
relative to that package, matching the convention in
[`GRAPH_RAG_PLAN.md`](./GRAPH_RAG_PLAN.md).

---

## 1. Goal

### The problem

Graph RAG is built and correct, but **unmeasured**. `services/retrieval_service.py`
decides what the model gets to see, and three settings control it —
`rag_seed_top_k` (8), `rag_expand_depth` (1), `rag_max_context_entities` (30) —
that were chosen by hand and have never been validated against anything. Today
there is no way to answer:

- Is `rag_expand_depth=1` enough, or is the default losing answers to depth 2?
- How much of retrieval quality comes from vector search versus graph expansion?
  (The entire argument for building a *graph* RAG rather than flat RAG —
  `GRAPH_RAG_PLAN.md` §1 step 3 — is currently an assertion, not a number.)
- Is `rag_seed_top_k=8` starving multi-entity questions?
- After switching `EMBEDDING_PROVIDER` from `ollama` to `google` — a change the
  README already flags as corpus-invalidating — **is retrieval as good as it was?**
  This is a documented hazard with no detection mechanism.
- When an answer is wrong, was the *context* missing the evidence, or did the
  model fumble evidence it had?

The existing test suite proves the pipeline *runs correctly*. It cannot say
whether it *retrieves well*. Those are different questions and today only the
first has an answer.

This feature formalizes what `GRAPH_RAG_HANDOFF.md` §3 (Phase 4) already
prescribes as a manual exercise:

> "for three questions, write down by hand which entities *should* be retrieved,
> then compare against what the retriever returns. That's your retrieval quality
> metric, and it's the only honest one you'll have before there's an LLM in the loop."

### What we want to measure

**Graph recall**: given a natural-language question whose answer is known to
live in a specific set of entities and relationships in the caller's world, what
fraction of that set actually reaches the serialized context block?

Formally, the metric evaluates the output of
`RetrievalService.retrieve()` — specifically `RetrievalResult.entities` and
`RetrievalResult.relationships` (`domain/rag.py:28`) — against a hand-annotated
reference subgraph drawn from the starter world.

### Why graph recall specifically, for this system

Because retrieval here returns an **induced subgraph**, not a ranked list of text
chunks. `GraphRepository.expand` (`repositories/graph_repo.py:85`) collects the
node set within *depth* hops of the seeds and then matches every edge whose
*both* endpoints are in that set. `RetrievalService._serialize` then emits two
blocks — one line per entity, one line per edge — and the edge lines are the
whole point:

> "the answer to 'who would object if Aria took Kestrelwatch?' is not in any one
> node's text, it is in the edges around it" — `GRAPH_RAG_PLAN.md` §1

A recall metric that counted only entities would score a retrieval that returned
all the right nodes and none of the relationships between them as perfect,
while the context block it produced would be useless for exactly the class of
question the graph exists to serve. Edge recall is what makes the metric a
*graph* metric rather than a document-retrieval metric wearing a graph's clothes.

### What part of the pipeline is evaluated

Everything inside `RetrievalService.retrieve()`, end to end:

```
question
  → EmbeddingProvider.embed_query              providers/embeddings.py
  → EmbeddingRepository.find_similar(v, top_k) repositories/embedding_repo.py:92
  → GraphRepository.expand(seed_ids, depth)    repositories/graph_repo.py:85
  → RetrievalService._order_candidates          services/retrieval_service.py:81
  → RetrievalService._serialize (caps applied)  services/retrieval_service.py:97
  → RetrievalResult
```

Nothing downstream (`RagService.ask`, the LLM, citations) and nothing upstream
(the write path, `EmbeddingService.reindex`) is under test — with one deliberate
exception: the runner **pre-checks** for unembedded entities via
`EmbeddingRepository.find_stale` so that a backfill gap is reported as a
precondition failure rather than silently scored as a retrieval-quality
regression.

### Success criteria

A correct implementation lets an engineer run one command and determine, with
numbers:

1. Macro node recall of the current configuration over the starter world.
2. Whether depth 2 raises node recall enough to justify its context cost — and
   whether it *lowers* edge recall by pushing the serializer past its character
   budget (see §11).
3. **Expansion gain**: `node_recall − seed_recall`, i.e. how many reference
   entities graph expansion recovered that vector search alone missed. This is
   the graph's contribution, isolated.
4. Exactly *which* entities and relationships a failing question missed
   (`missing_nodes` / `missing_edges` per query), so tuning is directed rather
   than blind.
5. Whether a change to `EMBEDDING_PROVIDER` / model preserved retrieval quality.

### Non-goals — what this metric explicitly does **not** measure

| Not measured | Why, and where it actually lives |
|---|---|
| **LLM answer correctness** | `AskResponse.answer` is generated text. Nothing here reads it. A perfect-recall context can still yield a wrong answer, and this metric will say the retrieval was fine — which is the point of separating them. |
| **Answer faithfulness / groundedness** | A generation-side property. No LLM is invoked anywhere in this feature. |
| **Citation correctness** | Already a **structural guarantee**, not a metric: `RagService.ask` intersects model-emitted ids with the retrieved id set (`services/rag_service.py:52-56`), and `tests/test_rag.py::test_invented_citation_is_stripped` enforces it. Citation *completeness* is an answer-quality question and is out of scope. |
| **Text / chunk retrieval recall** | There is no chunking. `GRAPH_RAG_PLAN.md` §1: "no chunking … one embedding per node is the whole story." The unit of retrieval **is** the entity. |
| **Community recall** | **There are no communities in this system.** No Leiden, no clustering, no community summaries. This is not Microsoft GraphRAG. Do not import that concept. |
| **Precision / noise** | Deliberately excluded — see §5.7. Recall is reported *at a configuration* with retrieved-set size as the co-reported cost axis. |
| **Cross-account isolation** | Already covered structurally and by `tests/test_rag_isolation.py`. Recall is the wrong instrument for a security property. |
| **Latency / throughput** | Wall-clock duration is *printed* for reproducibility. It is not a metric and nothing asserts on it. |

---

## 2. Current Architecture

### 2.1 There is no existing evaluation architecture

A full-repository search for `recall`, `precision`, `eval`, `metric`,
`benchmark`, `ground.?truth`, `golden` returns **five matches, none of them
code**: three prose mentions in docs and two unrelated uses of the word
"precision" in the frontend. There is no metric interface, no result type, no
aggregation mechanism, no evaluation CLI, no reporting layer.

**Consequence for this plan:** there is nothing to extend, so the plan adds the
smallest self-contained harness that does the job, shaped like the rest of the
repo, and does not attempt to be a general evaluation framework.

The two things that come closest and *are* reused:

| Artifact | Role here |
|---|---|
| `POST /ai/retrieve` → `RetrievalResult` (`api/routers/rag.py:9`, `domain/rag.py:28`) | The observable output of the system under evaluation. Already designed as a debugging window: *"Keep it in V1 permanently; it is the only window into why an answer was wrong."* (`GRAPH_RAG_PLAN.md` §5 Phase 4) |
| `tests/test_retrieval.py` | The existing binary, assertion-style retrieval checks, and the source of the deterministic-seed technique this plan reuses (§10.2). |

### 2.2 The pipeline under evaluation

**`services/retrieval_service.py`**

```python
class RetrievalService:
    def __init__(self, embedding_repo, graph_repo, embedder, *,
                 seed_top_k: int, expand_depth: int, max_context_entities: int)
    async def retrieve(self, request: RetrieveRequest) -> RetrievalResult   # :44
    @staticmethod def _order_candidates(seeds, expanded_nodes)              # :81
    @staticmethod def _serialize(entities, relationships)                   # :97
_MAX_CONTEXT_CHARS = 4000                                                   # :16
```

Three properties matter to the metric:

1. **`_order_candidates` puts seeds first**, then expansion-only nodes. So when
   `max_context_entities` binds, expansion nodes are dropped before seeds.
2. **`_serialize` returns exactly what it emitted.** Its docstring is explicit:
   *"returns exactly the entities/relationships that made it in — so
   `RetrievalResult.entities`/`.relationships` can never claim more than
   `context` actually contains."* This is what makes `.entities`/`.relationships`
   a faithful proxy for the context block, and therefore a sound evaluation target.
3. **An edge survives only if both endpoints survived** (`:122`), and then only
   if the 4000-char budget still has room (`:127`).

**`repositories/embedding_repo.py`** — `find_similar(query_vector, top_k)` (`:92`):
exact owner-scoped cosine via `vector.similarity.cosine()`, one label-scoped
`MATCH` per label unioned, ordered by score, limited to `top_k`. Not a vector
index — see `GRAPH_RAG_PLAN.md` §2.3. Also `find_stale(model_name)` (`:69`),
used by this plan as a precondition check.

**`repositories/graph_repo.py`** — `expand(seed_ids, depth)` (`:85`): depth
clamped to `[1, 2]`; returns `{"nodes": [...], "relationships": [...]}` where a
node is `{id, name, labels}` and a relationship is
`{source, target, rel_type, sentiment}` with `source = startNode(r).id` —
**direction is real and preserved**.

**`domain/rag.py`** — the result schema the metric consumes:

```python
class RetrievedEntity:        id, label, name, score: float | None   # None ⇒ expansion-only
class RetrievedRelationship:  source, target, rel_type, sentiment
class RetrievalResult:        seeds, entities, relationships, context, char_count
```

`seeds` being a separate field is load-bearing: it gives the **depth-0 baseline
for free**, which is how expansion gain is computed without any production
change. (`RetrieveRequest.depth` is `ge=1, le=2`, so depth 0 is not reachable
through the API — and does not need to be.)

### 2.3 Identity, ownership, and configuration

- **`domain/starter_world.py:24`** — `entity_id(owner_id, slug) = str(uuid5(NAMESPACE, f"{owner_id}:{slug}"))`.
  Deterministic and stable across re-seeds. **This is the whole matching story**
  (§5.3).
- **Ownership is structural.** `EmbeddingRepository` and `GraphRepository` are
  constructed with `owner_id` (`api/deps.py:167,177`). The evaluation runner must
  construct them the same way — precedent: `scripts/backfill_embeddings.py:39`
  builds `EmbeddingService(EmbeddingRepository(session, user["id"]), embedder)`
  directly.
- **`providers/deps.py:54`** — `get_embedder(settings) -> EmbeddingProvider`.
  A plain function taking `Settings`; scripts already call it directly
  (`scripts/seed_world.py:55`, `scripts/backfill_embeddings.py:51`). The
  evaluation CLI reuses it — **it must not build its own embedding path.**
- **`core/config.py:60-62`** — `rag_seed_top_k=8`, `rag_expand_depth=1`,
  `rag_max_context_entities=30`. No new settings fields are added; the CLI
  overrides these per run, because a sweep needs per-run values, not env vars.
- **`repositories/world_repo.py:229`** — `counts(owner_id)` returns per-label node
  counts and per-type edge counts. Reused as the runner's world precondition check.

### 2.4 Test conventions the plan must follow

From `backend/src/narrative_mind/tests/conftest.py`:

- `os.environ["SEED_NEW_USER_WORLD"] = "false"` at `:13`, before `Settings` is
  constructed — **test accounts start empty**. Anything needing the starter
  world must seed it itself.
- `app.dependency_overrides[get_embedder] = FakeEmbeddingProvider` at `:107` —
  the suite never touches a live provider.
- `registered_accounts` (`:46`) deletes the account and everything carrying its
  `owner_id`, so teardown for a seeded starter world is already handled.
- `teardown_driver` (`:25`) is a **synchronous** driver, deliberately: the app's
  async driver is bound to the `TestClient`'s event loop.
- No `pytest-asyncio`. Async code in tests is driven with `asyncio.run(...)`
  (`tests/test_retrieval.py:110`).

---

## 3. Existing Seed Data

### 3.1 Location and schema

**`backend/src/narrative_mind/domain/starter_world.py`** — 342 lines, pure Python
literals, no I/O. It exists in the package rather than in `scripts/` because it
has two consumers that must not drift (registration and the reset script). The
evaluation dataset will sit beside it under the same reasoning.

| Constant | Shape | Count |
|---|---|---|
| `LOCATIONS` | `(slug, name, region, description)` | 6 |
| `FACTIONS` | `(slug, name, ideology, description)` | 5 |
| `EVENTS` | `(slug, name, timeline_order, summary)` | 6 |
| `CHARACTERS` | `(slug, name, aliases, status, description)` | 10 |
| `LOCATED_IN` | `(character_slug, location_slug)` | 10 |
| `MEMBER_OF` | `(character_slug, faction_slug)` | 9 |
| `PARTICIPATED_IN` | `(character_slug, event_slug)` | 25 |
| `KNOWS` | `(character_slug, character_slug, sentiment)` | 25 |
| | **27 nodes / 69 edges** | |

`WORLD_LABELS = ("Character", "Location", "Faction", "Event")`.
`NAMESPACE = UUID("6f9b1c1e-0f4a-5c3d-9e2b-7a1d4f8c2b60")`.

### 3.2 The entities

**Locations** (2 regions) — `ironmere`, `greyfen`, `saltmarch` (The Drowned Vale);
`kestrelwatch`, `coldharrow`, `duskvale` (The High Verge).

**Factions** — `tidebinders`, `kestrel-order`, `salt-guild`, `quiet-hand`,
`coldharrow-archive`.

**Events** (`timeline_order` 1→6, each a consequence of the last) —
`the-drowning`, `the-long-winter`, `the-salt-riots`, `the-verge-compact`,
`the-annex-fire`, `the-reckoning`.

**Characters** — `mira-solenne`, `roderic-kell`, `elin-vast`, `ivo-marrow`,
`thea-blackwood`, `corin-ashe`, `garen-coldwater`, `ondine-marsh`,
`osric-dane` (dead), `lys-fenwick` (unknown).

### 3.3 The relationships

Every edge is Character-sourced, matching the one write path the API exposes
(`GraphService._ALLOWED_REL_TYPES = {"KNOWS","MEMBER_OF","LOCATED_IN","PARTICIPATED_IN"}`,
`services/graph_service.py:9`). The seed comment says so explicitly: *"the seed
stays inside that envelope"* — i.e. **the seeded world contains nothing a user
could not have created themselves**, which is what makes it a valid proxy for a
production world.

Two structural details the dataset exploits:

- **`KNOWS` is directed and asymmetric.** Each side carries its own sentiment:
  `("mira-solenne","corin-ashe","trusting")` and
  `("corin-ashe","mira-solenne","guilty")` are two distinct edges. Direction is
  therefore significant to edge identity (§5.4).
- **`ondine-marsh` has no `MEMBER_OF` edge**, deliberately ("she resigned to take
  the delegate seat"). Any reference set derived by a "characters and their
  factions" rule must handle her absence — which query `q07` does.

### 3.4 How it is loaded

```
AuthService.register (services/user_service.py:47)
  └─ if seed_new_user_world:
       load_starter_world_embeddings(embedder.model_name)   domain/starter_world_embeddings.py:34
       WorldRepository.seed_starter_world(user.id, embeddings=…, embedding_model=…)
                                                            repositories/world_repo.py:43
scripts/seed_world.py <email>   — resets one account back to it
```

`seed_starter_world` writes all 27 nodes and 69 edges in **one transaction**,
stamping each node with `embedding` / `embedding_model` / `embedded_at` from the
precomputed file when one exists for the current model, and leaving them null
otherwise — in which case `scripts/backfill_embeddings.py` picks them up.

`backend/src/narrative_mind/domain/starter_world_embeddings.models_gemini-embedding-001.json`
is the one precomputed file currently checked in. There is **no file for
`fake-embedding-v1`**, which is why the test fixture in §8 Step 7 must backfill.

### 3.5 Does the seed data map to the production GraphRAG graph?

Yes, exactly — it *is* the production graph for every account that has not edited
it. `entity_id(owner_id, slug)` varies the id per account while the text is
byte-identical, which is precisely why the embeddings are shareable
(`domain/starter_world_embeddings.py` docstring). So:

- A reference set written in slugs is valid for **every** account's copy.
- The canonical text each node embeds to is fully determined by
  `canonical_text(label, entity)` (`services/embedding_service.py:29`) applied to
  seed literals — reproducible offline with no database.

### 3.6 Can the seed data serve as ground truth?

**Partly, and the distinction matters.**

| Ground-truth component | Supplied by | Notes |
|---|---|---|
| The universe of entities and edges | ✅ `starter_world.py` | Complete and authoritative. |
| Stable identity | ✅ `entity_id(owner_id, slug)` | Exact matching, no normalization needed. |
| Edge direction and type | ✅ the four edge lists | Directed triples, unambiguous. |
| **Queries** | ❌ | The seed data contains no questions. |
| **Per-query relevance judgments** | ❌ | Which subgraph answers which question is a human judgment. |

So the dataset is **hand-annotated relevance over machine-supplied structure**.
To keep the annotation honest and auditable rather than arbitrary, every
reference set in §4 is additionally expressed as a **structural rule over the
seed lists** (e.g. *"every character with `PARTICIPATED_IN → the-salt-riots`,
plus the factions those characters are `MEMBER_OF`"*), and a test asserts every
annotated slug and edge actually exists in `starter_world.py` (§10.3). Editing
the seed world then breaks the dataset test loudly instead of silently measuring
against a stale reference.

**No synthetic dataset is invented.** Every entity and edge below is real seed data.

---

## 4. Test / Evaluation Dataset

### 4.1 Three datasets, deliberately separated

| Tier | Where | Data | Embedder | Network | In `pytest`? |
|---|---|---|---|---|---|
| **Unit fixtures** | `tests/test_graph_recall.py` | Hand-built `RetrievalResult` objects and tiny reference sets, written inline | none | no | ✅ |
| **Integration dataset** | `tests/test_graph_recall_pipeline.py` | The real starter world in a real Neo4j, seeded per test account | `FakeEmbeddingProvider` | no | ✅ |
| **Evaluation / benchmark dataset** | `evaluation/dataset.py` → `scripts/evaluate_graph_recall.py` | `EVAL_QUERIES`: 12 natural-language questions + annotated reference subgraphs | **real** Ollama / Google | yes | ❌ **never** |

The separation is the design, not an accident:

```
pytest                              scripts/evaluate_graph_recall.py
  ↓                                   ↓
FakeEmbeddingProvider (SHA-256)     real embedding provider
  ↓                                   ↓
offline · deterministic · fast      genuine semantic embeddings
  ↓                                   ↓
"Is the implementation correct?"    "Does retrieval actually work?"
```

`FakeEmbeddingProvider` (`providers/embeddings.py:95`) hashes text with SHA-256.
It has **no semantics whatsoever** — "Kestrelwatch" and "the cliff fortress"
hash to unrelated vectors. It is a *testing utility*, and a recall number
produced under it is meaningless as a quality claim. It is nonetheless perfect
for determinism, and §10.2 exploits exactly that.

> **A fake-embedding test result is never evidence that the metric works
> semantically.** Report the two tiers separately, always.

### 4.2 The evaluation dataset — `verge-starter-v1`

12 questions over the starter world. Every reference node and edge below was
validated against `starter_world.py` during design: **51 reference nodes,
43 reference edges, 0 invalid**.

The `Structural rule` column is what makes each annotation auditable; the
`Anchor` column names the entity a question mentions outright (an ideal vector
search ranks it first) and drives both the deterministic tests of §10.2 and the
*anchor hit rate* diagnostic.

| # | Question | Expected entities (slugs) | Expected relationships | Anchor | Structural rule |
|---|---|---|---|---|---|
| **q01** | Who was at Kestrelwatch during the Long Winter? | `kestrelwatch`, `the-long-winter`, `roderic-kell`, `garen-coldwater` | `roderic-kell –LOCATED_IN→ kestrelwatch`; `garen-coldwater –LOCATED_IN→ kestrelwatch`; `roderic-kell –PARTICIPATED_IN→ the-long-winter`; `garen-coldwater –PARTICIPATED_IN→ the-long-winter` | `kestrelwatch` | Characters `LOCATED_IN kestrelwatch` **∩** `PARTICIPATED_IN the-long-winter`, plus both anchors |
| **q02** | Which characters belong to the Kestrel Order? | `kestrel-order`, `roderic-kell`, `garen-coldwater` | `roderic-kell –MEMBER_OF→ kestrel-order`; `garen-coldwater –MEMBER_OF→ kestrel-order` | `kestrel-order` | 1-hop `MEMBER_OF` in-neighbourhood of the faction |
| **q03** | Who signed the Verge Compact? | `the-verge-compact`, `roderic-kell`, `elin-vast`, `mira-solenne`, `ondine-marsh`, `ivo-marrow` | 5 × `… –PARTICIPATED_IN→ the-verge-compact` | `the-verge-compact` | All `PARTICIPATED_IN` participants of the event |
| **q04** | Who does Mira Solenne know? | `mira-solenne`, `corin-ashe`, `ondine-marsh`, `roderic-kell` | `mira-solenne –KNOWS→ corin-ashe`; `… → ondine-marsh`; `… → roderic-kell` | `mira-solenne` | **Outgoing** `KNOWS` edges only |
| **q05** | Who was involved in the Annex Fire, and where did it happen? | `the-annex-fire`, `thea-blackwood`, `lys-fenwick`, `ivo-marrow`, `ironmere` | 3 × `… –PARTICIPATED_IN→ the-annex-fire`; `lys-fenwick –LOCATED_IN→ ironmere` | `the-annex-fire` | Event participants **plus** the location named in the event summary |
| **q06** | What is Coldharrow? | `coldharrow` | *(none)* | `coldharrow` | Single-entity lookup — **no edge is required to answer** |
| **q07** | Which factions were involved in the Salt Riots? | `the-salt-riots`, `ondine-marsh`, `elin-vast`, `osric-dane`, `corin-ashe`, `salt-guild`, `tidebinders` | 4 × `… –PARTICIPATED_IN→ the-salt-riots`; `elin-vast –MEMBER_OF→ salt-guild`; `osric-dane –MEMBER_OF→ salt-guild`; `corin-ashe –MEMBER_OF→ tidebinders` | `the-salt-riots` | Event participants, plus the factions they are `MEMBER_OF` (`ondine-marsh` has none — included as a participant, contributes no edge) |
| **q08** | What happened to Lys Fenwick? | `lys-fenwick`, `the-annex-fire`, `ironmere`, `coldharrow-archive`, `thea-blackwood` | `lys-fenwick –PARTICIPATED_IN→ the-annex-fire`; `–LOCATED_IN→ ironmere`; `–MEMBER_OF→ coldharrow-archive`; `–KNOWS→ thea-blackwood` | `lys-fenwick` | Complete 1-hop ego network of one character |
| **q09** | Why does Greyfen resent Kestrelwatch? | `greyfen`, `kestrelwatch`, `the-long-winter`, `roderic-kell`, `garen-coldwater`, `ondine-marsh`, `corin-ashe` | 4 × `LOCATED_IN` (2 per location); 4 × `… –PARTICIPATED_IN→ the-long-winter` | `greyfen`, `kestrelwatch` | Both locations, the event linking them, and the characters located in each **who also participated** (excludes `mira-solenne`, who is in Greyfen but not in the Long Winter) |
| **q10** | Who is passing information to the Quiet Hand? | `quiet-hand`, `ivo-marrow`, `corin-ashe`, `tidebinders` | `ivo-marrow –MEMBER_OF→ quiet-hand`; `ivo-marrow –KNOWS→ corin-ashe`; `corin-ashe –KNOWS→ ivo-marrow`; `corin-ashe –MEMBER_OF→ tidebinders` | `quiet-hand` | Faction → its member → that member's `KNOWS` counterpart → that character's faction (**3 hops**) |
| **q11** | Which characters are dead or missing? | `osric-dane`, `lys-fenwick` | *(none)* | *(none)* | `status ∈ {dead, unknown}` — a **node-property** query with no graph structure |
| **q12** | What connects Thea Blackwood to Ivo Marrow? | `thea-blackwood`, `ivo-marrow`, `the-annex-fire` | `thea-blackwood –KNOWS→ ivo-marrow`; `ivo-marrow –KNOWS→ thea-blackwood`; both `–PARTICIPATED_IN→ the-annex-fire` | `thea-blackwood`, `ivo-marrow` | The two characters, their **bidirectional** `KNOWS` pair, and the one event both attended |

### 4.3 How the dataset exercises the metric

Each query targets a distinct retrieval shape, so a single macro number
decomposes into interpretable failures:

| Shape | Queries | What a failure means |
|---|---|---|
| Single-entity lookup | q06 | Vector search is broken outright |
| 1-hop neighbourhood | q02, q08 | Expansion is not running, or `top_k` starved the seed |
| High-fan-out 1-hop | q03 | `max_context_entities` or the char budget is binding |
| Directed `KNOWS` | q04, q12 | Edge direction handled wrongly |
| 2-hop join | q01, q09 | `expand_depth=1` insufficient for intersection questions |
| 2-hop chain | q05, q07 | The classic depth-1-vs-2 case |
| 3-hop chain | q10 | Even depth 2 is short unless the vector step seeds mid-chain |
| Node property, no structure | q11 | **Negative control** — expansion cannot help; isolates the vector step |

q11 is deliberate: a dataset in which graph expansion always helps would
*overstate* expansion gain. q11 keeps the headline honest.

### 4.4 Deterministic structural expectations (oracle-anchor simulation)

Assuming a **perfect seed step** (only the anchor entities are seeded), the
induced subgraph is fully determined by `starter_world.py`. These values were
computed during design and are exact — they are what §10.2 asserts on:

| Query | \|R_node\| | \|R_edge\| | depth 1 node | depth 1 edge | depth 2 node | depth 2 edge |
|---|---|---|---|---|---|---|
| q01 | 4 | 4 | 0.750 | 0.500 | 1.000 | 1.000 |
| q02 | 3 | 2 | 1.000 | 1.000 | 1.000 | 1.000 |
| q03 | 6 | 5 | 1.000 | 1.000 | 1.000 | 1.000 |
| q04 | 4 | 3 | 1.000 | 1.000 | 1.000 | 1.000 |
| q05 | 5 | 4 | 0.800 | 0.750 | 1.000 | 1.000 |
| q06 | 1 | 0 | 1.000 | *n/a* | 1.000 | *n/a* |
| q07 | 7 | 7 | **0.714** | **0.571** | **1.000** | 1.000 |
| q08 | 5 | 4 | 1.000 | 1.000 | 1.000 | 1.000 |
| q09 | 7 | 8 | 0.857 | 0.500 | 1.000 | 1.000 |
| q10 | 4 | 4 | 0.500 | 0.250 | 0.750 | 0.750 |
| q11 | 2 | 0 | *n/a — no anchor* | *n/a* | *n/a* | *n/a* |
| q12 | 3 | 4 | 1.000 | 1.000 | 1.000 | 1.000 |
| **macro (11 anchored)** | | | **0.875** | **0.757** | **0.977** | **0.975** |

Read this as an **upper bound the real run is measured against**: it is what
retrieval would achieve if the vector step never missed. The gap between the real
macro recall and this table is attributable to vector search; the gap between
depth-1 and depth-2 columns is attributable to expansion depth.

> **These are structural bounds, not predicted benchmark results.** Do not write
> them into the README as achieved scores. The real number comes only from
> `scripts/evaluate_graph_recall.py` against a real provider.

### 4.5 What is deliberately excluded from the dataset

An "absent subject" query — e.g. *"Who is the dragon queen of the Ember Wastes?"*
— has an **empty reference node set**, over which recall is undefined
(0/0). It tests refusal behaviour in `RagService`, which is answer quality and
out of scope. §5.6 makes an empty reference node set a **dataset validation
error**, so such a query cannot be added by mistake.

---

## 5. Proposed Graph Recall Definition

### 5.1 Reference graph

For query `q`, the reference graph `G_q = (R_q, E_q)`:

- `R_q ⊆ SLUGS` — reference node slugs, `|R_q| ≥ 1` (enforced).
- `E_q ⊆ SLUGS × RELTYPES × SLUGS` — reference edges as **ordered** triples
  `(source_slug, rel_type, target_slug)`. `|E_q| ≥ 0`.

Both are hand-annotated (§4.2) and validated against `starter_world.py`.

### 5.2 Retrieved graph

From one `RetrievalResult`, with `slug_by_id = {entity_id(owner_id, s): s for s in SLUGS}`:

```
Ĝ_q  = { slug_by_id[e.id] for e in result.entities      if e.id in slug_by_id }
Ŝ_q  = { slug_by_id[e.id] for e in result.seeds         if e.id in slug_by_id }
Ê_q  = { (slug_by_id[r.source], r.rel_type, slug_by_id[r.target])
         for r in result.relationships
         if r.source in slug_by_id and r.target in slug_by_id }
```

Retrieved ids outside `slug_by_id` (entities the account created beyond the
starter world) are **ignored for recall** and counted only in the reported
context size. `result.entities`, not `result.context`, is the evaluation target —
`_serialize` guarantees the two agree.

### 5.3 Node matching

**Canonical-id matching via slug resolution. Nothing else.**

```
slug  --entity_id(owner_id, slug)-->  UUID  ==  RetrievedEntity.id
```

Explicitly **not** used, and why:

| Technique | Why not |
|---|---|
| Name matching | Ids are canonical and exact; names are display data. |
| Alias normalization | Aliases (`"The Lockkeeper"`) are node *properties*, not identities. `canonical_text` folds them into the embedded text, which is a retrieval concern, not a matching one. |
| Case folding / fuzzy matching | Nothing to fold — both sides are UUIDs. |
| Label checking | `id` is unique per label by constraint (`db/migrations.py:4-7`) and slugs are globally unique in the seed world; the label adds nothing. |

This is a real simplification the repository's design earns, and the metric
should not invent matching machinery it does not need.

### 5.4 Edge matching

Edge identity is the **ordered triple** `(source_slug, rel_type, target_slug)`.

- **Direction is significant.** `KNOWS` is genuinely asymmetric in the seed data
  (`mira-solenne → corin-ashe` "trusting" vs `corin-ashe → mira-solenne`
  "guilty"), and `expand` reports true direction via
  `startNode(r).id` / `endNode(r).id`. Collapsing to undirected would silently
  award credit for retrieving the wrong half of an asymmetric pair.
- **`sentiment` is not part of edge identity.** It is an attribute; including it
  would make the metric sensitive to data the retrieval step cannot get wrong.
- **Annotation safety:** a reversed annotation is impossible to miss, because the
  dataset validator (§10.3) checks each reference triple against the seed edge
  lists *in the annotated direction* and fails immediately.
- **Duplicates are impossible and handled anyway.** `MERGE` in
  `world_repo._seed_tx` / `graph_repo._link_tx` guarantees at most one edge per
  `(source, type, target)`, and `expand` returns `collect(DISTINCT r)`. The
  metric uses Python `set`s regardless, so duplicates are idempotent.

### 5.5 The metrics

**Primary — node recall (macro):**

```
                  |R_q ∩ Ĝ_q|
   nodeRecall(q) = ───────────           |R_q| ≥ 1 always
                     |R_q|

                        1
   NodeRecall_macro =  ───  Σ  nodeRecall(q)
                       |Q|  q∈Q
```

**Co-primary — edge recall (macro), reported beside it, never blended in:**

```
                  |E_q ∩ Ê_q|
   edgeRecall(q) = ───────────    if |E_q| > 0
                     |E_q|

                 = undefined      if |E_q| = 0   (excluded from aggregation)

                        1
   EdgeRecall_macro =  ────  Σ  edgeRecall(q)          Q_E = { q : |E_q| > 0 }
                       |Q_E| q∈Q_E
```

`|Q_E|` is reported alongside, so a reader always knows the denominator.

**Micro (supporting, both):**

```
   NodeRecall_micro = Σ|R_q ∩ Ĝ_q| / Σ|R_q|
   EdgeRecall_micro = Σ|E_q ∩ Ê_q| / Σ|E_q|      over Q_E
```

Macro is primary because reference sizes vary 1→7 and each hand-authored
question deserves equal weight. Micro is reported because a large macro/micro gap
localizes failure to large-reference (fan-out) queries.

**Seed recall and expansion gain (supporting, the most repo-specific number):**

```
   seedRecall(q)      = |R_q ∩ Ŝ_q| / |R_q|
   SeedRecall_macro   = mean over Q
   ExpansionGain      = NodeRecall_macro − SeedRecall_macro   ∈ [0, 1]
```

`Ŝ_q ⊆ Ĝ_q` always (`_order_candidates` keeps every seed and the cap drops
expansion nodes first), so `ExpansionGain ≥ 0`. This is the depth-0-vs-depth-1
comparison from `GRAPH_RAG_HANDOFF.md` §3 Phase 4, expressed as a number, with
no production change required.

**Per-label node recall (supporting, diagnostic):** micro node recall restricted
to reference nodes of each label. `canonical_text` differs per label (Event gets
no attribute line, `services/embedding_service.py:9-13`), so a systematic label
bias is a real and actionable finding.

**Anchor hit rate (supporting, diagnostic):** fraction of queries whose declared
anchors all appear in `Ŝ_q`. A low value with high node recall means expansion is
carrying a weak vector step.

### 5.6 Empty-set behaviour

| Case | Behaviour |
|---|---|
| `\|R_q\| = 0` | **Dataset validation error.** Recall is undefined; §4.5 explains why such queries belong elsewhere. |
| `\|E_q\| = 0` (q06, q11) | `edgeRecall(q) = None`. Excluded from both macro and micro edge aggregates — **not 0.0** (deflates) and **not 1.0** (inflates). |
| `Ĝ_q = ∅` (empty world, provider returned nothing) | `nodeRecall = 0.0`, `edgeRecall = 0.0` where defined. Well-defined since `\|R_q\| ≥ 1`. |
| `Ê_q = ∅` but `E_q ≠ ∅` | `edgeRecall = 0.0`. Correct. |
| `Q = ∅` | Runner refuses to run. |

### 5.7 Why recall only, and no precision

Recall alone is trivially gamed by raising `top_k` and `depth`. The metric is
therefore **always reported at a configuration** — `(top_k, depth, max_context_entities)`
appear in every report header — with a **cost axis** printed beside it:
`mean_retrieved_entities`, `mean_retrieved_relationships`, `mean_context_chars`,
and the number of queries where the entity cap bound. A recall gain that doubles
context size is visible as such.

Precision is rejected rather than deferred, on a substantive ground: it would
require labelling every non-reference retrieved entity as *irrelevant*, and in
this system that is simply false. Expansion legitimately surfaces context that is
useful without being part of the minimal answer — a character's faction and
location enrich an answer about them without being "the answer". Labelling that
noise would encode a claim the design explicitly disagrees with.

---

## 6. Data Flow

```
 backend/src/narrative_mind/domain/starter_world.py
   LOCATIONS · FACTIONS · EVENTS · CHARACTERS
   LOCATED_IN · MEMBER_OF · PARTICIPATED_IN · KNOWS        (27 nodes / 69 edges)
                       │
                       │  hand-annotated relevance, one reference subgraph per question
                       ▼
 evaluation/dataset.py   EVAL_QUERIES : tuple[EvalQuery, ...]        (12 queries)
   id · question · reference_nodes(slugs) · reference_edges(triples) · anchors · rule
                       │
     validate_dataset() ├──► every slug and edge must exist in starter_world.py
                       │
                       ▼
 evaluation/runner.py   run_graph_recall(session, owner_id, embedder, config)
   ├─ precondition: WorldRepository.counts(owner_id)          world is present
   ├─ precondition: EmbeddingRepository.find_stale(model)     vectors are current
   ├─ slug_by_id = { entity_id(owner_id, slug) : slug }       identity resolution
   └─ for each EvalQuery:
          RetrievalService.retrieve(RetrieveRequest(question, top_k, depth))
                       │        (the exact object api/deps.py:278 builds for /ai/retrieve)
                       │
                       │  embed_query → find_similar(top_k) → expand(depth) → _serialize
                       ▼
              RetrievalResult   seeds · entities · relationships · context · char_count
                       │
                       ▼
 evaluation/graph_recall.py   score_query(query, result, slug_by_id) -> QueryRecall
   node_recall · edge_recall|None · seed_recall · missing_nodes · missing_edges · costs
                       │
                       ▼
 evaluation/graph_recall.py   aggregate(rows, config) -> GraphRecallReport
   macro/micro node · macro/micro edge · seed recall · expansion gain
   per-label breakdown · anchor hit rate · cost axis
                       │
                       ▼
 evaluation/report.py   render_text(report) -> str        stdout
 GraphRecallReport.model_dump_json(indent=2)              --json PATH
                       │
                       ▼
 scripts/evaluate_graph_recall.py   the only entry point; explicit developer action
```

**The same flow under `pytest`** substitutes `FakeEmbeddingProvider` and forces
the seed step deterministically (§10.2); it exercises the wiring, never the
semantics.

---

## 7. Files to Change

### 7.1 New files

| Path | Purpose | Important symbols |
|---|---|---|
| `backend/src/narrative_mind/evaluation/__init__.py` | Package marker. Empty, matching `services/__init__.py`. | — |
| `backend/src/narrative_mind/evaluation/models.py` | Pydantic models for the dataset record and every result shape. Leaf — imports only `pydantic`. | `EdgeRef` (type alias `tuple[str, str, str]`), `EvalQuery`, `QueryRecall`, `RunConfig`, `LabelRecall`, `GraphRecallReport` |
| `backend/src/narrative_mind/evaluation/dataset.py` | The 12-query dataset (§4.2) plus validation and id resolution. Data lives in the package, not `scripts/`, for the same reason `starter_world.py` does: two consumers (the script and the test suite) that must not drift. | `DATASET_NAME = "verge-starter-v1"`, `EVAL_QUERIES: tuple[EvalQuery, ...]`, `ALL_SLUGS`, `LABEL_BY_SLUG`, `SEED_EDGES`, `validate_dataset()`, `slug_index(owner_id)` |
| `backend/src/narrative_mind/evaluation/graph_recall.py` | The metric. **Pure functions, no I/O, no Neo4j, no provider.** | `retrieved_slugs()`, `retrieved_edges()`, `score_query()`, `aggregate()` |
| `backend/src/narrative_mind/evaluation/runner.py` | Orchestration: preconditions, build `RetrievalService`, loop the dataset, score, aggregate. | `run_graph_recall()`, `PreconditionError` |
| `backend/src/narrative_mind/evaluation/report.py` | Presentation only. | `render_text(report) -> str` |
| `backend/scripts/evaluate_graph_recall.py` | The CLI. Follows `scripts/backfill_embeddings.py` shape (module docstring as usage, driver, `run_migrations`, session, explicit output), but uses `argparse` (stdlib) because the flag count makes raw `sys.argv` worse. | `build_embedder()`, `main()` |

### 7.2 Modified files

| Path | Symbol | Change | Why necessary |
|---|---|---|---|
| `backend/src/narrative_mind/tests/conftest.py` | *(new)* `client_owner_id` fixture | Decode the bearer token already on `client.headers` via `core.security.decode_access_token`, return `payload["sub"]`. | The integration test needs the account's `owner_id` to resolve slugs to ids. Purely additive; touches no existing fixture. |
| `backend/src/narrative_mind/tests/conftest.py` | *(new)* `starter_world` fixture | Seed this account's starter world by calling `WorldRepository.seed_starter_world(owner_id)` then `EmbeddingService(EmbeddingRepository(session, owner_id), FakeEmbeddingProvider()).backfill()`, inside a single `asyncio.run` over a short-lived `AsyncGraphDatabase` driver. | `conftest.py:13` sets `SEED_NEW_USER_WORLD=false`, so test accounts start empty. There is no precomputed embedding file for `fake-embedding-v1`, so the backfill is required — and it exercises the repo's real recovery path. Teardown is already handled by `registered_accounts`. |
| `backend/README.md` | new `## Real Embedding Evaluation` section, after the "Graph RAG retrieval" settings table | Document the offline-tests-vs-real-benchmark split, the exact command, example output, and reproduction steps. | A portfolio reviewer must see at a glance that the metric is validated against real semantic embeddings and not only fakes. |

**No other production file changes.** `services/`, `repositories/`, `api/`,
`domain/`, `core/`, `providers/`, `db/` are untouched.

### 7.3 Test files

| Path | Tests | Fixtures / data |
|---|---|---|
| `backend/src/narrative_mind/tests/test_graph_recall.py` | Pure-function metric tests **and** dataset validation. No DB, no network — runs standalone like `test_pydantic_models.py`. | Hand-built `RetrievalResult` / `EvalQuery` objects inline; `EVAL_QUERIES` + `starter_world` literals for validation |
| `backend/src/narrative_mind/tests/test_graph_recall_pipeline.py` | Deterministic structural integration against real Neo4j via `RetrievalService`. | `client`, `client_owner_id`, `starter_world`, `teardown_driver`, `FakeEmbeddingProvider` |

### 7.4 Configuration / documentation

| Item | Change |
|---|---|
| `core/config.py` | **None.** No new `Settings` fields. A sweep needs per-run values, and the three RAG settings already exist as defaults the CLI overrides. |
| `pyproject.toml` | **None.** `argparse`, `json`, `time`, `datetime` are stdlib. No new dependency. |
| `backend/requirements.txt` | **None** — regenerating is only needed when dependencies change. |
| `backend/.env.example` | **None.** No new env var. |
| `backend/README.md` | One new section (§7.2). |
| `docs/backend/graph-recall-evaluation.md` | This document. |

---

## 8. Detailed Implementation Plan

### Step 1 — `evaluation/models.py`

**Depends on:** nothing. **Behaviour:** import-only; no runtime effect.

```python
EdgeRef = tuple[str, str, str]   # (source_slug, rel_type, target_slug)

class EvalQuery(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str                                   # "q07-salt-riots-factions"
    question: str
    reference_nodes: tuple[str, ...]          # slugs; min_length=1
    reference_edges: tuple[EdgeRef, ...] = ()
    anchors: tuple[str, ...] = ()             # entities the question names outright
    rule: str                                 # the structural rule, for auditability

class RunConfig(BaseModel):
    dataset: str; query_count: int
    provider: str; model: str; dimensions: int
    top_k: int; depth: int; max_context_entities: int
    account_email: str; owner_id: str
    started_at: str; duration_seconds: float

class QueryRecall(BaseModel):
    query_id: str; question: str
    node_recall: float
    edge_recall: float | None                 # None ⇔ |E_q| == 0
    seed_recall: float
    reference_node_count: int; matched_node_count: int
    reference_edge_count: int; matched_edge_count: int
    missing_nodes: list[str]                  # sorted slugs — the actionable output
    missing_edges: list[EdgeRef]              # sorted
    anchors_hit: bool
    retrieved_entity_count: int; retrieved_relationship_count: int
    context_chars: int
    entity_cap_reached: bool

class LabelRecall(BaseModel):
    label: str; matched: int; total: int; recall: float

class GraphRecallReport(BaseModel):
    config: RunConfig
    queries: list[QueryRecall]
    node_recall_macro: float; node_recall_micro: float
    edge_recall_macro: float | None; edge_recall_micro: float | None
    edge_scored_query_count: int
    seed_recall_macro: float
    expansion_gain: float
    anchor_hit_rate: float
    per_label: list[LabelRecall]
    mean_retrieved_entities: float
    mean_retrieved_relationships: float
    mean_context_chars: float
    entity_cap_reached_count: int
```

*Rationale:* `frozen=True` on `EvalQuery` makes the dataset a constant.
`missing_nodes` / `missing_edges` are the reason to build this rather than print
one number.

### Step 2 — `evaluation/dataset.py`

**Depends on:** Step 1, `domain/starter_world`. **Behaviour:** importing it must
not touch the network or the database.

1. Build `ALL_SLUGS: frozenset[str]` and `LABEL_BY_SLUG: dict[str, str]` from
   `LOCATIONS`, `FACTIONS`, `EVENTS`, `CHARACTERS`.
2. Build `SEED_EDGES: frozenset[EdgeRef]` from `LOCATED_IN`, `MEMBER_OF`,
   `PARTICIPATED_IN` (2-tuples) and `KNOWS` (3-tuples, **dropping sentiment** —
   it is not part of edge identity, §5.4).
3. Declare `EVAL_QUERIES` exactly as tabulated in §4.2, in `q01…q12` order, using
   tuple literals in the style of `starter_world.py`.
4. `validate_dataset() -> None` — raise `ValueError` naming the offending query on
   any of: unknown node slug; unknown anchor slug; reference edge absent from
   `SEED_EDGES` (**direction-sensitive**); empty `reference_nodes`; duplicate node
   or edge within a query; duplicate query `id`.
5. `slug_index(owner_id: str) -> dict[str, str]` — returns
   `{entity_id(owner_id, slug): slug for slug in ALL_SLUGS}`, importing
   `entity_id` from `domain.starter_world`. **The single identity boundary; do
   not reimplement `uuid5` anywhere.**

### Step 3 — `evaluation/graph_recall.py`

**Depends on:** Steps 1–2 and `domain.rag.RetrievalResult` (type only).
**Behaviour:** pure — same inputs, same outputs, no I/O.

```python
def retrieved_slugs(entities, slug_by_id) -> set[str]
def retrieved_edges(relationships, slug_by_id) -> set[EdgeRef]

def score_query(query, result, slug_by_id, *, max_context_entities) -> QueryRecall:
    ref_n   = set(query.reference_nodes)
    got_n   = retrieved_slugs(result.entities, slug_by_id)
    got_s   = retrieved_slugs(result.seeds,    slug_by_id)
    ref_e   = set(query.reference_edges)
    got_e   = retrieved_edges(result.relationships, slug_by_id)

    node_recall = len(ref_n & got_n) / len(ref_n)          # |ref_n| >= 1, validated
    edge_recall = (len(ref_e & got_e) / len(ref_e)) if ref_e else None
    seed_recall = len(ref_n & got_s) / len(ref_n)
    ...  # missing_* sorted; anchors_hit = set(query.anchors) <= got_s
         # entity_cap_reached = len(result.entities) >= max_context_entities

def aggregate(rows, config) -> GraphRecallReport
```

*Rationale for isolating this module:* it is the only part that must be provable,
and it must be testable with no Neo4j, no provider, and no event loop.

*Aggregation rules to implement literally:* macro node = mean over all rows;
micro node = `Σmatched / Σtotal`; edge macro/micro over rows with
`edge_recall is not None` only, `None` for both if that subset is empty;
`expansion_gain = node_recall_macro − seed_recall_macro`; per-label via
`LABEL_BY_SLUG` over pooled reference nodes.

### Step 4 — `evaluation/runner.py`

**Depends on:** Steps 1–3, `RetrievalService`, `EmbeddingRepository`,
`GraphRepository`, `WorldRepository`.

```python
class PreconditionError(RuntimeError): ...

async def run_graph_recall(
    session: AsyncSession, *, owner_id: str, account_email: str,
    embedder: EmbeddingProvider, top_k: int, depth: int,
    max_context_entities: int, queries=EVAL_QUERIES,
) -> GraphRecallReport:
```

1. `validate_dataset()` — fail fast on a rotten dataset.
2. **World precondition** — `WorldRepository(session).counts(owner_id)`. Raise
   `PreconditionError` if any of `Character/Location/Faction/Event` is `0`; emit a
   warning (returned to the CLI, not raised) if counts differ from
   `{Character:10, Location:6, Faction:5, Event:6}` / 69 edges, since a user may
   legitimately have edited their world.
3. **Embedding precondition** — `EmbeddingRepository(session, owner_id).find_stale(embedder.model_name)`.
   If non-empty, raise `PreconditionError` naming the count and the fix:
   `uv run python scripts/precompute_starter_world_embeddings.py` then
   `uv run python scripts/backfill_embeddings.py <email>`.
   **This guard is mandatory**, not optional: with `--model` overridable from the
   CLI, comparing a query vector against another model's stored vectors produces
   silent garbage (or a dimension error), and would otherwise be misread as a
   quality regression.
4. Build the pipeline exactly as `api/deps.py:278 get_retrieval_service` does:
   `RetrievalService(EmbeddingRepository(session, owner_id), GraphRepository(session, owner_id), embedder, seed_top_k=top_k, expand_depth=depth, max_context_entities=max_context_entities)`.
5. `slug_by_id = slug_index(owner_id)`.
6. For each query: `await service.retrieve(RetrieveRequest(question=q.question, top_k=top_k, depth=depth))`,
   then `score_query(...)`. Sequential, not concurrent — one Neo4j session is not
   safe for concurrent transactions, and 12 queries do not need it.
7. Time the loop with `time.perf_counter()`; stamp `started_at` as
   `datetime.now(UTC).isoformat()`.
8. `return aggregate(rows, config)`.

*Rationale for in-process rather than HTTP:* the runner builds the *same*
`RetrievalService` object the route builds, so it evaluates the real pipeline
without a running server, a login, or token handling — matching every existing
script in `scripts/`.

### Step 5 — `evaluation/report.py`

`render_text(report) -> str`. Header block, per-query table, aggregate block,
then the misses. Locked format:

```
Graph Recall Evaluation
───────────────────────────────────────────────────────────────
Provider      ollama
Model         nomic-embed-text-v2-moe:latest (768d)
Account       gm@example.com
World         starter-world · Character 10 / Location 6 / Faction 5 / Event 6 · 69 edges
Dataset       verge-starter-v1
Examples      12 queries
Top-K         8
Depth         1
Max context   30 entities
Started       2026-08-25T14:02:11+00:00
Duration      4.31s

query                                node    edge    seed   ents  edges  chars
q01-kestrelwatch-long-winter        0.750   0.500   0.500     14     22   2140
q02-kestrel-order-members           1.000   1.000   0.667     11     18   1702
...
q11-dead-or-missing                 0.500     ---   0.500      9     12   1310

Graph Recall (node, macro)          0.8xx        <-- PRIMARY
Graph Recall (node, micro)          0.8xx
Edge recall (macro)                 0.7xx        (10 of 12 queries scored)
Edge recall (micro)                 0.7xx
Seed recall (macro)                 0.4xx
Expansion gain                     +0.4xx        graph expansion over vector search alone
Anchor hit rate                     0.9xx

Per label (micro)   Character 32  0.8xx | Location 6 0.8xx | Faction 6 0.6xx | Event 7 1.000

Context cost        12.4 entities / 21.1 edges / 1980 chars per query
                    entity cap reached on 0 of 12 queries

Missing
  q07  nodes: salt-guild, tidebinders
       edges: elin-vast -MEMBER_OF-> salt-guild
              osric-dane -MEMBER_OF-> salt-guild
              corin-ashe -MEMBER_OF-> tidebinders
```

Rules: `---` for an undefined edge recall (never `0.000`); the primary metric
carries an explicit marker; the cost axis is always printed next to the recall
block so a recall gain bought with context bloat is visible.

### Step 6 — `scripts/evaluate_graph_recall.py`

```bash
uv run python scripts/evaluate_graph_recall.py <email> \
    [--provider ollama|google] [--model NAME] [--dimensions N] \
    [--top-k N] [--depth 1|2] [--max-entities N] [--json PATH]
```

1. Module docstring as usage text, following `scripts/backfill_embeddings.py`.
2. `argparse`; positional `email`; all flags optional, defaulting to the values
   already in `get_settings()`.
3. `build_embedder(args, settings) -> EmbeddingProvider` — when any of
   `--provider/--model/--dimensions` is given, construct an overridden
   `Settings(...)` and pass it to **the existing** `providers.deps.get_embedder`.
   Map `--model`/`--dimensions` onto `ollama_embed_model`/`ollama_embed_dimensions`
   or `google_embed_model`/`google_embed_dimensions` according to the resolved
   provider. **Never instantiate a provider class directly and never construct an
   embedding path of its own** — reuse the repository's abstraction.
4. `AsyncGraphDatabase.driver(...)`, `await run_migrations(driver)`, session,
   `UserRepository(session).get_by_email(email)` → 404-style message and exit 1 if
   absent. Same shape as `scripts/backfill_embeddings.py:52-69`.
5. `await run_graph_recall(...)`; print `render_text(report)`; if `--json PATH`,
   write `report.model_dump_json(indent=2)`.
6. Exit codes: `0` success; `1` account/precondition failure; `2` bad arguments.
   `PreconditionError` prints the remediation command and exits `1` — **it must
   never fall back to a degraded run**.

> **This script must never import `FakeEmbeddingProvider`, generate random
> vectors, mock a provider, or hard-code a score.** Its entire purpose is to
> exercise the metric against genuine semantic embeddings. If a provider is
> unreachable, it must fail loudly.

### Step 7 — `tests/conftest.py` additions

Both fixtures are purely additive; do not modify `client`, `unauthenticated_client`,
`registered_accounts`, `teardown_driver`, `other_headers`, or `rag_world`.

```python
@pytest.fixture
def client_owner_id(client: TestClient) -> str:
    """The owner_id behind `client`'s bearer token, for resolving
    entity_id(owner_id, slug) in graph-recall assertions."""
    token = client.headers["Authorization"].removeprefix("Bearer ")
    return decode_access_token(token)["sub"]


@pytest.fixture
def starter_world(client: TestClient, client_owner_id: str) -> None:
    """This account's copy of the starter world, embedded with the fake embedder.

    `SEED_NEW_USER_WORLD` is off for the whole suite (top of this file), and
    there is no precomputed embedding file for `fake-embedding-v1`, so the
    world is seeded unembedded and then backfilled through the same recovery
    path scripts/backfill_embeddings.py uses.

    A short-lived async driver is opened and closed entirely inside one
    `asyncio.run`, so nothing crosses into the TestClient's event loop — the
    hazard `teardown_driver` documents is about *sharing* the app's driver,
    which this does not do. Teardown is already covered: `registered_accounts`
    deletes everything carrying this owner_id.
    """
```

*Implementation note:* if the `asyncio.run` approach turns out to conflict with
`TestClient`'s portal in practice, the fallback is to run the seed **before**
entering the `TestClient` context. Verify empirically at Step 9; do not
pre-emptively restructure.

### Step 8 — `tests/test_graph_recall.py` (offline)

See §10.1 and §10.3.

### Step 9 — `tests/test_graph_recall_pipeline.py` (integration, offline)

See §10.2. Run `uv run pytest -q` and confirm the whole suite is green and made
no network call.

### Step 10 — `backend/README.md`

Add `## Real Embedding Evaluation` after the "Graph RAG retrieval" settings
table. It must state, in this order:

1. The default suite (`uv run pytest -q`) is **offline and deterministic** — it
   uses `FakeEmbeddingProvider`, a SHA-256 stub with no semantics, and requires
   no embedding server, API key, network access, or downloaded model. It
   validates metric correctness, edge cases, dataset integrity, and structural
   pipeline behaviour.
2. The same metric can be evaluated against **real semantic embedding models**
   via `scripts/evaluate_graph_recall.py`, using the project's existing
   `EmbeddingProvider` abstraction (`ollama` locally, `google` in deployment).
3. Real-model evaluation is **deliberately separate from `pytest`** — it needs a
   local model or credentials, network access, and provider availability, and its
   results vary by model. It is a benchmark output, not a deterministic assertion.
4. The exact reproduction sequence: `uv sync` → `docker compose up -d neo4j` →
   `ollama pull nomic-embed-text-v2-moe` → configure `.env` → register an account
   (or `uv run python scripts/seed_world.py <email>`) → ensure embeddings are
   current (`precompute_starter_world_embeddings.py`, `backfill_embeddings.py`) →
   run the evaluation.
5. The command and a **clearly labelled illustrative** output sample.
6. A short "why the split" note: deterministic correctness testing and real-world
   semantic evaluation answer different questions and must not be conflated.

Do not include real credentials or `.env` contents.

---

## 9. Algorithm

### 9.1 Reference graph construction — offline, no database

```
ALL_SLUGS      ← slugs of LOCATIONS ∪ FACTIONS ∪ EVENTS ∪ CHARACTERS      (27)
LABEL_BY_SLUG  ← slug → "Location" | "Faction" | "Event" | "Character"
SEED_EDGES     ← {(c, "LOCATED_IN",      l) for (c,l)   in LOCATED_IN}
               ∪ {(c, "MEMBER_OF",       f) for (c,f)   in MEMBER_OF}
               ∪ {(c, "PARTICIPATED_IN", e) for (c,e)   in PARTICIPATED_IN}
               ∪ {(a, "KNOWS",           b) for (a,b,_) in KNOWS}          (69)

for q in EVAL_QUERIES:                                    # validate_dataset()
    assert q.reference_nodes  non-empty, unique, ⊆ ALL_SLUGS
    assert q.anchors                      ⊆ ALL_SLUGS
    assert q.reference_edges     unique,  ⊆ SEED_EDGES    # direction-sensitive
```

### 9.2 Retrieved graph extraction and normalization

```
slug_by_id ← { entity_id(owner_id, s) : s  for s in ALL_SLUGS }     # uuid5, exact

result ← RetrievalService.retrieve(RetrieveRequest(question, top_k, depth))

Ĝ ← { slug_by_id[e.id] for e in result.entities      if e.id in slug_by_id }
Ŝ ← { slug_by_id[e.id] for e in result.seeds         if e.id in slug_by_id }
Ê ← { (slug_by_id[r.source], r.rel_type, slug_by_id[r.target])
      for r in result.relationships
      if r.source in slug_by_id and r.target in slug_by_id }
```

Normalization is exactly this id→slug lookup. No casing, trimming, alias
expansion, or fuzzy matching — both sides are UUIDs (§5.3). Unknown ids drop out
silently, which is correct: they are outside the reference universe. `sentiment`
is discarded when forming `Ê` (§5.4). Sets make duplicates idempotent.

### 9.3 Per-query scoring

```
score_query(q, result, slug_by_id, max_context_entities):
    R ← set(q.reference_nodes);   E ← set(q.reference_edges)
    Ĝ, Ŝ, Ê ← extract(result, slug_by_id)

    node_recall ←  |R ∩ Ĝ| / |R|                       # |R| ≥ 1, validated
    seed_recall ←  |R ∩ Ŝ| / |R|
    edge_recall ←  |E ∩ Ê| / |E|   if E else None      # None, not 0.0 and not 1.0

    return QueryRecall(
        missing_nodes  = sorted(R − Ĝ),
        missing_edges  = sorted(E − Ê),
        anchors_hit    = set(q.anchors) ⊆ Ŝ,
        entity_cap_reached = len(result.entities) ≥ max_context_entities,
        retrieved_entity_count = len(result.entities),
        retrieved_relationship_count = len(result.relationships),
        context_chars = result.char_count,
        …)
```

### 9.4 Aggregation

```
aggregate(rows, config):
    node_macro ← mean(r.node_recall for r in rows)                      # PRIMARY
    node_micro ← Σ r.matched_node_count / Σ r.reference_node_count

    scored     ← [r for r in rows if r.edge_recall is not None]
    edge_macro ← mean(r.edge_recall for r in scored)  if scored else None
    edge_micro ← Σ matched_edge / Σ reference_edge over scored  if scored else None

    seed_macro ← mean(r.seed_recall for r in rows)
    expansion_gain ← node_macro − seed_macro                            # ≥ 0

    per_label  ← for L in (Character, Location, Faction, Event):
                     pooled matched / pooled total over reference nodes with
                     LABEL_BY_SLUG[slug] == L        (omit labels with total 0)

    anchor_hit_rate ← mean(r.anchors_hit for r in rows with q.anchors non-empty)
    cost            ← means of entity/relationship/char counts;
                      count of rows with entity_cap_reached
```

`expansion_gain ≥ 0` holds structurally: `_order_candidates` places seeds first
and `_serialize` truncates from the tail, so every seed that fits is in
`entities`, i.e. `Ŝ ⊆ Ĝ`. **A negative expansion gain is a bug in the metric or a
regression in `_order_candidates` — assert on it in the unit tests.**

### 9.5 Full run

```
run_graph_recall(session, owner_id, embedder, top_k, depth, max_entities):
    validate_dataset()

    counts ← WorldRepository(session).counts(owner_id)
    if any label count == 0:        raise PreconditionError("empty world …")
    if counts ≠ starter-world:      warn (do not raise)

    stale ← EmbeddingRepository(session, owner_id).find_stale(embedder.model_name)
    if stale:                       raise PreconditionError(
                                        f"{len(stale)} entities are unembedded or "
                                        f"embedded under a different model than "
                                        f"{embedder.model_name!r}; run "
                                        f"precompute_starter_world_embeddings.py "
                                        f"then backfill_embeddings.py <email>")

    service    ← RetrievalService(EmbeddingRepository(session, owner_id),
                                  GraphRepository(session, owner_id), embedder,
                                  seed_top_k=top_k, expand_depth=depth,
                                  max_context_entities=max_entities)
    slug_by_id ← slug_index(owner_id)

    rows ← []
    t0   ← perf_counter()
    for q in EVAL_QUERIES:                                # sequential; one session
        rows.append(score_query(q,
                    await service.retrieve(RetrieveRequest(q.question, top_k, depth)),
                    slug_by_id, max_context_entities=max_entities))
    return aggregate(rows, RunConfig(…, duration_seconds=perf_counter() - t0))
```

---

## 10. Example Calculations

All figures below are derived from the real starter world and the real
`_serialize` implementation.

### 10.0 Worked examples

**Perfect recall — q03 "Who signed the Verge Compact?", seed on `the-verge-compact`, depth 1**

```
R = {the-verge-compact, roderic-kell, elin-vast, mira-solenne, ondine-marsh, ivo-marrow}   |R| = 6
E = 5 × (character, PARTICIPATED_IN, the-verge-compact)                                    |E| = 5
scope(depth 1) = all 6;  induced edges = 16 (16 lines, 1961 chars — under the 4000 budget)

node_recall = 6/6 = 1.000      edge_recall = 5/5 = 1.000      seed_recall = 1/6 = 0.167
expansion contribution for this query = 1.000 − 0.167 = 0.833
```

**Partial recall / missing node and missing relationship — q07 "Which factions were involved in the Salt Riots?", seed on `the-salt-riots`, depth 1**

```
R = {the-salt-riots, ondine-marsh, elin-vast, osric-dane, corin-ashe, salt-guild, tidebinders}  |R| = 7
E = 4 × PARTICIPATED_IN + 3 × MEMBER_OF                                                          |E| = 7
scope(depth 1) = {the-salt-riots, ondine-marsh, elin-vast, osric-dane, corin-ashe}   → 5 nodes
induced edges  = 4 PARTICIPATED_IN + 4 KNOWS = 8   (1094 chars — nothing truncated)

node_recall   = 5/7 = 0.714
edge_recall   = 4/7 = 0.571
missing_nodes = [salt-guild, tidebinders]                       ← factions are 2 hops away
missing_edges = [(corin-ashe, MEMBER_OF, tidebinders),
                 (elin-vast,  MEMBER_OF, salt-guild),
                 (osric-dane, MEMBER_OF, salt-guild)]
```

**Same query at depth 2** — scope grows to 16 nodes, all 7 reference nodes present:

```
node_recall = 7/7 = 1.000       ← +0.286 purely from expansion depth
edge_recall = NOT DETERMINISTIC ← 48 induced edges, only ~30 survive the 4000-char
                                   budget, in Cypher's collect(DISTINCT r) order (§13.2)
```

This one query is the whole argument for the metric: depth 2 buys node recall and
may *cost* edge recall, and nothing in the repo could previously say so.

**Empty retrieved graph** — an account with no embedded entities, or a provider
returning nothing:

```
Ĝ = ∅, Ê = ∅
node_recall = 0/7 = 0.000        edge_recall = 0/7 = 0.000        seed_recall = 0.000
missing_nodes = all 7            missing_edges = all 7
```

In practice the runner raises `PreconditionError` before scoring, so this shape
appears only in unit tests.

**Empty reference edge set — q06 "What is Coldharrow?"**

```
R = {coldharrow}   |R| = 1
E = ∅              |E| = 0

node_recall = 1/1 = 1.000
edge_recall = None                    ← not 0.0 (deflates), not 1.0 (inflates)
q06 is excluded from edge_recall_macro and edge_recall_micro;
edge_scored_query_count reports 10, not 12 (q06 and q11 are the two exclusions)
```

**Empty reference node set** — rejected by `validate_dataset()`; recall over
`|R| = 0` is undefined and no such query may enter the dataset (§4.5).

**Duplicate elements**

```
result.entities = [coldharrow_id, coldharrow_id, greyfen_id]
Ĝ = {coldharrow, greyfen}             ← set construction makes this identical to
                                        the de-duplicated input
node_recall unchanged.  retrieved_entity_count still reports 3 (the cost axis
counts what was actually serialized, the metric counts distinct identities).
```

**Multi-hop — q10 "Who is passing information to the Quiet Hand?", seed on `quiet-hand`**

```
R = {quiet-hand, ivo-marrow, corin-ashe, tidebinders}                       |R| = 4
chain: quiet-hand ← ivo-marrow ↔ corin-ashe → tidebinders                   (3 hops)

depth 1: scope = {quiet-hand, ivo-marrow}         node 2/4 = 0.500   edge 1/4 = 0.250
depth 2: scope adds corin-ashe                    node 3/4 = 0.750   edge 3/4 = 0.750
                                                  tidebinders is 3 hops — unreachable
```

The residual 0.250 is *not* a defect: it is what the metric is for. With a real
embedder, `corin-ashe`'s description ("passing lock schedules to the Quiet Hand")
should seed it directly, putting `tidebinders` one hop away and pushing recall to
1.000. The gap between the oracle-anchor table and the real run is exactly this
effect, made visible.

### 10.1 Unit tests — `tests/test_graph_recall.py`

Pure functions over hand-built objects. No DB, no embedder, no event loop —
standalone like `tests/test_pydantic_models.py`.

| Test | Asserts |
|---|---|
| `test_perfect_recall_scores_one` | All reference nodes and edges present ⇒ `1.0` / `1.0` |
| `test_partial_node_recall` | 3 of 4 reference nodes ⇒ `0.75`; `missing_nodes` names the fourth |
| `test_missing_relationship_lowers_edge_recall_only` | All nodes present, one edge absent ⇒ node `1.0`, edge `< 1.0` |
| `test_edge_direction_is_significant` | Retrieved `(b, KNOWS, a)` does **not** match reference `(a, KNOWS, b)` ⇒ edge recall `0.0` |
| `test_sentiment_is_not_part_of_edge_identity` | Edges match regardless of `sentiment` |
| `test_empty_reference_edges_yields_none_not_zero` | `edge_recall is None`; excluded from aggregates |
| `test_empty_retrieved_graph_scores_zero` | `entities=[]`, `relationships=[]` ⇒ node `0.0`, edge `0.0` |
| `test_duplicate_retrieved_entities_are_idempotent` | Same entity twice ⇒ identical score to once |
| `test_unknown_ids_are_ignored` | An id absent from `slug_by_id` changes no recall value |
| `test_macro_and_micro_differ_on_uneven_reference_sizes` | Two rows, sizes 1 and 7 ⇒ macro ≠ micro, both correct by hand |
| `test_edge_aggregate_excludes_unscored_queries` | `edge_scored_query_count` and the mean use only `|E_q| > 0` rows |
| `test_edge_aggregate_is_none_when_no_query_has_edges` | `edge_recall_macro is None` |
| `test_expansion_gain_is_non_negative` | Seeds ⊆ entities ⇒ gain ≥ 0 |
| `test_seed_recall_uses_seeds_not_entities` | An entity present only via expansion raises node recall, not seed recall |
| `test_entity_cap_reached_flag` | `len(entities) == max_context_entities` ⇒ `True` |

### 10.2 Integration tests — `tests/test_graph_recall_pipeline.py`

Real Neo4j, real `RetrievalService`, real `GraphRepository.expand`,
`FakeEmbeddingProvider`, **no network**.

**The determinism technique** (from `tests/test_retrieval.py:25`): querying with
an entity's exact `canonical_text` reproduces its stored vector under the fake
embedder, giving cosine `1.0`. With `top_k=1` that entity is the *only* seed —
which is exactly the "oracle anchor" of §4.4. All 27 starter texts are distinct,
so no tie is possible. Build the text from `starter_world` literals, never by
retyping it, so it cannot drift:

```python
canonical_text("Event", {"name": "The Salt Riots", "summary": <EVENTS literal>})
# 'The Salt Riots. Greyfen rose against Salt Guild pricing after a third
#  consecutive raise. Four days of burning on the Saltmarch causeway, ended by
#  exhaustion rather than by any settlement.'   (187 chars)
```

| Test | Setup | Asserts |
|---|---|---|
| `test_salt_riots_depth_1_structural_recall` | q07, seed forced to `the-salt-riots`, `top_k=1`, `depth=1` | `node_recall == 5/7`, `edge_recall == 4/7` — **exact**. Verified deterministic: 5 nodes, 8 induced edges, ~1094 context chars, nothing truncated |
| `test_salt_riots_depth_2_recovers_the_factions` | same, `depth=2` | `node_recall == 1.0`, and `missing_nodes == []`. **Edge recall is not asserted** — at depth 2 the 4000-char budget truncates edges in nondeterministic Cypher order (§13.2) |
| `test_verge_compact_depth_1_is_perfect` | q03, seed forced to `the-verge-compact`, `top_k=1`, `depth=1` | `node_recall == 1.0` and `edge_recall == 1.0` — 6 nodes, 16 edges, ~1961 chars, no truncation |
| `test_runner_produces_a_report_over_the_whole_dataset` | `run_graph_recall` with the fake embedder | 12 rows; every field populated; `0.0 ≤ node_recall_macro ≤ 1.0`; **no assertion on the value** — the fake embedder has no semantics |
| `test_runner_refuses_an_empty_world` | account without `starter_world` | `PreconditionError` |
| `test_runner_refuses_stale_embeddings` | seed the world, skip the backfill | `PreconditionError` naming the remediation |
| `test_slug_index_resolves_to_real_nodes` | seeded world | Every id in `slug_index(owner_id)` matches a node with that `owner_id` (read via `teardown_driver`) |

> The fourth test is the boundary the whole design turns on: it proves the
> **wiring** works. It says nothing about retrieval quality, and its docstring
> must say so.

### 10.3 Dataset tests — in `tests/test_graph_recall.py`, offline

The regression guard against dataset rot. If someone edits `starter_world.py`,
these fail loudly rather than silently measuring against a stale reference.

| Test | Asserts |
|---|---|
| `test_dataset_validates` | `validate_dataset()` raises nothing |
| `test_every_reference_node_exists_in_the_starter_world` | Every slug ∈ `ALL_SLUGS` (51 across 12 queries) |
| `test_every_reference_edge_exists_in_the_starter_world` | Every triple ∈ `SEED_EDGES`, **in the annotated direction** (43 edges) |
| `test_no_query_has_an_empty_reference_node_set` | `\|R_q\| ≥ 1` for all q |
| `test_query_ids_are_unique` | 12 distinct ids |
| `test_validator_rejects_an_unknown_slug` | Hand-built bad query ⇒ `ValueError` |
| `test_validator_rejects_a_reversed_edge` | `("kestrel-order","MEMBER_OF","roderic-kell")` ⇒ `ValueError` |
| `test_validator_rejects_an_empty_reference_node_set` | ⇒ `ValueError` |
| `test_slug_index_is_stable_across_calls` | Same `owner_id` ⇒ identical mapping (uuid5 determinism) |
| `test_starter_world_shape_is_unchanged` | 27 nodes / 69 edges, per-label counts — catches a seed edit that silently invalidates §4.4 |

### 10.4 Regression tests

No new regression tests are written; the guarantee is **structural**:

- No production module is modified, so every existing test exercises unchanged code.
- `conftest.py` changes are strictly additive; no existing fixture is touched.
- `uv run pytest -q` must remain green, offline, and no slower than before except
  for the new tests themselves.
- The `starter_world` fixture is opt-in — tests that do not request it still see
  an empty account, preserving the `SEED_NEW_USER_WORLD=false` contract.

**Explicit check during implementation:** run `uv run pytest -q` before and after
and confirm the pre-existing test count and outcomes are identical.

### 10.5 Edge cases (covered above; collected for review)

| Case | Behaviour | Where tested |
|---|---|---|
| Empty reference node set | Dataset validation error | 10.3 |
| Empty reference edge set | `edge_recall = None`, excluded from aggregates | 10.1, 10.3 |
| Empty retrieved graph | recall `0.0` | 10.1 |
| No query in the dataset has edges | `edge_recall_macro = None` | 10.1 |
| Reversed edge | No match; validator rejects it in the dataset | 10.1, 10.3 |
| Duplicate retrieved entity / edge | Idempotent (sets) | 10.1 |
| Retrieved id outside the reference universe | Ignored for recall, counted in cost | 10.1 |
| Entity cap binds | `entity_cap_reached = True`, reported | 10.1 |
| Char budget truncates edges | **Not deterministic at depth 2** — no exact assertion | 10.2, §13.2 |
| Unembedded / stale-model entities | `PreconditionError` before any scoring | 10.2 |
| Empty or wrong-account world | `PreconditionError` | 10.2 |
| Provider unreachable | Script fails loudly; never a degraded or faked run | §8 Step 6 |

---

## 11. Compatibility and API Impact

**Zero production impact. The feature is purely additive.**

| Surface | Impact |
|---|---|
| HTTP API (`/ai/retrieve`, `/ai/ask`, all CRUD) | **None.** No route added, changed, or removed. |
| `RetrievalResult` / `RetrieveRequest` / `AskResponse` schemas | **None.** The metric consumes them read-only; every field it needs already exists. |
| Retrieval behaviour | **None.** `RetrievalService`, `EmbeddingRepository`, `GraphRepository` are untouched. Running the benchmark changes no stored data — it only reads and embeds queries. |
| `Settings` / env vars | **None.** No field added; the CLI overrides the three existing RAG settings per run. |
| CLI surface | One new script, following the existing `scripts/` convention. No existing script changes. |
| Serialization | New `GraphRecallReport` JSON, produced only by the new script. Not part of any API contract; free to evolve. |
| Reporting | New stdout format from a new script. Nothing else prints. |
| Dependencies | **None added.** `argparse`, `json`, `time`, `datetime` are stdlib. |
| Backward compatibility | Total. Deleting `evaluation/`, `scripts/evaluate_graph_recall.py`, the two test files, and the two conftest fixtures returns the repo to its current state exactly. |
| Test suite | Stays fully offline and deterministic. No live provider, no API key, no network. |

**One behavioural note that is *observed*, not introduced:** at `depth=2` on the
starter world, `_MAX_CONTEXT_CHARS = 4000` truncates roughly half the induced
edge set (measured: 48→30, 62→26, 61→26 edges for seeds on `the-salt-riots`,
`the-verge-compact`, `the-reckoning`), and which edges survive depends on
Cypher's `collect(DISTINCT r)` ordering, which is not guaranteed stable. The
metric will make this visible for the first time. **The implementation agent must
not change `_serialize`, `_MAX_CONTEXT_CHARS`, or the ordering to address it** —
see §14.

---

## 12. Alternatives Considered

| Alternative | Rejected because |
|---|---|
| **Node-only recall** | Scores a retrieval that returns every right entity and no relationships as perfect — while the context block it produced cannot answer the relational questions the graph exists for. Node recall is kept as the *headline*, not as the whole metric. |
| **Edge-only recall** | Undefined for lookup queries with no required edge (q06, q11), so the headline would float over a shifting subset of the dataset. Kept as a co-primary instead. |
| **Blended node+edge score** (harmonic/weighted mean) | Collapses two failure modes with *different remedies* — a node miss says raise `top_k` or `depth`; an edge miss says raise `depth` or the char budget — into a number no one can act on without decomposing it again. |
| **Path recall** (are the reference paths present?) | Adds nothing here. `expand` returns an **induced** subgraph, so if every node and edge of a reference path is present, the path is present by construction. Path recall is therefore a function of node ∧ edge recall over the path's elements, bought at the cost of an annotation format nobody wants to maintain. |
| **Subgraph isomorphism / exact graph matching** | The reference is a *specific* labelled subgraph of a known world with canonical ids, so matching is set intersection. Isomorphism solves a problem this schema does not have, at exponential cost. |
| **Approximate / embedding-based graph matching** | Would introduce a second embedding model into the *measurement* of the first — circular, and it discards the exact identity `entity_id` already gives for free. |
| **Community recall** | **There are no communities.** No clustering or community summarization exists anywhere in this repo. Adding a clusterer to measure it would mean evaluating something the system does not do. |
| **Precision / F1** | Requires labelling every non-reference retrieved entity as irrelevant, which is false here — expansion context is legitimately useful without being the minimal answer. Replaced with an explicit cost axis (§5.7). |
| **Generating ground truth with an LLM** | Makes the reference a second model's opinion, so a shared blind spot between generator and retriever is invisible. Hand annotation over 12 queries is cheap and auditable, and the structural-rule column keeps it honest. |
| **Evaluating over HTTP against `/ai/retrieve`** | Needs a running server, a login, and token handling for no gain: the runner builds the *same* `RetrievalService` object `api/deps.py:278` builds. Every existing script in `scripts/` uses the in-process path. |
| **A networked pytest test with a recall floor** | Would make `pytest` depend on Ollama/Google, introduce the suite's first nondeterministic test, and require retuning the threshold on every model change. Explicitly out of scope. |
| **A committed JSON baseline diffed by a test** | Still needs a live embedder to produce the fresh run, and the baseline must be regenerated on every model or dataset change. Explicitly out of scope. |
| **Splitting the code across `domain/` + `services/`** | Considered (there is precedent — `domain/starter_world.py` is non-DTO data in `domain/`). Rejected: the feature is not request-path business logic, nothing in `api/` reaches it, and scattering one leaf feature across three layers makes it harder to see and harder to delete. |
| **Everything in `scripts/` only** | `scripts/` is not an importable package, so the metric would be untestable by `pytest` — which contradicts the whole point of keeping correctness offline. |
| **Adding `Settings` fields for evaluation** | A parameter sweep needs per-run values, not env vars, and the three RAG settings already exist as the defaults to override. |

---

## 13. Risks and Open Questions

### 13.1 Assumptions being made explicit

1. **The annotated reference sets are the right relevance judgments.** They are
   one competent reading, not ground truth handed down. Mitigated by the
   `rule` field on every query making the judgment auditable and revisable, and
   by validation against the seed structure. Anyone may disagree with a specific
   set; the format makes disagreement cheap to resolve.
2. **`RetrievalResult.entities` faithfully represents the context block.**
   Guaranteed today by `_serialize`'s contract (`retrieval_service.py:97-133`)
   and stated in its docstring. If that contract ever breaks, the metric measures
   the wrong thing. Worth a comment in `graph_recall.py` pointing at it.
3. **The evaluation account holds an unmodified starter world.** Guarded by the
   `WorldRepository.counts` precondition, which warns on divergence.
4. **`entity_id` remains the id derivation.** If `NAMESPACE` or the
   `f"{owner_id}:{slug}"` format changes, `slug_index` breaks — loudly (recall
   collapses to 0), not silently. `test_slug_index_resolves_to_real_nodes` catches it.

### 13.2 Repository limitations

1. **The char budget silently truncates edges at depth 2** (measured: ~half).
   Truncation order follows Cypher's `collect(DISTINCT r)`, which has no stability
   guarantee. Consequence: **exact edge-recall assertions are only sound at
   depth 1**, and depth-2 edge recall in the benchmark is a *noisy* number that
   may vary between runs on identical data. This is arguably a production defect —
   an unbounded, order-dependent drop of relational context — but **fixing it is
   out of scope** (§14). Recommend filing it separately once the metric has
   quantified it.
2. **`rag_max_context_entities = 30` never binds on a 27-entity world.** The
   entity cap is therefore untested by the default benchmark. `--max-entities`
   exists so it can be induced deliberately; do not conclude "the cap is fine"
   from a default run.
3. **`FakeEmbeddingProvider` cannot validate semantics.** Nothing in `pytest` will
   ever tell you retrieval is *good*. This is a deliberate trade, and the README
   must say so plainly.
4. **`rag_expand_depth` is clamped to `[1, 2]`** in both `expand` (`graph_repo.py:98`)
   and `RetrieveRequest`. Depth 0 and depth 3+ cannot be benchmarked. Depth 0 is
   covered for free by `seed_recall`; depth 3+ would need a production change and
   is out of scope.

### 13.3 Dataset limitations

1. **12 queries is small.** Enough to be hand-verified and to discriminate depth
   (§4.4 shows a 0.875 → 0.977 spread), not enough for a tight confidence
   interval. A single query's failure moves macro recall by 0.083. Treat
   differences below ~0.08 as noise.
2. **Character-heavy.** 32 of 51 reference nodes are Characters; Location (6),
   Faction (6), and Event (7) have small denominators, so per-label recall for
   those is coarse. Do not over-read a single label's number.
3. **One world.** Every query is over the Verge worldset. Results do not
   generalize to a user's own hand-built world with different density or text style.
4. **Anchors encode an assumption** — that a question naming an entity *should*
   seed it. True for these 12; a paraphrase-heavy question set would need the
   anchor field reconsidered.

### 13.4 Implementation risks

1. **`asyncio.run` inside a `TestClient` test** (the `starter_world` fixture). The
   driver is created and closed entirely inside one `asyncio.run`, so nothing
   crosses loops — but `conftest.py:25`'s docstring warns about loop-bound
   drivers, so **verify empirically at Step 9**. Fallback in §8 Step 7.
2. **Seeding + backfilling 27 entities per test** adds real time to any test using
   `starter_world`. Keep the number of such tests small (the seven in §10.2).
3. **A `--model` override with stale stored vectors** would produce silent
   nonsense. The `find_stale` precondition is what prevents it and is not optional.

### 13.5 Open questions — do not silently invent answers

| Question | Status |
|---|---|
| Should `q09`'s reference include `mira-solenne` (in Greyfen, but not a Long Winter participant)? | **Decided: no** — the stated rule requires both. Flagged because it is the most debatable annotation in the set. |
| Should `q07` include `ondine-marsh`, who participated but has no faction? | **Decided: yes** as a reference *node* (she is part of the evidence), contributing no reference edge. |
| Is macro over 12 queries a stable enough headline for tracking over time? | **Open.** Revisit if the dataset grows past ~30 queries; consider reporting a bootstrap interval then. |
| Should the benchmark support multiple worlds / accounts in one run? | **Open, deferred.** One account, one world for V1. |
| Should depth-2 edge truncation be fixed (e.g. budget edges before entities, or sort edges deterministically)? | **Open, out of scope here.** Quantify first with this metric, then decide separately. |

---

## 14. Do Not Implement / Out of Scope

The implementation agent **must not**:

1. **Change retrieval behaviour in any way.** `services/retrieval_service.py`,
   `repositories/embedding_repo.py`, `repositories/graph_repo.py`,
   `services/rag_service.py`, `services/embedding_service.py`, and
   `providers/embeddings.py` are **read-only** for this task.
2. **Fix the depth-2 edge truncation** (§13.2). Do not change
   `_MAX_CONTEXT_CHARS`, do not reorder or budget edges differently, do not add
   an `ORDER BY` to `_expand_tx`. Measure it; report it; leave it.
3. **Add answer-quality metrics** — no faithfulness, groundedness, answer
   correctness, or citation-completeness scoring. No LLM is invoked anywhere in
   this feature.
4. **Add LLM-as-a-judge evaluation**, or use an LLM to generate queries or
   reference sets.
5. **Add a networked pytest test.** `tests/test_graph_recall_online.py` or any
   equivalent is explicitly forbidden. `uv run pytest -q` must require no
   embedding server, API key, network access, or downloaded model.
6. **Introduce a committed JSON baseline** compared by a test.
7. **Fake semantic evaluation.** `scripts/evaluate_graph_recall.py` must never
   import `FakeEmbeddingProvider`, use random vectors, mock a provider, or
   hard-code a score. If a provider is unreachable, fail loudly.
8. **Remove or weaken the deterministic fake embedder or any existing test.**
   `FakeEmbeddingProvider` stays exactly where it is, as a testing utility.
9. **Build a parallel embedding path.** Reuse `providers.deps.get_embedder` and
   the existing `EmbeddingProvider` Protocol; do not instantiate provider classes
   directly and do not add a provider.
10. **Add new retrieval algorithms** — no re-ranking, no query rewriting, no HyDE,
    no vector index (see `GRAPH_RAG_PLAN.md` §2.3), no alternate expansion strategy.
11. **Add unrelated graph metrics** — no centrality, no clustering coefficient, no
    community detection, no graph-edit distance.
12. **Refactor the evaluation architecture into a general framework** — no plugin
    registry, no metric base class, no abstract `Metric` interface. There is one
    metric. Build one metric.
13. **Add any dependency.** No `networkx`, `numpy`, `pandas`, `scikit-learn`,
    `ragas`, `deepeval`, `rich`, `typer`, `click`, `pytest-asyncio`. Stdlib and
    what is already installed only.
14. **Add `Settings` fields, env vars, or `.env.example` entries.**
15. **Add HTTP routes.** No `/eval/*`, no `/metrics`. The metric is a developer
    tool, not an API surface.
16. **Optimize anything unrelated** — no query tuning, no projection changes, no
    index additions.
17. **Modify `docs/backend/GRAPH_RAG_PLAN.md` or `GRAPH_RAG_HANDOFF.md`.**
18. **Touch `frontend/`.** This is backend-only.
19. **Read or commit `backend/.env`.**

---

## 15. Definition of Done

**Metric implementation**
- [ ] `evaluation/graph_recall.py` implements node recall, edge recall, seed
      recall, and aggregation as pure functions with no I/O.
- [ ] Node identity resolves via `entity_id(owner_id, slug)`; no name, alias, or
      fuzzy matching anywhere.
- [ ] Edge identity is the ordered `(source_slug, rel_type, target_slug)` triple;
      `sentiment` excluded; direction significant.
- [ ] `edge_recall` is `None` — never `0.0` or `1.0` — when `|E_q| = 0`, and such
      queries are excluded from both edge aggregates.
- [ ] Macro node recall is the designated primary; edge recall is co-reported and
      never blended into it.

**Integration**
- [ ] `evaluation/runner.py` drives the same `RetrievalService` that
      `api/deps.py:278` builds, with `EmbeddingRepository` and `GraphRepository`
      constructed owner-scoped.
- [ ] World precondition via `WorldRepository.counts`; embedding precondition via
      `EmbeddingRepository.find_stale`, with a remediation message.
- [ ] **No production module modified.** `git diff --stat` shows changes only in
      `tests/conftest.py`, `README.md`, and new files.

**Seed-data-based evaluation dataset**
- [ ] `evaluation/dataset.py` holds all 12 queries with reference nodes, reference
      edges, anchors, and the structural rule, using only real slugs from
      `domain/starter_world.py`.
- [ ] `validate_dataset()` rejects unknown slugs, reversed edges, empty reference
      node sets, duplicates, and duplicate query ids.

**Tests**
- [ ] `tests/test_graph_recall.py` — all unit tests of §10.1 and all dataset tests
      of §10.3, passing with **no database and no network**.
- [ ] `tests/test_graph_recall_pipeline.py` — all integration tests of §10.2.
- [ ] `test_salt_riots_depth_1_structural_recall` asserts exactly `5/7` node and
      `4/7` edge.
- [ ] `test_verge_compact_depth_1_is_perfect` asserts exactly `1.0` / `1.0`.
- [ ] No test asserts an exact **edge** recall at depth 2.
- [ ] Every edge case in §10.5 is covered.

**Reporting**
- [ ] `render_text` prints provider, model, dimensions, account, world counts,
      dataset name, query count, top-k, depth, max-context, start timestamp, and
      duration.
- [ ] Primary metric visually marked; `---` (never `0.000`) for undefined edge
      recall; cost axis printed beside recall; `missing_nodes` / `missing_edges`
      listed per failing query.
- [ ] `--json PATH` writes `GraphRecallReport.model_dump_json(indent=2)`.

**Configuration / CLI**
- [ ] `uv run python scripts/evaluate_graph_recall.py <email>` runs against the
      `.env` provider.
- [ ] `--provider`, `--model`, `--dimensions`, `--top-k`, `--depth`,
      `--max-entities`, `--json` all work, routed through the existing
      `providers.deps.get_embedder`.
- [ ] Exit codes: `0` / `1` (account or precondition) / `2` (arguments).
- [ ] No new `Settings` field, env var, or dependency.

**Documentation**
- [ ] `backend/README.md` has a `## Real Embedding Evaluation` section covering
      all six points of §8 Step 10, with the exact command, a clearly-labelled
      illustrative output sample, and the reproduction sequence.
- [ ] The README states plainly that `pytest` is offline and deterministic, that
      real evaluation is a separate explicit action, and why the split exists.
- [ ] No secrets or `.env` contents anywhere.

**Backward compatibility**
- [ ] `uv run pytest -q` is green, and the pre-existing tests' count and outcomes
      are identical to before the change.
- [ ] `uv run pytest -q` makes **no network call** and needs no embedding server,
      API key, or downloaded model.
- [ ] `uv run ruff check .` and `uv run ruff format --check .` pass.

**Real-model verification and reporting**
- [ ] `uv run pytest -q` was actually run; its result is reported.
- [ ] A real-model evaluation was **attempted** against the configured provider.
      If it ran, report provider, model, dataset, query count, top-k, depth, and
      the metric values. If the provider was unavailable, say so explicitly and
      report the CLI/configuration verification instead.
- [ ] **A fake-embedding test result is never presented as semantic evidence.**
      The two are reported under separate headings.

---

## 16. Recommended Implementation Order

Each step leaves the repository working and independently verifiable. Do not
start a step before its predecessor is verified.

1. **`evaluation/__init__.py` + `evaluation/models.py`** — the shapes first, so
   everything downstream types against them.
   *Verify:* `uv run python -c "import narrative_mind.evaluation.models"`.

2. **`evaluation/dataset.py`** — `ALL_SLUGS`, `LABEL_BY_SLUG`, `SEED_EDGES`, the
   12 `EVAL_QUERIES`, `validate_dataset()`, `slug_index()`.
   *Verify:* `uv run python -c "from narrative_mind.evaluation.dataset import validate_dataset; validate_dataset(); print('ok')"`.

3. **`tests/test_graph_recall.py` — dataset half only** (§10.3). Write it now,
   before the metric, so a bad annotation is caught before anything consumes it.
   *Verify:* `uv run pytest src/narrative_mind/tests/test_graph_recall.py -q` — green, no DB.

4. **`evaluation/graph_recall.py`** — the pure metric and aggregation.
   *Verify:* imports cleanly; nothing else yet.

5. **`tests/test_graph_recall.py` — unit half** (§10.1). All 15 tests.
   *Verify:* green, standalone, no DB, no network. **This is the correctness gate;
   do not proceed while it is red.**

6. **`tests/conftest.py`** — add `client_owner_id` and `starter_world`.
   *Verify:* `uv run pytest -q` still green and unchanged in count — confirms the
   additions broke nothing, before anything depends on them. Resolve the
   `asyncio.run` question here (§13.4.1).

7. **`evaluation/runner.py`** — preconditions, pipeline construction, the loop.
   *Verify:* nothing yet; the next step tests it.

8. **`tests/test_graph_recall_pipeline.py`** (§10.2). Needs Neo4j running.
   *Verify:* green. The exact `5/7` and `4/7` assertions passing is the strongest
   evidence the metric agrees with the real pipeline.

9. **`evaluation/report.py`** — `render_text`.
   *Verify:* render a report built by the integration test; eyeball the layout.

10. **`scripts/evaluate_graph_recall.py`** — the CLI.
    *Verify:* `--help`; then a bad email (exit 1); then a stale-embedding account
    (`PreconditionError` with remediation).

11. **Real-model run.** Ensure Ollama is up and the model pulled, embeddings are
    current for that model, then run the benchmark for real at `--depth 1` and
    `--depth 2` and compare.
    *Verify:* a real report with real numbers. **If the provider is unavailable,
    do not fake it** — verify CLI/configuration behaviour and say plainly that a
    live model was unavailable.

12. **`backend/README.md`** — the `## Real Embedding Evaluation` section, written
    against what step 11 actually produced.

13. **Final gate.** `uv run pytest -q` (green, offline, unchanged pre-existing
    results) · `uv run ruff check .` · `uv run ruff format --check .` ·
    `git status` shows only the intended files.

14. **Report the two tiers separately** — `pytest` results under one heading, the
    real semantic evaluation (provider, model, dataset, metric, result, or an
    explicit "provider unavailable") under another. Never conflate them.
