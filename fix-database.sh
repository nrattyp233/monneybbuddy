#!/bin/bash

# Quick fix script for MoneyBuddy database issues
# Run this script to apply the necessary database migrations

echo "Applying database fixes for MoneyBuddy..."

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "Supabase CLI not found. Please run the SQL migrations manually in your Supabase dashboard."
    echo "Navigate to: https://app.supabase.com/project/YOUR_PROJECT/sql"
    echo ""
    echo "Run these migration files in order:"
    echo "1. supabase/migrations/20250918_add_fee_column.sql"
    echo "2. supabase/migrations/20250918_add_withdrawal_columns.sql"
    echo ""
    echo "Then deploy the PayPal functions:"
    echo "supabase functions deploy create-paypal-order"
    echo "supabase functions deploy claim-transaction"
    echo "supabase functions deploy create-lock-payment"
    echo "supabase functions deploy process-lock-withdrawal"
    exit 1
fi

# Apply the migrations
echo "Applying database migrations..."
supabase db push

if [ $? -eq 0 ]; then
    echo "✅ Database migrations applied successfully!"
    echo ""
    echo "Now deploying PayPal functions..."
    
    # Deploy PayPal functions
    supabase functions deploy create-paypal-order
    supabase functions deploy claim-transaction
    supabase functions deploy create-lock-payment
    supabase functions deploy process-lock-withdrawal
    
    if [ $? -eq 0 ]; then
        echo "✅ PayPal functions deployed successfully!"
        echo ""
        echo "🎉 Your MoneyBuddy app is now ready for real transactions!"
        echo ""
        echo "Next steps:"
        echo "1. Restart your development server"
        echo "2. Try sending money or creating locked savings"
        echo "3. Monitor the browser console for any errors"
    else
        echo "❌ Failed to deploy functions. Please deploy manually:"
        echo "supabase functions deploy create-paypal-order"
        echo "supabase functions deploy claim-transaction"
        echo "supabase functions deploy create-lock-payment"
        echo "supabase functions deploy process-lock-withdrawal"
    fi
else
    echo "❌ Failed to apply migrations. Please run them manually:"
    echo "Copy the contents of these files to your Supabase SQL editor:"
    echo "1. supabase/migrations/20250918_add_fee_column.sql"
    echo "2. supabase/migrations/20250918_add_withdrawal_columns.sql"
fi