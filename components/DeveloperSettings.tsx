import React, { useState, useEffect } from 'react';

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

const CodeAccordion: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="bg-gray-900/70 rounded-lg">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-left p-3 flex justify-between items-center"
            >
                <div>
                    <p className="font-semibold text-lime-300">{title}</p>
                    <p className="text-xs text-gray-400 mt-1">{description}</p>
                </div>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : 'text-gray-500'}`}>{isOpen ? '▼' : '▶'}</span>
            </button>
            {isOpen && <div className="p-2 border-t border-lime-500/20">{children}</div>}
        </div>
    );
};

// The full SQL script is embedded here for easy access within the guide.
const sqlScript = `-- Money Buddy Supabase Setup Script
-- This script sets up the required tables, types, and policies for the app.
-- Run this entire script in your Supabase SQL Editor.

-- 1. Create custom types for better data integrity
CREATE TYPE public.transaction_status AS ENUM (
    'Pending',
    'Completed',
    'Failed',
    'Returned',
    'Locked',
    'Declined'
);

CREATE TYPE public.transaction_type AS ENUM (
    'send',
    'receive',
    'lock',
    'penalty',
    'request',
    'fee'
);

CREATE TYPE public.saving_status AS ENUM (
    'Pending',
    'Locked',
    'Withdrawn',
    'Failed'
);

-- 2. Create the users table to store public profile information
-- This table will be linked to the auth.users table.
CREATE TABLE public.users (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name character varying,
    email character varying UNIQUE
);

-- 3. Set up Row Level Security (RLS) for the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- Users can see their own profile
CREATE POLICY "Users can view their own data" ON public.users FOR SELECT
USING (auth.uid() = id);
-- Users can update their own profile
CREATE POLICY "Users can update their own data" ON public.users FOR UPDATE
USING (auth.uid() = id);

-- 4. Create a function to automatically insert a new user into the public.users table upon sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (new.id, new.raw_user_meta_data->>'name', new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create a trigger to call the function when a new user is created in auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. Create the accounts table
CREATE TABLE public.accounts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name character varying NOT NULL,
    provider character varying NOT NULL,
    type character varying,
    balance numeric(10, 2),
    logo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. Set up RLS for the accounts table
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own accounts" ON public.accounts FOR ALL
USING (auth.uid() = user_id);

-- 8. Create the transactions table
CREATE TABLE public.transactions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Can be null for system transactions
    from_details text NOT NULL,
    to_details text NOT NULL,
    amount numeric(10, 2) NOT NULL,
    fee numeric(10, 2) DEFAULT 0.00,
    description text,
    type public.transaction_type NOT NULL,
    status public.transaction_status NOT NULL,
    geo_fence jsonb,
    time_restriction jsonb,
    paypal_order_id text UNIQUE,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 9. Set up RLS for the transactions table
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE public.users.id = auth.uid()
        AND (public.users.email = public.transactions.from_details OR public.users.email = public.transactions.to_details)
    )
);
-- Allow users to insert transactions where they are the sender
CREATE POLICY "Users can create transactions from their own email" ON public.transactions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE public.users.id = auth.uid() AND public.users.email = public.transactions.from_details
    )
);
-- Allow users to update the status of transactions sent TO them (e.g., declining a request)
CREATE POLICY "Users can update status on transactions sent to them" ON public.transactions FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE public.users.id = auth.uid() AND public.users.email = public.transactions.to_details
    )
);


-- 10. Create the locked_savings table
CREATE TABLE public.locked_savings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    amount numeric(10, 2) NOT NULL,
    lock_period_months integer NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    status public.saving_status NOT NULL,
    paypal_order_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 11. Set up RLS for the locked_savings table
ALTER TABLE public.locked_savings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own locked savings" ON public.locked_savings FOR ALL
USING (auth.uid() = user_id);

-- 12. Seed an initial account for the admin user (optional, but helpful for testing)
-- NOTE: You must replace 'lucasnale305@gmail.com' with the email of the user
-- you designated as ADMIN_EMAIL in the App.tsx file.
-- This part is best run manually after the admin user has signed up.
/*
INSERT INTO public.accounts (user_id, name, provider, type, balance)
SELECT id, 'Admin Fee Account', 'System', 'checking', 0.00
FROM auth.users
WHERE email = 'lucasnale305@gmail.com';
*/

