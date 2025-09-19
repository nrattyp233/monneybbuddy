// Script to run the plaid account repair
// This runs automatically during deploy to fix any disconnected accounts

const { createClient } = require('@supabase/supabase-js');

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables for Supabase');
  process.exit(1);
}

async function main() {
  console.log('🔧 Running Plaid account repair script...');

  try {
    // Initialize Supabase client with service role key (admin privileges)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Execute direct SQL to fix all disconnected Plaid accounts
    const { data, error } = await supabase.rpc('repair_all_plaid_accounts');

    if (error) {
      throw error;
    }

    if (!data || !data[0]) {
      console.log('✅ No accounts needed repair or function not available');
      return;
    }

    console.log(`✅ Plaid repair complete! Examined ${data[0].accounts_examined} accounts, fixed ${data[0].accounts_fixed} disconnected accounts`);
  } catch (error) {
    console.error('❌ Error repairing Plaid accounts:', error.message);
    
    // Create the repair_all_plaid_accounts function if it doesn't exist
    console.log('🔧 Creating repair_all_plaid_accounts function...');
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { error: sqlError } = await supabase.rpc('create_repair_functions');
      if (sqlError) {
        console.error('❌ Failed to create repair functions:', sqlError.message);
      } else {
        console.log('✅ Created repair functions successfully');
        
        // Try repair again
        const { data, error } = await supabase.rpc('repair_all_plaid_accounts');
        if (error) {
          console.error('❌ Error running repair after function creation:', error.message);
        } else {
          console.log(`✅ Plaid repair complete! Examined ${data[0].accounts_examined} accounts, fixed ${data[0].accounts_fixed} disconnected accounts`);
        }
      }
    } catch (secondError) {
      console.error('❌ Failed to create or run repair functions:', secondError.message);
    }
  }
}

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});