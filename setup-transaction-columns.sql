-- STEP 2: Run this to add missing columns to existing tables
-- Copy and paste this into Supabase SQL Editor AFTER step 1

-- Add fee column to transactions table if it doesn't exist
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
        RAISE NOTICE 'Added fee column to transactions table';
    ELSE
        RAISE NOTICE 'Fee column already exists in transactions table';
    END IF;
END $$;

-- Add PayPal tracking columns to transactions table
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

    -- Create index for faster payment method filtering
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'transactions' 
        AND indexname = 'idx_transactions_payment_method'
    ) THEN
        CREATE INDEX idx_transactions_payment_method ON public.transactions(payment_method);
        RAISE NOTICE 'Created index on payment_method column';
    END IF;
END $$;