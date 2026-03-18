import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type TravelMode = "passenger" | "pedestrian" | "commercial";
export type LaneType = "standard" | "ready" | "nexus_sentri" | "fast";

export type WaitSnapshot = {
  port_number: string;
  port_name: string;
  crossing_name?: string | null;
  travel_mode: TravelMode;
  lane_type: LaneType;
  delay_minutes: number | null;
  observed_at: string;
  operational_status?: string | null;
};

type WaitTimeAlert = {
  id: string;
  installation_id: string;
  port_number: string;
  port_name: string;
  crossing_name: string | null;
  travel_mode: TravelMode;
  lane_type: LaneType;
  operator: "lte";
  threshold_minutes: number;
};

type DeliveryStatus = "matched" | "sent" | "failed";

export type NotificationResult = {
  status: DeliveryStatus;
  providerMessageId?: string | null;
  providerError?: string | null;
};

export type NotificationSender = (
  alert: WaitTimeAlert,
  snapshot: WaitSnapshot,
) => Promise<NotificationResult>;

export type AlertEvaluationSummary = {
  failedAlerts: number;
  scannedAlerts: number;
  matchedAlerts: number;
  insertedDeliveries: number;
  updatedAlerts: number;
};

type DeliveryInsert = {
  alert_id: string;
  installation_id: string;
  port_number: string;
  travel_mode: TravelMode;
  lane_type: LaneType;
  threshold_minutes: number;
  observed_delay_minutes: number | null;
  observed_at: string;
  dispatched_at: string;
  status: DeliveryStatus;
  provider_message_id: string | null;
  provider_error: string | null;
};

function snapshotKey(snapshot: Pick<WaitSnapshot, "port_number" | "travel_mode" | "lane_type">): string {
  return `${snapshot.port_number}:${snapshot.travel_mode}:${snapshot.lane_type}`;
}

function isSnapshotActionable(snapshot: WaitSnapshot): boolean {
  if (!Number.isFinite(snapshot.delay_minutes)) {
    return false;
  }

  const status = `${snapshot.operational_status || ""}`.trim().toLowerCase();
  if (status === "" || status === "n/a" || status === "update pending") {
    return false;
  }

  return true;
}

function alertMatches(alert: WaitTimeAlert, snapshot: WaitSnapshot): boolean {
  if (!isSnapshotActionable(snapshot) || snapshot.delay_minutes === null) {
    return false;
  }

  if (alert.operator !== "lte") {
    return false;
  }

  return snapshot.delay_minutes <= alert.threshold_minutes;
}

