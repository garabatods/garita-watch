-- Garita Watch lane-level wait history
--
-- Run this to start persisting normalized lane snapshots for historical
-- comparisons such as "faster than usual" or "slower than usual".
--
-- This table is backend-oriented. It is written by the ingest function and is
-- intended to support derived analytics/views rather than direct anonymous
-- client reads.

create extension if not exists pgcrypto;

create table if not exists public.port_lane_wait_snapshots (
    id uuid primary key default gen_random_uuid(),
    port_number text not null,
    port_name text not null,
    crossing_name text,
    travel_mode text not null
        check (travel_mode in ('passenger', 'pedestrian', 'commercial')),
    lane_type text not null
        check (lane_type in ('standard', 'ready', 'nexus_sentri', 'fast')),
    delay_minutes integer not null
        check (delay_minutes >= 0 and delay_minutes <= 600),
    operational_status text,
    observed_at timestamptz not null,
    feed_updated_at timestamptz,
    capture_minute_utc timestamptz not null,
    created_at timestamptz not null default timezone('utc', now()),
    unique (port_number, travel_mode, lane_type, capture_minute_utc)
);

create index if not exists port_lane_wait_snapshots_lookup_idx
    on public.port_lane_wait_snapshots (port_number, travel_mode, lane_type, observed_at desc);

create index if not exists port_lane_wait_snapshots_capture_idx
    on public.port_lane_wait_snapshots (capture_minute_utc desc);

comment on table public.port_lane_wait_snapshots is
'Lane-level historical wait snapshots derived from the CBP XML feed for future trend comparisons.';
