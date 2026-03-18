-- Garita Watch web-push device subscriptions
--
-- Run this after alerts_v1.sql.
-- The frontend stores one active browser/device push subscription per
-- installation_id and scopes access via the x-installation-id request header.

create table if not exists public.device_subscriptions (
    id uuid primary key default gen_random_uuid(),
    installation_id text not null unique check (char_length(installation_id) >= 20),
    fcm_token text not null unique,
    platform text not null default 'web',
    locale text,
    user_agent text,
    notification_permission text not null default 'default'
        check (notification_permission in ('default', 'granted', 'denied')),
    is_active boolean not null default true,
    last_seen_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_subscriptions_active_idx
    on public.device_subscriptions (installation_id, is_active);

drop trigger if exists device_subscriptions_set_updated_at on public.device_subscriptions;
create trigger device_subscriptions_set_updated_at
before update on public.device_subscriptions
for each row
execute function public.set_updated_at();

alter table public.device_subscriptions enable row level security;

drop policy if exists device_subscriptions_select_own on public.device_subscriptions;
create policy device_subscriptions_select_own
on public.device_subscriptions
for select
to anon, authenticated
using (installation_id = public.request_installation_id());

drop policy if exists device_subscriptions_insert_own on public.device_subscriptions;
create policy device_subscriptions_insert_own
on public.device_subscriptions
for insert
to anon, authenticated
with check (installation_id = public.request_installation_id());

drop policy if exists device_subscriptions_update_own on public.device_subscriptions;
create policy device_subscriptions_update_own
on public.device_subscriptions
for update
to anon, authenticated
using (installation_id = public.request_installation_id())
with check (installation_id = public.request_installation_id());

drop policy if exists device_subscriptions_delete_own on public.device_subscriptions;
create policy device_subscriptions_delete_own
on public.device_subscriptions
for delete
to anon, authenticated
using (installation_id = public.request_installation_id());

grant select, insert, update, delete on public.device_subscriptions to anon, authenticated;

comment on table public.device_subscriptions is
'Browser push subscriptions for Garita Watch web alerts, keyed by installation_id.';
