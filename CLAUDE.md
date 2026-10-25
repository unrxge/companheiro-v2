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
| `studio_board_items` | `/api/studio/projects/[id]/items` (GET), `/api/account` (export) | `/api/studio/projects/[id]/items` (POST), `/api/studio/items/[itemId]` | Explicit columns (`ITEM_COLS`) | Migration 028. Images, recordings and task lists on a project's canvas; palettes (031), links (037, manual apply: `content.url` + `title`; `embedFor()` in `lib/studio/embed.ts` decides what plays inside, YouTube/Vimeo/Loom/Spotify/SoundCloud and plain media files, the rest opens in a new tab) and notes (036, manual apply: a note is left from a check-in by `/api/check-in/note`, standing on its own until moved or connected). Until it is applied the items route answers `ready: false` and the canvas offers threads only. Files live in `studio_assets` + the `studio-media` bucket; the companion reads neither |
| `studio_vision_messages` | `/api/studio/projects/[id]/vision` (the whole project, `node_id` null), `/api/studio/projects/[id]/companion` (one part), `/api/account` (export) | the same two routes | Explicit columns | One conversation per project and one per part. A reply that looked something up carries its sources inside `text` after the words (`withSources` / `splitSources` in `lib/studio/vision/types.ts`); anything reading this table for the words should split them off |
| `studio_vision_conversations` | `/api/studio/projects/[id]/vision` (GET, POST), `/vision/conversations`, `/api/account` (export) | `/api/studio/projects/[id]/vision` (POST: starts one, touches it, names it after the reply) | Explicit columns | Migration 035 (manual apply). One row per conversation in the vision room, with a title and one-line summary written by the fast model after two exchanges and again every twelve messages (`lib/studio/vision/conversations.ts`). `studio_vision_messages.conversation_id` points here; the conversation inside a part never has one. Until 035 is applied the room carries on as one conversation per project (`conversationsReady()`) |

**Retired columns (still in the table, read and written by nothing):** `substack_goals` on `studio_nodes` and on the legacy `pieces`: the core concept's *writing suggestions*, removed 2026-10-11 (generation, the creation card, save, task generation, the writing assistant's and Reimagine's context, the vision room's reader, the node bundle and `NODE_COLS` all stopped using it). Nothing is meant to fill it again. `database.types.ts` still lists it because it mirrors the physical `pieces` table. Dropping the columns is a separate, destructive step and must come *after* promotion: live's current code selects `substack_goals` by name, so dropping it first would break live. `short_form_goals` (the earlier "Visuals suggestions") is no longer generated either, but is still carried through a few reads (the vision room's reader, the node bundle, the legacy routes); sweep it the same way if wanted.

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
- **For now (from 2026-10-18, no paying customers, lab unused):** commit to `main` first and push it, then bring `lab` up to match. Run type-check and tests before pushing. This lasts until the person says there are paying customers; then go back to the lab-first flow below.
- **Day to day, when the lab is in use:** commit and push to `lab`. Nothing goes to `main` directly.
- **Promoting:** only when the user says so. `node scripts/promote.mjs` shows what is waiting and checks that the lab deployment is up, that live's database has everything the lab's has, and that `main` has not moved on its own; `--go` then moves `main` up to `lab` on GitHub. It never changes the working folder.
- **The banner's "not yet live" list** (`/api/lab/waiting`) is for the person, not for us: it shows the commits on `lab` that `main` lacks *and* that change the app itself (`showsInLabList` in `src/lib/lab-waiting.ts`). Scripts, migrations on their own, docs, tests, preview harnesses and the lab's own machinery never appear. A commit inside the app with nothing to try (extra logging, a refactor) leaves itself out with a line of its own in the message: `Lab-list: skip`. The first line of every other commit is what the person reads there, so write it as what changed for them.
- **Databases:** `node scripts/compare-schemas.mjs` compares the two (needs `.env.lab`). `node scripts/lab-schema.mjs` writes `supabase/lab-schema.sql`, the whole history in the right order for an empty project: main 001–022, then `studio/supabase/migrations`, then main 023 onwards.
- **Your real data in the lab:** sign up in the lab with the same email, then `node scripts/copy-to-lab.mjs` carries over only what is new or changed on live since the lab last had it (rows, plan, storage files; nothing is deleted in the lab). `--full` wipes that lab account and copies everything again. It only reads live.
- **Owner pages in the lab** (`/admin`, `/admin/people`): the lab's database gives the same person a different id, so a lab deployment reads `ADMIN_USER_IDS_LAB` (Preview only in Vercel), not `ADMIN_USER_IDS`.
- **Experiments that need real history** (portrait, recall) cannot be judged on the lab's empty database. Ship those to live behind `ADMIN_USER_IDS` instead.
- **Not yet separated:** `.env.local` on this machine still points at the live database, and the maintenance scripts in `scripts/` rely on that. A local dev server reads and writes live data.

