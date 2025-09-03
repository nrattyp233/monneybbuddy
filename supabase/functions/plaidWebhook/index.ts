// Supabase Edge Function: plaidWebhook
// Deploy with: supabase functions deploy plaidWebhook
// Then set your Plaid webhook URL to:
// https://<project-ref>.functions.supabase.co/plaidWebhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let event: any;
  try {
    event = await req.json();
  } catch (_err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const webhook_type = event?.webhook_type ?? "UNKNOWN";
  const webhook_code = event?.webhook_code ?? "UNKNOWN";
  const item_id = event?.item_id ?? null;

  console.log("Plaid Webhook Event:", { webhook_type, webhook_code, item_id });

  // Optionally log to Supabase if service role is configured
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await supabase.from("plaid_webhook_events").insert({
        webhook_type,
        webhook_code,
        item_id,
        payload: event,
      });
    } else {
      console.warn("Supabase service role env vars not set; skipping DB log.");
    }
  } catch (e) {
    console.error("Failed to log webhook to Supabase:", e);
  }

  // Basic branching for common webhook types (extend as needed)
  switch (webhook_type) {
    case "TRANSACTIONS":
      // You could trigger a background sync here
      break;
    case "ITEM":
      // Handle item-level updates if needed
      break;
    default:
      // No-op for unhandled types
      break;
  }

  return new Response("Webhook received", { status: 200 });
});
