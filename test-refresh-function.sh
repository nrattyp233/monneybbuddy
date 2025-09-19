#!/bin/bash

# Test script for production refresh function
echo "🧪 Testing production refresh function..."

# Test 1: OPTIONS request (CORS preflight)
echo ""
echo "Test 1: CORS preflight check"
curl -X OPTIONS \
  "https://thdmywgjbhdtgtqnqizn.supabase.co/functions/v1/refresh-account-balances" \
  -H "Origin: https://moneybuddygeo.netlify.app" \
  -v

echo ""
echo ""

# Test 2: Unauthenticated request
echo "Test 2: Unauthenticated request (should return 401)"
curl -X POST \
  "https://thdmywgjbhdtgtqnqizn.supabase.co/functions/v1/refresh-account-balances" \
  -H "Content-Type: application/json" \
  -H "Origin: https://moneybuddygeo.netlify.app" \
  -w "\nResponse code: %{http_code}\n"

echo ""
echo ""

# Test 3: Invalid token
echo "Test 3: Invalid token (should return 401)"
curl -X POST \
  "https://thdmywgjbhdtgtqnqizn.supabase.co/functions/v1/refresh-account-balances" \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -H "Origin: https://moneybuddygeo.netlify.app" \
  -w "\nResponse code: %{http_code}\n"

echo ""
echo "✅ Basic tests completed!"