// Supabase Edge Function: refresh-account-balances
// Fetches current account balances from Plaid and updates the database
// This function should be called periodically or when user requests balance refresh

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' ? RAW_ALLOWED_ORIGIN.slice(0, -1) : RAW_ALLOWED_ORIGIN;

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
      allowOrigin = normalizedIncoming;
    }
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}

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

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Supabase admin client not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  try {
    // Get user identity from auth header
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

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    console.log(`🔄 Refreshing balances for user: ${userId}`);

    // Try to get Plaid items, but if table doesn't exist, fall back to simple approach
    let plaidItems: any[] = [];
    try {
      const { data, error } = await supabaseAdmin
        .from('plaid_items')
        .select('item_id, access_token_enc')
        .eq('user_id', userId);
      
      if (error) {
        console.warn('plaid_items table not found, using fallback approach:', error.message);
        // Return a basic success response since we can't refresh without stored tokens
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Balance refresh requires re-connecting your bank accounts. Please disconnect and reconnect your accounts in settings.',
          updatedAccounts: 0,
          needsReconnection: true
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
        });
      }
      
      plaidItems = data || [];
    } catch (error) {
      console.warn('Error accessing plaid_items:', error);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Database schema setup required. Please apply migrations first.',
        updatedAccounts: 0,
        needsSetup: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    if (!plaidItems || plaidItems.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No Plaid accounts found to refresh. Please connect a bank account first.',
        updatedAccounts: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    let totalUpdated = 0;
    const errors: string[] = [];

    // Process each Plaid item (bank connection)
    for (const item of plaidItems) {
      try {
        console.log(`🏦 Fetching accounts for item: ${item.item_id}`);
        
        // Get current balances from Plaid
        const accountsRes = await fetch(`${PLAID_BASE}/accounts/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            access_token: item.access_token_enc, // TODO: decrypt when encryption is implemented
          })
        });

        if (!accountsRes.ok) {
          const errorText = await accountsRes.text();
          console.error(`Plaid accounts/get error for item ${item.item_id}:`, { status: accountsRes.status, body: errorText });
          errors.push(`Failed to fetch accounts for item ${item.item_id}: ${errorText}`);
          continue;
        }

        const accountsData = await accountsRes.json() as PlaidAccountsGetResponse;
        console.log(`📊 Retrieved ${accountsData.accounts.length} accounts from Plaid`);

        // Update each account balance
        for (const plaidAccount of accountsData.accounts) {
          const currentBalance = plaidAccount.balances.current;
          const accountName = plaidAccount.official_name || plaidAccount.name;
          
          console.log(`💰 Updating ${accountName}: $${currentBalance}`);

          // Update plaid_accounts table if it exists
          try {
            const { error: plaidUpdateError } = await supabaseAdmin
              .from('plaid_accounts')
              .update({ 
                balance: currentBalance,
                raw: plaidAccount,
                updated_at: new Date().toISOString()
              })
              .eq('plaid_account_id', plaidAccount.account_id)
              .eq('user_id', userId);

            if (plaidUpdateError) {
              console.warn(`plaid_accounts table update failed for ${accountName}:`, plaidUpdateError.message);
              // Continue anyway, this is not critical
            }
          } catch (error) {
            console.warn(`plaid_accounts table access failed for ${accountName}:`, error);
            // Continue anyway, focus on updating main accounts table
          }

          // Update main accounts table
          const { error: accountUpdateError } = await supabaseAdmin
            .from('accounts')
            .update({ balance: currentBalance })
            .eq('user_id', userId)
            .eq('name', accountName)
            .eq('provider', 'Plaid');

          if (accountUpdateError) {
            console.error(`Error updating account ${accountName}:`, accountUpdateError);
            errors.push(`Failed to update account ${accountName}: ${accountUpdateError.message}`);
            continue;
          }

          totalUpdated++;
          console.log(`✅ Successfully updated ${accountName} balance to $${currentBalance}`);
        }

      } catch (itemError) {
        console.error(`Error processing Plaid item ${item.item_id}:`, itemError);
        errors.push(`Error processing item ${item.item_id}: ${String(itemError)}`);
      }
    }

    const result = {
      success: true,
      message: `Balance refresh completed. Updated ${totalUpdated} accounts.`,
      updatedAccounts: totalUpdated,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log(`🎉 Balance refresh summary:`, result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (error) {
    console.error('Unhandled error refreshing account balances:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Server exception refreshing account balances', 
      details: String(error) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});