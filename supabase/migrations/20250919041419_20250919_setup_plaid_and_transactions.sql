-- Setup Plaid tables and transaction tracking columns
-- Safe to run multiple times

-- Create Plaid tables
CREATE TABLE IF NOT EXISTS public.plaid_items (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text PRIMARY KEY,
  access_token_enc text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

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

-- Enable RLS
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN NULL; END $$;

-- Policies (ignore if exist)
DO $$ BEGIN
  CREATE POLICY "Users can view own plaid items" ON public.plaid_items
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own plaid accounts" ON public.plaid_accounts
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- Add transaction columns if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'fee'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN fee numeric(10, 2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'paypal_order_id'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN paypal_order_id text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN payment_method text DEFAULT 'paypal';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'external_transaction_id'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN external_transaction_id text;
    END IF;
END $$;

-- Indexes (ignore if exist)
DO $$ BEGIN
  CREATE INDEX idx_transactions_paypal_order_id ON public.transactions(paypal_order_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX idx_transactions_payment_method ON public.transactions(payment_method);
EXCEPTION WHEN others THEN NULL; END $$;
