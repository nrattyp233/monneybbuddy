-- Check Plaid Environment Setup
SELECT 
    'plaid_items' as table_name,
    COUNT(*) as total_records,
    COUNT(DISTINCT user_id) as unique_users
FROM public.plaid_items
UNION ALL
SELECT 
    'accounts' as table_name,
    COUNT(*) as total_records,
    COUNT(DISTINCT user_id) as unique_users  
FROM public.accounts;

-- Check if there are any recent exchange function logs
-- (Note: This won't work in SQL, but would be useful to check Supabase function logs)