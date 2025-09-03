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
    const createPaymentIntentCode = `import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@10.17.0?target=deno";

const stripe = Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2024-06-20",
});

serve(async (req) => {
  const { amount, sender_id, sender_email, recipient_email, description } = await req.json();

  try {
    // Basic validation
    if (!amount || amount < 100) { // Example: minimum $1.00
      throw new Error("Invalid amount.");
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card'],
      receipt_email: sender_email,
      metadata: {
        sender_id,
        recipient_email,
        description,
      },
    });

    return new Response(JSON.stringify({ paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});`;

    const stripeWebhookCode = `import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@10.17.0?target=deno";

const stripe = Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")!
    );

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const { sender_id, recipient_email } = pi.metadata;
      
      const { data: senderAccount, error: senderError } = await supabase
        .from('accounts')
        .select('id, balance')
        .eq('user_id', sender_id)
        .limit(1)
        .single();
        
      if (senderError || !senderAccount) throw new Error(\`Sender account not found for user_id: \${sender_id}\`);
      
      // 1. Debit sender's account
      await supabase
        .from('accounts')
        .update({ balance: senderAccount.balance - (pi.amount / 100) })
        .eq('id', senderAccount.id);

      // 2. Credit recipient's primary account (or create a transaction to be claimed)
      // This is a simplified example. A real app might have a more complex recipient flow.
      const { data: recipientUser, error: recipientUserError } = await supabase
          .from('profiles') // Assuming a 'profiles' table with user_id and email
          .select('user_id')
          .eq('email', recipient_email)
          .single();

      if (recipientUser) {
          // Logic to credit recipient's account
      }
      
      // 3. Update our internal transaction record to 'Completed'
      await supabase
        .from('transactions')
        .update({ status: 'Completed' })
        .eq('payment_intent_id', pi.id);
    }
    
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      await supabase
        .from('transactions')
        .update({ status: 'Failed' })
        .eq('payment_intent_id', pi.id);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    return new Response(err.message, { status: 400 });
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
                <h4 className="text-lg font-semibold text-violet-200 mb-2">1. Stripe (Payment Processing)</h4>
                <p className="mb-3">This app uses Stripe to process real payments. All logic is handled securely in Supabase Edge Functions. You must set your Stripe API keys as environment variables in your Supabase project.</p>
                <p className="mb-2"><strong>Required Environment Variables for Stripe:</strong></p>
                <ul className="list-disc list-inside space-y-1 mb-3 bg-gray-900 p-3 rounded-md">
                    <li><code className="text-lime-300">STRIPE_SECRET_KEY</code>: Your Stripe secret key (e.g., <code className="text-gray-400">sk_test_...</code>).</li>
                    <li><code className="text-lime-300">STRIPE_WEBHOOK_SIGNING_SECRET</code>: The secret for verifying webhook events (e.g., <code className="text-gray-400">whsec_...</code>).</li>
                </ul>
                <p className="mb-3">
                    Set these in your Supabase project under <code className="text-lime-300">Project Settings &gt; Functions</code>. An error when sending money likely means these are missing.
                </p>
                <ExternalLink href="https://dashboard.stripe.com/apikeys">Get Stripe API Keys</ExternalLink>

                <h5 className="font-semibold text-white mt-4 mb-2">Edge Function Setup</h5>
                <p className="text-sm mb-3">You need to deploy two Edge Functions to your Supabase project. The code is provided below. Create a new function for each, copy the code, and deploy.</p>
                <div className="space-y-2">
                    <CodeAccordion title="Code for: create-payment-intent">
                       <CodeBlock>{createPaymentIntentCode}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="Code for: stripe-webhook">
                       <CodeBlock>{stripeWebhookCode}</CodeBlock>
                    </CodeAccordion>
                </div>

                 <h5 className="font-semibold text-white mt-4 mb-2">Stripe Webhook Configuration</h5>
                <p className="text-sm mb-3">Stripe uses webhooks to reliably notify your app of payment status changes. In your Stripe Dashboard, go to <ExternalLink href="https://dashboard.stripe.com/webhooks">Webhooks</ExternalLink> and add an endpoint.</p>
                 <ul className="text-sm list-disc list-inside space-y-1 mb-3 bg-gray-900 p-3 rounded-md">
                    <li><strong>Endpoint URL:</strong> Your Supabase function URL, e.g., <code className="text-lime-300">https://&lt;YOUR_PROJECT_REF&gt;.supabase.co/functions/v1/stripe-webhook</code></li>
                    <li><strong>Events to listen for:</strong> Click "Select events" and add <code className="text-lime-300">payment_intent.succeeded</code> and <code className="text-lime-300">payment_intent.payment_failed</code>.</li>
                </ul>
                <p className="text-sm">After creating the endpoint, Stripe will reveal a "signing secret". Copy this and add it as the <code className="text-lime-300">STRIPE_WEBHOOK_SIGNING_SECRET</code> environment variable in Supabase.</p>
            </section>

            <section className="p-4 border border-indigo-500/30 bg-indigo-900/20 rounded-lg">
                <h4 className="text-lg font-semibold text-indigo-200 mb-2">2. Supabase (Backend & Database)</h4>
                <p className="mb-3">Supabase handles user auth, the database, and hosts our secure Edge Functions. For the webhook to modify data, you'll need to add your <code className="text-lime-300">SUPABASE_SERVICE_ROLE_KEY</code> to the environment variables as well.</p>
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