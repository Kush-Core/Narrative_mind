# Implementation Plan — Narrative Mind Frontend

> Planning document. **No implementation is performed here.** An incremental
> roadmap of milestones. Each milestone lists Objective, Deliverables,
> Dependencies, Risks, and estimated Git commit scope. Grounded in the backend
> contract ([../REPOSITORY_ANALYSIS.md](../REPOSITORY_ANALYSIS.md)) and the design
> docs in this folder. **Execution awaits explicit approval.**

---

## Sequencing principle

Build the **spine before the features**: transport + schema + shell first, then one
concrete entity end-to-end, then *generalize* into the entity engine, then fan out
the remaining entities cheaply, then the specialized surfaces (relationships,
graph), then polish. Abstraction (the entity engine) is introduced only after one
concrete entity reveals the true seam — avoiding speculative generalization (KISS).

"Commit scope" is an estimate of coherent commits, not a schedule. Each milestone
is independently reviewable and leaves the app in a working state.

---

## M0 — Workspace bootstrap & toolchain

- **Objective:** A running, strictly-typed, dark-themed empty app under
  `frontend/`, wired to the backend origin.
- **Deliverables:**
  - Vite + React + TypeScript (strict) project; `@/*` path alias.
  - Tailwind + shadcn/ui initialized; `components.json`; dark token set
    (`styles/tokens.css`) as the single visual contract.
  - ESLint (typed, import-order, a11y) + Prettier; the folder skeleton from
    [FRONTEND_FILE_STRUCTURE.md](./FRONTEND_FILE_STRUCTURE.md) (empty slices,
    reserved `ai/` and `routes/guards/`).
  - `.env.example` with `VITE_API_BASE_URL`; typed `import.meta.env`.
  - `AppRoot` mounting a placeholder shell.
- **Dependencies:** none (backend already runs on `:8000`, CORS allows `:5173`).
- **Risks:** stack version-compatibility drift (Tailwind/shadcn majors) — pin
  mutually-compatible latest versions at this step and record them. Low overall.
- **Commit scope:** ~3–5 (scaffold, tokens/theme, lint/format, providers).

> **M0 as-built notes (2026-07-18):** the `/health` "backend connected" check
> originally listed here moved to M1 (it belongs with the live StatusBar wiring,
> and the foundation phase was scoped to zero API requests). Tailwind v4 is
> configured CSS-first (no `tailwind.config.ts`). Recorded foundation versions:
> React 19.2 · Vite 8.1 · TypeScript 6.0 · Tailwind 4.3 · React Router 7.18 ·
> TanStack Query 5.101 · ESLint 9.39 (v10 exists but `eslint-plugin-jsx-a11y`
> does not yet support it) · shadcn/ui new-york style on the consolidated
> `radix-ui` package.

---

## M1 — App shell & navigation

- **Objective:** The persistent desktop chrome and route skeleton — the app *feels*
  like the product before it holds real data.
- **Deliverables:**
  - `WorkspaceLayout` (resizable explorer | main | optional aux), `ExplorerSidebar`,
    `CommandBar`, `StatusBar` (live `/health` + environment — includes the
    "backend connected" wiring proof moved here from M0).
  - React Router route tree in `src/routes/` with lazy feature routes, `paths.ts`
    typed builders, not-found + error elements, `AppErrorBoundary`.
  - Command/keyboard registry (`shared/commands/`) + `CommandPalette` (Cmd/Ctrl-K)
    with a few real commands (navigate, focus search).
  - Zustand UI store (panel sizes, sidebar collapse, palette open).
- **Dependencies:** M0.
- **Risks:** over-investing in chrome before data exists (time sink); resizable-
  panel + keyboard focus-management edge cases. Mitigate by keeping panels/commands
  minimal now and expanding in M8.
- **Commit scope:** ~4–6 (layout, routing+paths, error boundary, command registry
  + palette, status bar).

> **M1 as-built notes (2026-07-18):** the live `/health` StatusBar wiring listed
> here **moved to M2** — the shell milestone was scoped to zero network requests,
> and the indicator belongs with the network spine that feeds it. M1 shipped the
> StatusBar's full four-state display contract driven by a prop; M2 supplied the
> query. Also as-built: a `shared/store/ui-store.ts` Zustand store (persisted
> panel geometry), a `RoutePlaceholder` element so every navigation destination
> is walkable before its slice exists, and `app/shell/navigation.ts` as the single
> navigation model projected by the sidebar, breadcrumbs, and palette. The
> `CommandProvider` mounts inside `WorkspaceLayout` rather than `AppRoot`, because
> it needs router context to navigate.

