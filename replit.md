# Ad Scheduler

Replaces a Google Spreadsheet for managing advertising campaigns (рекламные ролики) in shopping centers across Russian cities. Managers upload an Excel file daily to see how many seconds of ads are scheduled per shopping center.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ad-scheduler run dev` — run the frontend (managed by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + TanStack Query + Zustand
- API: Express 5 + Server-Sent Events (SSE for real-time sync)
- DB: PostgreSQL + Drizzle ORM
- Excel parsing: SheetJS (`xlsx`) on the server
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/` — Drizzle schema (campaigns, shopping_centers, campaign_placements, import_history)
- `artifacts/api-server/src/routes/` — Express route handlers (grid, campaigns, statistics, import, events)
- `artifacts/ad-scheduler/src/` — React frontend
- `artifacts/ad-scheduler/src/store/filters.ts` — Zustand filter state

## Architecture decisions

- **Import is transactional**: Excel upload clears all campaigns/placements and reinserts atomically in a single DB transaction — partial import states are impossible.
- **Restore is transactional**: Rollback to import history saves a pre-restore snapshot and rebuilds data atomically.
- **Shopping centers are preserved across imports**: Only campaigns and placements are cleared; SC directory (number, address, city, format) persists and is extended with placeholder entries for unknown numbers.
- **SSE for real-time sync**: After each import or restore, `broadcastDataUpdated()` fires an SSE event to all connected clients, invalidating TanStack Query caches without WebSocket overhead.
- **Grid computed server-side**: The grid endpoint returns fully assembled city/SC/campaign matrix — the frontend just renders it without additional aggregation logic.

## Product

- Upload Excel (.xlsx/.xls) to import campaigns; supports drag & drop
- Filter by city (multi-select), format (ГМ/СМ), status (Платник/Не платник), date, active-only
- Grid of city cards showing SC rows vs. campaign columns with color-coded load levels (green/yellow/orange/red)
- KPI summary cards and statistics block (auto-recalculate on filter/date change)
- Campaign detail side panel with full info and delete action
- Bulk campaign delete via column header checkboxes
- Import history (last 50) with one-click restore
- Real-time sync: all connected browsers update automatically when someone imports

## User preferences

_Populate as you build._

## Gotchas

- After adding new OpenAPI endpoints, always run `pnpm --filter @workspace/api-spec run codegen` before using the generated hooks.
- After schema changes, run `pnpm run typecheck:libs` to rebuild lib declarations before checking artifact packages.
- The `lib/api-zod` tsconfig includes `dom` lib (needed for SheetJS `File`/`Blob` types in generated Zod schemas).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
