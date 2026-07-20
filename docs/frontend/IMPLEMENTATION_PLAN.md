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

> **M5 as-built notes — Relationship management (2026-07-19).** Built *after*
> M6, which changed what it should be.
>
> **The backend fact that shaped the feature.** Relationship writes are rooted at
> a Character by the Cypher itself — `MATCH (source:Character {id: $source_id})`
> — so a Faction or Event id as source matches nothing and 404s. The requirement
> was an entry point on all four detail screens with the source prefilled, but on
> three of them "the entity you opened from" *cannot* be the source. So the
> pinned entity carries a **role**: source from a Character, target from
> everything else. One end is always prefilled; which end follows the data model
> rather than the screen. `relationshipRoleFor()` states this once, next to the
> backend fact that forces it.
>
> A consequence worth noting: because each relationship type points at a distinct
> entity kind, a pinned *target* admits exactly one type. From a Faction page the
> type control is settled, not offered — there is nothing to choose.
>
> **Not `CharacterRelationshipEditor`.** M5 was specified as a Character-specific
> component in the Character detail slot. That was right when only Characters
> could host the affordance; it is wrong now that all four screens do. The
> component is generic (`shared/relationships/`), imports no feature slice, and
> the four descriptors reach it through their existing `detail` slot — so
> `entity-kit/` still contains no per-entity branch, and a fifth entity type
> would need no change here.
>
> **The dependency cycle, and how it was avoided.** The dialog is consumed by all
> four entity slices, so it cannot import them — `characters → dialog → picker →
> characters` would close a loop. A picker needs far less than a descriptor
> carries, though: an id, a name, and a search, which is identical across four
> byte-for-byte parallel list endpoints. `shared/api/entity-lookup.ts` expresses
> exactly that with no feature import, and the cycle never forms. The cost is a
> second, smaller Zod schema for data the entity schemas already validate — a few
> lines against a structural cycle.
>
> **`EntityPicker` was promoted, as predicted.** `GraphSourcePicker` carried a
> note saying it would stay feature-local "until the relationship editor lands
> and shows what a general `EntityPicker` really needs". It landed, the two
> wanted the same component, and `GraphSourcePicker` is now a nine-line binding
> that no longer reaches into the characters slice at all.
>
> **Relationships are created here and read in the graph.** No endpoint returns
> an entity's relationships; the nearest thing is the Character-rooted ego
> network. A per-entity list could therefore be built for Characters and for no
> one else, and three screens showing a section the fourth lacks would read as a
> bug rather than as the backend asymmetry it is. So the section owns creation,
> the graph owns reading, and the write invalidates the graph cache so the new
> edge is there on arrival. **This is the top remaining backend gap for this
> feature:** a node-rooted network endpoint would make per-entity relationship
> lists worth building.
>
> **A bug only the browser could catch.** The pickers were wired
> `aria-labelledby={describedBy}` — pointing a control's *name* at its
> description. The accessible name of the target picker became "Choose a
> relationship type first." Typecheck, lint, and the unit suite all passed; a
> Playwright strict-mode violation on an ambiguous role query is what surfaced
> it. Now `id` (which `FormField`'s `<Label htmlFor>` targets) names the control
> and `aria-describedby` describes it.
>
> **Verified in a real browser** (Chrome via Playwright, backend + Neo4j live):
> all four detail screens offer the section and open the dialog with the right
> end pinned and the type control settled or open as appropriate; a relationship
> created from a Character page and one created from a Location page both reach
> the database with the roles correct; submit stays disabled until both ends are
> chosen; the review line reads as a sentence; the graph shows the new edge
> without a reload; **zero console errors**. 30 new tests (310 total), plus 4 new
> backend tests (31 total).
>
> **Not built, by instruction:** relationship editing, deletion, drag-to-connect,
> inline edge manipulation, and any graph-side creation entry point. The dialog
> *supports* an unanchored two-picker mode — that is the "choose a source entity"
> step of the specified workflow — but nothing wires it up; it is what a future
> graph entry point would use.

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

> **M6 as-built notes — Graph explorer (2026-07-19).**
>
> **The boundary decision.** The graph reuses *application* infrastructure
> (`httpClient` + `ApiError`, TanStack Query and its pre-reserved `graph` key
> namespace, Zod, the design system, routing) and reuses **none** of the entity
> engine. The test applied throughout: *would a non-CRUD feature still need this?*
> `createEntityResource`, `EntityDescriptor`, and `listParamsSchema` all failed it
> — bending the graph through them would mean inventing pagination and form fields
> for a thing that has neither. The graph is a **peer** of the entity engine, not
> a consumer of it. Structure in COMPONENT_HIERARCHY.md §6b.
>
> **The backend constraint that shaped the whole module.** The ego-network
> endpoint returns *reachable nodes and no relationships whatsoever* — no edge
> list, no rel types, no indication of which neighbour is adjacent to which:
>
> ```cypher
> OPTIONAL MATCH (c)-[*1..N]-(n)
> RETURN c {.id,.name} AS center, collect(DISTINCT n {.id,.name,labels:labels(n)}) AS neighbors
> ```
>
> At depth 1 every neighbour is adjacent by definition, so centre→neighbour edges
> are facts and are drawn. At depth > 1 the response mixes one-, two-, and
> three-hop nodes indistinguishably, so drawing those edges would **assert
> relationships that were never reported**. The module therefore draws none beyond
> depth 1, marks the nodes as unlinked, and says so in the UI. `edgesAreComplete`
> travels on the model so renderer and notice cannot disagree.
>
> Verified against live data: depth 1 returned 5 genuinely-adjacent neighbours;
> depth 2 returned 7 nodes — including one 2 hops away — with zero relationship
> data of any kind.
>
> **This is the top backend enhancement candidate.** If the endpoint projected
> relationships, only `services/build-graph-model.ts` would change; the model,
> renderer, and components are already shaped for a real edge list.
>
> > **Resolved (M5, 2026-07-19) — and the prediction held.** The endpoint now
> > projects the induced subgraph. The client changes were
> > `services/build-graph-model.ts` (use the edge list; keep the depth-1
> > inference as a fallback for a backend that reports none), the Zod schema, and
> > two lines of the model type. The renderer, the canvas, the interaction state,
> > and the workspace were untouched — which is what the engine boundary was for.
> >
> > Two follow-on changes the real data forced. Edge **identity** now includes
> > the relationship type: two nodes can be joined by several types, and
> > `source->target` alone would have silently collapsed `MEMBER_OF` into
> > `KNOWS`. And edge **labels** were tried always-on and reverted to
> > selection-only — Cytoscape does no label-collision avoidance, so a 19-edge
> > ego network rendered a thicket of overlapping `PARTICIPATED_IN` strings
> > across the nodes they described. They were also largely redundant: each
> > relationship type points at a distinct entity kind, so the target node's
> > colour already tells a reader which type an edge is.
> >
> > Measured on the seeded world, centred on one character: depth 1 went from 8
> > inferred untyped edges to 19 typed ones; depth 2 from **zero** edges and a
> > "we cannot tell you" notice to 51 typed edges. The notice is gone.
>
> **A rendering bug only the browser could catch.** Design tokens are authored in
> `oklch()`. Cytoscape's colour parser handles hex/rgb/hsl/named only, so every
> token silently failed to parse and **every node painted grey while the DOM
> legend beside it showed the correct colours** — a graph that looked plausible
> and was wrong. Typecheck, lint, and 272 tests all passed on that build.
>
> The first fix was also wrong: Chrome *preserves the authored colour space*
> through `getComputedStyle().color` **and** through `ctx.fillStyle` readback, so
> a probe element returns `oklch(...)` too. The working approach is to rasterize
> one pixel and read the sRGB channels back — the engine's own conversion. This
> path cannot be unit-tested (jsdom does not resolve `var()`, and a mocked
> assertion would have passed on the broken build), so it is deliberately verified
> by driving a real browser instead.
>
> **Layouts, explicitly deferred.** Cytoscape needs *some* initial positioning or
> every node stacks at the origin. `concentric` is used because it is the correct
> shape for an ego network specifically and is deterministic; it is initial
> positioning, not a layout system. Layout *choice* becomes an argument to one
> object when it becomes a feature.
>
> **Not built, by instruction:** relationship create/delete, drag-to-connect,
> editing, layout selection, timeline sync, AI, collaboration. Also not built:
> the shortest-path view — its endpoint returns `hops`, a genuine ordered path
> with real consecutive edges, and it would be a second `build*Model` function
> feeding the same canvas. It was left out rather than shipping a data layer with
> no UI.
>
> **Verified in a real browser** (Chrome via Playwright, backend + Neo4j live):
> Cytoscape initializes; 6 nodes and 5 edges render with correct per-kind colours
> and legible labels; zoom via buttons *and* wheel; pan by drag (canvas pixels
> change); node selection populates the inspector; background click deselects;
> fit and reset re-frame; the depth-2 notice appears; **zero console errors**.
> 47 new tests (272 total).

---

> **UI consistency audit (2026-07-19).** A polish pass across all nine screens
> at 1440 / 1024 / 860 / 720 / 600px, measured from the DOM rather than eyeballed.
> No redesign; every fix landed in a shared component.
>
> **The serious one was a layout bug, not a cosmetic drift.** The workspace's
> panel row is a grid item, and a grid item defaults to `min-width: auto` — so it
> sized to the panel group's min-content (~1100px) while the grid clipped the
> overflow. Below roughly 1100px, **every screen's right-hand controls were
> silently cut off**: "New character" and the pagination arrows were invisible and
> unreachable at 1024px, a common laptop width. One `min-w-0` fixed all of it.
> Nothing catches this but resizing the real app — the pages render fine and
> throw nothing.
>
> **Three rhythms were accidental rather than decided**, and are now written down
> in COMPONENT_HIERARCHY.md §2b: a 20px surface inset (was 20/16/12 across header,
> pagination, and table cells, so nothing lined up vertically), a 32px control
> height (`SelectTrigger size="sm"` was 28px, sitting beside 32px controls in
> three separate toolbars), and uniform row heights (the Characters table
> alternated 35px and 50px depending on whether a row happened to have aliases).
>
> **Verified, not assumed:** zero horizontal overflow at all five widths (was up
> to 568px), row heights uniform per table, five reference points on every list
> screen aligned at the same x, all controls 32px, and every focusable element
> showing a focus ring under real Tab navigation. Contrast measured 15.9:1 for
> body text and 6.8:1 for muted — both above AA.
>
> One honest note: an initial focus audit using programmatic `.focus()` reported
> the nav links as having no focus indicator. That was a false positive —
> `:focus-visible` requires keyboard interaction — and re-testing with real Tab
> presses showed every element correct. Worth remembering before "fixing" it.

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

## M9 — Graph editing (added after M6; the final planned frontend milestone)

- **Objective:** Turn the Graph from a visualization into an interactive
  world-building workspace — selection, context actions, and relationship
  creation performed on the canvas itself.
- **Deliverables:** node hover/selection/multi-selection, a node context menu,
  click-to-connect relationship creation, richer viewport commands (animated
  zoom, fit selection, centre on node), and editing-state visual feedback.
- **Dependencies:** M5 (the shared relationship workflow it delegates to), M6
  (the renderer and its boundary).

> **M9 as-built notes — Graph editing (2026-07-19).**
>
> **The rule that kept it from becoming a second application.** Every editing
> action leaves through a door that already existed: opening and editing an
> entity are *routes* into the CRUD screens; creating a relationship is the
> shared `RelationshipDialog` with both ends pre-filled. The graph contributes
> the gesture and the feedback — not a parallel implementation. The only new
> domain code is `services/connect-rules.ts`, and even that defers to
> `shared/domain/relationships.ts` for what may connect to what.
>
> **The dialog was generalized rather than duplicated.** It previously took an
> `anchor` — "the entity you opened from, plus its role". The graph decides
> *both* ends before a type is chosen, which that shape could not express. It now
> takes `RelationshipEndpoints` (`{ source?, target? }`), and the three surfaces
> each fill in what they know: a detail screen fixes one end via
> `endpointsForEntity`, the graph fixes both via `resolveRelationshipEndpoints`,
> and an unanchored open fixes neither. One form, one validation path, one
> mutation.
>
> **Click-to-connect, not drag-to-connect.** The milestone was titled "drag to
> connect", but its own numbered steps describe a click sequence (select source →
> initiate → select destination → choose type → confirm), and that is what was
> built. Because connecting is a click and not a drag, the drag gesture stays
> free for moving nodes — a click sequence is also keyboard- and touch-reachable
> and matches the specified steps.
>
> > **Correction (post-M9): nodes are draggable.** The connect flow above is
> > unchanged, but the claim that nodes are globally `autoungrabify` was wrong as
> > a default — it disabled position dragging entirely, not just its persistence.
> > Node position is a *view* concern (untangling a dense network), not a stored
> > one: a dragged layout lasts until a topology change or reload re-runs the
> > layout, and the backend still has no field for it. Dragging and the click
> > gestures do not collide, because Cytoscape emits `tap` only on a release
> > without movement — a drag fires `grab`/`free` and no `tap`, so it never reads
> > as select, activate, or connect. Grabbing is suspended for the duration of
> > connect mode (`setEditingVisual` toggles `cy.autoungrabify`), the one
> > temporary editing mode where a node drag would be ambiguous against
> > click-to-connect. Verified in a real browser, including that a dragged
> > position survives the in-place edge patch after a relationship is created.
>
> **Validity is derived from the backend, not invented.** Because relationship
> writes are rooted at a Character, a Location→Faction edge is not merely
> unsupported by the UI — no request would create it. `canRelate` states that
> once; connect mode lights the nodes that pass and dims the rest, so the
> affordance and the endpoint agree by construction. Starting from a
> non-Character simply inverts the direction: the character you click becomes the
> source.
>
> **Two bugs only a browser could catch**, both found by driving the real app:
>
> 1. *Additive selection silently did nothing.* Cytoscape's
>    `selectionType: "single"` replaces the selection on every tap — shift adds
>    only for box selection. The first fix restored the previous selection inside
>    the `tap` handler and was also wrong: instrumenting the event order showed
>    `tapstart → tap → unselect → select`, so the library overwrote the fix a
>    moment later. The intent is now captured at `tapstart` and applied in the
>    animation frame that already coalesces the outgoing event, by which point the
>    library has settled.
> 2. *The connect banner made a node unclickable.* It sat at the top edge, and
>    with only 48px of fit padding it covered the highest node — potentially the
>    one being connected to. Moved to the bottom, where this workspace already
>    puts transient notices.
>
> **Performance: the common edit costs no rebuild.** `setModel` now compares node
> and edge signatures separately. Connecting two nodes already on screen changes
> only the edge set, so edges are patched in place — no teardown, no layout, no
> camera move. Verified in the browser: the graph went from 2 edges to 3 without
> a reinitialization, and the new edge appeared where it was drawn. A changed
> *node* set still relayouts (positions must be recomputed) but now restores the
> camera instead of re-fitting.
>
> **Verified in a real browser** (Chrome via Playwright, backend + Neo4j live):
> 24 checks covering selection, shift-additive selection, fit-selection, the
> context menu and its five actions, connect mode's valid/invalid marking, the
> hover preview edge, the shared dialog arriving with both ends fixed, the
> in-place edge update, cleanup of editing decoration after a write, and the
> `?edit=1` deep link. Plus regression runs of the M5 flows and the edit dialog
> on all four entity types. **Zero console errors.** 24 new unit tests (334
> total).
>
> **Not built, by instruction:** AI features, timeline editing, backend changes,
> edge editing, and relationship deletion.

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
