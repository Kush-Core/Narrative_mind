# Component Hierarchy — Narrative Mind

> Planning document. **No implementation** (no JSX/CSS). Defines the component
> layers, their responsibilities, and how they compose. Read with
> [FRONTEND_FILE_STRUCTURE.md](./FRONTEND_FILE_STRUCTURE.md) (where these live) and
> [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md).

---

## 1. Component philosophy

Five layers, from generic to specific. Higher layers compose lower ones; lower
layers never import higher ones.

```
1. Primitives          shadcn/ui (Radix + tokens)      — generic, product-agnostic
2. Composites          our reusable app widgets         — built FROM primitives
3. Entity-kit (generic)EntityListView/Form/Detail       — descriptor-driven, entity-shaped
4. Feature components  entity-specific UI               — Character relationships, etc.
5. Layout / shell      the desktop chrome               — hosts everything
```

Two orthogonal roles cut across the layers:

- **Container components** — own data (call query/mutation hooks), handle intent,
  pass plain props down. Live at page/route level and in feature components.
- **Presentational components** — pure functions of props; no data fetching, no
  router, no store. Everything in layers 1–2 and most of layer 3's rendering.

This container/presentational split is the component-level expression of the
backend-mirrored layering: data orchestration up top, pure rendering below.

---

## 2. Design system foundation (dark-only, token-driven)

Before components: the tokens they consume.

- **Decision:** A single dark-theme token set defined as CSS variables in
  `styles/tokens.css`, consumed by both Tailwind config and shadcn/ui.
- **Token groups:** color (surface levels, foreground, muted, border, accent,
  semantic success/warn/danger, entity-type accents for Character/Location/
  Faction/Event), spacing scale, radius, elevation/shadow, typography scale,
  motion (durations + easings), and z-index layers.
- **Reasoning:** Dark-only means no theme-switch machinery — one token set is the
  entire visual contract. Centralizing it means the whole app is retuned in one
  file and no component hardcodes a value. Entity-type accent tokens give the four
  entities a consistent, learnable color identity across list, detail, and graph.
- **Benefits:** Consistency by construction; effortless global restyle; a11y
  contrast validated once at the token level.
- **Trade-offs:** Discipline required — components must reference tokens, never raw
  hex. Enforced by lint/review and by the fact that shadcn primitives already read
  tokens.
- **Future scalability:** if a light theme is ever wanted, it is a second token
  block behind a `data-theme` attribute — the `theme-provider.tsx` seam exists for
  this, unused today.

Motion principle (restated at component level): transitions **communicate state**
(panel open, route change, list reflow, optimistic settle, focus movement) and are
driven by motion tokens. No decorative/ambient animation.

---

## 3. Layer 1 — Primitives (shadcn/ui)

Generated shadcn components in `shared/ui/`, wrapping Radix. Product-agnostic,
accessible, token-styled. The expected working set:

`Button · Input · Textarea · Select · Checkbox · Label · Dialog · AlertDialog ·
Popover · DropdownMenu · ContextMenu · Command (cmdk) · Tooltip · Tabs · Table ·
ScrollArea · Separator · Badge · Skeleton · Sonner (toast) · Resizable
(panels) · Avatar`.

- **Responsibility:** behaviour + accessibility + token styling for one primitive.
- **Rule:** never contains app logic or data fetching; only presentational props.
- **Why shadcn (already fixed):** copy-in (not a black-box dependency), Radix
  a11y/keyboard behaviour out of the box (aligns with keyboard-first), and full
  token control for the dark aesthetic.

---

## 4. Layer 2 — Composites (reusable app widgets)

In `shared/ui/composite/`. App-opinionated, still entity-agnostic, assembled from
primitives. These are *ours*.

| Composite | Responsibility | Built from | Notes |
|---|---|---|---|
| **DataTable** | Headless-table engine + shadcn `Table` markup: column defs, sortable headers, row selection, empty/loading slots | TanStack Table + `Table`, `Skeleton` | One table engine for all four entities (DRY); columns come from the descriptor |
| **EntityPicker** | Search-select over *any* entity's list API (debounced `name_contains`, paginated) | `Command`/`Popover` + a list query | Used by the relationship editor to choose a target |
| **ConfirmDialog** | Generic destructive-action confirmation | `AlertDialog`, `Button` | Delete flows |
| **EmptyState / ErrorState / LoadingState** | The three non-happy-path surfaces, layout-preserving | `Skeleton`, icons, `Button` | Used uniformly by every list/detail |
| **FormField** | Label + control + validation-message wiring for RHF | `Label`, `Input`, … | The atom the generic form composes |
| **PageHeader / Toolbar** | Title, breadcrumbs, primary actions row | `Separator`, `Button` | Consistent screen framing |
| **KeyboardHint / Kbd** | Renders shortcut chips | tokens | Reinforces keyboard-first affordances |

