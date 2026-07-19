# Frontend Architecture — Narrative Mind

> Architecture and planning document. **No implementation.** This describes how
> the Narrative Mind frontend is structured, why each decision was made, and how
> it integrates with the existing backend described in
> [../REPOSITORY_ANALYSIS.md](../REPOSITORY_ANALYSIS.md).
>
> Fixed stack (non-negotiable): **React + TypeScript + Vite + Tailwind CSS +
> shadcn/ui**, latest mutually-compatible stable versions at implementation time.
> Companion documents:
> [FRONTEND_FILE_STRUCTURE.md](./FRONTEND_FILE_STRUCTURE.md) ·
> [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md) ·
> [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) ·
> [COMPONENT_HIERARCHY.md](./COMPONENT_HIERARCHY.md) ·
> [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

---

## 1. Product framing (what we are actually building)

The backend is CRUD-shaped, but the product is **not** a CRUD dashboard. Narrative
Mind is professional creative software for authoring and reasoning about a
fictional world. The frontend is therefore designed as a **desktop-class,
keyboard-first workspace** over a single implicit world graph:

- A **persistent application shell** (explorer sidebar · main workspace · status
  bar · global command bar), closer in feel to an IDE or a knowledge tool than to
  a form-over-table admin panel.
- The four backend entities — **Character, Location, Faction, Event** — are the
  primary objects the writer manipulates. Their identical backend service shape
  (see analysis §Service Layer) is exploited on the frontend as a **single
  generic entity engine** rather than four hand-written CRUD screens.
- The **graph** (ego-network, shortest-path) and **relationships** are
  first-class narrative-reasoning surfaces, isolated as their own feature so their
  weight (visualization) never taxes the rest of the app.

### Grounding constraint: one implicit world

The backend has **no world/project/tenant concept** — it is a single flat graph.
The frontend must not invent a "World" entity that requires backend support.
Everything operates on *the* world (singular, implicit). Multi-world scoping is a
documented future extension (§7) that will require a backend change first.

---

## 2. Architectural style

**Feature-based (vertical slice) architecture with a thin shared core.**

Each feature owns its full vertical: wire schemas → API functions → query hooks →
UI. Cross-cutting concerns (HTTP transport, design system, app shell, routing,
global UI state) live in a small shared core. This mirrors the backend's own
clean layering and keeps the two codebases legible to the same mental model.

### 2.1 Layered symmetry with the backend

The backend's one-directional layering (`api → services → repositories → db`,
with `domain` as a leaf) has a deliberate frontend mirror. Reading the two side by
side is intentional:

| Backend layer | Frontend counterpart | Responsibility |
|---|---|---|
| `domain/` (Pydantic DTO triads, `Page[T]`) | **Schema layer** (Zod schemas + inferred TS types + mappers) | Single source of truth for shape & runtime validation at the wire boundary |
| `repositories/` (all data access) | **Resource layer** (typed endpoint functions over the HTTP client) | The *only* place that knows URLs, verbs, query params |
| `services/` (orchestration, error semantics) | **Query layer** (TanStack Query hooks: keys, caching, invalidation, optimistic writes) | Orchestrates fetching + cache coherence; owns loading/error surfacing |
| `api/routers/` (HTTP handlers) | **Feature UI** (routes, pages, feature components) | Presents state, dispatches user intent |
| `core/` (config, errors, DI) | **App core** (providers, error normalization, config, keyboard/command registry) | App-wide plumbing |

Dependencies flow one direction: `Feature UI → Query → Resource → Schema →
HTTP client`. UI never calls the HTTP client directly; the Resource layer never
imports React. This is the frontend equivalent of the backend's "routers never
touch Cypher."

### 2.2 Why feature-based over layer-based (technical/type folders)

- **Decision:** Group by feature (`features/characters/*`) not by technical type
  (`components/*`, `hooks/*`, `api/*` at the root).
- **Reasoning:** The backend already proves the domain is stable and entity-shaped.
  Co-locating everything about "characters" makes each slice independently
  understandable, testable, and lazy-loadable, and makes the generic-entity
  abstraction (below) obvious because the slices are visibly parallel.
