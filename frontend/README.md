# Narrative Mind — Frontend

The desktop-class web workspace for Narrative Mind, built with **React +
TypeScript + Vite + Tailwind CSS (v4, CSS-first) + shadcn/ui**. This document
covers the frontend only; for the project as a whole see the
[root README](../README.md).

The architecture, file structure, API integration, state management, component
hierarchy, and milestone plan are documented in
[`../docs/frontend/`](../docs/frontend/) — those documents are the source of
truth for this codebase.

## Prerequisites

- Node.js 20.19+ (developed on Node 26)
- The backend running on `http://localhost:8000` (see
  [`../backend/README.md`](../backend/README.md)) — every route the app calls
  except `/health` requires a signed-in session, so the backend must be up
  before login/register will work.

## Setup

```bash
npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if needed
npm run dev            # http://localhost:5173
```

## Scripts

| Script                  | Purpose                                |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Vite dev server with HMR               |
| `npm run build`         | Type-check + production build (`dist`) |
| `npm run preview`       | Serve the production build locally     |
| `npm run typecheck`     | TypeScript project check               |
| `npm run lint`          | ESLint (typed, import-order, a11y)     |
| `npm run lint:fix`      | ESLint with autofix                    |
| `npm run format`        | Prettier write                         |
| `npm run format:check`  | Prettier verify                        |
| `npm run test`          | Vitest — run the suite once            |
| `npm run test:watch`    | Vitest — watch mode                    |

## Layout

`src/app` (composition root + shell) · `src/routes` (URL map) · `src/features`
(vertical slices) · `src/shared` (design system, entity engine, API core) ·
`src/styles` (dark-only design tokens). See
[`../docs/frontend/FRONTEND_FILE_STRUCTURE.md`](../docs/frontend/FRONTEND_FILE_STRUCTURE.md)
for the full rationale.