- **Why this layer exists:** it is the DRY seam between vendor primitives and
  product features — the place a pattern used by ≥2 features crystallizes (per the
  promotion rule in [FRONTEND_FILE_STRUCTURE.md](./FRONTEND_FILE_STRUCTURE.md)).

### Decision — DataTable via TanStack Table (headless)

- **Decision:** Use TanStack Table (headless) inside `DataTable`, rendered with
  shadcn `Table` markup.
- **Reasoning:** Four entities need sortable columns, consistent selection, and
  descriptor-driven column sets. A headless engine gives that once; shadcn owns the
  visuals and a11y. Pairs conceptually with TanStack Query.
- **Benefits:** One table behaviour to build/test; per-entity columns are pure
  data; no styling lock-in (headless).
- **Trade-offs:** A dependency. Justified by reuse across all list views and the
  entity picker; the alternative (hand-rolled sortable tables ×4) is more code and
  drift. Deferrable: M3 could start with a simpler table and adopt it when the
  second entity lands — see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

### Decision — resizable panels via `Resizable` (react-resizable-panels)

- **Decision:** Use shadcn's `Resizable` (wrapping react-resizable-panels) for the
  IDE-like split layout.
- **Reasoning:** A desktop workspace with a draggable explorer/detail split is core
  to the product feel; this is the shadcn-sanctioned primitive for it.
- **Trade-offs:** One dependency for a genuinely desktop-class interaction; panel
  sizes persist via the Zustand UI store. Accepted as central to the experience.

---

## 5. Layer 3 — Entity-kit (the generic engine)

In `shared/entity-kit/`. The heart of the DRY strategy (architecture D3). These are
generic over an `EntityDescriptor<TRead, TCreate, TUpdate>` and know the *shape* of
an entity, never a specific one.

| Component / hook | Responsibility |
|---|---|
| **EntityListView** | Full list screen body: reads URL list-state, runs `useEntityListQuery`, renders `DataTable` from descriptor columns, filter controls (from descriptor filters), sort controls (descriptor sortable fields only), pagination (offset + derived `hasMore`), and the empty/error/loading states |
| **EntityDetailView** | Renders one entity's fields from the descriptor; hosts edit/delete actions and entity-specific **slots** |
| **EntityForm** | RHF + Zod form generated from the descriptor's field specs; maps server `fieldErrors` back to fields |
| **EntityFormDialog** | Hosts `EntityForm` for **both** create and edit; mode is derived from whether an entity was passed, so the two cannot diverge (M3) |
| **useEntityListQuery / useEntityQuery** | Generic list and detail query hooks (key from normalized URL input) |
| **useEntityMutations** | Generic create/update/delete with detail patch + list invalidation |
| **EntityListPage / EntityDetailPage** | The complete *screens*: the views above plus create/edit dialog state, delete confirmation, and post-write navigation (M4) |
| **columns.tsx** | Builders for the column and meta-row shapes every descriptor repeats — `nameColumn`, `truncatedTextColumn`, `createdAtColumn`, `createdAtMeta`, `identifierMeta` (M4) |

> **As-built (M4) — the last per-entity code became generic.** Through Locations each
> slice hand-wrote its list and detail *pages*: dialog state, delete confirmation,
> and where to navigate after a write. By the second entity those files were
> byte-identical apart from the entity's name, so they moved into
> `EntityCrudPages`. A feature page is now a three-line binding:
>
> ```tsx
> export function FactionListPage() {
>   return <EntityListPage descriptor={factionDescriptor} />
> }
> ```
>
> The thin per-slice file is kept deliberately — it is the slice's stable public
> surface and its route target, and a slice that later needs page-level behaviour
> the generic screen cannot express can stop delegating without touching anything
> else.
>
> **Column builders are builders, not components.** Each returns a plain
> `EntityColumnSpec`, so a descriptor can always drop to a hand-written `cell`.
> Character's alias sub-label and Location's region badge both do exactly that —
> the escape hatch stays cheap, which is what stops the builders becoming a
> straitjacket.

