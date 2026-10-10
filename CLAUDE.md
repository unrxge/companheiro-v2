# Companheiro — Claude Code Guidelines

## Project Overview

Companheiro is a companion app for inner life reflection and creative work. It integrates voice check-ins, idea development, writing support, and publication reflection into a cohesive creative process.

**Tech Stack:**
- Next.js 15 (App Router)
- React 19 with client components
- TypeScript (strict mode)
- Tailwind CSS v4
- Supabase (PostgreSQL + Auth)
- Claude AI (Anthropic API) for processing

---

## Database Changes Protocol

**CRITICAL:** Every database schema modification must follow this checklist before implementation.

### Before Making Schema Changes

1. **Audit all database access**
   - Use `grep` or Agent to find every file referencing the affected table(s)
   - Identify read operations vs write operations
   - Check if queries use `SELECT *` (vulnerable to new columns) or explicit column selection (safe)

2. **Analyze each module for compatibility**
   - Check for hardcoded column assumptions in code
   - Look for default value assumptions that new columns might violate
   - Verify foreign key dependencies aren't affected
   - Check RLS (Row Level Security) policies remain valid

3. **Test impact scenarios**
   - **New columns with defaults:** Won't break existing reads; existing inserts will get defaults
   - **Nullable columns:** Safe to add; existing inserts will get NULL
   - **Renamed/removed columns:** Will break every module touching that column — document all affected files
   - **Changed column types:** Will break type assumptions in code and queries

4. **Document the impact**
   - List which modules are affected (API routes, frontend, utilities)
   - Specify if code changes are needed alongside schema changes
   - Note migration requirements

5. **Create migration file only after clearance**
   - Use semantic versioning: `00X_description.sql`
   - Place in `supabase/migrations/`
   - Keep migrations isolated and reversible
   - **A new table grants its own access.** Supabase stops giving the API roles access to new tables by itself (new projects already; the live project from 30 October 2026). Without this the table exists and every query answers "permission denied":
     ```sql
     grant select, insert, update, delete on public.your_table to authenticated, service_role;
     ```
     Add `anon` only for something signed-out visitors read. RLS still decides which rows.

6. **Lab first, then live** (once the lab exists; see *Live and lab*)
   - Apply the migration to the lab database, push to `lab`, try it there
   - Apply the same file to live just before promoting. Because migrations only add, live's current code keeps working in between

### Current Database Tables and Access Patterns

| Table | Read By | Write By | Selection | Notes |
|-------|---------|----------|-----------|-------|
| `check_ins` | `lib/companion-context.ts` (specific cols) | `/api/check-in/log` | Explicit columns | Drought protocol removed 2026-08; additions safe if nullable |
| `pieces` | `/api/project-board/*` (specific cols) | `/api/project-board/*` | Mixed | Project board reads exact columns; safe to add optional fields |
| `ideas` | `/api/idea-lab/*` (specific cols) | `/api/idea-lab/*` | Explicit columns | Idea development flow; verify arc/territory assumptions |
| `captures` | `/api/idea-lab/captures` | `/api/collector/capture` | Explicit columns | Collector flow; safe to extend |
| `session_logs` | `/api/project-board/session-log` | Session logging | Explicit columns | Track piece work sessions |
| `studio_post_publication_logs` | `/api/idea-lab/continuations`, `lib/companion-context.ts`, `lib/recall.ts`, `/api/letter` | `/api/post-publication/log` | Explicit columns | Close the loop. The old `post_publication_logs` is legacy (copied in by studio migration 009); read this one |
| `studio_board_items` | `/api/studio/projects/[id]/items` (GET), `/api/account` (export) | `/api/studio/projects/[id]/items` (POST), `/api/studio/items/[itemId]` | Explicit columns (`ITEM_COLS`) | Migration 028. Images, recordings and task lists on a project's canvas. Until it is applied the items route answers `ready: false` and the canvas offers threads only. Files live in `studio_assets` + the `studio-media` bucket; the companion reads neither |
| `studio_vision_messages` | `/api/studio/projects/[id]/vision` (the whole project, `node_id` null), `/api/studio/projects/[id]/companion` (one part), `/api/account` (export) | the same two routes | Explicit columns | One conversation per project and one per part. A reply that looked something up carries its sources inside `text` after the words (`withSources` / `splitSources` in `lib/studio/vision/types.ts`); anything reading this table for the words should split them off |

---

## Live and lab

Two copies of the app, so work in progress never reaches the people using it.

