-- Migration: create indexes for transactions table in a safe, idempotent way
-- This migration checks for common column names and creates indexes only if those columns exist.

DO $$
BEGIN
  -- user_from or sender_id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='user_from') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_user_from ON public.transactions (user_from)';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='sender_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_sender_id ON public.transactions (sender_id)';
  END IF;

  -- user_to or receiver_id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='user_to') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_user_to ON public.transactions (user_to)';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='receiver_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_receiver_id ON public.transactions (receiver_id)';
  END IF;

  -- status index
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions (status)';
  END IF;
END$$;