- **Benefits:** Scales as features (graph, future AI, timeline) are added without
  bloating shared folders; enables per-feature code splitting; localizes churn.
- **Trade-offs:** Requires discipline about what is "shared" vs "feature-local";
  risk of premature duplication. Mitigated by the explicit rule in
  [FRONTEND_FILE_STRUCTURE.md](./FRONTEND_FILE_STRUCTURE.md): *promote to `shared/`
  only on the second real consumer.*
- **Future scalability:** New capabilities from the README roadmap (Timeline,
  Encyclopedia, Knowledge Search) drop in as new slices with zero change to
  existing ones.

### 2.3 The generic entity engine (core DRY decision)

- **Decision:** Model the four entities as **descriptor objects** consumed by
  **generic components/hooks** (`EntityListView`, `EntityDetailView`,
  `EntityForm`, `useEntityListQuery`, `useEntityMutations`) rather than writing
  four near-identical CRUD stacks.
- **Reasoning:** The backend's four entity services are byte-for-byte parallel
  (analysis §Service Layer). Their only differences are declarative: field set,
  categorical filter (`status`/`region`/`ideology`/none), and sortable-field
  whitelist. Those differences are *data*, so they belong in a config object, not
  in copy-pasted code.
- **Benefits:** One implementation to test and polish; adding a fifth entity is a
  descriptor, not a subtree; keyboard/command/table behaviour is uniform for free.
- **Trade-offs:** Abstraction risk (KISS tension). Two guardrails: (a) entity-
  specific needs — Character relationships, Event `timeline_order` — use explicit
  **escape hatches** (per-entity slots/overrides), never leaky flags baked into
  the generic core; (b) the abstraction is introduced only *after* the first
  entity (Character) is built concretely and a second (Location) reveals the true
  seam (see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) M3).
- **Future scalability:** The descriptor is the natural attach point for future
  column types, inline editors, and AI-assist affordances.

---

## 3. Major frontend modules & responsibilities

```
┌─────────────────────────────────────────────────────────────────────┐
│ App Core (providers, router, error boundary, command+keyboard bus)   │
├───────────────┬───────────────────────────────────────┬─────────────┤
│ App Shell     │ Feature Slices                         │ Shared Core │
│ (workspace    │  characters · locations · factions ·   │  ui (shadcn)│
│  layout,      │  events · graph · world(overview)      │  entity-kit │
│  explorer,    │  [future: ai, timeline, search]        │  api-client │
│  command bar, │                                        │  schemas    │
│  status bar)  │  each slice: schema→api→queries→ui      │  hooks/utils│
└───────────────┴───────────────────────────────────────┴─────────────┘
                         │ TanStack Query cache │
                         ▼                      ▼
              ┌───────────────────────────────────────┐
              │ Resource layer → HTTP client (fetch)  │
              └───────────────────┬───────────────────┘
                                  ▼
                        FastAPI backend (JSON/REST)
```

| Module | Responsibility | Key boundary rule |
|---|---|---|
| **App Core** | Composition root: mounts providers (QueryClient, Router, Theme, Toaster, Keyboard/Command bus), the top-level error boundary, and global config. | The only place providers are wired. |
| **App Shell** | The persistent desktop chrome: resizable panels, explorer/navigator, top command bar, status bar (backend health + environment), tab/route surface. | Contains no entity-specific logic; renders the active route. |
| **Feature slices** | Self-contained vertical per capability. | May depend on Shared Core; **never** on another feature's internals (only its public `index.ts`). |
| **Shared Core — `ui`** | shadcn/ui primitives (Radix-based) + tokens. | Presentational only; no data fetching. |
| **Shared Core — `entity-kit`** | The generic entity engine (descriptors, generic list/detail/form, entity query-hook factory). | Consumed by entity slices; knows the *shape* of an entity, not any specific entity. |
| **Shared Core — `api-client`** | HTTP transport, error normalization, auth seam, query-client factory, query-key registry. | The single choke point for all network I/O and error mapping. |
| **Shared Core — `schemas`** | Cross-cutting Zod primitives (`Page<T>`, error envelope, id/date). | Pure; no React, no fetch. |

---

## 4. Data flow

