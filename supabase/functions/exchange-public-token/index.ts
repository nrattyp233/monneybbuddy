// Supabase Edge Function: exchange-public-token
// Exchanges a Plaid public_token for an access_token and (optionally) stores account metadata.
// Required Supabase secrets: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, ALLOWED_ORIGIN
// You should persist the access_token securely (e.g., in a table with RLS so only the user can access).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface ExchangeRequest {
  public_token: string;
}

interface ExchangeResponse {
  access_token: string;
  item_id: string;
}

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';

const PLAID_BASE = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com'
}[PLAID_ENV as 'sandbox' | 'development' | 'production'] || 'https://sandbox.plaid.com';

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(ALLOWED_ORIGIN) });
  }

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    return new Response(JSON.stringify({ error: 'Plaid credentials not configured on server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(ALLOWED_ORIGIN) }
    });
  }

  try {
    const body: ExchangeRequest = await req.json();

    // Derive user identity (if authenticated) for future persistence logic
    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payloadRaw = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadRaw);
          if (payload.sub && typeof payload.sub === 'string') {
            userId = payload.sub;
          }
        } catch (e) {
          console.warn('Could not parse JWT payload for user id:', e);
        }
      }
    }
    if (!body.public_token) {
      return new Response(JSON.stringify({ error: 'public_token missing' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(ALLOWED_ORIGIN) }
      });
    }

    const exchangeRes = await fetch(`${PLAID_BASE}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token: body.public_token
      })
    });

    if (!exchangeRes.ok) {
      const text = await exchangeRes.text();
      console.error('Plaid exchange error:', { status: exchangeRes.status, body: text });
      return new Response(JSON.stringify({ error: 'Failed to exchange public token', status: exchangeRes.status, details: text }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(ALLOWED_ORIGIN) }
      });
    }

    const data = await exchangeRes.json() as ExchangeResponse;

    // TODO: Persist data.access_token (and optionally accounts) with userId.
    // Example (pseudo):
    // await supabaseAdmin.from('plaid_items').insert({ user_id: userId, item_id: data.item_id, access_token: encryptedToken })

    return new Response(JSON.stringify({ success: true, item_id: data.item_id, user_id: userId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(ALLOWED_ORIGIN) }
    });
  } catch (e) {
    console.error('Unhandled error exchanging public token:', e);
    return new Response(JSON.stringify({ error: 'Server exception exchanging public token', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(ALLOWED_ORIGIN) }
    });
  }
});
