# Narrative Mind — Frontend

The desktop-class web workspace for Narrative Mind, built with **React +
TypeScript + Vite + Tailwind CSS (v4, CSS-first) + shadcn/ui**.

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

## Known gaps

- **`features/ai`** and **`features/world`** are reserved, empty slices
  (`.gitkeep` only, no components yet). The backend already exposes
  `POST /ai/describe` and `POST /ai/extract` — see
  [`../backend/README.md`](../backend/README.md) — but nothing in the UI
  calls them.
- There is no world/campaign switcher — the app currently operates on a
  single implicit world per backend instance.

## Deployment (Vercel)

1. Vercel dashboard → **Add New Project** → import this repo → set
   **Root Directory** to `frontend`.
2. Framework preset **Vite** (auto-detected). Build command `npm run build`,
   output directory `dist`.
3. Set env var `VITE_API_BASE_URL` to the deployed **backend**'s URL (see
   [`../backend/README.md`](../backend/README.md#deployment-vercel--neo4j-aura--groq)).
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

Vitest + Testing Library + MSW (mocked backend responses at the network
boundary, not mocked modules). Canvas-backed graph rendering is exercised
through its own renderer-boundary tests rather than a real `<canvas>`, since
jsdom has no canvas implementation.
