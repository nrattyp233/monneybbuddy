// Supabase Edge Function: claim-transaction
// Description: Handles claiming conditional transactions (with geo-fence or time restrictions)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' 
  ? RAW_ALLOWED_ORIGIN.slice(0, -1) 
  : RAW_ALLOWED_ORIGIN;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

interface ClaimTransactionRequest {
  transaction_id: string;
  latitude?: number;
  longitude?: number;
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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

serve(async (req) => {
  const originHeader = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCors(originHeader) });
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Supabase admin client not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }

  try {
    const body: ClaimTransactionRequest = await req.json();
    const { transaction_id, latitude, longitude } = body;

    if (!transaction_id) {
      return new Response(JSON.stringify({ error: 'Missing transaction_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    // Get the transaction details
    const { data: transaction, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', transaction_id)
      .eq('status', 'Pending')
      .single();

    if (fetchError || !transaction) {
      return new Response(JSON.stringify({ error: 'Transaction not found or not claimable' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    // Check geo-fence restriction
    if (transaction.geo_fence && (!latitude || !longitude)) {
      return new Response(JSON.stringify({ error: 'Location required for this transaction', needsLocation: true }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
      });
    }

    if (transaction.geo_fence && latitude && longitude) {
      const geoFence = transaction.geo_fence;
      const distance = calculateDistance(
        latitude, longitude,
        geoFence.latitude, geoFence.longitude
      );

      if (distance > geoFence.radiusKm) {
        return new Response(JSON.stringify({ 
          error: `You must be within ${geoFence.radiusKm}km of ${geoFence.locationName} to claim this transaction`,
          currentDistance: distance.toFixed(2)
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
        });
      }
    }

    // Check time restriction
    if (transaction.time_restriction) {
      const expiresAt = new Date(transaction.time_restriction.expiresAt);
      if (new Date() > expiresAt) {
        return new Response(JSON.stringify({ error: 'This transaction has expired' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
        });
      }
    }

    // Update transaction status to Completed
    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update({ status: 'Completed' })
      .eq('id', transaction_id);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Transaction claimed successfully',
      amount: transaction.amount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });

  } catch (e) {
    console.error('Unhandled error claiming transaction:', e);
    return new Response(JSON.stringify({ error: 'Server exception claiming transaction', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...buildCors(originHeader) }
    });
  }
});