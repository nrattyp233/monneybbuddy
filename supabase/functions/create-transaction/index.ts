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

    // Discover available columns on transactions
    const { data: columns, error: colErr } = await supabaseAdmin
      .from('information_schema.columns' as any)
      .select('column_name, data_type, udt_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'transactions');

    if (colErr) {
      return new Response(JSON.stringify({ error: 'Failed to read schema', details: colErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const colSet = new Set((columns || []).map((c: any) => c.column_name));
    const colMap: Record<string, any> = {};

    // Basic identity fields
    if (colSet.has('user_id')) colMap['user_id'] = user.id;

    // Sender/recipient fields
    if (colSet.has('from_details')) colMap['from_details'] = user.email;
    if (colSet.has('to_details')) colMap['to_details'] = to;
    if (!colSet.has('from_details') && colSet.has('user_from')) colMap['user_from'] = user.id;
    if (!colSet.has('to_details') && colSet.has('user_to')) {
      // If we don't have the recipient id, store email in metadata
      colMap['user_to'] = user.id; // fallback to self; adjust below via metadata
      if (colSet.has('metadata')) {
        colMap['metadata'] = { ...(colMap['metadata'] || {}), to_email: to };
      }
    }

    // Amount and fee mapping
    if (colSet.has('amount')) colMap['amount'] = amount;
    else if (colSet.has('amount_cents')) colMap['amount_cents'] = Math.round(amount * 100);

    const feeValue = typeof fee === 'number' ? fee : 0;
    if (colSet.has('fee')) colMap['fee'] = feeValue;
    else if (colSet.has('service_fee_cents')) colMap['service_fee_cents'] = Math.round(feeValue * 100);

    // Description
    if (colSet.has('description')) colMap['description'] = description || null;
    else if (colSet.has('metadata')) colMap['metadata'] = { ...(colMap['metadata'] || {}), description: description || '' };

    // Type
    if (colSet.has('type')) colMap['type'] = kind || 'send';

    // Status
    if (colSet.has('status')) {
      // Prefer "Pending" if expecting text; if enum uppercase might be required, the DB will check
      colMap['status'] = 'Pending';
    }

    // Payment method
    if (payment_method && colSet.has('payment_method')) colMap['payment_method'] = payment_method;

    // Account linkage
    if (from_account_id && colSet.has('from_account_id')) colMap['from_account_id'] = from_account_id;
    if (to_account_id && colSet.has('to_account_id')) colMap['to_account_id'] = to_account_id;

    // Restrictions
    if (geoFence && colSet.has('geo_fence')) colMap['geo_fence'] = geoFence;
    if (timeRestriction && colSet.has('time_restriction')) colMap['time_restriction'] = timeRestriction;
    if ((!colSet.has('geo_fence') || !colSet.has('time_restriction')) && colSet.has('metadata')) {
      colMap['metadata'] = { ...(colMap['metadata'] || {}), geoFence: geoFence || null, timeRestriction: timeRestriction || null };
    }

    // Insert
    const { error: insertError } = await supabaseAdmin.from('transactions').insert(colMap);
    if (insertError) {
      return new Response(JSON.stringify({ success: false, error: 'Insert failed', details: insertError.message }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal error', details: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
