-- Check if required database schema exists for balance refresh functionality
-- Run this in Supabase SQL Editor to verify setup

-- Check if plaid_items table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'plaid_items'
) as plaid_items_exists;

-- Check if plaid_accounts table exists  
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'plaid_accounts'
) as plaid_accounts_exists;

-- Check if accounts table has required columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'accounts'
ORDER BY column_name;

-- Check if transactions table has PayPal tracking columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'transactions'
AND column_name IN ('paypal_order_id', 'payment_method', 'external_transaction_id', 'fee')
ORDER BY column_name;