| | Live | Lab |
|---|---|---|
| Branch | `main` | `lab` (and any other branch Vercel builds) |
| Vercel environment | Production | Preview |
| Address | companheiro.app | the `lab` branch's address, behind Vercel sign-in |
| Database | Supabase project `qtyihplgqaqcbzkvjnld` | a separate Supabase project |
| Stripe | Production keys | test mode |

- **Which one am I?** `deployEnv()` / `IS_LAB` in `src/lib/deploy-env.ts` (server only). The lab shows a "TEST LAB" banner across the top and "Lab" in every tab title (`components/shell/lab-mark.tsx`), and tells search engines to stay away.
- **The build refuses to cross the wires.** `assertWiring()` runs from `next.config.ts`: a lab build pointed at the live database or a live Stripe key stops, and so does a live build pointed at any other database. If a deployment fails with "Build stopped: wrong database", fix the Vercel environment variables, not the check.
- **Day to day, once the lab is running:** commit and push to `lab`. Nothing goes to `main` directly.
- **Promoting:** only when the user says so. `node scripts/promote.mjs` shows what is waiting and checks that the lab deployment is up, that live's database has everything the lab's has, and that `main` has not moved on its own; `--go` then moves `main` up to `lab` on GitHub. It never changes the working folder.
- **Databases:** `node scripts/compare-schemas.mjs` compares the two (needs `.env.lab`). `node scripts/lab-schema.mjs` writes `supabase/lab-schema.sql`, the whole history in the right order for an empty project: main 001–022, then `studio/supabase/migrations`, then main 023 onwards.
- **Your real data in the lab:** sign up in the lab with the same email, then `node scripts/copy-to-lab.mjs` replaces that lab account's contents with a copy of the live account (rows, plan, storage files). Re-run for a fresh copy. It only reads live.
- **Experiments that need real history** (portrait, recall) cannot be judged on the lab's empty database. Ship those to live behind `ADMIN_USER_IDS` instead.
- **Not yet separated:** `.env.local` on this machine still points at the live database, and the maintenance scripts in `scripts/` rely on that. A local dev server reads and writes live data.

---

## Code Structure

### Authentication & Authorization
- Supabase Auth (email/password)
- Middleware at `src/middleware.ts` redirects `/` → `/home` (authenticated) or `/login` (unauthenticated)
- RLS policies enforce user data isolation (users can only access their own rows)

### Key Flows

**Check-in → Idea → Piece → Publication → Reflection**
1. **Check-in** (`/check-in`): Voice or text input, signals extraction (energy, arc, weather)
2. **Idea Lab** (`/idea-lab`): Develop ideas from captures, conversation with Claude
   - Every territory has a **register**: `inner` (grief, devotion, a way of living) or `field` (brand design, documentary editing, food). It is decided once, when the territory's map is written (`lib/territory-map.ts`), and stored on the slot in `user_territory_config.slots`. Questions are assembled in `lib/idea-prompt.ts`, which has a separate set of instructions per register; change the inner ones with care, they are the original and work
   - "Ask again" counts: the first question and two more come from the fast model, the next three from the deep one, then three fast, and so on (`promptModelTier`). Plans with `deepQuestions` (Direction and grandfathered, not the trial: paying for Practice must never make the Idea Lab worse) get the deep model for every question
3. **Project Board** (`/project-board`): Kanban view (Queue/Active/Completed), task tracking per piece
4. **Writing** (`/p/[project]/n/[piece]`): One page per piece: the sectioned editor, with the core concept, anchor lines, tasks and the writing assistant on its rail, and Reimagine → Test → Post → Reflect after the draft. `/write` only redirects here
5. **Post-Publication** (`/post-publication`): Log reflections, feed insights back to Idea Lab

### API Route Patterns

- `POST /api/[feature]/[action]` — Main write operations
- `GET /api/[feature]` — Fetch operations
- All routes require authentication (`getUser()` from Supabase)
- All mutations should check RLS at query time (Supabase client handles this)

### Frontend Patterns

- All pages are `'use client'` (client components)
- Use `useRouter()` from `next/navigation` for navigation
- Use `fetch()` for API calls (not server functions for this app)
- State management: React `useState` + `useEffect` (no external store)

### Styling

- Tailwind CSS v4 dark-first
- Dark theme: `#111110` (background), `#e8e6e0` (text), `#a8a6a0` (muted)
- Accent colors: `#10B981` (active), `#F59E0B` (queue), `#8B5CF6` (completed)
- No custom CSS; compose with Tailwind classes
- Mobile-first: use `md:` breakpoint for desktop adjustments

