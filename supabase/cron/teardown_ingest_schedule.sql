-- Removes the Supabase Cron job created by setup_ingest_schedule.sql.
-- Run this if you need to roll back the scheduler migration.

do $$
declare
    existing_job_id bigint;
begin
    select jobid
    into existing_job_id
    from cron.job
    where jobname = 'garita-watch-ingest-bwt';

    if existing_job_id is not null then
        perform cron.unschedule(existing_job_id);
    end if;
end
$$;

drop function if exists public.invoke_bwt_ingest();
