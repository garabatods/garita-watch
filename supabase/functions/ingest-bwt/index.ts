import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluateAndTriggerAlerts, type LaneType, type TravelMode, type WaitSnapshot } from "../_shared/wait-alerts.ts";
import { sendFcmWebPush } from "../_shared/firebase-fcm.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const cbpFeedUrl = "https://bwt.cbp.gov/xml/bwt.xml";
const invalidStatuses = new Set(["N/A", "Update Pending", "Lanes Closed"]);
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type ParsedPort = {
  pedDelayMinutes: number | null;
  pedStatus: string;
  portNumber: string;
  portStatus: string;
  vehicleDelayMinutes: number | null;
  vehicleStatus: string;
};

type SnapshotInsert = {
  captured_at: string;
  feed_updated_at: string | null;
  ped_delay_minutes: number | null;
  ped_status: string;
  port_number: string;
  port_status: string;
  vehicle_delay_minutes: number | null;
  vehicle_status: string;
};

type LaneSnapshotInsert = {
  capture_minute_utc: string;
  crossing_name: string | null;
  delay_minutes: number;
  feed_updated_at: string | null;
  lane_type: LaneType;
  observed_at: string;
  operational_status: string | null;
  port_name: string;
  port_number: string;
  travel_mode: TravelMode;
};

type Summary = {
  errors: string[];
  fetched: number;
  inserted: number;
  matched: number;
  alerts: {
    failedAlerts: number;
    failedReasons: string[];
    insertedDeliveries: number;
    matchedAlerts: number;
    scannedAlerts: number;
    updatedAlerts: number;
  };
  skipped: {
    duplicate_capture_minute: number;
    non_mexican_border: number;
    unmapped_port: number;
    unsupported_wait_data: number;
  };
};

type LaneReading = {
  delayMinutes: number | null;
  priority: number;
  status: string;
};

type AlertLaneDefinition = {
  laneType: LaneType;
  path: string[];
  travelMode: TravelMode;
};

