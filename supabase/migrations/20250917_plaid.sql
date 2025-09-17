-- Plaid integration schema additions
-- Safe to run once. Adjust naming if conflicts.

-- 1. Table to store Plaid item + encrypted token (store encrypted, NOT raw).
CREATE TABLE IF NOT EXISTS public.plaid_items (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text PRIMARY KEY,
  access_token_enc text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Extend accounts table or create a dedicated plaid_accounts table.
-- If an existing 'accounts' table already exists with id/name/provider/type/balance columns,
-- you can either reuse it or create a separate mapped table. Below is a separate table to avoid collisions.
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

-- 3. Basic RLS policies (adjust logic as needed):
ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "plaid_items_select_own" ON public.plaid_items
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "plaid_accounts_select_own" ON public.plaid_accounts
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Upsert helper example (pseudo):
-- INSERT INTO public.plaid_accounts (plaid_account_id,user_id,item_id,name,provider,type,balance,currency,raw)
-- VALUES (...)
-- ON CONFLICT (plaid_account_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = now();

-- 5. (Optional) pgcrypto for encryption:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- To store encrypted: update Edge Function to use PGP_SYM_ENCRYPT(access_token, secret) before insert.
