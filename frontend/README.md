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
  [`../backend/README.md`](../backend/README.md))

## Setup

```bash
npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if needed
npm run dev            # http://localhost:5173
```

## Scripts

| Script                 | Purpose                                |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Vite dev server with HMR               |
| `npm run build`        | Type-check + production build (`dist`) |
| `npm run preview`      | Serve the production build locally     |
| `npm run typecheck`    | TypeScript project check               |
| `npm run lint`         | ESLint (typed, import-order, a11y)     |
| `npm run lint:fix`     | ESLint with autofix                    |
| `npm run format`       | Prettier write                         |
| `npm run format:check` | Prettier verify                        |

## Layout

`src/app` (composition root + shell) · `src/routes` (URL map) · `src/features`
(vertical slices) · `src/shared` (design system, entity engine, API core) ·
`src/styles` (dark-only design tokens). See
[`../docs/frontend/FRONTEND_FILE_STRUCTURE.md`](../docs/frontend/FRONTEND_FILE_STRUCTURE.md)
for the full rationale.
