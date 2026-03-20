-- Garita Watch lane wait comparisons
--
-- Run this after `port_lane_wait_snapshots_v1.sql`.
--
-- This adds a derived RPC-friendly function that compares the latest lane wait
-- time against recent historical lane data and returns labels like:
-- - faster_than_usual
-- - slower_than_usual
-- - about_normal
-- - not_enough_data

create or replace function public.get_lane_wait_comparison(
    in_port_number text default null,
    in_travel_mode text default null,
    in_lane_type text default null,
    in_lookback_days integer default 7,
    in_minimum_samples integer default 12
)
returns table (
    port_number text,
    port_name text,
    crossing_name text,
    travel_mode text,
    lane_type text,
    current_delay_minutes integer,
    current_observed_at timestamptz,
    usual_delay_minutes numeric,
    sample_count integer,
    delta_minutes numeric,
    comparison_band_minutes numeric,
    trend_label text
)
language sql
stable
security definer
set search_path = public
as $$
    with latest as (
        select distinct on (pls.port_number, pls.travel_mode, pls.lane_type)
            pls.port_number,
            pls.port_name,
            pls.crossing_name,
            pls.travel_mode,
            pls.lane_type,
            pls.delay_minutes as current_delay_minutes,
            pls.observed_at as current_observed_at,
            pls.capture_minute_utc
        from public.port_lane_wait_snapshots pls
        where (in_port_number is null or pls.port_number = in_port_number)
          and (in_travel_mode is null or pls.travel_mode = in_travel_mode)
          and (in_lane_type is null or pls.lane_type = in_lane_type)
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
            latest.current_delay_minutes,
            latest.current_observed_at
    )
    select
        baseline.port_number,
        baseline.port_name,
        baseline.crossing_name,
        baseline.travel_mode,
        baseline.lane_type,
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
        end as trend_label
    from baseline
    order by
        baseline.port_number,
        baseline.travel_mode,
        baseline.lane_type;
$$;

grant execute on function public.get_lane_wait_comparison(text, text, text, integer, integer)
    to anon, authenticated;

comment on function public.get_lane_wait_comparison(text, text, text, integer, integer) is
'Returns a lane-level current vs usual comparison using recent historical lane snapshots.';
