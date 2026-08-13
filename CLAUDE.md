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

### Current Database Tables and Access Patterns

| Table | Read By | Write By | Selection | Notes |
|-------|---------|----------|-----------|-------|
| `check_ins` | `/api/trajectory/converse`, `lib/companion-context.ts` (specific cols) | `/api/check-in/log` | Explicit columns | Drought protocol removed 2026-08; additions safe if nullable |
| `pieces` | `/api/project-board/*` (specific cols) | `/api/project-board/*` | Mixed | Project board reads exact columns; safe to add optional fields |
| `ideas` | `/api/idea-lab/*` (specific cols) | `/api/idea-lab/*` | Explicit columns | Idea development flow; verify arc/territory assumptions |
| `captures` | `/api/idea-lab/captures` | `/api/collector/capture` | Explicit columns | Collector flow; safe to extend |
| `session_logs` | `/api/project-board/session-log` | Session logging | Explicit columns | Track piece work sessions |
| `post_publication_logs` | `/api/idea-lab/continuations` | `/api/post-publication/log` | Explicit columns | Close the loop; safe to extend |

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
3. **Project Board** (`/project-board`): Kanban view (Queue/Active/Completed), task tracking per piece
4. **Writing** (`/write`): Draft and refine pieces, auto-save to Supabase
5. **Translation** (`/write/translate`): Convert long-form to short-form scripts
6. **Post-Publication** (`/post-publication`): Log reflections, feed insights back to Idea Lab

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
- Default model: `claude-haiku-4-5-20251001` (fast, cheap, good enough for signals)
- System prompts should be clear and concise
- Keep `max_tokens` reasonable (512 for summaries, 1024 for responses)

---

## Known Constraints & Trade-offs

- **No real-time sync:** Supabase subscriptions not used; rely on refetch after mutations
- **No caching:** Every fetch is fresh; consider adding if scaling becomes an issue
- **Single user focus:** No collaboration features; RLS assumes single-user isolation
- **Voice first, text second:** Speech Recognition API is primary input; typed input is fallback
- **Claude for intelligence:** Heavy reliance on Claude API for signals, ideas, continuations; keep prompts tight to control costs

---

## Next Steps / Known TODOs

- Database schema is stable; only add columns with defaults or nullable
- Improve error handling in API routes (currently logs but returns generic error)
- Consider adding request logging for debugging production issues
