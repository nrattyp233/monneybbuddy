# Netlify Production Deployment Guide

## Required Environment Variables

Configure these in Netlify's environment variables section:

### Supabase Configuration
```
VITE_SUPABASE_URL=https://thdmywgjbhdtgtqnqizn.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### Plaid Configuration (Production)
```
VITE_PLAID_ENV=production
```

### Build Configuration
```
NODE_VERSION=18
```

## Netlify Build Settings

1. **Build Command**: `npm run build`
2. **Publish Directory**: `dist`
3. **Node Version**: 18 or higher

## Verification Steps

After deployment:

1. **Test Plaid Connection**: Ensure bank account linking works with production Plaid
2. **Test Balance Refresh**: Verify real-time balance updates work
3. **Test PayPal Integration**: Confirm money transfers work end-to-end
4. **Check Console Logs**: No errors related to sandbox/development environments

## Production Checklist

- [x] PLAID_ENV set to 'production' in Supabase secrets
- [x] All Edge Functions default to production Plaid API
- [x] PayPal configured for live transactions
- [x] Rate limiting enabled (30s between refresh requests)
- [x] Comprehensive error handling and logging
- [x] Removed all TODOs and demo placeholders
- [ ] Netlify environment variables configured
- [ ] End-to-end testing completed

## Security Notes

- All sensitive API keys stored in Supabase Edge Function secrets
- Frontend only receives public/anon keys via Netlify env vars
- PayPal webhook verification enabled
- Plaid access tokens handled server-side only
- Rate limiting prevents API abuse

## Support

If you encounter issues:

1. Check Netlify build logs for environment variable issues
2. Check Supabase Edge Function logs for API errors
3. Verify Plaid production credentials are valid
4. Ensure PayPal live mode is properly configured