> **As-built (M5) — the detail slot moved above `Record`.** `EntityDetailView`
> now renders **Details → slot → Record**. The slot carries the entity's
> *substance* (Character's aliases; the narrative surfaces Event is shaped for);
> `Record` is provenance — created-at and identifier, the least-read facts on the
> screen. Ordering by importance means a future section is added to the slot
> without restructuring the component.
>
> This is the seam the Event module's "narrative readiness" rests on. Event
> participants, referenced locations, involved factions, and AI annotations are
> all *additional sections in the existing slot*, not a redesign. Nothing is
> stubbed for them today — the shape simply admits them. Relationship **writes**
> stay a graph concern: the backend roots them at Character
> (`POST /characters/{id}/relationships`), so Event does not invent a write path
> it does not have.

> **As-built (M3) — two engine behaviours worth knowing:**
>
> - **The empty list has two meanings.** "Nothing exists yet" (offer *create*)
>   and "nothing matches your filters" (offer *clear filters*) are different
>   situations needing different actions, so `EntityListView` distinguishes them.
> - **Enum fields render their label, not their wire value.** `EntityDetailView`
>   resolves a field's value through the same `options` the form offers, so a
>   reader sees "Alive" rather than `alive` and the two surfaces cannot disagree.

> **As-built (M4) — filters are a discriminated union.** `EntityFilterSpec` gained
> a `kind`:
>
> - `kind: "select"` — a **closed** value set, rendered as a select with an "all"
>   choice. Character's `status` (a three-member enum).
> - `kind: "text"` — an **open-ended** value, rendered as a debounced `SearchInput`.
>   Location's `region` (and later Faction's `ideology`): the backend types these
>   as `str | None` and matches them by **equality**, and exposes no endpoint that
>   enumerates their values, so a select is not expressible.
>
> This is the first real gap M3 predicted Locations would find. It was closed by
> **extending the descriptor contract**, exactly as M4's risk plan required — the
> engine switches on a declared `kind`, never on which entity it is rendering, so
> `entity-kit/` still contains no per-entity conditional.
>
> Exact-match on free text remains a genuine UX limitation (typing "North" does not
> match "Northern Reach"). `name_contains` stays the primary search, and a
> distinct-values or substring `region` filter is a noted backend enhancement.

**The `EntityDescriptor` is the contract.** It declares, per entity: identity
(name, route base, endpoint path), Zod schemas + wire mappers, field specs (label,
control type, constraints, read-only-ness — e.g. `display_name` read-only),
list columns, sortable fields, the categorical filter (or none), and **slots** for
entity-specific UI.

- **Escape hatches (why the generic core stays clean):** entity-specific needs are
  injected as slots/overrides, not conditionals baked into the engine:
  - Character → a `relationships` slot renders `CharacterRelationshipEditor`.
  - Event → `timeline_order` is just another descriptor field + a sortable column.
  - Faction/Location → their categorical filter (`ideology`/`region`) is descriptor
    data — declared `kind: "text"`, since both are open-ended strings (see the
    M4 note above).
  This keeps EntityListView/Form free of `if (entity === 'character')`.

---

## 6. Layer 4 — Feature components (entity-specific)

In each slice's `components/`. UI that is genuinely specific to one entity and
plugs into the generic slots.

| Component | Feature | Responsibility |
|---|---|---|
| **CharacterRelationshipEditor** | characters | List/create relationships for a character: pick `rel_type` (the 4 allowed values), choose a target via `EntityPicker`, add `sentiment` **only** when `KNOWS`; guides valid target types per rel while tolerating the backend's permissiveness |
| **CharacterStatusBadge** | characters | Renders `alive/dead/unknown` with a semantic token |
| **AliasList** | characters | Displays/edits the deduped alias set (≤10) |
| **RegionBadge** | locations | Renders a region, or a quiet "Unassigned" — a region-less place is an unfinished state, not missing data |
| **TimelinePositionBadge** | events | Renders `timeline_order` in tabular figures. Value-neutral by design: the backend attaches no meaning to any particular integer, so no "unplaced" for zero, no dates, no ordinal suffixes |
| **EventTimelineField** | events | Specialized control for `timeline_order` |
| **GraphExplorer** | graph | Container: fetches ego-network, drives the renderer, depth control (`1..3`) |
| **ShortestPathFinder** | graph | Two entity pickers → shortest-path result (hops + distance) |
| **GraphRenderer (interface) + impl** | graph | The library-agnostic visualization seam (architecture §7.3); lazy-loaded |

- **Why isolated here, not in entity-kit:** these encode real domain specifics that
  must not leak into the generic engine. They are the payoff of the slot pattern.

---

## 6b. The Graph subsystem (as-built, M6)

The Graph is **not** a layer in the stack above — it is a peer of the entity
engine, with its own rendering, interaction, and state model. It rests on the same
app core and shares no CRUD abstraction.

```
features/graph/
├── model/       graph.types.ts   renderer-agnostic vocabulary (GraphModel, refs, viewport)
│                graph.schema.ts  Zod validation of the two /graph reads
├── api/         plain resource functions over the shared httpClient
├── queries/     TanStack Query hooks (server state, shared cache + key registry)
├── services/    build-graph-model.ts — pure backend-response → GraphModel
├── engine/      renderer.ts       the GraphRenderer contract
│   └─ cytoscape/                  the ONLY place Cytoscape is imported
├── state/       useGraphInteraction — selection + mirrored viewport
├── components/  GraphCanvas · ViewportControls · Inspector · Legend · SourcePicker
└── pages/       GraphExplorerPage — composition only
```

