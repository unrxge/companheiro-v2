### Ambiguities B–H should be warned about

- **Ownership gap around `canvas-page.tsx` and `p/[id]/page.tsx` (both lane A):** their headers instruct lane B to edit them (swap the `createDefaultActions` factory, mount the real `Stage`, install `useAutosave` + keyboard, mount `ArrivalsPill`, replace the local `isPhone()` with `engine/phone.ts`). Section 11 makes both A-owned. Grant B explicit edit rights on those two files (and only those edits), or B must report the gap instead.
- **`components/canvas/actions.ts` is not in the section 11 tree** (A added it). It is the only bridge chrome uses (`CanvasActions` interface). B's engine-backed object must implement that exact interface; the local viewport/geometry helpers there (`zoomAt`, `fitViewport`, `snap8`, `rectOf`, `unionRects`, `visibleWorldRect`) duplicate what 5.1/5.2 specify for B — B should implement the engine versions and not import from `actions.ts`. `phone-stage.tsx` (B's stub to replace) currently imports `fitViewport` from `actions.ts`.
- **`Mode` lives in `lib/studio/store.ts`** (A, frozen) because `types.ts` is frozen; 5.4 says `pointer.ts` exports it. B must import `Mode` from `store.ts`, not redeclare.
- **`Stage` props are `{ interactive: boolean; phone?: boolean }`** — wider than 11.1's `Stage({ interactive })`; keep `phone` (PhoneStage passes it). `stage.tsx` also exports a 4-arg `gridBackground(v, theme, on, t)` distinct from 5.2's 3-arg one in `engine/viewport.ts`; nothing else imports the stage one.
- **Eyebrow contract for C/D/E:** `BlockShell` renders the eyebrow from `registration.eyebrow` (`'shell'` = `TYPE · date (· FROM TALK)` drawn by the shell, `'none'` = renderer owns the first row, or a function returning the string). Paper defaults to `'shell'`, paperless/media to `'none'`. `[data-measure]` is the ResizeObserver target (D-015).
- **`updated_at` is stripped from every block row the client sends** (`BlockRow = Omit<AnyBlock,'updated_at'>`); the DB trigger stamps it. B's autosave/merge must treat server `updated_at` as the only truth (D-031).
- **`readJson` returns 400 on an empty body** — routes without bodies must not call it (open/DELETE already don't). G's talk POST and D's draft chat must always send JSON.
- **`api.assets.patch` is typed `{ asset: AssetView | Asset }`** — E must return `AssetView` (signed urls, never `storage_path`), otherwise the grep gate for paths in components will trip later.
- **`createDefaultActions.enterPlacing` always creates `placed_by: 'person'`** and ignores D-064; the drafts route honours `auto_layout` server-side. B's `composeAuto` path should reconcile this.
- ESLint convention now in force: `_`-prefixed bindings are ignored by `no-unused-vars`; do not recreate `.eslintrc.json`; `npm test` finds every `*.test.ts` under `src` via `find`.

LANE A2 EXPORTS (actual shapes):
# Lane A2 report — client half of lane A (studio canvas)

All paths under `/Users/DP/companheiro-v2/studio/`. Whole-project `npx tsc --noEmit --incremental false` → **0 errors** (F's layout files included). Verified in the Browser pane against a mocked `/api/studio/*` (shelf cards, canvas chrome, layers list, selection + context bar, strike dialog, library create, project rest → read-only strip, phone stage).

## Files written (line counts)

| File | Lines | Exports other lanes depend on |
|---|---|---|
| `src/app/shelf/page.tsx` | 78 | default `ShelfPage` |
| `src/components/shelf/shelf-grid.tsx` | 54 | `ShelfGrid`, `sortShelf` |
| `src/components/shelf/project-card.tsx` | 77 | `ProjectCard` |
| `src/app/p/[id]/page.tsx` | 150 | default `ProjectPage` (local `isPhone`/`usePhoneMode` per D-039 — B replaces with `engine/phone.ts`) |
| `src/components/canvas/canvas-page.tsx` | 120 | `CanvasPage({ bundle, interactive })`, `CanvasProvider({ bundle, interactive, children })` (store + actions + `registerAll()`; the page wraps `<PhoneStage/>` in it) |
| `src/components/canvas/actions.ts` | 832 | `CanvasActions` interface, `ActionsContext`, `useActions()`, `useActionsStrict()`, `createDefaultActions(opts)`, `createInterimFlush(store, projectId)` (`InterimFlush { schedule, flush, attach, detach, dispose }`), viewport maths `zoomAt`, `fitViewport`, `screenToWorld`, `worldToScreen`, `visibleWorldRect`, `unionRects`, `rectOf`, `snap8`, `ceil8`, `K_MIN/K_MAX/FIT_PAD/FIT_K_MAX/ZOOM_STEP`, `defaultContent(type)`, `makeBlock(input)`, `BlockOf<T>`, `ZDirection` |
| `src/components/canvas/stage.tsx` (11.1 stub) | 122 | `Stage({ interactive, phone? })`, `gridBackground(v, theme, on, t)` |
| `src/components/canvas/blocks/registry.ts` | 68 | `registerBlock<T>(type, { Renderer, Settings?, Sheet?, eyebrow? })`, `getRegistration`, `getRenderer`, `isRegistered`, `clearRegistrations`, `BlockRendererProps<T> { block: BlockOf<T>; editing; selected; phone }`, `BlockSettingsProps<T> { block }`, `BlockSheetProps<T> { block }`, `BlockRegistration<T>`, `EyebrowMode`, `BlockOf<T>` |
| `src/components/canvas/blocks/block-shell.tsx` | 303 | `BlockShell({ block, selected?, editing?, phone?, children })`, `BlockShellProps` |
| `src/components/canvas/blocks/fallback-block.tsx` | 144 | `FallbackBlock`, `firstLineOf(block, state?)`, `displayName`, `typeWord`, `eyebrowWord`, `shortDate`, `shortTime`, `relativeWords` |
| `src/components/canvas/blocks/index.ts` | 20 | `registerAll()` (idempotent) + re-exports of registry |
| `blocks/text/register.ts` · `rich/register.ts` · `media/register.ts` (stubs) | 8 · 7 · 8 | `registerTextBlocks()` / `registerRichBlocks()` / `registerMediaBlocks()` no-ops |
| `src/components/canvas/links/links-layer.tsx` (stub) | 29 | `LinksLayer = forwardRef<LinksApi>`, `LinksApi { updateFor(ids, d); redraw() }` |
| `src/components/canvas/chrome/panel.tsx` | 561 | `Panel`, `PanelHeader`, `PanelSection`, `PanelHint`, `GlassRow`, `GlassButton`, `IconHit`, `GlassToggle`, `KeyCap`, `GlassInput`, `GlassTextArea`, `SegmentControl`, `Rail`, `ChromeStyles`, `CHROME_CSS` |
| `chrome/top-bar.tsx` · `left-rail.tsx` · `library-panel.tsx` · `blocks-list-panel.tsx` · `right-dock.tsx` · `selection-settings.tsx` · `grid-panel.tsx` · `project-panel.tsx` · `context-bar.tsx` · `zoom-pill.tsx` · `talk-pill.tsx` · `status-strip.tsx` | 183 · 76 · 140 · 201 · 105 · 271 · 128 · 211 · 203 · 75 · 85 · 86 | `TopBar`, `LeftRail({ actions, onPlace? })`, `LibraryPanel({ onPlace, disabled? })` + `typeIcon(type, size)` + `BLOCK_DRAG_MIME`, `BlocksListPanel`, `RightDock`, `SelectionSettings`, `GridPanel` + `KEY_MAP`, `ProjectPanel`, `ContextBar({ actions, stageSize })`, `ZoomPill`, `TalkPill({ onOpen(dictate) })`, `StatusStrip` + `statusLabel`, `restingDaysLeft`, `canWake`, `readOnlyLine`, `COMPLETED` |
| `src/components/canvas/drawers/drawer.tsx` | 161 | `Drawer`, `DrawerHeader({ eyebrow, title, right?, showWider? })`, `DrawerIcon`, `DrawerChromeContext`, `useDrawerChrome() → { close, wider, setWider }` (for chromeless drawers: talk, draft) |
| `src/components/canvas/drawers/drawer-host.tsx` | 57 | `DrawerHost({ talkDictate? })` |
| Stubs: `talk/talk-drawer.tsx` (29) · `talk/talk-bar.tsx` (38) · `compass/compass-drawer.tsx` (27) · `draft/draft-studio.tsx` (27) · `concept/concept-editor.tsx` (28) · `concept/concept-revisions-drawer.tsx` (24) · `phone/phone-stage.tsx` (85) | — | exact 11.1 signatures: `TalkDrawer({ dictate? })`, `TalkBar()`, `CompassDrawer()`, `DraftStudio({ draftId, readOnly? })`, `ConceptEditor({ onDone })`, `ConceptRevisionsDrawer()`, `PhoneStage()` |
| `README.md` | +37 | migration order, the lanes, how to run tests |

## Deviations from the spec (with reasons)

1. **`CanvasActions` has three extra methods** beyond the list given: `resize(id, { w?, h? })` (the selection panel's editable size line needs it), `frameSelection(ids)` (multi-selection `frame selection` in 6.4), `undoLabel()` (grid panel's "last undo label"). All implemented in the default; B keeps the same shape.
2. **`Stage` takes an optional `phone?: boolean`** in addition to `interactive` — `interactive=false` alone cannot distinguish a phone from a read-only desktop, and renderers get `phone` in their props.
3. **`BlockRegistration.eyebrow?`** (`'shell' | 'none' | (block) => string`) — optional, backwards-compatible; the shell renders a default `TYPE · DATE (· FROM TALK)` eyebrow for paper blocks, a renderer can take it over.
4. **Stage stub sets `contain: layout style`, not `layout paint style`** — the shell's arrival marker sits at (−4,−4) and `contain: paint` clips it. Noted for B in block-shell's header comment; `[data-measure]` marks the node to observe, the struck sentence sits below it in flow (not measured).
5. **Talk pill "dictate" flag** is local state in canvas-page (store's `drawer` has no field for it); `DrawerHost` passes it to `TalkDrawer`.
6. **Chromeless drawers**: talk and draft own their header (`DrawerHeader` + `useDrawerChrome()`); compass and revisions get the header from `Drawer`.
7. `isPhone` is not exported from the page module (Next forbids extra page exports).

## Gaps / adapters (for other lanes)

- **Lane B**: swap `createDefaultActions(...)` in `canvas-page.tsx` for the engine-backed factory; replace `stage.tsx`; wire `useAutosave` + keyboard there. Default `undo/redo` are no-ops; `enterLink` only sets `mode = 'linking'`; `enterPlacing` creates at the stage centre (drag-to-place and D-064 `composeAuto` after place/create are B's). Library tiles set `dataTransfer` `application/x-studio-block` for drops. The interim flusher (`createInterimFlush`) does full-row batches with keepalive/retry/401 but no polling or two-tab merge — remove when `useAutosave` lands. `[data-world].tidying` transition CSS lives in `ChromeStyles` (panel.tsx).
- **Lane C/D/E**: `registerBlock` with typed `BlockOf<'update'>` etc.; Settings render inside the ink-glass panel (use the `Glass*` primitives from `chrome/panel.tsx`).
- **Lane G**

LANE A2 DEVIATIONS:
## Deviations from the spec (with reasons)

1. **`CanvasActions` has three extra methods** beyond the list given: `resize(id, { w?, h? })` (the selection panel's editable size line needs it), `frameSelection(ids)` (multi-selection `frame selection` in 6.4), `undoLabel()` (grid panel's "last undo label"). All implemented in the default; B keeps the same shape.
2. **`Stage` takes an optional `phone?: boolean`** in addition to `interactive` — `interactive=false` alone cannot distinguish a phone from a read-only desktop, and renderers get `phone` in their props.
3. **`BlockRegistration.eyebrow?`** (`'shell' | 'none' | (block) => string`) — optional, backwards-compatible; the shell renders a default `TYPE · DATE (· FROM TALK)` eyebrow for paper blocks, a renderer can take it over.
4. **Stage stub sets `contain: layout style`, not `layout paint style`** — the shell's arrival marker sits at (−4,−4) and `contain: paint` clips it. Noted for B in block-shell's header comment; `[data-measure]` marks the node to observe, the struck sentence sits below it in flow (not measured).
5. **Talk pill "dictate" flag** is local state in canvas-page (store's `drawer` has no field for it); `DrawerHost` passes it to `TalkDrawer`.
6. **Chromeless drawers**: talk and draft own their header (`DrawerHeader` + `useDrawerChrome()`); compass and revisions get the header from `Drawer`.
7. `isPhone` is not exported from the page module (Next forbids extra page exports).

## Gaps / adapters (for other lanes)

- **Lane B**: swap `createDefaultActions(...)` in `canvas-page.tsx` for the engine-backed factory; replace `stage.tsx`; wire `useAutosave` + keyboard there. Default `undo/redo` are no-ops; `enterLink` only sets `mode = 'linking'`; `enterPlacing` creates at the stage centre (drag-to-place and D-064 `composeAuto` after place/create are B's). Library tiles set `dataTransfer` `application/x-studio-block` for drops. The interim flusher (`createInterimFlush`) does full-row batches with keepalive/retry/401 but no polling or two-tab merge — remove when `useAutosave` lands. `[data-world].tidying` transition CSS lives in `ChromeStyles` (panel.tsx).
- **Lane C/D/E**: `registerBlock` with typed `BlockOf<'update'>` etc.; Settings render inside the ink-glass panel (use the `Glass*` primitives from `chrome/panel.tsx`).
- **Lane G**: `TalkDrawer` is mounted chromeless; use `DrawerHeader` and `useDrawerChrome().close`.
- **Lane H**: project panel calls `api.concept.revisions` for the `n concept edits →` count and silently drops the number if the route is absent.
- A library-made `commitment` block starts with `content.entry_id = ''` (no route creates a compass entry directly) — C/G decide how a hand-made commitment gets its entry.
- Two-tab hazard remains B's (dirty rows never merge with a refetch here).

## tsc output for lane A2 files

```
(empty)
```
Whole project: `0` errors.

LANE F EXPORTS:
**Exported symbols other lanes depend on** (all signatures from 7.x / 11.1 unchanged)
- `constants.ts`: `U, W, G, FULL, WIDE, ROW_GAP, BAND_GAP, SINCE_GAP, ARRIVAL_GAP, ARRIVAL_COL_STEP, ARRIVAL_MAX_BELOW, AVOID_INSET, AVOID_MAX_ITERATIONS, snap8(v), ceil8(v)`
- `estimate.ts`: `estimateH(type, content, w, extra?)`; also `innerWidth(type, w)`, `lines(text, fontPx, lh, inner)`
- `compose.ts`: `ComposeInput { blocks, obstacles, heights?, done? }`, `compose(input): Placement[]`, `composeNew(seed): Placement[]`, `regionOf(type)`, `widthFor(region, type)`; also `intersects(a, b)`, `avoid(rect, obstacles)`
- `tidy.ts`: `TidyResult`, `tidy(state, opts): TidyResult`, `STACK_THRESHOLD = 8`, `STACK_KEEP = 3`
- `arrivals.ts`: `arrivalRect(live, type, content): Rect`, `nextArrival(live, block, maxZ): AnyBlock`

All five modules are pure and isomorphic: no React, no DOM, no `Date.now` inside pure paths. Callers: `POST /projects` (A) already imports `composeNew` and its output matches the route's use (placements keyed by id; returned in seed order concept → since → compass → anchors → references).


---

## LANE B REPORT — the canvas engine (sections 5.0–5.14)

All paths under `studio/`. `npx tsc --noEmit` → 0 errors; `next build` compiles;
`npm test` → 123 pass / 0 fail; `eslint src` → 0 errors.

### Files written

| File | What it owns |
|---|---|
| `src/lib/studio/geometry.ts` | 5.1 rect/point maths, `snap8`/`ceil8`, `nearestEdgePair`, `pullBack` |
| `src/lib/studio/engine/viewport.ts` | 5.2 the affine viewport: `zoomAt`, `fit`, `applyWheel`, `pinch`, `gridBackground`, `visibleWorldRect` |
| `src/lib/studio/engine/snap.ts` | 5.5 grid + guides + equal gaps, `collectNeighbours`, `resizeRect` |
| `src/lib/studio/engine/selection.ts` | 5.6 `closure` (since rides with the concept), marquee, `sanitiseSelection` |
| `src/lib/studio/engine/frames.ts` | 5.7 `frameUnderCentre`, `reparentFor`, growth, collapse/expand, `frameRectFor` |
| `src/lib/studio/engine/zorder.ts` | 5.8 `renderOrder`, `stepZ`, `reorderZ`, `maxZ` |
| `src/lib/studio/engine/commands.ts` | 5.9 `Command`, `CommandStack` (cap 200, 500 ms coalescing) + every concrete command |
| `src/lib/studio/engine/autosave.ts` | 5.10 debounce/maxWait, 40-row chunks, keepalive on hide, retry ladder, two-tab merge |
| `src/lib/studio/engine/pointer.ts` | 5.4 the state machine; imperative writes, nothing through React during a drag |
| `src/lib/studio/engine/keyboard.ts` | 5.11 the D-041 map |
| `src/lib/studio/engine/culling.ts` | 5.12 `visibleIds`, chip threshold |
| `src/lib/studio/engine/measure.ts` | D-015 ResizeObserver heights, rAF-throttled, pausable |
| `src/lib/studio/engine/phone.ts` | 5.13 `isPhone` |
| `src/lib/studio/engine/pin.ts` | D-026 the since row pinned under the concept (was specified, previously unimplemented) |
| `src/components/canvas/stage.tsx` | 5.0 the three layers, replaces the stub |
| `src/components/canvas/block-view.tsx` | 5.14 memoised, ref-registered, measured |
| `src/components/canvas/overlay.tsx` | screen-space selection, handles, guides, gap labels, marquee, rubber, ghost |
| `src/components/canvas/engine-context.tsx` | the engine's lifetime + `EngineContext` |
| `src/components/canvas/engine-actions.ts` | `CanvasActions`, engine-backed (replaces `createDefaultActions`) |
| `src/components/canvas/chrome/arrivals-pill.tsx` | D-038 |
| `src/components/phone/block-sheet.tsx` | D-040 tap → sheet |
| `src/app/dev/canvas/page.tsx` + `src/lib/studio/dev-bundle.ts` | a dev-only harness (see below) |
| `engine/__tests__/{viewport,snap,commands,pin}.test.ts` | 55 unit tests |

### Bugs found and fixed outside lane B

1. **`compass.ts` pulled server-only code into the client bundle.** `compass-drawer`
   and the compass block imported `splitCompass` from it, which imports `db.ts`
   (`next/headers`) — `next build` failed. The pure half now lives in
   `lib/studio/compass-split.ts`; `compass.ts` re-exports it for server callers.
2. **Measured heights were taken from the wrong node.** Observing `[data-measure]`
   (the inner content) under-reports by exactly the shell's eyebrow + padding, so
   every stored `h` was ~80 px short of the rendered block. Tidy then avoided
   rects smaller than the blocks really are and laid them out overlapping.
   `BlockView` now observes its own positioned div for auto-height types, whose
   box IS the true height (we never write `height` on those, so there is no loop).
3. **Tidy ignored blocks it cannot move.** A `heading`/`divider` has region
   `'none'`: it is not in `movable` and not in `isFixed`, so it was in neither
   the movable set nor the obstacles, and tidy laid notes straight on top of it.
   `tidy.ts` now builds obstacles from every live block it will not move, minus
   the updates it is stacking away (those are leaving, and counting them would
   break idempotency). Regression test added in `layout/__tests__/tidy.test.ts`.
4. **A disposed engine stayed dead.** The engine was created in `useState` with a
   `useEffect` cleanup that disposed it, so React's strict double-mount (and any
   Fast Refresh) disposed it and nothing rebuilt it: `autosave.schedule()` then
   no-opped forever while the status strip still read `saved` — silent data loss.
   `CanvasProvider` now creates and destroys the engine inside the effect that
   owns it, and children wait the one tick for it.
5. **`resizeRect` re-snapped `x`/`y`**, which moved the edge that was supposed to
   stay anchored (dragging a west handle shifted the east edge by up to 7 px).
   Position is no longer re-snapped there: `w`/`h` are already on the grid.
6. **Two `catch-row.tsx` apostrophes** failed `react/no-unescaped-entities` and
   blocked `next build`; `withAuth` was typed `Promise<NextResponse>` but the
   draft chat route streams a raw `Response`; `talk/apply.ts` handed a 16-variant
   union to an untyped supabase insert; `POSTURE_OPTIONS` was imported from a
   `components/draft/posture-control` that did not exist (now written, and the
   draft studio's posture control with it).

### Dead code removed

`actions.ts` went from 863 to 174 lines: `createDefaultActions` and
`createInterimFlush` are unused now that the engine implements the interface, and
its private copy of the viewport maths is re-exported from the engine instead —
two `zoomAt`s in a canvas is a bug waiting to happen. Every name the chrome
imported still resolves, so no chrome file changed.

### Additions to lane A's interface (additive; no chrome change)

`CanvasActions.nudge(ids, dx, dy)` and `CanvasActions.enterOrOpen(id)` — the
arrow keys and Enter needed them. Both are implemented in the engine.

### The dev harness

`/dev/canvas` mounts the real `CanvasPage` over a synthetic bundle and answers
`/api/studio/*` locally, so the engine can be driven in a browser without a
session or a database; `?phone=1` and `?readonly=1` mount the other two surfaces.
It records every intercepted request on `window.__devRequests`, and the engine
exposes `window.__studioEngine` / `__studioStore` when `NODE_ENV !== 'production'`.
The page renders `null` in a production build.

Verified in the browser this way: nine blocks mounted at their world rects;
drag → snap to the 8 px grid; a guide drawn at a shared edge with the block
snapping 443 → 440; autosave sending the full row with `placed_by: 'person'` and
no `updated_at`; undo/redo; arrow and shift-arrow nudge; ctrl-wheel zoom about
the cursor; wheel pan; `0`/`1` for 100 % and fit (grid step 32 → 19.2 px at
k 0.6); marquee selecting six blocks with one dashed union outline and no
handles; `F` framing at bbox + 24 and undoing; tidy leaving no overlapping pair;
the since row re-pinning to `concept.y + concept.h + 8`; place and strike taking
the server's row; and on a 375-wide viewport, a drag panning instead of moving,
no handles, and tap opening the block sheet.

### Still open for other lanes

- `LinksLayer` is still lane D's stub, so `links.updateFor/redraw` are no-ops:
  links do not yet follow a dragged block. The engine's calls are in place.
- The library's drag-to-place path sets `application/x-studio-block`; the drop
  handler belongs with the Stage's DnD wiring and is not built (the click path
  works and composes through `auto_layout`).
- `enterPlacing` creates at the stage centre; the machine's `placing` mode with
  its ghost is implemented but nothing enters it yet.
- Stacked-update drag-out (`UnstackCommand`) exists but has no UI.
