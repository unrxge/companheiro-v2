-- Assistant write-lock (2026-09-07): lets a writer temporarily disable
-- "write for me" and force suggestion-only mode for a self-chosen duration.
-- Enforced at the API layer — the lock endpoint only ever extends forward,
-- never shortens or clears an active lock — and re-checked server-side on
-- every writing-chat request, so switching back to write mode early isn't
-- possible from the client alone.
alter table user_settings add column if not exists assistant_write_locked_until timestamptz;
