-- Garita Watch daily lane guidance snapshot
--
-- Purpose:
-- - hold once-per-day precomputed lane guidance that both web and mobile can cache
-- - support low-cost reads from clients by avoiding repeated historical aggregation
--
-- Notes:
-- - this table is intended for derived daily data, not raw ingest history
-- - `best_hours_json` stores the top low-wait local hours for the lane
-- - clients should cache rows until `expires_at` or until a newer `generated_at`
--   appears for the same `snapshot_date`

create extension if not exists pgcrypto;

create table if not exists public.port_lane_daily_guidance (
    id uuid primary key default gen_random_uuid(),
    snapshot_date date not null,
    generated_at timestamptz not null default timezone('utc', now()),
    expires_at timestamptz not null,
    lookback_days integer not null default 14 check (lookback_days >= 1 and lookback_days <= 90),
    minimum_samples integer not null default 24 check (minimum_samples >= 1),
    port_number text not null,
    port_name text not null,
    crossing_name text,
    travel_mode text not null
        check (travel_mode in ('passenger', 'pedestrian', 'commercial')),
    lane_type text not null
        check (lane_type in ('standard', 'ready', 'nexus_sentri', 'fast')),
    time_zone text,
    current_delay_minutes integer,
    current_observed_at timestamptz,
    usual_delay_minutes numeric,
    sample_count integer not null default 0,
    delta_minutes numeric,
    comparison_band_minutes numeric,
    trend_label text not null default 'not_enough_data'
        check (trend_label in ('faster_than_usual', 'slower_than_usual', 'about_normal', 'not_enough_data')),
    best_hours_json jsonb not null default '[]'::jsonb,
    best_hours_sample_count integer not null default 0,
    created_at timestamptz not null default timezone('utc', now()),
    unique (snapshot_date, port_number, travel_mode, lane_type)
);

create index if not exists port_lane_daily_guidance_snapshot_idx
    on public.port_lane_daily_guidance (snapshot_date desc, port_number, travel_mode, lane_type);

create index if not exists port_lane_daily_guidance_expires_idx
    on public.port_lane_daily_guidance (expires_at);

alter table public.port_lane_daily_guidance enable row level security;

drop policy if exists port_lane_daily_guidance_select_public on public.port_lane_daily_guidance;
create policy port_lane_daily_guidance_select_public
on public.port_lane_daily_guidance
for select
to anon, authenticated
using (true);

grant select on public.port_lane_daily_guidance to anon, authenticated;

comment on table public.port_lane_daily_guidance is
'Daily precomputed lane guidance snapshot for shared web/mobile caching.';

create or replace function public.get_port_time_zone(
    in_port_number text
)
returns text
language sql
immutable
set search_path = public
as $$
    select case
        when in_port_number like '25%' then 'America/Los_Angeles'
        when in_port_number like '26%' then 'America/Phoenix'
        when in_port_number = '230301' then 'America/Denver'
        when in_port_number like '240%' then 'America/Denver'
        when in_port_number like '2301%' then 'America/Chicago'
        when in_port_number like '2302%' then 'America/Chicago'
        when in_port_number like '5355%' then 'America/Chicago'
        when in_port_number like '580%' then 'America/Chicago'
        else 'America/Chicago'
    end;
$$;

comment on function public.get_port_time_zone(text) is
'Maps Garita Watch port_number values to their local IANA time zone.';

