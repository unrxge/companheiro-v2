-- How a check-in felt, from heavy to bright. Replaces Movement on the
-- check-in side; arc_texture stays (older rows, other readers) but is no
-- longer shown. Nullable: check-ins from before have no temperament.
alter table public.check_ins
  add column if not exists temperament text
  check (temperament in ('heavy', 'muted', 'steady', 'light', 'bright'));
