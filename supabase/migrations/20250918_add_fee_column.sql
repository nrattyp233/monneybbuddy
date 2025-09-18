-- Add fee column to transactions table if it doesn't exist
-- This migration is safe to run multiple times

DO $$ 
BEGIN
    -- Check if the fee column exists, if not add it
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