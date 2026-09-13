# Brief: the project canvas for "Practice and Direction" (Companheiro's new product model)

## What is being built
A SEPARATE Next.js 15 app in `studio/` inside the companheiro-v2 repo (own package.json, own Vercel project with Root Directory = studio; SAME Supabase project so the existing account logs in; all NEW tables prefixed `studio_`; nothing in the existing app is touched). All features unlocked (Direction tier): many active projects, media blocks allowed. The first deliverable is the PROJECT CANVAS and everything it entails: the shelf (list of projects), project creation with a concept, the canvas builder with the full block library, since-you-were-here, talk (typed/voice) that lands update blocks at the edge of the canvas and proposes compass/commitment entries, a minimal draft studio the Draft block expands into, and a read-only phone view.

## The product shape (settled by the founder — do not reinterpret)
One shape: a project. Eight parts: concept (editable at all times, edits dated + kept), canvas (generated AND hand-arranged), draft (writing studio, sectioned, per-section lock, assistant postures suggest/ask/locked), talk (daily, voice or typed, any length, never asked to sort), compass (derived from talk; entries PROPOSED by the system and confirmed/corrected/rejected/forgotten by the person, never silently added), direction talk (whenever wanted, no schedule), completion (finished / kept / abandoned), user portrait (across projects; shapes HOW the companion speaks, never WHETHER the work is good).

Six principles (check every feature against these FIRST): (1) serves alignment never output — no streaks/rewards/counts; (2) you make the work, it never does — nothing arrives complete; (3) never judges the work; never reads images/recordings/other people's work; reads only what the person wrote about a reference; (4) measures nothing about how the work performed; (5) speaks only to you — nothing sent on your behalf; (6) it is not care — no therapeutic claims.