---

## M2 — API & schema foundation

- **Objective:** The complete, tested network spine — every backend quirk absorbed
  in one place — with **no feature UI yet**.
- **Deliverables:**
  - `httpClient` (fetch wrapper: base URL, JSON, `AbortSignal`, timeout, auth seam).
  - `ApiError` + both-shape normalizer (domain envelope **and** FastAPI `detail[]`).
  - Shared Zod primitives: `Page<T>` **with client-derived `hasMore`**, error
    schemas, id/isoDate.
  - Zod schema sets + wire↔domain mappers for all four entities (Base/Create/
    Update/Read), including read-only `display_name` handling.
  - QueryClient factory (retry predicate: no-retry-on-4xx; placeholderData policy)
    and the central query-key registry.
  - MSW-based mocks so this layer is testable without a live backend (mirrors the
    backend's `_FakeLLM`/`_StubLLM` stubbing ethos).
- **Dependencies:** M0. (Independent of M1 — can proceed in parallel.)
- **Risks:** **highest-value, gotcha-dense milestone.** The two 422 shapes, the
  `has_more` omission, `exclude_none`/empty-update PATCH semantics, and snake↔camel
  mapping all live here. A mistake propagates everywhere. Mitigate with focused unit
  tests per gotcha (documented in [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md) §3).
- **Commit scope:** ~5–7 (http-client, error normalizer, page/error schemas,
  per-entity schemas+mappers, query-client+keys, MSW mocks/tests).

> **M2 as-built notes (2026-07-18):**
>
> - **Per-entity schemas + mappers moved to M3.** This milestone was scoped to
>   *reusable infrastructure only*, so the four entity schema sets ship with their
>   slices instead. What landed in their place is the machinery they plug into:
>   `createEntityResource` (generic CRUD resource factory), `listParamsSchema`
>   (the shared list contract, narrowed per entity), `entityKeys` (per-collection
>   query keys), and the invalidation policy. Each entity slice is now a schema
>   plus four small mapper functions.
> - **`system` slice added** as the reference implementation of
>   schema→api→queries, and to complete M1's deferred `/health` wiring. It
>   validated the whole spine end to end against a live server.
> - **Error handling split in two:** `api-error.ts` *classifies* failures;
>   `error-presentation.ts` *routes* them (field / inline / toast / silent). Failed
>   mutations toast centrally through the `MutationCache`, with a
>   `meta.suppressErrorToast` opt-out for forms that show errors inline.
> - **Schema validation moved into the HTTP client.** Passing a schema to a
>   request is what makes the resource layer's return type trustworthy; a schema
>   mismatch surfaces as a distinct `parse` ApiError rather than leaking a Zod
>   error, preserving the one-error-type guarantee.
> - **Recorded versions:** Zod 4.4 · Vitest 4.1 · MSW 2.15.
> - **Tests:** 71 covering each documented gotcha — the two 422 shapes, the
>   `has_more` omission, empty-PATCH rejection, changed-fields-only diffing,
>   timeout/abort/parse normalization, and the auth seam.

---

## M3 — First entity concrete, then the entity engine (Characters)

- **Objective:** Ship Characters fully as a *concrete* vertical, then extract the
  generic `entity-kit` from it — proving the abstraction against reality.
- **Deliverables:**
  - `characters` slice: resource fns, query/mutation hooks, list + detail pages.
  - List: URL-driven filters/sort/pagination (`status` filter, valid sort fields
    only), `DataTable`, empty/error/loading states, keep-previous pagination.
  - Detail + create/edit `EntityForm` (RHF+Zod), delete via `ConfirmDialog`,
    optimistic detail patch + list invalidation, `fieldErrors`→form mapping,
    changed-fields-only PATCH.
  - **Extraction step:** generalize into `EntityDescriptor` + `EntityListView`/
    `EntityDetailView`/`EntityForm`/`useEntityListQuery`/`useEntityMutations`, with
    Characters re-expressed as the first descriptor (+ a relationships slot stub).
- **Dependencies:** M1 (shell/routes), M2 (network/schemas).
- **Risks:** **over-abstraction** — extracting too early or too rigidly. Mitigate by
  building concrete first and only lifting what a second entity (M4) will truly
  share; keep entity-specifics in slots, never engine conditionals.
- **Commit scope:** ~6–8 (resource+queries, list, detail, form/create, edit/delete,
  optimism/invalidation, engine extraction).

> **Scope note after M2:** the extraction step here is now **UI-only**. The
> resource and query-key layers were generalized in M2 against the backend's
> verified symmetry, so Characters starts by *instantiating*
> `createEntityResource` + `entityKeys` rather than hand-rolling them. The
> concrete-first discipline still applies where it matters — the list/detail/form
> UI is built for Characters specifically, and only generalized once Locations
> (M4) shows the real seam. M2's abstraction gets its first real consumer here;
> if Characters reveals it does not fit, fixing it is cheap and localized because
> nothing else depends on it yet.

> **M3 as-built notes (2026-07-18):**
>
> - **M2's resource abstraction fit unchanged.** `createEntityResource` needed no
>   modification to serve Characters; the slice's `api/` module is 25 lines.
> - **`entity-kit` built descriptor-first, not extracted.** The plan called for
>   building Characters concretely and then extracting. In practice the
>   descriptor contract was written first and Characters expressed through it
>   immediately, because M2 had already proven where the seams are (resource,
>   keys, list params) and a concrete-then-refactor pass would have produced the
>   same result with an extra rewrite. **The risk this trades into M4 is real and
>   accepted:** the descriptor has exactly one consumer, so Locations may reveal
>   gaps. The guardrail holds — entity specifics enter only through descriptor
>   data and slots, and `entity-kit/` contains no per-entity conditional.
> - **`EntityFormDialog` added** to the kit (not in the original component
>   hierarchy). Create and edit differ only in seed values and which mutation
>   runs, so hosting both in one component makes "editing reuses the creation
>   form" structural rather than conventional.
> - **Optimism, decided:** create and delete are *not* optimistic (both shift
>   `total` and page membership); update patches the detail key only. An
>   unchanged save issues **no request at all** and says so.
> - **Routing:** feature routes use React Router's own `lazy` route property
>   rather than `React.lazy` + `Suspense` — the router keeps the current view on
>   screen while the next chunk loads, a better transition than a fallback.
> - **Deferred deliberately:** component-level tests need jsdom +
>   Testing Library. Logic is covered by 107 unit/integration tests, and the UI
>   flows were verified by driving a real browser against a faithful API stub.
>   Component tests are a candidate for M8.
> - **Recorded versions:** React Hook Form 7.82 · @hookform/resolvers 5.4 ·
>   TanStack Table 8.21.

---

## M4 — Fan out remaining entities via descriptors (Locations, Factions, Events)

- **Objective:** Add three entities at near-zero marginal cost, validating the
  engine and its escape hatches.
- **Deliverables:**
  - `locations` (region filter), `factions` (ideology filter), `events`
    (`timeline_order` field + sortable column, no categorical filter) — each as a
    descriptor + thin pages.
  - Any engine refinements the three reveal (fed back cleanly, no per-entity `if`s).
  - Explorer sidebar shows all four entity groups with live counts.
- **Dependencies:** M3 (the engine).
- **Risks:** discovering the abstraction leaks (an entity needs something the
  descriptor can't express) → resolve by extending the descriptor contract or adding
  a slot, not by branching the engine. Exact-match `region`/`ideology` filtering
  with no distinct-values endpoint may feel limited → position `name_contains` as
  primary search; note as a backend enhancement candidate.
- **Commit scope:** ~3–5 (one per entity + engine touch-ups).

> **M4 as-built notes — Locations (2026-07-19).** Factions and Events still to come.
>
> - **The engine held.** Locations needed **no** new list, detail, form, dialog,
>   pagination, search, or mutation code. The slice is a schema, a resource module
>   (8 lines of configuration), a descriptor, two ~30-line pages, and one badge
>   component. The lazy chunk is 3.9 kB against Character's 5.4 kB.
> - **The gap M3 predicted was real, and it was the filter.** `EntityFilterSpec`
>   assumed every categorical filter is a closed enum, because `status` — its only
>   consumer — is one. `region` is free text the backend matches by equality. Fixed
>   by making the spec a discriminated union on `kind` (`"select" | "text"`), not by
>   branching the engine (see COMPONENT_HIERARCHY.md §5).
> - **A second leak, found while fixing the first:** `useUrlListState` hardcoded
>   `status`/`region`/`ideology` in its paging-reset set — per-entity knowledge in a
>   shared hook, the same smell the entity engine forbids. Filter keys are now
>   passed in from the descriptor (see STATE_MANAGEMENT.md §URL state).
> - **Both fixes were additive.** Character's descriptor gained one line
>   (`kind: "select"`); no public interface broke.
> - **`boundedTextSchema(max)` extracted** in `shared/schemas/primitives.ts`. The
>   backend's optional text fields differ only in their bound (`region` ≤120,
>   `ideology` ≤500, `description` ≤2000), so `LongTextSchema` became one call of it
>   — and Faction's `ideology` is already served.
> - **No `detail` slot needed.** Character used one for `AliasList`; Location has no
>   equivalent, confirming slots are genuinely optional rather than load-bearing.
> - **Verified against the live stack** (FastAPI + Neo4j, not mocks): create, read,
>   search, region filter, sort, two-page pagination, partial update, clearing a
>   field with `""`, delete, and the subsequent 404 — plus 28 new mocked
>   unit/integration tests (140 total).

> **M4 as-built notes — Factions + consolidation (2026-07-19).** Events still to come.
>
> The milestone had two goals: ship Faction, and consolidate what three parallel
> entities had revealed. Faction itself required **no new infrastructure** — it is
> a schema, an 8-line resource config, a descriptor, and two 3-line pages.
>
> **What was consolidated, and why each earned it:**
>
> - **`EntityListPage` / `EntityDetailPage`** — the per-entity pages were
>   byte-identical apart from the entity name. ~200 lines across three slices
>   became ~120 shared, and the delete confirmation now titles itself with
>   `getTitle` rather than assuming a `name` field.
> - **`entity-kit/columns.tsx`** — the name / truncated-text / created-at columns
>   and the created-at / identifier meta rows were written out in every
>   descriptor. Now builders; the two genuinely distinct cells (Character's alias
>   sub-label, Location's region badge) stay hand-written, which is the escape
>   hatch working as intended.
> - **`shared/schemas/wire.ts`** — `emptyToNull` was duplicated verbatim, and each
>   update mapper was a hand-rolled `if (x !== undefined)` chain. `pickDefined`
>   replaces the chain with an explicit writable-field allow-list, making the
>   "never echo `display_name`" rule structural (gotcha #5).
> - **`entityRoutes()` in the router** — four near-identical lazy blocks became one
>   helper, and the `:id` param name now comes from a shared constant that
>   `EntityDetailPage` reads. Previously a `:factionId` typo would compile, route,
>   and fail at runtime.
>
> **What was deliberately *not* consolidated:** the entity schemas. They are the
> anti-corruption boundary, their bounds and comments are entity-specific
> knowledge, and a schema-generating factory would trade clarity for line count.
>
> **A regression caught by checking the build, not the types.** Importing the
> shared `:id` constant from `EntityCrudPages` pulled the entire entity-kit
> (~137 kB) out of its lazy chunk into the eager bundle — typecheck, lint, and
> all 180 tests passed while initial load grew 22%. The constant moved to a
> dependency-free leaf module (`entity-kit/route-params.ts`, which carries a
> comment saying why it must stay that way) and the chunk split was restored.
> Bundle output is now part of the verification checklist.
>
> **Net effect on the slices:** characters 5.42 kB → 3.90 kB, locations 3.89 kB →
> 2.52 kB, factions 2.37 kB — each entity is now mostly declaration.
>
> **Verified against the live stack:** full Faction CRUD (create, read, search,
> ideology filter, sort, two-page pagination, partial update, clear-with-`""`,
> delete, 404), plus explicit regression checks that the retrofitted Character and
> Location still dedupe aliases, map nulls, clear with `""`, and never echo
> `display_name`. 40 new mocked tests (180 total).

> **M4 as-built notes — Events (2026-07-19). M4 complete: all four entities shipped.**
>
> Event was expected to be the smallest slice. It was the smallest *feature* but
> the most informative, because it is the first entity that does not fit the
> shape the other three share, and it surfaced **three latent defects** in
> abstractions that had looked settled.
>
> **Where Event differs from Character / Location / Faction:**
>
> - `timeline_order` is the first **numeric** field, and the first that is
>   *required with a default* rather than optional-and-nullable. It does not go
>   through `emptyToNull` — zero is a real position, not "unset".
> - It is the first field whose **wire name differs from its app name**.
> - Event is the only entity with **no categorical filter**; the descriptor omits
>   `filter` and `EntityListView` renders search alone, with no engine change.
> - Its default sort is `timeline_order`, not `name` — chronological order is how
>   a timeline is read. `listParamsSchema` already took the default from the first
>   sortable field, so this was declaration, not code.
>
> **Three defects found, all pre-existing and all invisible until Event:**
>
> 1. **`pickDefined` assumed form keys equal wire keys.** True for three entities
>    by coincidence. `timelineOrder` would have been sent verbatim, not matched
>    any backend field, and been dropped by `exclude_none` — a PATCH returning 200
>    having changed nothing. Fixed by snake-casing allow-listed keys in the helper
>    (API_INTEGRATION_PLAN.md §3).
> 2. **`valueAsNumber` maps an emptied number input to `NaN`.** That fails
>    validation with an unreadable message, and `NaN !== NaN` means the update
>    diff would see a change on every save and send a value that serializes to
>    `null` and is then silently dropped. `EntityForm` now uses `setValueAs` to
>    map blank to `undefined`, so the schema reports a missing required value.
> 3. **`listParamsSchema`'s filter default carried a string index signature**
>    (`Record<string, never>`), which collapsed every inferred param type to
>    `never` for any entity passing no filters. Event is the only such entity, so
>    it had never been exercised. Fixed to `Record<never, never>`; a compile-time
>    guard in `event.schema.test.ts` keeps it fixed, since the bug was invisible
>    at runtime.
>
> **Narrative readiness (prepared, not implemented).** `EntityDetailView` now
> renders **Details → slot → Record** rather than putting the system record above
> entity substance. Timeline position is first-class — default sort, leading
> column, detail subtitle — so a future timeline view reads the same
> `timelineOrder` and the same `sort_by=timeline_order` query this module already
> issues. Participants, locations, factions, and AI annotations attach as further
> sections in the existing slot. Nothing was stubbed for them.
>
> **Verified against the live stack:** full Event CRUD, plus the two checks the
> mocks cannot make — that `sort_by=timeline_order` genuinely orders differently
> from `sort_by=name`, and that a PATCH of the renamed key **persists on re-read**
> rather than merely being echoed. 45 new tests (225 total).

---

## M5 — Relationships (Character-rooted graph writes)

- **Objective:** Let writers connect entities, honoring the exact backend contract.
- **Deliverables:**
  - `CharacterRelationshipEditor` in the Character detail slot: `rel_type` ∈
    {KNOWS, MEMBER_OF, LOCATED_IN, PARTICIPATED_IN}; `EntityPicker` target select;
    `sentiment` shown only for `KNOWS`.
  - Valid target-type guidance per rel (MEMBER_OF→Faction, LOCATED_IN→Location,
    PARTICIPATED_IN→Event, KNOWS→Character) while tolerating the backend's
    non-enforcement of target type.
  - Resource fn + mutation for `POST /characters/{id}/relationships`; 404/422
    handling (target-not-found, invalid rel type) surfaced inline.
- **Dependencies:** M4 (entities to link; `EntityPicker` uses their list APIs).
- **Risks:** backend does **not** enforce target type or return the full edge set
  (no "list relationships" endpoint exists) — the UI can create edges but cannot
  *read them back* except via the graph network endpoint. Mitigate by sourcing the
  character's current relationships from `GET /graph/characters/{id}/network?depth=1`
  and documenting the read limitation.
- **Commit scope:** ~3–4 (picker, editor, mutation+errors, network-backed read).

---

## M6 — Graph explorer (isolated, lazy, pluggable renderer)

- **Objective:** Visualize and traverse the world graph without taxing the rest of
  the app.
- **Deliverables:**
  - `graph` slice: ego-network view (depth `1..3` control) and shortest-path finder
    (two pickers → hops + distance).
  - `GraphRenderer` interface + one concrete renderer behind it; the whole slice is
    `React.lazy`-loaded.
  - Node styling by entity-type accent tokens; click-through to entity detail.
- **Dependencies:** M4 (entities), M5 (relationships give the graph content).
- **Risks:** **visualization is the heaviest, riskiest surface** — library choice,
  performance on larger graphs, and layout quality. Mitigate: the renderer interface
  quarantines the library (swap in isolation); cap/clamp to the backend's depth
  `≤3` and path length `≤6`; start with modest graphs. Keep graph *algorithms*
  server-side (out of scope for the client).
- **Commit scope:** ~4–6 (slice+queries, renderer interface, concrete renderer,
  ego view, shortest-path, lazy wiring).

---

## M7 — World overview & global search

- **Objective:** A meaningful landing surface and cross-entity discovery.
- **Deliverables:**
  - `OverviewPage`: world summary (entity counts, recent items), entry points into
    each entity and the graph — not an empty dashboard.
  - Command-palette **global search**: fan-out `name_contains` across entities
    (bounded, debounced), routing to results. Built against today's substring
    filter, ready to re-point at a future search endpoint with no UI change.
- **Dependencies:** M4 (entity lists), M1 (palette).
- **Risks:** fan-out search issues N parallel requests and only does substring
  matching (no relevance/full-text) — set expectations, bound concurrency, cache
  aggressively; flag a real search endpoint as the future upgrade.
- **Commit scope:** ~3–4 (overview, counts, palette search, result routing).

---

## M8 — Polish, keyboard, accessibility, motion

- **Objective:** Bring the app to the intended professional, desktop-class finish.
- **Deliverables:**
  - Full keyboard map (navigation, create, search, delete-with-confirm, panel
    toggles) registered as commands + `Kbd` hints throughout.
  - State-communicating transitions (panel, route cross-fade, list reflow,
    optimistic settle) via motion tokens; no decorative motion.
  - Accessibility pass (focus order, roles, contrast against tokens, escape/return
    focus), empty/error/loading consistency, responsive-within-desktop behavior.
  - Performance pass (code-split verification, memoization of hot lists, query
    `staleTime` tuning).
- **Dependencies:** all prior.
- **Risks:** scope creep in polish; regressions from broad tweaks — gate with the
  test suite from M2 onward and review per surface.
- **Commit scope:** ~5–8 (keyboard, motion, a11y, empty/error states, perf).

---

## Deferred / out-of-scope seams (built only when approved)

These are explicitly **not** in the milestones above; the architecture leaves each
a correctly-shaped, inert seam (see [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) §7):

- **Authentication/authorization** — `AuthTokenProvider`, 401 policy,
  `routes/guards/`, cache-reset-on-identity. Out of scope.
- **AI surfaces** (`/ai/describe`, `/ai/extract`) — an `ai` slice + form/panel
  slots. Out of scope now; endpoints already exist for a later milestone.
- **Multi-world / projects** — `worldId` key-prefix + path segment. Requires a
  backend change first.
- **Real-time / bulk ops** — push-invalidation and batch flows. No backend support
  today.
- **CI/CD, Docker, monitoring, analytics** — out of scope per the brief.

---

## Cross-cutting risk register

| Risk | Where | Likelihood | Mitigation |
|---|---|---|---|
| Backend serialization gotchas mishandled (`has_more`, dual-422, `exclude_none`) | M2 | Med | Centralize in schema/error layer; unit-test each gotcha with MSW |
| Over-abstraction of the entity engine | M3–M4 | Med | Concrete-first; extract on 2nd consumer; slots not branches |
| Graph visualization performance/library risk | M6 | Med-High | Renderer interface; clamp depth/length; lazy-load; modest graphs first |
| Relationships readable only via graph endpoint | M5 | Med | Source current edges from network(depth=1); document limitation |
| Exact-match categorical filters, no distinct-values endpoint | M4/M7 | Low-Med | `name_contains` as primary search; note backend enhancement |
| Stack version incompatibility (Tailwind/shadcn/RSC majors) | M0 | Low | Pin compatible latest at bootstrap; record versions |
| Chrome-before-data time sink | M1 | Low | Keep shell minimal until M3; finish in M8 |

---

## Definition of done (per milestone)

Type-checks under strict TS · lint/format clean · the milestone's user-visible flow
works against the running backend (or MSW where noted) · no server data duplicated
outside the Query cache · new UI has empty/error/loading states · keyboard-reachable
where applicable. The app remains runnable and reviewable at every milestone
boundary.
