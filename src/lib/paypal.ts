/**
 * PayPal REST helpers for Sandbox Orders v2 + Payouts.
 * Prefer api-m.sandbox.paypal.com; fall back gracefully when creds missing (demo mode).
 */

export type PayPalMode = "sandbox" | "live" | "demo";

export function getPayPalMode(): PayPalMode {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret || id.includes("your_") || secret.includes("your_")) {
    return "demo";
  }
  return (process.env.PAYPAL_MODE || "sandbox") === "live" ? "live" : "sandbox";
}

export function getPayPalBaseUrl(mode: PayPalMode = getPayPalMode()): string {
  if (mode === "live") return "https://api-m.paypal.com";
  return "https://api-m.sandbox.paypal.com";
}

export function getPublicClientId(): string | null {
  return (
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENT_ID ||
    null
  );
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const mode = getPayPalMode();
  if (mode === "demo") {
    throw new Error("PayPal credentials not configured (demo mode).");
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID!;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${getPayPalBaseUrl(mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function paypalFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const mode = getPayPalMode();
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBaseUrl(mode)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `PayPal ${path} failed (${res.status}): ${typeof json === "object" ? JSON.stringify(json) : text}`
    );
  }
  return json as T;
}

export type CreatedOrder = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  demo?: boolean;
};

export async function createOrder(params: {
  amount: number;
  currency: string;
  description: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<CreatedOrder> {
  const mode = getPayPalMode();
  const value = params.amount.toFixed(2);

  if (mode === "demo") {
    return {
      id: `DEMO-ORDER-${params.customId.slice(0, 8)}`,
      status: "CREATED",
      demo: true,
      links: [
        {
          rel: "approve",
          href: params.returnUrl.includes("?")
            ? `${params.returnUrl}&token=DEMO-ORDER-${params.customId.slice(0, 8)}&demo=1`
            : `${params.returnUrl}?token=DEMO-ORDER-${params.customId.slice(0, 8)}&demo=1`,
        },
      ],
    };
  }

  return paypalFetch<CreatedOrder>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.customId,
          custom_id: params.customId,
          description: params.description.slice(0, 127),
          amount: {
            currency_code: params.currency,
            value,
          },
        },
      ],
      application_context: {
        brand_name: "JobProof Pay Agent",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });
}

export async function captureOrder(orderId: string): Promise<{
  id: string;
  status: string;
  captureId?: string;
  demo?: boolean;
  raw?: unknown;
}> {
  const mode = getPayPalMode();
  if (mode === "demo" || orderId.startsWith("DEMO-")) {
    return {
      id: orderId,
      status: "COMPLETED",
      captureId: `DEMO-CAPTURE-${Date.now()}`,
      demo: true,
    };
  }

  const data = await paypalFetch<{
    id: string;
    status: string;
    purchase_units?: {
      payments?: { captures?: { id: string; status: string }[] };
    }[];
  }>(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", body: "{}" });

  const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  return {
    id: data.id,
    status: data.status,
    captureId,
    raw: data,
  };
}

export async function createPayout(params: {
  email: string;
  amount: number;
  currency: string;
  note: string;
  senderItemId: string;
}): Promise<{ batchId: string; status: string; demo?: boolean; raw?: unknown }> {
  const mode = getPayPalMode();
  const value = params.amount.toFixed(2);

  if (mode === "demo") {
    return {
      batchId: `DEMO-PAYOUT-${params.senderItemId.slice(0, 8)}`,
      status: "PENDING",
      demo: true,
    };
  }

  const data = await paypalFetch<{
    batch_header?: { payout_batch_id: string; batch_status: string };
  }>("/v1/payments/payouts", {
    method: "POST",
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `jp-${params.senderItemId}-${Date.now()}`.slice(0, 50),
        email_subject: "JobProof Pay Agent payout",
        email_message: params.note,
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value, currency: params.currency },
          receiver: params.email,
          note: params.note.slice(0, 400),
          sender_item_id: params.senderItemId.slice(0, 30),
        },
      ],
    }),
  });

  return {
    batchId: data.batch_header?.payout_batch_id || "unknown",
    status: data.batch_header?.batch_status || "UNKNOWN",
    raw: data,
  };
}
