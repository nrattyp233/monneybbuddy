// Supabase Edge Function: create-paypal-order
// Description: Creates a PayPal order for money transfers
// Requirements:
//   Supabase secrets set:
//     PAYPAL_CLIENT_ID
//     PAYPAL_CLIENT_SECRET
//     PAYPAL_API_URL (e.g. 'https://api-m.paypal.com' for production)
//     ALLOWED_ORIGIN (frontend origin for CORS)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface CreateOrderRequest {
  amount: string;
  fee: string;
  recipient_email: string;
  description: string;
}

interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');
const PAYPAL_API_URL = Deno.env.get('PAYPAL_API_URL') || 'https://api-m.paypal.com';
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' 
  ? RAW_ALLOWED_ORIGIN.slice(0, -1) 
  : RAW_ALLOWED_ORIGIN;

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

  const data = await response.json() as PayPalAccessTokenResponse;
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
    const body: CreateOrderRequest = await req.json();
    const { amount, fee, recipient_email, description } = body;

    console.log('🎯 Creating PayPal order:', { amount, fee, recipient_email, description });

    if (!amount || !recipient_email) {
      return new Response(JSON.stringify({ error: 'Missing required fields: amount, recipient_email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    // Get PayPal access token
    console.log('🔑 Getting PayPal access token...');
    const accessToken = await getPayPalAccessToken();

    // Calculate total amount (amount + fee)
    const totalAmount = (parseFloat(amount) + parseFloat(fee || '0')).toFixed(2);
    console.log('💰 Total amount to transfer:', totalAmount);

    // Create PayPal order
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: totalAmount,
        },
        description: description || 'MoneyBuddy Transfer',
        payee: {
          email_address: recipient_email,
        },
      }],
      application_context: {
        return_url: `${NORMALIZED_ALLOWED_ORIGIN}/payment-success`,
        cancel_url: `${NORMALIZED_ALLOWED_ORIGIN}/payment-cancel`,
        user_action: 'PAY_NOW',
        payment_method: {
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
        }
      },
    };

    console.log('📦 PayPal order payload:', JSON.stringify(orderPayload, null, 2));

    const orderResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `moneybuddy-${Date.now()}`,
      },
      body: JSON.stringify(orderPayload),
    });

    console.log('📡 PayPal API response status:', orderResponse.status);

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('❌ PayPal order creation failed:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Failed to create PayPal order', 
        details: errorText,
        status: orderResponse.status 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    const orderData = await orderResponse.json() as PayPalOrderResponse;
    const approvalLink = orderData.links.find(link => link.rel === 'approve');

    return new Response(JSON.stringify({
      success: true,
      orderId: orderData.id,
      approval_url: approvalLink?.href,
      status: orderData.status,
      amount: totalAmount,
      recipient: recipient_email
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (e) {
    console.error('💥 Unhandled error creating PayPal order:', e);
    return new Response(JSON.stringify({ 
      error: 'Server exception creating PayPal order', 
      details: String(e) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});