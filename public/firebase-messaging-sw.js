importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js");
importScripts("/firebase-config.js");

firebase.initializeApp(self.garitaWatchFirebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || "Garita Watch alert";
    const body = notification.body || "A wait-time alert was triggered.";
    const link = data.link || "/";

    self.registration.showNotification(title, {
        badge: "/favicon.ico",
        body,
        data: { link },
        icon: "/favicon.ico",
        tag: data.alert_id || "garita-watch-alert",
    });
});

self.addEventListener("notificationclick", (event) => {
    const targetLink = event.notification?.data?.link || "/";
    event.notification.close();

    event.waitUntil((async () => {
        const windowClients = await clients.matchAll({ includeUncontrolled: true, type: "window" });
        const absoluteTarget = new URL(targetLink, self.location.origin).href;

        for (const client of windowClients) {
            if (client.url === absoluteTarget && "focus" in client) {
                return client.focus();
            }
        }

        if (clients.openWindow) {
            return clients.openWindow(absoluteTarget);
        }
    })());
});
