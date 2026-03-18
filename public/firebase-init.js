import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import { deleteToken, getMessaging, getToken, isSupported as isMessagingSupported } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyASTcnJax2Q5Gxj-0TwvillDNtJvWA6PYE",
    authDomain: "garita-watch.firebaseapp.com",
    projectId: "garita-watch",
    storageBucket: "garita-watch.firebasestorage.app",
    messagingSenderId: "759390641570",
    appId: "1:759390641570:web:3cd501ad9e34457657a6fb",
    measurementId: "G-W1RJ19593G"
};

const webPushVapidKey = "BGgrIzaQEM4jRHJM6AtAzZ2iXMVBmN0tj7FKIj_PHx5augZyfB8HXm3Nxif69D5jF4blXuSQtwj-n73NXrqgxR8";

const app = initializeApp(firebaseConfig);
let analytics = null;
let messaging = null;

isAnalyticsSupported()
    .then((supported) => {
        if (!supported) return;
        analytics = getAnalytics(app);
        window.garitaWatchFirebase = { app, analytics };
    })
    .catch((error) => {
        console.warn("Firebase Analytics initialization skipped:", error);
        window.garitaWatchFirebase = { app };
    });

function hasBrowserPushSupport() {
    return Boolean(window.isSecureContext && "Notification" in window && "serviceWorker" in navigator);
}

function hasConfiguredVapidKey() {
    return Boolean(webPushVapidKey && !webPushVapidKey.includes("REPLACE_WITH"));
}

async function ensureMessaging() {
    if (!hasBrowserPushSupport()) {
        throw new Error("Push notifications are not supported in this browser.");
    }

    const supported = await isMessagingSupported();
    if (!supported) {
        throw new Error("Firebase Messaging is not supported in this browser.");
    }

    if (!messaging) {
        messaging = getMessaging(app);
    }

    return messaging;
}

function getSupabaseContext() {
    const supabase = window.garitaWatchSupabase;
    const installationId = window.garitaWatchInstallationId;

    if (!supabase || !installationId) {
        throw new Error("Supabase is not ready yet.");
    }

    return { installationId, supabase };
}

async function registerServiceWorker() {
    return await navigator.serviceWorker.register("/firebase-messaging-sw.js");
}

async function upsertDeviceSubscription({ token, locale, permission }) {
    const { installationId, supabase } = getSupabaseContext();
    const payload = {
        installation_id: installationId,
        fcm_token: token,
        platform: "web",
        locale,
        user_agent: navigator.userAgent,
        notification_permission: permission,
        is_active: true,
        last_seen_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from("device_subscriptions")
        .upsert(payload, { onConflict: "installation_id" })
        .select("id, installation_id, fcm_token, is_active, notification_permission, updated_at")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function deactivateDeviceSubscription(permission = Notification.permission || "default") {
    const { installationId, supabase } = getSupabaseContext();

    const { error } = await supabase
        .from("device_subscriptions")
        .update({
            is_active: false,
            notification_permission: permission,
            last_seen_at: new Date().toISOString(),
        })
        .eq("installation_id", installationId);

    if (error && error.code !== "PGRST116") {
        throw error;
    }
}

async function syncPushState() {
    const state = {
        configured: hasConfiguredVapidKey(),
        permission: hasBrowserPushSupport() ? Notification.permission : "unsupported",
        registered: false,
        subscription: null,
        supported: hasBrowserPushSupport(),
    };

    if (!state.supported) {
        return state;
    }

    try {
        const { installationId, supabase } = getSupabaseContext();
        const { data, error } = await supabase
            .from("device_subscriptions")
            .select("id, installation_id, fcm_token, is_active, notification_permission, updated_at")
            .eq("installation_id", installationId)
            .limit(1)
            .maybeSingle();

        if (error && error.code !== "PGRST116") {
            throw error;
        }

        if (data?.is_active) {
            state.registered = true;
            state.subscription = data;
        }
    } catch (error) {
        console.warn("Unable to sync push state:", error);
    }

    return state;
}

async function requestAndRegisterPush({ locale }) {
    if (!hasConfiguredVapidKey()) {
        throw new Error("Firebase Web Push VAPID key is not configured.");
    }

    if (!hasBrowserPushSupport()) {
        throw new Error("Push notifications are not supported in this browser.");
    }

    if (Notification.permission === "denied") {
        throw new Error("Notifications are blocked in this browser.");
    }

    const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (permission !== "granted") {
        throw new Error(permission === "denied"
            ? "Notifications are blocked in this browser."
            : "Notification permission was dismissed.");
    }

    const messagingClient = await ensureMessaging();
    const registration = await registerServiceWorker();
    const token = await getToken(messagingClient, {
        serviceWorkerRegistration: registration,
        vapidKey: webPushVapidKey,
    });

    if (!token) {
        throw new Error("Firebase Messaging did not return a device token.");
    }

    const subscription = await upsertDeviceSubscription({
        locale: locale || document.documentElement.lang || "en",
        permission,
        token,
    });

    return {
        permission,
        registered: true,
        subscription,
        token,
    };
}

async function disablePush() {
    if (!hasBrowserPushSupport()) {
        return { registered: false };
    }

    try {
        const supported = await isMessagingSupported();
        if (supported) {
            const messagingClient = await ensureMessaging();
            await deleteToken(messagingClient);
        }
    } catch (error) {
        console.warn("Unable to delete Firebase Messaging token:", error);
    }

    await deactivateDeviceSubscription(Notification.permission || "default");

    return {
        permission: Notification.permission || "default",
        registered: false,
    };
}

window.garitaWatchFirebase = { app, analytics };
window.garitaWatchPush = {
    disablePush,
    hasBrowserPushSupport,
    hasConfiguredVapidKey,
    requestAndRegisterPush,
    syncPushState,
};

window.dispatchEvent(new CustomEvent("garitaWatchPushReady", {
    detail: {
        configured: hasConfiguredVapidKey(),
        supported: hasBrowserPushSupport(),
    },
}));
