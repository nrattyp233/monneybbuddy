// Supabase Edge Function: create-transaction
// Inserts a transaction row compatible with varying schemas by probing available columns

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' ? RAW_ALLOWED_ORIGIN.slice(0, -1) : RAW_ALLOWED_ORIGIN;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function buildCors(originHeader: string | null) {
  let allowOrigin = NORMALIZED_ALLOWED_ORIGIN;
  if (NORMALIZED_ALLOWED_ORIGIN !== '*' && originHeader) {
    const normalizedIncoming = originHeader.endsWith('/') ? originHeader.slice(0, -1) : originHeader;
    if (normalizedIncoming === NORMALIZED_ALLOWED_ORIGIN) allowOrigin = normalizedIncoming;
    else if (normalizedIncoming.includes('moneybuddygeo.netlify.app')) allowOrigin = normalizedIncoming;
    else if (normalizedIncoming.includes('localhost') || normalizedIncoming.includes('127.0.0.1')) allowOrigin = normalizedIncoming;
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

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed', details: userError?.message }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const body = await req.json();
    const {
      to,
      amount,
      fee,
      description,
      kind, // 'send' | 'request' | ...
      payment_method,
      from_account_id,
      to_account_id,
      geoFence,
      timeRestriction
    } = body || {};

    if (!to || typeof amount !== 'number' || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    console.log('Creating transaction for user:', user.id, 'to:', to, 'amount:', amount);

    // Clean nulls and undefined values
    const clean = (obj: Record<string, any>) => {
      const cleaned: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
          cleaned[key] = value;
        }
      }
      return cleaned;
    };

    try {
      // Attempt 1: Current app schema (from_details/to_details/amount/fee/...)
      const attempt1: Record<string, any> = {
        user_id: user.id,
        from_details: user.email,
        to_details: to,
        amount,
        description: description || '',
        type: kind || 'send',
        status: 'Pending'
      };

      // Add optional fields only if they have values
      if (typeof fee === 'number' && fee > 0) attempt1.fee = fee;
      if (payment_method) attempt1.payment_method = payment_method;
      if (from_account_id) attempt1.from_account_id = from_account_id;
      if (to_account_id) attempt1.to_account_id = to_account_id;
      if (geoFence) attempt1.geo_fence = geoFence;
      if (timeRestriction) attempt1.time_restriction = timeRestriction;

      console.log('Attempting insert with schema v1:', attempt1);
      let { error: insertErr1 } = await supabaseAdmin.from('transactions').insert(attempt1);

      // Try different status formats if enum error
      if (insertErr1 && /enum|invalid input|status/i.test(insertErr1.message || '')) {
        console.log('Trying uppercase status...');
        const attempt1b = { ...attempt1, status: 'PENDING' };
        insertErr1 = (await supabaseAdmin.from('transactions').insert(attempt1b)).error;
      }

      if (!insertErr1) {
        console.log('✅ Insert successful with v1 schema');
        return new Response(JSON.stringify({ success: true, variant: 'v1' }), { 
          status: 200, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
      }

      console.log('❌ Schema v1 failed:', insertErr1.message);

      // Attempt 2: Legacy schema with cents and metadata
      const attempt2: Record<string, any> = {
        user_from: user.id,
        user_to: user.id, // Will store real recipient in metadata
        amount_cents: Math.round(amount * 100),
        currency: 'usd',
        status: 'PENDING',
        metadata: {
          to_email: to,
          description: description || '',
          type: kind || 'send',
          from_email: user.email
        }
      };

      if (typeof fee === 'number' && fee > 0) {
        attempt2.service_fee_cents = Math.round(fee * 100);
      }

      if (payment_method || from_account_id || to_account_id || geoFence || timeRestriction) {
        attempt2.metadata = {
          ...attempt2.metadata,
          payment_method,
          from_account_id,
          to_account_id,
          geoFence,
          timeRestriction
        };
      }

      console.log('Attempting insert with schema v2:', attempt2);
      const { error: insertErr2 } = await supabaseAdmin.from('transactions').insert(attempt2);

      if (!insertErr2) {
        console.log('✅ Insert successful with v2 schema');
        return new Response(JSON.stringify({ success: true, variant: 'v2' }), { 
          status: 200, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
      }

      console.log('❌ Both schemas failed. v1:', insertErr1.message, 'v2:', insertErr2.message);
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Both insert attempts failed', 
        details: {
          v1_error: insertErr1.message,
          v2_error: insertErr2.message
        }
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });

    } catch (err: any) {
      console.error('❌ Unexpected error in transaction creation:', err);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Unexpected error', 
        details: err.message || String(err)
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }

  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal error', details: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
