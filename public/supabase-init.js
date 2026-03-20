import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://ymlunuhplrcdemewtyxf.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbHVudWhwbHJjZGVtZXd0eXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDUxNzgsImV4cCI6MjA4NzQ4MTE3OH0.53eYzkPUVy26rDfsIhuew34MzBRMSiAi1LwX5ku-PEo";
const installationStorageKey = "garitaWatchInstallationId";

function getInstallationId() {
    try {
        const existingId = localStorage.getItem(installationStorageKey);
        if (existingId) {
            return existingId;
        }

        const nextId = crypto.randomUUID();
        localStorage.setItem(installationStorageKey, nextId);
        return nextId;
    } catch (error) {
        console.warn("Unable to persist Garita Watch installation ID:", error);
        return crypto.randomUUID();
    }
}

const installationId = getInstallationId();

// This key is intentionally the public anon key. Any real data protection must
// come from Row Level Security policies and server-side authorization checks.
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
    global: {
        headers: {
            "x-installation-id": installationId,
        },
    },
});

window.garitaWatchSupabase = supabase;
window.garitaWatchSupabaseConfig = {
    url: supabaseUrl,
    projectRef: "ymlunuhplrcdemewtyxf",
};
window.garitaWatchInstallationId = installationId;

window.dispatchEvent(new CustomEvent("garitaWatchSupabaseReady", {
    detail: {
        installationId,
        projectRef: "ymlunuhplrcdemewtyxf",
    },
}));