const alertLaneDefinitions: AlertLaneDefinition[] = [
  { travelMode: "passenger", laneType: "standard", path: ["passenger_vehicle_lanes", "standard_lanes"] },
  { travelMode: "passenger", laneType: "nexus_sentri", path: ["passenger_vehicle_lanes", "NEXUS_SENTRI_lanes"] },
  { travelMode: "passenger", laneType: "ready", path: ["passenger_vehicle_lanes", "ready_lanes"] },
  { travelMode: "passenger", laneType: "fast", path: ["passenger_vehicle_lanes", "FAST_lanes"] },
  { travelMode: "pedestrian", laneType: "standard", path: ["pedestrian_lanes", "standard_lanes"] },
  { travelMode: "pedestrian", laneType: "ready", path: ["pedestrian_lanes", "ready_lanes"] },
  { travelMode: "commercial", laneType: "standard", path: ["commercial_vehicle_lanes", "standard_lanes"] },
  { travelMode: "commercial", laneType: "ready", path: ["commercial_vehicle_lanes", "ready_lanes"] },
  { travelMode: "commercial", laneType: "fast", path: ["commercial_vehicle_lanes", "FAST_lanes"] },
];

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(
      { error: "Method not allowed. Use GET or POST." },
      405,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { error: "Missing Supabase environment configuration." },
      500,
    );
  }

  const errors: string[] = [];

  try {
    const { alertSnapshots, feedUpdatedAt, ports, summary } = await fetchAndParseFeed();

    const activePortNumbers = await fetchActivePortNumbers(
      supabaseUrl,
      serviceRoleKey,
    );

    const matchedPorts = ports.filter((port) =>
      activePortNumbers.has(port.portNumber)
    );
    const matchedAlertSnapshots = alertSnapshots.filter((snapshot) =>
      activePortNumbers.has(snapshot.port_number)
    );
    summary.matched = matchedPorts.length;
    summary.skipped.unmapped_port = ports.length - matchedPorts.length;

    const capturedAt = new Date().toISOString();
    const captureMinuteUtc = toUtcMinuteString(capturedAt);

    const existingMinutePortNumbers = await fetchExistingMinutePortNumbers(
      supabaseUrl,
      serviceRoleKey,
      captureMinuteUtc,
    );

    const rowsToInsert = matchedPorts
      .filter((port) => !existingMinutePortNumbers.has(port.portNumber))
      .map((port) => ({
        captured_at: capturedAt,
        feed_updated_at: feedUpdatedAt,
        ped_delay_minutes: port.pedDelayMinutes,
        ped_status: port.pedStatus,
        port_number: port.portNumber,
        port_status: port.portStatus,
        vehicle_delay_minutes: port.vehicleDelayMinutes,
        vehicle_status: port.vehicleStatus,
      }));

    summary.skipped.duplicate_capture_minute =
      matchedPorts.length - rowsToInsert.length;

    const insertedPortNumbers = rowsToInsert.length === 0
      ? []
      : await insertSnapshots(
        supabaseUrl,
        serviceRoleKey,
        rowsToInsert,
      );

    summary.inserted = insertedPortNumbers.length;

    const conflictIgnored = rowsToInsert.length - insertedPortNumbers.length;
    if (conflictIgnored > 0) {
      summary.skipped.duplicate_capture_minute += conflictIgnored;
    }

    const laneRowsToInsert = matchedAlertSnapshots.map((snapshot) => ({
      capture_minute_utc: toUtcMinuteString(snapshot.observed_at),
      crossing_name: snapshot.crossing_name ?? null,
      delay_minutes: snapshot.delay_minutes ?? 0,
      feed_updated_at: feedUpdatedAt,
      lane_type: snapshot.lane_type,
      observed_at: snapshot.observed_at,
      operational_status: snapshot.operational_status ?? null,
      port_name: snapshot.port_name,
      port_number: snapshot.port_number,
      travel_mode: snapshot.travel_mode,
    } satisfies LaneSnapshotInsert));

    if (laneRowsToInsert.length > 0) {
      try {
        await insertLaneSnapshots(
          supabaseUrl,
          serviceRoleKey,
          laneRowsToInsert,
        );
      } catch (error) {
        if (isMissingTableError(error, "port_lane_wait_snapshots")) {
          console.warn("Skipping port_lane_wait_snapshots insert because the table is not available yet.");
        } else {
          throw error;
        }
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    summary.alerts = await evaluateAndTriggerAlerts({
      supabaseAdmin,
      snapshots: matchedAlertSnapshots,
      sendNotification: async (alert, snapshot) => {
        const subscription = await fetchActiveDeviceSubscription(
          supabaseUrl,
          serviceRoleKey,
          alert.installation_id,
        );

        if (!subscription?.fcm_token) {
          return {
            providerError: "No active device subscription found for installation.",
            status: "failed",
          };
        }

        const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
        if (!serviceAccountJson) {
          return {
            providerError: "Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.",
            status: "failed",
          };
        }

        const laneLabel = formatLaneLabel(snapshot.travel_mode, snapshot.lane_type);
        const portLabel = snapshot.crossing_name || snapshot.port_name;
        const delayLabel = snapshot.delay_minutes === 0 ? "No delay" : `${snapshot.delay_minutes} min`;

        try {
          const result = await sendFcmWebPush({
            body: `${portLabel}: ${laneLabel} is now ${delayLabel}.`,
            data: {
              alert_id: alert.id,
              installation_id: alert.installation_id,
              lane_type: snapshot.lane_type,
              link: Deno.env.get("PUBLIC_WEB_URL") || "/",
              port_number: snapshot.port_number,
              threshold_minutes: String(alert.threshold_minutes),
              travel_mode: snapshot.travel_mode,
            },
            serviceAccountJson,
            targetToken: subscription.fcm_token,
            title: "Garita Watch alert",
            webUrl: Deno.env.get("PUBLIC_WEB_URL"),
          });

          return {
            providerMessageId: result.messageId,
            status: "sent",
          };
        } catch (error) {
          const providerError = error instanceof Error ? error.message : String(error);
          if (providerError.includes("UNREGISTERED") || providerError.includes("registration token")) {
            await markDeviceSubscriptionInactive(
              supabaseUrl,
              serviceRoleKey,
              alert.installation_id,
            );
          }

          return {
            providerError,
            status: "failed",
          };
        }
      },
    });

    return json({
      ok: true,
      ...summary,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);
    return json(
      {
        ok: false,
        fetched: 0,
        matched: 0,
        inserted: 0,
        alerts: {
          scannedAlerts: 0,
          matchedAlerts: 0,
          insertedDeliveries: 0,
          updatedAlerts: 0,
          failedAlerts: 0,
          failedReasons: [],
        },
        skipped: {
          non_mexican_border: 0,
          unsupported_wait_data: 0,
          unmapped_port: 0,
          duplicate_capture_minute: 0,
        },
        errors,
      },
      500,
    );
  }
});

async function fetchAndParseFeed(): Promise<{
  alertSnapshots: WaitSnapshot[];
  feedUpdatedAt: string | null;
  ports: ParsedPort[];
  summary: Summary;
}> {
  const response = await fetch(cbpFeedUrl, {
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`CBP feed unavailable (HTTP ${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const xmlRaw = new TextDecoder("iso-8859-1").decode(bytes);
  const parsed = xmlParser.parse(xmlRaw) as {
    border_wait_time?: Record<string, unknown>;
  };

  const root = parsed.border_wait_time;
  if (!root) {
    throw new Error("CBP feed format changed: missing border_wait_time root.");
  }

  const rawPorts = toArray<Record<string, unknown>>(root.port);
  const feedUpdatedAt = parseFeedUpdatedAt(
    stringValue(root.last_updated_date),
    stringValue(root.last_updated_time),
  );
  const observedAt = feedUpdatedAt ?? new Date().toISOString();

  const summary: Summary = {
    errors: [],
    fetched: rawPorts.length,
    inserted: 0,
    matched: 0,
    alerts: {
      scannedAlerts: 0,
      matchedAlerts: 0,
      insertedDeliveries: 0,
      updatedAlerts: 0,
      failedAlerts: 0,
      failedReasons: [],
    },
    skipped: {
      duplicate_capture_minute: 0,
      non_mexican_border: 0,
      unmapped_port: 0,
      unsupported_wait_data: 0,
    },
  };

  const ports: ParsedPort[] = [];
  const alertSnapshots: WaitSnapshot[] = [];

  for (const port of rawPorts) {
    const border = stringValue(port.border);
    if (border !== "Mexican Border") {
      summary.skipped.non_mexican_border += 1;
      continue;
    }

    const portNumber = stringValue(port.port_number);
    const portName = stringValue(port.port_name);
    const crossingName = nullableString(port.crossing_name);
    const portStatus = stringValue(port.port_status);

    const vehicleLane = selectBestLane(port, [
      ["passenger_vehicle_lanes", "standard_lanes"],
      ["passenger_vehicle_lanes", "NEXUS_SENTRI_lanes"],
      ["passenger_vehicle_lanes", "ready_lanes"],
    ]);
    const pedLane = selectBestLane(port, [
      ["pedestrian_lanes", "standard_lanes"],
      ["pedestrian_lanes", "ready_lanes"],
    ]);

    const vehicleStatus = vehicleLane?.status ?? "";
    const vehicleDelayMinutes = vehicleLane?.delayMinutes ?? null;
    const pedStatus = pedLane?.status ?? "";
    const pedDelayMinutes = pedLane?.delayMinutes ?? null;

    if (vehicleDelayMinutes === null && pedDelayMinutes === null) {
      summary.skipped.unsupported_wait_data += 1;
      continue;
    }

    ports.push({
      pedDelayMinutes,
      pedStatus,
      portNumber,
      portStatus,
      vehicleDelayMinutes,
      vehicleStatus,
    });

    alertSnapshots.push(
      ...extractAlertSnapshotsFromPort(
        port,
        { crossingName, observedAt, portName, portNumber },
      ),
    );
  }

  return {
    alertSnapshots,
    feedUpdatedAt,
    ports,
    summary,
  };
}

function extractAlertSnapshotsFromPort(
  port: Record<string, unknown>,
  context: {
    crossingName: string | null;
    observedAt: string;
    portName: string;
    portNumber: string;
  },
): WaitSnapshot[] {
  return alertLaneDefinitions
    .map((definition) => {
      const status = nestedText(port, [...definition.path, "operational_status"]);
      const delayMinutes = usableDelay(
        nestedText(port, [...definition.path, "delay_minutes"]),
        status,
      );

      if (delayMinutes === null) {
        return null;
      }

      return {
        port_number: context.portNumber,
        port_name: context.portName,
        crossing_name: context.crossingName,
        travel_mode: definition.travelMode,
        lane_type: definition.laneType,
        delay_minutes: delayMinutes,
        observed_at: context.observedAt,
        operational_status: status,
      } satisfies WaitSnapshot;
    })
    .filter((snapshot): snapshot is WaitSnapshot => Boolean(snapshot));
}

async function fetchActivePortNumbers(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<Set<string>> {
  const url = new URL(`${supabaseUrl}/rest/v1/ports`);
  url.searchParams.set("select", "port_number");
  url.searchParams.set("is_active", "is.true");

  const rows = await supabaseRequest<Array<{ port_number: string }>>(
    url,
    serviceRoleKey,
  );

  return new Set(rows.map((row) => row.port_number));
}

async function fetchExistingMinutePortNumbers(
  supabaseUrl: string,
  serviceRoleKey: string,
  captureMinuteUtc: string,
): Promise<Set<string>> {
  const url = new URL(`${supabaseUrl}/rest/v1/port_wait_snapshots`);
  url.searchParams.set("select", "port_number");
  url.searchParams.set("capture_minute_utc", `eq.${captureMinuteUtc}`);

  const rows = await supabaseRequest<Array<{ port_number: string }>>(
    url,
    serviceRoleKey,
  );

  return new Set(rows.map((row) => row.port_number));
}

async function fetchActiveDeviceSubscription(
  supabaseUrl: string,
  serviceRoleKey: string,
  installationId: string,
): Promise<{ fcm_token: string | null } | null> {
  const url = new URL(`${supabaseUrl}/rest/v1/device_subscriptions`);
  url.searchParams.set("select", "fcm_token");
  url.searchParams.set("installation_id", `eq.${installationId}`);
  url.searchParams.set("is_active", "is.true");
  url.searchParams.set("limit", "1");

  const rows = await supabaseRequest<Array<{ fcm_token: string | null }>>(
    url,
    serviceRoleKey,
  );

  return rows[0] ?? null;
}

async function markDeviceSubscriptionInactive(
  supabaseUrl: string,
  serviceRoleKey: string,
  installationId: string,
): Promise<void> {
  const url = new URL(`${supabaseUrl}/rest/v1/device_subscriptions`);
  url.searchParams.set("installation_id", `eq.${installationId}`);

  await supabaseRequest<unknown>(
    url,
    serviceRoleKey,
    {
      body: JSON.stringify({
        is_active: false,
        last_seen_at: new Date().toISOString(),
      }),
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      method: "PATCH",
    },
  );
}

function formatLaneLabel(travelMode: TravelMode, laneType: LaneType): string {
  const travelLabels: Record<TravelMode, string> = {
    passenger: "Passenger vehicles",
    pedestrian: "Pedestrians",
    commercial: "Commercial vehicles",
  };

  const laneLabels: Record<LaneType, string> = {
    standard: "Standard",
    ready: "Ready Lane",
    nexus_sentri: "SENTRI/NEXUS",
    fast: "FAST",
  };

  return `${travelLabels[travelMode]} · ${laneLabels[laneType]}`;
}

async function insertSnapshots(
  supabaseUrl: string,
  serviceRoleKey: string,
  rows: SnapshotInsert[],
): Promise<string[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/port_wait_snapshots`);
  url.searchParams.set("on_conflict", "port_number,capture_minute_utc");
  url.searchParams.set("select", "port_number");

  const insertedRows = await supabaseRequest<Array<{ port_number: string }>>(
    url,
    serviceRoleKey,
    {
      body: JSON.stringify(rows),
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      method: "POST",
    },
  );

  return insertedRows.map((row) => row.port_number);
}

async function insertLaneSnapshots(
  supabaseUrl: string,
  serviceRoleKey: string,
  rows: LaneSnapshotInsert[],
): Promise<Array<{ port_number: string; travel_mode: TravelMode; lane_type: LaneType }>> {
  const url = new URL(`${supabaseUrl}/rest/v1/port_lane_wait_snapshots`);
  url.searchParams.set("on_conflict", "port_number,travel_mode,lane_type,capture_minute_utc");
  url.searchParams.set("select", "port_number,travel_mode,lane_type");

  return await supabaseRequest<Array<{ port_number: string; travel_mode: TravelMode; lane_type: LaneType }>>(
    url,
    serviceRoleKey,
    {
      body: JSON.stringify(rows),
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      method: "POST",
    },
  );
}

async function supabaseRequest<T>(
  url: URL,
  serviceRoleKey: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return [] as T;
  }

  return await response.json() as T;
}

function usableDelay(delayText: string, status: string): number | null {
  if (invalidStatuses.has(status)) {
    return null;
  }

  const parsed = Number.parseInt(delayText, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("42P01") || (message.includes(tableName) && message.includes("does not exist"));
}

function selectBestLane(
  port: Record<string, unknown>,
  lanePaths: string[][],
): LaneReading | null {
  const readings = lanePaths
    .map((lanePath, index) => {
      const status = nestedText(port, [...lanePath, "operational_status"]);
      return {
        delayMinutes: usableDelay(
          nestedText(port, [...lanePath, "delay_minutes"]),
          status,
        ),
        priority: index,
        status,
      };
    })
    .filter((reading) => reading.delayMinutes !== null);

  if (readings.length === 0) {
    return null;
  }

  readings.sort((left, right) => {
    const delayCompare = (left.delayMinutes ?? 0) - (right.delayMinutes ?? 0);
    if (delayCompare !== 0) {
      return delayCompare;
    }
    return left.priority - right.priority;
  });

  return readings[0];
}

function nestedText(
  value: Record<string, unknown>,
  path: string[],
): string {
  let cursor: unknown = value;

  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return "";
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return stringValue(cursor);
}

function nullableString(value: unknown): string | null {
  const nextValue = stringValue(value);
  return nextValue === "" || nextValue === "N/A" ? null : nextValue;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value as T];
}

function toUtcMinuteString(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 16) + ":00";
}

