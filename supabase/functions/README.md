# Supabase Functions

The live `ingest-bwt` Edge Function is not in this repo yet, so this folder contains reusable backend pieces for alert evaluation.

## Files

- `_shared/wait-alerts.ts`
  - reusable alert evaluator
  - loads active alerts for the affected ports
  - matches one-shot alerts against normalized lane snapshots
  - writes `alert_deliveries`
  - marks matched alerts as `is_triggered = true` and `is_active = false`
- `ingest-bwt-integration-example/index.ts`
  - example of how to call the evaluator from the real ingest function

## Expected snapshot shape

The evaluator expects normalized rows like:

```ts
{
  port_number: "250609",
  port_name: "Otay Mesa",
  crossing_name: null,
  travel_mode: "passenger",
  lane_type: "standard",
  delay_minutes: 20,
  observed_at: "2026-03-17T21:00:00.000Z",
  operational_status: "Open"
}
```

## Integration path

In the real `ingest-bwt` function:

1. parse the CBP feed
2. flatten the feed into normalized `WaitSnapshot[]`
3. call `evaluateAndTriggerAlerts(...)`
4. after that, add real notification delivery inside `sendNotification`

This keeps the current ingest flow intact and adds alert evaluation at the end of each ingest run.

## Firebase / FCM configuration

The deployed `ingest-bwt` function now expects these runtime secrets for real push delivery:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
  - a full Firebase service account JSON string for the `garita-watch` project
- `PUBLIC_WEB_URL`
  - the HTTPS URL users should open when they click a notification

The frontend also requires:

- a Firebase Web Push certificate key in `public/firebase-init.js`
  - replace `REPLACE_WITH_FIREBASE_WEB_PUSH_CERTIFICATE_KEY`

Without those values:

- alerts will still be evaluated
- failed notification attempts will not consume the alert
- push registration in the browser will stay disabled until the VAPID key is set