export async function evaluateAndTriggerAlerts({
  supabaseAdmin,
  snapshots,
  sendNotification,
}: {
  supabaseAdmin: SupabaseClient;
  snapshots: WaitSnapshot[];
  sendNotification?: NotificationSender;
}): Promise<AlertEvaluationSummary> {
  const latestSnapshotByKey = new Map<string, WaitSnapshot>();

  for (const snapshot of snapshots) {
    if (!snapshot.port_number || !snapshot.travel_mode || !snapshot.lane_type) {
      continue;
    }

    const existing = latestSnapshotByKey.get(snapshotKey(snapshot));
    if (!existing || new Date(snapshot.observed_at).getTime() >= new Date(existing.observed_at).getTime()) {
      latestSnapshotByKey.set(snapshotKey(snapshot), snapshot);
    }
  }

  const portNumbers = [...new Set(snapshots.map((snapshot) => snapshot.port_number).filter(Boolean))];
  if (portNumbers.length === 0) {
    return { failedAlerts: 0, scannedAlerts: 0, matchedAlerts: 0, insertedDeliveries: 0, updatedAlerts: 0 };
  }

  const { data: alerts, error: alertsError } = await supabaseAdmin
    .from("wait_time_alerts")
    .select("id, installation_id, port_number, port_name, crossing_name, travel_mode, lane_type, operator, threshold_minutes")
    .in("port_number", portNumbers)
    .eq("is_active", true)
    .eq("is_triggered", false);

  if (alertsError) {
    throw alertsError;
  }

  const alertRows = (alerts || []) as WaitTimeAlert[];
  if (alertRows.length === 0) {
    return { failedAlerts: 0, scannedAlerts: 0, matchedAlerts: 0, insertedDeliveries: 0, updatedAlerts: 0 };
  }

  const candidateAlerts = alertRows
    .map((alert) => ({
      alert,
      snapshot: latestSnapshotByKey.get(snapshotKey(alert)),
    }))
    .filter((entry): entry is { alert: WaitTimeAlert; snapshot: WaitSnapshot } =>
      Boolean(entry.snapshot) && alertMatches(entry.alert, entry.snapshot),
    );

  if (candidateAlerts.length === 0) {
    return {
      scannedAlerts: alertRows.length,
      failedAlerts: 0,
      matchedAlerts: 0,
      insertedDeliveries: 0,
      updatedAlerts: 0,
    };
  }

  const matchedAlertIds = candidateAlerts.map((entry) => entry.alert.id);
  const { data: existingDeliveries, error: deliveryLookupError } = await supabaseAdmin
    .from("alert_deliveries")
    .select("alert_id")
    .in("alert_id", matchedAlertIds);

  if (deliveryLookupError) {
    throw deliveryLookupError;
  }

  const deliveredIds = new Set((existingDeliveries || []).map((row: { alert_id: string }) => row.alert_id));
  const freshMatches = candidateAlerts.filter((entry) => !deliveredIds.has(entry.alert.id));

  if (freshMatches.length === 0) {
    return {
      scannedAlerts: alertRows.length,
      failedAlerts: 0,
      matchedAlerts: candidateAlerts.length,
      insertedDeliveries: 0,
      updatedAlerts: 0,
    };
  }

  const deliveries: DeliveryInsert[] = [];
  let failedAlerts = 0;

  for (const { alert, snapshot } of freshMatches) {
    let status: DeliveryStatus = "matched";
    let providerMessageId: string | null = null;
    let providerError: string | null = null;

    if (sendNotification) {
      try {
        const result = await sendNotification(alert, snapshot);
        status = result.status;
        providerMessageId = result.providerMessageId ?? null;
        providerError = result.providerError ?? null;
      } catch (error) {
        status = "failed";
        providerError = error instanceof Error ? error.message : String(error);
      }
    }

    if (status === "failed") {
      failedAlerts += 1;
      continue;
    }

    deliveries.push({
      alert_id: alert.id,
      installation_id: alert.installation_id,
      port_number: alert.port_number,
      travel_mode: alert.travel_mode,
      lane_type: alert.lane_type,
      threshold_minutes: alert.threshold_minutes,
      observed_delay_minutes: snapshot.delay_minutes,
      observed_at: snapshot.observed_at,
      dispatched_at: new Date().toISOString(),
      status,
      provider_message_id: providerMessageId,
      provider_error: providerError,
    });
  }

  const { data: insertedDeliveries, error: insertError } = await supabaseAdmin
    .from("alert_deliveries")
    .insert(deliveries)
    .select("alert_id");

  if (insertError) {
    throw insertError;
  }

  const insertedAlertIds = (insertedDeliveries || []).map((row: { alert_id: string }) => row.alert_id);
  if (insertedAlertIds.length === 0) {
    return {
      scannedAlerts: alertRows.length,
      failedAlerts,
      matchedAlerts: candidateAlerts.length,
      insertedDeliveries: 0,
      updatedAlerts: 0,
    };
  }

  const { data: updatedAlerts, error: updateError } = await supabaseAdmin
    .from("wait_time_alerts")
    .update({
      is_active: false,
      is_triggered: true,
      triggered_at: new Date().toISOString(),
    })
    .in("id", insertedAlertIds)
    .eq("is_active", true)
    .select("id");

  if (updateError) {
    throw updateError;
  }

  return {
    scannedAlerts: alertRows.length,
    failedAlerts,
    matchedAlerts: candidateAlerts.length,
    insertedDeliveries: insertedAlertIds.length,
    updatedAlerts: (updatedAlerts || []).length,
  };
}
