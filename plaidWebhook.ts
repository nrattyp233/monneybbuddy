// Supabase Edge Function: plaidWebhook.ts
// This function handles Plaid webhook events.
// Deploy this to Supabase Edge Functions and set its public URL as your Plaid webhook endpoint.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let event;
  try {
    event = await req.json();
  } catch (err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Log the event for debugging
  console.log("Plaid Webhook Event:", event);

  // TODO: Add your business logic here
  // For example, update Supabase tables based on event type
  // Example: if (event.webhook_type === "TRANSACTIONS") { ... }

  return new Response("Webhook received", { status: 200 });
});
