// Supabase Edge Function: create-paypal-order
// Description: Creates a PayPal order for money transfers with security hardening
// Security Features: Input validation, rate limiting, audit logging
// Requirements:
//   Supabase secrets set:
//     PAYPAL_CLIENT_ID
//     PAYPAL_CLIENT_SECRET
//     PAYPAL_API_URL (e.g. 'https://api-m.paypal.com' for production)
//     ALLOWED_ORIGIN (frontend origin for CORS)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Rate limiting: Max 10 orders per minute per user
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_ORDERS_PER_WINDOW = 10;
const userRequestCounts = new Map<string, { count: number; windowStart: number }>();

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
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RAW_ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const NORMALIZED_ALLOWED_ORIGIN = RAW_ALLOWED_ORIGIN.endsWith('/') && RAW_ALLOWED_ORIGIN !== '*' 
  ? RAW_ALLOWED_ORIGIN.slice(0, -1) 
  : RAW_ALLOWED_ORIGIN;

const supabaseAdmin = (() => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Supabase environment variables not configured');
    return null;
  }
  
  try {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { 
      auth: { persistSession: false },
      db: { schema: 'public' },
      global: { headers: { 'x-application-name': 'moneybuddy-paypal-order' } }
    });
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
})();

// Security validation functions
function validateOrderInput(body: CreateOrderRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate amount
  const amount = parseFloat(body.amount);
  if (isNaN(amount) || amount <= 0 || amount > 10000) {
    errors.push('Amount must be between $0.01 and $10,000');
  }
  
  // Validate fee
  const fee = parseFloat(body.fee || '0');
  if (isNaN(fee) || fee < 0 || fee > amount * 0.1) {
    errors.push('Invalid fee amount');
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.recipient_email)) {
    errors.push('Invalid recipient email format');
  }
  
  // Validate description length
  if (body.description && body.description.length > 200) {
    errors.push('Description must be 200 characters or less');
  }
  
  return { valid: errors.length === 0, errors };
}

function checkRateLimit(userId: string): { allowed: boolean; resetTime?: number } {
  const now = Date.now();
  const userRequests = userRequestCounts.get(userId);
  
  if (!userRequests || now - userRequests.windowStart > RATE_LIMIT_WINDOW) {
    // Reset or initialize window
    userRequestCounts.set(userId, { count: 1, windowStart: now });
    return { allowed: true };
  }
  
  if (userRequests.count >= MAX_ORDERS_PER_WINDOW) {
    const resetTime = userRequests.windowStart + RATE_LIMIT_WINDOW;
    return { allowed: false, resetTime };
  }
  
  userRequests.count++;
  return { allowed: true };
}

async function logSecurityEvent(event: string, details: any, userId?: string) {
  if (!supabaseAdmin) {
    console.log(`Security event (no DB): ${event}`, JSON.stringify(details));
    return;
  }
  
  try {
    const { error } = await supabaseAdmin.from('security_logs').insert({
      event_type: event,
      details: JSON.stringify(details),
      user_id: userId,
      timestamp: new Date().toISOString(),
      ip_address: details.ip || 'unknown'
    });
    
    if (error) {
      const msg = error.message || '';
      // Don't fail operation if security_logs table doesn't exist
      if (msg.includes('does not exist') || msg.includes('relation') || 
          msg.includes('security_logs') || msg.includes('policy')) {
        console.log(`Security event (table unavailable): ${event}`, JSON.stringify(details));
      } else {
        console.error('Failed to log security event (continuing):', error);
      }
    }
  } catch (error) {
    console.log(`Security event (exception): ${event}`, JSON.stringify(details));
    console.error('Security logging exception (continuing):', error);
  }
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

  const data = await response.json() as PayPalAccessTokenResponse;
  return data.access_token;
}

serve(async (req) => {
  const originHeader = req.headers.get('origin');
  const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCors(originHeader) });
  }

  // Enhanced security headers
  const securityHeaders = {
    ...buildCors(originHeader),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    await logSecurityEvent('config_error', { error: 'Missing PayPal credentials', ip: clientIP });
    return new Response(JSON.stringify({ error: 'PayPal service temporarily unavailable.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...securityHeaders }
    });
  }

  try {
    // Extract and validate user authentication
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
          await logSecurityEvent('auth_error', { error: 'Invalid JWT token', ip: clientIP });
          return new Response(JSON.stringify({ error: 'Authentication failed.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...securityHeaders }
          });
        }
      }
    }

    if (!userId) {
      await logSecurityEvent('auth_missing', { ip: clientIP });
      return new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...securityHeaders }
      });
    }

    // Rate limiting check
    const rateLimitResult = checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      await logSecurityEvent('rate_limit_exceeded', { 
        userId, 
        ip: clientIP,
        resetTime: rateLimitResult.resetTime 
      });
      
      const remainingSeconds = Math.ceil((rateLimitResult.resetTime! - Date.now()) / 1000);
      return new Response(JSON.stringify({ 
        error: 'Too many requests. Please try again later.',
        retryAfter: remainingSeconds
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': remainingSeconds.toString(),
          ...securityHeaders 
        }
      });
    }

    const body: CreateOrderRequest = await req.json();
    
    // Input validation
    const validation = validateOrderInput(body);
    if (!validation.valid) {
      await logSecurityEvent('input_validation_failed', { 
        userId, 
        ip: clientIP,
        errors: validation.errors,
        body: { ...body, recipient_email: '[REDACTED]' } // Don't log sensitive data
      });
      
      return new Response(JSON.stringify({ 
        error: 'Invalid input data',
        details: validation.errors 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...securityHeaders }
      });
    }
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
    console.log('✅ PayPal access token obtained');

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

    console.log('🎉 PayPal order created successfully!', {
      orderId: orderData.id,
      status: orderData.status,
      approvalUrl: approvalLink?.href
    });

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