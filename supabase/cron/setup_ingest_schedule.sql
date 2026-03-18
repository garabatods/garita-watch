-- Garita Watch: move the ingest scheduler from GitHub Actions to Supabase Cron.
--
-- How to use:
-- 1. Review the seeded secret values below for the current project.
-- 2. Run this file in the Supabase SQL editor for the target project.
-- 3. Verify the job appears in Integrations -> Cron and runs successfully.
-- 4. Only after verification, disable the GitHub Actions workflow scheduler.
--
-- This script is idempotent: rerunning it updates secrets, recreates the helper
-- function, and replaces the cron job with the same name.

create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists vault;

do $$
declare
    ingest_url_secret_id uuid;
    ingest_headers_secret_id uuid;
begin
    select id
    into ingest_url_secret_id
    from vault.decrypted_secrets
    where name = 'garita_watch_ingest_url';

    if ingest_url_secret_id is null then
        perform vault.create_secret(
            'https://ymlunuhplrcdemewtyxf.supabase.co/functions/v1/ingest-bwt',
            'garita_watch_ingest_url',
            'Garita Watch ingest endpoint URL'
        );
    else
        perform vault.update_secret(
            ingest_url_secret_id,
            'https://ymlunuhplrcdemewtyxf.supabase.co/functions/v1/ingest-bwt',
            'garita_watch_ingest_url',
            'Garita Watch ingest endpoint URL'
        );
    end if;

    select id
    into ingest_headers_secret_id
    from vault.decrypted_secrets
    where name = 'garita_watch_ingest_headers_json';

    if ingest_headers_secret_id is null then
        perform vault.create_secret(
            '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbHVudWhwbHJjZGVtZXd0eXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDUxNzgsImV4cCI6MjA4NzQ4MTE3OH0.53eYzkPUVy26rDfsIhuew34MzBRMSiAi1LwX5ku-PEo","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbHVudWhwbHJjZGVtZXd0eXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDUxNzgsImV4cCI6MjA4NzQ4MTE3OH0.53eYzkPUVy26rDfsIhuew34MzBRMSiAi1LwX5ku-PEo"}',
            'garita_watch_ingest_headers_json',
            'Garita Watch ingest request headers as JSON'
        );
    else
        perform vault.update_secret(
            ingest_headers_secret_id,
            '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbHVudWhwbHJjZGVtZXd0eXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDUxNzgsImV4cCI6MjA4NzQ4MTE3OH0.53eYzkPUVy26rDfsIhuew34MzBRMSiAi1LwX5ku-PEo","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbHVudWhwbHJjZGVtZXd0eXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDUxNzgsImV4cCI6MjA4NzQ4MTE3OH0.53eYzkPUVy26rDfsIhuew34MzBRMSiAi1LwX5ku-PEo"}',
            'garita_watch_ingest_headers_json',
            'Garita Watch ingest request headers as JSON'
        );
    end if;
end
$$;

create or replace function public.invoke_bwt_ingest()
returns bigint
language sql
security definer
set search_path = public
as $$
    select net.http_post(
        url := (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'garita_watch_ingest_url'
        ),
        headers := (
            select decrypted_secret::jsonb
            from vault.decrypted_secrets
            where name = 'garita_watch_ingest_headers_json'
        ),
        body := '{}'::jsonb
    );
$$;

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

    perform cron.schedule(
        'garita-watch-ingest-bwt',
        '3-53/10 * * * *',
        'select public.invoke_bwt_ingest();'
    );
end
$$;

comment on function public.invoke_bwt_ingest()
is 'Invokes the Garita Watch wait-time ingest endpoint via pg_net. Scheduled by pg_cron.';
