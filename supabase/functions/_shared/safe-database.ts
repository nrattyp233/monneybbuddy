// Supabase Edge Function: create-safe-database-operation
// Helper utility for database operations that fails gracefully
// Works in production even if tables don't exist or RLS blocks operations

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface SafeDbResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fallback?: boolean;
}

export class SafeSupabaseClient {
  private client: any;
  private isConfigured: boolean;

  constructor() {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    this.isConfigured = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
    
    if (this.isConfigured) {
      try {
        this.client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { 
          auth: { persistSession: false },
          db: { schema: 'public' },
          global: { headers: { 'x-application-name': 'moneybuddy-edge-function' } }
        });
      } catch (error) {
        console.warn('Failed to initialize Supabase client:', error);
        this.isConfigured = false;
      }
    }
  }

  async safeInsert<T>(table: string, data: any): Promise<SafeDbResult<T>> {
    if (!this.isConfigured) {
      console.warn(`Supabase not configured, skipping insert to ${table}`);
      return { success: false, error: 'Database not configured', fallback: true };
    }

    try {
      const { data: result, error } = await this.client.from(table).insert(data).select();
      
      if (error) {
        // Check if it's a table/column missing error (non-critical)
        if (error.message?.includes('does not exist') || 
            error.message?.includes('column') ||
            error.message?.includes('relation')) {
          console.warn(`Table ${table} not ready, continuing without persistence:`, error.message);
          return { success: false, error: `Table ${table} not available`, fallback: true };
        }
        
        // Check if it's an RLS error (non-critical for logging operations)
        if (error.message?.includes('policy') || error.message?.includes('permission')) {
          console.warn(`RLS blocked insert to ${table}, continuing:`, error.message);
          return { success: false, error: `Permission denied for ${table}`, fallback: true };
        }
        
        // Other errors are more serious
        console.error(`Database error on ${table}:`, error);
        return { success: false, error: error.message };
      }
      
      return { success: true, data: result };
    } catch (error) {
      console.error(`Exception during insert to ${table}:`, error);
      return { success: false, error: String(error) };
    }
  }

  async safeUpsert<T>(table: string, data: any, options?: any): Promise<SafeDbResult<T>> {
    if (!this.isConfigured) {
      console.warn(`Supabase not configured, skipping upsert to ${table}`);
      return { success: false, error: 'Database not configured', fallback: true };
    }

    try {
      const { data: result, error } = await this.client.from(table).upsert(data, options).select();
      
      if (error) {
        // Same graceful error handling as insert
        if (error.message?.includes('does not exist') || 
            error.message?.includes('column') ||
            error.message?.includes('relation')) {
          console.warn(`Table ${table} not ready, continuing without persistence:`, error.message);
          return { success: false, error: `Table ${table} not available`, fallback: true };
        }
        
        if (error.message?.includes('policy') || error.message?.includes('permission')) {
          console.warn(`RLS blocked upsert to ${table}, continuing:`, error.message);
          return { success: false, error: `Permission denied for ${table}`, fallback: true };
        }
        
        console.error(`Database error on ${table}:`, error);
        return { success: false, error: error.message };
      }
      
      return { success: true, data: result };
    } catch (error) {
      console.error(`Exception during upsert to ${table}:`, error);
      return { success: false, error: String(error) };
    }
  }

  async safeSelect<T>(table: string, query?: any): Promise<SafeDbResult<T[]>> {
    if (!this.isConfigured) {
      return { success: false, error: 'Database not configured', fallback: true };
    }

    try {
      let queryBuilder = this.client.from(table).select('*');
      
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          queryBuilder = queryBuilder.eq(key, value);
        }
      }
      
      const { data, error } = await queryBuilder;
      
      if (error) {
        if (error.message?.includes('does not exist')) {
          console.warn(`Table ${table} not ready:`, error.message);
          return { success: false, error: `Table ${table} not available`, fallback: true };
        }
        
        console.error(`Database error on ${table}:`, error);
        return { success: false, error: error.message };
      }
      
      return { success: true, data: data || [] };
    } catch (error) {
      console.error(`Exception during select from ${table}:`, error);
      return { success: false, error: String(error) };
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}

// Helper function to extract user ID from JWT token
export function extractUserIdFromToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      return null;
    }

    const payloadRaw = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadRaw);
    
    return payload.sub && typeof payload.sub === 'string' ? payload.sub : null;
  } catch (error) {
    console.warn('Could not parse JWT payload:', error);
    return null;
  }
}

// Enhanced CORS builder with security headers
export function buildSecureCors(originHeader: string | null, allowedOrigin: string = '*') {
  const normalizedAllowed = allowedOrigin.endsWith('/') && allowedOrigin !== '*' 
    ? allowedOrigin.slice(0, -1) 
    : allowedOrigin;

  let allowOrigin = normalizedAllowed;
  if (normalizedAllowed !== '*' && originHeader) {
    const normalizedIncoming = originHeader.endsWith('/') ? originHeader.slice(0, -1) : originHeader;
    if (normalizedIncoming === normalizedAllowed) {
      allowOrigin = normalizedIncoming;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS,GET',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', 
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
}