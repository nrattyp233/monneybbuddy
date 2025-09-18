// Supabase Edge Function: process-lock-withdrawal
// Description: Processes withdrawal from locked savings via PayPal Payouts

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

interface WithdrawRequest {
  locked_saving_id: string;
  user_email: string;
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
    const body: WithdrawRequest = await req.json();
    const { locked_saving_id, user_email } = body;

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

    // Get the locked saving record
    const { data: lockedSaving, error: fetchError } = await supabaseAdmin
      .from('locked_savings')
      .select('*')
      .eq('id', locked_saving_id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lockedSaving) {
      return new Response(JSON.stringify({ error: 'Locked saving not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    if (lockedSaving.status === 'Withdrawn') {
      return new Response(JSON.stringify({ error: 'Already withdrawn' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    // Check if withdrawal is allowed (past end date or early with penalty)
    const endDate = new Date(lockedSaving.end_date);
    const now = new Date();
    const isEarlyWithdrawal = now < endDate;
    
    let withdrawalAmount = lockedSaving.amount;
    if (isEarlyWithdrawal) {
      // Apply 10% early withdrawal penalty
      withdrawalAmount = lockedSaving.amount * 0.9;
    }

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // Create PayPal payout
    const payoutPayload = {
      sender_batch_header: {
        sender_batch_id: `withdrawal_${locked_saving_id}_${Date.now()}`,
        email_subject: 'MoneyBuddy Withdrawal',
        email_message: 'Your locked savings withdrawal has been processed.',
      },
      items: [{
        recipient_type: 'EMAIL',
        amount: {
          value: withdrawalAmount.toFixed(2),
          currency: 'USD',
        },
        receiver: user_email,
        note: isEarlyWithdrawal 
          ? `Early withdrawal with penalty from locked savings` 
          : `Withdrawal from locked savings`,
        sender_item_id: `item_${locked_saving_id}`,
      }],
    };

    const payoutResponse = await fetch(`${PAYPAL_API_URL}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payoutPayload),
    });

    if (!payoutResponse.ok) {
      const errorText = await payoutResponse.text();
      console.error('PayPal payout failed:', errorText);
      throw new Error('Failed to process PayPal payout');
    }

    const payoutData = await payoutResponse.json();

    // Update locked saving status
    const { error: updateError } = await supabaseAdmin
      .from('locked_savings')
      .update({ 
        status: 'Withdrawn',
        withdrawal_amount: withdrawalAmount,
        withdrawn_at: new Date().toISOString(),
        payout_batch_id: payoutData.batch_header.payout_batch_id
      })
      .eq('id', locked_saving_id);

    if (updateError) {
      throw updateError;
    }

    // If early withdrawal, create a penalty transaction record
    if (isEarlyWithdrawal) {
      const penaltyAmount = lockedSaving.amount - withdrawalAmount;
      await supabaseAdmin.from('transactions').insert({
        user_id: userId,
        from_details: user_email,
        to_details: 'MoneyBuddy Fee Account',
        amount: penaltyAmount,
        description: 'Early withdrawal penalty',
        type: 'penalty',
        status: 'Completed',
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      withdrawal_amount: withdrawalAmount,
      penalty_applied: isEarlyWithdrawal,
      penalty_amount: isEarlyWithdrawal ? lockedSaving.amount - withdrawalAmount : 0,
      payout_batch_id: payoutData.batch_header.payout_batch_id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (e) {
    console.error('Unhandled error processing withdrawal:', e);
    return new Response(JSON.stringify({ error: 'Server exception processing withdrawal', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});