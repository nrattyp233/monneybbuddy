// Supabase Edge Function: create-transaction
// Simple, bulletproof transaction creation

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get user from auth
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Auth failed' }), { 
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }

    const body = await req.json();
    const { to, amount, description, kind, fee, payment_method, from_account_id, geoFence, timeRestriction } = body;

    // Basic validation
    if (!to || !amount || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid input' }), { 
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }

    // Create transaction with minimal required fields
    const txData: any = {
      user_id: user.id,
      from_details: user.email,
      to_details: to,
      amount: parseFloat(amount),
      description: description || '',
      type: kind || 'send',
      status: 'Pending'
    };

    // Add optional fields only if they exist
    if (fee && fee > 0) txData.fee = parseFloat(fee);
    if (payment_method) txData.payment_method = payment_method;
    if (from_account_id) txData.from_account_id = from_account_id;
    if (geoFence) txData.geo_fence = geoFence;
    if (timeRestriction) txData.time_restriction = timeRestriction;

    const { error: insertError } = await supabaseAdmin.from('transactions').insert(txData);
    
    if (insertError) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Insert failed', 
        details: insertError.message 
      }), { 
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }

    return new Response(JSON.stringify({ success: true }), { 
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Server error', 
      details: error.message 
    }), { 
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }
});
