-- Add PayPal tracking columns to transactions table
-- This migration adds fields needed for tracking real PayPal transactions

DO $$ 
BEGIN
    -- Add PayPal order tracking column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'paypal_order_id'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN paypal_order_id text;
        RAISE NOTICE 'Added paypal_order_id column to transactions table';
    END IF;

    -- Add payment method tracking if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN payment_method text DEFAULT 'paypal';
        RAISE NOTICE 'Added payment_method column to transactions table';
    END IF;

    -- Add external transaction ID tracking if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'external_transaction_id'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN external_transaction_id text;
        RAISE NOTICE 'Added external_transaction_id column to transactions table';
    END IF;

    -- Create index for faster PayPal order lookups
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'transactions' 
        AND indexname = 'idx_transactions_paypal_order_id'
    ) THEN
        CREATE INDEX idx_transactions_paypal_order_id ON public.transactions(paypal_order_id);
        RAISE NOTICE 'Created index on paypal_order_id column';
    END IF;

    -- Create index for external transaction ID lookups
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'transactions' 
        AND indexname = 'idx_transactions_external_id'
    ) THEN
        CREATE INDEX idx_transactions_external_id ON public.transactions(external_transaction_id);
        RAISE NOTICE 'Created index on external_transaction_id column';
    END IF;
END $$;