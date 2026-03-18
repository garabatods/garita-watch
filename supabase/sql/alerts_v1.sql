-- Garita Watch V1 alerts schema
--
-- Run this in the Supabase SQL editor before using the alert UI.
-- The frontend sends a per-browser installation ID in the `x-installation-id`
-- request header. Row-level policies below scope alert rows to that ID.

create extension if not exists pgcrypto;

create or replace function public.request_installation_id()
returns text
language sql
stable
as $$
    select nullif(
        coalesce(
            (current_setting('request.headers', true)::json ->> 'x-installation-id'),
            ''
        ),
        ''
    );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create table if not exists public.wait_time_alerts (
    id uuid primary key default gen_random_uuid(),
    installation_id text not null check (char_length(installation_id) >= 20),
    port_number text not null,
    port_name text not null,
    crossing_name text,
    travel_mode text not null check (travel_mode in ('passenger', 'pedestrian', 'commercial')),
    lane_type text not null check (lane_type in ('standard', 'ready', 'nexus_sentri', 'fast')),
    operator text not null default 'lte' check (operator in ('lte')),
    threshold_minutes integer not null check (threshold_minutes >= 0 and threshold_minutes <= 600),
    is_active boolean not null default true,
    is_triggered boolean not null default false,
    triggered_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wait_time_alerts_installation_idx
    on public.wait_time_alerts (installation_id, created_at desc);

create index if not exists wait_time_alerts_active_idx
    on public.wait_time_alerts (port_number, is_active, is_triggered);

drop trigger if exists wait_time_alerts_set_updated_at on public.wait_time_alerts;
create trigger wait_time_alerts_set_updated_at
before update on public.wait_time_alerts
for each row
execute function public.set_updated_at();

alter table public.wait_time_alerts enable row level security;

drop policy if exists wait_time_alerts_select_own on public.wait_time_alerts;
create policy wait_time_alerts_select_own
on public.wait_time_alerts
for select
to anon, authenticated
using (installation_id = public.request_installation_id());

drop policy if exists wait_time_alerts_insert_own on public.wait_time_alerts;
create policy wait_time_alerts_insert_own
on public.wait_time_alerts
for insert
to anon, authenticated
with check (installation_id = public.request_installation_id());

drop policy if exists wait_time_alerts_update_own on public.wait_time_alerts;
create policy wait_time_alerts_update_own
on public.wait_time_alerts
for update
to anon, authenticated
using (installation_id = public.request_installation_id())
with check (installation_id = public.request_installation_id());

drop policy if exists wait_time_alerts_delete_own on public.wait_time_alerts;
create policy wait_time_alerts_delete_own
on public.wait_time_alerts
for delete
to anon, authenticated
using (installation_id = public.request_installation_id());

grant select, insert, update, delete on public.wait_time_alerts to anon, authenticated;

comment on table public.wait_time_alerts is
'Per-browser Garita Watch wait time alerts. Notification dispatch is handled separately.';
