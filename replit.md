# Cycling Fantasy Manager

A Tour de France fantasy league where odds determine points — picking underdogs pays off massively.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/cycling-fantasy run dev` — run the frontend (port 25561, served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Replit Auth (OIDC/PKCE)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Frontend: React + Vite + Tailwind + shadcn/ui + framer-motion
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions
  - `auth.ts` — users + sessions (mandatory for Replit Auth)
  - `riders.ts` — TDF riders with odds
  - `stages.ts` — race stages with transfer deadlines
  - `stageResults.ts` — per-rider results per stage
  - `userTeam.ts` — user's current 8-rider selection
  - `userPoints.ts` — computed points per rider per user per stage
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/scoring.ts` — fantasy points engine
- `artifacts/cycling-fantasy/src/` — React frontend

## Points System

Base formula: `points = base_pts × sqrt(decimal_odds)` (odds multiplier)

- Stage win: 100 base pts × multiplier
- 2nd: 70, 3rd: 50, 4th: 35, 5th: 28, 6th-10th: 23-12
- 11th-20th: 8 pts × multiplier
- Top 80%: 4 pts × multiplier
- Bottom 20%: −10 pts (flat, no multiplier)
- DNF: −30 pts (flat, no multiplier)
- Yellow jersey worn at stage end: +30 pts (flat)
- Green jersey: +20 pts, Polka dot: +20 pts, White: +15 pts
- KOM points: each mountain point × 3 (scaled by odds)
- Sprint points: each sprint point × 2 (scaled by odds)
- Combative rider award: +25 pts (scaled by odds)
- Captain: 2× all points including negatives

## Admin Workflow (after each stage)

1. Go to `/admin` (must be marked `is_admin = true` in the users table)
2. Add stage results manually via the database or a future scrape endpoint
3. Click "Process Stage" → points are calculated and distributed to all users
4. Transfer window for next stage opens automatically

## Making yourself Admin

```sql
UPDATE users SET is_admin = true WHERE email = 'your@email.com';
```

## Architecture decisions

- Odds multiplier uses `sqrt(decimal_odds)` — balances risk/reward without extreme outliers
- Transfer window: determined by `stages.transfer_deadline` — closes 30 min before stage start
- Free transfers: no limit, window just opens/closes per stage
- Points are computed and stored at process time (not live) — admin triggers it after each stage
- Jersey points are flat (not odds-scaled) since wearing a jersey is deterministic, not a betting pick

## User preferences

- Fail fast, iterate quickly
- Automatic data where possible; admin panel for manual overrides
- No custom login forms — Replit Auth handles it

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change
- Re-run `pnpm --filter @workspace/db run push` after any schema change
- Admin routes guard: `is_admin` must be `true` in the `users` table
- Transfer window: if `transfer_deadline` is null on a stage, the window is considered open
