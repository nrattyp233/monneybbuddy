// Supabase Edge Function: repair-plaid-accounts
// One-time fix to repair Plaid accounts by setting their account_status to 'active'

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' ? RAW_ALLOWED_ORIGIN.slice(0, -1) : RAW_ALLOWED_ORIGIN;

function buildCors(originHeader: string | null) {
  let allowOrigin = NORMALIZED_ALLOWED_ORIGIN;
  if (NORMALIZED_ALLOWED_ORIGIN !== '*' && originHeader) {
    const normalizedIncoming = originHeader.endsWith('/') ? originHeader.slice(0, -1) : originHeader;
    if (normalizedIncoming === NORMALIZED_ALLOWED_ORIGIN) {
      allowOrigin = normalizedIncoming;
    }
    // Allow any Netlify deploy preview URL for moneybuddygeo
    else if (normalizedIncoming.includes('moneybuddygeo.netlify.app')) {
      allowOrigin = normalizedIncoming;
    }
    // Allow localhost for development
    else if (normalizedIncoming.includes('localhost') || normalizedIncoming.includes('127.0.0.1')) {
      allowOrigin = normalizedIncoming;
    }
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}

serve(async (req) => {
  const originHeader = req.headers.get('origin');
  const corsHeaders = buildCors(originHeader);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Admin override header for global repair
  const adminHeader = req.headers.get('x-admin-token');
  const adminSecret = Deno.env.get('REPAIR_ADMIN_TOKEN');
  const isAdmin = Boolean(adminHeader && adminSecret && adminHeader === adminSecret);

  // Get auth token from request if not admin
  const authHeader = req.headers.get('authorization');
  if (!isAdmin && (!authHeader || !authHeader.startsWith('Bearer '))) {
    return new Response(JSON.stringify({ error: 'Missing or invalid authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    // If admin, perform global repair; otherwise, repair for current user
    if (isAdmin) {
      let statusColumnMissing = false;
      let accounts: Array<{ id: string; name: string; provider: string; account_status?: string }>; 
      {
        const { data, error } = await supabaseAdmin
          .from('accounts')
          .select('id, name, provider, account_status')
          .eq('provider', 'Plaid');
        if (error) {
          const msg = error.message || '';
          if (/account_status|column .* does not exist/i.test(msg)) {
            statusColumnMissing = true;
            const fallback = await supabaseAdmin
              .from('accounts')
              .select('id, name, provider')
              .eq('provider', 'Plaid');
            if (fallback.error) {
              return new Response(JSON.stringify({ error: 'Failed to get accounts', details: fallback.error.message }), {
                status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
              });
            }
            accounts = (fallback.data || []) as any;
          } else {
            return new Response(JSON.stringify({ error: 'Failed to get accounts', details: error.message }), {
              status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
        } else {
          accounts = (data || []) as any;
        }
      }

      const accountsToFix = statusColumnMissing ? [] : accounts.filter(acc => acc.account_status !== 'active');

      if (accountsToFix.length === 0) {
        return new Response(JSON.stringify({ 
          success: true,
          message: 'No accounts need repair',
          accountsExamined: accounts.length,
          accountsFixed: 0
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const { error: updateError } = accountsToFix.length
        ? await supabaseAdmin
            .from('accounts')
            .update({ account_status: 'active' })
            .in('id', accountsToFix.map(acc => acc.id))
        : { error: null } as any;
      
      if (updateError) {
        const msg = updateError.message || '';
        const missingCol = /account_status|column .* does not exist/i.test(msg);
        if (!missingCol) {
          return new Response(JSON.stringify({ 
            error: 'Failed to update accounts',
            details: updateError.message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        // If column missing, continue to return success (frontend will treat as active)
      }

      return new Response(JSON.stringify({
        success: true,
        message: statusColumnMissing 
          ? 'No account_status column; treated Plaid accounts as active (frontend handles as connected).'
          : `Successfully repaired ${accountsToFix.length} accounts`,
        accountsExamined: accounts.length,
        accountsFixed: statusColumnMissing ? 0 : accountsToFix.length,
        fixedAccounts: statusColumnMissing ? [] : accountsToFix.map(acc => acc.name)
      }), {
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Extract user ID from auth token (non-admin path)
    let userId = null;
    const token = (authHeader || '').replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed', details: userError?.message }), {
        status: 401, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    userId = user.id;
    
    // Get all Plaid accounts for this user
    const { data: plaidItems, error: plaidError } = await supabaseAdmin
      .from('plaid_items')
      .select('item_id')
      .eq('user_id', userId);
      
    if (plaidError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to get Plaid items',
        details: plaidError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Find all Plaid accounts for this user and update their status
    let statusColumnMissing = false;
    let accounts: Array<{ id: string; name: string; provider: string; account_status?: string }>;
    {
      const { data, error } = await supabaseAdmin
        .from('accounts')
        .select('id, name, provider, account_status')
        .eq('user_id', userId)
        .eq('provider', 'Plaid');
      if (error) {
        const msg = error.message || '';
        if (/account_status|column .* does not exist/i.test(msg)) {
          statusColumnMissing = true;
          const fallback = await supabaseAdmin
            .from('accounts')
            .select('id, name, provider')
            .eq('user_id', userId)
            .eq('provider', 'Plaid');
          if (fallback.error) {
            return new Response(JSON.stringify({ error: 'Failed to get accounts', details: fallback.error.message }), {
              status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
          accounts = (fallback.data || []) as any;
        } else {
          return new Response(JSON.stringify({ error: 'Failed to get accounts', details: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      } else {
        accounts = (data || []) as any;
      }
    }

    // Update all accounts that need repair (not already active)
    const accountsToFix = statusColumnMissing ? [] : accounts.filter(acc => acc.account_status !== 'active');
    
    if (accountsToFix.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No accounts need repair',
        accountsExamined: accounts.length,
        accountsFixed: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    
    // Update all accounts in one batch
    const { error: updateError } = accountsToFix.length
      ? await supabaseAdmin
          .from('accounts')
          .update({ account_status: 'active' })
          .in('id', accountsToFix.map(acc => acc.id))
      : { error: null } as any;
    
    if (updateError) {
      const msg = updateError.message || '';
      const missingCol = /account_status|column .* does not exist/i.test(msg);
      if (!missingCol) {
        return new Response(JSON.stringify({ 
          error: 'Failed to update accounts',
          details: updateError.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      // If column missing, continue to return success
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: statusColumnMissing 
        ? 'No account_status column; treated Plaid accounts as active (frontend handles as connected).'
        : `Successfully repaired ${accountsToFix.length} accounts`,
      accountsExamined: accounts.length,
      accountsFixed: statusColumnMissing ? 0 : accountsToFix.length,
      fixedAccounts: statusColumnMissing ? [] : accountsToFix.map(acc => acc.name)
    }), {
      status: 200, 
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
    
  } catch (e) {
    console.error('Error repairing accounts:', e);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: String(e)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});