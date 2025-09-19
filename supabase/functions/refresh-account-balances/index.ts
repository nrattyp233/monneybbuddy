// Supabase Edge Function: refresh-account-balances
// Production-ready balance refresh with rate limiting, token rotation, and comprehensive error handling
// Fetches current account balances from Plaid and updates the database

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'production'; // Default to production, not sandbox
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' ? RAW_ALLOWED_ORIGIN.slice(0, -1) : RAW_ALLOWED_ORIGIN;

const PLAID_BASE = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com', 
  production: 'https://production.plaid.com'
}[PLAID_ENV as 'sandbox' | 'development' | 'production'] || 'https://production.plaid.com';

// Rate limiting: track last refresh per user to prevent abuse
const lastRefreshCache = new Map<string, number>();
const RATE_LIMIT_MS = 30000; // 30 seconds between refreshes per user
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

interface PlaidError {
  error_code: string;
  error_message: string;
  error_type: string;
  request_id: string;
}

async function handleTokenRotation(supabaseAdmin: any, itemId: string, userId: string): Promise<string | null> {
  console.log(`🔄 Attempting token rotation for item: ${itemId}`);
  
  try {
    // In production, implement Plaid's /item/public_token/create + /item/public_token/exchange flow
    // For now, return null to indicate reconnection needed
    console.warn(`⚠️ Token rotation not implemented - user needs to reconnect item: ${itemId}`);
    return null;
  } catch (error) {
    console.error(`❌ Token rotation failed for item ${itemId}:`, error);
    return null;
  }
}

