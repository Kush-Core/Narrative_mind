# Frontend File Structure — Narrative Mind

> Planning document. **No scaffolding.** This is the target directory design for
> the frontend, with the *purpose*, *responsibility*, and *reason to exist* of
> every major folder. Read alongside
> [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md).

---

## 1. Repository placement

Per the analysis, the repo already anticipates a monorepo layout: the backend was
relocated to `backend/` for a "v2 monorepo layout," and CORS defaults to the Vite
port `5173`. The frontend therefore lives as a **sibling** of the backend:

```
narrative_mind/            (repo root)
├── backend/               (existing FastAPI service — unchanged)
├── frontend/              (this design — the React app)
└── docs/                  (shared docs, incl. this file)
```

- **Purpose:** Keep the two deployables independent but co-versioned.
- **Why:** The backend is already a self-contained `backend/` package; a parallel
  `frontend/` keeps tooling (uv vs. node), lint configs, and build outputs from
  colliding, while a single git history keeps API contract and client in lockstep.
- **Non-goal:** No shared build tooling / workspace manager is introduced now
  (KISS, fewer deps). If a shared types package is ever justified, a workspace can
  be added later without moving anything.

---

## 2. Top level of `frontend/`

```
frontend/
├── public/                 Static assets served verbatim (favicon, fonts if self-hosted)
├── src/                    All application source (detailed below)
├── index.html              Vite entry HTML (single mount point; locks the dark class)
├── package.json            Dependencies + scripts (justified set only)
├── tsconfig.json           Project references + "@/*" path alias (editor/CLI)
├── tsconfig.app.json       Strict app compiler options + "@/*" → src/*
├── tsconfig.node.json      Node-context config (vite.config.ts)
├── vite.config.ts          Vite + React + Tailwind plugin wiring, path aliases
├── components.json         shadcn/ui generator config (where primitives land)
├── eslint.config.js        Flat-config lint rules (typed, import-order, a11y)
├── .prettierrc.json        Formatting (mirrors backend's "one formatter" stance)
├── .prettierignore
└── .env / .env.example     VITE_API_BASE_URL etc. (client-safe config only)
    .env.test               Pinned API origin for the test suite (committed)
```

> **Test configuration (as-built, M2):** `vite.config.ts` also carries the
> Vitest configuration (`test.*`), rather than a separate `vitest.config.ts` —
> one config file, and the `@/*` alias is shared by definition. `.env.test` is
> committed (unlike `.env`) so the suite is hermetic: MSW handlers and the HTTP
> client always agree on the API origin regardless of local `.env` values.

> **Tailwind v4 note (implementation reality):** there is intentionally **no
> `tailwind.config.ts`**. Tailwind v4 is configured CSS-first — the design
> tokens live in `src/styles/tokens.css` and are mapped onto Tailwind's theme
> via `@theme inline` in `src/styles/globals.css`. The token file remains the
> single styling source of truth exactly as designed; only the mechanism moved
> from a TS config file into CSS.

- **`public/` — purpose:** assets that must keep their path and bypass the bundler.
  **Why it exists:** fonts/icons/manifest that are referenced by URL, not imported.
- **`index.html` — responsibility:** the one HTML document; declares the root
  element and locks the app to the dark theme class at the document level so there
  is no light-theme flash on first paint.
- **`.env.example` — responsibility:** documents the single client config knob,
  `VITE_API_BASE_URL` (defaults to the backend origin). **Why:** only build-time,
  non-secret values may reach the browser; this mirrors the backend's
  `.env.example` discipline and keeps secrets out of the client entirely.

---

## 3. `src/` — the application

```
src/
├── main.tsx                Bootstrap: mounts <AppRoot/> into #root
├── app/                    Composition root & app shell
├── routes/                 Route tree (URL → screen mapping)
├── features/               Vertical feature slices (the bulk of the app)
├── shared/                 Cross-cutting core reused by ≥2 features
├── styles/                 Global CSS + token definitions
├── test/                   Test harness: MSW server + handlers, Vitest setup (M2)
└── types/                  Ambient/global TypeScript types (env, module shims)
```

