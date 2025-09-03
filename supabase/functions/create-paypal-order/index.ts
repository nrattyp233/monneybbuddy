import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { amount, fee, recipient_email, description } = await req.json();
    // Stubbed response — replace with real PayPal order creation
    const orderId = `TEST-ORDER-${Date.now()}`;
    const approval_url = `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`;
    return new Response(JSON.stringify({ orderId, approval_url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
