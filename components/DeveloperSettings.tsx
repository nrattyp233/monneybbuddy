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

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PAYPAL_API_URL = Deno.env.get("PAYPAL_API_URL")!;
const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const PAYPAL_WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID")!;

async function getPayPalAccessToken() {
  const auth = btoa(\`\${CLIENT_ID}:\${CLIENT_SECRET}\`);
  const response = await fetch(\`\${PAYPAL_API_URL}/v1/oauth2/token\`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: \`Basic \${auth}\` },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Failed to get PayPal access token");
  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  const rawBody = await req.text();
  const headers = req.headers;
  
  try {
    const accessToken = await getPayPalAccessToken();
    const verificationResponse = await fetch(\`\${PAYPAL_API_URL}/v1/notifications/verify-webhook-signature\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${accessToken}\` },
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

    const body = JSON.parse(rawBody);
    if (body.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const order = body.resource;
      const orderId = order.id;
      const customId = order.purchase_units[0]?.custom_id;

      if (customId && customId.startsWith("lock_")) {
        // This is a Locked Saving payment
        const savingId = customId.replace("lock_", "");
        await supabase
          .from('locked_savings')
          .update({ status: 'Locked' })
          .eq('id', savingId);
        
        // Also create a transaction history item for the lock
        const { data: saving } = await supabase.from('locked_savings').select('*').eq('id', savingId).single();
        if (saving) {
          await supabase.from('transactions').insert({
            user_id: saving.user_id,
            from_details: 'Your Account',
            to_details: 'Locked Savings Vault',
            amount: saving.amount,
            description: \`Locked for \${saving.lock_period_months} months\`,
            type: 'lock',
            status: 'Locked',
          });
        }
      } else {
        // This is a regular P2P transaction
        await supabase
          .from('transactions')
          .update({ status: 'Completed' })
          .eq('paypal_order_id', orderId);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err) {
    console.error("Webhook processing error:", err.message);
    return new Response(err.message, { status: 400 });
  }
});`;

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
            const { data: adminUserResult } = await supabaseAdmin.from('users').select('id').eq('email', ADMIN_EMAIL).single();
            const adminUserId = adminUserResult?.id;
            if (!adminUserId) throw new Error("Admin user not found.");
            const { data: adminAccount } = await supabaseAdmin.from('accounts').select('id, balance').eq('user_id', adminUserId).limit(1).single();
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

    const createLockPaymentCode = `import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const PAYPAL_API_URL = Deno.env.get("PAYPAL_API_URL")!;
const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const PAYPAL_ADMIN_EMAIL = Deno.env.get("PAYPAL_ADMIN_EMAIL")!;

async function getPayPalAccessToken() {
  const auth = btoa(\`\${CLIENT_ID}:\${CLIENT_SECRET}\`);
  const res = await fetch(\`\${PAYPAL_API_URL}/v1/oauth2/token\`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: \`Basic \${auth}\` },
    body: "grant_type=client_credentials",
  });
  return (await res.json()).access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { accountId, amount, period } = await req.json();
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + period);

    const { data: saving, error: savingError } = await supabase
      .from('locked_savings')
      .insert({
        user_id: user.id,
        account_id: accountId,
        amount,
        lock_period_months: period,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: 'Pending',
      }).select().single();
    
    if (savingError) throw savingError;

    const accessToken = await getPayPalAccessToken();
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: amount.toFixed(2) },
        payee: { email_address: PAYPAL_ADMIN_EMAIL },
        description: \`Locked Saving: \${amount.toFixed(2)} for \${period} months\`,
        custom_id: \`lock_\${saving.id}\`, // CRITICAL for webhook to identify this transaction
      }],
      application_context: {
        return_url: 'https://example.com/success', cancel_url: 'https://example.com/cancel',
      },
    };

    const response = await fetch(\`\${PAYPAL_API_URL}/v2/checkout/orders\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${accessToken}\` },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await response.json();
    if (!response.ok) throw new Error(orderData.details?.[0]?.description || 'Failed to create PayPal order.');

    await supabase.from('locked_savings').update({ paypal_order_id: orderData.id }).eq('id', saving.id);
    const approvalLink = orderData.links.find((link) => link.rel === 'approve');

    return new Response(JSON.stringify({ approval_url: approvalLink.href }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});`;

    const processLockWithdrawalCode = `import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const PAYPAL_API_URL = Deno.env.get("PAYPAL_API_URL")!;
const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const EARLY_WITHDRAWAL_PENALTY_RATE = 0.05;

async function getPayPalAccessToken() {
  const auth = btoa(\`\${CLIENT_ID}:\${CLIENT_SECRET}\`);
  const res = await fetch(\`\${PAYPAL_API_URL}/v1/oauth2/token\`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: \`Basic \${auth}\` },
    body: "grant_type=client_credentials",
  });
  return (await res.json()).access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { savingId } = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { data: saving, error } = await supabaseAdmin.from('locked_savings').select('*').eq('id', savingId).single();
    if (error || !saving) throw new Error("Saving not found.");
    if (saving.user_id !== user.id) throw new Error("Unauthorized access.");
    if (saving.status !== 'Locked') throw new Error("Saving is not in a withdrawable state.");

    const isEarly = new Date() < new Date(saving.end_date);
    const penalty = isEarly ? saving.amount * EARLY_WITHDRAWAL_PENALTY_RATE : 0;
    const payoutAmount = saving.amount - penalty;

    const accessToken = await getPayPalAccessToken();
    const payoutPayload = {
      sender_batch_header: {
        sender_batch_id: \`SAVING_WITHDRAW_\${saving.id}_\${Date.now()}\`,
        email_subject: "Your Money Buddy Savings Withdrawal is Complete!",
        email_message: \`Your withdrawal of \${payoutAmount.toFixed(2)} USD from your locked saving is being processed.\`,
      },
      items: [{
        recipient_type: "EMAIL",
        amount: { value: payoutAmount.toFixed(2), currency: "USD" },
        note: "Locked savings withdrawal.",
        sender_item_id: saving.id,
        receiver: user.email,
      }],
    };

    const response = await fetch(\`\${PAYPAL_API_URL}/v1/payments/payouts\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${accessToken}\` },
      body: JSON.stringify(payoutPayload),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("PayPal Payouts API Error:", errorData);
        throw new Error(errorData.message || "Failed to initiate PayPal payout.");
    }

    await supabaseAdmin.from('locked_savings').update({ status: 'Withdrawn' }).eq('id', saving.id);
    
    if (isEarly) {
      await supabaseAdmin.from('transactions').insert({
        user_id: user.id, from_details: 'Locked Savings Vault', to_details: 'Penalty', amount: penalty,
        description: '5% Early withdrawal penalty', type: 'penalty', status: 'Completed',
      });
    }
    await supabaseAdmin.from('transactions').insert({
      user_id: user.id, from_details: 'Locked Savings Vault', to_details: 'Your Account', amount: payoutAmount,
      description: 'Withdrawal from savings', type: 'receive', status: 'Completed',
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});`;

    return (
        <div className="space-y-8 text-gray-300 max-h-[70vh] overflow-y-auto pr-2">
            
            <section>
                <h3 className="text-xl font-bold text-white mb-3">API Keys & Service Setup Guide</h3>
                <p>This application requires several external services to function correctly. This guide explains what keys are needed and where to configure them. <strong className="text-yellow-300">These keys should be kept secret and never exposed in client-side code.</strong></p>
            </section>
            
            <section className="p-4 border border-violet-500/30 bg-violet-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-violet-200 mb-2">1. PayPal (Payment Processing)</h4>
                <p className="mb-3">This app uses the PayPal REST API to process payments. You must set your PayPal API keys as environment variables in your Supabase project.</p>
                <p className="mb-2"><strong>Required Environment Variables for PayPal:</strong></p>
                <ul className="list-disc list-inside space-y-1 mb-3 bg-gray-900 p-3 rounded-md">
                    <li><code className="text-lime-300">PAYPAL_CLIENT_ID</code>: Your PayPal App Client ID.</li>
                    <li><code className="text-lime-300">PAYPAL_CLIENT_SECRET</code>: Your PayPal App Secret.</li>
                    <li><code className="text-lime-300">PAYPAL_API_URL</code>: Use <code className="text-gray-400">https://api-m.sandbox.paypal.com</code> for testing or <code className="text-gray-400">https://api-m.paypal.com</code> for production.</li>
                    <li><code className="text-lime-300">PAYPAL_WEBHOOK_ID</code>: The ID of the webhook you create in the PayPal dashboard.</li>
                    <li><code className="text-lime-300">PAYPAL_ADMIN_EMAIL</code>: Your PayPal business email to receive platform fees and hold locked funds.</li>
                </ul>
                 <p className="text-sm font-bold text-yellow-300 my-3">
                    <strong className="block">Important: PayPal Payouts API</strong>
                    The Locked Savings withdrawal feature uses the PayPal Payouts API, which is a restricted product. You must contact PayPal business support to have Payouts enabled for your live account. It is usually available by default in the Sandbox environment for testing.
                </p>
                <ExternalLink href="https://developer.paypal.com/dashboard/applications/create">Get PayPal API Keys</ExternalLink>

                <h5 className="font-semibold text-white mt-4 mb-2">Edge Function Setup</h5>
                <p className="text-sm mb-3">You need to deploy five Edge Functions to your Supabase project. The code is provided below.</p>
                <div className="space-y-2">
                    <CodeAccordion title="Code for: create-paypal-order">
                       <CodeBlock>{createPayPalOrderCode}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="Code for: paypal-webhook (Updated)">
                       <CodeBlock>{payPalWebhookCode}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="Code for: claim-transaction">
                       <CodeBlock>{claimTransactionCode}</CodeBlock>
                    </CodeAccordion>
                    <CodeAccordion title="Code for: create-lock-payment (New)">
                       <CodeBlock>{createLockPaymentCode}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="Code for: process-lock-withdrawal (New)">
                       <CodeBlock>{processLockWithdrawalCode}</CodeBlock>
                    </CodeAccordion>
                </div>

                 <h5 className="font-semibold text-white mt-4 mb-2">PayPal Webhook Configuration</h5>
                <p className="text-sm mb-3">In your PayPal Developer Dashboard, configure a webhook to listen for the <code className="text-lime-300">CHECKOUT.ORDER.APPROVED</code> event. This single webhook will now handle both regular payments and locked savings confirmations.</p>
            </section>

            <section className="p-4 border border-indigo-500/30 bg-indigo-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-indigo-200 mb-2">2. Supabase (Backend & Database)</h4>
                <p className="mb-3">Supabase handles user auth, the database, and hosts our secure Edge Functions. You'll need to add your <code className="text-lime-300">SUPABASE_SERVICE_ROLE_KEY</code> to the environment variables. You also need an <code className="text-lime-300">ADMIN_EMAIL</code> variable for internal fee transactions (this can be the same as your PayPal admin email).</p>
                <ExternalLink href="https://supabase.com/dashboard">Go to Supabase Dashboard</ExternalLink>
            </section>
            
            <section className="p-4 border border-cyan-500/30 bg-cyan-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-cyan-200 mb-2">3. Plaid (Bank Account Linking)</h4>
                <p className="mb-3">Plaid integration for linking bank accounts is also handled by Edge Functions. You must set your Plaid API keys as environment variables in Supabase.</p>
                <ExternalLink href="https://dashboard.plaid.com/">Get Plaid API Keys</ExternalLink>
            </section>
            
            <section className="p-4 border border-lime-500/30 bg-lime-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-lime-200 mb-2">4. Google Gemini (AI Security Tips)</h4>
                <p className="mb-3">The AI-powered security tips are generated by the Google Gemini API. The app expects the API key to be available as a hosting environment variable named <code className="text-lime-300">API_KEY</code>.</p>
                <ExternalLink href="https://aistudio.google.com/app/apikey">Get Gemini API Key</ExternalLink>
            </section>
        </div>
    );
};

export default DeveloperSettings;