The rest of this document explains each of these, top-down.

---

### 3.1 `src/app/` — composition root & shell

```
app/
├── AppRoot.tsx             Provider stack: QueryClientProvider, RouterProvider,
│                           Toaster (M2+), CommandProvider (M1), ErrorBoundary
├── providers/              One file per provider concern (keeps AppRoot readable)
│   ├── query-client.ts     Creates & configures the TanStack QueryClient
│   └── command-provider.tsx  Command/keyboard registry context + palette host (M1)
├── shell/                  The persistent desktop chrome
│   ├── WorkspaceLayout.tsx Panel frame (explorer | main | optional aux; resizable in M1)
│   ├── ExplorerSidebar.tsx Entity navigator / world tree
│   ├── CommandBar.tsx      Top bar: global search trigger, breadcrumbs, actions
│   ├── StatusBar.tsx       Backend health + environment + transient status
│   ├── CommandPalette.tsx  Cmd/Ctrl-K surface bound to the command registry (M1)
│   └── WorkspaceWelcome.tsx  Temporary empty-workspace landing (replaced by
│                             the world OverviewPage in M7)
└── error/
    └── AppErrorBoundary.tsx  Top-level render-failure recovery UI
```

> **Theme provider (implementation reality):** the dark theme is locked
> statically — `class="dark"` + `color-scheme` on `<html>` in `index.html` —
> so no `theme-provider.tsx` exists. A provider adds value only when a second
> theme or runtime theme state appears; introducing it then is additive.

- **Purpose:** Everything that is "the application frame," independent of any one
  entity. **Responsibility:** wire providers exactly once, render the shell, and
  host the active route.
- **Why it exists as its own module:** The shell is the single most reused surface
  and the composition root is where global concerns must not leak into features.
  Isolating it keeps `features/` free of provider/layout plumbing and makes the
  IDE-like chrome a first-class, independently testable unit.

---

### 3.2 `src/routes/` — the route tree

```
routes/
├── router.tsx              Route definitions (lazy-loaded feature elements)
├── paths.ts                Typed path builders (single source of URL strings)
├── not-found.tsx           Catch-all element for unknown URLs
├── route-error.tsx         In-shell error element for failing views
└── guards/                 Reserved: future auth/route guards (empty seam now)
```

- **Purpose:** Map URLs to screens and own navigation structure; nothing else.
- **Responsibility:** Compose the root layout route (the shell) with lazy child
  routes per feature; define the not-found and error elements.
- **Why separate from `app/` and `features/`:** Routing is a cross-feature concern
  (it references many slices) but is not itself a feature. Keeping route *wiring*
  here — while each feature exports its own page components — prevents circular
  ownership and makes the whole navigable surface visible in one place.
- **`paths.ts` — why:** No route string is ever hand-typed in a component. Typed
  builders (`paths.character(id)`) make link refactors safe and are the natural
  home for the future `worldId` prefix (architecture §7).
- **`guards/` — why an empty folder:** it is the documented seam for auth (out of
  scope now). Its existence signals intent without adding code.

---

### 3.3 `src/features/` — vertical slices (the core of the app)

