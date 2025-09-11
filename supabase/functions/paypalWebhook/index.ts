// Supabase Edge Function: paypalWebhook
// Deploy with: supabase functions deploy paypalWebhook
// Use this URL as your PayPal Webhook endpoint (Sandbox/Live accordingly):
// https://<project-ref>.functions.supabase.co/paypalWebhook

import http from "http";
import { createClient } from "@supabase/supabase-js";

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  // Capture PayPal verification headers (used for signature verification)
  const headers = req.headers;
  const transmissionId = headers["paypal-transmission-id"] ?? null;
  const transmissionTime = headers["paypal-transmission-time"] ?? null;
  const transmissionSig = headers["paypal-transmission-sig"] ?? null;
  const certUrl = headers["paypal-cert-url"] ?? null;
  const authAlgo = headers["paypal-auth-algo"] ?? null;
  // Prefer configured webhook ID from env over header
  const ENV = (globalThis as any).Deno?.env.get("PAYPAL_ENV") ?? "sandbox"; // sandbox | live
  const WEBHOOK_ID = (globalThis as any).Deno?.env.get("PAYPAL_WEBHOOK_ID") ?? headers["webhook-id"] ?? null;
  const CLIENT_ID = (globalThis as any).Deno?.env.get("PAYPAL_CLIENT_ID") ?? null;
  const CLIENT_SECRET = (globalThis as any).Deno?.env.get("PAYPAL_CLIENT_SECRET") ?? null;
  interface PayPalWebhookEvent {
    event_type?: string;
    resource?: { id?: string };
    [key: string]: any;
  }
  let event: PayPalWebhookEvent;
  try {
    const buffers: Buffer[] = [];
    for await (const chunk of req) {
      buffers.push(chunk as Buffer);
    }
    const body = Buffer.concat(buffers).toString();
    event = JSON.parse(body) as PayPalWebhookEvent;
  } catch (_err) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid JSON");
    return;
  }

  const eventType = event?.event_type ?? "UNKNOWN";
  const resourceId = event?.resource?.id ?? null;

  console.log("PayPal Webhook Event:", {
    eventType,
    resourceId,
    transmissionId,
    transmissionTime,
  });

  // Verify signature (recommended):
  // docs: https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post
  // Requires PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID secrets
  if (CLIENT_ID && CLIENT_SECRET && WEBHOOK_ID && transmissionId && transmissionTime && transmissionSig && certUrl && authAlgo) {
    try {
      const base = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      // 1) Get OAuth access token
      const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (!tokenRes.ok) {
        console.error("PayPal OAuth failed", await tokenRes.text());
        return new Response("Unauthorized", { status: 401 });
      }
      const { access_token } = await tokenRes.json();

      // 2) Verify signature
      const verifyBody = {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: WEBHOOK_ID,
        webhook_event: event,
      };
      const verifyRes = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(verifyBody),
      });
      const verifyJson = await verifyRes.json();
      if (verifyJson?.verification_status !== "SUCCESS") {
        console.warn("PayPal signature verification failed", verifyJson);
        return new Response("Invalid signature", { status: 400 });
      }
    } catch (e) {
      console.error("Error verifying PayPal signature:", e);
      return new Response("Verification error", { status: 500 });
    }
  } else {
    console.warn("Skipping signature verification due to missing headers or secrets");
  }

  // Optional: Log to Supabase for auditing
  try {
    const SUPABASE_URL = (globalThis as any).Deno?.env.get("SUPABASE_URL") ?? undefined;
    const SUPABASE_SERVICE_ROLE_KEY = (globalThis as any).Deno?.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? undefined;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await supabase.from("paypal_webhook_events").insert({
        event_type: eventType,
        resource_id: resourceId,
        payload: event,
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        transmission_sig: transmissionSig,
        cert_url: certUrl,
        auth_algo: authAlgo,
        webhook_id: WEBHOOK_ID,
      });
    }
  } catch (e) {
    console.error("Failed to log PayPal webhook to Supabase:", e);
  }

  // Minimal routing examples
  switch (eventType) {
    case "CHECKOUT.ORDER.APPROVED":
      // Handle checkout approved events
      break;
    case "PAYMENT.CAPTURE.COMPLETED":
      // Handle successful captures
      break;
    // Handle failures/refunds
    default:
      // No-op for unhandled events
      break;
  }

  return new Response("OK", { status: 200 });
});

//# sourceMappingURL=paypalWebhook.js.map
