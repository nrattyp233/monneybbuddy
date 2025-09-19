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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  // Get auth token from request
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    // Extract user ID from auth token
    let userId = null;
    const token = authHeader.replace('Bearer ', '');
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

    // Find all accounts that have an external_id (connected to Plaid) and update their status
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('accounts')
      .select('id, name, external_id, provider, account_status')
      .eq('user_id', userId)
      .not('external_id', 'is', null);

    if (accountsError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to get accounts',
        details: accountsError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    
    // Update all accounts that need repair (not already active)
    const accountsToFix = accounts.filter(acc => 
      acc.provider === 'Plaid' && acc.account_status !== 'active'
    );
    
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
    const { error: updateError } = await supabaseAdmin
      .from('accounts')
      .update({ account_status: 'active' })
      .in('id', accountsToFix.map(acc => acc.id));
    
    if (updateError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to update accounts',
        details: updateError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Successfully repaired ${accountsToFix.length} accounts`,
      accountsExamined: accounts.length,
      accountsFixed: accountsToFix.length,
      fixedAccounts: accountsToFix.map(acc => acc.name)
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