Plain-language rule: NO invented capitalised feature names in the UI. Describe things by what they do, lowercase. "since you were here", "talk", "compass" (the founder's word), "direction talk", "the shelf".

## The canvas, as settled (revision 3)
A constrained BUILDER (Squarespace/Canva-like), not a whiteboard: a fixed block library on a snapping grid, auto-layout + tidy, hand arrangement on desktop/tablet only; phone is view-only (pan/zoom/expand any block/read a draft/open the compass). No rotation, no free fonts, no pixel nudging. The founder ALSO asked (today) for an INFINITE canvas workspace, so: infinite pan/zoom surface, blocks snapped to a grid in canvas space. Everything project-wise that changes lives on it. Designed to be LEFT OPEN IN A BROWSER TAB and returned to for a refresh on progress (hence the since-you-were-here line under the concept: last thing said, blocks arrived from talk, whether the compass has something). Blocks that arrive from talk land at the EDGE with a marker until placed or dismissed. A tidy action rearranges by type and recency without losing anything the person placed deliberately. Positions persist. A new project opens already composed: concept + since-line at the top, compass and drafts in a column, anchor lines large, references and notes in a grid, media in a gallery. Any block can be struck: stays visible, dimmed and crossed, with the sentence that struck it. Blocks can be linked with a line and an optional word; links never leave a project. Frames group blocks (named region, collapsible). Struck cards stay. UI reference the founder gave earlier: railway.com (node → side drawer).

### Block library (all unlocked in this environment)
| Block | Holds | Behaviour |
|---|---|---|
| concept | the project's definition + constraints | always present, pinned at top, edited in place, edits dated |
| since you were here | last thing said, blocks arrived from talk, whether the compass has something | always present, under the concept, regenerated on open |
| update | a dated entry from talk, or posted directly | arrives at the edge with a marker; place or dismiss; stacks into a timeline block when many |
| draft | a piece of writing: essay, brief, copy, lyrics | minimised card: title, sections, lock state, assistant posture; expands into the full studio |
| anchor line | a phrase the project hangs on | warm rule, large type; mirrored into any draft |
| note | free text | plain card |
| reference | a link + the words you wrote about it | shows your note, not the page; companion reads the note only |
| commitment | something you said you would do | checkable; arrives from talk; asked about next time |
| compass | refusals, non-negotiables, open commitments, drift | compact, read-only on canvas; opens into the full compass |
| frame | a named region holding other blocks | groups; collapsible |
| heading / divider | structure | typographic only |
| image | one image, for your eyes | never opened by the companion; caption is yours and is read |
| gallery | several images as a mood board | masonry, expandable to full screen |
| recording | audio, yours or a reference | your own voice transcribed as your words (Web Speech API live during MediaRecorder capture — there is NO server-side transcription provider); a reference is never listened to |
| palette | colour swatches | for the eyes; not read |

## Aesthetic principle for the canvas: Readymag's design language, translated onto Inner Weather
The app shell stays Inner Weather (ink #0d0c0b ground with drifting atmosphere, Geist + Geist Mono only, meaning palette ember/verdant/violet/ochre/tide, generous space). The canvas's BLOCKS, WIDGETS, OBJECTS, PANELS, SELECTION, GUIDES and ALIGNMENT follow Readymag's principles:
- "As few details as possible." Panels at the surface layer, one click, nothing hidden unless necessary. Symmetrical docks: left = material (block library, layers/blocks list), right = settings for what is selected + grid/guides + project. Corner positions for the most-used actions (Fitts). Icons animated subtly on hover.
- Everything on the canvas is a rectangle ("widget"): consistent internal padding, no rotation. Selection = thin 1px outline (Readymag uses blue; here use tide #4f9ad6) with small square handles at corners/edges; multi-select marquee; group as temporary group while dragging. Smart guides appear when edges/centres align with neighbours (Readymag pink; here a single contrasting guide colour — pick ember or violet — plus small mono distance labels). Snap to grid + guides + neighbours (S toggles snap, X toggles size labels).
- Typography as the primary material: large editorial type for content (anchor lines, headings), tiny uppercase mono labels (10–11px, letter-spacing .08–.1em) for chrome/eyebrows, tight tracking on display sizes, generous line-height on body. Hierarchy per block type so an anchor line, a note and a draft are never mistaken at a glance.
- Chrome is monochrome hairlines (1px, low-alpha lines on ink), colour only where meaningful (selection, guides, the meaning palette for block type accents). Backgrounds of panels: near-ink with blur. Grid shown as faint dots or hairlines toggleable.
- Layers/blocks list (widget bar) as a pop-up panel showing blocks in stack order, draggable to reorder z, click to scroll/zoom to the block, blocks can be locked/hidden, named.
- Keyboard: arrows nudge by one grid unit (shift = 5), delete, cmd/ctrl+D duplicate, cmd/ctrl+Z / shift+Z undo/redo, cmd/ctrl+A select all, esc deselect, 1 = zoom to fit, 0 = 100%, space+drag = pan, wheel = pan, cmd+wheel / pinch = zoom, S snap, X sizes, G grid, T tidy, L link mode, F frame selection.

## Existing code to reuse (copy into studio/, do NOT import across app boundaries)
From /Users/DP/companheiro-v2/src: lib/design-tokens.ts, components/theme/theme-provider.tsx, components/shell/{atmosphere,page-shell}.tsx (Dock is NOT reused: the studio has its own navigation), components/ui/{buttons,field,icon-button,pill,mic-button,confirm-dialog,modal-dialog,theme-toggle-button}.tsx, components/conversation/thread.tsx, components/writing/section-editor.tsx (Tiptap), components/auth/auth-shell.tsx, app/{login,signup,reset}, lib/supabase/{client,server,route}.ts, lib/{models,anthropic,companion-tone,language,streaming,stream-client,prompt-cache,usage-log,use-dictation,settings,dates,utils,rich-text,crisis-resources}.ts, app/api/punctuate/route.ts, middleware.ts, app/layout.tsx + globals.css, public/{favicon.svg,apple-touch-icon.png,manifest.json}. Same package.json deps (next ^15.5, react 19.2, tailwind v4, @supabase/ssr, @anthropic-ai/sdk, @tiptap/*, motion, lucide-react).

Existing conventions: every API route calls requireUser() (middleware excludes /api); models via MODELS.fast (claude-haiku-4-5) / MODELS.deep (claude-sonnet-4-6); streaming via streamClaudeText + readTextStream with U+001E meta frame; COMPANION_TONE prepended to any user-facing generated text; withLanguage() on every system prompt; logUsage on every call; migrations are plain SQL files with RLS `auth.uid() = user_id` on every table, uuid_generate_v4 ids, timestamptz created_at; the compass must follow the portrait pattern (pending → active/rejected/dormant, reinforcement_count, forgettable).

## Hard constraints
- TypeScript strict; `npx tsc --noEmit` and `next build` must pass.
- No external canvas library (no react-flow, tldraw, konva, fabric). Pointer events + CSS transforms + SVG for links/guides. Motion (framer) is available for micro-animations.
- Phone (< 720px or coarse pointer + narrow): view-only. Pan/zoom/expand only; talk still works.
- Never send user data anywhere but the same Supabase project and the Anthropic API.
- The companion never reads image/recording/reference content — only captions/notes/own-voice transcripts.
