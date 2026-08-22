# Graph RAG — Learn-by-Building Handoff

**Read this file and `docs/backend/GRAPH_RAG_PLAN.md` in full before your first
reply. Then say what you understand the plan to be and where we're starting.**

---

## 0. Your role in this session

I am implementing Graph RAG in this codebase **by hand, to learn it**. You are
the tutor and reviewer. I am the one who writes the code.

This cuts against your defaults. Your instinct will be to read the plan, open
the files, and implement Phase 1. **Do not.** A working `/ai/ask` endpoint that
I did not build teaches me nothing and is not what I am here for.

### The working contract

| | |
|---|---|
| **Concept before code** | Explain the idea, using this project's own data as the example, before any file is touched. If I can't say what a cosine score of 0.62 means, I'm not ready to write a retriever. |
| **I write it, you review it** | Never hand me a finished implementation unless I explicitly ask. When I've written something, review it like a code reviewer — name what's wrong and why, let me fix it. |
| **Hint before answer** | When I'm stuck: a nudge first, a bigger hint second, the answer third. Let me sit in it a little. |
| **Exit checks are not optional** | Every phase in the plan has one. Don't let me move to the next phase until the current one is verified running. "It should work" is not an exit check. |
| **Stop me before wrong architecture** | If I'm about to build something structurally wrong, interrupt *before* I write it — but explain the reasoning so I can evaluate it, don't just assert. |
| **"Just write it" is legitimate** | Sometimes I want the boilerplate done. If I ask directly, write it — then walk me through what you wrote. Don't be precious about the teaching frame. |
| **Answer "why" with depth** | I'll ask why a lot. Go deep. Tradeoffs, alternatives, what breaks at scale. Don't hedge or give me the survey — give me the reasoning and your actual opinion. |

### Calibrate to me

Read a few files before assuming a level. This backend is layered cleanly, the
multi-tenancy is enforced structurally rather than by convention, and the
comments explain *why* rather than *what*. Assume I'm competent at Python,
async, FastAPI, Neo4j, and Cypher.

**The learning target is Graph RAG itself** — embeddings, vector similarity,
retrieval quality, graph expansion, context assembly, grounding. Not routers,
not dependency injection, not how to write a repository. Teach retrieval, not
web framework mechanics.

---

## 1. The project, in brief

**Narrative Mind** — a FastAPI + Neo4j service modeling a fictional world as a
graph. `Character`, `Location`, `Faction`, `Event` nodes; `KNOWS`, `MEMBER_OF`,
`LOCATED_IN`, `PARTICIPATED_IN` edges.

`backend/README.md` is thorough and current — read it rather than asking me
setup questions.

What matters most for RAG:

- **Layering is strict**: `api → services → repositories → db`, with `core`,
  `domain`, `providers` as leaves. All Cypher lives in repositories. Services
  raise domain errors only. RAG must respect this.
- **Multi-tenant by construction**: every entity node carries `owner_id`. The
  four entity repos and `GraphRepository` are *constructed* with the
  authenticated user's id and filter every query by it — so no method can forget
  to scope itself. Nothing above the repository layer knows an owner exists.
  **This is the constraint that makes RAG here non-standard.** Read the comment
  block in `api/deps.py` around `OwnerDep`, and the docstring on
  `repositories/graph_repo.py`.
- **Two LLM providers, chat only**: Ollama local, Groq deployed, chosen by
  `LLM_PROVIDER`, behind an `LLMProvider` Protocol. **This does not change.**
- **Deploys to Vercel serverless** + Neo4j Aura. This constrains more than it
  looks like it does — see the traps.
- **Starter world**: every account is seeded 27 entities / 69 relationships (the
  Verge worldset, in `domain/starter_world.py`). Good, real test data.
- **Tests**: integration against a live Neo4j via `TestClient`. `conftest.py`
  sets `SEED_NEW_USER_WORLD=false`, so test accounts start empty.

Run it: `uv run uvicorn narrative_mind.main:app --reload`, plus
`docker compose up -d neo4j` from the repo root.

---

## 2. Where things stand

Nothing is implemented. The AI features today (`/ai/describe`, `/ai/extract`)
read only the request body — they never touch the caller's graph. That's the gap.

`docs/backend/GRAPH_RAG_PLAN.md` holds the full plan: seven phases, every file
to create and modify, dependencies, and five known traps.

**Its §2.1–2.3 decisions are already settled.** Don't reopen them unless I ask:

1. Embeddings become a **separate provider axis** from chat (Groq has no
   embeddings endpoint, and production runs Groq).
2. **Ollama embeddings local, hosted embeddings in prod**, ranked by top-K with
   no absolute score threshold.
3. **Exact owner-scoped cosine similarity, no vector index**, for V1.

---

## 3. The learning arc

The plan's phases are ordered for *implementation*. Here's what each one is
*for*, pedagogically. Front-load the concept work — the exercises matter more
than the code.

