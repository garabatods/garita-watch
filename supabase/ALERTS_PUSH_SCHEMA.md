# Garita Watch Supabase Alerts / Push Schema

This file is a quick handoff for another agent working on Garita Watch alerts, FCM tokens, and push notification delivery.

## Core Tables

### `public.wait_time_alerts`

Purpose:
- Stores one-shot wait-time alerts created in the web app.
- Alerts are scoped per browser/device via `installation_id`.

Main columns:
- `id uuid primary key`
- `installation_id text not null`
- `port_number text not null`
- `port_name text not null`
- `crossing_name text`
- `travel_mode text not null`
  - allowed: `passenger`, `pedestrian`, `commercial`
- `lane_type text not null`
  - allowed: `standard`, `ready`, `nexus_sentri`, `fast`
- `operator text not null default 'lte'`
  - current allowed value: `lte`
- `threshold_minutes integer not null`
- `is_active boolean not null default true`
- `is_triggered boolean not null default false`
- `triggered_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Behavior:
- A match is currently `delay_minutes <= threshold_minutes`.
- After successful delivery, the alert is marked:
  - `is_active = false`
  - `is_triggered = true`
  - `triggered_at = now()`

Defined in:
- [alerts_v1.sql](C:/ProjectsApp/border/supabase/sql/alerts_v1.sql)

### `public.device_subscriptions`

Purpose:
- Stores one active web push subscription per `installation_id`.
- This is the browser/device token table for FCM web push.

Main columns:
- `id uuid primary key`
- `installation_id text not null unique`
- `fcm_token text not null unique`
- `platform text not null default 'web'`
- `locale text`
- `user_agent text`
- `notification_permission text not null default 'default'`
  - allowed: `default`, `granted`, `denied`
- `is_active boolean not null default true`
- `last_seen_at timestamptz not null`
- `created_at timestamptz`
- `updated_at timestamptz`

Behavior:
- Frontend upserts this row after FCM token registration.
- Backend looks up active subscription by `installation_id`.
- Backend marks subscription inactive if FCM returns an invalid/unregistered token error.

Defined in:
- [device_subscriptions_v1.sql](C:/ProjectsApp/border/supabase/sql/device_subscriptions_v1.sql)

### `public.alert_deliveries`

Purpose:
- Backend delivery log for matched alerts.
- Tracks whether an alert was sent and with which provider response.

Main columns:
- `id uuid primary key`
- `alert_id uuid not null references public.wait_time_alerts(id) on delete cascade`
- `installation_id text not null`
- `port_number text not null`
- `travel_mode text not null`
- `lane_type text not null`
- `threshold_minutes integer not null`
- `observed_delay_minutes integer`
- `observed_at timestamptz not null`
- `dispatched_at timestamptz not null`
- `status text not null default 'matched'`
  - allowed: `matched`, `sent`, `failed`
- `provider_message_id text`
- `provider_error text`
- `created_at timestamptz`

Important constraint:
- `unique (alert_id)`

Current behavior:
- One delivery row per one-shot alert firing.
- If notification sending fails before delivery insert, the alert is not consumed.

Defined in:
- [alerts_backend_v1.sql](C:/ProjectsApp/border/supabase/sql/alerts_backend_v1.sql)

### `public.port_lane_wait_snapshots`

Purpose:
- Stores normalized lane-level wait history from the CBP XML ingest.
- This is the table intended to support future comparisons like:
  - slower than usual
  - faster than usual
  - about normal

Main columns:
- `id uuid primary key`
- `port_number text not null`
- `port_name text not null`
- `crossing_name text`
- `travel_mode text not null`
  - allowed: `passenger`, `pedestrian`, `commercial`
- `lane_type text not null`
  - allowed: `standard`, `ready`, `nexus_sentri`, `fast`
- `delay_minutes integer not null`
- `operational_status text`
- `observed_at timestamptz not null`
- `feed_updated_at timestamptz`
- `capture_minute_utc timestamptz not null`
- `created_at timestamptz`

Important constraint:
- `unique (port_number, travel_mode, lane_type, capture_minute_utc)`

Intended use:
- Persist lane-level historical rows without changing the current port-level snapshot table.
- Future analytics should read from this table or from derived views/RPCs built on top of it.

Defined in:
- [port_lane_wait_snapshots_v1.sql](C:/ProjectsApp/border/supabase/sql/port_lane_wait_snapshots_v1.sql)

### `public.get_lane_wait_comparison(...)`

Purpose:
- Derived RPC-style function for lane-level "usual vs current" comparisons.
- Intended to power labels like:
  - `faster_than_usual`
  - `slower_than_usual`
  - `about_normal`
  - `not_enough_data`

Signature:
- `public.get_lane_wait_comparison(in_port_number text default null, in_travel_mode text default null, in_lane_type text default null, in_lookback_days integer default 7, in_minimum_samples integer default 12)`

Returns:
- `port_number`
- `port_name`
- `crossing_name`
- `travel_mode`
- `lane_type`
- `current_delay_minutes`
- `current_observed_at`
- `usual_delay_minutes`
- `sample_count`
- `delta_minutes`
- `comparison_band_minutes`
- `trend_label`

Notes:
- It reads from `public.port_lane_wait_snapshots`.
- It is granted to `anon` and `authenticated`.
- It is the preferred public-facing read surface for lane trend labels instead of exposing the raw history table directly.

Defined in:
- [lane_wait_comparison_v1.sql](C:/ProjectsApp/border/supabase/sql/lane_wait_comparison_v1.sql)

## Shared Functions / Helpers

### `public.request_installation_id()`

Purpose:
- Reads `x-installation-id` from request headers and returns it for RLS scoping.

Used by:
- `wait_time_alerts` policies
- `device_subscriptions` policies
- `alert_deliveries` select policy

Defined in:
- [alerts_v1.sql](C:/ProjectsApp/border/supabase/sql/alerts_v1.sql)

### `public.set_updated_at()`

Purpose:
- Trigger helper that updates `updated_at` on row changes.

Used by:
- `wait_time_alerts`
- `device_subscriptions`

Defined in:
- [alerts_v1.sql](C:/ProjectsApp/border/supabase/sql/alerts_v1.sql)

## RLS Model

Alerts and device rows are scoped by browser installation using the request header:

- `x-installation-id`

Frontend source of truth:
- `window.garitaWatchInstallationId`
- generated in [supabase-init.js](C:/ProjectsApp/border/public/supabase-init.js)

Tables with per-installation RLS:
- `public.wait_time_alerts`
- `public.device_subscriptions`
- `public.alert_deliveries` for select access

## Frontend / Backend Flow

### Frontend

Relevant files:
- [public/supabase-init.js](C:/ProjectsApp/border/public/supabase-init.js)
- [public/firebase-init.js](C:/ProjectsApp/border/public/firebase-init.js)
- [public/firebase-messaging-sw.js](C:/ProjectsApp/border/public/firebase-messaging-sw.js)
- [public/app.js](C:/ProjectsApp/border/public/app.js)

Flow:
1. Browser generates or reuses `installation_id`.
2. Alert form inserts into `public.wait_time_alerts`.
3. Push enable flow registers an FCM token.
4. Browser upserts `public.device_subscriptions`.

### Backend

Relevant files:
- [supabase/functions/ingest-bwt/index.ts](C:/ProjectsApp/border/supabase/functions/ingest-bwt/index.ts)
- [supabase/functions/_shared/wait-alerts.ts](C:/ProjectsApp/border/supabase/functions/_shared/wait-alerts.ts)
- [supabase/functions/_shared/firebase-fcm.ts](C:/ProjectsApp/border/supabase/functions/_shared/firebase-fcm.ts)

Flow:
1. `ingest-bwt` fetches CBP XML.
2. Feed is normalized into wait snapshots.
3. Backend writes normalized lane history to `public.port_lane_wait_snapshots` when that table exists.
4. Backend loads active alerts from `public.wait_time_alerts`.
5. Matching alerts are evaluated against normalized snapshots.
6. Backend fetches active device subscription from `public.device_subscriptions`.
7. Backend sends FCM push.
8. On success:
   - insert row in `public.alert_deliveries`
   - mark alert inactive/triggered in `public.wait_time_alerts`
9. On FCM invalid-token errors:
   - mark `public.device_subscriptions.is_active = false`

## Runtime Secrets

Current backend push flow expects:
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `PUBLIC_WEB_URL`

The frontend also depends on a Firebase Web Push VAPID key in:
- [public/firebase-init.js](C:/ProjectsApp/border/public/firebase-init.js)

## Naming Summary

If another agent just needs the table names and key linkage:

- alerts table: `public.wait_time_alerts`
- device/token table: `public.device_subscriptions`
- delivery log table: `public.alert_deliveries`
- lane history table: `public.port_lane_wait_snapshots`
- browser-scoping header/function: `x-installation-id` / `public.request_installation_id()`
- alert-to-delivery join: `alert_deliveries.alert_id -> wait_time_alerts.id`
- alert-to-device join at runtime: `wait_time_alerts.installation_id -> device_subscriptions.installation_id`
