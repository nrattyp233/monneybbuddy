// Supabase Edge Function: plaidWebhook
// Deploy with: supabase functions deploy plaidWebhook
// Then set your Plaid webhook URL to:
// https://<project-ref>.functions.supabase.co/plaidWebhook



import { createClient } from "npm:@supabase/supabase-js";

export default async function handler(req: Request) {
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

  // Optionally log to Supabase if service role is configured
  try {
    const SUPABASE_URL = globalThis?.SUPABASE_URL ?? undefined;
    const SUPABASE_SERVICE_ROLE_KEY = globalThis?.SUPABASE_SERVICE_ROLE_KEY ?? undefined;
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
    }
  } catch (e) {
    console.error("Failed to log webhook to Supabase:", e);
  }

  // Branch for common webhook types
  switch (webhook_type) {
    case "TRANSACTIONS":
      // Trigger background sync here if needed
      break;
    case "ITEM":
      // Handle item-level updates if needed
      break;
    default:
      break;
  }

  return new Response("Webhook received", { status: 200 });
}