---

## Example projects

Five finished-looking projects under Active on a new account's Project Board, one per niche (2026-10-17): a creative director's global campaign for an invented luggage maker (*Aldermoor: Come Back Different*, with three generated mood images and strategy-level talk in the vision room), a songwriter's album (*The Age He Was*), a man's morning journals shaped into three pieces (*Before Anyone Wakes Up*: universal pain and dreams, by the person's direction; it replaced a fiction season), a one-person studio's client identity (*Aurélia Bakery*), and a documentary series for social media creators and cinematographers (*The Orange Hours*). Each has a full core concept per piece, threads, tasks in categories, a palette and task list on the canvas, decisions and open questions in the vision room, dated concept changes, a reading, one past vision conversation, and the Idea Lab conversation it came from.

- **Never in anyone's database.** Authored in `src/lib/examples/<key>.ts` (shape in `types.ts`), turned into real rows by `build.ts`, served read-only by `serve.ts` through `/api/examples/[...path]`. `next.config.ts` rewrites every API request whose id starts `example-` (path, or `node_id` in the query) there, before the real routes, so the canvas, writing page and vision room open an example unchanged. Writes answer 403 `code: 'example'`; nothing reaches the companion, analytics, plan limits or recall. Keep every new id under `example-<key>--`.
- **Things can be moved, nothing else.** On an example, pieces, threads and canvas items can be dragged (`arrangeable` on `Board`); a move is kept in that browser (`lib/examples/layout.ts`), never sent, and "Put everything back" on the banner clears it. The owner's moves are also kept in their account metadata (`example_layout`, via `/api/examples/layout`) so `node scripts/example-layout.mjs` can read the arrangement they leave and it can be written into the examples as the default.
- **Images and recordings** are files in `public/examples`, made from scratch by `scripts/make-example-media.py` (plucked-string guitar, generated mood frames), so nothing in them is anyone else's. The creative director's spoken memo was made once by the live app's OpenAI speech voice (the key lives only on Vercel; a temporary route did it and was removed) with street sound mixed in here; any generated voice must be said so (`note` on the example, shown in the banner).
- **Where things stand** is the owner's own arrangement (2026-10-18), in `src/lib/examples/arrangement.ts`, laid over the slots in `build.ts`; an example's cards are drawn at one size whatever the window (`EXAMPLE_FRAME`, passed as `cardFrame`) so it lines up everywhere. A test fails if an example gains a thread or item with no place there. To take a new arrangement: arrange as the owner, run `node scripts/example-layout.mjs`, write the result into that file.
- **The walks round an example** (`lib/examples/tour-script.ts`, played by `components/studio/work/example-tour.tsx`): the first example canvas opened plays one (whole project, a piece, a thread lit, the "+" opening, what hangs beside the words, then into the vision room and back), and the first example piece opened plays another (the writing, the core concept, the assistant, Flow). Each once per account (`example_tour` in the auth metadata, via `/api/examples/tour`) and per browser. They cannot be skipped. They move on by themselves once a step has played and been read (`dwellMs`; the last step waits for a press), Next or the message box moves on sooner, Back goes back, a pause button (and resting the pointer on the box) holds a step; a stray tap anywhere else does nothing. Each begins wide (anchor `page` = the page's whole column) and narrows. The same overlay plays the walks round Home, the Idea Lab's summoning, the Portrait and the check-in (`lib/page-tours.ts`, `lib/check-in-tour.ts`). Every walk's message card has an X (and Escape) that leaves it, putting back whatever it opened. Settings → "Take the tour" does not open a carousel: it asks which part of the app they want a walk round, and `rearmWalks(place)` clears only that part's seen flag(s) and takes them there. The Project Board's (`board`) also turns the examples on and sets `rearmed_at`, so the board opens the first (most relevant) example by itself, the canvas walk plays, and the piece's follows (unless they leave with the X). Words say why, never how, in the person's practice (`VOICES`), never their themes. In the preview, `?tour=N` / `?piecetour=N` start at step N and `&tourhold=1` holds a step still; the Browser pane has to be in view for its animation to run.
- **The "+" on an example's cards** is shown; pressed, its menu is greyed with a line saying an example is for looking (`PlusMenu inert`). The canvas walk opens it in full colour.
- **Read-only on screen** through `access.reason === 'example'` (`readOnly` in `work-page.tsx`): `ExampleBanner` replaces the plan banner on the canvas only (never inside a piece or the vision room), the Write → Reflect ribbon is hidden, and a piece opens with its core concept out on the rail (not on a phone). The vision room opens on the kept conversation.
- **The Idea Lab conversations** (`log`) are written as the companion meeting the work cold: it never names the form (album, series, brand), the audience or an image before the person has said it. Keep any rewrite to that.
- **Where things sit on the canvas:** threads and lists carry `at` (piece slots along the lane, pixels below the cards; or `'beside'` the first card), turned into hand placements in `build.ts`. Left out, the board's own arrangement crowds them under the middle and drops a list belonging to no piece below everything.
- **Who sees which:** `examplesFor()` matches the practices named at sign-up (writer → journal, songwriter → album, creator/cinematographer → series, client → studio, director → campaign); none matched shows all four; "Show the other N" reveals the rest. `examplesShown()` (`shown.ts`): accounts created from `EXAMPLES_FROM` see them until "Put these away"; older accounts only if they switch them on in Settings → Example projects. The choice is `examples` in the auth user's metadata.
- **Dates are days before today**, so they always read as current work. `examples.test.ts` checks ids, that every thread touches some pieces but not all, journey format, and that the reading only names things on the canvas.
- **Preview without an account:** `/dev/work-page?view=kanban&examples=writer,client` (or `=1` for none named); the cards open the real `/p/example-…` pages, which need no session.

---

## Usage analytics

What the maker can see about how people use the app: `/admin/people` (owner only, linked from `/admin`). Decided with the person on 2026-10-12; the limits below are theirs and are also what the Privacy Policy (`#analytics`) tells users.

- **What it is:** per person, which parts of the *project* side they use and how each project came to be: dates, counts, stages, words as a number. Projects are "Project 1, 2, 3", never their titles.
- **What it never is:** anything a person wrote (no title, text, conversation, image or recording), and nothing at all from check-ins, captures, ideas, the Portrait or letters. Every column read is named in `COLUMNS` in `src/lib/ops/people.ts`; a test fails if a column that holds words is added, or a table outside the project side. Do not add a view that shows content here. Opening an account "as them" was considered and set aside: it would need each person's own plainly worded yes, never a default and never the word "analytics".
- **Money per person** (`src/lib/ops/money.ts`): companion cost is exact (sum of `ai_calls.cost_micros` for this environment, dollars); income is an estimate rebuilt from `billing_events` at list price, since Stripe's amounts are not stored; "lifetime value so far" is net income less cost. Say "about" wherever income is shown.
- **Who is shown:** `sharesAnalytics()` in `src/lib/usage-analytics.ts`. On unless switched off (Settings → Share usage analytics), and never before the person has been told: they signed up under a Privacy Policy that describes it (`LEGAL_VERSION` ≥ `ANALYTICS_POLICY_VERSION`), reached the tour's last slide, or answered the one-time card on Home (`components/home/analytics-notice.tsx`). The choice lives in the auth user's metadata (`usage_analytics`), beside `consent`; no table.
- **Preview without an account:** `/dev/people` (made-up people through the real code).

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
   - **No tasks are made from a concept** (the person's decision, restated 2026-10-23): locking a core concept saves it and goes straight to the writing; the old "Where to start" review and `generateTasks` calls are gone (`lib/generate-tasks.ts` is unused). Tasks are the person's own.
   - **Task lists on the canvas**: "Task list" in the "+" makes one and opens it at once, nothing asked (`TaskListRoom`, `task-list-room.tsx`); a list has no name of its own and there are no categories (the person's decisions, 2026-10-22 and 2026-10-25). It opens in tabs: Project (the project's own tasks, kept on the list in `content.tasks`, then each piece's tasks, `studio_tasks`, shared by every list on that piece) and one tab per piece; a piece's tab offers "Add this individual task list to <piece>" which puts the list on it (`node_ids`, one piece or none). Only the round tick completes a task; clicking its words rewrites them in place (`renameTask`; titles up to `MAX_TASK_TITLE`, 5000); the add box wraps and grows (`AutoInput`). A task ticked in a sitting drops to the bottom and stays until the list is closed; tasks already done when it opens are hidden until "Show N done". Any task moves to the project or another piece from the arrows beside it. Several lists can coexist. Task lists work on a phone like anywhere else.
   - **The conceptualise conversation** (`lib/conceptualise-prompt.ts`) runs on `MODELS.concept` (Sonnet, every stage; the person chose it over Opus for cost on 2026-10-18). Its rules ask small questions into what costs the person, never close it with a verdict, reassurance or a reframing, ask only what could change the piece, and allow at most two follow-ups a stage. Chosen 2026-10-18 by running it against scripted people and having a stronger model judge them blind: Opus followed these rules best and Sonnet only partly; Haiku ignored them. Any re-run of that kind spends real money on the app's key: ask the person first, with an estimate
   - **A new piece for a project that already exists** (`/idea-lab/conceptualise?project=<id>`, from the canvas) is its own lighter path (`joiningTurn` in the route, rules in `lib/conceptualise-prompt.ts`, the person's direction 2026-10-20): it opens on a static line naming the project, the project's purpose, rules and each piece's core truth are the context (no companion context), and each stage only clarifies this piece. Before each reply a check (deep model, forced `stage_check` tool) names which stages are already answered with enough depth (a passing mention, or what the project already says, is only a foundation: it comes back as `mentioned`, and when the conversation reaches that stage the question builds on what they said instead of starting over), and code (`joiningNextStage`) picks the stage the reply asks. Questions are framed with what the project already says for that stage (its pieces' core truths, convictions and audience journeys are in the context), asking how this piece stands to it, so the person never restates the project; a confirmation against the project answers the stage: a tangible answer moves on, doubt or a surface answer stays. No "Move on" button anywhere: the person asked for the system to decide
   - **A concept for a whole project** (the person's direction, 2026-10-22): the conversation holds a body of work (a series, an album, a campaign) as one idea, the core concept page asks "This concept is for: One piece / A project of several pieces" (pre-set from the conversation by the generate route's `scope`), and a project's concept is also kept in `studio_projects.settings.concept` (with `settings.board` on). On the canvas, "Add a piece" has two choices (the person's, 2026-10-22): "Start it now" makes a piece carrying the project's concept as its own when the project has one (`adopt_concept` on the nodes route: `settings.concept`, or else the first piece's), and "Work out what it is first" is the conversation. The project's concept stays live: a change (vision room or writing page) to a part of a piece that still carries the project's words for it changes the project's concept and every other piece still carrying them (`followProjectConcept` in `lib/studio/vision/concept.ts`); a piece whose words there are its own changes alone. In the vision room's talk, a heard change to a part a piece still shares with the project (`reach` on `PendingChange`, set by `reachOf` only then) is offered like the check-in's "belongs to a project" card: "This sounds like it changes the concept of …", with "Change the whole project" and "Change <piece> only", the one it reads as first; `apply` takes `scope`. Open threads stay each piece's own, never the project's (the person's decision)
   - **Themes**: long names wrap inside their pill; with fewer than four themes the Idea Lab offers inner, expansive suggestions in dashed outline (three for up to two themes, two for three; `suggestedThemes` in `lib/territories.ts`), pressed to add
 `inner` (grief, devotion, a way of living) or `field` (brand design, documentary editing, food). It is decided once, when the territory's map is written (`lib/territory-map.ts`), and stored on the slot in `user_territory_config.slots`. Questions are assembled in `lib/idea-prompt.ts`, which has a separate set of instructions per register; change the inner ones with care, they are the original and work
   - "Ask again" counts: the first question and two more come from the fast model, the next three from the deep one, then three fast, and so on (`promptModelTier`). Plans with `deepQuestions` (Direction and grandfathered, not the trial: paying for Practice must never make the Idea Lab worse) get the deep model for every question
   - **Building the core concept later** (the button on a project started with "Skip straight to writing") is a short brief, not the conversation above: `/idea-lab/conceptualise?mode=brief&project=<id>`. The person already knows the idea, so it only has to hear it, with common sense (the person's direction, 2026-10-18): the same five stages, one plain question each, a stage their words already settled skipped, and nothing asked after the say-back. An answer specific enough to write from is taken as it stands; one so general it could belong to a hundred other projects earns one gentle follow-up asking what makes this one theirs, at most one a stage and two a brief (`BRIEF_FOLLOW_UPS`, carried by the page as `followedUp`). Each turn the model names the project's `root` so far, and may not say it back while that is empty and a follow-up is left. The opening question is static (no wait), the deep model runs every turn (judging whether an answer has a root is beyond the fast one), and no companion context is read. Prompt and rules live in `lib/concept-brief.ts` (tested). The stage comes from a forced `brief_turn` tool call that the page follows, never from `<phase_complete/>` markers in prose: markers were tried and the model closed stages it hadn't asked and forgot to close the last. The enum on `asking` is a steer, not a lock, so `parseBriefTurn` clamps to the floor. The conversation reaches `/idea-lab/core-concept?project=<id>&from=brief` through sessionStorage and is saved as the project's `conceptualisation_log`. That page no longer generates from a bare title + intent: a project with no log is sent into the brief
3. **Project Board** (`/project-board`): Kanban view (Queue/Active/Completed), task tracking per piece
4. **Writing** (`/p/[project]/n/[piece]`): One page per piece: the sectioned editor, with the core concept, tasks and the writing assistant on its rail, and Test → Reflect after the draft (Reflect is a short spoken conversation about the finished piece; keeping what it writes up finishes the piece, and a finished piece always opens on its Reading room, not its writing). Reimagine and the "Post" step were removed 2026-10-23: nothing in the app generates the work, and nothing assumes a piece is shared. `/write` only redirects here. **Nothing is ever placed in the text but what the person types** (2026-10-25, the person's decision): the writing assistant's words, including an example or rewrite they ordered, stay in its conversation (`lib/writing-assistant-rules.ts`; no pending edits, no Approve/Reject, no `<proposed_edit>`), and a section has no check mark or lock (a section finishes with the piece, by Reflect). **Fragments (anchor lines) were removed from the system the same day**: no rail tool, no per-section button, nothing in Test, the vision room, the examples, their tour or the usage analytics; sending a check-in thought to a project is Direction's (and the trial's) only: on Focus the check-in card is greyed with a line saying so, the routes refuse, and waiting thoughts are not shown. "Shape into sections" and "Place it in the sections" (and `/api/write/sections/*`) were removed too. The table `studio_anchor_lines` and the columns `is_locked` / `status` are still there, read by nothing (dropping them is a separate, destructive step). The ribbon's **Concept** step opens the core concept as it stood when locked, read-only (`/idea-lab/core-concept/view?project=<id>&node=<id>`): the piece's own if it has one, else the project's (`settings.concept`), else it goes to the build flow. The Test step reads the draft against the ethos, conviction and core truth only
5. **Reflect** (`/reflect`; the API route `/api/post-publication/log` and the table `studio_post_publication_logs` keep the old names) — the person's last stage with a piece, by voice only (no text box; `useDictation`). `lib/reflection.ts` (tested) is the engine: four themes in order (how they feel now, what making it opened up, what it left unresolved, where it could go next); each turn `/api/reflect/turn` has the model say back what it heard and ask the next thing through a forced `reflect_turn` tool call whose `heard` field records, per theme, what they have answered; **code**, not the model, picks the next theme (`nextTheme`): an unanswered one is pressed once more and then let go, a skipped one is never asked, an honest "nothing" is an answer. Skip is local (no call). When nothing is left, `/api/reflect/distill` writes what they said up as the log in their own words (falling back to what was heard if it fails); they can say more to correct it, and "Keep this" posts it. That is the **only way a piece is finished by reflection and it happens once** (the log route answers 409 to a second). A piece with a log (`node.reflected`) opens on `/read` from every entry (writing page guard, canvas cards, single-piece redirect, `/reflect` itself); the Reading room's "Keep editing" (and the ribbon's Write) add `?edit=1` to get back into the writing. The log's `thread` is no longer asked; `feeling` is new (migration 039, manual apply; reads and the write fall back without it). The conversation is kept in localStorage per piece until it is finished. The Reading room says nothing of being finished (being there is that; 2026-10-25), and on a phone its buttons have a row of their own under the title. Preview: `/dev/reflect?node_id=node-1` (fake dictation `window.__say('…')`, mocked model that runs the real ordering rules), `/dev/work-page?finished=1`

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
- **What it reads** is decided in one place, `canvasText()` in `lib/studio/vision/canvas-text.ts`: every word written on the canvas (purpose, rules, each piece's purpose and core concept, tasks, threads, and the words written on an image, recording or palette). Never an image, a recording, or the writing inside a piece. The conversation inside a part (`/companion` with a `node_id`) is the one that may see prose, and it is a different conversation.
- **The page** is mostly the canvas itself, read out. Three things are added, each only because the person asked or agreed: a reading of the canvas (`/vision/reading`, made on request, dated, goes stale when the canvas changes): the places it does not hold together, shown under Still open, and for a project of two or more pieces one short statement, "The pieces together", under the pieces. That statement must say only what shows when the pieces are held side by side, never a rewording of any piece's truth, conviction or journey or the project's purpose: the prompt forbids it and `together.ts` checks it (more than 30% of its four-word runs already on the page and it is asked for once more, then dropped). A single piece gets no statement. The earlier "As it stands" section was removed 2026-10-16 for repeating the core concept, decisions and open questions heard in talk (`lib/studio/vision/hear.ts`, offered, never added silently, quote checked word for word). All of it lives in `studio_projects.settings.vision`; change it only through `changeVision()`, which re-reads the row first.
- **The core concept is mirrored, not copied.** A piece's core concept lives only on its root node (`core_truth`, `intent` as the conviction, `emotional_journey`, `open_threads`). The vision room (each piece, folded open on the page) and the concept on the writing page (`ConceptPanel`) are the same component, `components/studio/work/concept-mirror.tsx`, and both change it through one route, `/api/studio/projects/[id]/concept` (`lib/studio/vision/concept.ts`). So the concept is no longer read-only after it is locked: each part can be rewritten, open threads added, answered or let go, and every change is kept with its date and where it was made in `settings.vision.changes`, shown beside the part it changed. Editing a concept is open on every plan; what comes out of the room's talk is Direction's.
- **Talk keeps the concept moving.** Beside each reply, `hearVision()` (deep model) listens for a decision, an open question, and a change to a piece's core concept, each tied to the piece it is about. A decision lands in Decided and in that piece's concept under "Decided since it was locked". An open question, once kept, stays in `settings.vision.kept` tied to its piece (or the whole project), and is shown apart from the open threads the concept was locked with: under "Still open" on the vision page, and as "Raised in the vision room" in the concept on the writing page. Who the work is for is part of the concept (the journey is those people's journey), so a realisation about it is offered as a change to the journey or conviction. Concept changes are always offered, never applied on their own: the person's decision (2026-10-15). A change is offered as a card (`settings.vision.pending_changes`) showing the part now and after; accepted, it rewrites the field. Nothing is changed without the person's yes. The listener sees the last three exchanges too, because a realisation usually builds over several messages and lands as "yes, that's it".
- **"Bring this into the core concept"** (in the talk, once the person has said two things): `lib/studio/vision/rethink.ts` reads the whole conversation against each piece's concept with the strongest model and offers every part that moved (truth, conviction, journey, and the open threads as a whole list), each with a sentence on what moved it and the person's own words quoted (checked in code: a realisation only the companion had is dropped). Several can be accepted at once ("Change them all", `apply_all`). This is what lets a concept drawn from the short brief catch up with what talking it through made clear. In a one-piece project the project's "what it is for" follows the conviction when it changes (`followConviction`), unless the person has written their own words there since.
- **The page's layout and look** (2026-10-15, by the person's direction; changed 2026-10-17): it opens on what the whole thing is for; each piece in "The pieces" is led by its core truth and folds open to its core truth and journey (the conviction is not on this page, and the core truths no longer stand at the top); "Still open" holds what was raised here and, in a collapsible group that always starts folded, the concept's own open threads. Leaving the room plays the way in backwards. One design language for the whole column (in `vision-page.tsx`): each section a tinted mark, label and count; each thing a tile; each kind its own colour and mark (decisions as green ticks on a line through time, open questions as tide question marks). The concept parts embedded there use `ConceptMirror`'s `look="room"` so they match. Keep new elements to this language.
- **Past conversations** (migration 035): every visit opens on a new conversation, with "Past conversations" above it; "Start a new one" begins another, "Past conversations" lists them with their titles and summaries, and picking one carries it on. Every conversation sees the same page, so what was settled in an old one is known in a new one.
- **It looks things up.** The talk route gives the model a web search (`web_search_20250305`, at most three per reply). That older tool type is deliberate: it is the one that returns the page each sentence came from. Each search is metered (`costMicros`).
- **Model:** `MODELS.vision` (Opus 5.5). Thinking is always on and counts toward `max_tokens`; it takes no `temperature`. Past the fair-use soft cap the fast model stands in, without search. If Opus declines a subject, `streamClaudeText`'s `fallbackModel` asks `MODELS.deep` once.
- **What it must never do** is in `VISION_ROLE` (`lib/studio/vision/prompts.ts`): make the work, say whether the work is good, measure or promise how it will perform, bring in another project.
- **Preview without an account:** `/dev/work-page?plan=direction&board=1&pieces=1`, then the button at the bottom of the canvas. The server is faked there, including a slow lookup with sources.

---

## Phones

Two different questions, answered in two different ways. Do not mix them.

- **Is there room?** (layout) is a width media query at the Dock's breakpoint, 720px (`DOCK_DESKTOP_MIN` in `components/shell/dock.tsx`; `useNarrow()` in `components/studio/work/bits.tsx` where it has to be known in code). Below it the Dock is along the bottom, so anything else fixed to the bottom stands above it: the canvas's zoom controls (`.zoom-pill`), the rail's tools (`.rail-bar`) and panels. The writing page's section marks (`.section-dock`) are for a computer only: hidden below it.
- **Is this a phone?** (what the person is asked to do) is `usePhone()` in `src/lib/use-phone.ts`: a touch screen whose short side is under 600px and which is clearly taller than wide. A tablet is never one. A foldable is one shut (its cover screen is a phone's) and not one open, and the answer follows the fold. A narrow window on a computer is never one. The rule is tested in `use-phone.test.ts`.
- **On a phone the canvas is for looking, and for adding.** `Board` treats a phone as it treats a project the plan is not carrying (`disabled`): nothing can be moved, connected, renamed or removed. The exceptions (the person's) are the corner "+" (2026-10-21), task lists (2026-10-25: ticking, adding and rewording tasks; no dragging or moving between lists, 2026-10-26; a press on the list opens it, only the tick completes), and a thought on the go's tick (2026-10-27). Rewording and taking off a thought on the go are PC-only. The "+": everything it makes can be made on a phone (`AddFan compact`, a size down; the add dialog stands at the top, clear of the keyboard), the board decides where it lands, and the view glides to it; a note says so once per browser, at the top, for a few seconds (`PhoneBanner`), and a finger put down on a card moves the ground (`lookOnly` in `useCanvas`). Every card is the narrowed size there (`CROWDED_MIN_W` wide, whatever the number of pieces; the person's decision, 2026-10-25), and it opens on the first card (`PHONE_ZOOM`, `PHONE_CARD_AT` in `board.tsx`): its left edge 40px in, the title above it, a third of the way down; "Talk about the vision" and the "+" share the bottom row there (launcher left, "+" right), and has no zoom pill: two fingers pinch to zoom and drag the view together (`useCanvas` in `surface.tsx`, on any touch screen, even when the fingers land on cards). Every board is laid out at one size, `BOARD_FRAME` (1440×900) in `board.tsx`, whatever the screen, and a screen only changes how far in it looks: with cards sized by the window, a piece placed by hand on a computer stood far from its neighbours on a phone (2026-10-20). Piece cards cannot be moved by hand (the person's decision, 2026-10-27): they stand in the lane in their order on every screen (an example keeps the owner's arrangement). Other things can be put anywhere on the board, the top included, and an element (an image, task list, link, palette, recording, note or thread) may also stand in the lane between two cards: carried over the row it already holds its place (no marker: the cards to its right slide along, and further for each element added beside it, measured against the row without it so the cards never jump under the pointer), and it is kept as `content.lane` = `{ after: pieceId | null, n }` (`laneLayout` / `lanePlaceAt` in `board-items.ts`); everything to its right slides along. A thread's hub stands in the lane through its own `board_x` / `board_y` (no column: `THREAD_LANE_Y` flags it, `threadLaneEncode` / `threadLaneDecode`; it follows a piece by that piece's number in the row, so removing a piece earlier in the row can move it one place). A button beside the zoom pill chooses small piece cards (the phone's size; `companheiro.small-cards` in the browser). A tap still opens a piece. Thread suggestions and things carried from a check-in are not offered there (`work-page.tsx`). Add nothing else to a phone's canvas that needs arranging.
- **"Talk about the vision" is offered on a phone** (since 2026-10-18, the person's decision): the room takes turns between its halves there, Vision first then Talk, in the same glass as the way back, with only the star in the middle of the header.
- **The writing page on a phone**: the rail's tools are a glass bar along the bottom, standing over the Dock (`Rail bar`; it comes down when the Dock steps away), not a column over the words, and panels open the width of the screen and stop above it (`Drawer aboveBar`); the section marks are not shown; the section names are drawn at the size of their numbers (set at 16px and scaled, because a field smaller than 16px makes Safari zoom: `.part-title` in `studio.tsx`); the title keeps to two lines (`clampOnPhone`) and the breadcrumb leaves out the piece it is already titled with.
- **Nothing may depend on hover.** Controls a mouse reveals by resting on a card are shown outright where nothing can hover (`useNoHover()`), and are not pressable while unseen.
- **Padding on a phone:** a `Container` given a plain number narrows to 12px and reaches 8px into the page gutter (`.shell-container` in `globals.css`), so page gutter + container + card do not leave a card's words two thirds of the screen. A row that holds words beside a wide control (a select, two pills) should wrap (`flexWrap`), as the Settings rows do.
- **Message boxes** carry `className="composer-row"`: on a phone the box takes the row and the microphone and Send sit under it.
- **Small marks** stay small to look at and get a finger's size to press, either by a media query (`.section-tool`, `.part-action`, `.storyline-mini`) or by an unseen `before:` area (`UnderlineLink`, the card menu on the Project Board).
- **Preview:** the Browser pane's phone size reports itself as a touch phone, so `/dev/work-page?plan=direction&board=1&pieces=1` shows the view-only canvas there; its tablet size does not.

---

## Plans and what they allow

One place decides what a plan includes: `entitlementsFor()` in `src/lib/billing/entitlements.ts` (pure, shared by server and browser). Never branch on `subscription.tier` anywhere else.

- **The plan the code calls `practice` is shown to people as "Focus"** (since 2026-10-12; `PLAN_LABEL` in `src/lib/billing/chosen-plan.ts`). "Practice" read as rehearsal, as if the work were not yet serious. The id, the database value, the URL parameter and Stripe's metadata are all still `practice`; only words a person reads changed. Below, "Practice" means that plan.
- **Trial** (30 days): everything Direction has. **Practice**: two active projects at a time (`PRACTICE_ACTIVE_PROJECTS`), threads, task lists and notes on the canvas but no new images, recordings, palettes or links (all four are `media`; since 2026-10-19), no "Talk about the vision", Idea Lab questions from the fast model first. **Direction**: no limits. **Ended** (trial ran out, plan cancelled): Practice's shape with the companion off. **Grandfathered**: everything.
- **Server checks** live in `src/lib/studio/plan-access.ts`: `assertWorkable` / `assertNodeWorkable` / `nodeGate` (is this the project being worked on?), `assertFeature` (threads, media, visionTalk), `claimActivePlace` (moving into Active: when it is full the person names which project rests for 14 days via `rest_id`; the downgrade choice keeps up to the limit via `keep_ids`). Resting only changes where a project sits, never its contents, `stageForNewProject` (new projects land in the Queue when the place is taken). Any new route that changes a project's content should call one of them.
- **The place in Active** is `studio_projects.shelf_stage = 'active'`. A project that gives it up to another rests (`resting_until`) for `REST_DAYS`; when it left is kept in `settings.left_active_at`.
- **Shown greyed, never hidden**: something Direction has and the person's plan does not stays where it is, dimmed, with a "Direction" tag, and pressing it opens a `PlanNote` (the canvas's "+" rows for a thread, an image, a recording; "Talk about the vision"). Decided with the person 2026-10-13. What has no button (suggested threads, the deep model in the Idea Lab) is simply not offered.
- **A plan that changes under an open tab** (a free month running out, a move up or down in Stripe's portal) is noticed on coming back to the tab: `planIsStale()` in `use-plan.ts` decides when to ask again. `AccessGate` then says what arriving would have said (the ended notice, the choice of which projects stay) and an open project reads its `access` again. Moving up asks nothing. In the preview, `__changePlan('practice')` from the console does it.
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
