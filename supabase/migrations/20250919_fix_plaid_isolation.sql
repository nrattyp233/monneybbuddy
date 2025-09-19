-- Fix for Plaid account sharing issue
-- This migration allows multiple users to connect to the same bank account
-- by making the primary key a combination of user_id and plaid_account_id

-- 1. Add external_id to accounts table to track Plaid account IDs
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS external_id text;
CREATE INDEX IF NOT EXISTS idx_accounts_external_id ON public.accounts(external_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_external ON public.accounts(user_id, external_id);

-- 2. Update plaid_accounts table to allow multiple users per account
ALTER TABLE public.plaid_accounts DROP CONSTRAINT IF EXISTS plaid_accounts_pkey;
ALTER TABLE public.plaid_accounts ADD CONSTRAINT plaid_accounts_pkey PRIMARY KEY (user_id, plaid_account_id);

-- 3. Update plaid_items to allow multiple users per item
ALTER TABLE public.plaid_items DROP CONSTRAINT IF EXISTS plaid_items_pkey;
ALTER TABLE public.plaid_items ADD CONSTRAINT plaid_items_pkey PRIMARY KEY (user_id, item_id);

-- 4. Add unique constraint for user-specific account identification
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_plaid_account ON public.plaid_accounts (user_id, plaid_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_plaid_item ON public.plaid_items (user_id, item_id);

-- 5. Update RLS policies to be more strict
DROP POLICY IF EXISTS "plaid_items_select_own" ON public.plaid_items;
DROP POLICY IF EXISTS "plaid_accounts_select_own" ON public.plaid_accounts;

CREATE POLICY "plaid_items_all_operations" ON public.plaid_items
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "plaid_accounts_all_operations" ON public.plaid_accounts
  FOR ALL USING (auth.uid() = user_id);

-- 6. Add insert/update policies
CREATE POLICY "plaid_items_insert" ON public.plaid_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plaid_accounts_insert" ON public.plaid_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);