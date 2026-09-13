# Companheiro · studio

The new product model ("Practice and Direction") built as a separate app for testing, with every feature unlocked (the Direction tier). Nothing here touches the existing Companheiro app in `../src`.

## What it shares with the main app

- The same Supabase project. Log in with the account you already have.
- The same four environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- Copies of the Inner Weather primitives (tokens, theme, shell, buttons, fields, the section editor). Copies, not imports: the two apps never reach across the boundary.

## What is its own

- Every table is prefixed `studio_` and lives in its own migration folder: `supabase/migrations/`.
- Its own routes, navigation and canvas engine under `src/`.
- Its own Vercel project.

## Run locally

```bash
cd studio
npm install
npm run dev
```

Opens on http://localhost:3100.

## Deploy as its own Vercel project

1. In Vercel, **Add New Project** from the same GitHub repository (`unrxge/companheiro-v2`).
2. Set **Root Directory** to `studio`.
3. Framework preset: Next.js. Leave build settings as detected.
4. Add the four environment variables from `.env.local`.
5. Deploy. The main app's project is unaffected because its Root Directory is the repository root.

## Apply the database migration

Run each file in `supabase/migrations/` in order in the Supabase SQL editor. They only create `studio_`-prefixed tables and one storage bucket (`studio-media`), so nothing in the existing schema changes.

## Migration order

Apply the files in `supabase/migrations/` in numeric order in the Supabase SQL editor:

1. `001_studio_foundation.sql` — the eleven `studio_` tables, RLS on every one (`auth.uid() = user_id`), the triggers (parent depth, stacking, link project, resting dates), the RPCs (`studio_open_project`, `studio_since`, `studio_next_z`, compass reinforcement) and the `studio-media` bucket.

Each file is self-contained; run a file only once. A dry run: `select studio_since('<a project uuid>')` returns a jsonb with nine keys.

## How the code is split (the lanes)

The canvas is built from `docs/BUILD_SPEC.md` by eight lanes; every file belongs to exactly one (section 11 of the spec is the map).

| Lane | Owns |
|---|---|
| A — foundation | migration, `lib/studio/{types,registry,canvas-tokens,store,hooks,db,compass,api-client}.ts`, the A routes, the shelf, the project page, `components/canvas/{canvas-page,actions}.tsx`, `chrome/*`, `drawers/*`, `blocks/{registry,block-shell,fallback-block,index}`, and every stub the other lanes replace |
| B — engine | `lib/studio/engine/*`, `geometry.ts`, `stage/world/block-view/measure`, the overlays, the phone stage and sheet |
| C — text blocks | the ten text renderers, their settings and phone sheets |
| D — rich | draft card + studio + chat route, compass block + drawer + sheet, frame, links layer |
| E — media | image, gallery, recording, palette; media lib; asset routes |
| F — layout | `lib/studio/layout/*` (compose, tidy, arrivals, estimate) |
| G — talk | `lib/studio/talk/*`, the talk routes, drawer, composer, catch line, talk bar, `since.ts` |
| H — creation | `/new`, the concept draft route, concept routes, concept editor, revisions drawer |

Cross-lane imports go only through the frozen contracts (`types.ts`, both registries, `canvas-tokens.ts`, `store.ts`/`hooks.ts`, `api-client.ts`) and the stub signatures in section 11.1. Lane A's chrome talks to the engine through the `CanvasActions` interface in `src/components/canvas/actions.ts`; lane B supplies the engine-backed implementation.

## How to run the tests

```bash
cd studio
npm run typecheck        # tsc --noEmit, strict
npm test                 # tsx --test src/**/*.test.ts  (layout, engine, talk unit tests)
npx tsx --test src/lib/studio/layout/__tests__/compose.test.ts   # one file
npm run build            # next build
```

Tests are plain `node:test` files run with `tsx`; pure modules only (no React, no network).
