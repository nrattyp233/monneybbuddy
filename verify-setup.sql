-- STEP 3: Run this to verify everything is set up correctly
-- Copy and paste this into Supabase SQL Editor AFTER steps 1 and 2

-- Check if all required tables exist
SELECT 
    'plaid_items' as table_name,
    EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'plaid_items'
    ) as exists
UNION ALL
SELECT 
    'plaid_accounts' as table_name,
    EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'plaid_accounts'
    ) as exists
UNION ALL
SELECT 
    'accounts' as table_name,
    EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'accounts'
    ) as exists
UNION ALL
SELECT 
    'transactions' as table_name,
    EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions'
    ) as exists;

-- Check if PayPal columns exist in transactions table
SELECT 
    column_name,
    data_type,
    'exists' as status
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'transactions'
AND column_name IN ('paypal_order_id', 'payment_method', 'external_transaction_id', 'fee')
ORDER BY column_name;