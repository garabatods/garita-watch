# Supabase Cron Migration

This folder contains the SQL needed to move the wait-time ingest scheduler from GitHub Actions to Supabase Cron.

## Files

- `setup_ingest_schedule.sql`: creates or updates the Vault secrets, helper function, and recurring cron job
- `teardown_ingest_schedule.sql`: removes the cron job and helper function

## Recommended rollout

1. In Supabase, enable these extensions if they are not already enabled:
   - `pg_cron`
   - `pg_net`
   - `vault`
2. Open `setup_ingest_schedule.sql`.
3. Review the seeded values for the current live project:
   - URL: `https://ymlunuhplrcdemewtyxf.supabase.co/functions/v1/ingest-bwt`
   - headers: `Authorization: Bearer <anon-key>` and `apikey: <anon-key>`
4. Run the SQL in the Supabase SQL editor.
5. Verify the job exists:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'garita-watch-ingest-bwt';
```

6. Verify recent runs:

```sql
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'garita-watch-ingest-bwt'
)
order by start_time desc
limit 10;
```

7. Keep the GitHub Actions scheduler enabled until you see successful Supabase runs.
8. After Supabase Cron is confirmed working, disable the GitHub scheduler by removing or disabling:
   - `.github/workflows/ingest-bwt-schedule.yml`
   - `ingest-bwt-cron.yml` if it is still used anywhere in your deployment process

## Header format

The headers secret is stored as raw JSON so you can match whichever authentication scheme your ingest endpoint expects.

Examples:

{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY","apikey":"YOUR_ANON_KEY"}
```

## Cadence

The SQL uses the same cadence as the active GitHub workflow in this repo:

```text
3-53/10 * * * *
```

That preserves the current every-10-minutes schedule with the same minute offset.
