-- Create a SQL function to repair all disconnected Plaid accounts
create or replace function repair_all_plaid_accounts()
returns table (
  accounts_examined int,
  accounts_fixed int
) language plpgsql security definer as $$
declare
  examined_count int;
  fixed_count int;
begin
  -- Count the total number of Plaid accounts with external_id
  select count(*) into examined_count
  from accounts
  where provider = 'Plaid'
  and external_id is not null;
  
  -- Update accounts to 'active' if they have Plaid connection but status is not 'active'
  with updated as (
    update accounts
    set account_status = 'active'
    where provider = 'Plaid'
    and external_id is not null
    and account_status != 'active'
    returning *
  )
  select count(*) into fixed_count
  from updated;
  
  return query select examined_count, fixed_count;
end;
$$;

-- Grant permissions
grant execute on function repair_all_plaid_accounts() to authenticated;
grant execute on function repair_all_plaid_accounts() to service_role;

-- Create a SQL function for the Edge Function to use (repair by user)
create or replace function repair_plaid_accounts()
returns table (
  accounts_examined int,
  accounts_fixed int
) language plpgsql security definer as $$
declare
  user_id uuid;
  examined_count int;
  fixed_count int;
begin
  -- Get the current user ID
  user_id := auth.uid();
  
  -- Count the total number of Plaid accounts for this user
  select count(*) into examined_count
  from accounts
  where accounts.user_id = repair_plaid_accounts.user_id
  and provider = 'Plaid'
  and external_id is not null;
  
  -- Update accounts to 'active' if they have Plaid connection but status is not 'active'
  with updated as (
    update accounts
    set account_status = 'active'
    where accounts.user_id = repair_plaid_accounts.user_id
    and provider = 'Plaid'
    and external_id is not null
    and account_status != 'active'
    returning *
  )
  select count(*) into fixed_count
  from updated;
  
  return query select examined_count, fixed_count;
end;
$$;

-- Grant permissions
grant execute on function repair_plaid_accounts() to authenticated;
grant execute on function repair_plaid_accounts() to service_role;
