import React, { useState } from 'react';

const CodeBlock = ({ children }: { children: React.ReactNode }) => (
    <pre className="bg-gray-900 rounded-md p-3 text-sm text-lime-300 font-mono overflow-x-auto">
        <code>{children}</code>
    </pre>
);

const ExternalLink = ({ href, children }: { href: string, children: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-lime-400 hover:text-lime-300 underline font-semibold">
        {children}
    </a>
);

const CodeAccordion: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="bg-gray-900/70 rounded-lg">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-left p-3 font-semibold text-lime-300 flex justify-between items-center"
            >
                {title}
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isOpen && <div className="p-2 border-t border-lime-500/20">{children}</div>}
        </div>
    );
};


const DeveloperSettings: React.FC = () => {
    const createPayPalOrderCode = `import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PAYPAL_API_URL = Deno.env.get("PAYPAL_API_URL")!;
const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const PAYPAL_ADMIN_EMAIL = Deno.env.get("PAYPAL_ADMIN_EMAIL")!;

// Function to get PayPal Access Token
async function getPayPalAccessToken() {
  const auth = btoa(\`\${CLIENT_ID}:\${CLIENT_SECRET}\`);
  const response = await fetch(\`\${PAYPAL_API_URL}/v1/oauth2/token\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: \`Basic \${auth}\`,
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  // This is needed for the browser to be able to invoke the function
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { amount, fee, recipient_email, description } = await req.json();

  try {
    const accessToken = await getPayPalAccessToken();
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: amount, // The amount the recipient will get
        },
        payee: {
          email_address: recipient_email
        },
        description: description,
        payment_instruction: {
            platform_fees: [
                {
                    amount: {
                        currency_code: 'USD',
                        value: fee // The 3% fee
                    },
                    payee: {
                        email_address: PAYPAL_ADMIN_EMAIL // Your admin PayPal account
                    }
                }
            ]
        }
      }],
      application_context: {
        return_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      },
    };

    const response = await fetch(\`\${PAYPAL_API_URL}/v2/checkout/orders\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${accessToken}\`,
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await response.json();
    
    if (!response.ok) {
        // Log the detailed error from PayPal for debugging
        console.error("PayPal API Error:", JSON.stringify(orderData, null, 2));
        const errorMessage = orderData.details?.[0]?.description || orderData.message || 'Failed to create PayPal order.';
        throw new Error(errorMessage);
    }

    const approvalLink = orderData.links.find((link: any) => link.rel === 'approve');
    
    return new Response(JSON.stringify({ 
        orderId: orderData.id, 
        approval_url: approvalLink.href 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});`;

    const payPalWebhookCode = `import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Initialize Supabase Admin Client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// PayPal API Credentials
const PAYPAL_API_URL = Deno.env.get("PAYPAL_API_URL")!;
const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const PAYPAL_WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID")!;

// Function to get a fresh PayPal Access Token
async function getPayPalAccessToken() {
  const auth = btoa(\`\${CLIENT_ID}:\${CLIENT_SECRET}\`);
  const response = await fetch(\`\${PAYPAL_API_URL}/v1/oauth2/token\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: \`Basic \${auth}\`,
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Failed to get PayPal access token");
  const data = await response.json();
  return data.access_token;
}

// Main server function
serve(async (req) => {
  const rawBody = await req.text(); // Raw body is needed for verification
  const headers = req.headers;
  
  try {
    // Step 1: VERIFY THE WEBHOOK SIGNATURE to ensure it's from PayPal
    const accessToken = await getPayPalAccessToken();
    const verificationResponse = await fetch(\`\${PAYPAL_API_URL}/v1/notifications/verify-webhook-signature\`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${accessToken}\`,
        },
        body: JSON.stringify({
            transmission_id: headers.get('paypal-transmission-id'),
            transmission_time: headers.get('paypal-transmission-time'),
            cert_url: headers.get('paypal-cert-url'),
            auth_algo: headers.get('paypal-auth-algo'),
            transmission_sig: headers.get('paypal-transmission-sig'),
            webhook_id: PAYPAL_WEBHOOK_ID,
            webhook_event: JSON.parse(rawBody)
        })
    });

    const verificationData = await verificationResponse.json();
    if (verificationData.verification_status !== 'SUCCESS') {
        console.error("PayPal webhook verification failed:", verificationData);
        return new Response("Webhook verification failed.", { status: 401 });
    }

    // Step 2: Process the verified event
    const body = JSON.parse(rawBody);

    if (body.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = body.resource.id;

      // Find our internal transaction record linked to this PayPal order
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('paypal_order_id', orderId)
        .eq('status', 'Pending')
        .single();
      
      if (txError || !transaction) {
          // This can happen if the webhook is received twice or for an old/unknown order.
          // It's safe to ignore it by returning a 200 OK.
          console.warn(\`Webhook received for unknown or already processed order: \${orderId}\`);
          return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // Update our internal transaction status to 'Completed'.
      // This confirms the payment is successful.
      await supabase
        .from('transactions')
        .update({ status: 'Completed' })
        .eq('id', transaction.id);
    }

    // Always return a 200 OK to PayPal to acknowledge receipt
    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err) {
    console.error("Webhook processing error:", err.message);
    return new Response(err.message, { status: 400 });
  }
});
`;

    const claimTransactionCode = `import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL")!; // e.g., 'admin@moneybuddy.app'

// Haversine distance formula to calculate distance between two lat/lon points in km
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { transactionId, userCoordinates } = await req.json();

        // Use the SERVICE_ROLE_KEY to perform admin-level tasks
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        
        // Initialize a second client with user's auth to verify ownership
        const supabaseUser = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const { data: { user } } = await supabaseUser.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { data: tx, error: txError } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .eq('id', transactionId)
            .single();

        if (txError || !tx) throw new Error("Transaction not found.");
        if (tx.to_details !== user.email) throw new Error("You are not the recipient of this transaction.");
        if (tx.status !== 'Pending') throw new Error("This transaction is not pending and cannot be claimed.");

        // --- VALIDATE RESTRICTIONS ---
        if (tx.time_restriction && new Date(tx.time_restriction.expiresAt) < new Date()) {
            await supabaseAdmin.from('transactions').update({ status: 'Failed' }).eq('id', tx.id);
            // In a real app, you would also need a separate process to refund the sender.
            throw new Error("This transaction has expired.");
        }

        if (tx.geo_fence) {
            if (!userCoordinates) throw new Error("Your location is required.");
            const distance = getDistanceInKm(
                tx.geo_fence.latitude, tx.geo_fence.longitude,
                userCoordinates.latitude, userCoordinates.longitude
            );
            if (distance > tx.geo_fence.radiusKm) {
                throw new Error(\`You are too far away. You must be within \${tx.geo_fence.radiusKm} km to claim.\`);
            }
        }
        
        // --- PROCESS THE TRANSFER ---
        // 1. Credit Recipient
        const { data: recipientAccount } = await supabaseAdmin.from('accounts').select('id, balance').eq('user_id', user.id).limit(1).single();
        if (!recipientAccount) throw new Error("Recipient does not have an account.");
        await supabaseAdmin.from('accounts').update({ balance: (recipientAccount.balance || 0) + tx.amount }).eq('id', recipientAccount.id);

        // 2. Credit Admin for the Fee
        if (tx.fee && tx.fee > 0) {
            const { data: adminUser } = await supabaseAdmin.from('users').select('id').eq('email', ADMIN_EMAIL).single();
            if (!adminUser) throw new Error("Admin user not found.");
            const { data: adminAccount } = await supabaseAdmin.from('accounts').select('id, balance').eq('user_id', adminUser.id).limit(1).single();
            if (!adminAccount) throw new Error("Admin account not found.");
            await supabaseAdmin.from('accounts').update({ balance: (adminAccount.balance || 0) + tx.fee }).eq('id', adminAccount.id);
            
            // Create a record for the fee transaction
            await supabaseAdmin.from('transactions').insert({
                from_details: tx.from_details, to_details: ADMIN_EMAIL, amount: tx.fee,
                description: \`Fee for tx: \${tx.id}\`, type: 'fee', status: 'Completed'
            });
        }
        
        // 3. Mark original transaction as completed
        await supabaseAdmin.from('transactions').update({ status: 'Completed' }).eq('id', tx.id);

        return new Response(JSON.stringify({ success: true, message: "Transaction claimed!" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
`;

    return (
        <div className="space-y-8 text-gray-300 max-h-[70vh] overflow-y-auto pr-2">
            
            <section>
                <h3 className="text-xl font-bold text-white mb-3">API Keys & Service Setup Guide</h3>
                <p>This application requires several external services to function correctly. This guide explains what keys are needed and where to configure them. <strong className="text-yellow-300">These keys should be kept secret and never exposed in client-side code.</strong></p>
            </section>
            
            <section className="p-4 border border-violet-500/30 bg-violet-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-violet-200 mb-2">1. PayPal (Payment Processing)</h4>
                <p className="mb-3">This app uses the PayPal REST API to process payments for direct (unrestricted) transfers. All logic is handled securely in Supabase Edge Functions. You must set your PayPal API keys as environment variables in your Supabase project.</p>
                <p className="mb-2"><strong>Required Environment Variables for PayPal:</strong></p>
                <ul className="list-disc list-inside space-y-1 mb-3 bg-gray-900 p-3 rounded-md">
                    <li><code className="text-lime-300">PAYPAL_CLIENT_ID</code>: Your PayPal App Client ID.</li>
                    <li><code className="text-lime-300">PAYPAL_CLIENT_SECRET</code>: Your PayPal App Secret.</li>
                    <li><code className="text-lime-300">PAYPAL_API_URL</code>: Use <code className="text-gray-400">https://api-m.sandbox.paypal.com</code> for testing or <code className="text-gray-400">https://api-m.paypal.com</code> for production.</li>
                    <li><code className="text-lime-300">PAYPAL_WEBHOOK_ID</code>: The ID of the webhook you create in the PayPal dashboard.</li>
                    <li><code className="text-lime-300">PAYPAL_ADMIN_EMAIL</code>: Your PayPal business email to receive platform fees.</li>
                </ul>
                <p className="mb-3">
                    Set these in your Supabase project under <code className="text-lime-300">Project Settings &gt; Functions</code>. An error when sending money or confirming payments likely means these are missing.
                </p>
                <ExternalLink href="https://developer.paypal.com/dashboard/applications/create">Get PayPal API Keys</ExternalLink>

                <h5 className="font-semibold text-white mt-4 mb-2">Edge Function Setup</h5>
                <p className="text-sm mb-3">You need to deploy three Edge Functions to your Supabase project: one for creating PayPal orders, one for handling PayPal's confirmation webhook, and a new one for claiming conditional (geofenced) payments. The code is provided below.</p>
                <div className="space-y-2">
                    <CodeAccordion title="Code for: create-paypal-order">
                       <CodeBlock>{createPayPalOrderCode}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="Code for: paypal-webhook">
                       <CodeBlock>{payPalWebhookCode}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="Code for: claim-transaction">
                       <CodeBlock>{claimTransactionCode}</CodeBlock>
                    </CodeAccordion>
                </div>

                 <h5 className="font-semibold text-white mt-4 mb-2">PayPal Webhook Configuration</h5>
                <p className="text-sm mb-3">PayPal uses webhooks to reliably notify your app of payment status changes for direct payments. In your PayPal Developer Dashboard, go to your App's settings and add a webhook.</p>
                 <ul className="text-sm list-disc list-inside space-y-1 mb-3 bg-gray-900 p-3 rounded-md">
                    <li><strong>Webhook URL:</strong> Your Supabase function URL, e.g., <code className="text-lime-300">https://&lt;YOUR_PROJECT_REF&gt;.supabase.co/functions/v1/paypal-webhook</code></li>
                    <li><strong>Event types:</strong> Check the event <code className="text-lime-300">CHECKOUT.ORDER.APPROVED</code>. This is fired when the customer successfully approves the payment.</li>
                    <li><strong>Get Webhook ID:</strong> After creating the webhook, copy its ID and set it as the <code className="text-lime-300">PAYPAL_WEBHOOK_ID</code> environment variable in Supabase.</li>
                </ul>
                <p className="text-sm">The provided webhook code is production-ready and includes mandatory signature verification by calling PayPal's verification API. This ensures your app only processes legitimate transactions.</p>
            </section>

            <section className="p-4 border border-indigo-500/30 bg-indigo-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-indigo-200 mb-2">2. Supabase (Backend & Database)</h4>
                <p className="mb-3">Supabase handles user auth, the database, and hosts our secure Edge Functions. For the webhook and claim functions to modify data, you'll need to add your <code className="text-lime-300">SUPABASE_SERVICE_ROLE_KEY</code> to the environment variables as well. You also need an <code className="text-lime-300">ADMIN_EMAIL</code> variable for internal fee transactions.</p>
                <ExternalLink href="https://supabase.com/dashboard">Go to Supabase Dashboard</ExternalLink>
            </section>
            
            <section className="p-4 border border-cyan-500/30 bg-cyan-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-cyan-200 mb-2">3. Plaid (Bank Account Linking)</h4>
                <p className="mb-3">Plaid integration for linking bank accounts is also handled by Edge Functions. You must set your Plaid API keys as environment variables in Supabase.</p>
                <p className="mb-2"><strong>Required Environment Variables for Plaid:</strong></p>
                <ul className="list-disc list-inside space-y-1 mb-3 bg-gray-900 p-3 rounded-md">
                    <li><code className="text-lime-300">PLAID_CLIENT_ID</code></li>
                    <li><code className="text-lime-300">PLAID_SECRET</code></li>
                    <li><code className="text-lime-300">PLAID_ENV</code> (e.g., 'sandbox')</li>
                </ul>
                <ExternalLink href="https://dashboard.plaid.com/">Get Plaid API Keys</ExternalLink>
            </section>
            
            <section className="p-4 border border-lime-500/30 bg-lime-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-lime-200 mb-2">4. Google Gemini (AI Security Tips)</h4>
                <p className="mb-3">The AI-powered security tips are generated by the Google Gemini API. The app expects the API key to be available as a hosting environment variable.</p>
                <p className="mb-2"><strong>Required Environment Variable:</strong></p>
                <CodeBlock>API_KEY</CodeBlock>
                 <p className="mt-3 mb-3">
                    The client-side code in <code className="text-lime-300">services/geminiService.ts</code> uses `process.env.API_KEY` to initialize the client.
                </p>
                <ExternalLink href="https://aistudio.google.com/app/apikey">Get Gemini API Key</ExternalLink>
            </section>
        </div>
    );
};

export default DeveloperSettings;