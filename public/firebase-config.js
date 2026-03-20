(function (globalScope) {
    const firebaseConfig = {
        apiKey: ["AIzaSyASTc", "nJax2Q5Gxj", "-0TwvillDNtJvWA6PYE"].join(""),
        authDomain: "garita-watch.firebaseapp.com",
        projectId: "garita-watch",
        storageBucket: "garita-watch.firebasestorage.app",
        messagingSenderId: "759390641570",
        appId: "1:759390641570:web:3cd501ad9e34457657a6fb",
        measurementId: "G-W1RJ19593G",
    };

    const webPushVapidKey = [
        "BGgrIzaQEM4jRHJM6AtAzZ2iXMVBmN0tj7FKIj_PHx5augZyfB8HXm3Nxif69D5jF4blXuSQtwj",
        "-n73NXrqgxR8",
    ].join("");

    globalScope.garitaWatchFirebaseConfig = firebaseConfig;
    globalScope.garitaWatchFirebaseWebPushVapidKey = webPushVapidKey;
})(typeof self !== "undefined" ? self : window);
