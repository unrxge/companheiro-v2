# BUILD SPEC — the project canvas (Companheiro studio)

Final, authoritative. Synthesised from the winning design ("canvas engine outward") with every judge-flagged idea grafted from the other two and every named flaw fixed. Where designs contradicted each other, the contradiction is resolved in section 1 and never reopened. Eight implementation lanes (A first and alone, then B–H in parallel) build from this document alone; the ownership map in section 11 is exhaustive and disjoint.

Scope reminder (from the brief, not reinterpreted): a separate Next.js 15 app in `studio/` on the same Supabase project; every table `studio_`-prefixed; nothing in the existing app is touched; Direction tier, everything unlocked; the first deliverable is the project canvas and everything it entails (shelf, creation, canvas builder with the full block library, since-you-were-here, talk, compass, minimal draft studio, read-only phone view). Six principles are checked first on every feature; plain-language rule: no invented capitalised feature names.

Reading order for an implementer: section 1 (decisions) → section 11 (your lane and files) → the sections your lane touches → section 12.

---

## 1. Decisions

Every choice an implementer might otherwise make differently. One line each. Referenced elsewhere as D-nn. `DECISIONS.json` mirrors this list.

### Coordinates, grid, viewport

- D-001 Grid unit U = 8 world px. World units are canvas px at zoom 1. Block x, y, w are integers and multiples of 8; h is an integer (measured heights are rounded UP to a multiple of 8 before being stored).
- D-002 Viewport is affine: screen = world·k + t, stored as `{ tx, ty, k }` on `studio_projects.viewport`. k ∈ [0.1, 3]. Initial viewport for a new project `{ tx: 80, ty: 80, k: 1 }`.
- D-003 Zoom about the cursor: `zoomAt(v, pScreen, kNext)`; wheel with ctrl/meta (trackpad pinch arrives as ctrlKey wheel) → `k · exp(−deltaY · 0.0025)`; plain wheel pans; `+`/`−` keys step ×1.2 / ÷1.2 about the stage centre.
- D-004 `fit(rect)` pads 80 screen px, clamps k to [0.1, 1.25]. Key `1` = fit all live top-level blocks; `Shift+1` = fit selection; `0` = k 1 about the stage centre. Phone initial viewport = fit(all) with k clamped ≥ 0.35.
- D-005 Wheel deltaMode normalised: mode 1 ×16, mode 2 ×viewport height. `wheel`/`pointermove` listeners are `passive: false` on the stage element only.
- D-006 Snap threshold 6 screen px → `6 / k` world px. Guides beat grid whenever both are within threshold; among guides the smallest distance wins; x and y are independent. Shift held while dragging disables snapping for that gesture.
- D-007 Snap neighbours = live, visible, non-hidden, non-stacked blocks within the viewport rect expanded by 400 world px on each side, excluding the move set, capped at the 200 nearest by centre distance; frames also contribute their inner edges (inset 16). Resize snaps only the dragged edge(s) and excludes centre targets.
- D-008 Drag threshold 4 screen px. Double-click timing 350 ms.
- D-009 Grid is drawn in SCREEN space on the stage element (CSS radial-gradient `background-image`, `background-size = step·k`, `background-position = (tx mod step·k, ty mod step·k)`). step = k < 0.5 ? 64 : k < 1.5 ? 32 : 8 world px. Dot radius 1 screen px, never scales. Alpha multiplier `clamp((k − 0.25) / 0.25, 0, 1)`. Hidden when grid is off (G).
- D-010 Culling: mount only blocks whose rect intersects the viewport expanded by 400 world px each side; culled rows still feed snapping. Below k < 0.3 every mounted block renders its chip (8 px accent dot + first line, mono 10, no images, no editors).

### Block registry (default sizes, handles, growth)

- D-011 Object classes: `paper` (padding 16, radius 12, cardBg), `paperless` (no padding, no surface: anchor, heading, divider, since), `media` (padding 0, radius 10 on the media, caption inset 16: image, gallery). Every block is a rectangle; no rotation, no free fonts, no per-block colour.
- D-012 Auto-height types (width is the person's, height is the content's, E/W + corner handles change width only): concept, since, update, timeline, draft, anchor, note, reference, commitment, compass, heading, recording, palette, image (height = w / aspect + caption). Fixed-size types (all 8 handles): frame, gallery. Fixed-height width-only: divider (h 8).
- D-013 Default sizes in world px (w × h; "auto" = measured, the number is the estimate used before measurement): concept 1008×160 · since 1008×40 · update 320×96 · timeline 320×240 · draft 320×136 · anchor 664×88 · note 320×96 · reference 320×112 · commitment 320×64 · compass 320×200 · frame 512×384 · heading 384×48 · divider 256×8 · image 320×(320/aspect) · gallery 664×400 · recording 320×120 · palette 320×96.
- D-014 Min/max widths (world px): concept 480–1200 · since = concept · update 224–512 · timeline 288–512 · draft 256–448 · anchor 192–1008 · note 160–640 · reference 192–512 · commitment 224–512 · compass 224–384 · frame min 128×96 · heading 128–1008 · divider 64–1920 · image 96–1200 (aspect locked) · gallery min 192×144 · recording 256–448 · palette 192–640.
- D-015 Measured height comes ONLY from a ResizeObserver on the block's inner content (rAF-throttled, ignored during drag/resize, disconnected when culled), written to `store.h` and persisted; never read `offsetHeight` in a pointer handler.
- D-016 Text blocks never scroll or clip on the canvas: they grow. Only the timeline block folds (shows the 6 newest rows + "n more" line; the full list lives in the right dock and the phone sheet).
- D-017 Library placement: click a tile → the block is created at the snapped stage centre; drag a tile → at the snapped drop point. In both cases `placed_by = 'person'` and `arrival_state = 'placed'` unless D-064 (auto_layout) applies.

### Z-order, frames, links

- D-018 z is an integer, unique per project, assigned max(z)+1 on create. Render order = sort by (depth, z) so children always paint above their frame. NO bring-to-front on click or drag. `Cmd/Ctrl+]` / `[` step one; with Shift = to front/back. Layers list drag-reorder reassigns contiguous z for the affected range as one command.
- D-019 Frames hold children by `parent_id`; children keep ABSOLUTE world coordinates. Nesting depth ≤ 2 (a frame inside a frame is allowed once; a frame cannot enter a frame that already has a parent). Enforced by DB trigger and in `frames.ts`.
- D-020 Reparent on drop: the deepest live, unlocked, non-collapsed frame whose inner rect (inset 16) contains the primary block's centre becomes the parent; ties by higher z. If the dropped block overflows the frame, the frame grows to contain it + 16 px (bundled into the same MoveCommand). Dragging out clears the parent.
- D-021 Frame bar is 48 px tall (name as eyebrow + chevron). Collapse: `collapsed = true`, `content.expanded_h = h`, `h = 48`; children become hidden-by-ancestor (computed, not persisted). Deleting a frame reparents its children to null and leaves them in place (no dialog).
- D-022 `F` wraps the selection in a new frame = union bbox + 24 px on each side; children reparented; frame `placed_by 'person'`.
- D-023 Links: straight 1 px hairline (textPrimary at 0.35) between the nearest pair of edge midpoints of the two rects, `vector-effect: non-scaling-stroke`, drawn in the world-space SVG; a 8 px gap from each edge; optional word (≤ 24 chars) as mono 10 uppercase on a ground-coloured chip at the midpoint. Unique per (from, to). Links never leave a project (DB trigger). Hover a link → tide; a small × at the midpoint deletes.
- D-024 Link mode (`L` or context bar): first click = from, second click = to, then the word popover (Enter = save, Esc = no word). Esc leaves link mode.

### Selection, editing, undo, autosave

- D-025 Selection is a Set of block ids; primary = last added. Marquee selects by intersection; a frame fully inside the marquee is selected and its descendants dropped from the set. Multi-selection draws one dashed 1 px tide outline around the union bbox with no handles (no multi-resize, deliberate). `Cmd/Ctrl+A` selects every unlocked, unhidden, top-level block.
- D-026 The since block is never selectable and never draggable; it is pinned under the concept: `x = concept.x`, `w = concept.w`, `y = concept.y + concept.h + 8`. The concept's move set ALWAYS includes its since row. Concept, since and compass refuse delete and duplicate. Locked blocks are selectable only from the layers list. Hidden blocks never render.
- D-027 In-place text editing uses plain auto-growing `<textarea>` elements (never Tiptap/contentEditable inside the scaled world). Tiptap lives only in the unscaled draft studio. Double-click (or Enter on a single selected text block) enters editing; blur or Esc commits.
- D-028 Interactive elements inside blocks (textarea, checkbox, buttons, links) carry `data-no-drag`; the pointer machine ignores `pointerdown` whose target is inside `[data-no-drag]` (and inside the block being edited).
- D-029 Undo/redo: a command stack (cap 200, session-only). Every Command exposes `apply/revert` and `patch()`; autosave consumes the patch, so undo and persistence share one pipe. Coalescing: same `key` within 500 ms merges (`move:<ids>`, `nudge:<ids>`, `resize:<id>`); an edit session (focus→blur) is one command; viewport changes never enter the stack. Deletes are soft (`deleted_at`) so undo is exact.
- D-030 Autosave: local store is the truth; dirty ids are flushed with debounce 600 ms / maxWait 3000 ms as FULL rows (never partial rows — PostgREST upsert builds the insert tuple before conflict resolution, so partials fail NOT NULL) in chunks of ≤ 40 rows per request; `fetch(..., { keepalive: true })` on `pagehide` and `visibilitychange → hidden` (each chunk stays under the 64 KB keepalive cap). Retry ladder 1 s → 3 s → 9 s → every 30 s; the mono word in the bottom-left reads `saved` / `saving` / `unsaved`; 401 shows `sign in again` and keeps dirty in memory.
- D-031 Two tabs: last write wins per row. `studio_projects.canvas_version` is bumped once per batch BY THE ROUTE (not a per-row trigger). The client polls `GET …/since` every 60 s while visible and on `visibilitychange → visible`; if `canvas_version` differs and dirty is empty it refetches blocks/links/compass and merges rows whose `updated_at` is newer (never touching blocks in the current move set); if dirty is non-empty it flushes first, then refetches.
- D-032 "Since you were here" window: `studio_open_project` rotates `opened_before_at ← last_opened_at` only when `last_opened_at` is older than 30 minutes, then sets `last_opened_at = now()`; a reload inside a session does not erase the window. The sentence is derived deterministically (no model call) from the `studio_since()` payload.

### Placement semantics, tidy, arrivals