```
features/
├── characters/
│   ├── index.ts            Public surface (the ONLY thing other modules import)
│   ├── model/
│   │   ├── character.schema.ts   Zod schemas: Base/Create/Update/Read + mappers
│   │   └── character.descriptor.ts  Entity descriptor consumed by entity-kit
│   ├── api/
│   │   └── characters.api.ts      Typed resource functions (list/get/create/…)
│   ├── queries/
│   │   └── characters.queries.ts  TanStack Query hooks + query keys
│   ├── components/
│   │   ├── CharacterRelationshipEditor.tsx   (entity-specific escape hatch)
│   │   └── CharacterStatusBadge.tsx
│   └── pages/
│       ├── CharacterListPage.tsx  (thin: descriptor → generic EntityListView)
│       └── CharacterDetailPage.tsx
├── locations/              (same shape; region filter; no relationships)
├── factions/               (same shape; ideology filter)
├── events/                 (same shape; timeline_order sort; no categorical filter)
├── graph/                  Relationship/graph reasoning surface
│   ├── index.ts
│   ├── api/graph.api.ts     ego-network + shortest-path resource functions
│   ├── queries/graph.queries.ts
│   ├── model/graph.schema.ts
│   ├── render/GraphRenderer.ts   Interface (library-agnostic seam)
│   ├── render/…              Concrete renderer (chosen at build time, isolated)
│   └── pages/GraphExplorerPage.tsx, ShortestPathPage.tsx
├── world/                  Overview/home ("dashboard of nothing" avoided —
│   └── pages/OverviewPage.tsx   world summary, recent activity, entry points)
├── system/                 Backend liveness (/health) — see as-built note below
│   ├── index.ts
│   ├── model/health.schema.ts
│   ├── api/system.api.ts
│   └── queries/system.queries.ts
└── ai/                     RESERVED — future (/ai/describe, /ai/extract). Empty now.
```

> **`system/` slice (as-built, M2):** `/health` is not an entity, but it *is* a
> backend resource with a schema, a resource function, and a polled query — so it
> takes the standard slice shape rather than being special-cased into `shared/`.
> It serves two purposes: it drives the status bar's connection indicator, and it
> is the **reference implementation** of the schema→api→queries pattern that the
> entity slices follow in M3/M4. It is deliberately tiny and holds no domain
> logic.

- **Purpose of `features/`:** house one self-contained vertical per capability.
- **Responsibility of each slice:** own its schema → api → queries → ui end to end.
- **Why this shape:** It is the physical expression of architecture decisions D1
  and D3. The four entity slices are deliberately *parallel and thin*: their pages
  hand a **descriptor** to the generic `entity-kit` components, so a slice is
  mostly declaration plus its genuine specifics (Character relationships, Event
  ordering). New capabilities are new folders, never edits to old ones.
- **`index.ts` (public surface) — why:** enforces encapsulation. Other modules
  import `@/features/characters` (its curated exports), never deep paths. This is
  the Interface-Segregation/boundary rule that keeps slices swappable and prevents
  the feature web from tangling.
- **`model/…schema.ts` — why co-located:** the Zod schema is the slice's contract
  with the backend DTO; keeping it in the slice (not a global `schemas/`) means the
  contract lives next to the code that depends on it. Only truly generic schemas
  (`Page`, error envelope) live in `shared/`.
- **`api/…api.ts` — responsibility:** the resource layer for this entity — the only
  place its URLs and query params exist. Mirrors a backend repository.
- **`queries/…queries.ts` — responsibility:** cache orchestration for this entity —
  query keys, list/detail hooks, create/update/delete mutations with invalidation.
  Mirrors a backend service.
- **`graph/render/` — why a `GraphRenderer` interface:** visualization is the one
  heavy, library-dependent concern; isolating it behind an interface lets the whole
  slice be lazy-loaded and the drawing library be swapped without touching data or
  routes (architecture §7.3).
- **`ai/` empty — why:** documents the out-of-scope future surface as a real,
  reserved location so it is not retrofitted awkwardly later.

---

### 3.4 `src/shared/` — cross-cutting core

