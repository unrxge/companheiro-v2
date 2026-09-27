-- Operations monitoring: what the app costs, who arrives from where, what
-- they do with their first weeks, and what breaks. Read only by the owner's
-- /admin page and the daily digest, both through the service role; no
-- policies anywhere here, so nobody's own session can read these tables.
--
-- Nothing in this migration stores anything anyone wrote or said. ai_calls
-- keeps the SHAPE of each Claude request (sizes, counts, token totals), never
-- its text.
--
-- Impact on existing modules (Database Changes Protocol):
--  - subscriptions gains one nullable column (billing_interval). Every
--    reader selects explicit columns (lib/billing/access.ts, fair-use.ts,
--    /api/billing/status) and the only writers are the webhook/checkout
--    routes — nothing breaks, existing rows get NULL until their next sync.
--  - a second AFTER INSERT trigger on auth.users, independent of
--    handle_new_user_subscription; it never raises, so it can't block signup.
--  - every other object here is new.

-- ── 1. Every Claude call ───────────────────────────────────────────────────
create table if not exists ai_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- set null, not cascade: what a call cost us stays true after the account
  -- that made it is deleted; only the link to the person goes.
  user_id uuid references auth.users (id) on delete set null,
  env text not null default 'production',
  route text not null,
  model text not null,
  requested_model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_micros bigint not null default 0,
  duration_ms integer,
  stop_reason text,
  context jsonb not null default '{}'::jsonb
);

create index if not exists ai_calls_created_idx on ai_calls (created_at desc);
create index if not exists ai_calls_route_created_idx on ai_calls (route, created_at desc);
create index if not exists ai_calls_user_created_idx on ai_calls (user_id, created_at desc);
alter table ai_calls enable row level security;

-- ── 2. Where each account came from ────────────────────────────────────────
create table if not exists signup_attribution (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  source text,     -- utm_source
  medium text,     -- utm_medium
  campaign text,   -- utm_campaign
  ref text,        -- ?ref= on a shared link
  via text,        -- referring site's host, when the browser tells us
  landing text,    -- first path they landed on
  heard_from text  -- their own answer to "how did you hear about us?"
);
alter table signup_attribution enable row level security;

-- The signup form passes these as user metadata (options.data.attribution),
-- which is the only thing available before the email is confirmed. Every
-- account gets a row, so "no attribution" is countable as direct.
create or replace function handle_new_user_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb := coalesce(new.raw_user_meta_data -> 'attribution', '{}'::jsonb);
begin
  begin
    insert into signup_attribution (user_id, source, medium, campaign, ref, via, landing, heard_from)
    values (
      new.id,
      left(nullif(lower(trim(a ->> 'source')), ''), 80),
      left(nullif(lower(trim(a ->> 'medium')), ''), 80),
      left(nullif(trim(a ->> 'campaign'), ''), 120),
      left(nullif(trim(a ->> 'ref'), ''), 80),
      left(nullif(lower(trim(a ->> 'via')), ''), 120),
      left(nullif(trim(a ->> 'landing'), ''), 200),
      left(nullif(trim(a ->> 'heard_from'), ''), 300)
    )
    on conflict (user_id) do nothing;
  exception when others then
    -- Attribution is nice to have; an account is not.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_attribution on auth.users;
create trigger on_auth_user_created_attribution
  after insert on auth.users
  for each row execute function handle_new_user_attribution();

-- Accounts that already exist count as direct.
insert into signup_attribution (user_id, created_at)
select id, created_at from auth.users
on conflict (user_id) do nothing;

-- ── 3. Billing lifecycle ───────────────────────────────────────────────────
alter table subscriptions add column if not exists billing_interval text
  check (billing_interval in ('monthly', 'yearly'));

create table if not exists billing_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  stripe_event_id text,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in (
    'subscribed', 'resubscribed', 'tier_changed', 'cancel_scheduled',
    'cancel_reverted', 'canceled', 'payment_failed'
  )),
  tier text,
  billing_interval text,
  -- Stripe's cancellation_details: {reason, feedback, comment}
  detail jsonb not null default '{}'::jsonb,
  unique (stripe_event_id, kind)
);
create index if not exists billing_events_created_idx on billing_events (created_at desc);
alter table billing_events enable row level security;

