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
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'production';
// Normalize allowed origin (strip trailing slash) to avoid mismatch with incoming Origin header
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' 
  ? RAW_ALLOWED_ORIGIN.slice(0, -1) 
  : RAW_ALLOWED_ORIGIN;

const PLAID_BASE = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com'
}[PLAID_ENV as 'sandbox' | 'development' | 'production'] || 'https://production.plaid.com';

function buildCors(originHeader: string | null) {
  let allowOrigin = NORMALIZED_ALLOWED_ORIGIN;
  if (NORMALIZED_ALLOWED_ORIGIN !== '*' && originHeader) {
    const normalizedIncoming = originHeader.endsWith('/') ? originHeader.slice(0, -1) : originHeader;
    if (normalizedIncoming === NORMALIZED_ALLOWED_ORIGIN) {
      allowOrigin = normalizedIncoming; // echo back exact
    }
    // Allow any Netlify deploy preview URL for moneybuddygeo
    else if (normalizedIncoming.includes('moneybuddygeo.netlify.app')) {
      allowOrigin = normalizedIncoming;
    }
    // Allow localhost for development
    else if (normalizedIncoming.includes('localhost') || normalizedIncoming.includes('127.0.0.1')) {
      allowOrigin = normalizedIncoming;
    }
    // Not allowed origin -> will still return configured origin (prevents leaking wildcard)
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
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Plaid credentials not configured on server.',
      needsServerConfig: true,
      guidance: 'Add PLAID_CLIENT_ID and PLAID_SECRET as project secrets in Supabase.'
    }), {
      status: 200,
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
      client_name: `MoneyBuddy-${clientUserId.slice(-8)}`, // User-specific client name
      language: 'en',
      country_codes: ['US'],
      user: { client_user_id: clientUserId },
      products: ['auth', 'transactions']  // Reduced products for production compatibility
    };

    console.log(`🔄 Creating Plaid link token for user ${clientUserId} in ${PLAID_ENV} environment`);

    const plaidRes = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!plaidRes.ok) {
      const text = await plaidRes.text();
      console.error('❌ Plaid link/token error:', { 
        status: plaidRes.status, 
        statusText: plaidRes.statusText,
        body: text,
        environment: PLAID_ENV,
        endpoint: `${PLAID_BASE}/link/token/create`
      });
      
      let guidance = 'Check server configuration and Plaid credentials.';
      
      try {
        const errJson = JSON.parse(text);
        if (errJson.error_code) {
          console.error(`🔍 Plaid error details:`, errJson);
          
          switch (errJson.error_code) {
            case 'INVALID_CLIENT_ID':
              guidance = 'PLAID_CLIENT_ID is invalid or not set correctly.';
              break;
            case 'INVALID_SECRET':
              guidance = 'PLAID_SECRET is invalid or not set correctly.';
              break;
            case 'INVALID_PRODUCT':
              guidance = 'One or more requested products are not enabled for this client.';
              break;
            case 'ITEM_NOT_SUPPORTED':
              guidance = 'This environment or client configuration is not supported.';
              break;
            default:
              guidance = `Plaid error: ${errJson.error_message || errJson.error_code}`;
          }
        }
      } catch {
        // Failed to parse error, use generic guidance
      }
      
      const payload: Record<string, unknown> = {
        success: false,
        error: 'Failed to create Plaid link token',
        plaidStatus: plaidRes.status,
        plaidEnvironment: PLAID_ENV,
        details: text,
        guidance
      };
      
      if (plaidRes.status === 400 || plaidRes.status === 401 || plaidRes.status === 403) {
        payload.needsServerConfig = true;
      }
      
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    const data = await plaidRes.json() as PlaidLinkTokenCreateResponse;
    
    console.log(`✅ Successfully created Plaid link token in ${PLAID_ENV} environment`);
    
    return new Response(JSON.stringify({ 
      link_token: data.link_token, 
      expiration: data.expiration,
      environment: PLAID_ENV 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  } catch (e) {
    console.error('❌ Unhandled error creating link token:', e);
    
    // Enhanced error details for debugging
    const errorDetails = {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      plaidEnvironment: PLAID_ENV,
      plaidBase: PLAID_BASE,
      timestamp: new Date().toISOString()
    };
    
    console.error('🔍 Error details:', errorDetails);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Server exception creating link token', 
      details: errorDetails.message,
      canRetry: true,
      guidance: 'Please try again. If the issue persists, check server configuration.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});