### 4.1 Read (list a paginated, filtered, sorted entity)

1. A list route renders; **URL search params** (`limit/offset/sort_by/order/
   name_contains/<categorical>`) are the source of truth for list state
   ([STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) §URL state).
2. The route's container parses+validates those params (Zod) into a typed query
   input.
3. `useEntityListQuery(descriptor, input)` derives a **query key** from the input
   and calls TanStack Query.
4. On a cache miss, the Query layer invokes the **resource function**
   (`listCharacters(input)`), which builds the request via the **HTTP client**.
5. The HTTP client fetches, then hands the raw JSON to the **schema layer**, which
   validates it into a typed `Page<Character>` **and computes `hasMore`
   client-side** (the backend does not serialize it — analysis §Observations #9).
6. The typed page flows back up; the generic `EntityListView` renders rows,
   pagination, and sort controls; `placeholderData` keeps the previous page
   visible during transitions (no layout flash).

### 4.2 Write (create / update / delete)

1. A form (React Hook Form + Zod resolver) validates against the **same Zod
   schema** that mirrors the backend DTO constraints (name 1–120, aliases ≤10,
   etc.).
2. On submit, `useCreateEntity`/`useUpdateEntity`/`useDeleteEntity` (mutation
   hooks) call the resource function.
3. Update sends **only changed fields** (diffed against the loaded entity) because
   the backend rejects empty updates (422) and its `exclude_none` semantics mean
   nulls can't clear fields (analysis §Service Layer; see
   [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md) §Response mapping gotchas).
4. On success, the mutation **invalidates** the relevant query keys (list + detail)
   so the cache re-syncs; optimistic updates are applied where safe.
5. Errors are normalized (§5) and routed: field-level validation → back onto the
   form via `setError`; everything else → a toast.

### 4.3 Golden rule: one server-state cache

Server data lives **only** in the TanStack Query cache. It is never copied into
Zustand or component state. Router loaders are not used as a second data cache.
This single-source-of-truth rule (justified in
[STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md)) prevents the classic dual-cache drift.

---

## 5. Communication with the backend

Full detail in [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md). Architecture-
level commitments:

- **Transport:** native `fetch` wrapped in a thin typed client. No axios/ky —
  TanStack Query already owns retry/loading, so the transport only needs base-URL,
  JSON, cancellation (AbortSignal), error normalization, and an auth seam. Fewer
  dependencies, per the engineering principles.
- **Two error shapes, one normalized type.** The backend emits a domain envelope
  `{"error":{"code,message}}` (analysis §Error Handling) *and* FastAPI's built-in
  request-validation shape `{"detail":[...]}` (a different 422). The client
  collapses both into a single `ApiError { status, code, message, fieldErrors }`.
- **`hasMore` is derived, not received.** Centralized in the `Page` schema mapper.
- **Anti-corruption boundary.** The wire is snake_case (`created_at`,
  `timeline_order`, `name_contains`); the app is camelCase. Per-entity mappers
  convert at the schema layer so components never see wire casing. This also
  isolates read-only computed fields (`display_name`) so they are never echoed back
  on writes.
- **Health-driven status.** `GET /health` powers a status-bar indicator
  (connected / degraded / offline) and surfaces `environment`.

---

## 6. Cross-cutting foundations

- **Design system / theme:** Dark-only, token-driven (CSS variables consumed by
  Tailwind + shadcn). Tokens are the single styling source of truth; components
  never hardcode colors. Detail in
  [COMPONENT_HIERARCHY.md](./COMPONENT_HIERARCHY.md) §Design system foundation.
- **Keyboard & command model:** A small in-house **command registry** (KISS, no
  extra dependency) feeds both the `Cmd/Ctrl-K` command palette (shadcn `cmdk`)
  and global shortcuts. Every meaningful action registers a command once and is
  invokable by keyboard, palette, and (optionally) menu — a single behaviour
  source, not three.
- **Motion:** Restrained, state-communicating transitions only (panel open/close,
  route cross-fade, list reflow, optimistic-state settle). Implemented with CSS/
  Tailwind transitions first; a motion library is added only if a specific
  interaction demands it (deferred, not assumed).