-- ── 4. Things that went wrong, or were refused ─────────────────────────────
create table if not exists ops_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,  -- webhook_error | ai_error | signup_blocked | alert_sent
  route text,
  message text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists ops_events_kind_created_idx on ops_events (kind, created_at desc);
alter table ops_events enable row level security;

-- ── 5. The dashboard, in one round trip ────────────────────────────────────
-- A person counts as active on a day when they did anything that leaves a
-- trace: any companion call (production), writing time, or a check-in.
create or replace function ops_active_days(p_since timestamptz)
returns table (user_id uuid, day date)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id, (c.created_at at time zone 'utc')::date
    from ai_calls c
   where c.env = 'production' and c.user_id is not null and c.created_at >= p_since
  union
  select w.user_id, w.date from writing_activity w where w.date >= (p_since at time zone 'utc')::date
  union
  select k.user_id, (k.created_at at time zone 'utc')::date
    from check_ins k where k.created_at >= p_since
$$;

-- p_caps: {"trial":{"soft":µ$,"hard":µ$},"practice":{...},"direction":{...}}
-- (the caps live in env on the app side, so the app hands them over).
create or replace function admin_dashboard(p_days integer, p_env text, p_caps jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc' - make_interval(days => greatest(p_days, 1) - 1);
  month_key text := to_char(now() at time zone 'utc', 'YYYY-MM');
  result jsonb;
begin
  with
  active as (select * from ops_active_days(least(since, now() - interval '63 days'))),
  calls as (select * from ai_calls where created_at >= since and env = p_env),
  route_median as (
    select route, percentile_cont(0.5) within group (order by cost_micros) as med
      from calls group by route
  ),
  days as (
    select d::date as day
      from generate_series((since at time zone 'utc')::date, (now() at time zone 'utc')::date, interval '1 day') d
  ),
  cohort_members as (
    select u.id, date_trunc('week', u.created_at at time zone 'utc')::date as wk
      from auth.users u
     where u.created_at >= date_trunc('week', now() at time zone 'utc') - interval '7 weeks'
  ),
  window_users as (
    select u.id, u.created_at from auth.users u where u.created_at >= since
  ),
  sub_now as (
    select s.*, case
      when s.status = 'trialing' then 'trial'
      when s.status in ('active', 'past_due') then coalesce(s.tier, 'practice')
      else s.status end as plan
    from subscriptions s
  ),
  usage_now as (
    select sn.user_id, sn.plan, coalesce(au.cost_micros, 0) as used
      from sub_now sn
      left join ai_usage au on au.user_id = sn.user_id
        and au.period = case when sn.plan = 'trial' then 'trial' else month_key end
     where sn.plan in ('trial', 'practice', 'direction')
       and (sn.plan <> 'trial' or sn.trial_ends_at > now())
  )
  select jsonb_build_object(
    'generated_at', now(),
    'since', since,

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'signups', (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date = d.day),
        'ai_cost', (select coalesce(sum(cost_micros), 0) from calls c where (c.created_at at time zone 'utc')::date = d.day),
        'other_env_cost', (select coalesce(sum(cost_micros), 0) from ai_calls c
                            where c.env <> p_env and c.created_at >= since and (c.created_at at time zone 'utc')::date = d.day),
        'active', (select count(distinct a.user_id) from active a where a.day = d.day),
        'subscribed', (select count(*) from billing_events b where b.kind in ('subscribed', 'resubscribed') and (b.created_at at time zone 'utc')::date = d.day),
        'canceled', (select count(*) from billing_events b where b.kind = 'canceled' and (b.created_at at time zone 'utc')::date = d.day)
      ) order by d.day), '[]'::jsonb)
      from days d
    ),

    'subs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'status', status, 'tier', tier, 'interval', billing_interval,
        'cancel_at_period_end', cancel_at_period_end, 'n', n)), '[]'::jsonb)
      from (
        select status, tier, billing_interval, cancel_at_period_end, count(*) as n
          from subscriptions
         where not (status = 'trialing' and coalesce(trial_ends_at, now()) <= now())
         group by 1, 2, 3, 4
      ) x
    ),
    'trials_ending_7d', (select count(*) from subscriptions where status = 'trialing'
                          and trial_ends_at > now() and trial_ends_at <= now() + interval '7 days'),
    'trials_expired_in_window', (select count(*) from subscriptions where status = 'trialing'
                          and not repeat_trial and trial_ends_at >= since and trial_ends_at <= now()),

    'cost_by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'users', users, 'cost', cost)), '[]'::jsonb)
      from (
        select coalesce(sn.plan, 'deleted') as plan, count(distinct c.user_id) as users, sum(c.cost_micros) as cost
          from calls c left join sub_now sn on sn.user_id = c.user_id
         group by 1
      ) x
    ),

    'routes', (
      select coalesce(jsonb_agg(r order by (r ->> 'cost')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'route', c.route,
          'calls', count(*),
          'cost', sum(c.cost_micros),
          'p50', round(percentile_cont(0.5) within group (order by c.cost_micros)),
          'p95', round(percentile_cont(0.95) within group (order by c.cost_micros)),
          'max', max(c.cost_micros),
          'avg_input', round(avg(c.input_tokens + c.cache_write_tokens + c.cache_read_tokens)),
          'avg_output', round(avg(c.output_tokens)),
          'cache_read_share', round(coalesce(sum(c.cache_read_tokens)::numeric
              / nullif(sum(c.input_tokens + c.cache_write_tokens + c.cache_read_tokens), 0), 0), 3),
          'cut_off', count(*) filter (where c.stop_reason = 'max_tokens'),
          'lighter', count(*) filter (where c.requested_model is not null and c.requested_model <> c.model),
          'avg_ms', round(avg(c.duration_ms)),
          'users', count(distinct c.user_id),
          'daily', (
            select jsonb_agg(coalesce(x.cost, 0) order by d.day)
              from days d
              left join (select (c2.created_at at time zone 'utc')::date as day, sum(c2.cost_micros) as cost
                           from calls c2 where c2.route = c.route group by 1) x on x.day = d.day
          )
        ) as r
        from calls c
        group by c.route
      ) routes
    ),

    'outliers', (
      select coalesce(jsonb_agg(o order by (o ->> 'ratio')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', c.id, 'at', c.created_at, 'route', c.route, 'model', c.model,
          'requested_model', c.requested_model,
          'input', c.input_tokens, 'output', c.output_tokens,
          'cache_write', c.cache_write_tokens, 'cache_read', c.cache_read_tokens,
          'cost', c.cost_micros, 'median', round(m.med),
          'ratio', round((c.cost_micros / nullif(m.med, 0))::numeric, 1),
          'ms', c.duration_ms, 'stop', c.stop_reason, 'context', c.context,
          'user', left(c.user_id::text, 8)
        ) as o
        from calls c join route_median m using (route)
        where (c.cost_micros >= 3 * m.med and c.cost_micros >= 5000)
           or c.stop_reason = 'max_tokens'
        order by c.cost_micros / nullif(m.med, 0) desc nulls last
        limit 30
      ) x
    ),

    'top_users', (
      select coalesce(jsonb_agg(t order by (t ->> 'cost')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'user', left(c.user_id::text, 8),
          'plan', coalesce(sn.plan, 'deleted'),
          'cost', sum(c.cost_micros),
          'calls', count(*),
          'period_used', max(un.used),
          'top_route', mode() within group (order by c.route)
        ) as t
        from calls c
        left join sub_now sn on sn.user_id = c.user_id
        left join usage_now un on un.user_id = c.user_id
        where c.user_id is not null
        group by c.user_id, sn.plan
        order by sum(c.cost_micros) desc
        limit 10
      ) x
    ),

    'fair_use', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'plan', plan, 'users', users, 'over_soft', over_soft, 'near_hard', near_hard, 'at_hard', at_hard)), '[]'::jsonb)
      from (
        select un.plan,
               count(*) as users,
               count(*) filter (where un.used >= (p_caps -> un.plan ->> 'soft')::bigint) as over_soft,
               count(*) filter (where un.used >= 0.8 * (p_caps -> un.plan ->> 'hard')::bigint) as near_hard,
               count(*) filter (where un.used >= (p_caps -> un.plan ->> 'hard')::bigint) as at_hard
          from usage_now un
         group by un.plan
      ) x
    ),

    'funnel', (
      select jsonb_build_object(
        'signed_up', count(*),
        'onboarded', count(*) filter (where exists (
            select 1 from user_settings us where us.user_id = w.id and us.onboarded_at is not null)),
        'started_project', count(*) filter (where exists (
            select 1 from studio_projects p where p.user_id = w.id)),
        'active_2_days', count(*) filter (where (
            select count(*) from active a where a.user_id = w.id) >= 2),
        'back_after_day_7', count(*) filter (where exists (
            select 1 from active a where a.user_id = w.id and a.day >= (w.created_at at time zone 'utc')::date + 7)),
        'old_enough_for_day_7', count(*) filter (where w.created_at <= now() - interval '7 days'),
        'subscribed', count(*) filter (where exists (
            select 1 from subscriptions s where s.user_id = w.id and s.status in ('active', 'past_due')))
      )
      from window_users w
    ),

    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'source', source, 'signups', signups, 'started', started, 'subscribed', subscribed)
        order by signups desc), '[]'::jsonb)
      from (
        select coalesce(sa.source, sa.ref, sa.via, 'direct') as source,
               count(*) as signups,
               count(*) filter (where exists (select 1 from studio_projects p where p.user_id = w.id)) as started,
               count(*) filter (where exists (select 1 from subscriptions s where s.user_id = w.id
                                               and s.status in ('active', 'past_due'))) as subscribed
          from window_users w
          left join signup_attribution sa on sa.user_id = w.id
         group by 1
      ) x
    ),
    'heard_from', (
      select coalesce(jsonb_agg(jsonb_build_object('at', sa.created_at, 'text', sa.heard_from) order by sa.created_at desc), '[]'::jsonb)
      from (select * from signup_attribution where heard_from is not null and created_at >= since
             order by created_at desc limit 25) sa
    ),

    'cohorts', (
      select coalesce(jsonb_agg(jsonb_build_object('week', c.wk, 'size', c.size, 'weeks', (
          select jsonb_agg((
              select count(distinct a.user_id) from active a join cohort_members cm on cm.id = a.user_id
               where cm.wk = c.wk and a.day >= c.wk + 7 * g and a.day < c.wk + 7 * (g + 1)
            ) order by g)
            from generate_series(0, 7) g
           where c.wk + 7 * g <= (now() at time zone 'utc')::date
        )) order by c.wk), '[]'::jsonb)
      from (select wk, count(*) as size from cohort_members group by wk) c
    ),

    'billing_recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', created_at, 'kind', kind, 'tier', tier, 'interval', billing_interval, 'detail', detail)
        order by created_at desc), '[]'::jsonb)
      from (select * from billing_events order by created_at desc limit 20) b
    ),
    'billing_counts', (
      select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
      from (select kind, count(*) as n from billing_events where created_at >= since group by kind) x
    ),

    'ops', (
      select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
      from (select kind, count(*) as n from ops_events where created_at >= since group by kind) x
    ),
    'ops_recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', created_at, 'kind', kind, 'route', route, 'message', message) order by created_at desc), '[]'::jsonb)
      from (select * from ops_events where kind <> 'alert_sent' order by created_at desc limit 15) e
    ),
    'repeat_trials', (select count(*) from subscriptions where repeat_trial and created_at >= since)
  ) into result;

  return result;
end;
$$;

-- One route's recent calls, for the drill-down scatter.
create or replace function admin_route_calls(p_route text, p_days integer, p_env text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'at', created_at, 'model', model, 'requested_model', requested_model,
      'input', input_tokens, 'output', output_tokens,
      'cache_write', cache_write_tokens, 'cache_read', cache_read_tokens,
      'cost', cost_micros, 'ms', duration_ms, 'stop', stop_reason,
      'context', context, 'user', left(user_id::text, 8)
    ) order by created_at), '[]'::jsonb)
  from (
    select * from ai_calls
     where route = p_route and env = p_env
       and created_at >= now() - make_interval(days => greatest(p_days, 1))
     order by created_at desc
     limit 600
  ) c
$$;

revoke execute on function ops_active_days(timestamptz) from public, anon, authenticated;
revoke execute on function admin_dashboard(integer, text, jsonb) from public, anon, authenticated;
revoke execute on function admin_route_calls(text, integer, text) from public, anon, authenticated;