create or replace function public.refresh_port_lane_daily_guidance(
    in_snapshot_date date default current_date,
    in_lookback_days integer default 14,
    in_minimum_samples integer default 24,
    in_best_hour_sample_minimum integer default 6,
    in_top_hour_count integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_generated_at timestamptz := timezone('utc', now());
    v_rows integer := 0;
begin
    if coalesce(in_lookback_days, 0) < 1 then
        raise exception 'in_lookback_days must be >= 1';
    end if;

    if coalesce(in_minimum_samples, 0) < 1 then
        raise exception 'in_minimum_samples must be >= 1';
    end if;

    if coalesce(in_best_hour_sample_minimum, 0) < 1 then
        raise exception 'in_best_hour_sample_minimum must be >= 1';
    end if;

    if coalesce(in_top_hour_count, 0) < 1 then
        raise exception 'in_top_hour_count must be >= 1';
    end if;

    with latest as (
        select distinct on (pls.port_number, pls.travel_mode, pls.lane_type)
            pls.port_number,
            pls.port_name,
            pls.crossing_name,
            pls.travel_mode,
            pls.lane_type,
            public.get_port_time_zone(pls.port_number) as time_zone,
            pls.delay_minutes as current_delay_minutes,
            pls.observed_at as current_observed_at,
            pls.capture_minute_utc
        from public.port_lane_wait_snapshots pls
        order by
            pls.port_number,
            pls.travel_mode,
            pls.lane_type,
            pls.observed_at desc
    ),
    baseline as (
        select
            latest.port_number,
            latest.port_name,
            latest.crossing_name,
            latest.travel_mode,
            latest.lane_type,
            latest.time_zone,
            latest.current_delay_minutes,
            latest.current_observed_at,
            avg(hist.delay_minutes)::numeric as usual_delay_minutes,
            count(hist.id)::integer as sample_count
        from latest
        left join public.port_lane_wait_snapshots hist
            on hist.port_number = latest.port_number
           and hist.travel_mode = latest.travel_mode
           and hist.lane_type = latest.lane_type
           and hist.capture_minute_utc < latest.capture_minute_utc
           and hist.observed_at >= latest.current_observed_at - make_interval(days => greatest(in_lookback_days, 1))
           and hist.observed_at < latest.current_observed_at
        group by
            latest.port_number,
            latest.port_name,
            latest.crossing_name,
            latest.travel_mode,
            latest.lane_type,
            latest.time_zone,
            latest.current_delay_minutes,
            latest.current_observed_at
    ),
    hourly_rollup as (
        select
            latest.port_number,
            latest.travel_mode,
            latest.lane_type,
            extract(hour from (hist.observed_at at time zone latest.time_zone))::integer as local_hour,
            round(avg(hist.delay_minutes)::numeric, 1) as average_delay_minutes,
            count(hist.id)::integer as sample_count
        from latest
        join public.port_lane_wait_snapshots hist
            on hist.port_number = latest.port_number
           and hist.travel_mode = latest.travel_mode
           and hist.lane_type = latest.lane_type
           and hist.observed_at >= latest.current_observed_at - make_interval(days => greatest(in_lookback_days, 1))
           and hist.observed_at < latest.current_observed_at
        group by
            latest.port_number,
            latest.travel_mode,
            latest.lane_type,
            extract(hour from (hist.observed_at at time zone latest.time_zone))
        having count(hist.id) >= greatest(in_best_hour_sample_minimum, 1)
    ),
    ranked_hours as (
        select
            hourly_rollup.*,
            row_number() over (
                partition by hourly_rollup.port_number, hourly_rollup.travel_mode, hourly_rollup.lane_type
                order by
                    hourly_rollup.average_delay_minutes asc,
                    hourly_rollup.sample_count desc,
                    hourly_rollup.local_hour asc
            ) as hour_rank
        from hourly_rollup
    ),
    best_hours as (
        select
            ranked_hours.port_number,
            ranked_hours.travel_mode,
            ranked_hours.lane_type,
            jsonb_agg(
                jsonb_build_object(
                    'hour', ranked_hours.local_hour,
                    'average_delay_minutes', ranked_hours.average_delay_minutes,
                    'sample_count', ranked_hours.sample_count
                )
                order by ranked_hours.hour_rank
            ) as best_hours_json,
            coalesce(sum(ranked_hours.sample_count), 0)::integer as best_hours_sample_count
        from ranked_hours
        where ranked_hours.hour_rank <= greatest(in_top_hour_count, 1)
        group by
            ranked_hours.port_number,
            ranked_hours.travel_mode,
            ranked_hours.lane_type
    ),
    guidance_rows as (
        select
            in_snapshot_date as snapshot_date,
            v_generated_at as generated_at,
            v_generated_at + interval '1 day' as expires_at,
            greatest(in_lookback_days, 1) as lookback_days,
            greatest(in_minimum_samples, 1) as minimum_samples,
            baseline.port_number,
            baseline.port_name,
            baseline.crossing_name,
            baseline.travel_mode,
            baseline.lane_type,
            baseline.time_zone,
            baseline.current_delay_minutes,
            baseline.current_observed_at,
            round(coalesce(baseline.usual_delay_minutes, 0), 1) as usual_delay_minutes,
            baseline.sample_count,
            round(coalesce(baseline.current_delay_minutes - baseline.usual_delay_minutes, 0), 1) as delta_minutes,
            round(greatest(7, coalesce(baseline.usual_delay_minutes, 0) * 0.25), 1) as comparison_band_minutes,
            case
                when baseline.sample_count < greatest(in_minimum_samples, 1) then 'not_enough_data'
                when abs(baseline.current_delay_minutes - baseline.usual_delay_minutes) < 7 then 'about_normal'
                when baseline.current_delay_minutes <= baseline.usual_delay_minutes - greatest(7, baseline.usual_delay_minutes * 0.25) then 'faster_than_usual'
                when baseline.current_delay_minutes >= baseline.usual_delay_minutes + greatest(7, baseline.usual_delay_minutes * 0.25) then 'slower_than_usual'
                else 'about_normal'
            end as trend_label,
            coalesce(best_hours.best_hours_json, '[]'::jsonb) as best_hours_json,
            coalesce(best_hours.best_hours_sample_count, 0) as best_hours_sample_count
        from baseline
        left join best_hours
            on best_hours.port_number = baseline.port_number
           and best_hours.travel_mode = baseline.travel_mode
           and best_hours.lane_type = baseline.lane_type
    )
    insert into public.port_lane_daily_guidance (
        snapshot_date,
        generated_at,
        expires_at,
        lookback_days,
        minimum_samples,
        port_number,
        port_name,
        crossing_name,
        travel_mode,
        lane_type,
        time_zone,
        current_delay_minutes,
        current_observed_at,
        usual_delay_minutes,
        sample_count,
        delta_minutes,
        comparison_band_minutes,
        trend_label,
        best_hours_json,
        best_hours_sample_count
    )
    select
        snapshot_date,
        generated_at,
        expires_at,
        lookback_days,
        minimum_samples,
        port_number,
        port_name,
        crossing_name,
        travel_mode,
        lane_type,
        time_zone,
        current_delay_minutes,
        current_observed_at,
        usual_delay_minutes,
        sample_count,
        delta_minutes,
        comparison_band_minutes,
        trend_label,
        best_hours_json,
        best_hours_sample_count
    from guidance_rows
    on conflict (snapshot_date, port_number, travel_mode, lane_type)
    do update
    set
        generated_at = excluded.generated_at,
        expires_at = excluded.expires_at,
        lookback_days = excluded.lookback_days,
        minimum_samples = excluded.minimum_samples,
        port_name = excluded.port_name,
        crossing_name = excluded.crossing_name,
        time_zone = excluded.time_zone,
        current_delay_minutes = excluded.current_delay_minutes,
        current_observed_at = excluded.current_observed_at,
        usual_delay_minutes = excluded.usual_delay_minutes,
        sample_count = excluded.sample_count,
        delta_minutes = excluded.delta_minutes,
        comparison_band_minutes = excluded.comparison_band_minutes,
        trend_label = excluded.trend_label,
        best_hours_json = excluded.best_hours_json,
        best_hours_sample_count = excluded.best_hours_sample_count;

    get diagnostics v_rows = row_count;
    return v_rows;
end;
$$;

grant execute on function public.refresh_port_lane_daily_guidance(date, integer, integer, integer, integer)
    to authenticated;

comment on function public.refresh_port_lane_daily_guidance(date, integer, integer, integer, integer) is
'Rebuilds the daily lane guidance snapshot used by web/mobile cached reads.';

create or replace function public.get_current_port_lane_daily_guidance(
    in_port_number text default null
)
returns setof public.port_lane_daily_guidance
language sql
stable
security definer
set search_path = public
as $$
    select guidance.*
    from public.port_lane_daily_guidance guidance
    where guidance.snapshot_date = (
        select max(snapshot_date)
        from public.port_lane_daily_guidance
    )
      and (in_port_number is null or guidance.port_number = in_port_number)
    order by guidance.port_number, guidance.travel_mode, guidance.lane_type;
$$;

grant execute on function public.get_current_port_lane_daily_guidance(text)
    to anon, authenticated;

comment on function public.get_current_port_lane_daily_guidance(text) is
'Returns the latest daily lane guidance snapshot, optionally filtered by port_number.';
