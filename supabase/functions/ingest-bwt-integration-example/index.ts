import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluateAndTriggerAlerts, type WaitSnapshot } from "../_shared/wait-alerts.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function buildSnapshotsFromNormalizedPayload(payload: unknown): WaitSnapshot[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is WaitSnapshot => {
    if (!row || typeof row !== "object") return false;
    const candidate = row as Record<string, unknown>;
    return typeof candidate.port_number === "string" &&
      typeof candidate.travel_mode === "string" &&
      typeof candidate.lane_type === "string" &&
      typeof candidate.observed_at === "string";
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await request.json();
  const snapshots = buildSnapshotsFromNormalizedPayload(body.snapshots);

  const summary = await evaluateAndTriggerAlerts({
    supabaseAdmin,
    snapshots,
    // TODO: replace this with real web-push / Firebase Cloud Messaging delivery.
    sendNotification: async () => ({ status: "matched" }),
  });

  return Response.json({ ok: true, summary });
});