The slices are `auth`, `characters`, `locations`, `factions`, `events`,
`graph`, `ai`, and `system` (the `/health` poll behind the status bar).
`world` is a reserved, empty slice — see [Known gaps](#known-gaps).

## Features implemented

Every item below is wired end-to-end against a live backend route:

- **Auth** (`features/auth`) — register and login pages, JWT held in a
  session store, `RequireAuth` route guard on the authenticated shell.
- **Entity CRUD** (`features/characters`, `locations`, `factions`, `events`)
  — list with search/filter/sort/pagination, create, detail view, edit,
  delete, and character-rooted relationship creation, all built on one
  `createEntityResource` factory over the four parallel backend routers.
- **Graph explorer** (`features/graph`, `GraphExplorerPage`) —
  Cytoscape-rendered ego network around a chosen character (depth 1–3),
  click to open an entity, right-click to connect/edit/center, and an
  honest notice when the backend hasn't reported edges beyond depth 1.
- **Shortest path** (`features/graph`, `ShortestPathPage`) — source/target
  character pickers backed by `GET /graph/shortest-path`, rendering the hop
  chain and distance between them.
- **AI surfaces** (`features/ai`) — all four `/ai/*` endpoints as one
  capability: an **Ask** page (`/ask`, question on `?q=` so it is
  deep-linkable) rendering the grounded answer with its `[uuid]` citations
  parsed into links and the retrieval trace behind it; the same panel as a
  dockable **Ask dock** (⌘I) beside any screen; an **Extract** page
  (`/extract`) that resolves proposed entities against the world you already
  have; and a **Suggest** assist in every entity form's description field,
  reached through the entity engine's `EntityFieldSpec.assist` seam so
  `entity-kit` holds no AI code.
- **Shell** (`app/shell`) — explorer sidebar, breadcrumbs, resizable panels,
  a ⌘K command palette rendered entirely from the command registry, and a
  status bar whose connection indicator is the polled `/health` query from
  `features/system`.

All four AI calls are mutations with no query keys and no cache: an LLM answer
is not server state, so re-asking must genuinely re-ask. Cancellation, the
cancel-is-not-a-failure rule, and result retention across a cancel all live in
one place (`queries/useAiRequest.ts`) so the four cannot disagree about them.
`/ai/*` also gets its own client deadline (`aiRequestTimeoutMs`, 120s dev /
60s prod) because the ordinary 15s one aborts a local Ollama extraction that
was going to succeed.

## Known gaps

- **`features/world`** is a reserved, empty slice (`.gitkeep` only). The
  workspace's landing page is `WorkspaceWelcome` — a navigational teaching
  surface, deliberately not a dashboard of empty statistics — and the world
  overview and cross-entity palette search planned as **M7** are unbuilt: ⌘K
  searches commands and destinations, not entities.
- **M8 (polish, keyboard, accessibility, motion) has never been run as its own
  pass.** Much of its substance landed alongside later milestones — the
  keyboard map and `Kbd` hints, reduced-motion handling in `globals.css`,
  token-driven empty/error/loading states — but the audit itself is
  outstanding.
- **Extraction cannot write back.** `/ai/extract` returns names, not ids, and
  persists nothing by backend design, so the Extract page proposes and matches
  but never creates.
- **Citations do not highlight graph nodes.** `useGraphInteraction` keeps
  selection as deliberately view-scoped React state rather than in the Zustand
  store, so driving it from the dock would mean either contradicting that or
  adding a cross-slice channel. Citations link to entity detail pages instead.
- There is no world/campaign switcher — the app currently operates on a
  single implicit world per account.

## Deployment (Vercel)

1. Vercel dashboard → **Add New Project** → import this repo → set
   **Root Directory** to `frontend`.
2. Framework preset **Vite** (auto-detected). Build command `npm run build`,
   output directory `dist`.
3. Set env var `VITE_API_BASE_URL` to the deployed **backend**'s URL (see
   [`../backend/README.md`](../backend/README.md#deployment-vercel--neo4j-aura--groq-and-google)).
   Only `VITE_`-prefixed vars are read by the build — Vercel may suggest
   backend-only vars it found in `backend/.env.example` elsewhere in the
   repo; ignore/delete those here, they don't belong to this project.
4. Deploy. Then go back to the **backend** project's `CORS_ORIGINS` env var
   and set it to this frontend's exact deployed origin (JSON array,
   matching scheme, no trailing slash), and redeploy the backend — CORS
   preflight requests will otherwise fail with a 400 on login/register.

If the deployed page loads blank, check the browser console first: no
console error usually means the static build/routing is fine and the real
issue is a failed backend call (CORS, stale `VITE_API_BASE_URL`) rather
than the frontend itself.

## Testing

```bash
npm run test
```

**Vitest + MSW.** The backend is mocked at the network boundary rather than by
stubbing modules, and `onUnhandledRequest: "error"` turns a request the handlers
don't describe into a failure instead of a silent pass — see
[`src/test/setup.ts`](src/test/setup.ts) and
[`src/test/msw/server.ts`](src/test/msw/server.ts), which names the response
shapes the suite asserts against (an empty page, a domain 404, FastAPI's
separate 422).

**372 tests across 26 files.** What is covered: the network spine in
`shared/api` — HTTP client, error mapping, the `createEntityResource` factory,
entity lookup; the shared wire and page schemas plus all four per-entity
schemas and their mappers; the domain rules in `shared/domain` (entity kinds,
relationship pairing and direction); the relationship resource; the UI store's
panel-layout derivation; the graph's pure layers — `build-graph-model`,
`connect-rules`, and the Cytoscape translation in `to-elements`; and the AI
slice's resource layer plus `parseAnswer`, which chips retrieved ids out of an
answer's inline `[uuid]` markers and drops UUID-shaped ids that were never
retrieved. Every test is pure TypeScript, so the whole suite runs in a couple
of seconds with no backend.

Tests run in Vitest's `node` environment and only `*.test.ts` is collected;
`stylesheet.test.ts` opts into jsdom with a docblock because the stylesheet
resolves design tokens through `getComputedStyle`. The graph is therefore
verified at its renderer boundary — model → Cytoscape elements, and the
stylesheet's rules and their precedence order — rather than by painting, since
Cytoscape's canvas renderer needs a real 2D context that jsdom does not provide.

**There are no component tests yet**: no `@testing-library/*` dependency and no
`.test.tsx` file in the tree, so rendering, forms, and interaction are currently
verified by hand. The milestone plan schedules component tests as M8 work
([`../docs/frontend/IMPLEMENTATION_PLAN.md`](../docs/frontend/IMPLEMENTATION_PLAN.md)).
