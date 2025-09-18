// Supabase Edge Function: create-link-token
// Description: Creates a Plaid link token for the frontend to initialize Plaid Link.
// Requirements:
//   Supabase secrets set:
//     PLAID_CLIENT_ID
//     PLAID_SECRET
//     PLAID_ENV (e.g. 'sandbox' | 'development' | 'production')
//     ALLOWED_ORIGIN (frontend origin for CORS)
//
// Invoke from client:
//   const { data, error } = await supabase.functions.invoke('create-link-token');
//   data = { link_token: string }
//
// NOTE: Replace fetch-based Plaid client with official SDK if desired.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface PlaidLinkTokenCreateRequest {
  client_id: string;
  secret: string;
  client_name: string;
  language: string;
  country_codes: string[];
  user: { client_user_id: string };
  products: string[];
  redirect_uri?: string;
}

interface PlaidLinkTokenCreateResponse {
  link_token: string;
  expiration: string;
}

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';
// Normalize allowed origin (strip trailing slash) to avoid mismatch with incoming Origin header
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' 
  ? RAW_ALLOWED_ORIGIN.slice(0, -1) 
  : RAW_ALLOWED_ORIGIN;

const PLAID_BASE = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com'
}[PLAID_ENV as 'sandbox' | 'development' | 'production'] || 'https://sandbox.plaid.com';

function buildCors(originHeader: string | null) {
  let allowOrigin = NORMALIZED_ALLOWED_ORIGIN;
  if (NORMALIZED_ALLOWED_ORIGIN !== '*' && originHeader) {
    const normalizedIncoming = originHeader.endsWith('/') ? originHeader.slice(0, -1) : originHeader;
    if (normalizedIncoming === NORMALIZED_ALLOWED_ORIGIN) {
      allowOrigin = normalizedIncoming; // echo back exact
    } else {
      // Not allowed origin -> will still return configured origin (prevents leaking wildcard)
    }
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}

serve(async (req) => {
  const originHeader = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCors(originHeader) });
  }

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    return new Response(JSON.stringify({ error: 'Plaid credentials not configured on server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  try {
    // Derive a stable user id from the authenticated JWT if provided via Authorization header.
    let clientUserId = crypto.randomUUID();
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payloadRaw = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadRaw);
          if (payload.sub && typeof payload.sub === 'string') {
            clientUserId = payload.sub;
          }
        } catch (e) {
          console.warn('Could not parse JWT payload for user id:', e);
        }
      }
    }

    const payload: PlaidLinkTokenCreateRequest = {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      client_name: 'MoneyBuddy',
      language: 'en',
      country_codes: ['US'],
      user: { client_user_id: clientUserId },
      products: ['auth', 'transactions', 'accounts']
    };

    const plaidRes = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!plaidRes.ok) {
      const text = await plaidRes.text();
      console.error('Plaid link/token error:', { status: plaidRes.status, body: text });
      return new Response(JSON.stringify({ error: 'Failed to create link token', status: plaidRes.status, details: text }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    const data = await plaidRes.json() as PlaidLinkTokenCreateResponse;
    return new Response(JSON.stringify({ link_token: data.link_token, expiration: data.expiration }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  } catch (e) {
    console.error('Unhandled error creating link token:', e);
    return new Response(JSON.stringify({ error: 'Server exception creating link token', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});
