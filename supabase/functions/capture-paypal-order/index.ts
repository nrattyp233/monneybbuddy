// Supabase Edge Function: capture-paypal-order
// Description: Captures a PayPal order after user approval
// Requirements:
//   Supabase secrets set:
//     PAYPAL_CLIENT_ID
//     PAYPAL_CLIENT_SECRET
//     PAYPAL_API_URL (e.g. 'https://api-m.paypal.com' for production)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CaptureOrderRequest {
  order_id: string;
  user_id?: string;
}

interface PayPalCaptureResponse {
  id: string;
  status: string;
  purchase_units: Array<{
    payments: {
      captures: Array<{
        id: string;
        amount: {
          currency_code: string;
          value: string;
        };
        status: string;
      }>;
    };
  }>;
}

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');
const PAYPAL_API_URL = Deno.env.get('PAYPAL_API_URL') || 'https://api-m.paypal.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' 
  ? RAW_ALLOWED_ORIGIN.slice(0, -1) 
  : RAW_ALLOWED_ORIGIN;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

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

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: 'PayPal credentials not configured on server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  try {
    const body: CaptureOrderRequest = await req.json();
    const { order_id, user_id } = body;

    console.log('🎯 Capturing PayPal order:', { order_id, user_id });

    if (!order_id) {
      return new Response(JSON.stringify({ error: 'Missing order_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    console.log('🔑 Getting PayPal access token for capture...');
    const accessToken = await getPayPalAccessToken();

    // Capture the PayPal order
    console.log('💰 Capturing PayPal order...');
    const captureResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${order_id}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-${order_id}-${Date.now()}`,
      },
    });

    console.log('📡 PayPal capture response status:', captureResponse.status);

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error('❌ PayPal capture failed:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Failed to capture PayPal order', 
        details: errorText,
        status: captureResponse.status
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    const captureData = await captureResponse.json() as PayPalCaptureResponse;
    
    // Create response with capture data
    const responseData = {
      success: true,
      captureId: captureData.id,
      status: captureData.status
    };

    // Update transaction status in database if we have Supabase access
    if (supabaseAdmin && user_id) {
      const { error: updateError } = await supabaseAdmin
        .from('transactions')
        .update({ 
          status: 'Completed',
          external_transaction_id: captureData.purchase_units[0]?.payments?.captures[0]?.id
        })
        .eq('paypal_order_id', order_id)
        .eq('user_id', user_id);

      if (updateError) {
        console.error('⚠️ Failed to update transaction status:', updateError);
        // Don't fail the capture if DB update fails
      }
    }

    const captureInfo = captureData.purchase_units[0]?.payments?.captures[0];
    
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

    return new Response(JSON.stringify({ 
      success: true,
      order_id: order_id,
      capture_id: captureData.id,
      status: captureData.status,
      transaction_id: captureInfo?.id,
      amount: captureInfo?.amount,
      capture_status: captureInfo?.status
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (e) {
    console.error('💥 Unhandled error capturing PayPal order:', e);
    return new Response(JSON.stringify({ 
      error: 'Server exception capturing PayPal order', 
      details: String(e) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});