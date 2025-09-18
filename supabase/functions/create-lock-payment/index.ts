// Supabase Edge Function: create-lock-payment
// Description: Creates a PayPal order for locked savings transfers

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');
const PAYPAL_API_URL = Deno.env.get('PAYPAL_API_URL') || 'https://api-m.paypal.com';
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' 
  ? RAW_ALLOWED_ORIGIN.slice(0, -1) 
  : RAW_ALLOWED_ORIGIN;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

interface CreateLockPaymentRequest {
  account_id: string;
  amount: string;
  lock_period_months: number;
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

async function getPayPalAccessToken(): Promise<string> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get PayPal access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  const originHeader = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCors(originHeader) });
  }

  if (!supabaseAdmin || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: 'Server configuration incomplete' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  try {
    const body: CreateLockPaymentRequest = await req.json();
    const { account_id, amount, lock_period_months } = body;

    // Get user ID from authorization header
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

    // Calculate lock period end date
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + lock_period_months);

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // Create PayPal order for the locked savings
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: amount,
        },
        description: `MoneyBuddy Locked Savings - ${lock_period_months} months`,
      }],
      application_context: {
        return_url: `${NORMALIZED_ALLOWED_ORIGIN}/lock-success`,
        cancel_url: `${NORMALIZED_ALLOWED_ORIGIN}/lock-cancel`,
      },
    };

    const orderResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('PayPal order creation failed:', errorText);
      throw new Error('Failed to create PayPal order');
    }

    const orderData = await orderResponse.json();
    const approvalLink = orderData.links.find((link: any) => link.rel === 'approve');

    // Create locked savings record
    const { data: lockedSaving, error: insertError } = await supabaseAdmin
      .from('locked_savings')
      .insert({
        user_id: userId,
        account_id: account_id,
        amount: parseFloat(amount),
        lock_period_months: lock_period_months,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: 'Pending',
        paypal_order_id: orderData.id,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return new Response(JSON.stringify({ 
      approval_url: approvalLink?.href,
      order_id: orderData.id,
      locked_saving_id: lockedSaving.id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (e) {
    console.error('Unhandled error creating lock payment:', e);
    return new Response(JSON.stringify({ error: 'Server exception creating lock payment', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});