---

## The vision room

"Talk about the vision" on a project's canvas opens a full-screen room (`components/studio/work/vision-room.tsx`): the state of the vision on one page, a conversation beside it. Part of Direction (`visionTalk`).

- **One project only.** The room is handed a project id and asks only that project's routes. Nothing from another project is read or shown, by the person's decision (2026-10-10); do not add cross-project views here.
- **What it reads** is decided in one place, `canvasText()` in `lib/studio/vision/canvas-text.ts`: every word written on the canvas (purpose, rules, each piece's purpose and core concept, fragments, tasks, threads, and the words written on an image, recording or palette). Never an image, a recording, or the writing inside a piece. The conversation inside a part (`/companion` with a `node_id`) is the one that may see prose, and it is a different conversation.
- **The page** is mostly the canvas itself, read out. Three things are added, each only because the person asked or agreed: a reading of the canvas (`/vision/reading`, made on request, dated, goes stale when the canvas changes), decisions and open questions heard in talk (`lib/studio/vision/hear.ts`, offered, never added silently, quote checked word for word). All of it lives in `studio_projects.settings.vision`; change it only through `changeVision()`, which re-reads the row first.
- **It looks things up.** The talk route gives the model a web search (`web_search_20250305`, at most three per reply). That older tool type is deliberate: it is the one that returns the page each sentence came from. Each search is metered (`costMicros`).
- **Model:** `MODELS.vision` (Opus 5.5). Thinking is always on and counts toward `max_tokens`; it takes no `temperature`. Past the fair-use soft cap the fast model stands in, without search. If Opus declines a subject, `streamClaudeText`'s `fallbackModel` asks `MODELS.deep` once.
- **What it must never do** is in `VISION_ROLE` (`lib/studio/vision/prompts.ts`): make the work, say whether the work is good, measure or promise how it will perform, bring in another project.
- **Preview without an account:** `/dev/work-page?plan=direction&board=1&pieces=1`, then the button at the bottom of the canvas. The server is faked there, including a slow lookup with sources.

---

## Phones

Two different questions, answered in two different ways. Do not mix them.

- **Is there room?** (layout) is a width media query at the Dock's breakpoint, 720px (`DOCK_DESKTOP_MIN` in `components/shell/dock.tsx`; `useNarrow()` in `components/studio/work/bits.tsx` where it has to be known in code). Below it the Dock is along the bottom, so anything else fixed to the bottom stands above it: the canvas's zoom controls (`.zoom-pill`), the writing page's section marks (`.section-dock`), the rail's panels.
- **Is this a phone?** (what the person is asked to do) is `usePhone()` in `src/lib/use-phone.ts`: a touch screen whose short side is under 600px and which is clearly taller than wide. A tablet is never one. A foldable is one shut (its cover screen is a phone's) and not one open, and the answer follows the fold. A narrow window on a computer is never one. The rule is tested in `use-phone.test.ts`.
- **On a phone the canvas is for looking.** `Board` treats a phone as it treats a project the plan is not carrying (`disabled`): nothing can be moved, added, connected, renamed or removed, a banner says so (`PhoneBanner`), and a finger put down on a card moves the ground (`lookOnly` in `useCanvas`). A tap still opens a piece, and the writing page is whole on a phone. "Talk about the vision", thread suggestions and things carried from a check-in are not offered there (`work-page.tsx`). Add nothing to a phone's canvas that needs arranging.
- **Nothing may depend on hover.** Controls a mouse reveals by resting on a card are shown outright where nothing can hover (`useNoHover()`), and are not pressable while unseen.
- **Padding on a phone:** a `Container` given a plain number narrows to 12px and reaches 8px into the page gutter (`.shell-container` in `globals.css`), so page gutter + container + card do not leave a card's words two thirds of the screen. A row that holds words beside a wide control (a select, two pills) should wrap (`flexWrap`), as the Settings rows do.
- **Message boxes** carry `className="composer-row"`: on a phone the box takes the row and the microphone and Send sit under it.
- **Small marks** stay small to look at and get a finger's size to press, either by a media query (`.section-tool`, `.part-action`, `.storyline-mini`) or by an unseen `before:` area (`UnderlineLink`, the card menu on the Project Board).
- **Preview:** the Browser pane's phone size reports itself as a touch phone, so `/dev/work-page?plan=direction&board=1&pieces=1` shows the view-only canvas there; its tablet size does not.

---

## Plans and what they allow

One place decides what a plan includes: `entitlementsFor()` in `src/lib/billing/entitlements.ts` (pure, shared by server and browser). Never branch on `subscription.tier` anywhere else.

- **Trial** (30 days): everything Direction has. **Practice**: two active projects at a time (`PRACTICE_ACTIVE_PROJECTS`), no new threads, images or recordings, no "Talk about the vision", Idea Lab questions from the fast model first. **Direction**: no limits. **Ended** (trial ran out, plan cancelled): Practice's shape with the companion off. **Grandfathered**: everything.
- **Server checks** live in `src/lib/studio/plan-access.ts`: `assertWorkable` / `assertNodeWorkable` / `nodeGate` (is this the project being worked on?), `assertFeature` (threads, media, visionTalk), `claimActivePlace` (moving into Active: when it is full the person names which project rests for 14 days via `rest_id`; the downgrade choice keeps up to the limit via `keep_ids`). Resting only changes where a project sits, never its contents, `stageForNewProject` (new projects land in the Queue when the place is taken). Any new route that changes a project's content should call one of them.
- **The place in Active** is `studio_projects.shelf_stage = 'active'`. A project that gives it up to another rests (`resting_until`) for `REST_DAYS`; when it left is kept in `settings.left_active_at`.
- **Browser side**: `usePlan()` (`src/lib/billing/use-plan.ts`) for the plan, `access` from `useWork()` for one project, `PlanNote` / `PlanBanner` for saying a limit was met, `SwapNote` for the one confirmation card asked before a project rests. The pricing lines in `components/landing/landing.tsx` and the Terms (section 5) must match the entitlements.
- **Prices are Stripe's, never typed into a page**: `usePrices()` (`src/lib/billing/use-prices.ts`) asks `/api/billing/prices`, which reads the four Stripe prices and answers in the visitor's currency when every price carries it as a currency option (country from Vercel's `x-vercel-ip-country`), otherwise in the prices' own currency. Checkout charges that same currency. `FALLBACK_PRICES` (`price-format.ts`) is only what shows before the answer arrives. Outside production, `?country=BR` on the page or the route stands in for the header.
- **Preview without an account**: `/dev/work-page?plan=practice|direction|ended|cancelled` (add `&view=kanban`, `&board=1&pieces=1`, `&over=1`, `&reading=1`), and `/dev/board` for the canvas with images and recordings.

---

## Common Tasks

### Adding a feature that touches the database
1. Run the **Database Changes Protocol** (see above)
2. Create migration in `supabase/migrations/`
3. Update type definitions in `src/lib/supabase/database.types.ts` (if using Supabase Studio)
4. Update API routes to read/write new fields
5. Update frontend to surface or consume new data

### Debugging Supabase issues
- Check RLS policies: user must be authenticated and row must match `user_id`
- Check auth state: `supabase.auth.getUser()` returns null if not authenticated
- Use Supabase dashboard SQL Editor to test queries directly
- Check Network tab for API responses

### Claude API calls
- Use `@anthropic-ai/sdk` (never raw HTTP)
- Default model: `claude-haiku-4-5-20251001` (fast, cheap, good enough for signals). Models are named once, in `src/lib/models.ts`
- System prompts should be clear and concise
- Keep `max_tokens` reasonable (512 for summaries, 1024 for responses)

---

## Known Constraints & Trade-offs

- **No real-time sync:** Supabase subscriptions not used; rely on refetch after mutations
- **No data caching:** Every fetch is fresh. The one exception is the project list, which Home and the Project Board paint from the copy the tab last saw (`lib/studio/last-seen.ts`) while the fresh one loads
- **Functions run next to the database:** `vercel.json` pins server functions to Dublin (`dub1`) because Supabase is in `eu-west-1`. Keep them together; a route in another region pays an Atlantic round trip per query
- **Static shells:** `/`, `/login` and `/p/[id]/**` are served from the CDN. Don't read cookies, headers or `searchParams` in those page files (session routing lives in the middleware, query strings are read in the browser), and don't use plain `<a href>` for in-app links (it reloads the whole app; use `next/link`)
- **Single user focus:** No collaboration features; RLS assumes single-user isolation
- **Voice first, text second:** Speech Recognition API is primary input; typed input is fallback
- **Claude for intelligence:** Heavy reliance on Claude API for signals, ideas, continuations; keep prompts tight to control costs

---

## Next Steps / Known TODOs

- Database schema is stable; only add columns with defaults or nullable
- Improve error handling in API routes (currently logs but returns generic error)
- Consider adding request logging for debugging production issues