-- End of script
`;

const SUPABASE_URL = "https://thdmywgjbhdtgtqnqizn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZG15d2dqYmhkdGd0cW5xaXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MzY5ODYsImV4cCI6MjA2OTMxMjk4Nn0.CLUC8eFtRQBHz6-570NJWZ8QIZs3ty0QGuDmEF5eeFc";


interface DeveloperSettingsProps {
    currentUserEmail: string;
}

const DeveloperSettings: React.FC<DeveloperSettingsProps> = ({ currentUserEmail }) => {
    const [config, setConfig] = useState({
        paypalClientId: '',
        paypalClientSecret: '',
        paypalApiUrl: 'https://api-m.sandbox.paypal.com',
        paypalWebhookId: '',
        paypalAdminEmail: currentUserEmail,
        supabaseServiceRoleKey: '',
        adminEmail: currentUserEmail,
        plaidClientId: '',
        plaidSecret: '',
        plaidEnv: 'sandbox',
        geminiApiKey: ''
    });
    const [showSecrets, setShowSecrets] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [copySqlStatus, setCopySqlStatus] = useState('Copy Script');

    useEffect(() => {
        const savedConfig = localStorage.getItem('moneyBuddyDevConfig');
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            setConfig(prev => ({
                ...prev, 
                ...parsed, 
                paypalAdminEmail: parsed.paypalAdminEmail || currentUserEmail,
                adminEmail: parsed.adminEmail || currentUserEmail
            }));
        } else {
            setConfig(prev => ({ ...prev, paypalAdminEmail: currentUserEmail, adminEmail: currentUserEmail }));
        }
    }, [currentUserEmail]);

    const handleSaveConfig = () => {
        setSaveStatus('saving');
        localStorage.setItem('moneyBuddyDevConfig', JSON.stringify(config));
        setTimeout(() => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }, 500);
    };
    
    const handleCopySql = () => {
        navigator.clipboard.writeText(sqlScript);
        setCopySqlStatus('Copied!');
        setTimeout(() => setCopySqlStatus('Copy Script'), 2000);
    };

    const handleCopy = (value: string) => {
        navigator.clipboard.writeText(value);
    };
    
    const InputField = ({ name, label, value, note }: { name: keyof typeof config; label: string; value: string; note?: string }) => {
        const nameStr = String(name);
        const isSecret = nameStr.toLowerCase().includes('secret') || nameStr.toLowerCase().includes('key');
        return (
            <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
                <div className="relative flex items-center">
                    <input
                        type={isSecret && !showSecrets ? 'password' : 'text'}
                        id={name}
                        name={name}
                        value={value}
                        onChange={(e) => setConfig({ ...config, [name]: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 font-mono text-lime-300 focus:ring-lime-400 focus:border-lime-400 transition pr-10"
                    />
                    <button 
                        onClick={() => handleCopy(value)}
                        className="absolute right-2 p-1 text-gray-400 hover:text-white"
                        title="Copy"
                        >
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 2A1.5 1.5 0 0 1 .5 3.5V12h6V3.5A1.5 1.5 0 0 1 8 2H-1z"/></svg>
                    </button>
                </div>
                 {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
            </div>
        );
    };
    
    return (
        <div className="space-y-6 text-gray-300 max-h-[70vh] overflow-y-auto pr-2">
            
            <section>
                <h3 className="text-xl font-bold text-white mb-3">Backend Setup Guide</h3>
                <p>This application requires several external services to function correctly. Follow these steps to configure your backend on <ExternalLink href="https://supabase.com/">Supabase</ExternalLink>.</p>
            </section>
            
            <section>
                <h3 className="text-xl font-bold text-white mb-3">Step 0: Prerequisites & Frontend Connection</h3>
                 <p className="mb-3">
                    This frontend application is pre-configured to connect to a specific Supabase project to make getting started easier. The connection details are hardcoded in the file <code>services/supabase.ts</code>.
                </p>
                 <div className="space-y-2 p-3 bg-gray-900/50 rounded-lg border border-white/10 text-sm font-mono">
                    <p>SUPABASE_URL: "{SUPABASE_URL}"</p>
                    <p>SUPABASE_ANON_KEY: "{SUPABASE_ANON_KEY.substring(0, 20)}..."</p>
                </div>
                 <p className="text-xs text-gray-400 mt-2">
                    For a production application, you would replace these values with your own Supabase project's credentials.
                </p>
            </section>

            <section>
                <h3 className="text-xl font-bold text-white mb-3">Step 1: Set Backend Environment Variables</h3>
                <p className="mb-3">Gather your API keys and add them as Secrets in your Supabase project dashboard under `Project Settings` &gt; `Secrets`. The backend functions rely on these to communicate with other services.</p>
                 <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-sm">
                    <strong>Disclaimer:</strong> Saving API keys here only stores them in your browser's local storage for convenience. You must <strong className="font-bold">manually</strong> set these values in your Supabase project for the backend to work.
                </div>
                <div className="space-y-4 p-4 mt-4 bg-gray-900/50 rounded-lg border border-white/10">
                    <div className="flex justify-between items-center">
                        <h4 className="text-lg font-semibold text-white">Configuration Values</h4>
                        <label className="flex items-center space-x-2 cursor-pointer text-sm">
                            <input type="checkbox" checked={showSecrets} onChange={() => setShowSecrets(!showSecrets)} className="form-checkbox h-4 w-4 rounded bg-gray-700 text-lime-500 focus:ring-lime-500 border-gray-600"/>
                            <span>Show Secrets</span>
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField name="paypalClientId" label="PAYPAL_CLIENT_ID" value={config.paypalClientId} />
                        <InputField name="paypalClientSecret" label="PAYPAL_CLIENT_SECRET" value={config.paypalClientSecret} />
                        <InputField name="paypalApiUrl" label="PAYPAL_API_URL" value={config.paypalApiUrl} note="Use sandbox URL for testing."/>
                        <InputField name="paypalWebhookId" label="PAYPAL_WEBHOOK_ID" value={config.paypalWebhookId} />
                        <InputField name="paypalAdminEmail" label="PAYPAL_ADMIN_EMAIL" value={config.paypalAdminEmail} note="This is where fees and locked funds are sent."/>
                        
                        <InputField name="supabaseServiceRoleKey" label="SUPABASE_SERVICE_ROLE_KEY" value={config.supabaseServiceRoleKey} note="Found in your Supabase project's API settings. Crucial for functions that need to bypass RLS."/>
                        <InputField name="adminEmail" label="ADMIN_EMAIL" value={config.adminEmail} note="Used for internal transaction tracking."/>

                        <InputField name="plaidClientId" label="PLAID_CLIENT_ID" value={config.plaidClientId} />
                        <InputField name="plaidSecret" label="PLAID_SECRET" value={config.plaidSecret} />
                        <InputField name="plaidEnv" label="PLAID_ENV" value={config.plaidEnv} note="'sandbox', 'development', or 'production'"/>

                        <InputField name="geminiApiKey" label="API_KEY (for Gemini)" value={config.geminiApiKey} />
                    </div>

                    <div className="pt-2 text-right">
                        <button 
                            onClick={handleSaveConfig}
                            className="bg-lime-600 hover:bg-lime-500 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                            disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                        >
                            {saveStatus === 'idle' && 'Save to Browser'}
                            {saveStatus === 'saving' && 'Saving...'}
                            {saveStatus === 'saved' && 'Saved!'}
                        </button>
                    </div>
                </div>
            </section>
            
            <section className="pt-4">
                <h3 className="text-xl font-bold text-white mb-3">Step 2: Database Setup</h3>
                <p className="mb-3">
                    Next, create the database tables and security policies. The script below handles everything.
                </p>
                <ul className="list-disc list-inside mb-3 space-y-1 text-sm">
                    <li>Builds the <code>users</code>, <code>accounts</code>, <code>transactions</code>, and <code>locked_savings</code> tables.</li>
                    <li>Sets up a trigger to automatically create a user profile on sign-up.</li>
                    <li>
                        <strong className="text-yellow-300">Enforces Row Level Security (RLS)</strong> to ensure users can only access their own data.
                    </li>
                </ul>
                <p className="mb-4">
                    Go to the <ExternalLink href="https://app.supabase.io/project/_/sql">SQL Editor</ExternalLink> in your Supabase dashboard, paste this entire script, and click "RUN".
                </p>
                <div className="relative">
                    <button
                        onClick={handleCopySql}
                        className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-colors"
                    >
                        {copySqlStatus}
                    </button>
                    <CodeBlock>{sqlScript}</CodeBlock>
                </div>
            </section>

            <section className="pt-4">
                 <h3 className="text-xl font-bold text-white mb-3">Step 3: Deploy Backend Edge Functions</h3>
                 <p className="mb-3">Deploy the following five functions to your Supabase project. Each function's code is provided below for you to copy into a file.</p>
                
                 <div className="my-4">
                    <h4 className="font-semibold text-white mb-2">How to Deploy</h4>
                    <p className="text-sm mb-2">The recommended way to deploy is using the Supabase CLI. After <ExternalLink href="https://supabase.com/docs/guides/cli/getting-started">installing the CLI</ExternalLink> and linking your project, create a file for each function (e.g., `supabase/functions/create-paypal-order/index.ts`), paste the code, and run:</p>
                    <CodeBlock>{`supabase functions deploy <function-name>`}</CodeBlock>
                 </div>

                <div className="space-y-2">
                    <CodeAccordion title="create-paypal-order" description="Initiates a PayPal payment and returns an approval URL.">
                       <CodeBlock>{`import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
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
});`}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="paypal-webhook" description="Listens for PayPal's confirmation signal to update transaction statuses.">
                       <CodeBlock>{`import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
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
});`}</CodeBlock>
                    </CodeAccordion>
                     <CodeAccordion title="claim-transaction" description="Verifies a user's location and time to complete a conditional payment.">
                       <CodeBlock>{`import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL")!;

