# State Management — Narrative Mind

> Planning document. **No implementation.** Chooses the state strategy, classifies
> every kind of state, and justifies the choice against reasonable alternatives.
> Read with [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md) (owns the network
> details) and [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md).

---

## 1. The core insight: this app is mostly *server state*

Nearly everything on screen is data that **lives in Neo4j and is owned by the
backend** — lists of characters, a faction's detail, an ego-network. The frontend
does not own it; it *borrows* it, displays it, and asks the backend to change it.
The dominant state problem is therefore **cache management** (freshness, dedupe,
invalidation, optimistic writes), not "global app state." Choosing tools that
treat these two problems as distinct is the central decision.

We split state into four categories and assign each a single owner:

| Category | What it is | Owner | Example |
|---|---|---|---|
| **Server state** | Backend-owned data, cached client-side | **TanStack Query** | character list, entity detail, graph network |
| **URL state** | Navigable, shareable view state | **React Router search params** | list filters, sort, pagination, selected id |
| **Global UI state** | App-wide, non-server, ephemeral | **Zustand** | command palette open, panel sizes, sidebar collapsed, transient selection |
| **Local state** | Confined to one component/subtree | **`useState`/`useReducer`** | form field focus, a dropdown's open flag |

The guiding rule: **each piece of state has exactly one home.** Server data is
never mirrored into Zustand; URL-owned view state is never duplicated in a store.
This is the primary defense against the drift bugs that sink stateful frontends.

---

## 2. Server state — TanStack Query (Decision D4)

- **Decision:** All backend data flows through TanStack Query; it is the *only*
  server-state cache. Router loaders are not used as a competing cache; Zustand
  holds no server data.
- **Reasoning:** The backend is a paginated, filterable, mutable REST surface over
  four symmetric entities plus graph reads. Query's model — query keys, background
  refetch, stale-while-revalidate, request dedupe, cancellation, and
  invalidation-on-mutation — maps 1:1 onto that surface. It also cleanly absorbs
  the backend's quirks the client must handle (client-derived `hasMore`,
  keep-previous pagination, no-retry-on-4xx) at the policy layer.
- **Benefits:**
  - Eliminates hand-rolled loading/error/refetch code across ~20 endpoints.
  - Invalidation gives cache coherence after writes almost for free (create/delete
    invalidate list keys; update patches the detail key).
  - Optimistic updates + rollback are first-class, which is what makes a creative
    tool feel instant.
  - Pairs naturally with the generic entity engine: one `useEntityListQuery` /
    `useEntityMutations` factory serves all four entities (DRY, architecture D3).
- **Trade-offs:** A real dependency and a caching mental model the team must learn;
  query-key hygiene matters (mitigated by a **central query-key registry** in
  `shared/api/query-keys.ts` so keys are never stringly-typed ad hoc).
- **Future scalability:** websockets/polling can invalidate keys on push;
  auth adds a per-identity key prefix and a client reset; a future search endpoint
  is just another query. None disturb existing hooks.

### Query-key strategy

A single typed factory produces keys so invalidation is predictable:

```
['characters']                          → entity root (invalidate everything char)
['characters','list', normalizedInput]  → a specific list page/filter/sort
['characters','detail', id]             → one entity
['graph','network', characterId, depth]
['graph','shortest-path', source, target]
['system','health']
```

Mutations invalidate at the coarsest safe level: create/delete →
`['characters','list']`; update → patch `['characters','detail', id]` then
invalidate the entity root. Normalized input (sorted keys, defaults applied) makes
identical logical queries share one cache entry.

### Alternatives considered and rejected

- **RTK Query (Redux Toolkit):** capable server-cache, but drags in the full Redux
  store and its boilerplate for a problem that is *only* server-cache. We have very
  little genuine global client state, so a store-first framework is inverted for
  this app. Rejected: weight and ceremony without payoff.
- **SWR:** lighter and pleasant for reads, but its mutation/invalidation and
  optimistic story is thinner than Query's — and mutations (with cross-page list
  invalidation) are central here. Rejected: weaker fit for the write-heavy CRUD.