```
shared/
├── ui/                     Design-system primitives (shadcn/ui output) + tokens usage
│   ├── button.tsx, dialog.tsx, command.tsx, table.tsx, …   (generated primitives)
│   └── composite/          App-level composites built FROM primitives
│       ├── DataTable.tsx           headless-table + shadcn markup
│       ├── ConfirmDialog.tsx
│       ├── EmptyState.tsx / ErrorState.tsx / LoadingState.tsx
│       └── EntityPicker.tsx        (search-select over any entity's list API)
├── entity-kit/             The GENERIC entity engine (architecture D3)
│   ├── types.ts            EntityDescriptor<TRead, TCreate, TUpdate> contract
│   ├── EntityListView.tsx  Generic list: table, filters, sort, pagination
│   ├── EntityDetailView.tsx
│   ├── EntityForm.tsx      Generic RHF+Zod form driven by descriptor field specs
│   ├── useEntityListQuery.ts   Generic list query hook
│   └── useEntityMutations.ts    Generic create/update/delete + invalidation
├── api/                    Transport, error, and resource core
│   ├── http-client.ts      fetch wrapper: base URL, headers, JSON, AbortSignal,
│   │                       timeout, schema validation, auth seam
│   ├── api-error.ts        Normalized ApiError type + both-shape parser
│   ├── error-presentation.ts  Routing policy: field / inline / toast / silent
│   ├── endpoints.ts        Every backend path, as builders (M2)
│   ├── resource.ts         Generic entity resource factory + diffForUpdate (M2)
│   ├── query-keys.ts       Central query-key registry/factory
│   ├── invalidation.ts     Post-write cache-coherence policy (M2)
│   └── auth.ts             AuthTokenProvider interface (inert seam — no auth now)
├── schemas/                Cross-cutting Zod primitives
│   ├── page.schema.ts      Page<T> + client-side hasMore derivation
│   ├── error.schema.ts     Domain envelope + FastAPI detail shapes
│   ├── list-params.schema.ts  Shared list-query contract + wire mapping (M2)
│   └── primitives.ts       id, isoDate, name/text bounds, pagination bounds
├── store/                  Zustand stores for global UI state (M1)
│   └── ui-store.ts         Panel sizes, sidebar collapse, palette visibility
├── types/                  Shared TypeScript types (M2)
│   └── utility.ts          JsonValue, UnknownRecord, PartialBy, Prettify, …
├── hooks/                  Generic reusable hooks (useDebouncedValue, useHotkey,
│   │                       useUrlListState, useMediaQuery)
├── lib/                    Framework-agnostic utilities
│   ├── utils.ts            cn()
│   ├── url.ts              Query-string + URL builders (M2)
│   ├── casing.ts           snake_case ↔ camelCase mappers (M2)
│   ├── pagination.ts       Offset→page-window helpers (M2)
│   ├── date.ts             Defensive ISO parsing/formatting (M2)
│   └── keyboard.ts         Shortcut parsing/matching/display (M1)
├── config/                 Runtime client config (env.ts reads import.meta.env once)
└── commands/               Command/keyboard registry (feeds palette + shortcuts)
    ├── registry.ts
    └── useCommand.ts
```

> **`store/` (as-built, M1):** this folder postdates the original design. Panel
> geometry and palette visibility are read by both the shell and, later, feature
> screens, so the store sits in `shared/` rather than in `app/`. The hard rule
> from [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) §4 still governs it: no
> server data and nothing the URL owns may enter this store.
>
> **`api/resource.ts` (as-built, M2):** the *resource layer* generalization landed
> in M2 rather than being extracted in M3. Justification: the backend's four
> entity routers/services/repositories are byte-for-byte parallel — a **verified
> fact** in [../REPOSITORY_ANALYSIS.md](../REPOSITORY_ANALYSIS.md), not a
> prediction — so `createEntityResource` encodes a known contract (CRUD verbs,
> offset pagination, PATCH-diff semantics) rather than a guess. The
> *UI* generalization (`entity-kit`, descriptors) is unchanged: it stays deferred
> to M3/M4, because UI shape is exactly what the backend has *not* already proven
> uniform. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) M2/M3 as-built
> notes.
>
> **`lib/invariant.ts` not built:** listed in the original design, never needed.
> Per the promotion rule, it is added when a second caller wants it.

- **Purpose:** the small, stable core every feature leans on.
- **Why `ui/` vs `ui/composite/` split:** `ui/` holds *unopinionated* shadcn
  primitives (Radix behaviour + tokens); `composite/` holds *app-opinionated*
  reusable components assembled from them (a `DataTable` is ours, `Button` is
  generic). This keeps the "regenerate a primitive" path clean and separates
  vendor surface from product surface.