function parseFeedUpdatedAt(
  dateText: string,
  timeText: string,
): string | null {
  const dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateText);
  const timeMatch = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(timeText);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const day = Number.parseInt(dateMatch[3], 10);
  const hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2], 10);
  const second = Number.parseInt(timeMatch[3], 10);

  if (
    [year, month, day, hour, minute, second].some((value) =>
      Number.isNaN(value)
    )
  ) {
    return null;
  }

  const easternOffsetMinutes = isEasternDst(year, month, day, hour)
    ? -4 * 60
    : -5 * 60;

  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) -
    easternOffsetMinutes * 60_000;

  return new Date(utcMillis).toISOString();
}

function isEasternDst(
  year: number,
  month: number,
  day: number,
  hour: number,
): boolean {
  if (month < 3 || month > 11) {
    return false;
  }
  if (month > 3 && month < 11) {
    return true;
  }

  const dstStartDay = nthWeekdayOfMonth(year, 2, 0, 2);
  const dstEndDay = nthWeekdayOfMonth(year, 10, 0, 1);

  if (month === 3) {
    if (day > dstStartDay) {
      return true;
    }
    if (day < dstStartDay) {
      return false;
    }
    return hour >= 2;
  }

  if (day < dstEndDay) {
    return true;
  }
  if (day > dstEndDay) {
    return false;
  }
  return hour < 2;
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  occurrence: number,
): number {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const offset = (weekday - firstDay + 7) % 7;
  return 1 + offset + (occurrence - 1) * 7;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: jsonHeaders,
    status,
  });
}
