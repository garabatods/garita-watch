type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

function toBase64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

async function createSignedJwt(serviceAccount: FirebaseServiceAccount): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    exp: issuedAt + 3600,
    iat: issuedAt,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${toBase64Url(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<{ accessToken: string; projectId: string }> {
  const serviceAccount = JSON.parse(serviceAccountJson) as FirebaseServiceAccount;
  if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON configuration.");
  }

  const assertion = await createSignedJwt(serviceAccount);
  const tokenResponse = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to obtain Google access token (HTTP ${tokenResponse.status}).`);
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error("Google access token response did not include access_token.");
  }

  return {
    accessToken: tokenPayload.access_token,
    projectId: serviceAccount.project_id,
  };
}

export async function sendFcmWebPush({
  body,
  data = {},
  serviceAccountJson,
  targetToken,
  title,
  webUrl,
}: {
  body: string;
  data?: Record<string, string>;
  serviceAccountJson: string;
  targetToken: string;
  title: string;
  webUrl?: string;
}): Promise<{ messageId: string | null }> {
  const { accessToken, projectId } = await getGoogleAccessToken(serviceAccountJson);

  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        data,
        notification: { title, body },
        token: targetToken,
        webpush: {
          fcm_options: webUrl ? { link: webUrl } : undefined,
          notification: {
            badge: "/favicon.ico",
            body,
            icon: "/favicon.ico",
            tag: data.alert_id || "garita-watch-alert",
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FCM request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json() as { name?: string };
  return {
    messageId: payload.name ?? null,
  };
}