// Haversine distance formula to calculate distance between two lat/lon points in km
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { transactionId, userCoordinates } = await req.json();
        
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { data: tx, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', transactionId)
            .single();

        if (txError || !tx) throw new Error("Transaction not found or access denied.");
        if (tx.to_details !== user.email) throw new Error("You are not the recipient of this transaction.");
        if (tx.status !== 'Pending') throw new Error("Transaction is not in a claimable state.");

        // Check time restriction
        if (tx.time_restriction && new Date() > new Date(tx.time_restriction.expiresAt)) {
            // Logic to return funds to sender would go here
            await supabase.from('transactions').update({ status: 'Returned', description: \`\${tx.description} (Expired)\` }).eq('id', transactionId);
            throw new Error("This transaction has expired.");
        }

        // Check geofence
        if (tx.geo_fence && userCoordinates) {
            const distance = getDistanceInKm(
                userCoordinates.latitude, userCoordinates.longitude,
                tx.geo_fence.latitude, tx.geo_fence.longitude
            );
            if (distance > tx.geo_fence.radiusKm) {
                throw new Error(\`You are not within the required geofence. You are \${distance.toFixed(2)}km away, but need to be within \${tx.geo_fence.radiusKm}km.\`);
            }
        } else if (tx.geo_fence && !userCoordinates) {
            throw new Error("User location is required to claim this transaction.");
        }

        // All checks passed. Complete the transaction.
        const { error: updateError } = await supabase
            .from('transactions')
            .update({ status: 'Completed' })
            .eq('id', transactionId);

        if (updateError) throw updateError;
        
        // Create a 'receive' transaction for the recipient's history
        const { error: receiveError } = await supabase.from('transactions').insert({
             user_id: user.id,
             from_details: tx.from_details,
             to_details: user.email,
             amount: tx.amount,
             description: \`Received: \${tx.description}\`,
             type: 'receive',
             status: 'Completed',
        });
        if (receiveError) console.error("Could not create 'receive' record:", receiveError);


        return new Response(JSON.stringify({ message: "Transaction claimed successfully." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});`}</CodeBlock>
                    </CodeAccordion>
                </div>
            </section>
        </div>
    );
};

export default DeveloperSettings;