- **Accessibility:** Inherited from Radix primitives (focus management, roles,
  ARIA); dark palette validated for contrast. Keyboard-first is an a11y win, not
  just a power-user one.
- **Error resilience:** A route-level React error boundary catches render failures
  and offers recovery; network/domain errors never crash the shell.

---

## 7. Future extension points (designed-for, not built)

Each is a seam that exists in the architecture now and stays inert until needed —
honoring "future compatibility matters, implementation does not."

1. **Authentication (out of scope now):** one interceptor slot in the HTTP client
   (inject bearer token or rely on cookies — CORS already allows credentials) plus
   a `401 → sign-in` policy and per-identity cache reset. No auth code today; the
   hole is the right shape.
2. **AI surfaces (`/ai/describe`, `/ai/extract`):** land as an `ai` feature slice
   consuming the existing endpoints — a "Describe" assist in the entity form and an
   "Extract from passage" panel that proposes entities/relationships for review.
   The generic form's escape-hatch slots are the attach points. (Explicitly out of
   scope this phase.)
3. **Graph renderer swap:** the graph feature hides its visualization behind a
   `GraphRenderer` interface, so the actual layout/drawing library is chosen and
   swapped in isolation without touching data or app code.
   *As-built (M6):* the renderer is Cytoscape 3.34, and `import … from
   "cytoscape"` appears in exactly three files, all under
   `features/graph/engine/cytoscape/`. The interface is expressed wholly in the
   subsystem's own types, so a swap is one new implementation plus one line in
   `engine/index.ts`. The whole subsystem is a lazy route chunk (~486 kB), so the
   heaviest dependency in the app never touches initial load.

   *As-built (M9) — the boundary survived editing, which was its real test.*
   Adding selection, hover, a context menu, and click-to-connect grew the
   contract by five members (`setEditingVisual`, `fitTo`, `centerOn`, and the
   `hoverChange` / `elementContextMenu` / `backgroundTap` events) and moved no
   Cytoscape type above the engine. The rule applied throughout: the renderer is
   handed an *appearance* and reports *intent*; it is never told what a
   relationship is or which pairings are legal. Those live in
   `shared/domain/relationships.ts` and `features/graph/services/connect-rules.ts`,
   neither of which imports the engine. See COMPONENT_HIERARCHY.md §6b–6e.
4. **Multi-world / projects:** if the backend later adds world scoping, a
   `worldId` slots into the query-key registry and resource layer as a prefix; the
   descriptor engine is unaffected.
5. **Full-text / Knowledge Search:** today only `name_contains` substring exists;
   the command-palette "search" action is built against it and will re-point to a
   real search endpoint when one appears, without UI change.
6. **Bulk operations / real-time:** no batch or streaming endpoints exist; the
   query-invalidation model is compatible with adding websockets/polling later
   (invalidate on push).

---

## 8. Decisions at a glance

| # | Decision | Primary reason | Doc |
|---|---|---|---|
| D1 | Feature-based vertical slices | Backend proves a stable entity domain | §2.2 |
| D2 | Layered symmetry with backend | Shared mental model, clean boundaries | §2.1 |
| D3 | Generic entity engine via descriptors | Backend's 4 identical services ⇒ config, not copies | §2.3 |
| D4 | TanStack Query as sole server-state cache | App is server-state-centric CRUD | [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) |
| D5 | Zustand for global UI state | Tiny, no boilerplate, non-server state only | [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) |
| D6 | URL as list-state container | Deep links, back-button, shareable views | [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) |
| D7 | React Hook Form + Zod, schema-as-SSOT | One schema = types + form + response validation (DRY) | [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md) |
| D8 | fetch wrapper (no axios/ky) | Query owns retry/loading; minimize deps | [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md) |
| D9 | React Router (declarative) over TanStack Router | Maturity; Zod already gives typed params | §2, [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) |
| D10 | In-house command/keyboard registry | Keyboard-first without extra deps | §6 |
| D11 | Graph viz behind a renderer interface, lazy-loaded | Contain weight & library risk | §7 |

Every decision above is expanded in the referenced document using the
Decision / Reasoning / Benefits / Trade-offs / Future scalability format.
