-- Migration: Add multi-account support and default preferences
-- Date: 2025-09-19

-- Add account preferences to track default sending/receiving accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_default_send boolean DEFAULT false;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_default_receive boolean DEFAULT true;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active';
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS plaid_account_id text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS routing_number text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS account_number_masked text;

-- Update transactions to include source and destination account IDs
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS from_account_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS to_account_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transfer_method text DEFAULT 'paypal';

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_defaults ON public.accounts(user_id, is_default_send, is_default_receive);
CREATE INDEX IF NOT EXISTS idx_transactions_accounts ON public.transactions(from_account_id, to_account_id);

-- Function to ensure only one default send/receive account per user
CREATE OR REPLACE FUNCTION ensure_single_default_account()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting as default send, unset others
  IF NEW.is_default_send = true THEN
    UPDATE public.accounts 
    SET is_default_send = false 
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  
  -- If setting as default receive, unset others
  IF NEW.is_default_receive = true THEN
    UPDATE public.accounts 
    SET is_default_receive = false 
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain single default accounts
DROP TRIGGER IF EXISTS trigger_ensure_single_default ON public.accounts;
CREATE TRIGGER trigger_ensure_single_default
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_account();

-- Update existing accounts to have at least one default
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT DISTINCT user_id FROM public.accounts LOOP
        -- Set first account as default send if none exists
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = user_record.user_id AND is_default_send = true) THEN
            UPDATE public.accounts 
            SET is_default_send = true 
            WHERE user_id = user_record.user_id 
            ORDER BY created_at ASC 
            LIMIT 1;
        END IF;
        
        -- Set first account as default receive if none exists
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = user_record.user_id AND is_default_receive = true) THEN
            UPDATE public.accounts 
            SET is_default_receive = true 
            WHERE user_id = user_record.user_id 
            ORDER BY created_at ASC 
            LIMIT 1;
        END IF;
    END LOOP;
END $$;