### Phase 1 — Embedding provider
**Concepts:** what an embedding actually is; vector space and dimensionality;
cosine similarity and why not Euclidean; why query and document embeddings
sometimes need different prefixes; why two models' vectors are incomparable.

**Exercise before writing the provider:** embed five short strings — two near
paraphrases, two same-topic-different-meaning, one unrelated — and print the
pairwise cosine matrix. Predict the numbers first, then look. The goal is to
learn that "unrelated" is ~0.6, not ~0.0, and why that kills absolute thresholds.

### Phase 2 — Projection hygiene
Little RAG content; it's codebase hygiene with a real performance lesson about
`{.*}` map projections. Move fast.

### Phase 3 — The write path
**Concepts:** what text to embed and why the choice dominates retrieval quality;
canonical text construction; staleness and invalidation; idempotent backfill.

**Exercise before writing `embedding_service`:** hand-write the canonical text
for three starter entities. Then ask of each: *would the question "who rules
Kestrelwatch?" match this text?* Usually it won't — the ruling is an edge, not a
property. Sitting with that is the whole motivation for the next phase.

### Phase 4 — Retrieval ← spend the most time here
**Concepts:** top-K seeding; exact vs. approximate search and when ANN starts
paying; the induced subgraph and why edges between neighbours matter; context
assembly and budgeting.

**The key exercise:** pick a question whose answer is *not in any single node's
text* — "who would object if Aria took Kestrelwatch?" — then run retrieval at
depth 0, 1, and 2 and read the three context blocks side by side. Depth 0 is
plain RAG. What appears at depth 1 is the entire argument for Graph RAG. Feel
that difference rather than being told it.

**Second exercise:** for three questions, write down by hand which entities
*should* be retrieved, then compare against what the retriever returns. That's
your retrieval quality metric, and it's the only honest one you'll have before
there's an LLM in the loop.

Build `POST /ai/retrieve` and tune here, with no model involved. Do not move to
Phase 5 while retrieval is still bad — an LLM on top of bad retrieval produces
confident nonsense and you will waste days blaming the prompt.

### Phase 5 — Generation
**Concepts:** grounding; why "answer only from context" is necessary but not
sufficient; citation validation as enforcement; refusal as a correct answer.

**Exercise before writing `rag_service`:** paste a hand-built context block plus
a question straight into the model and iterate on the system prompt by hand.
Learn what a good answer looks like before automating the thing that produces it.

Note the precedent: `AIService._filter_extract_response` already distrusts model
output and re-validates it in Python against evidence in the source. Citation
validation is the same move. Read that method first.

### Phase 6 — Tests
**Concepts:** testing a nondeterministic system; deterministic fake embedders;
what's actually assertable about retrieval.

`tests/test_rag_isolation.py` is the one that matters — account A's question
must never retrieve account B's entities, *even when B holds a near-identical
entity that would outrank A's own on raw similarity*. Write that test early,
even before it can pass.

### Phase 7 — Deployment
Env vars, backfill against Aura, the serverless constraints.

---

## 4. Traps: let me hit these, warn me about those

Judgment call worth making deliberately.

**Let me discover (the lesson is worth the hour):**
- `{.*}` projections quietly returning vectors — a great lesson in silent
  performance regressions, and cheap to fix once seen. If I skip Phase 2, let me
  find out.
- Embedding only entity text, then discovering relational questions fail —
  this is the motivating pain for graph expansion. Don't pre-empt it.
- Absolute similarity thresholds behaving nothing like intuition suggests.

**Warn me before I write it (these pass every local test and fail in production):**
- **The vector index ignores `owner_id`.** `db.index.vector.queryNodes()`
  returns global top-K with no pre-filter, so on a multi-tenant database the
  owner post-filter can starve a caller whose world is perfectly healthy. It
  will pass every test I write on a fresh DB. If I reach for a vector index,
  stop me.
- **`BackgroundTasks` are unreliable on Vercel.** A dropped `last_indexed_at`
  is harmless — which is why the existing hook gets away with it. A dropped
  embedding write makes an entity permanently invisible to retrieval, silently.
- **`PATCH` has no reindex hook.** Only create does. Embed-on-create-only means
  stale vectors describing text that no longer exists.
- **Switching embedding models invalidates the whole corpus.** If I change the
  model mid-implementation, remind me the backfill isn't optional.

---

## 5. Start here

1. Read `backend/README.md` and `docs/backend/GRAPH_RAG_PLAN.md`.
2. Skim `api/deps.py`, `repositories/graph_repo.py`, `repositories/character_repo.py`,
   `services/ai_service.py`, `providers/llm.py`. That's the shape of everything
   RAG will touch or imitate.
3. Confirm my environment is actually up — Neo4j running, suite green — before
   we build on it.
4. Then: **the Phase 1 embedding exercise, before any code.** Walk me through
   what an embedding is using the Verge worldset as the example, and have me
   predict that cosine matrix.

Don't summarize the plan back to me at length. Get oriented, tell me what you'd
change about it if anything, and start teaching.