- **Why `entity-kit/` is shared, not a feature:** it is the reusable machinery the
  four entity slices instantiate; it must know the *shape* of an entity but no
  specific entity. This is the single most important DRY boundary in the app.
- **Why `api/` is centralized:** exactly one network choke point (transport +
  error normalization + auth seam + query-key registry). Everything about talking
  to the backend — including the two-error-shape reconciliation and the `hasMore`
  policy — is inspectable in one folder.
- **Why `commands/` exists:** keyboard-first is a product principle; a single
  registry makes every action reachable by palette and hotkey without per-component
  wiring (architecture §6, D10).
- **The promotion rule (governs this whole folder):** code enters `shared/` **only
  on its second real consumer.** Until then it stays feature-local. This is the
  guardrail against speculative abstraction (KISS) while still enabling DRY.

---

### 3.5 `src/styles/` and `src/types/`

```
styles/
├── globals.css            Tailwind layers, base resets, CSS-variable token defs
└── tokens.css             Dark-theme design tokens (color, space, radius, motion)

types/
├── env.d.ts               Typed import.meta.env (VITE_API_BASE_URL, …)
└── global.d.ts            Ambient module shims if needed
```

- **`styles/tokens.css` — purpose:** the *single* definition of the dark palette
  and scale as CSS variables. **Why:** Tailwind and shadcn both read these
  variables, so there is one place to tune the entire look; components never
  hardcode a color. Dark-only means one token set, no theme-switch machinery.
- **`types/env.d.ts` — why:** makes client config strongly typed at the boundary,
  so a missing `VITE_API_BASE_URL` is a compile-time signal, not a runtime
  `undefined`.

---

## 4. Naming & convention rules (frontend)

Chosen to be internally consistent and to sit cleanly beside the backend's
snake_case Python without importing its casing into the browser code.

| Kind | Convention | Example |
|---|---|---|
| Folders | kebab-case | `entity-kit/`, `graph/render/` |
| React component files | PascalCase | `EntityListView.tsx` |
| Hook files | camelCase, `use`-prefixed | `useEntityMutations.ts` |
| Non-component modules | kebab or camel, `.role.ts` suffix | `character.schema.ts`, `http-client.ts` |
| Types / components | PascalCase | `EntityDescriptor`, `ApiError` |
| Variables / functions | camelCase | `listCharacters` |
| Constants / enums values | UPPER_SNAKE only where mirroring wire | `REL_TYPE.MEMBER_OF` |
| Zod schema exports | `<Entity><Role>Schema` | `CharacterCreateSchema` |
| Inferred types | `<Entity><Role>` | `type CharacterCreate = z.infer<…>` |

- **Wire boundary rule:** snake_case exists *only* inside `*.schema.ts` mapper
  functions and resource request builders; everywhere else is camelCase. This is
  the anti-corruption boundary from architecture §5, made physical.
- **Import boundary rule:** features import from `@/shared/*` and their own folder
  only; never from another feature's internals — only its `index.ts`.

---

## 5. Why this structure satisfies the engineering principles

- **SOLID / SoC:** each folder has one reason to change; the resource/query/schema/
  ui split gives single-responsibility layers; `index.ts` gates enforce interface
  segregation; the descriptor engine inverts dependencies (generic code depends on
  the `EntityDescriptor` abstraction, not concrete entities).
- **DRY:** `entity-kit/` collapses four parallel CRUD stacks into one; `shared/api`
  centralizes transport and error logic once.
- **KISS:** the promotion rule and "no second cache" rule prevent over-engineering;
  native fetch and an in-house command registry keep the dependency surface small.
- **Composition over inheritance:** everything is composed (descriptors +
  generic components + slots), no class hierarchies.
- **Scalability & maintainability:** new capability = new slice; churn is localized;
  the graph/AI weight is quarantined behind lazy routes and interfaces.
