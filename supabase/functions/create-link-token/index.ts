import { corsHeaders } from "../_shared/cors.ts";

export default async function handler(req: Request) {
  // Always set CORS headers for every response
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Get Plaid credentials from environment
  const PLAID_CLIENT_ID = globalThis?.PLAID_CLIENT_ID ?? undefined;
  const PLAID_SECRET = globalThis?.PLAID_SECRET ?? undefined;
  const PLAID_ENV = "production";

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      return new Response(
        JSON.stringify({ error: "Plaid credentials are not set in Supabase secrets." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare request to Plaid
    const plaidUrl = `https://${PLAID_ENV}.plaid.com/link/token/create`;
    const body = {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      client_name: "MoneyBuddy",
      language: "en",
      country_codes: ["US"],
      user: { client_user_id: "anonymous-user" },
      products: ["auth", "transactions"]
    };

    const plaidRes = await fetch(plaidUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const plaidData = await plaidRes.json();

    if (!plaidRes.ok || !plaidData.link_token) {
      return new Response(
        JSON.stringify({ error: plaidData.error_message || "Failed to create Plaid link token." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ link_token: plaidData.link_token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
