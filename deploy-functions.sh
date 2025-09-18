#!/bin/bash

# Deploy all PayPal functions to Supabase
echo "Deploying PayPal functions to Supabase..."

echo "📦 Deploying create-paypal-order..."
supabase functions deploy create-paypal-order

echo "📦 Deploying claim-transaction..."
supabase functions deploy claim-transaction

echo "📦 Deploying create-lock-payment..."
supabase functions deploy create-lock-payment

echo "📦 Deploying process-lock-withdrawal..."
supabase functions deploy process-lock-withdrawal

echo ""
echo "✅ All PayPal functions deployed!"
echo "🎉 Your MoneyBuddy app is now ready for real transactions!"