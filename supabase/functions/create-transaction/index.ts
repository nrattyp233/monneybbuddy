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

    // Attempt 1: Current app schema (from_details/to_details/amount/fee/...)
    const attempt1: Record<string, any> = {
      user_id: user.id,
      from_details: user.email,
      to_details: to,
      amount,
      fee: typeof fee === 'number' ? fee : 0,
      description: description || null,
      type: kind || 'send',
      status: 'Pending',
      payment_method: payment_method || null,
      from_account_id: from_account_id || null,
      to_account_id: to_account_id || null,
      geo_fence: geoFence || null,
      time_restriction: timeRestriction || null
    };

    // Clean nulls so we don't set non-existent columns on some DBs
    const clean = (obj: Record<string, any>) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

    let { error: insertErr1 } = await supabaseAdmin.from('transactions').insert(clean(attempt1));

    // If enum/text mismatch on status, try uppercase
    if (insertErr1 && /enum|invalid input value for enum|status/i.test(insertErr1.message || '')) {
      const attempt1b = { ...attempt1, status: 'PENDING' };
      insertErr1 = (await supabaseAdmin.from('transactions').insert(clean(attempt1b))).error;
    }

    if (!insertErr1) {
      return new Response(JSON.stringify({ success: true, variant: 'v1' }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Attempt 2: Legacy/alt schema (user_from/user_to, amount_cents/service_fee_cents, metadata)
    const attempt2: Record<string, any> = {
      user_from: user.id,
      user_to: user.id, // fallback; store real recipient in metadata
      amount_cents: Math.round(amount * 100),
      service_fee_cents: Math.round((typeof fee === 'number' ? fee : 0) * 100),
      currency: 'usd',
      status: 'PENDING',
      metadata: {
        to_email: to,
        description: description || '',
        type: kind || 'send',
        payment_method: payment_method || null,
        from_account_id: from_account_id || null,
        to_account_id: to_account_id || null,
        geoFence: geoFence || null,
        timeRestriction: timeRestriction || null
      }
    };
    const { error: insertErr2 } = await supabaseAdmin.from('transactions').insert(clean(attempt2));

    if (!insertErr2) {
      return new Response(JSON.stringify({ success: true, variant: 'v2' }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Insert failed', details: insertErr1?.message || insertErr2?.message }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal error', details: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
