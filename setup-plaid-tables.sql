-- STEP 1: Run this first to create Plaid tables
-- Copy and paste this into Supabase SQL Editor

-- 1. Table to store Plaid item + encrypted token
CREATE TABLE IF NOT EXISTS public.plaid_items (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text PRIMARY KEY,
  access_token_enc text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Plaid accounts table for tracking account details
CREATE TABLE IF NOT EXISTS public.plaid_accounts (
  plaid_account_id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text REFERENCES public.plaid_items(item_id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text DEFAULT 'Plaid',
  type text,
  balance numeric,
  currency text,
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. RLS policies for security
ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;

-- Only users can see their own plaid items
CREATE POLICY "Users can view own plaid items" ON public.plaid_items
  FOR ALL USING (auth.uid() = user_id);

-- Only users can see their own plaid accounts  
CREATE POLICY "Users can view own plaid accounts" ON public.plaid_accounts
  FOR ALL USING (auth.uid() = user_id);