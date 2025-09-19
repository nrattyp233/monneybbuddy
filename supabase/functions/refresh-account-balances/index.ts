// Supabase Edge Function: refresh-account-balances
// Production-ready balance refresh with Plaid's /accounts/balance/get API
// Features: token rotation, retry logic, comprehensive logging, Netlify-ready

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'production';
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://moneybuddygeo.netlify.app';

const PLAID_BASE = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com', 
  production: 'https://production.plaid.com'
}[PLAID_ENV as 'sandbox' | 'development' | 'production'] || 'https://production.plaid.com';

// Production configuration
const RATE_LIMIT_MS = 15000; // 15 seconds between refreshes
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// Rate limiting cache
const lastRefreshCache = new Map<string, number>();

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildCors(originHeader: string | null) {
  let allowOrigin = ALLOWED_ORIGIN;
  
  if (originHeader) {
    const normalizedIncoming = originHeader.endsWith('/') ? originHeader.slice(0, -1) : originHeader;
    
    // Allow configured production origin
    if (normalizedIncoming === ALLOWED_ORIGIN) {
      allowOrigin = normalizedIncoming;
    }
    // Allow any Netlify deploy preview URL
    else if (normalizedIncoming.includes('.netlify.app')) {
      allowOrigin = normalizedIncoming;
    }
    // Allow localhost for development
    else if (normalizedIncoming.includes('localhost') || normalizedIncoming.includes('127.0.0.1')) {
      allowOrigin = normalizedIncoming;
    }
  }
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}

interface PlaidAccountsResponse {
  accounts: Array<{
    account_id: string;
    name: string;
    official_name?: string;
    type: string;
    subtype?: string;
    balances: { 
      available: number | null; 
      current: number | null; 
      iso_currency_code?: string;
    };
  }>;
  item: { item_id: string };
  request_id: string;
}

