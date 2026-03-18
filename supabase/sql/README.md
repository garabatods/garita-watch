# Supabase SQL

## Alerts V1

Run `alerts_v1.sql` in the Supabase SQL editor before using the alert UI.

What it creates:

- `public.wait_time_alerts`
- `public.request_installation_id()`
- `public.set_updated_at()`
- row-level security policies scoped by the `x-installation-id` request header

How the frontend uses it:

- `public/supabase-init.js` generates a stable browser installation ID
- that ID is sent to Supabase as the `x-installation-id` header
- the alert UI in `public/app.js` can then create, list, and delete rows for that installation

This is intentionally a V1 storage layer only. Push delivery and backend-triggered dispatch still need to be added on top of these alert rows.

## Alerts Backend V1

Run `alerts_backend_v1.sql` after `alerts_v1.sql` to add the backend delivery log used by the ingest-side alert evaluator.

What it creates:

- `public.alert_deliveries`
- a one-row-per-alert delivery log
- browser-scoped select access via the same `x-installation-id` header

## Device Subscriptions V1

Run `device_subscriptions_v1.sql` after `alerts_v1.sql` to add browser/device push token storage for Firebase Cloud Messaging.

What it creates:

- `public.device_subscriptions`
- one active push subscription row per browser installation
- row-level security for select/insert/update/delete via `x-installation-id`
