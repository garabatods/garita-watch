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

## Lane Wait Snapshots V1

Run `port_lane_wait_snapshots_v1.sql` to persist normalized lane-level wait history for future analytics such as:

- faster than usual
- slower than usual
- about normal

What it creates:

- `public.port_lane_wait_snapshots`
- one historical row per `port_number + travel_mode + lane_type + capture_minute_utc`
- backend-oriented lane history intended for derived comparisons rather than direct anon reads

Important integration note:

- the ingest function is safe to deploy before this table exists
- if the table is missing, ingest skips the lane-history insert and keeps the current alert + port snapshot flow working

## Lane Wait Comparison V1

Run `lane_wait_comparison_v1.sql` after `port_lane_wait_snapshots_v1.sql` to add a derived comparison RPC for lane-level trends.

What it creates:

- `public.get_lane_wait_comparison(...)`

What it returns:

- latest lane wait for each lane key
- a recent historical baseline (`usual_delay_minutes`)
- `sample_count`
- `delta_minutes`
- `comparison_band_minutes`
- `trend_label`

Trend labels:

- `faster_than_usual`
- `slower_than_usual`
- `about_normal`
- `not_enough_data`

Default behavior:

- compares the latest lane snapshot against the last 7 days of history
- requires at least 12 historical samples before returning a real trend label
- uses a conservative threshold band of `max(7 minutes, 25% of usual delay)`
- treats deltas under 7 minutes as `about_normal`

## Daily Lane Guidance V1

Run `port_lane_daily_guidance_v1.sql` after `port_lane_wait_snapshots_v1.sql` to add a once-per-day derived table that both web and mobile can cache locally.

What it creates:

- `public.port_lane_daily_guidance`
- `public.get_port_time_zone(...)`
- `public.refresh_port_lane_daily_guidance(...)`
- `public.get_current_port_lane_daily_guidance(...)`

What it stores:

- the current lane wait for the latest snapshot
- precomputed `trend_label` / `usual_delay_minutes`
- `best_hours_json` with the top low-wait local hours for the lane
- `generated_at`, `expires_at`, and `snapshot_date` for 24-hour client caching

Recommended refresh flow:

- call `select public.refresh_port_lane_daily_guidance();` once per day
- let web/mobile cache the returned snapshot rows locally until `expires_at`
- use `public.get_current_port_lane_daily_guidance(...)` for client reads

Recommended client pattern:

- fetch the full daily snapshot once
- cache it on device/browser
- do not re-read it until it expires or a newer `generated_at` is available
- fall back to `public.get_lane_wait_comparison(...)` only if the daily snapshot has not been generated yet