- **Hand-rolled `useEffect` + fetch:** re-implements caching, dedupe, cancellation,
  and retries badly across the app. Rejected: violates DRY/KISS at scale.

---

## 3. URL state — React Router search params (Decision D6)

- **Decision:** List view state — `limit`, `offset`, `sort_by`, `order`,
  `name_contains`, and the per-entity categorical filter — is encoded in the URL
  query string and treated as the source of truth. The selected-entity id, when a
  master/detail split is used, is likewise a route/URL value.
- **Reasoning:** These are exactly the parameters the backend list endpoints
  accept. Putting them in the URL makes every filtered/sorted view **deep-linkable,
  shareable, and back/forward-navigable** — table stakes for professional software
  — and gives the Query layer a natural, serializable key source (URL params →
  normalized query input → query key). One source drives both navigation and
  fetching.
- **Benefits:** No separate "filter state" store to keep in sync with the address
  bar; reload restores the exact view; the browser history *is* the view history.
- **Trade-offs:** URL parsing must be typed and validated (a malformed `?limit=abc`
  can't reach the query). Handled by a `useUrlListState` hook that parses+validates
  params with Zod and clamps to the backend's bounds (`limit 1..100`, `offset ≥0`),
  so the client never issues a request the backend would reject.

> **As-built (M4):** `useUrlListState` takes its entity-specific filter names as
> an argument (`{ filterKeys }`) rather than knowing them. It ships with only the
> params *every* collection shares (`nameContains`, `sortBy`, `order`); the caller
> — `EntityListView` — supplies the rest from its descriptor. Those keys define
> two behaviours: changing one returns to page 1, and its presence in the URL means
> "filtered". Originally the hook hardcoded `status`/`region`/`ideology`, which put
> per-entity knowledge in a shared hook and would have needed an edit for every new
> entity. It is now a pure function of what the caller declares.
- **Future scalability:** a `worldId` path segment slots in ahead of these params
  with no change to the parsing hook's shape.

> **As-built (M6) — the Graph subsystem's state boundaries.** The graph adds two
> state kinds the entity engine never needed, and keeping them apart is what makes
> the rendering engine replaceable:
>
> | State | Owner | Why there |
> |---|---|---|
> | Backend graph data | TanStack Query | ordinary server state, same cache and key registry as everything else |
> | Which graph to show | URL (`?character=&depth=`) | D6 again — a view of the world stays shareable and survives reload |
> | Selection | view-scoped React state | meaningless outside the workspace, so **not** the Zustand store |
> | Viewport (authority) | the renderer, internally | pan/zoom is a high-frequency animated concern |
> | Viewport (display) | a read-only mirror | so the toolbar can show a zoom % |
>
> Two rules earn their keep. **Selection is stored as an id reference, not a node
> object**, and resolved against the current model at read time — so it cannot go
> stale when data refetches, and no effect is needed to clear it. **The renderer
> stays the viewport's authority**; the mirror is never fed back. Making React the
> source of truth for pan/zoom would fight the library's own animation loop and
> stutter every drag. Graph elements never enter React state at all, which is what
> keeps a large graph from re-rendering through the VDOM.

### Why React Router over TanStack Router (Decision D9, revisited here)

- **Decision:** Use React Router (declarative) for routing + URL state.
- **Reasoning:** It is the mature, ubiquitous choice; nested layout routes model
  the persistent shell + swappable main cleanly; and we already get typed,
  validated search params from our own Zod-backed `useUrlListState`, which is the
  main thing TanStack Router would otherwise provide.
- **Trade-offs:** We forgo TanStack Router's built-in end-to-end typed search
  params and loader typing. Accepted because Zod validation covers the safety need
  and React Router's smaller conceptual surface reduces onboarding cost.
- **Future scalability:** if typed-routing pressure grows, TanStack Router can
  replace this layer without touching features (routing is isolated in
  `src/routes/` per [FRONTEND_FILE_STRUCTURE.md](./FRONTEND_FILE_STRUCTURE.md)).

---

## 4. Global UI state — Zustand (Decision D5)

- **Decision:** A small set of Zustand stores holds app-wide, non-server UI state:
  command-palette visibility, keyboard/command registry state, resizable-panel
  sizes and sidebar collapse, and transient cross-component selection (e.g., the
  "active entity" highlight that isn't itself a route).
- **Reasoning:** This state is genuinely global (many components read it), changes
  frequently (panel drag, palette toggle), and is *not* server data or URL data.
  Zustand provides exactly this with a tiny footprint, selector-based subscriptions
  (so a panel resize doesn't re-render the whole tree), and no provider/boilerplate
  ceremony.
- **Benefits:** Minimal API, excellent render performance via selectors, trivial to
  test (plain stores), and no context-nesting pyramid.
- **Trade-offs:** Another small dependency and a second state mental model beside
  Query. Bounded by a hard rule: **Zustand never stores server data or anything the
  URL owns.** If a value can be derived from Query or the URL, it is — the store
  stays small.
- **Future scalability:** editor/layout preferences, a future multi-pane tab
  system, and command history all fit the same store pattern.

### Alternatives considered and rejected

- **React Context for everything:** fine for stable, rarely-changing values (we do
  use context for provider-style injection like the QueryClient, theme, and command
  registry *host*). But high-frequency UI state (panel drag) in Context re-renders
  every consumer. Rejected for reactive UI state; retained only for DI-style
  constants.
- **Redux Toolkit:** overkill for the handful of UI flags here; the boilerplate and
  store-first framing aren't justified when Query already owns the hard part.
  Rejected.
- **Jotai/Recoil (atoms):** viable and elegant, but Zustand's store model is simpler
  to reason about for a small, well-scoped set of global flags, and adds less
  conceptual surface. Rejected as marginal over Zustand for our needs.

---

## 5. Local & form state

- **Local component state (`useState`/`useReducer`):** anything that doesn't escape
  a component or its subtree — a popover's open flag, hover state, a wizard step.
  Default to this first; promote to Zustand only when a second, distant component
  genuinely needs it.
- **Form state — React Hook Form + Zod:** entity create/edit forms are managed by
  RHF with a Zod resolver bound to the **same schema** that validates API responses
  ([API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md) §3). RHF keeps form state
  local and uncontrolled-by-default (fast, few re-renders); Zod enforces the
  backend's constraints *before* a request leaves the browser; server `fieldErrors`
  from a 422 map back via `setError`. Update forms diff against the loaded entity so
  only changed fields are submitted (backend rejects empty updates; `exclude_none`
  can't null fields).

---

## 6. How the categories interact (a concrete view)

The Character list screen exercises all four owners, each staying in its lane:

- **URL** holds `?status=alive&sort_by=name&order=asc&limit=20&offset=0`.
- **Query** turns those into `['characters','list', input]` and serves cached data,
  deriving `hasMore`.
- **Zustand** holds whether the detail panel is open and the split ratio — view
  chrome, not data, not a link.
- **Local state** holds the row-hover and the inline filter popover's open flag.
- **RHF+Zod** owns the "New Character" dialog's fields until submit, then a Query
  mutation writes and invalidates the list.

No value lives in two places; changing the URL refetches; a successful write
invalidates; the panel toggle never touches the network. That separation is the
whole strategy.

---

## 7. Why this fits Narrative Mind specifically

- The backend is **server-authoritative CRUD + graph reads** → a server-cache-first
  strategy (Query) is the correct center of gravity, not a global store.
- The product is a **desktop workspace** → deep-linkable, restorable views (URL
  state) and persistent chrome state (Zustand) are exactly the ergonomics expected.
- The four entities are **symmetric** → one Query hook factory + one schema per
  entity keeps state handling DRY, matching the backend's own uniformity.
- The principle set (SOLID/DRY/KISS, fewer deps) → three focused tools
  (Query, Router, Zustand) each own one problem, versus one heavyweight framework
  straddling all of them. Minimal, justified, and separable.
