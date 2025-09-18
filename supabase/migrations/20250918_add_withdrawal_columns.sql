-- Add missing columns for withdrawal processing
-- This migration adds fields needed for the PayPal withdrawal functionality

DO $$ 
BEGIN
    -- Add withdrawal tracking columns to locked_savings if they don't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locked_savings' 
        AND column_name = 'withdrawal_amount'
    ) THEN
        ALTER TABLE public.locked_savings ADD COLUMN withdrawal_amount numeric(10, 2);
        RAISE NOTICE 'Added withdrawal_amount column to locked_savings table';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locked_savings' 
        AND column_name = 'withdrawn_at'
    ) THEN
        ALTER TABLE public.locked_savings ADD COLUMN withdrawn_at timestamp with time zone;
        RAISE NOTICE 'Added withdrawn_at column to locked_savings table';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locked_savings' 
        AND column_name = 'payout_batch_id'
    ) THEN
        ALTER TABLE public.locked_savings ADD COLUMN payout_batch_id text;
        RAISE NOTICE 'Added payout_batch_id column to locked_savings table';
    END IF;
END $$;