async function retryPlaidRequest(url: string, body: any, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MoneyBuddy-Refresh/1.0'
        },
        body: JSON.stringify(body)
      });

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAYS[attempt - 1] || 4000;
        
        if (attempt < retries) {
          await sleep(delay);
          continue;
        }
      }

      return response;
      
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      const retryDelay = RETRY_DELAYS[attempt - 1] || 4000;
      console.warn(`🔄 Retry ${attempt} failed, retrying in ${retryDelay}ms:`, error);
      await sleep(retryDelay);
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Core function to refresh a single Plaid item
async function refreshPlaidItem(item: any, userId: string) {
  const result = {
    itemId: item.item_id,
    institutionName: item.institution_name || 'Unknown',
    accountsUpdated: 0,
    errors: [] as string[],
    needsReconnection: false
  };

  try {
    
    // Call Plaid's /accounts/balance/get endpoint
    const plaidResponse = await retryPlaidRequest(`${PLAID_BASE}/accounts/balance/get`, {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      access_token: item.access_token_enc
    });

    if (!plaidResponse.ok) {
      const errorText = await plaidResponse.text();
      console.error(`❌ Plaid API error for item ${item.item_id}: ${plaidResponse.status} ${errorText}`);
      
      // Handle specific Plaid errors
      try {
        const errorData = JSON.parse(errorText);
        const errorCode = errorData.error_code;
        
        // Token expiration or auth issues
        if (['INVALID_ACCESS_TOKEN', 'ITEM_LOGIN_REQUIRED', 'ACCESS_NOT_GRANTED'].includes(errorCode)) {
          
          // Mark item as needing reconnection
          if (supabaseAdmin) {
            await supabaseAdmin
              .from('plaid_items')
              .update({ 
                status: 'reconnection_required',
                last_error: `${errorCode}: ${errorData.error_message}`,
                updated_at: new Date().toISOString()
              })
              .eq('item_id', item.item_id)
              .eq('user_id', userId);
          }
          
          result.needsReconnection = true;
          result.errors.push(`Bank connection expired. Please reconnect ${item.institution_name || 'your bank account'}.`);
          return result;
        }
        
        result.errors.push(`Plaid error ${errorCode}: ${errorData.error_message || 'Unknown error'}`);
        
      } catch {
        result.errors.push(`API error: ${plaidResponse.status} ${plaidResponse.statusText}`);
      }
      
      return result;
    }

    const accountsData = await plaidResponse.json() as PlaidAccountsResponse;
    
    if (accountsData.accounts && accountsData.accounts.length > 0) {
      const updated = await updateAccountBalances(accountsData.accounts, userId, item.item_id);
      result.accountsUpdated = updated;
    }

  } catch (error) {
    console.error(`❌ Error refreshing item ${item.item_id}:`, error);
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

// Update account balances in database
async function updateAccountBalances(plaidAccounts: any[], userId: string, itemId: string): Promise<number> {
  if (!supabaseAdmin) {
    console.error('❌ Supabase admin client not available');
    return 0;
  }

  let updated = 0;
  
  for (const account of plaidAccounts) {
    try {
      const balance = account.balances.current;
      const availableBalance = account.balances.available;
      const accountName = account.official_name || account.name;
      const currency = account.balances.iso_currency_code || 'USD';
      
      console.log(`💰 Updating ${accountName}: $${balance} (available: $${availableBalance})`);
      
      // First try to update existing account
      const { error: updateError, count } = await supabaseAdmin
        .from('accounts')
        .update({ 
          balance: balance,
          available_balance: availableBalance,
          currency: currency,
          last_refreshed: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('plaid_account_id', account.account_id);

      if (updateError) {
        console.error(`❌ Failed to update account ${accountName}:`, updateError);
        continue;
      }

      if (count && count > 0) {
        updated++;
      } else {
        // Account doesn't exist, try to match by name and create association
        const { data: existingAccounts, error: fetchError } = await supabaseAdmin
          .from('accounts')
          .select('id, name')
          .eq('user_id', userId)
          .eq('name', accountName)
          .eq('provider', 'Plaid');

        if (fetchError) {
          console.error(`❌ Error fetching existing accounts:`, fetchError);
          continue;
        }

        if (existingAccounts && existingAccounts.length > 0) {
          // Update existing account with Plaid ID
          const { error: linkError } = await supabaseAdmin
            .from('accounts')
            .update({
              plaid_account_id: account.account_id,
              plaid_item_id: itemId,
              balance: balance,
              available_balance: availableBalance,
              currency: currency,
              last_refreshed: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existingAccounts[0].id);

          if (!linkError) {
            updated++;
          }
        } else {
          // Create new account
          const { error: insertError } = await supabaseAdmin
            .from('accounts')
            .insert({
              user_id: userId,
              plaid_account_id: account.account_id,
              plaid_item_id: itemId,
              name: accountName,
              official_name: account.official_name,
              type: account.type,
              subtype: account.subtype,
              balance: balance,
              available_balance: availableBalance,
              currency: currency,
              provider: 'Plaid',
              is_active: true,
              last_refreshed: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          
          if (!insertError) {
            updated++;
          } else {
            console.error(`❌ Failed to create account ${accountName}:`, insertError);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Error updating account ${account.account_id}:`, error);
    }
  }
  
  return updated;
}

serve(async (req) => {
  const originHeader = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCors(originHeader) });
  }

  // Validate environment
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    console.error('❌ Missing Plaid credentials');
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Bank refresh temporarily unavailable. Please contact support.',
      needsServerConfig: true,
      devDetails: 'Plaid credentials not configured on server'
    }), {
      status: 503, // Service Unavailable instead of 500
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  if (!supabaseAdmin) {
    console.error('❌ Missing Supabase configuration');
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Database temporarily unavailable. Please contact support.',
      needsServerConfig: true,
      devDetails: 'Database not configured'
    }), {
      status: 503, // Service Unavailable instead of 500
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  try {
    // Extract user ID from JWT
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
          console.warn('Could not parse JWT payload:', e);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Authentication required',
        needsAuth: true
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    console.log(`🚀 Starting balance refresh for user: ${userId}`);

    // Rate limiting check
    const lastRefresh = lastRefreshCache.get(userId) || 0;
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefresh;
    
    if (timeSinceLastRefresh < RATE_LIMIT_MS) {
      const remainingMs = RATE_LIMIT_MS - timeSinceLastRefresh;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      
      console.log(`⏱️ Rate limit active for user ${userId}: ${remainingSeconds}s remaining`);
      
      return new Response(JSON.stringify({ 
        success: false,
        error: `Please wait ${remainingSeconds} seconds before refreshing again`,
        rateLimited: true,
        retryAfterMs: remainingMs,
        retryAfterSeconds: remainingSeconds
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json', 
          'Retry-After': remainingSeconds.toString(),
          ...buildCors(originHeader) 
        }
      });
    }
    
    // Update rate limit cache
    lastRefreshCache.set(userId, now);

    // Fetch Plaid items
    const { data: plaidItems, error: fetchError } = await supabaseAdmin
      .from('plaid_items')
      .select('item_id, access_token_enc, institution_name')
      .eq('user_id', userId);
    
    if (fetchError) {
      console.error(`❌ Error fetching plaid_items:`, fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }
    
    if (!plaidItems || plaidItems.length === 0) {
      console.log(`ℹ️ No Plaid items found for user ${userId}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No bank accounts connected. Please connect a bank account first.',
        updatedAccounts: 0,
        needsConnection: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }


    // Process each Plaid item
    let totalUpdated = 0;
    const errors: string[] = [];
    const results: any[] = [];

    for (const item of plaidItems) {
      console.log(`🏦 Processing item: ${item.item_id} (${item.institution_name || 'Unknown'})`);
      
      try {
        const refreshResult = await refreshPlaidItem(item, userId);
        results.push(refreshResult);
        totalUpdated += refreshResult.accountsUpdated;
        
        if (refreshResult.errors.length > 0) {
          errors.push(...refreshResult.errors);
        }
        
      } catch (error) {
        const errorMsg = `Failed to refresh ${item.institution_name || item.item_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Build response
    const hasErrors = errors.length > 0;
    const needsReconnection = results.some(r => r.needsReconnection);
    
    const response = {
      success: totalUpdated > 0 || !hasErrors,
      message: totalUpdated > 0 
        ? `Successfully refreshed ${totalUpdated} account${totalUpdated === 1 ? '' : 's'}${hasErrors ? ' (with some errors)' : ''}.`
        : hasErrors 
          ? 'Failed to refresh accounts. Please check your bank connections.'
          : 'No accounts needed refreshing.',
      updatedAccounts: totalUpdated,
      needsReconnection: needsReconnection,
      errors: hasErrors ? errors : undefined,
      timestamp: new Date().toISOString(),
      environment: PLAID_ENV
    };


    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (error) {
    console.error('❌ Unhandled error in refresh-account-balances:', error);
    
    // Clear rate limit on serious errors to allow retry
    try {
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        const token = authHeader.substring(7);
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.sub) {
          lastRefreshCache.delete(payload.sub);
        }
      }
    } catch {}
    
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Server error during balance refresh',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});