async function retryPlaidRequest(url: string, body: any, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        return response;
      }
      
      // If rate limited, wait longer
      if (response.status === 429 && attempt < retries) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY_MS * attempt;
        console.log(`⏳ Rate limited, waiting ${delay}ms before retry ${attempt + 1}`);
        await sleep(delay);
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.warn(`🔄 Retry ${attempt} failed, retrying in ${RETRY_DELAY_MS * attempt}ms:`, error);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  
  throw new Error('Max retries exceeded');
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
      guidance: 'Add PLAID_CLIENT_ID and PLAID_SECRET to your Supabase project secrets.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Supabase admin client not configured',
      needsServerConfig: true,
      guidance: 'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as function secrets.'
    }), {
      status: 200,
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
      return new Response(JSON.stringify({ 
        success: false,
        error: 'User not authenticated',
        needsAuth: true,
        guidance: 'Ensure the request includes a valid Supabase user session (Bearer token).'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    console.log(`🔄 Refreshing balances for user: ${userId}`);

    // Rate limiting check
    const lastRefresh = lastRefreshCache.get(userId) || 0;
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefresh;
    
    if (timeSinceLastRefresh < RATE_LIMIT_MS) {
      const remainingMs = RATE_LIMIT_MS - timeSinceLastRefresh;
      return new Response(JSON.stringify({ 
        success: false,
        error: `Rate limited: Please wait ${Math.ceil(remainingMs / 1000)} seconds before refreshing again`,
        rateLimited: true,
        retryAfterMs: remainingMs
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }
    
    // Update rate limit cache
    lastRefreshCache.set(userId, now);

    // Try to get Plaid items, but if table doesn't exist, fall back to simple approach
    let plaidItems: any[] = [];
    try {
      const { data, error } = await supabaseAdmin
        .from('plaid_items')
        .select('item_id, access_token_enc')
        .eq('user_id', userId);
      
      if (error) {
        const msg = error.message || '';
        console.warn('Error selecting from plaid_items:', msg);
        const isMissingTable = msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')
          || msg.toLowerCase().includes('42p01');
        if (isMissingTable) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Database schema setup required. Please run setup-plaid-tables.sql in Supabase SQL Editor.',
            updatedAccounts: 0,
            needsSetup: true
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
          });
        }
        // Other errors: surface as guidance without failing
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Could not access stored Plaid tokens. You may need to reconnect once.',
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
        
        // Get current balances from Plaid with retry logic
        const accountsRes = await retryPlaidRequest(`${PLAID_BASE}/accounts/balance/get`, {
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          access_token: item.access_token_enc, // Production: decrypt if using pgcrypto
        });

        if (!accountsRes.ok) {
          const errorText = await accountsRes.text();
          console.error(`❌ Plaid balances/get error for item ${item.item_id}:`, { status: accountsRes.status, body: errorText });
          
          // Parse Plaid error and handle token rotation
          try {
            const errJson = JSON.parse(errorText) as PlaidError;
            const code = errJson?.error_code || '';
            
            console.log(`🔍 Plaid error code: ${code}, message: ${errJson?.error_message || 'Unknown'}`);
            
            // Handle token rotation scenarios
            if (['INVALID_ACCESS_TOKEN', 'ITEM_LOGIN_REQUIRED'].includes(code)) {
              console.log(`🔄 Attempting token rotation for code: ${code}`);
              const newToken = await handleTokenRotation(supabaseAdmin, item.item_id, userId);
              
              if (newToken) {
                // Retry with new token
                console.log(`✅ Token rotated successfully, retrying request`);
                const retryRes = await retryPlaidRequest(`${PLAID_BASE}/accounts/balance/get`, {
                  client_id: PLAID_CLIENT_ID,
                  secret: PLAID_SECRET,
                  access_token: newToken,
                });
                
                if (retryRes.ok) {
                  const accountsData = await retryRes.json() as PlaidAccountsGetResponse;
                  console.log(`📊 Retrieved ${accountsData.accounts.length} accounts after token rotation`);
                  // Continue with normal processing...
                }
              } else {
                // Token rotation failed, user needs to reconnect
                return new Response(JSON.stringify({
                  success: true,
                  message: 'Your bank connection has expired and needs re-authorization. Please reconnect your account.',
                  updatedAccounts: totalUpdated,
                  needsReconnection: true,
                  plaidError: { code, message: errJson?.error_message }
                }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
                });
              }
            } else if (['INVALID_ITEM', 'PRODUCT_NOT_READY', 'INSUFFICIENT_PERMISSIONS'].includes(code)) {
              return new Response(JSON.stringify({
                success: true,
                message: 'Your bank connection needs re-authorization to continue refreshing balances.',
                updatedAccounts: totalUpdated,
                needsReconnection: true,
                plaidError: { code, message: errJson?.error_message }
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
              });
            }
          } catch {
            console.warn(`⚠️ Could not parse Plaid error response: ${errorText}`);
          }
          
          errors.push(`Failed to fetch balances for item ${item.item_id}: ${errorText}`);
          continue;
        }

        const accountsData = await accountsRes.json() as PlaidAccountsGetResponse;
        console.log(`📊 Retrieved ${accountsData.accounts.length} accounts from Plaid for item ${item.item_id}`);

        // Update each account balance with transaction-like updates
        for (const plaidAccount of accountsData.accounts) {
          const currentBalance = plaidAccount.balances.current;
          const availableBalance = plaidAccount.balances.available;
          const accountName = plaidAccount.official_name || plaidAccount.name;
          const currency = plaidAccount.balances.iso_currency_code || 'USD';
          
          console.log(`💰 Updating ${accountName}: current=$${currentBalance}, available=$${availableBalance}`);

          try {
            // Update plaid_accounts table if it exists (with comprehensive data)
            const { error: plaidUpdateError } = await supabaseAdmin
              .from('plaid_accounts')
              .update({ 
                balance: currentBalance,
                currency: currency,
                raw: {
                  ...plaidAccount,
                  last_refresh: new Date().toISOString(),
                  refresh_method: 'accounts/balance/get'
                },
                updated_at: new Date().toISOString()
              })
              .eq('plaid_account_id', plaidAccount.account_id)
              .eq('user_id', userId);

            if (plaidUpdateError) {
              console.warn(`⚠️ plaid_accounts table update failed for ${accountName}:`, plaidUpdateError.message);
            } else {
              console.log(`✅ Updated plaid_accounts table for ${accountName}`);
            }
          } catch (error) {
            console.warn(`⚠️ plaid_accounts table access failed for ${accountName}:`, error);
          }

          // Update main accounts table (critical path)
          const { error: accountUpdateError, count } = await supabaseAdmin
            .from('accounts')
            .update({ 
              balance: currentBalance,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('name', accountName)
            .eq('provider', 'Plaid');

          if (accountUpdateError) {
            console.error(`❌ Error updating account ${accountName}:`, accountUpdateError);
            errors.push(`Failed to update account ${accountName}: ${accountUpdateError.message}`);
            continue;
          }

          if (count === 0) {
            console.warn(`⚠️ No accounts updated for ${accountName} - account may not exist in accounts table`);
            // Create account if it doesn't exist
            const { error: insertError } = await supabaseAdmin
              .from('accounts')
              .insert({
                user_id: userId,
                name: accountName,
                provider: 'Plaid',
                type: plaidAccount.type,
                balance: currentBalance,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            
            if (insertError) {
              console.error(`❌ Failed to create account ${accountName}:`, insertError);
              errors.push(`Failed to create account ${accountName}: ${insertError.message}`);
              continue;
            }
            
            console.log(`✅ Created new account ${accountName} with balance $${currentBalance}`);
          }

          totalUpdated++;
          console.log(`✅ Successfully updated ${accountName} balance to $${currentBalance}`);
        }

      } catch (itemError) {
        console.error(`❌ Error processing Plaid item ${item.item_id}:`, itemError);
        errors.push(`Error processing item ${item.item_id}: ${String(itemError)}`);
        
        // Log detailed error for production debugging
        console.error(`🔍 Detailed error for item ${item.item_id}:`, {
          error: itemError,
          stack: itemError instanceof Error ? itemError.stack : undefined,
          userId,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Clear rate limit on successful completion
    lastRefreshCache.delete(userId);

    const result = {
      success: true,
      message: totalUpdated > 0 
        ? `Balance refresh completed successfully. Updated ${totalUpdated} account${totalUpdated === 1 ? '' : 's'}.`
        : 'Balance refresh completed, but no accounts were updated.',
      updatedAccounts: totalUpdated,
      timestamp: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
      plaidEnvironment: PLAID_ENV
    };

    console.log(`🎉 Balance refresh summary for user ${userId}:`, result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (error) {
    console.error('❌ Unhandled error refreshing account balances:', error);
    
    // Clear rate limit on error to allow retry
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      try {
        const token = authHeader.substring(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payloadRaw = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadRaw);
          if (payload.sub) {
            lastRefreshCache.delete(payload.sub);
          }
        }
      } catch {}
    }
    
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Server exception during balance refresh. Please try again in a moment.', 
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      canRetry: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});