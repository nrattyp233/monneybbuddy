-- Quick diagnostic to check plaid_items table status
SELECT 
  COUNT(*) as total_items,
  COUNT(DISTINCT user_id) as unique_users
FROM public.plaid_items;

-- Also check what's in accounts table
SELECT 
  COUNT(*) as total_accounts,
  COUNT(DISTINCT user_id) as unique_users_with_accounts
FROM public.accounts;

-- Check if access tokens exist
SELECT 
  user_id,
  item_id,
  CASE WHEN access_token_enc IS NOT NULL THEN 'HAS_TOKEN' ELSE 'NO_TOKEN' END as token_status
FROM public.plaid_items 
LIMIT 5;