- D-033 `placed_by ∈ {auto, person}`: "placed by hand" means the person dragged, resized, nudged, placed-by-drag, created from the library at a point, framed, or z-reordered it. Tidy never moves a `person` block. `arrival_state ∈ {placed, unplaced}`: `unplaced` = arrived from talk and not yet placed/dismissed.
- D-034 Tidy (T): obstacles = person-placed blocks ∪ frames ∪ frame descendants ∪ unplaced arrivals ∪ locked; movable = live top-level `auto` `placed` blocks; runs `compose()` around the obstacles; one undoable TidyCommand; 320 ms transform transition applied via a class toggled on the world for that commit only; then `fit(all)` if any moved block left the viewport. Shift+T = tidy everything (confirm dialog) → also moves `person` blocks and sets them `auto` afterwards.
- D-035 Updates stack: when tidy finds ≥ 8 placed single update blocks, all but the 3 newest get `stacked_in = <timeline id>` (an existing timeline block in the project, else a new one created at the oldest update's rect). Stacked updates keep their own rows, links and struck state; they are not rendered, snapped, culled or selected individually. Dragging a row out of the timeline (or "unstack" in the dock) clears `stacked_in` and places it by hand.
- D-036 Edge arrival: arrivals column x = `snap8(bbox(settled).maxX + 48)`, y stacks downward from `since.bottom + 24` (or bbox top) below the last unplaced arrival + 24; a new column 344 px further right starts when the column would exceed `bbox.bottom + 384`. Computed server-side at insert time and stored (one truth: the row's x/y).
- D-037 Place (footer button or dock): `arrival_state = 'placed'`, `placed_by` stays `auto` and, while D-064 applies, the block is composed into its region; otherwise it stays where it is. Place by dragging: `placed`, `person`. Dismiss: soft delete (undoable in-session); the talk entry keeps the words.
- D-038 Off-screen arrivals: a tide pill at the stage's right edge reads `2 arrived →`; click = pan to the arrivals column.

### Phone

- D-039 `phoneMode = innerWidth < 720 || (matchMedia('(pointer: coarse)').matches && innerWidth < 740)`; re-evaluated on resize. iPads (≥ 744 px) stay in builder mode.
- D-040 Phone is the same Stage with `interactive = false`: one finger pans, two pinch, tap a block → bottom sheet (100 dvh, radius 22 top) with the block's expanded content; no docks, handles, marquee, keyboard; the since line is fixed at the top; a talk bar is fixed at the bottom; arrival markers show with `dismiss` only and one mono line `place it from a larger screen`.

### Keyboard (global; ignored while an input/textarea has focus, except Esc)

- D-041 Arrows nudge 8 px (Shift 40) · Delete/Backspace soft delete · Cmd/Ctrl+D duplicate (+16,+16, new ids, links not copied, arrival fields cleared) · Cmd/Ctrl+Z undo · Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y redo · Cmd/Ctrl+A select all · Esc (leave mode → commit edit → deselect → close drawer, first that applies) · 1 fit all · Shift+1 fit selection · 0 100 % · + / − zoom · Space+drag pan · S snap · X size labels · G grid · T tidy · Shift+T tidy everything · L link mode · F frame selection · Enter edit/open · Cmd/Ctrl+] / [ z step (Shift = front/back) · Cmd/Ctrl+Shift+H hide · Cmd/Ctrl+Shift+L lock · Cmd/Ctrl+K open talk · / library with search · ? key map. Strike has no key (context bar / dock only).

### Colours, chrome geometry, naming

- D-042 Selection = tide (`t.tide`), 1 px outline drawn 1 px outside the rect in the screen-space overlay (x+0.5 alignment). Handles 8×8 px squares, fill `t.cardBg`, 1 px tide border, radius 0, 16×16 hit area; shown only on single selection. Hover = 1 px hairline (textPrimary at 0.14). Marquee = 1 px dashed tide, fill tide at 0.08.
- D-043 Ember is the system's pencil and nothing else: smart guides (1 px), distance/gap labels (mono 10 on an ink pill), the strike line, the catch marker. Tide marks selection and arrivals (8 px tide dot with a slow pulse at the block's top-left corner, −4,−4). Type accents use only verdant (commitment checkbox), violet (draft dot), ochre (anchor warm rule). Every other block is ink on paper.
- D-044 Ground: the stage is the container layer (`t.containerBg`: bone #ece8de light / coal #161412 dark) under a constant ink top bar; the shell (ink + Atmosphere `neutral`, intensity 0.5, paused during drag) shows only behind the top bar and the drawers' dim. Chrome never toggles with theme; ground and paper do.
- D-045 Chrome geometry: top bar 48 · left rail 48 with a 280 pop-over panel · right dock rail 48 with a 320 panel · drawer 420 (draft studio 760, `wider` toggles to 100 %) · context bar 32 tall, 8 px above the selection's screen bbox, clamped in the stage · zoom pill 28 tall bottom-left · talk pill 44 tall bottom-right. Panels: `rgba(13,12,11,0.74)` + `backdrop-filter: blur(18px) saturate(1.1)`, 1 px `shell.line`, radius 16. Drawers: `t.containerBg`, 1 px `shell.line` left edge, no dim of the canvas (it stays pannable), swap content in place.
- D-046 Radii: paper block 12 · frame 16 · panel 16 · media 10 · gallery tile 8 · swatch 6 · context bar 10 · handle 0. Shadows: none at rest and hover; `0 12px 28px rgba(0,0,0,0.45)` while dragging only. No scale on hover or drag.
- D-047 Icons: lucide-react 16 px, stroke 1.5; hover = translateY(−1px) + opacity .7→1 over 150 ms; nothing else animates on hover.
- D-048 Names: all UI text lowercase plain names — `the shelf`, `talk`, `direction talk`, `compass`, `since you were here`, `tidy`, `tidy everything`, `place`, `dismiss`, `strike`, `unstrike`, `link`, `frame`, `layers`, `library`. Block type words in eyebrows are uppercase mono (chrome), lowercase in sentences.
- D-049 Never shown anywhere: word counts, talk counts, streaks, badges, tab counters, completion percentages, "n days since", any performance number. The only numbers on screen are dates, resting days remaining, grid sizes (when X is on), `n arrived`, `n waiting`, and counts inside the compass.

### Data, talk, compass

- D-050 One migration file `studio/supabase/migrations/001_studio_foundation.sql`; 11 tables; RLS `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)` on every table; `user_id` denormalised on every row so no policy joins.
- D-051 The main app's `portrait_entries` is READ ONLY by the studio (select, own rows via RLS) to shape how the companion speaks; the studio never writes to it and adds no enum value. A copied `lib/portrait-read.ts` holds `getActivePortrait` + `formatPortraitForPrompt` only. No second portrait table.
- D-052 Commitments are compass entries (`kind = 'commitment'`) with `asked_at`, `ask_count`, `resolution`, `resolved_at`; the commitment block holds only `{ entry_id }`. A commitment proposed by talk is inserted `pending` AND its block arrives at the edge at once. Placing the block confirms it (active); dismissing rejects it; confirming in the compass drawer activates it without moving the block; rejecting in the drawer soft-deletes the block. Only active, unresolved commitments are asked about.
- D-053 The compass block is read-only on the canvas (counts + first statements + `n waiting` line). The four verbs (confirm · correct · reject · forget) and marks on catches live only in the compass drawer (desktop) / compass sheet (phone). Nothing becomes active without one of those verbs, except the place-to-confirm rule for commitments (D-052), which is also a person's action.
- D-054 Talk pipeline = one request, one stream: MODELS.deep reply streamed; MODELS.fast "sort" started concurrently; the copied `streamClaudeText` gains an async-capable `buildMeta`; meta waits for the sort and its application (typical 1–2 s after the reply's last token) and carries applied ids. Person entries carry `sorted_at`; `POST …/open` sweeps person entries older than 2 minutes with `sorted_at null` (sort + apply, no reply) so a closed tab never loses an update.
- D-055 Verbatim in code: every update text, commitment text, decision text and compass evidence quote must be a normalised substring of the person's entry (`lowercase, strip punctuation, collapse spaces`) or it is dropped. Caps per talk: 1 update, 2 commitments, 3 compass proposals, 3 decisions. Anchor lines are never proposed by talk (the person makes one from an update in the dock: `make an anchor line`).
- D-056 The catch: a decision that collides with an ACTIVE refusal or non-negotiable. The sort (fast) only flags candidates; MODELS.deep confirms and writes the sentence in the companion voice (observation, both quotes, no order). One `studio_catches` row per (refusal_entry_id, person_entry_id), and never a second catch for the same refusal within 30 days while one is unmarked or marked right. Spoken once as a companion entry with `catch_id`; markable `right` / `wrong` from the talk drawer or compass drawer; marks feed later context ("where you said the companion was wrong").
- D-057 Sort categories: update, commitment, refusal, non_negotiable, drift, decision, done_commitment_ids. No win/worry/feeling labels; no valence colouring. Drift is proposed only when the entry contradicts an active refusal/non-negotiable (and then both quotes are kept as evidence).
- D-058 Compass lifecycle mirrors the portrait: `pending → active` (confirm; correct keeps `proposed_statement`), `pending → rejected`, `active → dormant` (forget, or 150 days without reinforcement; drift 30 days), `dormant → active` (restore). Reinforce via RPC with evidence appended. Pending cap 8 per project (older pending beyond 8 become dormant with `rejection_note 'expired'`). No automatic promotion of refusals to non-negotiables.
- D-059 Media privacy is structural: `CompanionReadable` (the only type the prompt builder accepts) has no url, asset_id, storage path or swatch; the DB forbids a transcript on a non-own-voice asset; reference pages are never fetched; image sizes come from client-side resize (max edge 1600 + 480 thumb), never from storage transforms.
- D-060 Statuses: `active`, `resting` (trigger sets `resting_until = now() + 14 days` and refuses waking early; shown as `resting · n days left`), `finished`, `kept`, `abandoned` (each with `completion_note`, `completed_at`). Many active projects allowed. Resting and completed projects open read-only (no arrangement; talk still works and arrivals still land).
- D-061 New project creation produces: title, concept revision (body + constraints), the three permanent blocks (concept, since, compass), the anchor lines the person ticked (verbatim from their own words), reference blocks for URLs they pasted, and pending compass proposals seeded from their answers to "what will you not do" and "what must it keep". No draft is auto-created.
- D-062 The concept is edited in place inside the concept block (title, body, constraints as lines); saving inserts a dated `studio_concept_revisions` row; the block itself stores nothing (the bundle carries the latest revision).
- D-063 Draft studio is minimal: sections (Tiptap, `SectionEditor` + `PendingEditMark`), per-section lock, per-draft posture `suggest | ask | locked`, a chat drawer using `<proposed_edit>` tails hidden from the stream, an anchor rail that READS the project's live anchor blocks. No word counts, no translation, no publication.
- D-064 `studio_projects.auto_layout` starts true and flips to false (once, forever) on the person's first hand placement. While true, blocks added from the library or placed from the arrivals column are composed into their region so the first session stays composed without effort; heading/divider/frame are always hand-placed.
- D-065 Timestamps and copy: dates in the UI are lowercase `12 sep`, relative time via the copied `formatDateAsRelative`; every generated user-facing text goes through `COMPANION_TONE` first and `withLanguage()` last; every model call calls `logUsage`.
- D-066 Models: reply MODELS.deep 1024 tokens (direction 2048); sort MODELS.fast 700 tokens temperature 0; catch check MODELS.deep 300 tokens; concept draft MODELS.deep 1200 tokens; draft chat MODELS.deep 4096 tokens; punctuate as copied. All talk routes export `maxDuration = 60`.
- D-067 Tests run with `tsx --test` (already in package.json): pure modules in `lib/studio/layout`, `lib/studio/engine/{snap,viewport,commands}` and `lib/studio/talk/{verbatim,since}` have unit tests; `npm run typecheck` and `npm run build` must pass at the end of lane A and again at the end of every lane.

---

## 2. Migration SQL

Complete content of `studio/supabase/migrations/001_studio_foundation.sql`. Apply once in the Supabase SQL editor of the shared project. Creates only `studio_`-prefixed objects plus the private `studio-media` bucket. Lane A owns this file; no other lane edits the schema.

```sql
-- ============================================================================
-- 001_studio_foundation.sql — Companheiro studio: the project canvas
-- Same Supabase project as the main app. Every object is studio_-prefixed.
-- Every table: uuid_generate_v4 ids, timestamptz created_at, user_id on every
-- row, RLS auth.uid() = user_id (using + with check). Nothing in the main
-- app's schema is touched; portrait_entries is only ever SELECTed by the
-- studio's API under the person's own RLS.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── enums ───────────────────────────────────────────────────────────────────
create type studio_project_status as enum ('active', 'resting', 'finished', 'kept', 'abandoned');
create type studio_block_type as enum (
  'concept', 'since', 'update', 'timeline', 'draft', 'anchor', 'note', 'reference',
  'commitment', 'compass', 'frame', 'heading', 'divider', 'image', 'gallery',
  'recording', 'palette'
);
create type studio_placed_by as enum ('auto', 'person');
create type studio_arrival_state as enum ('placed', 'unplaced');
create type studio_talk_kind as enum ('talk', 'direction');
create type studio_talk_role as enum ('person', 'companion');
create type studio_talk_input as enum ('typed', 'voice');
create type studio_compass_kind as enum ('refusal', 'non_negotiable', 'commitment', 'drift');
create type studio_compass_status as enum ('pending', 'active', 'rejected', 'dormant');
create type studio_commitment_resolution as enum ('done', 'let_go');
create type studio_catch_mark as enum ('right', 'wrong');
create type studio_draft_kind as enum ('essay', 'brief', 'copy', 'lyrics', 'other');
create type studio_posture as enum ('suggest', 'ask', 'locked');
create type studio_asset_kind as enum ('image', 'audio');
create type studio_concept_origin as enum ('creation', 'edit');

-- ── shared trigger: updated_at ──────────────────────────────────────────────
create or replace function studio_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── projects ────────────────────────────────────────────────────────────────
create table studio_projects (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null default 'untitled project',
  status            studio_project_status not null default 'active',
  resting_until     timestamptz,
  completed_at      timestamptz,
  completion_note   text,
  viewport          jsonb not null default '{"tx":80,"ty":80,"k":1}'::jsonb,
  settings          jsonb not null default '{"snap":true,"grid":true,"sizes":false}'::jsonb,
  auto_layout       boolean not null default true,     -- false after the first hand placement (D-064)
  composed_at       timestamptz,                       -- null until the client's first measured composition
  canvas_version    integer not null default 0,        -- bumped once per write batch by the API (D-031)
  last_opened_at    timestamptz not null default now(),
  opened_before_at  timestamptz not null default now(),-- "since you were here" cutoff (D-032)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table studio_projects enable row level security;
create policy "studio_projects own rows" on studio_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_projects_user_idx on studio_projects (user_id, status, updated_at desc);
create trigger studio_projects_touch before update on studio_projects
  for each row execute function studio_touch_updated_at();

-- resting: 14-day floor lives in the row, not in a button (D-060)
create or replace function studio_projects_status_guard() returns trigger
language plpgsql as $$
begin
  if new.status = 'resting' and old.status is distinct from 'resting' then
    new.resting_until = now() + interval '14 days';
  end if;
  if old.status = 'resting' and new.status = 'active'
     and old.resting_until is not null and old.resting_until > now() then
    raise exception 'project is resting until %', old.resting_until;
  end if;
  if new.status in ('finished', 'kept', 'abandoned') and new.completed_at is null then
    new.completed_at = now();
  end if;
  if new.status = 'active' then
    new.resting_until = null;
    new.completed_at = null;
  end if;
  return new;
end $$;
create trigger studio_projects_status_guard before update of status on studio_projects
  for each row execute function studio_projects_status_guard();

-- ── concept revisions (edits dated and kept; the block stores nothing) ──────
create table studio_concept_revisions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid not null references studio_projects(id) on delete cascade,
  body         text not null,
  constraints  jsonb not null default '[]'::jsonb,      -- string[]
  origin       studio_concept_origin not null default 'edit',
  created_at   timestamptz not null default now()
);
alter table studio_concept_revisions enable row level security;
create policy "studio_concept_revisions own rows" on studio_concept_revisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_concept_revisions_project_idx on studio_concept_revisions (project_id, created_at desc);

-- ── blocks: everything on the canvas ────────────────────────────────────────
-- World px; x/y/w multiples of 8; h measured for auto-height types (D-001).
-- Children of frames keep ABSOLUTE coordinates (D-019). Soft delete (D-029).
create table studio_blocks (
  id             uuid primary key default uuid_generate_v4(),  -- client-generated for creates
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references studio_projects(id) on delete cascade,
  type           studio_block_type not null,
  x              integer not null default 0,
  y              integer not null default 0,
  w              integer not null default 320,
  h              integer not null default 96,
  z              integer not null default 0,
  parent_id      uuid references studio_blocks(id) on delete set null,   -- a frame
  stacked_in     uuid references studio_blocks(id) on delete set null,   -- a timeline (updates only)
  name           text,
  locked         boolean not null default false,
  hidden         boolean not null default false,
  collapsed      boolean not null default false,                         -- frames only
  placed_by      studio_placed_by not null default 'auto',
  arrival_state  studio_arrival_state not null default 'placed',
  arrived_from   uuid,                                                   -- studio_talk_entries.id (fk below)
  struck_at      timestamptz,
  struck_by      text,                                                   -- the sentence that struck it
  content        jsonb not null default '{}'::jsonb,                     -- shape per type: types.ts
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  check (w >= 8 and h >= 8),
  check (parent_id is null or parent_id <> id),
  check (stacked_in is null or stacked_in <> id)
);
alter table studio_blocks enable row level security;
create policy "studio_blocks own rows" on studio_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_blocks_project_live_idx on studio_blocks (project_id, z) where deleted_at is null;
create index studio_blocks_parent_idx on studio_blocks (parent_id) where parent_id is not null and deleted_at is null;
create index studio_blocks_stacked_idx on studio_blocks (stacked_in) where stacked_in is not null and deleted_at is null;
create index studio_blocks_arrivals_idx on studio_blocks (project_id, created_at)
  where arrival_state = 'unplaced' and deleted_at is null;
create unique index studio_blocks_one_concept on studio_blocks (project_id) where type = 'concept' and deleted_at is null;
create unique index studio_blocks_one_since   on studio_blocks (project_id) where type = 'since'   and deleted_at is null;
create unique index studio_blocks_one_compass on studio_blocks (project_id) where type = 'compass' and deleted_at is null;
create trigger studio_blocks_touch before update on studio_blocks
  for each row execute function studio_touch_updated_at();

-- parent must be a live frame in the same project; depth stops at 2 (D-019)
create or replace function studio_check_block_parent() returns trigger
language plpgsql as $$
declare p record;
begin
  if new.parent_id is null then return new; end if;
  select type, project_id, parent_id into p
    from studio_blocks where id = new.parent_id and deleted_at is null;
  if p is null then raise exception 'parent frame not found'; end if;
  if p.type <> 'frame' then raise exception 'parent must be a frame'; end if;
  if p.project_id <> new.project_id then raise exception 'parent must be in the same project'; end if;
  if p.parent_id is not null and new.type = 'frame' then raise exception 'frames nest at most one level'; end if;
  return new;
end $$;
create trigger studio_blocks_parent_check before insert or update of parent_id on studio_blocks
  for each row execute function studio_check_block_parent();

-- stacked_in must be a live timeline in the same project; only updates stack (D-035)
create or replace function studio_check_block_stack() returns trigger
language plpgsql as $$
declare t record;
begin
  if new.stacked_in is null then return new; end if;
  if new.type <> 'update' then raise exception 'only updates stack into a timeline'; end if;
  select type, project_id into t from studio_blocks where id = new.stacked_in and deleted_at is null;
  if t is null or t.type <> 'timeline' or t.project_id <> new.project_id then
    raise exception 'stacked_in must be a live timeline in the same project';
  end if;
  return new;
end $$;
create trigger studio_blocks_stack_check before insert or update of stacked_in on studio_blocks
  for each row execute function studio_check_block_stack();

-- ── links (never leave a project) ───────────────────────────────────────────
create table studio_links (
  id             uuid primary key default uuid_generate_v4(),  -- client-generated
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references studio_projects(id) on delete cascade,
  from_block_id  uuid not null references studio_blocks(id) on delete cascade,
  to_block_id    uuid not null references studio_blocks(id) on delete cascade,
  word           text check (word is null or char_length(word) <= 24),
  created_at     timestamptz not null default now(),
  check (from_block_id <> to_block_id),
  unique (from_block_id, to_block_id)
);
alter table studio_links enable row level security;
create policy "studio_links own rows" on studio_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_links_project_idx on studio_links (project_id);

create or replace function studio_check_link_project() returns trigger
language plpgsql as $$
begin
  if (select count(*) from studio_blocks
      where id in (new.from_block_id, new.to_block_id) and project_id = new.project_id) <> 2 then
    raise exception 'links never leave a project';
  end if;
  return new;
end $$;
create trigger studio_links_project_check before insert or update on studio_links
  for each row execute function studio_check_link_project();

-- ── talk entries (daily talk + direction talk, one flat thread per project) ─
create table studio_talk_entries (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  kind        studio_talk_kind not null default 'talk',
  role        studio_talk_role not null,
  input       studio_talk_input,                     -- person rows
  text        text not null,
  reply_to    uuid references studio_talk_entries(id) on delete set null,  -- companion → person entry
  catch_id    uuid,                                  -- companion rows that speak a catch (fk below)
  sort        jsonb,                                 -- person rows: the validated TalkSort once applied
  sorted_at   timestamptz,                           -- null = not yet sorted (sweep target, D-054)
  truncated   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table studio_talk_entries enable row level security;
create policy "studio_talk_entries own rows" on studio_talk_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_talk_entries_project_idx on studio_talk_entries (project_id, created_at desc);
create index studio_talk_entries_unsorted_idx on studio_talk_entries (project_id, created_at)
  where role = 'person' and sorted_at is null;

alter table studio_blocks add constraint studio_blocks_arrived_from_fk
  foreign key (arrived_from) references studio_talk_entries(id) on delete set null;

-- ── compass entries (the portrait pattern, per project; commitments included) ─
-- Proposed by talk as 'pending'; only the person's verbs make them 'active'.
create table studio_compass_entries (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  project_id           uuid not null references studio_projects(id) on delete cascade,
  kind                 studio_compass_kind not null,
  statement            text not null,                -- current wording (the person's, after correction)
  proposed_statement   text not null,                -- what talk proposed, kept for honesty
  status               studio_compass_status not null default 'pending',
  reinforcement_count  integer not null default 1,
  last_reinforced_at   timestamptz not null default now(),
  evidence             jsonb not null default '[]'::jsonb,  -- CompassEvidence[]: {entry_id, quote, at}
  source_entry_id      uuid references studio_talk_entries(id) on delete set null,
  decided_at           timestamptz,
  rejection_note       text,
  forgotten_at         timestamptz,
  -- commitments only
  block_id             uuid references studio_blocks(id) on delete set null,
  asked_at             timestamptz,
  ask_count            integer not null default 0,
  resolution           studio_commitment_resolution,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table studio_compass_entries enable row level security;
create policy "studio_compass_entries own rows" on studio_compass_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_compass_project_idx on studio_compass_entries (project_id, status, kind);
create index studio_compass_ask_idx on studio_compass_entries (project_id, asked_at nulls first)
  where kind = 'commitment' and status = 'active' and resolution is null;
create trigger studio_compass_entries_touch before update on studio_compass_entries
  for each row execute function studio_touch_updated_at();

-- atomic reinforcement with evidence; invoker rights so RLS applies
create or replace function studio_reinforce_compass_entry(p_entry_id uuid, p_evidence jsonb default null)
returns void language sql security invoker as $$
  update studio_compass_entries
    set reinforcement_count = reinforcement_count + 1,
        last_reinforced_at = now(),
        evidence = case when p_evidence is null then evidence else evidence || p_evidence end
    where id = p_entry_id and user_id = auth.uid() and status in ('active', 'pending');
$$;

-- ── catches: a decision that collides with an active refusal, spoken once ───
create table studio_catches (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  project_id         uuid not null references studio_projects(id) on delete cascade,
  refusal_entry_id   uuid not null references studio_compass_entries(id) on delete cascade,
  person_entry_id    uuid not null references studio_talk_entries(id) on delete cascade,
  decision_text      text not null,                  -- verbatim span of the person's words
  sentence           text not null,                  -- what the companion said (MODELS.deep, D-056)
  spoken_entry_id    uuid references studio_talk_entries(id) on delete set null,
  mark               studio_catch_mark,
  marked_at          timestamptz,
  created_at         timestamptz not null default now(),
  unique (refusal_entry_id, person_entry_id)
);
alter table studio_catches enable row level security;
create policy "studio_catches own rows" on studio_catches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_catches_project_idx on studio_catches (project_id, created_at desc);
create index studio_catches_unmarked_idx on studio_catches (project_id) where mark is null;

alter table studio_talk_entries add constraint studio_talk_entries_catch_fk
  foreign key (catch_id) references studio_catches(id) on delete set null;

-- ── drafts + sections + chat (the minimal studio behind a draft block) ──────
create table studio_drafts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references studio_projects(id) on delete cascade,
  block_id    uuid references studio_blocks(id) on delete set null,
  title       text not null default 'untitled draft',
  kind        studio_draft_kind not null default 'essay',
  posture     studio_posture not null default 'ask',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table studio_drafts enable row level security;
create policy "studio_drafts own rows" on studio_drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_drafts_project_idx on studio_drafts (project_id, updated_at desc);
create trigger studio_drafts_touch before update on studio_drafts
  for each row execute function studio_touch_updated_at();

create table studio_draft_sections (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  draft_id    uuid not null references studio_drafts(id) on delete cascade,
  position    integer not null default 0,
  label       text,
  content     text not null default '',              -- Tiptap HTML (lib/rich-text.ts)
  is_locked   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table studio_draft_sections enable row level security;
create policy "studio_draft_sections own rows" on studio_draft_sections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_draft_sections_draft_idx on studio_draft_sections (draft_id, position);
create trigger studio_draft_sections_touch before update on studio_draft_sections
  for each row execute function studio_touch_updated_at();

create table studio_draft_messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  draft_id    uuid not null references studio_drafts(id) on delete cascade,
  role        studio_talk_role not null,
  text        text not null,
  created_at  timestamptz not null default now()
);
alter table studio_draft_messages enable row level security;
create policy "studio_draft_messages own rows" on studio_draft_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_draft_messages_draft_idx on studio_draft_messages (draft_id, created_at);

-- ── assets (for the eyes and ears; the companion never reads the file) ──────
create table studio_assets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references studio_projects(id) on delete cascade,
  kind          studio_asset_kind not null,
  storage_path  text not null unique,                -- '<user_id>/<project_id>/<asset_id>.<ext>'
  thumb_path    text,                                -- images: client-made 480 px-wide copy
  mime          text not null,
  bytes         integer not null check (bytes > 0 and bytes <= 26214400),
  width         integer,
  height        integer,
  duration_s    numeric(8,2),
  envelope      jsonb,                               -- audio: number[24] waveform, computed client-side at commit
  own_voice     boolean not null default false,      -- recordings: true only when the person recorded themselves
  transcript    text,                                -- ONLY when own_voice (Web Speech live capture)
  created_at    timestamptz not null default now(),
  check (transcript is null or own_voice = true)
);
alter table studio_assets enable row level security;
create policy "studio_assets own rows" on studio_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index studio_assets_project_idx on studio_assets (project_id, created_at desc);

-- ── storage: private bucket, folder = auth.uid() ────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-media', 'studio-media', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif',
        'audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg'])
on conflict (id) do nothing;

create policy "studio-media owner select" on storage.objects for select to authenticated
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio-media owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio-media owner update" on storage.objects for update to authenticated
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio-media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = auth.uid()::text);
-- Files are served through createSignedUrl (60 min) from the API; never public.

-- ── since you were here: one round trip (D-032) ─────────────────────────────
create or replace function studio_since(p_project_id uuid)
returns jsonb language sql security invoker stable as $$
  select jsonb_build_object(
    'cutoff', p.opened_before_at,
    'last_opened_at', p.last_opened_at,
    'canvas_version', p.canvas_version,
    'last_said', (select jsonb_build_object('text', left(t.text, 140), 'at', t.created_at, 'kind', t.kind)
                    from studio_talk_entries t
                   where t.project_id = p.id and t.role = 'person'
                   order by t.created_at desc limit 1),
    'arrived_since', (select count(*) from studio_blocks b
                       where b.project_id = p.id and b.arrived_from is not null
                         and b.deleted_at is null and b.created_at > p.opened_before_at),
    'waiting', (select count(*) from studio_blocks b
                 where b.project_id = p.id and b.arrival_state = 'unplaced' and b.deleted_at is null),
    'compass_pending', (select count(*) from studio_compass_entries c
                         where c.project_id = p.id and c.status = 'pending'),
    'catches_unmarked', (select count(*) from studio_catches k
                          where k.project_id = p.id and k.mark is null),
    'commitments_open', (select count(*) from studio_compass_entries c
                          where c.project_id = p.id and c.kind = 'commitment'
                            and c.status = 'active' and c.resolution is null)
  )
  from studio_projects p
  where p.id = p_project_id and p.user_id = auth.uid();
$$;

-- rotate the window only when the last open is older than 30 minutes (D-032)
create or replace function studio_open_project(p_project_id uuid)
returns jsonb language plpgsql security invoker as $$
declare v_last timestamptz;
begin
  select last_opened_at into v_last from studio_projects
    where id = p_project_id and user_id = auth.uid();
  if v_last is null then return null; end if;
  if v_last < now() - interval '30 minutes' then
    update studio_projects set opened_before_at = last_opened_at, last_opened_at = now()
      where id = p_project_id and user_id = auth.uid();
  else
    update studio_projects set last_opened_at = now()
      where id = p_project_id and user_id = auth.uid();
  end if;
  return studio_since(p_project_id);
end $$;

-- next z for a project, atomic
create or replace function studio_next_z(p_project_id uuid)
returns integer language sql security invoker as $$
  select coalesce(max(z), 0) + 1 from studio_blocks
   where project_id = p_project_id and user_id = auth.uid();
$$;

-- ── rollback (reverse order; kept for the record) ───────────────────────────
-- drop function studio_next_z, studio_open_project, studio_since;
-- drop policy "studio-media owner delete" on storage.objects; ... (4 policies)
-- delete from storage.buckets where id = 'studio-media';
-- drop table studio_assets, studio_draft_messages, studio_draft_sections, studio_drafts;
-- alter table studio_talk_entries drop constraint studio_talk_entries_catch_fk;
-- drop table studio_catches; drop function studio_reinforce_compass_entry;
-- drop table studio_compass_entries;
-- alter table studio_blocks drop constraint studio_blocks_arrived_from_fk;
-- drop table studio_talk_entries, studio_links, studio_blocks, studio_concept_revisions, studio_projects;
-- drop function studio_check_link_project, studio_check_block_stack, studio_check_block_parent,
--   studio_projects_status_guard, studio_touch_updated_at;
-- drop type (all studio_* enums).
```

---

## 3. Shared TypeScript types

Complete content of `studio/src/lib/studio/types.ts`. Lane A writes it first; it is FROZEN afterwards (a change is a cross-lane PR). Every other module imports from here and nowhere else for these shapes. No React, no runtime code except the `U` and status constants.

```ts
// studio/src/lib/studio/types.ts — the one contract client and server share.
// World units are canvas px at zoom 1. Grid unit U = 8 (D-001).

export const U = 8 as const

// ── primitives ─────────────────────────────────────────────────────────────
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport { tx: number; ty: number; k: number }        // screen = world·k + t (D-002)
export type Hue = 'ember' | 'verdant' | 'violet' | 'ochre' | 'tide'

// ── project ────────────────────────────────────────────────────────────────
export type ProjectStatus = 'active' | 'resting' | 'finished' | 'kept' | 'abandoned'
export interface ProjectSettings { snap: boolean; grid: boolean; sizes: boolean }

export interface Project {
  id: string
  user_id: string
  title: string
  status: ProjectStatus
  resting_until: string | null
  completed_at: string | null
  completion_note: string | null
  viewport: Viewport
  settings: ProjectSettings
  auto_layout: boolean
  composed_at: string | null
  canvas_version: number
  last_opened_at: string
  opened_before_at: string
  created_at: string
  updated_at: string
}

export interface ConceptRevision {
  id: string
  project_id: string
  body: string
  constraints: string[]
  origin: 'creation' | 'edit'
  created_at: string
}

// ── blocks ─────────────────────────────────────────────────────────────────
export type BlockType =
  | 'concept' | 'since' | 'update' | 'timeline' | 'draft' | 'anchor' | 'note' | 'reference'
  | 'commitment' | 'compass' | 'frame' | 'heading' | 'divider' | 'image' | 'gallery'
  | 'recording' | 'palette'

export const BLOCK_TYPES: readonly BlockType[] = [
  'concept', 'since', 'update', 'timeline', 'draft', 'anchor', 'note', 'reference',
  'commitment', 'compass', 'frame', 'heading', 'divider', 'image', 'gallery', 'recording', 'palette',
] as const

/** Types the person can add from the library (concept, since, compass are permanent; timeline is made by tidy). */
export const LIBRARY_TYPES: readonly BlockType[] = [
  'update', 'draft', 'anchor', 'note', 'reference', 'commitment', 'frame', 'heading', 'divider',
  'image', 'gallery', 'recording', 'palette',
] as const

// Per-type jsonb content. Blocks that are views onto typed rows hold only ids (no mirrors).
export type ConceptContent = Record<string, never>                      // text lives in studio_concept_revisions
export type SinceContent = Record<string, never>                        // derived at open; never persisted
export interface UpdateContent {
  text: string                    // VERBATIM span of the person's words (server-verified) or typed directly
  said_at: string                 // ISO
  entry_id: string | null         // studio_talk_entries.id when it came from talk
  origin: 'talk' | 'posted'
}
export interface TimelineContent { title: string | null }              // children: blocks with stacked_in = this.id
export interface DraftContent { draft_id: string }                     // studio_drafts row; summary in the bundle
export interface AnchorContent { text: string; source_block_id: string | null } // made by hand, or from an update
export interface NoteContent { text: string }                          // plain text, \n kept
export interface ReferenceContent { url: string; title: string; note: string }  // title typed by the person; page never fetched
export interface CommitmentContent { entry_id: string }                // studio_compass_entries (kind commitment)
export type CompassContent = Record<string, never>                     // renders the project's compass rows
export interface FrameContent { expanded_h: number; tint: 'none' | Hue }
export interface HeadingContent { text: string; size: 'lg' | 'md' }
export type DividerContent = Record<string, never>
export interface ImageContent { asset_id: string; caption: string; fit: 'cover' | 'contain'; aspect: number }
export interface GalleryItem { asset_id: string; caption: string; aspect: number }
export interface GalleryContent { items: GalleryItem[]; columns: 2 | 3 }
export interface RecordingContent { asset_id: string; title: string; note: string } // own_voice/transcript/envelope on the asset
export interface PaletteContent { swatches: Array<{ hex: string; name: string | null }> } // 1–12

export type BlockContentMap = {
  concept: ConceptContent; since: SinceContent; update: UpdateContent; timeline: TimelineContent
  draft: DraftContent; anchor: AnchorContent; note: NoteContent; reference: ReferenceContent
  commitment: CommitmentContent; compass: CompassContent; frame: FrameContent; heading: HeadingContent
  divider: DividerContent; image: ImageContent; gallery: GalleryContent; recording: RecordingContent
  palette: PaletteContent
}

export type PlacedBy = 'auto' | 'person'
export type ArrivalState = 'placed' | 'unplaced'

export interface Block<T extends BlockType = BlockType> {
  id: string
  user_id: string
  project_id: string
  type: T
  x: number; y: number; w: number; h: number; z: number
  parent_id: string | null
  stacked_in: string | null
  name: string | null
  locked: boolean
  hidden: boolean
  collapsed: boolean
  placed_by: PlacedBy
  arrival_state: ArrivalState
  arrived_from: string | null
  struck_at: string | null
  struck_by: string | null
  content: BlockContentMap[T]
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type AnyBlock = { [K in BlockType]: Block<K> }[BlockType]

export interface Link {
  id: string
  user_id: string
  project_id: string
  from_block_id: string
  to_block_id: string
  word: string | null
  created_at: string
}

// ── talk ───────────────────────────────────────────────────────────────────
export type TalkKind = 'talk' | 'direction'
export interface TalkEntry {
  id: string
  project_id: string
  kind: TalkKind
  role: 'person' | 'companion'
  input: 'typed' | 'voice' | null
  text: string
  reply_to: string | null
  catch_id: string | null
  sorted_at: string | null
  truncated: boolean
  created_at: string
}

// ── compass ────────────────────────────────────────────────────────────────
export type CompassKind = 'refusal' | 'non_negotiable' | 'commitment' | 'drift'
export type CompassStatus = 'pending' | 'active' | 'rejected' | 'dormant'
export interface CompassEvidence { entry_id: string; quote: string; at: string }
export interface CompassEntry {
  id: string
  project_id: string
  kind: CompassKind
  statement: string
  proposed_statement: string
  status: CompassStatus
  reinforcement_count: number
  last_reinforced_at: string
  evidence: CompassEvidence[]
  source_entry_id: string | null
  decided_at: string | null
  rejection_note: string | null
  forgotten_at: string | null
  // commitments only
  block_id: string | null
  asked_at: string | null
  ask_count: number
  resolution: 'done' | 'let_go' | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}
/** A commitment is a CompassEntry with kind 'commitment'; this alias is for readability. */
export type Commitment = CompassEntry & { kind: 'commitment' }

export interface Catch {
  id: string
  project_id: string
  refusal_entry_id: string
  person_entry_id: string
  decision_text: string
  sentence: string
  spoken_entry_id: string | null
  mark: 'right' | 'wrong' | null
  marked_at: string | null
  created_at: string
}

// ── drafts ─────────────────────────────────────────────────────────────────
export type DraftKind = 'essay' | 'brief' | 'copy' | 'lyrics' | 'other'
export type Posture = 'suggest' | 'ask' | 'locked'
export interface Draft {
  id: string
  project_id: string
  block_id: string | null
  title: string
  kind: DraftKind
  posture: Posture
  created_at: string
  updated_at: string
}
export interface DraftSection {
  id: string
  draft_id: string
  position: number
  label: string | null
  content: string                 // Tiptap HTML
  is_locked: boolean
  created_at: string
  updated_at: string
}
/** What the draft CARD needs, computed by the bundle from studio_drafts + sections (no mirror in content). */
export interface DraftSummary {
  id: string
  title: string
  kind: DraftKind
  posture: Posture
  sections: Array<{ id: string; label: string | null; is_locked: boolean; has_text: boolean }>
  updated_at: string
}
export interface DraftMessage { id: string; draft_id: string; role: 'person' | 'companion'; text: string; created_at: string }

// ── assets ─────────────────────────────────────────────────────────────────
export interface Asset {
  id: string
  project_id: string
  kind: 'image' | 'audio'
  storage_path: string
  thumb_path: string | null
  mime: string
  bytes: number
  width: number | null
  height: number | null
  duration_s: number | null
  envelope: number[] | null
  own_voice: boolean
  transcript: string | null
  created_at: string
}
/** Asset as delivered to the client: signed urls (60 min), never storage paths. */
export interface AssetView extends Omit<Asset, 'storage_path' | 'thumb_path'> {
  url: string
  thumb_url: string | null
}

// ── since you were here ────────────────────────────────────────────────────
export interface SincePayload {
  cutoff: string
  last_opened_at: string
  canvas_version: number
  last_said: { text: string; at: string; kind: TalkKind } | null
  arrived_since: number
  waiting: number
  compass_pending: number
  catches_unmarked: number
  commitments_open: number
}

// ── the bundle one GET returns ─────────────────────────────────────────────
export interface ProjectBundle {
  project: Project
  concept: ConceptRevision
  blocks: AnyBlock[]                // live rows (deleted_at null), including stacked children
  links: Link[]
  compass: CompassEntry[]           // pending + active + dormant (rejected excluded)
  catches: Catch[]                  // unmarked + last 10 marked
  drafts: DraftSummary[]
  assets: AssetView[]
  since: SincePayload
}

export interface ShelfProject extends Project {
  concept_body: string              // first 200 chars of the latest revision body
  since: SincePayload
}

// ── API payloads ───────────────────────────────────────────────────────────
export interface CreateProjectRequest {
  title: string
  concept: { body: string; constraints: string[] }
  anchors: string[]                                          // ticked verbatim phrases
  references: Array<{ url: string; title: string; note: string }>
  compass_seed: Array<{ kind: 'refusal' | 'non_negotiable'; statement: string; quote: string }>
}
export interface PatchProjectRequest {
  title?: string
  status?: ProjectStatus
  completion_note?: string
  viewport?: Viewport
  settings?: Partial<ProjectSettings>
  auto_layout?: boolean
  composed_at?: string
}
export interface BlocksBatchRequest {
  upserts: AnyBlock[]               // FULL rows (D-030)
  deletes: string[]                 // soft-deleted ids
  restores?: string[]               // undo of a delete: deleted_at ← null
}
export interface BlocksBatchResponse { canvas_version: number; applied: number }
export interface ArrivalActionRequest { action: 'place' | 'dismiss'; x?: number; y?: number; placed_by?: PlacedBy }
export interface StrikeRequest { sentence: string }
export interface CreateLinkRequest { id: string; from_block_id: string; to_block_id: string; word: string | null }
export interface CompassDecideRequest {
  action: 'confirm' | 'correct' | 'reject' | 'forget' | 'restore' | 'resolve'
  statement?: string                // correct
  note?: string                     // reject
  resolution?: 'done' | 'let_go'    // resolve (commitments)
}
export interface CatchMarkRequest { mark: 'right' | 'wrong' }
export interface TalkRequest { text: string; input: 'typed' | 'voice'; kind: TalkKind }
export interface TalkMeta {
  person_entry_id: string
  companion_entry_id: string
  applied: TalkApplied
  blocks: AnyBlock[]                // the arrival rows inserted (full rows, so the client needs no refetch)
  compass: CompassEntry[]           // the compass rows inserted or reinforced
  catch: Catch | null
  truncated: boolean
}
export interface TalkApplied {
  block_ids: string[]               // arrivals inserted (updates + commitment blocks)
  compass_pending_ids: string[]
  reinforced_ids: string[]
  suggest_done_ids: string[]        // commitments the person said were done → "tick it?"
}
export interface DraftChatRequest {
  message: string
  section_id: string | null
  selected_text: string | null
  history: Array<{ role: 'person' | 'companion'; text: string }>
}
export interface SignUploadRequest { project_id: string; kind: 'image' | 'audio'; mime: string; bytes: number; ext: string; thumb?: boolean }
export interface SignUploadResponse { asset_id: string; path: string; token: string; thumb_path: string | null; thumb_token: string | null }
export interface CommitAssetRequest {
  asset_id: string; width?: number; height?: number; duration_s?: number
  envelope?: number[]; own_voice?: boolean; transcript?: string | null
}
export interface DraftConceptRequest {
  mode: 'brief' | 'questions'
  brief?: string
  answers?: [string, string, string, string]
}
export interface DraftConceptResponse {
  title: string
  body: string
  constraints: string[]
  anchor_candidates: string[]        // verbatim, validated, ≤ 3
  references: Array<{ url: string; title: string; note: string }>
  compass_seed: Array<{ kind: 'refusal' | 'non_negotiable'; statement: string; quote: string }>
}

// ── the sort (MODELS.fast) and what the prompt builder may read ────────────
export interface TalkSort {
  update: { text: string } | null
  commitments: Array<{ text: string }>
  compass: Array<{ kind: 'refusal' | 'non_negotiable' | 'drift'; statement: string; quote: string; reinforce_id: string | null }>
  decisions: Array<{ text: string; collides_with: string | null }>
  done_commitment_ids: string[]
}

/** The ONLY shape the prompt context builder accepts from a block (D-059). No url, asset id, path or swatch can exist here. */
export type CompanionReadable =
  | { type: 'concept'; body: string; constraints: string[] }
  | { type: 'update'; text: string; at: string; struck: string | null }
  | { type: 'anchor'; text: string; struck: string | null }
  | { type: 'note'; text: string; struck: string | null }
  | { type: 'reference'; title: string; note: string; struck: string | null }
  | { type: 'commitment'; text: string; at: string }
  | { type: 'heading'; text: string }
  | { type: 'image'; captions: string[] }
  | { type: 'recording'; title: string; note: string; own_transcript: string | null }

// ── engine-facing (shared so B, C–E and F agree) ──────────────────────────
export type ObjectClass = 'paper' | 'paperless' | 'media'
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export interface TypeSpec {
  class: ObjectClass
  accent: Hue | null
  autoHeight: boolean
  aspectLocked: boolean
  defaultW: number; defaultH: number
  minW: number; maxW: number
  minH: number; maxH: number
  handles: readonly Handle[]
  selectable: boolean
  deletable: boolean
  duplicable: boolean
  editableInPlace: boolean
  opens: 'none' | 'draft' | 'compass' | 'lightbox' | 'timeline'
  region: 'top' | 'column' | 'wide' | 'grid' | 'media' | 'none'   // compose region (F)
  label: string                                                   // lowercase library name
  holds: string                                                   // one-line "what it holds"
}
export type Registry = Record<BlockType, TypeSpec>

export interface Placement { id: string; x: number; y: number; w: number; h: number }
export interface DirtyPatch {
  upserts: Map<string, AnyBlock>
  deletes: Set<string>
  restores: Set<string>
  links_add: Map<string, Link>
  links_delete: Set<string>
  project: Partial<PatchProjectRequest>
}

export const RELATIVE_DAYS_DECAY = 150 as const
export const DRIFT_DAYS_DECAY = 30 as const
export const PENDING_CAP = 8 as const
```

---

## 4. API routes

All under `studio/src/app/api/studio/`. Every handler: `const auth = await requireUser(); if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })`; every query goes through `auth.supabase` (RLS applies; never the service role); every model call `logUsage(route, model, usage)`; every user-facing generated text = `withLanguage(COMPANION_TONE + '\n\n' + …)`. Errors: `400 { error }` for bad input, `401`, `404 { error: 'not found' }` when the row is missing or not the person's, `409 { error }` for state conflicts, `500 { error: 'internal' }` (logged). Bodies are JSON; routes used from `keepalive` also accept `text/plain` bodies and parse manually. Streaming routes return `text/plain` via the copied `streamClaudeText` and end with the U+001E meta frame. Streaming routes export `const maxDuration = 60`.

Helper conventions (lane A, `lib/studio/db.ts`): `loadBundle(auth, projectId)`, `bumpCanvasVersion(auth, projectId)` (one `update … set canvas_version = canvas_version + 1 … returning canvas_version`), `signAssets(auth, assets[])` (60-minute signed urls for path + thumb), `nextZ(auth, projectId)` (RPC `studio_next_z`), `assertProjectWritable(project)` (status active; else 409 `project is resting|finished|kept|abandoned`). Talk and arrivals are allowed on non-active projects; arrangement is not.

| Route | Method | Request | Response | Tables | Lane |
|---|---|---|---|---|---|
| `/projects` | GET | — | `{ projects: ShelfProject[] }` sorted status active first then `updated_at desc`; `since` per project via `studio_since` RPC (no rotation) | studio_projects, studio_concept_revisions, RPC | A |
| `/projects` | POST | `CreateProjectRequest` | `201 { bundle: ProjectBundle }` — inserts project; revision (origin `creation`); blocks concept/since/compass + anchors + references at rects from `composeNew()` (section 7) with `placed_by 'auto'`; compass seeds as `pending` (proposed_statement = statement, evidence `[{ entry_id: null→omitted, quote, at }]`); `canvas_version 1`; returns the bundle | all | A |
| `/projects/draft-concept` | POST | `DraftConceptRequest` | `DraftConceptResponse` (MODELS.deep, 1200 tokens, JSON only; anchor candidates verbatim-validated against the brief/answers; nothing persisted) | — | H |
| `/projects/:id` | GET | — | `{ bundle: ProjectBundle }` (no side effects; `since` via `studio_since`) | all | A |
| `/projects/:id` | PATCH | `PatchProjectRequest` | `{ project }` — `status` changes go through the trigger (409 with the trigger's message on early wake); `viewport`/`settings` are not version-bumped | studio_projects | A |
| `/projects/:id` | DELETE | — | `204` (cascade; confirm dialog on the client) | studio_projects | A |
| `/projects/:id/open` | POST | — | `{ since: SincePayload }` — calls `studio_open_project`, then runs the unsorted sweep (D-054: person entries with `sorted_at null` older than 2 min → `sortAndApply` without a reply, sequentially, max 5 per open) and returns the since payload computed AFTER the sweep | RPC, talk tables | A (sweep function imported from G's `lib/studio/talk/apply.ts`) |
| `/projects/:id/since` | GET | — | `{ since: SincePayload }` (poll target, cheap) | RPC | A |
| `/projects/:id/concept` | POST | `{ body: string; constraints: string[] }` | `{ revision: ConceptRevision }` — inserts a revision (origin `edit`); bumps canvas_version | studio_concept_revisions | H |
| `/projects/:id/concept/revisions` | GET | — | `{ revisions: ConceptRevision[] }` newest first | studio_concept_revisions | H |
| `/projects/:id/blocks` | PATCH | `BlocksBatchRequest` (≤ 40 upserts) | `BlocksBatchResponse` — `upsert(rows.map(r => ({ ...r, user_id, project_id })), { onConflict: 'id' })`; `update({ deleted_at: now }).in('id', deletes)`; `update({ deleted_at: null }).in('id', restores)`; one `bumpCanvasVersion`; 409 if project not writable (viewport-only batches are still accepted via PATCH /projects/:id) | studio_blocks, studio_projects | A |
| `/projects/:id/blocks` | POST | `{ block: AnyBlock }` | `201 { block }` — single create (library); z from `nextZ`; bump | studio_blocks | A |
| `/projects/:id/blocks/:blockId/strike` | POST | `StrikeRequest` (sentence required, ≤ 280) | `{ block }` sets `struck_at`, `struck_by`; bump | studio_blocks | A |
| `/projects/:id/blocks/:blockId/strike` | DELETE | — | `{ block }` clears both; bump | studio_blocks | A |
| `/projects/:id/blocks/:blockId/arrival` | POST | `ArrivalActionRequest` | `{ block, compass_entry?: CompassEntry }` — `place`: `arrival_state 'placed'`, optional x/y/placed_by; if the block is a commitment → its entry `status 'active'`, `decided_at`; `dismiss`: `deleted_at now`; commitment → entry `rejected`; bump | studio_blocks, studio_compass_entries | A |
| `/projects/:id/links` | POST | `CreateLinkRequest` | `201 { link }` (trigger enforces same project; 409 on duplicate) ; bump | studio_links | A |
| `/projects/:id/links/:linkId` | DELETE | — | `204`; bump | studio_links | A |
| `/projects/:id/links/:linkId` | PATCH | `{ word: string \| null }` | `{ link }` | studio_links | A |
| `/projects/:id/compass` | GET | — | `{ entries: CompassEntry[], catches: Catch[] }` (all statuses; the drawer groups them) | compass, catches | A |
| `/compass/:entryId` | POST | `CompassDecideRequest` | `{ entry }` — confirm: `active`, `decided_at`; correct: `active`, `statement`, `decided_at` (proposed kept); reject: `rejected`, `rejection_note`, and for commitments soft-delete `block_id`; forget: `dormant`, `forgotten_at`; restore: `active`; resolve: `resolution`, `resolved_at` (commitments only, else 400) | compass, blocks | A |
| `/projects/:id/talk` | POST | `TalkRequest` | text/plain stream; meta `TalkMeta` (section 8) | talk, blocks, compass, catches | G |
| `/projects/:id/talk` | GET | `?before=<iso>&limit=40&kind=talk\|direction` | `{ entries: TalkEntry[] }` oldest→newest within the page | talk | G |
| `/catches/:catchId` | POST | `CatchMarkRequest` | `{ catch }` sets `mark`, `marked_at` | catches | G |
| `/projects/:id/drafts` | POST | `{ title?: string; kind?: DraftKind; x?: number; y?: number }` | `201 { draft: DraftSummary, block: AnyBlock }` — creates the draft with one empty section, and its block at the given x/y (default 0,0; the client passes the snapped stage centre and, while `auto_layout`, runs `composeAuto()` afterwards, 7.5); z from `nextZ`; bump | drafts, sections, blocks | A |
| `/drafts/:draftId` | GET | — | `{ draft: Draft, sections: DraftSection[], anchors: string[] }` (anchors = live, unstruck anchor blocks of the project) | drafts, sections, blocks | A |
| `/drafts/:draftId` | PATCH | `{ title?: string; posture?: Posture; kind?: DraftKind }` | `{ draft }` | drafts | A |
| `/drafts/:draftId` | DELETE | — | `204` and soft-deletes the block | drafts, blocks | A |
| `/drafts/:draftId/sections` | PUT | `{ sections: Array<Pick<DraftSection,'id'\|'position'\|'label'\|'content'\|'is_locked'>> }` | `{ sections }` — ordered replace; a section whose server copy is `is_locked` must arrive unchanged (else 409 `locked section changed`) | sections | A |
| `/drafts/:draftId/chat` | POST | `DraftChatRequest` | text/plain stream; meta `{ proposed_edit: string \| null, truncated }` — posture-gated (section 9) | drafts, sections, messages, blocks (anchors) | D |
| `/assets/sign` | POST | `SignUploadRequest` | `SignUploadResponse` — `createSignedUploadUrl` for `<user>/<project>/<asset>.<ext>` (+ thumb `<asset>_t.webp`); inserts the asset row with `bytes` from the request (client-truthful; RLS-scoped; bucket limit is the real cap) | studio_assets, storage | E |
| `/assets/commit` | POST | `CommitAssetRequest` | `{ asset: AssetView }` — records dimensions/duration/envelope/own_voice/transcript (400 if transcript without own_voice) | studio_assets | E |
| `/assets/:assetId` | PATCH | `{ own_voice?: boolean; transcript?: string \| null }` | `{ asset }` (turning own_voice off nulls the transcript) | studio_assets | E |
| `/assets/:assetId/url` | GET | — | `{ url, thumb_url }` fresh 60-minute signed urls | storage | E |
| `/punctuate` | POST | as copied | as copied | — | exists |

Batching rules: geometry/content/z/lock/hide/name/parent/stacked changes go ONLY through the PATCH batch (full rows). Lifecycle changes (strike, arrival, compass decide, link create/delete) are individual calls so they never reorder against geometry. Creation from the library uses POST single so the server assigns z; the client optimistically inserts with `z = localMax + 1` and reconciles.

Never returned to the client: `storage_path`, `thumb_path` (replaced by signed urls). Never sent to a model: anything outside `CompanionReadable`.

---

## 5. Canvas engine

Plain TypeScript in `studio/src/lib/studio/engine/*` (no React imports) plus `lib/studio/geometry.ts`; React touches it only through `components/canvas/*`. The store (`lib/studio/store.ts`, lane A) is the single mutable state; the engine mutates it through Commands (B). Nothing goes through React during a drag.

### 5.0 DOM layers (components/canvas/stage.tsx, B)

```
<div data-stage style="position:absolute; inset:48px 0 0 0; overflow:hidden; touch-action:none;
     background: containerBg + grid background-image (screen space, D-009); border-radius: 28px 28px 0 0">
  <div data-world style="position:absolute; left:0; top:0; transform: translate(tx px, ty px) scale(k); transform-origin: 0 0">
    <svg data-links>            world space: links (D-023), vector-effect non-scaling-stroke   (lane D renders; B mounts)
    <div data-blocks>           every mounted block, position:absolute; left:0; top:0; transform: translate3d(x,y,0); width w; height auto|h; contain: layout paint style
  </div>
  <svg data-overlay style="position:absolute; inset:0; pointer-events:none">   screen space: hover, selection, handles, marquee, guides, gap labels, size labels, link-in-progress, arrivals chevron
</div>
chrome (top bar, rails, docks, context bar, pills, drawers) are siblings of data-stage, not inside it.
```

`will-change: transform` is set on data-world at interaction start and removed 300 ms after it ends. Handles inside the overlay carry `data-handle="ne"` etc. and `pointer-events: all`; frame bars carry `data-frame-bar`; blocks carry `data-block-id`. Hit testing is `e.target.closest(...)`, never geometric.

### 5.1 geometry.ts (B)

```ts
export const snap8 = (n: number) => Math.round(n / 8) * 8
export const ceil8 = (n: number) => Math.ceil(n / 8) * 8
export function union(rects: Rect[]): Rect | null
export function intersects(a: Rect, b: Rect): boolean
export function contains(outer: Rect, inner: Rect): boolean
export function containsPoint(r: Rect, p: Point): boolean
export function inset(r: Rect, d: number): Rect
export function grow(r: Rect, d: number): Rect
export function centre(r: Rect): Point
export function rectOf(b: Pick<AnyBlock, 'x'|'y'|'w'|'h'>): Rect
export function edgeMidpoints(r: Rect): Point[]            // n, e, s, w
export function nearestEdgePair(a: Rect, b: Rect): [Point, Point]
export function dist(a: Point, b: Point): number
```

### 5.2 viewport.ts (B)

```ts
export const K_MIN = 0.1, K_MAX = 3, FIT_PAD = 80, FIT_K_MAX = 1.25, ZOOM_STEP = 1.2
export function screenToWorld(v: Viewport, p: Point): Point   // (p − t) / k
export function worldToScreen(v: Viewport, p: Point): Point   // p·k + t
export function zoomAt(v: Viewport, pScreen: Point, kNext: number): Viewport
  // k' = clamp(kNext); r = k'/v.k; tx' = p.x − (p.x − v.tx)·r; ty' likewise
export function fit(rect: Rect, vw: number, vh: number, kMax = FIT_K_MAX): Viewport
  // k = clamp(min((vw−2·PAD)/rect.w, (vh−2·PAD)/rect.h), K_MIN, kMax); centre
export function wheelDelta(e: { deltaX: number; deltaY: number; deltaMode: number }, vh: number): Point   // D-005
export function applyWheel(v: Viewport, e: WheelLike, cursor: Point, vh: number): Viewport
  // ctrl/meta → zoomAt(cursor, v.k · exp(−dy·0.0025)); shift && dx===0 → tx −= dy; else tx −= dx, ty −= dy
export function pinch(v0: Viewport, m0: Point, d0: number, m: Point, d: number): Viewport
  // v = zoomAt(v0, m0, v0.k · d/d0); then v.tx += (m − m0).x; v.ty += (m − m0).y
export function gridBackground(v: Viewport, theme: 'light'|'dark', on: boolean): CSSProperties  // D-009
export function visibleWorldRect(v: Viewport, vw: number, vh: number, margin = 400): Rect
```
Viewport writes during wheel/pinch/pan are imperative (`worldEl.style.transform`, `stageEl.style.backgroundPosition/Size`); the store's viewport is updated at most once per animation frame and persisted by autosave as a project field (debounced 1 s, never in the undo stack).

### 5.3 store.ts + hooks.ts (A)

```ts
export interface CanvasState {
  project: Project; concept: ConceptRevision
  blocks: Map<string, AnyBlock>; links: Map<string, Link>
  compass: CompassEntry[]; catches: Catch[]; drafts: DraftSummary[]; assets: Map<string, AssetView>
  since: SincePayload
  selection: Set<string>; primary: string | null; hover: string | null; editing: string | null
  viewport: Viewport
  mode: Mode                                   // see 5.4
  interactive: boolean                         // false in phone mode / read-only statuses
  chip: boolean                                // k < 0.3
  saveState: 'saved' | 'saving' | 'unsaved' | 'signin'
  drawer: { kind: 'none' | 'talk' | 'compass' | 'draft' | 'revisions'; draftId?: string }
  dock: { left: 'none' | 'library' | 'layers'; right: 'none' | 'selection' | 'grid' | 'project' }
}
export function createStore(bundle: ProjectBundle, interactive: boolean): CanvasStore
export interface CanvasStore {
  get(): CanvasState
  subscribe(fn: () => void): () => void
  subscribeBlock(id: string, fn: () => void): () => void      // per-block listeners (perf D-010)
  set(mutator: (s: CanvasState) => void, touched?: string[]): void   // touched = block ids to notify
  applyPatch(p: DirtyPatch): void                             // used by commands + refetch merge
  dirty: DirtyPatch                                           // consumed by autosave
}
// hooks.ts
export function useCanvasStore<T>(selector: (s: CanvasState) => T, eq?: (a: T, b: T) => boolean): T
export function useBlock(id: string): AnyBlock | undefined      // subscribes via subscribeBlock only
export function useIsSelected(id: string): boolean              // selection is a separate slice → two blocks re-render per selection change
export function useIsEditing(id: string): boolean
export function useViewport(): Viewport
export const StoreContext: React.Context<CanvasStore | null>
```
Derived selectors (memoised in store): `liveBlocks` (deleted_at null), `renderable` (live ∧ !hidden ∧ !stacked_in ∧ !ancestorCollapsed), `topLevel`, `childrenOf(id)`, `descendants(id)`, `depthOf(id)`, `renderOrder` (sorted by (depth, z)), `bboxAll`, `unplaced`.

### 5.4 pointer.ts — the state machine (B)

```ts
export type Mode = 'idle' | 'pressing' | 'panning' | 'dragging' | 'resizing' | 'marquee' | 'linking' | 'placing' | 'editing' | 'pinching'
export interface OverlayApi {                       // implemented by components/canvas/overlays (B); all writes imperative, rAF-batched
  guides(g: Guide[], gaps: GapLabel[]): void; clearGuides(): void
  marquee(r: Rect | null): void
  dropFrame(id: string | null): void
  rubber(from: Point | null, to: Point | null): void
  ghost(rect: Rect | null): void                    // placing mode ghost
}
export interface LinksApi { updateFor(ids: Set<string>, d: Point): void; redraw(): void }   // implemented by D's LinksLayer (11.1)
export interface PointerEnv {                       // effects interface; the reducer is pure
  store: CanvasStore; refs: Map<string, HTMLElement>; overlay: OverlayApi; links: LinksApi
  vw(): number; vh(): number; now(): number
  commit(cmd: Command): void; snap: boolean; sizes: boolean
}
export function createPointerMachine(env: PointerEnv): {
  down(e: PointerEvent): void; move(e: PointerEvent): void; up(e: PointerEvent): void
  cancel(): void; key(e: KeyboardEvent): void; enterLink(): void; enterPlacing(type: BlockType): void
  enterEdit(id: string): void; exitEdit(commit: boolean): void; mode(): Mode
}
```
Constants: `DRAG_THRESHOLD = 4` screen px, `DOUBLE_MS = 350`. `setPointerCapture` on every pointerdown on the stage.

pointerdown:
1. If target is inside `[data-no-drag]` → return (let the element handle it) (D-028).
2. `editing`: target inside the editing block → return; else `exitEdit(true)` and continue.
3. `e.button === 1 || spaceHeld || (!interactive)` → `panning` (store v0, p0). Second touch pointer while panning → `pinching` (d0, m0, v0).
4. `placing` → create the block at `snap8(screenToWorld(p))` via CreateCommand (`placed_by 'person'`), `mode = idle`.
5. `linking`: hit block → if `linkFrom` null set it (overlay draws a rubber line) else `commit(CreateLinkCommand)` and open the word popover; no block → stay.
6. `[data-handle]` → `resizing` (rect0, handle, p0, spec from registry).
7. `[data-frame-bar]` or `[data-block-id]` (block not locked, not since): shift → toggle selection; else if not selected → select just it. `mode = pressing`, `moveSet = closure(selection)` (selection ∪ descendants of selected frames ∪ the since row when the concept is in it, D-026). Record `from` rects.
8. Empty ground → if !shift clear selection; `mode = pressing` with `marqueeCandidate = true`.

pointermove:
- `panning` → imperative viewport `{ v0.tx + Δx, v0.ty + Δy }`.
- `pinching` → `pinch(...)` imperative.
- `pressing` → if |Δ| ≥ 4 → `dragging` (or `marquee` if candidate); on drag start set `will-change`, add `data-dragging` (shadowDrag), pause the atmosphere.
- `dragging` → `δ = Δ/k`; `{ δ', guides, gaps } = snapMove(primaryRect0 + δ, moveSet, snapEnabled && !shift)`; write `style.transform = translate3d(x0+δ'x, y0+δ'y, 0)` on every moveSet element; `links.updateFor(moveSet, δ')`; `overlay.guides(guides, gaps)`; `overlay.dropFrame(frameUnderCentre(primary))`.
- `resizing` → `rect = resizeRect(rect0, handle, Δ/k, spec)` (min/max, aspect lock, auto-height ignores N/S); `rect = snapResize(rect, handle)`; write `style.width/height/transform`; overlay handles follow.
- `marquee` → world rect from p0→p; `selection = blocksIntersecting(rect)` (rAF-throttled; frame containment rule D-025); overlay draws the rect.

pointerup:
- `pressing` with no drag: click → select just the hit block (shift toggle kept); double (≤ 350 ms, same block, `editableInPlace`) → `enterEdit`; double on a draft/compass/gallery → open.
- `dragging` → `commit(MoveCommand({ ids, from, to, reparent: reparentFor(primary), frameGrow }))`; `placed_by 'person'`, `arrival_state 'placed'` on every moved block; `project.auto_layout = false` if true (one ProjectPatchCommand, not undoable); clear guides; remove drag styles.
- `resizing` → `commit(ResizeCommand)`; `placed_by 'person'`.
- `marquee` → keep selection; clear rect.
- `panning`/`pinching` → commit viewport to store (not undoable).
- `mode = idle`.

`pointercancel`, `blur`, `visibilitychange → hidden` while dragging/resizing → `cancel()`: restore `from` rects imperatively, clear overlay, `mode = idle` (nothing committed).

keys handled by the machine: Space (spaceHeld, cursor grab), Esc (linking/placing/marquee → idle; editing → exitEdit(true); else deselect / close drawer), Enter (single selected: edit or open).

### 5.5 snap.ts (B)

```ts
export const SNAP_SCREEN = 6
export interface Guide { axis: 'x' | 'y'; value: number; from: number; to: number }       // world px; from/to span moving block ↔ farthest aligned neighbour
export interface GapLabel { axis: 'x' | 'y'; at: Point; value: number; equal: boolean }
export interface SnapResult { dx: number; dy: number; guides: Guide[]; gaps: GapLabel[] }
export function collectNeighbours(all: AnyBlock[], moveSet: Set<string>, view: Rect): Rect[]   // D-007
export function snapMove(moving: Rect, neighbours: Rect[], k: number, opts: { grid: boolean; guides: boolean }): SnapResult
export function snapResize(rect: Rect, handle: Handle, neighbours: Rect[], k: number, opts): SnapResult
export function gapLabels(moving: Rect, neighbours: Rect[]): GapLabel[]
```
Algorithm (`snapMove`): `tol = 6 / k`. For axis x: moving edges `{ L, CX, R }`; targets = for each neighbour `[x, x + w/2, x + w]` (+ frames' inner edges `x+16`, `x+w−16`) tagged as guides, plus grid targets `round(edge/8)·8` for each moving edge. Choose the (edge, target) pair with minimal |Δ| ≤ tol, ordering guide < grid before distance (guides beat grid, D-006). `dx = target − edge`. Same for y with `{ T, CY, B }`. Equal spacing: nearest neighbour `n` to the left whose y-range overlaps the moving rect; `gap = moving.L − n.R`; if `n` has its own left neighbour `n2` with `gap(n2, n)` and `|gap − gap(n2,n)| ≤ tol` → snap `dx` so the gaps equal and emit both labels with `equal: true`. Mirror right/top/bottom. Guides span from the moving rect to the farthest neighbour sharing that value. Neighbours are pre-sorted once per drag start (edges arrays) and searched with binary search.

### 5.6 selection.ts (B)

```ts
export function closure(s: CanvasState, ids: Set<string>): Set<string>          // + descendants of frames + since when concept
export function blocksIntersecting(s: CanvasState, r: Rect): Set<string>        // frame containment rule
export function selectAll(s: CanvasState): Set<string>                          // unlocked, unhidden, top-level, not since
export function toggle(sel: Set<string>, id: string): Set<string>
export function canSelect(b: AnyBlock, fromLayers: boolean): boolean            // since never; locked only fromLayers; hidden never
```

### 5.7 frames.ts (B)

```ts
export function frameUnderCentre(s: CanvasState, b: Rect, exclude: Set<string>): string | null  // D-020
export function reparentFor(s: CanvasState, primaryId: string, rectAfter: Rect): { parent_id: string | null; grow: Rect | null }
export function collapse(frame: Block<'frame'>): Partial<Block<'frame'>>          // D-021
export function expand(frame: Block<'frame'>): Partial<Block<'frame'>>
export function frameSelection(s: CanvasState, ids: Set<string>): { frame: Block<'frame'>; children: string[] } // D-022
export function isAncestorCollapsed(s: CanvasState, id: string): boolean
```

### 5.8 zorder.ts (B)

```ts
export function renderOrder(blocks: AnyBlock[], depthOf: (id: string) => number): AnyBlock[]  // sort (depth, z)
export function stepZ(s: CanvasState, ids: Set<string>, dir: 'forward' | 'back' | 'front' | 'back_all'): Map<string, number>
export function reorderZ(s: CanvasState, orderedTopLevelIds: string[]): Map<string, number>   // layers drag
```

### 5.9 commands.ts (B)

```ts
export interface Command {
  label: string; key?: string; at: number
  apply(s: CanvasState): void; revert(s: CanvasState): void
  patch(): DirtyPatch; inverse(): DirtyPatch
}
export class CommandStack {                        // cap 200, coalesce 500 ms on equal key (D-029)
  execute(store: CanvasStore, cmd: Command): void
  undo(store: CanvasStore): void; redo(store: CanvasStore): void
  canUndo(): boolean; canRedo(): boolean; lastLabel(): string | null
}
// concrete commands (each records before/after rows and produces full-row patches):
MoveCommand({ ids, from: Map<id, Rect>, to: Map<id, Rect>, reparent?: { id, parent_id }, frameGrow?: { id, rect } })   key `move:<sorted ids>`
NudgeCommand({ ids, dx, dy })                                       key `nudge:<ids>`
ResizeCommand({ id, from: Rect, to: Rect })                          key `resize:<id>`
EditCommand({ id, before: content, after: content })                 no key (one per edit session)
CreateCommand({ block })  · SoftDeleteCommand({ ids, links: Link[] }) · DuplicateCommand({ sources, copies })
LockCommand · HideCommand · RenameCommand · ZCommand({ changes: Map<id, z> }) · CollapseCommand
StrikeCommand({ id, sentence }) / UnstrikeCommand                    (patch calls the strike route, not the batch)
CreateLinkCommand({ link }) · DeleteLinkCommand({ link }) · LinkWordCommand
FrameSelectionCommand({ frame, children })  · ReparentCommand
TidyCommand({ moves: Map<id, { from: Rect; to: Rect }>, stacked: { timeline?: AnyBlock; ids: string[] } })
UnstackCommand({ id, to: Rect })
```
Rules: viewport never enters the stack; `project.auto_layout=false` is a side effect outside the stack; undo re-marks rows dirty so autosave follows; inside a textarea the browser's own undo handles keystrokes and the global keymap is ignored.

### 5.10 autosave.ts (B) — hook `useAutosave(store, projectId)`

```ts
export function createAutosave(opts: { store: CanvasStore; projectId: string; fetchImpl?: typeof fetch }): {
  schedule(): void; flush(reason: 'debounce' | 'maxwait' | 'hidden' | 'manual'): Promise<void>; dispose(): void
}
```
- `schedule()` on every store patch: debounce 600 ms, maxWait 3000 ms.
- `flush()`: snapshot `store.dirty`, clear it; split upserts into chunks of 40 full rows; `PATCH /projects/:id/blocks` per chunk sequentially with `keepalive: true` (each body < 64 KB); deletes/restores ride with the first chunk; links go to their own routes; `project` fields to `PATCH /projects/:id`. On success set `saveState 'saved'` and `project.canvas_version` from the response.
- On failure: re-merge the snapshot UNDER any newer dirty state (newer wins per row), `saveState 'unsaved'`, retry 1 s → 3 s → 9 s → every 30 s; 401 → `'signin'`, keep dirty.
- `pagehide` and `visibilitychange → hidden` → `flush('hidden')` immediately.
- Poll: every 60 s while visible and on `visibilitychange → visible` → `GET /projects/:id/since`; if `canvas_version !== local` and dirty is empty → `GET /projects/:id` and merge rows with newer `updated_at` (skipping the current move set); if dirty non-empty → flush then refetch. The since payload always updates the since block. If `last_opened_at` is older than 30 min at the moment of `visible` → `POST /open` instead of `GET /since`.

### 5.11 keyboard.ts (B)

`installKeyboard(env)`; a window `keydown` listener; ignored when `document.activeElement` is input/textarea/contentEditable except Esc; map exactly as D-041; every action dispatches a Command or a store action; `?` toggles the key-map panel (the right dock's grid & keys panel lists every key as mono labels).

### 5.12 culling.ts (B)

`visibleIds(s, viewRect)`: renderable blocks whose rect intersects `visibleWorldRect(v, vw, vh, 400)`; recomputed once per rAF after a viewport change; `chip = k < 0.3` recomputed only on threshold crossing.

### 5.13 phone.ts (B) + components/phone/* (B)

`isPhone(): boolean` per D-039; `usePhoneMode()` re-evaluates on resize. `PhoneStage` mounts the same Stage with `interactive=false` (machine registers only idle/panning/pinching), a fixed since strip at the top, `BlockSheet` on tap (expanded readable content via the registry's `Sheet` component; drafts open the read-only draft view; gallery opens the lightbox; compass opens the compass sheet with the four verbs — that is not arrangement), a talk bar at the bottom (lane G's `TalkBar`). Arrivals: marker visible, `dismiss` only.

### 5.14 Rendering + performance rules (B; C–E comply)

- `BlockView` (B) is `React.memo`; it subscribes via `useBlock(id)`, `useIsSelected`, `useIsEditing`; it owns the positioned div, registers its element in `refs`, writes `data-block-id`, `data-type`, `data-locked`, `data-struck`, `data-unplaced`; it dispatches to `getRenderer(type)` from the registry and wraps with `BlockShell` (A) for paper/paperless/media chrome.
- During drag/resize nothing goes through React; one store commit on pointer-up re-renders only the moved blocks.
- Overlays draw from the store with rAF throttling; guides/selection/marquee have no transitions.
- Images: thumb (480) until `k·w > 480`, then the full asset; `loading="lazy"`, `decoding="async"`, fixed w/h.
- Measuring only via ResizeObserver (`measure.ts`), disconnected for culled blocks, ignored while dragging/resizing; write `h = ceil8(px)` when it differs by ≥ 8 (silent dirty, no command).
- Motion (framer) only for enter of arrivals, dock/drawer panels, the tidy transition class, strike line; never during pointer-driven movement. `prefers-reduced-motion` → durations 0, static marker.
- Atmosphere paused (`animation-play-state: paused`) while dragging.
- Budget: 300 blocks + 40 images at 60 fps on an M1 Safari; ≤ 4 ms per pointermove.

---

## 6. Design language

Readymag's discipline translated onto Inner Weather: the shell stays ink + atmosphere; the stage is the container layer; blocks are paper widgets with one padding and one radius; typography is the material; chrome is monochrome hairlines on ink-glass; colour appears only where it carries meaning (D-043). Everything below is normative.

### 6.1 Token sheet — `studio/src/lib/studio/canvas-tokens.ts` (lane A)

```ts
// studio/src/lib/studio/canvas-tokens.ts — canvas-only tokens. Extends design-tokens.ts; never re-declares shell/surfaces.
import { alpha, fonts, radius, shell, type Theme, type Tokens } from '@/lib/design-tokens'
import type { BlockType, Hue, ObjectClass } from '@/lib/studio/types'

export const grid = {
  U: 8,
  step: (k: number) => (k < 0.5 ? 64 : k < 1.5 ? 32 : 8),
  fade: (k: number) => Math.max(0, Math.min(1, (k - 0.25) / 0.25)),
  dotRadiusPx: 1,
  dotAlpha: { light: 0.16, dark: 0.10 } as Record<Theme, number>,
} as const

export const geometry = {
  topBarH: 48, railW: 48, libraryPanelW: 280, rightDockW: 320,
  drawerW: 420, draftDrawerW: 760, contextBarH: 32, zoomPillH: 28, talkPillH: 44,
  stageRadiusTop: radius.container,          // 28
  paperPadding: 16, captionInset: 16, frameBarH: 48, frameInnerPad: 16,
  eyebrowH: 16, eyebrowGap: 8,
  handlePx: 8, handleHitPx: 16, markerPx: 8,
} as const

export const radii = {
  block: 12, frame: 16, panel: 16, media: 10, tile: 8, swatch: 6, contextBar: 10, handle: 0, pill: 999,
} as const

export const line = {
  chrome: shell.line,                                   // rgba(236,233,226,0.14) — docks, panels, drawer edges
  chromeSoft: 'rgba(236,233,226,0.08)',                 // rows inside panels
  onPaper: (t: Tokens) => alpha(t.textPrimary, 0.12),   // rows inside cards, divider block
  hover: (t: Tokens) => alpha(t.textPrimary, 0.14),     // hover ring on blocks
  frame: (t: Tokens) => alpha(t.textPrimary, 0.18),     // dashed 4/4
  link: (t: Tokens) => alpha(t.textPrimary, 0.35),
  arrival: (t: Tokens) => alpha(t.tide, 0.7),           // dashed 3/3 outline while unplaced
} as const

export const pencil = {
  selection: (t: Tokens) => t.tide,
  selectionHover: (t: Tokens) => alpha(t.tide, 0.45),
  marquee: (t: Tokens) => ({ stroke: t.tide, fill: alpha(t.tide, 0.08) }),
  guide: (t: Tokens) => t.ember,                        // ember is the system's pencil (D-043)
  strike: (t: Tokens) => t.ember,
  marker: (t: Tokens) => t.tide,                        // arrival dot
  labelPill: { bg: 'rgba(13,12,11,0.88)', text: (t: Tokens) => t.ember, padding: '2px 5px', radius: 4 },
} as const

export const glass = {
  bg: 'rgba(13,12,11,0.74)',
  filter: 'blur(18px) saturate(1.1)',
  text: shell.text, muted: shell.muted,
  rowHover: shell.fill, rowActive: shell.fillHover,
} as const

export const shadow = {
  rest: 'none', hover: 'none',
  drag: '0 12px 28px rgba(0,0,0,0.45)',
  drawer: '-24px 0 60px rgba(0,0,0,0.5)',
} as const

/** Meaning palette on blocks: colour only where it carries meaning. */
export const accent: Record<BlockType, Hue | null> = {
  concept: null, since: null, update: null, timeline: null, draft: 'violet', anchor: 'ochre', note: null,
  reference: null, commitment: 'verdant', compass: null, frame: null, heading: null, divider: null,
  image: null, gallery: null, recording: null, palette: null,
}

export const objectClass: Record<BlockType, ObjectClass> = {
  concept: 'paper', since: 'paperless', update: 'paper', timeline: 'paper', draft: 'paper', anchor: 'paperless',
  note: 'paper', reference: 'paper', commitment: 'paper', compass: 'paper', frame: 'paperless', heading: 'paperless',
  divider: 'paperless', image: 'media', gallery: 'media', recording: 'paper', palette: 'paper',
}

export const canvasType = {
  eyebrow:  { fontFamily: fonts.mono, fontWeight: 500, fontSize: 10, lineHeight: '16px', letterSpacing: '0.1em', textTransform: 'uppercase' as const },
  meta:     { fontFamily: fonts.mono, fontWeight: 400, fontSize: 11, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' as const },
  label:    { fontFamily: fonts.mono, fontWeight: 400, fontSize: 10, lineHeight: 1.2, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
  body:     { fontFamily: fonts.ui, fontWeight: 400, fontSize: 15, lineHeight: 1.55 },
  small:    { fontFamily: fonts.ui, fontWeight: 400, fontSize: 13, lineHeight: 1.5 },
  words:    { fontFamily: fonts.ui, fontWeight: 500, fontSize: 16, lineHeight: 1.5, letterSpacing: '-0.01em' },   // the person's own words
  title:    { fontFamily: fonts.ui, fontWeight: 600, fontSize: 18, lineHeight: 1.25, letterSpacing: '-0.015em' },
  conceptTitle: { fontFamily: fonts.display, fontWeight: 600, fontSize: 22, lineHeight: 1.15, letterSpacing: '-0.02em' },
  conceptBody:  { fontFamily: fonts.display, fontWeight: 500, fontSize: 17, lineHeight: 1.45, letterSpacing: '-0.015em' },
  anchor:   { fontFamily: fonts.display, fontWeight: 700, fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.025em', textWrap: 'balance' as const },
  headingLg:{ fontFamily: fonts.display, fontWeight: 700, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em' },
  headingMd:{ fontFamily: fonts.ui, fontWeight: 600, fontSize: 18, lineHeight: 1.2, letterSpacing: '-0.015em' },
  chip:     { fontFamily: fonts.mono, fontWeight: 400, fontSize: 10, lineHeight: 1.2 },
} as const

export const motionSpec = {
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  hoverMs: 150, panelMs: 220, arrivalEnterMs: 600, tidyMs: 320, strikeMs: 300, drawerMs: 260,
  markerPulse: { from: 0.6, to: 1, periodMs: 2400 },
  atmosphereIntensity: 0.5,
} as const

export const zIndex = { world: 0, overlay: 10, chrome: 20, contextBar: 21, drawer: 30, dialog: 40 } as const
```

### 6.2 Typographic spec per block (world px at k = 1; Geist + Geist Mono only)

Shared roles: **eyebrow** = `canvasType.eyebrow` in `t.textMuted`, first row of every paper block, 16 px tall, then 8 px gap; contents are the type word and meta joined by ` · ` (e.g. `UPDATE · 12 SEP · FROM TALK`). The eyebrow is the only place a type name appears. **body** 15/1.55 `t.textPrimary`. **words** (the person's own words: update, commitment) 500 16/1.5. **meta** mono 11 `t.textMuted`.

- **concept** (paper, 1008 default): eyebrow `CONCEPT · EDITED 3 SEP`; title = project title `conceptTitle`; body `conceptBody`, paragraphs 10 px apart; constraints under a `line.onPaper` hairline, each row `small` with a 3 px ochre square bullet, rows 6 px apart. Double-click → in place: title input, body textarea, constraints as one textarea (one per line); footer text buttons `save` / `cancel`; save = new revision. Never struck, deleted, hidden, duplicated.
- **since you were here** (paperless, follows concept): up to three lines, `small` in `t.textSecondary`; the quoted last-said span in `words` at 15 px `t.textPrimary`; a 6 px tide dot precedes any line with something waiting; first open: `first time here`. Not selectable, not editable, moves with the concept.
- **update** (paper, 320): eyebrow `UPDATE · MON 12 SEP · 09:14 · FROM TALK` (or `· POSTED`); text in `words`. Unplaced: dashed `line.arrival` outline, marker, footer text buttons `place` · `dismiss` (`place` in tide).
- **timeline** (paper, 320): eyebrow `UPDATES · 6 · 3–12 SEP`; rows: mono date column 56 px + `body` first line (1 line clamp), separated by `line.onPaper`; newest first; 6 rows then `n more` (mono, opens the dock's full list); rows carry `data-no-drag` drag handles for unstacking.
- **draft** (paper, 320, violet dot before the eyebrow): eyebrow `DRAFT · ESSAY · ASK`; title `title`; sections list on `t.cardBgInner` (radius 10, padding 12): rows `small` `t.textSecondary` with label or `section n`, 12 px lucide `lock` when locked, an empty circle when the section has no text; bottom row: meta `edited 2 h ago` left, `open →` right. No word counts, ever.
- **anchor line** (paperless, 664): a 24 × 2 px ochre rule top-left, 12 px gap, then `anchor` type `t.textPrimary`; meta `anchor · from an update` appears only on hover/selection. E/W resize reflows. Mirrored into drafts' anchor rail at 18 px.
- **note** (paper, 320): eyebrow `NOTE · 3 SEP`; body; whitespace pre-wrap; the first line is not a title.
- **reference** (paper, 320): a link chip first (28 px tall, radius 10, 1 px `line.onPaper`, mono 11 `host ↗` in tide; host derived client-side from the url string); then the title the person gave (`title` role, optional); then their note in `body` `t.textSecondary`; eyebrow `REFERENCE`. The page is never fetched or previewed.
- **commitment** (paper, 320): 16 px checkbox (radius 4, 1 px verdant; checked = verdant fill + paper tick) `data-no-drag`, 12 px gap, text in `words`; meta `said 9 sep · from talk`; done = line-through at 0.6 opacity; let go = meta `let go 12 sep`; "heard done" = verdant meta line `you said this was done — tick it?`. While pending: eyebrow adds `· PROPOSED`.
- **compass** (paper, 320): eyebrow `COMPASS`; rows on `t.cardBgInner`: mono 10 uppercase kind column 96 px (`REFUSAL`, `NON-NEGOTIABLE`, `OPEN`, `DRIFT`) + statement `small`; max 6 rows (3 refusals/non-negotiables by reinforcement, 2 open commitments, 1 drift); first row when pending > 0: 6 px tide dot + `n waiting`; when catches unmarked > 0: 6 px ember dot + `one thing to mark`; footer `open →`. Read-only on canvas.
- **frame** (paperless region): 1 px dashed `line.frame`, radius 16; name tab top-left: mono 10 uppercase on a `t.containerBg` chip (padding 3 px 8 px, radius 6) overlapping the border, 12 px chevron collapses; drop-target state turns the dashes into a solid 1 px tide line; optional tint = 6 % wash of the hue. Collapsed = 48 px bar, tab reads `NAME · 7 BLOCKS`.
- **heading** (paperless): `headingLg` (lg) or `headingMd` (md); E/W resize.
- **divider** (paperless): 1 px `line.onPaper` across the width; 8 px hit height.
- **image** (media): image fills the width, radius 10, 1 px `line.onPaper` inset; caption `small` `t.textSecondary` inset 16 (only when non-empty); no eyebrow; the dock says `the caption is read · the image is not`.
- **gallery** (media, 664 × 400): CSS columns (2 or 3), 8 px gaps, tiles radius 8; captions on hover (desktop) / in the lightbox; a mono `+n` tile after 24; corner `full screen` action.
- **recording** (paper, 320): 32 px round play button (`t.inverseBg`/`t.inverseText`) `data-no-drag`, title `title`, meta duration; a 24-bar waveform of 2 px hairlines from `asset.envelope` (`alpha(textPrimary, .35)`, played part tide); below on `t.cardBgInner`: eyebrow `YOUR VOICE · TRANSCRIBED` + transcript excerpt `small` (6 lines, `more` in the dock) or eyebrow `REFERENCE · NOT LISTENED TO` + the person's note.
- **palette** (paper, 320): 40 × 40 swatches radius 6, 1 px `line.onPaper`, hex mono 10 under each, optional name `small`; click a hex copies it (`data-no-drag`).
- **chip** (any type, k < 0.3): 8 px accent dot (or textMuted) + first line in `chip` type; nothing else.

### 6.3 Object structuring

- Every block = rectangle → optional eyebrow row → content → optional footer. Paper: padding 16 all sides, radius 12, `t.cardBg`, no border at rest. Paperless: no padding, no surface. Media: padding 0, caption inset 16.
- States change ONLY the outline: rest (nothing) → hover (1 px `line.hover`) → selected (1 px tide outline in the overlay + handles) → editing (outline stays, handles hidden, caret). No lift, no scale, no rest shadow. Dragging adds `shadow.drag` and `cursor: grabbing`.
- Handles per registry (D-012): auto-height types show E, W, NE, NW, SE, SW (corners change width only); frames/galleries all eight; dividers E/W; images corners (aspect locked); since none.
- Growth: text blocks fixed-width auto-height; frames and galleries fixed both; images width-driven; dividers width only. Nothing clips (D-016).
- Duplicates land at +16,+16. Concept/since/compass cannot be duplicated or deleted (context bar hides those actions).
- Baselines: every eyebrow is exactly 16 px tall, padding is 16 everywhere, so text baselines align across neighbouring blocks on the 8 px grid.

### 6.4 Chrome

- **Top bar** (48, ink over the shell atmosphere, hairline `line.chrome` below): left = back-to-shelf `IconButton` (shell tone) + project title (`title` role, click → inline rename input) + status pill (mono 10 uppercase: `active`, `resting · 9 days left`, `finished`, `kept`, `abandoned`); right = `compass` text button (tide dot when pending > 0 or catches unmarked), `ThemeToggleButton`. Nothing else.
- **Left rail** (48 wide, ink-glass, 16 px inset from the stage's top-left, radius 16): two icons — `plus` (library), `layers` (blocks list). Each opens a 280 px pop-over panel to the right of the rail (glass, radius 16, panelMs). *Library*: 2-column grid of the 13 `LIBRARY_TYPES` as 120 × 72 tiles (20 px lucide icon + lowercase name + one-line `holds` in muted 12 px); click → placing at the stage centre; drag → placing at the drop point; media tiles open the file picker after placement; a search field at the top (`/`). *Blocks list*: rows in stack order (top = front), grouped under their frame with a 12 px indent; each row: drag handle, type dot, name (or first line) editable on double-click, `eye` / `lock` toggles fading in on hover; click → `fit([block])` capped at 1.25; struck rows at 0.5 opacity; hidden rows at 0.5 with the eye crossed.
- **Right dock** (48 rail + 320 panel, 16 px inset top-right): three icons — `sliders` (selection settings, auto-opens on selection when nothing else is pinned), `grid` (grid & guides & keys), `folder` (project). *Selection settings*: the railway pattern — the selected block's settings: name field, `lock` / `hide` toggles, `struck` toggle with the sentence field (required to strike), `link` (enters link mode), then the type's own `Settings` component from the registry (posture control for drafts; url/title for references; caption/fit for images; columns for galleries; own-voice toggle for recordings; swatch editor for palettes; size lg/md for headings; tint/collapse for frames; `make an anchor line` for updates; `unstack` for stacked rows; `done` / `let go` for commitments; `open` for draft/compass/gallery), then the size line (`320 × 148` mono, W editable in 8 px steps, H editable only for fixed-size types), then `place` / `dismiss` when unplaced, `delete` last. Multi-selection: `frame selection`, `strike all`, `delete`. *Grid & guides & keys*: `snap S`, `size labels X`, `grid G` toggles (persisted in `project.settings`), `tidy T`, `tidy everything ⇧T`, last undo label, and the full key map as mono rows. *Project*: status change (`rest` with the 14-day sentence, `finish`, `keep`, `abandon`, each asking for one sentence via `ModalDialog`), `edit the concept` (scrolls to and enters concept editing), `n concept edits →` (opens the revisions drawer), `delete project` (`useConfirm`, danger).
- **Context bar** (32 px glass pill, 8 px above the selection's screen bbox, clamped inside the stage): `strike` / `unstrike`, `link`, `duplicate`, `delete`, plus `open` when the type opens, and `place` / `dismiss` when unplaced. Icons 16 px, 28 px hit; mono 10 tooltips after 400 ms. Multi: `frame`, `strike all`, `delete`.
- **Corners**: bottom-left = zoom pill (`−  100%  +` mono 11, `fit` text button) + `tidy` text button + the save word (`saved` / `saving` / `unsaved` / `sign in again`, mono 10 muted); bottom-right = talk pill (44 px, `t.inverseBg` on ink, mic glyph + `talk`; tap → talk drawer; press-and-hold 400 ms → drawer opens already dictating); top-left rail; top-right dock. The arrivals pill (`2 arrived →`, tide) sits at the stage's right edge, vertically centred, when the arrivals column is off-screen.
- **Drawers** (railway.com pattern): slide from the right over the dock, width 420 (draft 760, `wider` → 100 %), surface `t.containerBg`, 1 px `line.chrome` left edge, `shadow.drawer`; header: eyebrow + title (`title` role) + close; the canvas stays pannable and undimmed; selecting a block with a drawer open swaps content in place. Drawers: talk (segmented `talk | direction talk`), compass (full), draft (the minimal studio), concept revisions. Phone uses bottom sheets for the same content.
- **Dialogs**: copied `ConfirmProvider`/`useConfirm` and `ModalDialog` as-is (delete project, tidy everything, status change with a sentence).

### 6.5 Motion

- Hover: outline fades in 120 ms; chrome icons translateY(−1) 150 ms. Selection: outline instant; handles scale .6→1 120 ms; context bar fades + rises 6 px 140 ms. Guides/marquee/handles while dragging: no transitions.
- Drag: shadow on in 120 ms; snaps instantaneous; on drop shadow off 160 ms.
- Arrival enter: opacity 0→1, y +8→0, 600 ms `motionSpec.ease`; marker pulse opacity .6→1 over 2.4 s repeating; stops with a 200 ms fade on place/dismiss.
- Tidy: `world` gets class `tidying` for 320 ms → `[data-block-id] { transition: transform 320ms ease }`; removed after; unmoved blocks do not animate; links redraw per frame during the transition.
- Strike: 1 px ember line draws across the block's vertical centre (scaleX 0→1, 300 ms, origin left); the block fades to .45 over 300 ms; the sentence fades in below 120 ms later.
- Dock panels: x ±12→0 + opacity, 220 ms. Drawer: x 100 %→0, 260 ms ease; close mirrors.
- First composition (composed_at null): blocks fade + rise 8 px staggered 20 ms in reading order, 400 ms.
- `prefers-reduced-motion`: every duration 0, marker static.

### 6.6 States (each block renders exactly one primary state)

rest · hover · selected · multi-selected (member outline at tide .6; group dashed bbox) · editing · dragging · resizing · drop target (frame dashes → solid tide) · linking-source (outline ember while a link is being drawn) · unplaced/arrived (dashed tide outline, marker, `place` · `dismiss`, eyebrow `· FROM TALK`) · struck (opacity .45, ember midline, mono 11 ember sentence under the block: `struck 9 sep — “the sentence”`, still selectable/movable/linkable) · locked (handles hidden, 12 px lock glyph at the eyebrow's right end, drag does nothing, outline still shows on click) · hidden (blocks list only) · collapsed (frames) · chip (k < 0.3) · phone (no hover, tap → sheet) · read-only project (a mono strip under the top bar: `resting · 9 days left · you can read and talk` / `finished — “the sentence”`).

Empty states: a project is never empty (concept, since, compass). Compass with nothing: `nothing here yet — it fills from what you say in talk`. Since first open: `first time here`. Shelf empty: `no projects yet` + `new project`. Library search with no match: `nothing called that`.

---

## 7. Auto-layout: initial composition, tidy, edge arrival

Pure functions in `studio/src/lib/studio/layout/{estimate,compose,tidy,arrivals}.ts` (lane F), isomorphic (used by the create route, the talk route, and the client). Inputs are `AnyBlock[]`/`Rect[]`, outputs are `Placement[]`. World px throughout; every x/y/w is snapped to 8; h is `ceil8`.

Constants (`layout/constants.ts`, F):
```
U = 8 · W = 320 (column) · G = 24 (gutter) · FULL = 3W + 2G = 1008 · WIDE = 2W + G = 664
ROW_GAP = 24 (between blocks in a column) · BAND_GAP = 48 (between bands) · SINCE_GAP = 8
ARRIVAL_GAP = 48 (bbox → arrivals column) · ARRIVAL_COL_STEP = 344 · ARRIVAL_MAX_BELOW = 384
```

### 7.1 estimate.ts

```ts
export function estimateH(type: BlockType, content: unknown, w: number, extra?: { sections?: number; rows?: number }): number
```
Heuristic, deterministic, shared client/server; used only when a measured `h` is unknown. `inner = w − 32` (paper) or `w` (paperless); `lines(text, fontPx, lh) = ceil(len(text) · fontPx · 0.5 / inner) · fontPx · lh` (Geist average advance ≈ 0.5 em); every result `max(minH, ceil8(px))`.

| type | px |
|---|---|
| concept | 32 + 16 + 8 + 26 + lines(body,17,1.45) + 12 + constraints·26 |
| since | 3 · 20 = 60 → default 40 when nothing to say |
| update | 32 + 16 + 8 + lines(text,16,1.5) |
| timeline | 32 + 16 + 8 + min(rows,6)·32 + (rows>6 ? 20 : 0) |
| draft | 32 + 16 + 8 + 24 + 12 + max(1,sections)·22 + 12 + 20 |
| anchor | 14 + lines(text,32,1.1) |
| note | 32 + 16 + 8 + lines(text,15,1.55) |
| reference | 32 + 16 + 8 + 28 + 8 + (title ? 24 : 0) + lines(note,15,1.55) |
| commitment | 32 + lines(text,16,1.5) + 20 |
| compass | 32 + 16 + 8 + max(1,rows)·24 + 24 |
| heading | lines(text, size==='lg' ? 24 : 18, 1.15) |
| divider | 8 |
| image | w / aspect + (caption ? 16 + 20 + 16 : 0) |
| gallery / frame | stored h (fixed) |
| recording | 32 + 44 + 12 + 30 + 12 + 16 + lines(transcript ?? note, 13, 1.5) |
| palette | 32 + 16 + 8 + ceil(n / floor(inner / 48)) · 62 |

### 7.2 compose.ts

```ts
export interface ComposeInput { blocks: AnyBlock[]; obstacles: Rect[]; heights?: Map<string, number> }
export function compose(input: ComposeInput): Placement[]           // places every block in `blocks` that has a region
export function composeNew(seed: { concept: AnyBlock; since: AnyBlock; compass: AnyBlock; anchors: AnyBlock[]; references: AnyBlock[] }): Placement[]
export function regionOf(type: BlockType): TypeSpec['region']       // from registry: top|column|wide|grid|media|none
export function widthFor(region, type): number                      // top FULL · column W · wide WIDE · grid W · media: gallery WIDE else W
```

```
compose(blocks, obstacles, heights):
  h(b) = heights.get(b.id) ?? (b.h > 8 ? b.h : estimateH(b.type, b.content, widthFor(region(b), b.type)))
  concept = one('concept'); since = one('since')             // may be absent when composing only "movable" blocks (tidy)
  out = []
  // ── band A: top, FULL ──
  y = concept ? placeAt(concept, 0, concept.y_fixed ?? 0, FULL) : topBottomFromObstacles()   // tidy: concept is an obstacle; its rect gives the band's top
  if since: placeAt(since, concept.x, concept.y + h(concept) + SINCE_GAP, concept.w)
  yB = (since ? since.y + h(since) : concept.y + h(concept)) + BAND_GAP     // when both are obstacles, use their current rects
  // ── band B: column (x 0, W) ∥ wide (x W+G, WIDE) ──
  col = yB; wide = yB
  for b in [compass?, ...drafts(updated_at desc), ...commitments(open first, then done, created_at desc), ...timeline?, ...updates(created_at desc)]:
      col = flow(b, 0, col, W)
  for a in anchors(created_at asc): wide = flow(a, W + G, wide, WIDE)
  yC = max(col, wide) − ROW_GAP + BAND_GAP
  // ── band C: grid, 3 columns of W across FULL ──
  gy = [yC, yC, yC]
  for b in [...references, ...notes].sort(created_at desc):
      c = argmin(gy); gy[c] = flow(b, c·(W+G), gy[c], W)
  yD = max(gy) − ROW_GAP + BAND_GAP
  // ── band D: media, row flow wrapping at FULL ──
  mx = 0; my = yD; rowH = 0
  for m in [...galleries, ...images, ...recordings, ...palettes].sort(created_at desc):
      w = widthFor('media', m.type)
      if mx + w > FULL and mx > 0: mx = 0; my += rowH + ROW_GAP; rowH = 0
      r = avoid({ x: mx, y: my, w, h: h(m) }, obstacles); assign(m, r); mx = r.x + w + G; rowH = max(rowH, h(m))   // avoid only moves y down
  return out

flow(b, x, y, w): r = avoid({ x, y, w, h: h(b) }, obstacles); assign(b, r); return r.y + r.h + ROW_GAP
avoid(rect, obstacles): loop: hit = obstacles (sorted by y) .find(o => intersects(rect, grow(o, 8))); if !hit break; rect.y = ceil8(hit.y + hit.h + ROW_GAP)   // skyline drop; never sideways; max 500 iterations
assign(b, r): out.push({ id: b.id, x: snap8(r.x), y: snap8(r.y), w: snap8(r.w), h: h(b) })
```
Heading, divider, frame and every block inside a frame have region `none`: compose never places them (they are hand-made structure). Struck blocks flow with their type, sorted last within it.

`composeNew` (server, POST /projects): calls `compose` with `obstacles = []` and estimates; returns rects for concept (FULL × est), since, compass (W), anchors (WIDE), references (W). Z order = insertion order (concept 1, since 2, compass 3, anchors…, references…). The project is created with `composed_at = null` so the client re-composes once from measured heights (7.5).

### 7.3 tidy.ts

```ts
export interface TidyResult { moves: Map<string, { from: Rect; to: Rect }>; stack: { timeline: AnyBlock | null; newTimeline: AnyBlock | null; ids: string[] } }
export function tidy(state: { blocks: AnyBlock[]; heights: Map<string, number>; projectId: string; userId: string }, opts: { everything: boolean }): TidyResult
```
```
tidy(blocks, heights, { everything }):
  live = blocks.filter(!deleted_at && !hidden && !stacked_in)
  frames = live.filter(type === 'frame'); inFrame = live.filter(parent_id)
  fixed = live.filter(b => b.type in {concept, since} || b.locked || b.arrival_state === 'unplaced'
                        || (!everything && b.placed_by === 'person') || frames.includes(b) || inFrame.includes(b))
  movable = live − fixed, filtered to region(b.type) !== 'none'
  // update stacking (D-035): among movable+fixed updates that are single (not stacked), placed, top-level
  singles = live.filter(type === 'update' && !stacked_in && arrival_state === 'placed' && !parent_id).sort(created_at desc)
  stack = { timeline: live.find(type === 'timeline') ?? null, newTimeline: null, ids: [] }
  if singles.length ≥ 8:
     stack.ids = singles.slice(3).map(id)                                   // keep the 3 newest
     if !stack.timeline: stack.newTimeline = makeTimeline(at: rect of singles[last], z: maxZ + 1, placed_by 'auto', name null)
     movable = movable − stack.ids; (the timeline block, existing or new, joins movable)
  obstacles = fixed.map(rectOf) ∪ (stack.newTimeline ? [] : [])
  placements = compose({ blocks: movable ∪ {concept, since as reference rects}, obstacles, heights })
  moves = placements where rect changed, for movable ids only
  return { moves, stack }
```
The caller (B's TidyCommand) applies moves + `stacked_in` changes as one command, toggles the `tidying` class for 320 ms, and then `fit(all)` if any moved block's new rect is outside the viewport. `everything: true` also writes `placed_by 'auto'` on every moved block. Tidy never enters a frame, never changes z, never touches struck state, never moves an unplaced arrival.

### 7.4 arrivals.ts

```ts
export function arrivalRect(live: AnyBlock[], type: BlockType, content: unknown): Rect     // D-036
export function nextArrival(live: AnyBlock[], block: Omit<AnyBlock, 'x'|'y'|'w'|'h'|'z'>, maxZ: number): AnyBlock
```
```
arrivalRect(live, type, content):
  settled = live.filter(!hidden && !stacked_in && arrival_state === 'placed')
  bbox = union(settled) ?? { x: 0, y: 0, w: FULL, h: 0 }
  since = live.find(type === 'since')
  laneX = snap8(bbox.x + bbox.w + ARRIVAL_GAP)
  laneTop = since ? since.y + since.h + ROW_GAP : bbox.y
  w = widthFor('column', type) (= W); h = estimateH(type, content, w)
  waiting = live.filter(arrival_state === 'unplaced' && !deleted_at).sort(created_at asc)
  if waiting.empty: return { x: laneX, y: laneTop, w, h }
  last = waiting[last]
  y = last.y + last.h + ROW_GAP
  if y + h > bbox.y + bbox.h + ARRIVAL_MAX_BELOW: return { x: snap8(last.x + ARRIVAL_COL_STEP), y: laneTop, w, h }   // new column further right
  return { x: last.x, y, w, h }
```
Server-side (talk route, apply): `nextArrival(...)` builds the row with `placed_by 'auto'`, `arrival_state 'unplaced'`, `arrived_from = person entry id`, `z = maxZ + 1`, then inserts. Stored x/y are the single truth; the client draws arrivals exactly where the row says.

Place (D-037): `POST …/arrival { action: 'place' }` → `arrival_state 'placed'`; if `project.auto_layout` the client then runs `composeAuto()` (7.5) so the block flows into its region; else it stays. Drag-to-place: the MoveCommand sets `placed`, `person`. Dismiss: soft delete.

### 7.5 First measured composition and auto-layout additions (client, B calls F)

```
onFirstOpen (composed_at null, desktop only):
  render all blocks at their stored rects with visibility:hidden for one frame; ResizeObserver reports every auto-height h
  placements = compose({ blocks: live top-level, obstacles: [], heights })
  apply as a silent patch (no undo), PATCH batch, PATCH /projects/:id { composed_at: now }
  reveal with the stagger (6.5)
composeAuto():   // while project.auto_layout is true, after: library create (types with a region), arrival place, draft create
  placements = compose({ blocks: live top-level auto placed blocks, obstacles: personPlaced ∪ frames ∪ inFrame ∪ unplaced, heights })
  apply only to auto blocks whose rect changed (silent patch, not undoable; the CreateCommand itself is undoable)
```
A phone that opens first sees the server's estimated rects (never re-composes); the first desktop open composes from measurement.

### 7.6 Unit tests (F, `layout/__tests__/*.test.ts`, `tsx --test`)

- `estimate`: monotone in text length; every result a multiple of 8; minimums respected.
- `compose`: concept at (0,0,1008); since directly under it at +8; compass at (0, yB); anchors at x 344 width 664; grid uses the shortest column; media wraps at 1008; no two placements intersect; every x/y/w multiple of 8; a person-placed obstacle in band C pushes grid items down, never sideways; heading/divider/frame never placed.
- `tidy`: person-placed and locked and unplaced blocks never appear in `moves`; ≥ 8 singles → 3 remain, others in `stack.ids`, existing timeline reused; `everything` moves person blocks; result is idempotent (tidy(tidy(x)) has no moves).
- `arrivals`: first arrival at bbox.right + 48; second stacks below with 24 gap; overflow past bbox.bottom + 384 starts a new column at +344; empty project uses FULL as bbox width.

---

## 8. Talk pipeline

Lane G owns `lib/studio/talk/*`, `components/talk/*`, `app/api/studio/projects/[id]/talk/route.ts`, `app/api/studio/catches/[catchId]/route.ts`, `lib/studio/since.ts`. Lane A's `/open` route imports `sweepUnsorted` from G's `apply.ts` (A creates the stub).

### 8.1 Client (components/talk/talk-drawer.tsx, talk-composer.tsx, catch-line.tsx, talk-bar.tsx)

- Entry points: the bottom-right talk pill (tap → drawer; press-and-hold 400 ms → drawer opens already dictating), `Cmd/Ctrl+K`, the phone talk bar. One drawer, segmented `talk | direction talk` at the top; the segment sets `kind`.
- Composer: the copied `Composer` (textarea + `MicButton` + send) with `useDictation({ onAppend, getContext })` (Web Speech → `/api/punctuate`, words verified unchanged); interim words in `t.textMuted`; typing always allowed; any length; no timer, no counter, nothing asks the person to sort.
- Send: optimistic person entry in the thread (copied `Thread`, `align 'left'`), `POST /projects/:id/talk` with `TalkRequest`; `readTextStream(res, onText)`; the reply streams into the thread. Footer reads `listening for what to keep…` (mono 10) until the meta frame lands.
- On meta (`TalkMeta`): insert `meta.blocks` (full arrival rows) into the store and merge `meta.compass` into `store.compass` — no refetch; markers pulse; the arrivals pill appears if the column is off-screen; the compass block re-renders (`n waiting`); `suggest_done_ids` → the matching commitment blocks show `you said this was done — tick it?`; `catch` → render `CatchLine` after the reply: the sentence in the companion's voice + two mono buttons `that's right` · `that's wrong` (`POST /catches/:id { mark }`); the since line refreshes locally (`since.ts` recompute from the new facts).
- History: `GET /projects/:id/talk?kind=talk&limit=40` on open; `before` paging on scroll-up.
- Nothing is placed for the person; nothing in the compass becomes active.

### 8.2 Server (`talk/route.ts`) — one request, one stream

```
export const maxDuration = 60
POST body: TalkRequest { text, input, kind }
1. auth; load project (404); text required (400)
2. ctx = await buildTalkContext(auth, project, kind)          // context.ts (8.4); parallel loads
3. personId = insert studio_talk_entries { role 'person', kind, input, text }
4. companionId = crypto.randomUUID()                            // pre-generated so meta can carry it (fix)
5. sortPromise = kind === 'talk' ? sortTalk(auth, ctx, text, personId) : sortDirection(auth, ctx, text, personId)   // MODELS.fast, concurrent
6. askId = ctx.commitmentToAsk?.id ?? null
7. return streamClaudeText('studio/talk', {
     model: MODELS.deep, max_tokens: kind === 'direction' ? 2048 : 1024,
     system: withLanguage([COMPANION_TONE, kind === 'talk' ? TALK_ROLE : DIRECTION_ROLE, ctx.text, askId ? ASK_BLOCK(ctx.commitmentToAsk) : ''].join('\n\n')),
     messages: [...cacheLastMessage(ctx.priorTurns), { role: 'user', content: text }],
   }, async (fullText) => {                                     // buildMeta made async-capable in the copied streaming.ts
     await insert companion entry { id: companionId, role 'companion', kind, text: fullText, reply_to: personId }
     if askId: update compass entry { asked_at: now, ask_count: +1 }
     const sort = await withTimeout(sortPromise, 12_000, EMPTY_SORT)
     const applied = await applySort(auth, project, personId, sort, ctx)        // apply.ts (8.5); sets sorted_at
     const caught = await maybeCatch(auth, project, personId, sort, ctx)        // catch.ts (8.6); MODELS.deep only when candidates exist
     return { person_entry_id: personId, companion_entry_id: companionId, applied, catch: caught, blocks: applied.rows, compass: applied.compassRows }
   })
```
`logUsage` is called by `streamClaudeText` for the reply and inside `sortTalk`/`maybeCatch` for their calls. On any failure inside buildMeta the error is logged and the meta still returns `{ person_entry_id, companion_entry_id, applied: EMPTY, catch: null }`; `sorted_at` stays null so the sweep on next open retries.

`sweepUnsorted(auth, projectId)` (apply.ts): person entries with `sorted_at null` and `created_at < now − 2 min`, oldest first, max 5 → `sortTalk` + `applySort` + `maybeCatch` (no reply; a catch found here is still spoken as a companion entry so it appears in the thread on open).

### 8.3 Prompts (talk/prompts.ts) — outlines; every system string starts with COMPANION_TONE and ends with withLanguage()

- `TALK_ROLE`: "You are with someone while they make a project. They make it; you do not. They may talk for ten seconds or forty minutes and you never ask them to sort what they said. Notice what they said, name the move (not the person), ask at most one question that matters, hold what they have committed to. If a commitment is due to be asked about it is named below — ask once, in passing, plainly, never scold, never open with it, skip it if they just mentioned it. Never evaluate the work, never estimate how it will do, never propose a list of next steps, never praise the work itself. You have never seen their images, heard their recordings or read the pages they reference: you know only the words they wrote about them. Refer to the compass as 'the compass' and to what they said as their words; never mention blocks or the canvas by other names. Keep it short unless they brought weight." Then the six-principle list as negative rules.
- `DIRECTION_ROLE`: the same voice, allowed to ask bigger questions about where the project is headed, to read the concept edits (dated) against the last two weeks of what they said, to show drift plainly (behaviour against an unchanged concept) and distinguish it from recalibration (a dated edit), and to reflect the compass back. Still never judges the work, never proposes what to make, never drafts the concept for them (it may say that the concept might want a sentence about X; the person writes it).
- `ASK_BLOCK(c)`: "One commitment is due to be asked about (id …): “{statement}”, said {relative}. If it fits, ask how it went. Do not invent others."
- `SORT_SYSTEM` (MODELS.fast, temperature 0, JSON only): silent sorter of ONE entry against the concept, the active and pending compass with ids, and open commitments with ids. Rules: quote them — every `text` and `quote` field is the person's exact words (a contiguous span); an update is what they said about the project today, 1–3 sentences, never a verdict; most entries yield one update and nothing else; a commitment needs a first-person future intent about a concrete thing ("I'll", "vou", "tomorrow I"); a refusal is a stated boundary about this work ("I won't", "never again", "not for this"); a non-negotiable is something the project must keep ("has to stay in Portuguese"); drift ONLY when the entry contradicts an active refusal/non-negotiable (quote both); a decision is a settled choice about the work (not a mood) and `collides_with` is the id of an active refusal/non-negotiable it runs against, else null; `reinforce_id` instead of a duplicate when a statement restates an existing entry (never re-propose rejected statements, listed); `done_commitment_ids` only when they clearly say they did it; an empty result is common and correct. Output `TalkSort` exactly.
- `DIRECTION_SORT_SYSTEM`: same, but may only produce `compass` entries of kind `drift` and `refusal` (≤ 2) and never an update, commitment or decision (`update` null, others empty).
- `CATCH_SYSTEM` (MODELS.deep, 300 tokens, JSON `{ collides: boolean, sentence: string }`): given the refusal/non-negotiable statement with its date and evidence quote and the decision quote from today, decide whether they genuinely collide; if so write one or two sentences in the companion voice that quote both, as an observation, never an order or a verdict, ending with a plain question of which one stands. If not, `collides: false`.
- `DRAFT_CHAT_SYSTEM` — section 9.

### 8.4 Context builder (talk/context.ts) — the only path from the project into a prompt

```ts
export interface TalkContext { text: string; priorTurns: MessageParam[]; commitmentToAsk: CompassEntry | null; active: CompassEntry[]; pending: CompassEntry[]; rejected: string[]; openCommitments: CompassEntry[]; recentUpdates: Array<{ text: string; at: string }> }
export async function buildTalkContext(auth, project: Project, kind: TalkKind): Promise<TalkContext>
export function readable(block: AnyBlock, assets: Map<string, Asset>): CompanionReadable | null   // the choke point (D-059)
```
Context text, stable-first for prompt caching: CONCEPT (latest body + constraints; direction talk adds the dates of the last 3 edits with one-line diffs) → COMPASS (active: refusals, non-negotiables with reinforcement counts, drift; then open commitments with days since said and ask_count) → WHERE YOU WERE MARKED WRONG (last 5 catches with mark = wrong: sentence) → LAST 10 UPDATES (text + date, from update blocks incl. stacked) → THE PERSON'S OWN WORDS ON THE CANVAS via `readable()` (anchors, notes, reference notes — never urls or titles of pages, only the title the person typed; image captions; recording notes and own-voice transcripts; struck blocks listed as struck with their sentence), capped at 2 000 chars → USER PORTRAIT (`formatPortraitForPrompt(await getActivePortrait(auth))` from `lib/portrait-read.ts`, read-only) . `priorTurns` = last 20 entries of the same kind as messages (person → user, companion → assistant). `commitmentToAsk` = active, unresolved, `asked_at` null or older than 2 days, oldest `asked_at` first, said before the previous talk. Never included: asset ids/paths, urls, page content, draft prose, other projects.

### 8.5 Apply (talk/apply.ts) — all writes via `auth.supabase`

```ts
export async function applySort(auth, project, personEntryId, sort: TalkSort, ctx): Promise<TalkApplied & { rows: AnyBlock[]; compassRows: CompassEntry[] }>
export function validateSort(sort: unknown, personText: string, ctx): TalkSort     // verbatim + caps (D-055)
export async function sweepUnsorted(auth, projectId: string): Promise<number>
```
```
validateSort: parse tolerant JSON; drop any update/commitment/decision whose text, and any compass proposal whose quote, is not a normalised substring of personText (verbatim.ts: lowercase, strip punctuation, collapse whitespace); cap updates 1 (the sort returns one), commitments 2, compass 3, decisions 3; drop reinforce_ids not in ctx.active ∪ ctx.pending; drop done_commitment_ids not in ctx.openCommitments; drop collides_with not in ctx.active.
applySort:
  live = live blocks of the project; maxZ
  if sort.update: row = nextArrival(live, { type 'update', content { text, said_at: now, entry_id, origin 'talk' }, arrived_from }, ++maxZ); insert; rows.push
  for c of sort.commitments: entry = insert compass { kind 'commitment', statement: c.text, proposed_statement: c.text, status 'pending', source_entry_id, evidence [{ entry_id, quote: c.text, at }] }
                             block = nextArrival(live ∪ rows, { type 'commitment', content { entry_id: entry.id }, arrived_from }, ++maxZ); insert; update entry.block_id; rows.push; compassRows.push
  for p of sort.compass: if p.reinforce_id: rpc studio_reinforce_compass_entry(id, [{ entry_id, quote, at }]); reinforced_ids.push
                         else: insert { kind, statement, proposed_statement: statement, status 'pending', source_entry_id, evidence [{ entry_id, quote, at }] }; compass_pending_ids.push
  suggest_done_ids = sort.done_commitment_ids                     // nothing is marked done here; the person ticks
  enforcePendingCap(project) (D-058)
  update person entry { sort, sorted_at: now }; bumpCanvasVersion
```
Direction talk: `applySort` receives only compass proposals (drift/refusal, pending).

### 8.6 The catch (talk/catch.ts) — D-056

```ts
export async function maybeCatch(auth, project, personEntryId, sort: TalkSort, ctx): Promise<Catch | null>
```
```
candidates = sort.decisions.filter(d => d.collides_with) mapped to (refusal = ctx.active.find(id), decision_text)
for each candidate (strongest refusal first, by reinforcement_count):
  if exists studio_catches where refusal_entry_id = refusal.id and created_at > now − 30 days and (mark is null or mark = 'right') → skip   // spoken once
  { collides, sentence } = MODELS.deep CATCH_SYSTEM (json)  → if !collides continue
  catch = insert studio_catches { refusal_entry_id, person_entry_id, decision_text, sentence }
  spoken = insert studio_talk_entries { role 'companion', kind: 'talk', text: sentence, reply_to: personEntryId, catch_id: catch.id }
  update catch.spoken_entry_id; return catch          // at most ONE catch per talk
return null
```
Marks: `POST /catches/:id { mark }`; `right` = the compass drawer shows nothing further; `wrong` = the sentence is listed under `where you said the companion was wrong` in the drawer and fed to context (8.4). A catch is never re-spoken; unmarked catches show as `one thing to mark` in the compass block and drawer and count in the since line.

### 8.7 Compass lifecycle (lib/studio/compass.ts, lane A) + drawer (lane D)

`decide(auth, entryId, req: CompassDecideRequest)` implements D-058 and D-052 exactly as the route table says. `enforcePendingCap` (called by apply): pending entries beyond 8, oldest first → `dormant`, `rejection_note 'expired'`. Decay: `getActiveCompass` excludes active entries with `last_reinforced_at` older than 150 days (drift 30 days) from sorter/catch context and lists them under `faded` in the drawer; reinforcement brings them back. Drawer sections in order: `waiting` (pending, each with the proposed statement, evidence quotes with dates, and `confirm · correct · reject`), `to mark` (unmarked catches: sentence + `right · wrong`), `refusals`, `non-negotiables`, `open commitments` (with `done · let go`), `drift`, `faded`, `forgotten` (dormant, with `restore`), `where you said the companion was wrong` (marked wrong, read-only). No score is displayed anywhere.

### 8.8 Since you were here (lib/studio/since.ts, lane G; the since block in C renders it)

```ts
export function sinceSentence(p: SincePayload, now: Date, firstOpen: boolean): { lines: string[]; dots: boolean[] }
```
Deterministic, no model. `firstOpen = !p.last_said && p.arrived_since === 0 && p.waiting === 0` → `['first time here']`. Otherwise up to three lines: (1) `you last said “{text}” · {relative}` when `last_said` (kind direction → `in direction talk `); (2) `{n} arrived from talk` when `arrived_since > 0`, else `{n} waiting at the edge` when `waiting > 0`; (3) `the compass has something` when `compass_pending + catches_unmarked > 0` (`one thing to mark` when only catches). Dot = true on lines 2 and 3 when they have something. If only line 1 exists and nothing waits: append `· nothing new since {relative(last_opened_at)}` to line 1. Regenerated on open, on the 60 s poll, on the meta of every talk.

---

## 9. Draft studio (minimal)

Lane D owns `components/draft/*`, `app/p/[id]/draft/[draftId]/page.tsx`, `app/api/studio/drafts/[draftId]/chat/route.ts`, `lib/studio/drafts.ts`. Lane A owns the draft CRUD routes and the draft block's data in the bundle. The draft block's card renderer (`blocks/rich/draft-card.tsx`) is lane D too.

### 9.1 Where it opens

- Desktop: the draft card's `open →` (or double-click / Enter / context bar `open`) opens the draft drawer (760 px; `wider` → 100 %). Phone: tap → read-only sheet; the full route `p/[id]/draft/[draftId]` renders the same `DraftStudio` full-page (read-only on phone).
- The drawer is unscaled DOM (outside `data-world`), so Tiptap is safe here.

### 9.2 Layout of `DraftStudio`

Header: eyebrow `DRAFT · ESSAY`, title (inline rename), kind select (`essay | brief | copy | lyrics | other`), posture control (three-segment `suggest | ask | locked` mono labels), `wider`, close. Body, two columns: left = the sections (stacked `SectionEditor` instances, one shared `SectionToolbar` routed to the focused editor via `onReady`/`onTransaction`, each section with a label field, a `lock` toggle (locked = `editable false`, muted background `t.cardBgInner`, 12 px lock glyph), `add section` at the bottom, drag handle to reorder); right rail 240 px = the anchor rail (every live, unstruck anchor block of the project in `anchor` type at 18 px, ochre rule, read from the bundle — never copied) and, below it, the chat (`Thread` + `Composer`).

### 9.3 Saving

`lib/studio/drafts.ts`: `useDraft(draftId)` loads `GET /drafts/:id`; edits are debounced 800 ms → `PUT /drafts/:id/sections` (ordered replace, full list); title/kind/posture → `PATCH /drafts/:id`. After every save the store's `drafts[]` summary is updated (`sections: {label, is_locked, has_text}`) so the card re-renders without a mirror in block content. `ensureSectionsHtml` from the copied `rich-text.ts` normalises legacy plain text.

### 9.4 Posture and the chat route (`/drafts/:draftId/chat`, MODELS.deep, 4096 tokens, streaming)

```
body: DraftChatRequest
load draft + sections + project anchors + last 20 draft messages
posture = draft.posture (server truth; never trusted from the client)
locked  → 409 { error: 'this draft is locked for the companion' } — the client shows that line in the thread, no call to the model
ask     → system = COMPANION_TONE + DRAFT_ASK_ROLE (questions only, ≤ 3, about the named section or selection; may name a move; never writes prose; never says whether the writing is good) + context; no <proposed_edit> allowed (stripped if it appears)
suggest → system = COMPANION_TONE + DRAFT_SUGGEST_ROLE (the copied write-chat's "coach" discipline plus: when they clearly ask for a version, append ONE proposal ≤ a paragraph wrapped in <proposed_edit>…</proposed_edit>, only for the focused, unlocked section; never inserted) + context
context = draft title/kind; the focused section's text (never other sections' prose unless preceding ones are needed, then labels + text); selected_text; the anchor lines ("precious; weave, never drop"); nothing about the canvas beyond anchors.
stream with hideFrom ['<proposed_edit>']; buildMeta → { proposed_edit: string | null }; insert both draft messages.
```
Client: a proposal renders as a pending card under the thread with `apply` / `discard`; `apply` inserts the text at the caret (or replaces the selection) via the `PendingEditMark` (highlighted until the person clicks `keep` inside the editor, exactly the main app's pattern), never automatically. Locked sections are never touched.

### 9.5 The draft block mirrors anchor lines

The card does not show anchors; the studio's rail does. The rail is a READ of `store.blocks` filtered `type === 'anchor' && !struck_at && !deleted_at`, sorted by created_at; striking an anchor removes it from every rail at once; nothing is copied into the draft rows.

### 9.6 Creating a draft

Library tile `draft` → `POST /projects/:id/drafts { title: 'untitled draft', kind: 'essay' }` → the route creates the draft with one empty section and the block (composed while `auto_layout`, else at the given x/y) and returns both; the card opens the drawer immediately.

Never shown: word counts, reading time, completion, "n sections written".

---

## 10. Shelf + project creation

### 10.1 The shelf (`app/shelf/page.tsx`, `components/shelf/*`, lane A)

`PageShell` with `dock={false}`, mood `neutral`. Header: `the shelf` (h2), right: `new project` (`PrimaryButton`) and the theme toggle. Grid of project cards (`Card`), 2 columns ≥ 720 px, 1 below: title (`title` role), status pill (mono 10 uppercase; `resting · 9 days left` computed from `resting_until`), the concept's first 200 chars in `small` `t.textSecondary`, then the since line for that project (from `ShelfProject.since`, via `sinceSentence`) in `small` with tide dots. Sorted: active first (by `updated_at desc`), then resting, then completed. Click → `/p/:id`. A completed/abandoned card shows its completion sentence in mono 11. Empty: `no projects yet` + `new project`. Nothing counts anything.

Status changes happen inside the project (right dock → project), never from the shelf.

### 10.2 New project (`app/new/page.tsx`, `components/new/*`, `lib/studio/concept.ts`, `POST /projects/draft-concept`, lane H)

Two ways in, one screen, under ten minutes:

1. **from a brief**: a large textarea `paste a brief, a note to yourself, anything` (typed or dictated with `useDictation`), then `read it`.
2. **four questions**: one at a time, each answered typed or by voice, `next`:
   1. `what is it?`
   2. `who is it for, and what should it do to them?`
   3. `what will you not do in it?`
   4. `what must it keep, whatever happens?`

Then `POST /projects/draft-concept { mode, brief | answers }` (MODELS.deep, 1200 tokens, JSON `DraftConceptResponse`): the model writes a title (≤ 6 words, lowercase), a concept body in the person's register (2–5 sentences that restate what THEY said — a definition, not a plan), constraints (one line each, from what they said), `anchor_candidates` (≤ 3 verbatim phrases they said as if they mattered; validated in code as substrings of the input, else dropped), `references` (every URL in the input + the sentence around it as the note; title left empty for the person), `compass_seed` (from answers 3 and 4, or from the brief when it states refusals/musts: `kind`, `statement` in their terms, `quote` verbatim, validated). Nothing is persisted by this route.

**Review screen** (`ConceptReview`): title input, body textarea, constraints as lines (add/remove), `anchor lines` as checkboxes (default checked), `references` with a title field each, `the compass will ask you to confirm these` list (read-only, from `compass_seed`). Everything editable; the person must press `make the project`. Principle 2: the model drafted a definition from their words; the person edits it before anything exists.

`POST /projects` with `CreateProjectRequest` → the bundle → `router.push('/p/:id')`. The canvas opens composed (7.2 then 7.5) with concept, since, compass, the ticked anchors (large, in `wide`), references (in `grid`), and the compass block showing `n waiting`.

### 10.3 Concept editing (lane H) — D-062

`ConceptEditor` is mounted by the concept block (C) in editing mode: title, body, constraints; `save` → `POST /projects/:id/concept` → new revision (origin `edit`) → store `concept` replaced; the block's eyebrow updates (`EDITED 12 SEP`); `cancel` restores. `ConceptRevisionsDrawer` lists revisions newest first with date and a one-line diff summary (`+2 lines · −1 constraint`, computed client-side), each expandable to its full text; `restore as a new edit` copies an old body into a new revision (never overwrites history). Direction talk never writes a revision.

### 10.4 Status model — D-060

`active` (default) · `resting` (`PATCH { status: 'resting' }` → trigger sets `resting_until = now + 14 d`; the project panel shows `resting · n days left` and no wake action until then; after that `wake` → `PATCH { status: 'active' }`) · `finished` / `kept` / `abandoned` (`PATCH { status, completion_note }`; the dialog asks for one sentence: `finished — what did it become?`, `kept — what are you keeping it for?`, `abandoned — what did you learn?`). Any number of active projects. Read-only rules per D-060; the top-bar strip explains. The shelf shows all of them; nothing is hidden or archived away.

---

## 11. File tree and ownership map

Lanes: **A-foundation** runs FIRST and alone; **B–H** run in parallel after A and only create/edit files they own. `(exists)` = already in the scaffold; A keeps or adjusts it. Every file belongs to exactly one lane. Paths relative to `studio/`.

```
package.json                                            A (exists — scripts dev/build/typecheck/test already there; no new deps)
next.config.ts · tsconfig.json · postcss.config.mjs · vercel.json · .eslintrc.json · .env.local   A (exist)
README.md                                               A (exists; append: migration order, lanes, how to run tests)
supabase/migrations/001_studio_foundation.sql           A — section 2 verbatim
public/favicon.svg · apple-touch-icon.png · manifest.json   (exist)

src/middleware.ts                                       A (exists; / → /shelf already)
src/app/layout.tsx · globals.css · page.tsx             A (exist)
src/app/login/ · signup/ · reset/                       (exist)
src/app/shelf/page.tsx                                  A — the shelf (10.1)
src/app/new/page.tsx                                    H — project creation (10.2)
src/app/p/[id]/page.tsx                                 A — loads GET bundle, POST /open, phone gate (B's isPhone), read-only gate, mounts <CanvasPage> or <PhoneStage>
src/app/p/[id]/draft/[draftId]/page.tsx                 D — full-page draft studio (read-only on phone)
src/app/p/[id]/compass/page.tsx                         D — phone compass route

src/app/api/punctuate/route.ts                          (exists)
src/app/api/studio/projects/route.ts                    A — GET shelf · POST create (composeNew from F)
src/app/api/studio/projects/draft-concept/route.ts      H — MODELS.deep concept draft
src/app/api/studio/projects/[id]/route.ts               A — GET bundle · PATCH · DELETE
src/app/api/studio/projects/[id]/open/route.ts          A — RPC studio_open_project + sweepUnsorted (from G)
src/app/api/studio/projects/[id]/since/route.ts         A — RPC studio_since
src/app/api/studio/projects/[id]/concept/route.ts       H — POST revision
src/app/api/studio/projects/[id]/concept/revisions/route.ts   H — GET
src/app/api/studio/projects/[id]/blocks/route.ts        A — PATCH batch · POST single
src/app/api/studio/projects/[id]/blocks/[blockId]/strike/route.ts    A — POST · DELETE
src/app/api/studio/projects/[id]/blocks/[blockId]/arrival/route.ts   A — place · dismiss
src/app/api/studio/projects/[id]/links/route.ts         A — POST
src/app/api/studio/projects/[id]/links/[linkId]/route.ts   A — PATCH word · DELETE
src/app/api/studio/projects/[id]/compass/route.ts       A — GET entries + catches
src/app/api/studio/compass/[entryId]/route.ts           A — POST decide
src/app/api/studio/projects/[id]/talk/route.ts          G — POST stream · GET history
src/app/api/studio/catches/[catchId]/route.ts           G — POST mark
src/app/api/studio/projects/[id]/drafts/route.ts        A — POST create draft + block
src/app/api/studio/drafts/[draftId]/route.ts            A — GET · PATCH · DELETE
src/app/api/studio/drafts/[draftId]/sections/route.ts   A — PUT
src/app/api/studio/drafts/[draftId]/chat/route.ts       D — POST stream, posture-gated
src/app/api/studio/assets/sign/route.ts                 E — signed upload url + asset row
src/app/api/studio/assets/commit/route.ts               E — dimensions/envelope/own_voice/transcript
src/app/api/studio/assets/[assetId]/route.ts            E — PATCH own_voice/transcript
src/app/api/studio/assets/[assetId]/url/route.ts        E — fresh signed urls

src/lib/design-tokens.ts · models.ts · anthropic.ts · companion-tone.ts · language.ts · stream-client.ts · prompt-cache.ts · usage-log.ts · use-dictation.ts · settings.ts · dates.ts · utils.ts · rich-text.ts · crisis-resources.ts   (exist, copied)
src/lib/streaming.ts                                    A (exists; ONE change: `buildMeta?: (fullText) => Record<string,unknown> | Promise<Record<string,unknown>>` and `await` it)
src/lib/portrait-read.ts                                A — getActivePortrait + formatPortraitForPrompt copied from the main app's portrait.ts, READ ONLY (D-051)
src/lib/supabase/client.ts · server.ts · route.ts       (exist)

src/lib/studio/types.ts                                 A — section 3 verbatim, FROZEN
src/lib/studio/registry.ts                              A — `export const registry: Registry` (D-011…D-014, region per 7.2, label/holds copy) + `spec(type)`
src/lib/studio/canvas-tokens.ts                         A — section 6.1 verbatim
src/lib/studio/store.ts · hooks.ts                      A — 5.3
src/lib/studio/db.ts                                    A — loadBundle, bumpCanvasVersion, signAssets, nextZ, assertProjectWritable, shelfProjects
src/lib/studio/compass.ts                               A — decide(), enforcePendingCap(), getActiveCompass() with decay (8.7)
src/lib/studio/api-client.ts                            A — typed fetch wrappers for every route in section 4 (`api.blocks.batch(...)`, `api.talk.send(...)` returns the Response for streaming, etc.)
src/lib/studio/geometry.ts                              B — 5.1
src/lib/studio/engine/viewport.ts                       B — 5.2
src/lib/studio/engine/pointer.ts                        B — 5.4
src/lib/studio/engine/snap.ts                           B — 5.5
src/lib/studio/engine/selection.ts                      B — 5.6
src/lib/studio/engine/frames.ts                         B — 5.7
src/lib/studio/engine/zorder.ts                         B — 5.8
src/lib/studio/engine/commands.ts                       B — 5.9
src/lib/studio/engine/autosave.ts                       B — 5.10
src/lib/studio/engine/keyboard.ts                       B — 5.11
src/lib/studio/engine/culling.ts                        B — 5.12
src/lib/studio/engine/phone.ts                          B — 5.13
src/lib/studio/engine/__tests__/snap.test.ts · viewport.test.ts · commands.test.ts   B
src/lib/studio/layout/constants.ts                      F — 7.0
src/lib/studio/layout/estimate.ts                       F — 7.1
src/lib/studio/layout/compose.ts                        F — 7.2 (compose, composeNew, regionOf, widthFor)
src/lib/studio/layout/tidy.ts                           F — 7.3
src/lib/studio/layout/arrivals.ts                       F — 7.4
src/lib/studio/layout/__tests__/estimate.test.ts · compose.test.ts · tidy.test.ts · arrivals.test.ts   F — 7.6
src/lib/studio/talk/prompts.ts                          G — 8.3
src/lib/studio/talk/context.ts                          G — 8.4 (buildTalkContext, readable)
src/lib/studio/talk/sort.ts                             G — sortTalk, sortDirection (MODELS.fast)
src/lib/studio/talk/apply.ts                            G — 8.5 (validateSort, applySort, sweepUnsorted)
src/lib/studio/talk/catch.ts                            G — 8.6
src/lib/studio/talk/verbatim.ts                         G — normalise(), isVerbatim(span, source)
src/lib/studio/talk/__tests__/verbatim.test.ts · since.test.ts   G
src/lib/studio/since.ts                                 G — 8.8
src/lib/studio/media/resize.ts                          E — canvas resize to 1600 max edge + 480 webp thumb; returns { blob, thumb, width, height, aspect }
src/lib/studio/media/upload.ts                          E — sign → PUT (supabase.storage.from('studio-media').uploadToSignedUrl) → commit
src/lib/studio/media/waveform.ts                        E — decodeAudioData → 24-sample envelope
src/lib/studio/media/recorder.ts                        E — MediaRecorder + SpeechRecognition together; `reference` toggle disables recognition
src/lib/studio/drafts.ts                                D — useDraft, save debouncing, summary refresh
src/lib/studio/concept.ts                               H — diff summary, revision helpers

src/components/theme/ · shell/ · ui/ · auth/ · conversation/ · writing/ · LangSync.tsx   (exist, copied)
src/components/canvas/canvas-page.tsx                   A — composition root: StoreContext, ConfirmProvider use, mounts Stage (B), chrome (A), LinksLayer (D), DrawerHost (A), ArrivalsPill (B), StatusStrip (A); calls registerAll() from blocks/index.ts
src/components/canvas/stage.tsx                         B — 5.0 (stage div, wheel/pointer binding, refs Map, overlay mount, grid background)
src/components/canvas/world.tsx                         B — transformed layer, culled block list, tidying class
src/components/canvas/block-view.tsx                    B — memoised positioned wrapper, dispatch via registry, BlockShell wrap
src/components/canvas/measure.ts                        B — ResizeObserver write-back (5.14) + first-open hidden measure (7.5)
src/components/canvas/overlays/selection-overlay.tsx    B — outline, handles, hover, multi bbox
src/components/canvas/overlays/guides-overlay.tsx       B — guides, gap labels
src/components/canvas/overlays/marquee.tsx              B
src/components/canvas/overlays/size-labels.tsx          B — `320 × 148` pill (X)
src/components/canvas/overlays/link-rubber.tsx          B — link-in-progress line
src/components/canvas/overlays/arrivals-pill.tsx        B — `2 arrived →` (D-038)
src/components/canvas/blocks/registry.ts                A — registerBlock/getRegistration + BlockRendererProps/BlockSettingsProps/BlockSheetProps
src/components/canvas/blocks/block-shell.tsx            A — paper/paperless/media wrapper: eyebrow row, hover ring, struck line + sentence, arrival outline + marker + place/dismiss footer, locked glyph, chip mode (6.3, 6.6)
src/components/canvas/blocks/fallback-block.tsx         A — renders the type word + first line for unregistered types
src/components/canvas/blocks/index.ts                   A — `registerAll()` calls the three register files
src/components/canvas/blocks/text/register.ts           C (A creates the stub) — registerTextBlocks()
src/components/canvas/blocks/text/concept.tsx           C — read view + editing mode mounting H's ConceptEditor
src/components/canvas/blocks/text/since.tsx             C — uses G's sinceSentence
src/components/canvas/blocks/text/update.tsx            C
src/components/canvas/blocks/text/timeline.tsx          C — rows from store.childrenStacked(id); unstack drag handle (data-no-drag) → UnstackCommand
src/components/canvas/blocks/text/note.tsx              C
src/components/canvas/blocks/text/heading.tsx           C
src/components/canvas/blocks/text/divider.tsx           C
src/components/canvas/blocks/text/anchor.tsx            C
src/components/canvas/blocks/text/reference.tsx         C
src/components/canvas/blocks/text/commitment.tsx        C — checkbox → api.compass.decide resolve; "tick it?" line
src/components/canvas/blocks/text/settings.tsx          C — Settings components for the ten text types (heading size, update → make an anchor line, reference url/title, unstack, done/let go, …)
src/components/canvas/blocks/text/sheets.tsx            C — phone Sheet components for the ten text types (expanded readable content)
src/components/canvas/blocks/rich/register.ts           D (A creates the stub)
src/components/canvas/blocks/rich/draft-card.tsx        D
src/components/canvas/blocks/rich/compass-block.tsx     D — read-only compact (6.2)
src/components/canvas/blocks/rich/frame.tsx             D — dashed region, name tab, chevron (data-frame-bar), tint
src/components/canvas/blocks/rich/settings.tsx          D — posture, open, frame tint/collapse
src/components/canvas/blocks/rich/sheets.tsx            D — draft read-only sheet, compass sheet wrapper
src/components/canvas/blocks/media/register.ts          E (A creates the stub)
src/components/canvas/blocks/media/image.tsx            E
src/components/canvas/blocks/media/gallery.tsx          E
src/components/canvas/blocks/media/recording.tsx        E
src/components/canvas/blocks/media/palette.tsx          E
src/components/canvas/blocks/media/lightbox.tsx         E
src/components/canvas/blocks/media/settings.tsx         E — caption/fit, columns, own-voice toggle, swatch editor, replace/upload
src/components/canvas/blocks/media/sheets.tsx           E — phone sheets (lightbox, player)
src/components/canvas/links/links-layer.tsx             D (A creates the stub) — world-space SVG, imperative updateFor(moveSet, δ) via a ref API B calls
src/components/canvas/links/link-word-popover.tsx       D
src/components/canvas/chrome/panel.tsx                  A — ink-glass primitive
src/components/canvas/chrome/top-bar.tsx                A
src/components/canvas/chrome/left-rail.tsx              A
src/components/canvas/chrome/library-panel.tsx          A — tiles from registry; click/drag → machine.enterPlacing
src/components/canvas/chrome/blocks-list-panel.tsx      A — layers list; z drag → ZCommand (B's commands imported)
src/components/canvas/chrome/right-dock.tsx             A
src/components/canvas/chrome/selection-settings.tsx     A — common fields + registry Settings dispatch
src/components/canvas/chrome/grid-panel.tsx             A — snap/sizes/grid/tidy + key map
src/components/canvas/chrome/project-panel.tsx          A — status changes, concept edit, revisions, delete
src/components/canvas/chrome/context-bar.tsx            A
src/components/canvas/chrome/zoom-pill.tsx              A — zoom + fit + tidy + save word
src/components/canvas/chrome/talk-pill.tsx              A — tap / press-and-hold → opens G's drawer with `dictate: true`
src/components/canvas/chrome/status-strip.tsx           A — read-only strip for resting/completed
src/components/canvas/drawers/drawer.tsx                A — right drawer primitive (6.4)
src/components/canvas/drawers/drawer-host.tsx           A — mounts talk (G), compass (D), draft (D), revisions (H) by store.drawer.kind
src/components/talk/talk-drawer.tsx                     G (A creates the stub)
src/components/talk/talk-composer.tsx                   G
src/components/talk/catch-line.tsx                      G
src/components/talk/talk-bar.tsx                        G (A creates the stub) — phone bottom bar
src/components/compass/compass-drawer.tsx               D (A creates the stub)
src/components/compass/proposal-row.tsx · entry-row.tsx · catch-row.tsx · compass-sheet.tsx   D
src/components/draft/draft-studio.tsx                   D (A creates the stub)
src/components/draft/section-list.tsx · posture-control.tsx · anchor-rail.tsx · draft-chat.tsx   D
src/components/concept/concept-editor.tsx               H (A creates the stub)
src/components/concept/concept-revisions-drawer.tsx     H (A creates the stub)
src/components/new/new-project-flow.tsx · brief-paste.tsx · four-questions.tsx · concept-review.tsx   H
src/components/shelf/shelf-grid.tsx · project-card.tsx  A
src/components/phone/phone-stage.tsx                    B (A creates the stub)
src/components/phone/block-sheet.tsx                    B
```

### 11.1 Stubs lane A creates (exact exports; bodies minimal; the owning lane replaces the body, never the signature)

| File | Export (must match) | Stub behaviour |
|---|---|---|
| `lib/studio/layout/compose.ts` | `compose(input: ComposeInput): Placement[]`, `composeNew(seed): Placement[]`, `regionOf`, `widthFor` | composeNew returns a vertical stack (concept 0,0,1008,160 · since 0,168 · compass 0,256,320,200 · anchors at x 344 stepping 112 · references x 0 below compass); compose returns `[]` |
| `lib/studio/layout/tidy.ts` | `tidy(state, opts): TidyResult` | no moves, no stack |
| `lib/studio/layout/arrivals.ts` | `arrivalRect`, `nextArrival` | places at (1056, 0) stepping 120 |
| `lib/studio/layout/estimate.ts` | `estimateH` | returns registry defaultH |
| `lib/studio/since.ts` | `sinceSentence(p, now, firstOpen)` | returns `{ lines: ['first time here'], dots: [false] }` |
| `lib/studio/talk/apply.ts` | `sweepUnsorted(auth, projectId): Promise<number>` | returns 0 |
| `components/canvas/stage.tsx` | `Stage(props: { interactive: boolean })` | renders the stage div with the grid background and the world at the stored viewport, blocks via BlockViewFallback (A) positioned statically |
| `components/canvas/blocks/text/register.ts` `rich/register.ts` `media/register.ts` | `registerTextBlocks()` / `registerRichBlocks()` / `registerMediaBlocks()` | no-op (fallback renderer shows) |
| `components/canvas/links/links-layer.tsx` | `LinksLayer = forwardRef<LinksApi>()`, `LinksApi { updateFor(ids: Set<string>, d: Point): void; redraw(): void }` | empty svg |
| `components/talk/talk-drawer.tsx` | `TalkDrawer({ dictate?: boolean })` | header + `talk` placeholder |
| `components/talk/talk-bar.tsx` | `TalkBar()` | placeholder bar |
| `components/compass/compass-drawer.tsx` | `CompassDrawer()` | placeholder |
| `components/draft/draft-studio.tsx` | `DraftStudio({ draftId, readOnly?: boolean })` | placeholder |
| `components/concept/concept-editor.tsx` | `ConceptEditor({ onDone(): void })` | placeholder |
| `components/concept/concept-revisions-drawer.tsx` | `ConceptRevisionsDrawer()` | placeholder |
| `components/phone/phone-stage.tsx` | `PhoneStage()` | renders Stage with interactive false |

Cross-lane imports are ONLY through these signatures, `types.ts`, `registry.ts` (both), `canvas-tokens.ts`, `store.ts`/`hooks.ts`, `api-client.ts`, and B's `commands.ts` (A's chrome dispatches `new ZCommand(...)`, `new LockCommand(...)` etc. — B must keep the constructor shapes in 5.9). If a lane needs something outside its files, it writes an adapter in its own files and notes the gap in its final report; it never edits another lane's file.

### 11.2 Lane checklists

- **A**: migration; types; registry; tokens; store/hooks; db; compass; api-client; every route in section 4 marked A; streaming.ts async buildMeta; portrait-read; shelf; project page; canvas-page + chrome + drawer primitives; block-shell + fallback + registry + index; every stub in 11.1. Exit: `npm run typecheck && npm run build` green; the shelf lists projects; a project page opens with static blocks and chrome.
- **B**: everything under `engine/`, geometry, stage/world/block-view/measure, overlays, phone-stage/block-sheet, tests. Exit: drag/resize/marquee/pan/zoom/snap/guides/undo/autosave/keyboard/phone work with the fallback renderer.
- **C**: ten text renderers + settings + sheets; in-place textareas; commitment checkbox; timeline rows; since via G; concept editing via H.
- **D**: draft card + studio + chat route + drafts lib; compass block + drawer + sheet + phone route; frame; links layer + popover.
- **E**: four media renderers + settings + sheets + lightbox; media lib; assets routes.
- **F**: layout modules + tests (replace A's stubs).
- **G**: talk lib + routes + drawer + composer + catch line + talk bar; since.ts; verbatim tests.
- **H**: new project flow + draft-concept route + concept routes + concept editor + revisions drawer + concept lib.

---

## 12. Verification plan

### 12.1 Automated (must pass at the end of lane A and again at the end of every lane, run from `studio/`)

1. `npm run typecheck` — `tsc --noEmit`, strict, zero errors.
2. `npm run build` — `next build` succeeds (no dynamic-route type errors, no `use client` violations, no import across the app boundary: `grep -r "from '../../src" src` returns nothing).
3. `npm test` — `tsx --test src/**/*.test.ts`: `engine/__tests__/{snap,viewport,commands}`, `layout/__tests__/{estimate,compose,tidy,arrivals}`, `talk/__tests__/{verbatim,since}` all green. Minimum assertions per file are listed in 7.6, plus: `snapMove` prefers a guide at 5 world px over a grid target at 3 px (D-006); `zoomAt` keeps the world point under the cursor fixed to < 0.01 px; `CommandStack` coalesces two nudges 200 ms apart and not 600 ms apart; `isVerbatim` accepts a span across punctuation/case differences and rejects a paraphrase; `sinceSentence` yields `first time here` only when nothing has ever been said and nothing waits.
4. `npx eslint src` — no errors (warnings allowed).
5. Grep gates (CI-less, run by the integrating agent): `grep -rn "word count\|wordCount\|streak" src` → nothing; `grep -rn "storage_path\|thumb_path" src/lib/studio/talk src/components` → nothing (paths never reach prompts or the client); `grep -rn "portrait_entries" src/app/api` → only selects in `portrait-read.ts`.
6. Migration dry run: apply `001_studio_foundation.sql` to a scratch schema (or the shared project once) with no errors; `select studio_since('<uuid>')` returns a jsonb with the nine keys.

### 12.2 Manual browser checklist (desktop Chrome + Safari; one pass on an iPhone-sized viewport)

Notes: the person tests via the deployed Vercel project; without credentials an agent can pass the middleware with a fake `sb-*-auth-token` cookie to check rendering, but API calls need a real session — use the Browser pane with the logged-in account when available.

Shelf and creation
1. `/` redirects to `/shelf`; empty shelf shows `no projects yet` + `new project`.
2. `new project` → paste a brief with one URL and a sentence "I won't use stock photos" → review shows title, body, constraints, one anchor candidate ticked, one reference with an empty title field, and one compass proposal listed → `make the project` lands on the canvas composed: concept full width at top, since directly under it, compass at the left, the anchor large to the right, the reference in the grid; the compass block shows `1 waiting`.
3. Four-questions path produces the same review with two compass proposals (refusal, non-negotiable).

Canvas engine
4. Wheel pans; ctrl/cmd+wheel and trackpad pinch zoom about the cursor; `1` fits; `0` returns to 100 %; `+`/`−` step.
5. Drag a note: 4 px threshold, ember guides appear against neighbours' edges/centres with mono distance labels, equal-gap labels show when spacing matches; grid snaps when no guide is near; shift disables snapping; dropping sets it person-placed (the tidy afterwards leaves it alone).
6. Resize a note with the E handle: width changes in 8 px steps, height re-measures; corner handles on auto-height blocks change width only; a frame resizes on all eight.
7. Marquee selects by intersection; a frame fully inside is selected without its children; multi-selection shows the dashed union outline and no handles; arrows nudge the group; Cmd+D duplicates at +16,+16.
8. Undo/redo: move → undo restores exactly; two quick nudges undo as one; a text edit session undoes as one; delete → undo restores the block with its links.
9. Autosave: the save word cycles `saving` → `saved`; reload shows the same positions; close the tab mid-drag → nothing half-saved; block the network → `unsaved` appears and clears after reconnecting.
10. Two tabs: move a block in tab A; tab B (visible) refreshes within 60 s without touching a block being dragged in B.
11. Frames: `F` wraps a selection; dragging a block into a frame reparents it (frame turns solid tide while hovering); the frame grows when a child is dropped past its edge; collapse hides children and shows `NAME · n BLOCKS`; deleting the frame leaves the children in place.
12. Links: `L`, click two blocks, type a word → a hairline with the word chip; hover → tide + ×; links move with blocks during drag; a link cannot be made to a block in another project (no UI path; DB trigger).
13. Z-order: Cmd+] / [ change stacking; the layers list reorders by drag; clicking does NOT bring to front.
14. Zoom to 0.2 → chips render; zoom in → full blocks return; 300 blocks (seed via the library) drag at 60 fps (Performance panel: no long tasks > 16 ms during pointermove).
15. Screen-space chrome: at k 3 and k 0.3 the selection outline, handles, guides and grid dots are all exactly 1 px / 8 px / 1 px.

Blocks
16. Every library tile creates its block at the stage centre while `auto_layout` is on it flows into its region; after any hand move new blocks land at the centre / drop point.
17. Concept: double-click edits in place; save → eyebrow date updates; the revisions drawer lists two entries; restore makes a third.
18. Since block follows the concept when it is dragged; it is not selectable.
19. Update posted from the library shows `POSTED`; `make an anchor line` in the dock creates an anchor with the same text.
20. Reference shows host chip + your note, never the page.
21. Commitment checkbox marks done (line-through) and `let go` in the dock; both persist.
22. Compass block is read-only; `open →` opens the drawer.
23. Strike a block with a sentence: ember midline draws, block dims, sentence appears under it; it still drags and links; unstrike restores.
24. Image upload: file picker → resized (check bytes < original), thumb shows at low zoom, caption editable in the dock; gallery masonry 2/3 columns, full screen lightbox; recording: record with own voice → transcript appears; `this is a reference` → transcript removed and the eyebrow reads `NOT LISTENED TO`; palette swatches copy hex on click.
25. Heading lg/md, divider width-only.

Talk, compass, arrivals
26. Talk (typed): reply streams; within ~2 s the meta lands: an update block appears at the right edge with a pulsing tide dot, the arrivals pill shows if off-screen, the since line reads `1 arrived from talk`. `place` → it flows into the column (auto_layout on) or stays (off); `dismiss` removes it and undo restores it.
27. Say "I'll send the draft to Ana on Friday" → a commitment block arrives and the compass shows `1 waiting`; placing the block activates it; the next talk asks about it once, in passing.
28. Say "I won't use stock photos" then later "I decided to use a stock photo for the hero" → the catch line appears once with `that's right · that's wrong`; marking wrong lists it under `where you said the companion was wrong`; the same collision is not spoken again.
29. Voice: press-and-hold the talk pill starts dictation; punctuated segments append; typing still works.
30. Direction talk: multi-turn; it may propose a drift entry (pending); it never creates blocks.
31. Close the tab mid-reply, reopen → the update still arrives (sweep on open).
32. Compass drawer: confirm / correct (proposed statement shown) / reject / forget / restore / done / let go all persist; no counts of anything except `n waiting`.

Drafts
33. Draft tile → card + drawer; sections editable with the toolbar; lock a section → the assistant refuses to edit it; posture `locked` → the chat replies with the refusal line without a model call; `ask` → questions only; `suggest` → a proposal card that applies only on `apply` and keeps the pending mark until `keep`.
34. The anchor rail lists the project's anchors; striking one removes it from the rail.

Statuses and phone
35. `rest` → strip `resting · 14 days left`, arrangement disabled, talk still lands arrivals; `wake` absent until the date; `finish` with a sentence → read-only strip with the sentence; the shelf shows it.
36. Phone viewport (< 720): no rails/docks/handles; one-finger pan, pinch zoom; tap a block → sheet; tap a draft → read-only studio; tap the compass → sheet with the four verbs; talk bar works; arrival shows `dismiss` only and the one-line `place it from a larger screen`.

Principles gate (read the UI once more)
37. Nowhere: counts of output, streaks, badges, praise of the work, anything sent anywhere, any therapeutic claim, any capitalised invented feature name.
