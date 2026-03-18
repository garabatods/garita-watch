-- Garita Watch backend alert processing support
--
-- Run this after alerts_v1.sql.
-- This adds a delivery log table so the ingest pipeline can mark one-shot alerts
-- as processed without repeatedly spamming the same alert.

create table if not exists public.alert_deliveries (
    id uuid primary key default gen_random_uuid(),
    alert_id uuid not null references public.wait_time_alerts(id) on delete cascade,
    installation_id text not null,
    port_number text not null,
    travel_mode text not null,
    lane_type text not null,
    threshold_minutes integer not null,
    observed_delay_minutes integer,
    observed_at timestamptz not null default timezone('utc', now()),
    dispatched_at timestamptz not null default timezone('utc', now()),
    status text not null default 'matched' check (status in ('matched', 'sent', 'failed')),
    provider_message_id text,
    provider_error text,
    created_at timestamptz not null default timezone('utc', now()),
    unique (alert_id)
);

create index if not exists alert_deliveries_installation_idx
    on public.alert_deliveries (installation_id, dispatched_at desc);

create index if not exists alert_deliveries_port_idx
    on public.alert_deliveries (port_number, dispatched_at desc);

alter table public.alert_deliveries enable row level security;

drop policy if exists alert_deliveries_select_own on public.alert_deliveries;
create policy alert_deliveries_select_own
on public.alert_deliveries
for select
to anon, authenticated
using (installation_id = public.request_installation_id());

grant select on public.alert_deliveries to anon, authenticated;

comment on table public.alert_deliveries is
'Backend delivery log for wait-time alerts. One row per one-shot alert firing.';
