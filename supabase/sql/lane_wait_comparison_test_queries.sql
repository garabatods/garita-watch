-- Garita Watch lane trend test queries
--
-- Use this file to:
-- 1. find real lane keys that already have enough history
-- 2. inspect a single lane comparison
-- 3. optionally seed reversible synthetic history for testing UI labels
--
-- IMPORTANT:
-- - The seed section is only for temporary validation.
-- - Use the cleanup section after testing.

-- ---------------------------------------------------------------------------
-- 1. Find lane keys with enough real history already collected
-- ---------------------------------------------------------------------------

select
    port_number,
    port_name,
    crossing_name,
    travel_mode,
    lane_type,
    count(*) as sample_count,
    min(observed_at) as first_seen_at,
    max(observed_at) as last_seen_at
from public.port_lane_wait_snapshots
group by
    port_number,
    port_name,
    crossing_name,
    travel_mode,
    lane_type
having count(*) >= 12
order by sample_count desc, last_seen_at desc;

-- ---------------------------------------------------------------------------
-- 2. Inspect a single lane comparison using real data
--    Replace values with one row from the query above.
-- ---------------------------------------------------------------------------

-- select *
-- from public.get_lane_wait_comparison('250601', 'passenger', 'standard', 7, 12);

-- ---------------------------------------------------------------------------
-- 3. Temporary synthetic history seed for one existing lane
--    This helps validate the UI before enough real samples accumulate.
-- ---------------------------------------------------------------------------
--
-- Recommended safe target:
-- - use a real port/lane that already exists in the latest snapshots
-- - example below uses Otay Mesa Passenger Standard under port 250601
--
-- What this does:
-- - inserts 14 historical rows in the past 7 days
-- - sets the synthetic "usual" delay lower than the current delay
-- - should make the current lane read as `slower_than_usual`
--
-- IMPORTANT:
-- - `capture_minute_utc` values are offset into the past, so this does not
--   conflict with live ingest rows
-- - cleanup SQL is included below

-- insert into public.port_lane_wait_snapshots (
--     port_number,
--     port_name,
--     crossing_name,
--     travel_mode,
--     lane_type,
--     delay_minutes,
--     operational_status,
--     observed_at,
--     feed_updated_at,
--     capture_minute_utc
-- )
-- select
--     '250601' as port_number,
--     'Otay Mesa' as port_name,
--     'Passenger' as crossing_name,
--     'passenger' as travel_mode,
--     'standard' as lane_type,
--     12 as delay_minutes,
--     'Open' as operational_status,
--     timezone('utc', now()) - make_interval(hours => sample_hour) as observed_at,
--     timezone('utc', now()) - make_interval(hours => sample_hour) as feed_updated_at,
--     date_trunc('minute', timezone('utc', now()) - make_interval(hours => sample_hour)) as capture_minute_utc
-- from generate_series(12, 168, 12) as sample_hour
-- on conflict (port_number, travel_mode, lane_type, capture_minute_utc) do nothing;

-- After inserting the seed rows, test:
--
-- select *
-- from public.get_lane_wait_comparison('250601', 'passenger', 'standard', 7, 12);

-- ---------------------------------------------------------------------------
-- 4. Cleanup for the synthetic seed above
-- ---------------------------------------------------------------------------

-- delete from public.port_lane_wait_snapshots
-- where port_number = '250601'
--   and travel_mode = 'passenger'
--   and lane_type = 'standard'
--   and delay_minutes = 12
--   and observed_at >= timezone('utc', now()) - interval '8 days';