**The engine boundary.** `GraphRenderer` is expressed entirely in the subsystem's
own types; `import … from "cytoscape"` appears in exactly three files, all under
`engine/cytoscape/`. Swapping the library is one new implementation plus one line
in `engine/index.ts`. The interface is deliberately **imperative** — commands in,
events out — because a graph is a stateful, animated, canvas-bound thing, and
re-rendering it as a function of props would discard layout and camera state on
every parent render.

**Five kinds of state, five owners.** Backend data → TanStack Query. Which graph
to show → URL params. Selection → view-scoped React state. Viewport authority →
the renderer. Viewport for display → a read-only mirror. Nothing is duplicated:
graph elements never enter React state, which is what keeps a large graph from
re-rendering through the VDOM.

**Shared with the entity engine: exactly two things.** The `httpClient` stack
(transport, `ApiError`, cancellation, Zod validation) and the design system. Plus
one new shared module, `shared/domain/entity-kinds.ts` — see §6c. The graph
rejoins the app through a *route*, not an abstraction: the inspector links to an
entity's detail screen.

### 6c. `shared/domain/entity-kinds.ts`

Entity **identity** (display name, icon, accent token, detail route) keyed by
Neo4j node label. The CRUD descriptors already carried this, but bundled with a
schema, a resource, form fields, and columns; the graph needs the identity and
none of the rest. Importing a descriptor to get a colour would drag four CRUD
slices into the graph bundle and couple two subsystems that should stay peers.

It also carries `accentVar`, the *name* of the CSS custom property. Canvas
renderers cannot use a Tailwind class, and duplicating an `oklch()` literal would
drift from `tokens.css` — so the token is named here and resolved at runtime.

---

## 7. Layer 5 — Layout / shell (the desktop chrome)

In `app/shell/`. The persistent frame; a container layer that hosts routes.

```
AppRoot (providers + error boundary)
└─ WorkspaceLayout                        (Resizable panel group)
   ├─ CommandBar            (top)         global search trigger, breadcrumbs, actions
   ├─ ExplorerSidebar      (left panel)   world navigator: entity groups + counts,
   │                                      quick nav, create actions
   ├─ <Outlet/>            (main panel)   the active feature route renders here
   │     ├─ EntityListPage / EntityDetailPage
   │     ├─ GraphExplorerPage
   │     └─ OverviewPage
   ├─ AuxPanel            (right, optional) detail/inspector when a master/detail
   │                                        split is active
   ├─ StatusBar           (bottom)        /health indicator + environment + status
   └─ CommandPalette      (overlay)       Cmd/Ctrl-K, bound to the command registry
```

- **WorkspaceLayout responsibility:** own the resizable regions and persist their
  sizes (Zustand UI store); render the shell slots and the route `Outlet`.
- **ExplorerSidebar responsibility:** navigation across the world's entities;
  reads lightweight counts via Query; triggers create flows and route changes. It
  is the "always there" spatial anchor of the workspace.
- **CommandBar + CommandPalette responsibility:** the keyboard-first spine.
  Every registered command (navigate to entity, create X, run shortest-path, focus
  search) is invokable from the palette and by hotkey via the shared command
  registry (`shared/commands/`). One registration → three affordances (palette,
  hotkey, optional menu).
- **StatusBar responsibility:** ambient system truth — backend reachability
  (`GET /health`), `environment`, and transient action status (saving, syncing).
- **Why the shell is its own layer:** it is the single most reused surface and must
  stay entity-agnostic; keeping it here prevents chrome logic from bleeding into
  features and makes the IDE feel a first-class, testable unit.

---

## 8. Composition example (Character list → detail → relationship)

Shows the layers cooperating, each doing only its job:

```
CharacterListPage                         (container, layer 4/pages)
  descriptor = characterDescriptor
  <EntityListView descriptor>             (generic, layer 3)
    useEntityListQuery(...)               (server state)
    <DataTable columns=descriptor.columns>(composite, layer 2)
      <Table>/<Badge>/<Skeleton>          (primitives, layer 1)
    row click → navigate(paths.character(id))

CharacterDetailPage                       (container)
  useEntityQuery(id)
  <EntityDetailView descriptor entity>    (generic)
    fields from descriptor
    slot: <CharacterRelationshipEditor>   (feature-specific, layer 4)
      <EntityPicker> → target             (composite)
      rel_type Select (4 values), sentiment only if KNOWS
      useEntityMutations / linkRelationship
```

At no point does a primitive know about characters, nor does the generic engine
contain a character-specific branch — specificity enters only through the
descriptor and the injected slot. That is the hierarchy working as designed.
