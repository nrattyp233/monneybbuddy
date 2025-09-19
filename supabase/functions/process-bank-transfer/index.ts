// Supabase Edge Function: process-bank-transfer
// Processes bank-to-bank transfers for MoneyBuddy
// Handles both geo/time restricted and unrestricted transfers

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' ? RAW_ALLOWED_ORIGIN.slice(0, -1) : RAW_ALLOWED_ORIGIN;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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

interface TransferRequest {
  transactionId: string;
  destinationAccountId: string;
  userCoordinates?: {
    latitude: number;
    longitude: number;
  };
}

// Function to calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
}

function isWithinTimeRestriction(timeRestriction: any): boolean {
  if (!timeRestriction || !timeRestriction.expiresAt) return true;
  
  const now = new Date();
  const expiryDate = new Date(timeRestriction.expiresAt);
  return now <= expiryDate;
}

function isWithinGeoFence(userLat: number, userLon: number, geoFence: any): boolean {
  if (!geoFence) return true;
  
  const distance = calculateDistance(
    userLat, 
    userLon, 
    geoFence.latitude, 
    geoFence.longitude
  );
  
  return distance <= geoFence.radiusKm;
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
    const { transactionId, destinationAccountId, userCoordinates }: TransferRequest = await req.json();

    console.log('🏦 Processing bank transfer:', { transactionId, destinationAccountId });

    // Get transaction details
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('status', 'Pending')
      .single();

    if (txError || !transaction) {
      throw new Error('Transaction not found or already processed');
    }

    // Verify restrictions if present
    if (transaction.geo_fence && userCoordinates) {
      if (!isWithinGeoFence(userCoordinates.latitude, userCoordinates.longitude, transaction.geo_fence)) {
        throw new Error('You are not within the required location to claim this transfer');
      }
    }

    if (transaction.time_restriction) {
      if (!isWithinTimeRestriction(transaction.time_restriction)) {
        throw new Error('This transfer has expired');
      }
    }

    // Get source account details
    const { data: sourceAccount, error: sourceError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', transaction.from_account_id)
      .single();

    if (sourceError || !sourceAccount) {
      throw new Error('Source account not found');
    }

    // Get destination account details
    const { data: destAccount, error: destError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', destinationAccountId)
      .single();

    if (destError || !destAccount) {
      throw new Error('Destination account not found');
    }

    // Verify sufficient funds in source account
    const totalAmount = transaction.amount + transaction.fee;
    if (sourceAccount.balance < totalAmount) {
      throw new Error('Insufficient funds in source account');
    }

    console.log('💰 Executing transfer:', {
      from: sourceAccount.name,
      to: destAccount.name,
      amount: transaction.amount,
      fee: transaction.fee
    });

    // Production implementation would integrate with Plaid Transfer API
    // For now, we simulate the transfer completion
    // For now, we'll simulate the transfer by updating balances
    
    // Update source account balance (deduct amount + fee)
    const { error: updateSourceError } = await supabase
      .from('accounts')
      .update({ 
        balance: sourceAccount.balance - totalAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceAccount.id);

    if (updateSourceError) {
      throw new Error('Failed to update source account balance');
    }

    // Update destination account balance (add amount only, fee goes to platform)
    const { error: updateDestError } = await supabase
      .from('accounts')
      .update({ 
        balance: destAccount.balance + transaction.amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', destAccount.id);

    if (updateDestError) {
      throw new Error('Failed to update destination account balance');
    }

    // Update transaction status
    const { error: updateTxError } = await supabase
      .from('transactions')
      .update({ 
        status: 'Completed',
        to_account_id: destinationAccountId,
        completed_at: new Date().toISOString()
      })
      .eq('id', transactionId);

    if (updateTxError) {
      throw new Error('Failed to update transaction status');
    }


    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Transfer completed successfully',
      transactionId: transactionId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error: any) {
    console.error('❌ Bank transfer failed:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Transfer failed'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});