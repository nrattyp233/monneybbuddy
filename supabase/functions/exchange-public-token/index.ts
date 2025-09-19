// Supabase Edge Function: exchange-public-token
// Exchanges a Plaid public_token for an access_token and (optionally) stores account metadata.
// Required Supabase secrets: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, ALLOWED_ORIGIN
// You should persist the access_token securely (e.g., in a table with RLS so only the user can access).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Use existing Supabase service role & URL secrets (already configured) for authentication.
// Production: implement pgcrypto-based encryption for access tokens stored in access_token_enc column.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

interface ExchangeRequest {
  public_token: string;
}

interface ExchangeResponse { access_token: string; item_id: string; }

interface PlaidAccountsGetResponse {
  accounts: Array<{
    account_id: string;
    name: string;
    official_name?: string;
    type: string;
    subtype?: string;
    balances: { available: number | null; current: number | null; iso_currency_code?: string };
  }>;
  item: { item_id: string };
  request_id: string;
}

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'production';
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' ? RAW_ALLOWED_ORIGIN.slice(0, -1) : RAW_ALLOWED_ORIGIN;

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
      allowOrigin = normalizedIncoming;
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
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Plaid credentials not configured on server.',
      needsServerConfig: true,
      guidance: 'Add PLAID_CLIENT_ID and PLAID_SECRET as Supabase project secrets.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
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
            console.log(`🔑 Exchange function: Extracted user ID from JWT: ${userId}`);
          }
        } catch (e) {
          console.warn('Could not parse JWT payload for user id:', e);
        }
      }
    }
    
    if (!userId) {
      console.error('❌ Exchange function: No user ID found in request');
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: buildCors(originHeader)
      });
    }
    if (!body.public_token) {
      return new Response(JSON.stringify({ error: 'public_token missing' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
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
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to exchange public token', 
        plaidStatus: exchangeRes.status, 
        details: text,
        needsReconnection: exchangeRes.status === 401 || exchangeRes.status === 403
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    const exchangeData = await exchangeRes.json() as ExchangeResponse;

    // ---- Fetch accounts from Plaid ----
    const accountsRes = await fetch(`${PLAID_BASE}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: exchangeData.access_token,
      })
    });

    if (!accountsRes.ok) {
      const aText = await accountsRes.text();
      console.error('Plaid accounts/get error:', { status: accountsRes.status, body: aText });
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to fetch accounts', 
        plaidStatus: accountsRes.status, 
        details: aText,
        needsReconnection: accountsRes.status === 401 || accountsRes.status === 403
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    const accountsData = await accountsRes.json() as PlaidAccountsGetResponse;
    
    console.log(`📊 Fetched ${accountsData.accounts.length} accounts from Plaid for user: ${userId}`);

    // ---- Map Plaid accounts to internal representation ----
    const mappedAccounts = accountsData.accounts.map(a => ({
      // Proposed table columns for a future migration:
      plaid_account_id: a.account_id,
      user_id: userId,
      name: a.official_name || a.name,
      provider: 'Plaid',
      type: a.subtype || a.type,
      balance: a.balances.current,
      currency: a.balances.iso_currency_code || 'USD'
    }));

    // ---- Persistence (raw token temporary) ----
    let persisted = false;
    if (!supabaseAdmin) {
      console.warn('Supabase admin client not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    } else if (!userId) {
      console.warn('No authenticated user id; skipping persistence');
    } else {
      try {
        console.log(`Persisting ${mappedAccounts.length} accounts for user ${userId}`); // Debug logging
        
        // Upsert plaid_items (store token raw for now)
        let itemStored = false;
        const { error: itemErr } = await supabaseAdmin.from('plaid_items').upsert({
          user_id: userId,
          item_id: exchangeData.item_id,
          access_token_enc: exchangeData.access_token
        });
        if (itemErr) {
          const msg = itemErr.message || '';
          // Skip fatal only if schema not ready; continue with accounts so UI still works
          if (msg.includes('access_token_enc') || msg.includes('plaid_items')) {
            console.warn('Skipping plaid_items store (schema missing):', msg);
          } else {
            throw itemErr;
          }
        } else {
          itemStored = true;
          console.log('Successfully stored plaid_items record');
        }

        // Upsert each account into plaid_accounts with raw JSON and ensure an accounts row exists (generating UUID if needed)
        for (const a of accountsData.accounts) {
          const mapped = mappedAccounts.find(m => m.plaid_account_id === a.account_id)!;
          console.log(`Processing account: ${mapped.name} with balance: ${mapped.balance}`); // Debug logging
          
          const { error: acctErr } = await supabaseAdmin.from('plaid_accounts').upsert({
            plaid_account_id: a.account_id,
            user_id: userId,
            item_id: exchangeData.item_id,
            name: mapped.name,
            provider: mapped.provider,
            type: mapped.type,
            balance: mapped.balance,
            currency: mapped.currency,
            raw: a
          });
          if (acctErr) {
            console.error(`Error upserting plaid_account ${mapped.name}:`, acctErr);
            throw acctErr;
          }

          // Find existing by plaid_account_id mapping stored in plaid_accounts then join to accounts by (user_id,name,provider,type)
          const { data: existingAccounts, error: listErr } = await supabaseAdmin
            .from('accounts')
            .select('id,name')
            .eq('user_id', userId)
            .eq('name', mapped.name);
          if (listErr) {
            console.error(`Error finding existing account ${mapped.name}:`, listErr);
            throw listErr;
          }

          if (!existingAccounts || existingAccounts.length === 0) {
            console.log(`Creating new account record for: ${mapped.name}`);
            const { error: insertMirrorErr } = await supabaseAdmin.from('accounts').insert({
              user_id: userId,
              name: mapped.name,
              provider: mapped.provider,
              type: mapped.type,
              balance: mapped.balance
            });
            if (insertMirrorErr) {
              console.error(`Error inserting new account ${mapped.name}:`, insertMirrorErr);
              throw insertMirrorErr;
            }
          } else {
            console.log(`Updating existing account record for: ${mapped.name} with balance: ${mapped.balance}`);
            const existing = existingAccounts[0];
            const { error: updateMirrorErr } = await supabaseAdmin.from('accounts')
              .update({ 
                balance: mapped.balance,
                provider: mapped.provider,
                type: mapped.type
              })
              .eq('id', existing.id)
              .eq('user_id', userId);
            if (updateMirrorErr) {
              console.error(`Error updating account ${mapped.name}:`, updateMirrorErr);
              throw updateMirrorErr;
            }
          }
        }
  persisted = true; // We consider success if accounts loop ran
      } catch (persistErr) {
        console.error('Persistence failure (continuing to return accounts):', persistErr);
      }
    }

    console.log(`✅ Returning account data for user: ${userId}, accounts: ${mappedAccounts.length}, persisted: ${persisted}`);
    
    return new Response(JSON.stringify({
      success: true,
      item_id: exchangeData.item_id,
      user_id: userId,
      accounts: mappedAccounts,
      persisted
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  } catch (e) {
    console.error('Unhandled error exchanging public token:', e);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Server exception exchanging public token', 
      details: String(e) 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});
