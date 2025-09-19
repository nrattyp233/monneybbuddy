// Production-ready account refresh service with debouncing and rate limiting
// Handles Plaid token rotation, error states, and secure retry logic

import { getSupabase } from './supabase';

interface RefreshState {
  isLoading: boolean;
  lastRefresh: number | null;
  error: string | null;
  retryCount: number;
}

interface Account {
  account_id: string;
  name: string;
  balance: number;
  available_balance: number | null;
  currency: string;
  type: string;
  updated_at: string;
}

interface RefreshResponse {
  success: boolean;
  message: string;
  accounts: Account[];
  updated_count: number;
  errors: Array<{
    account_id?: string;
    error: string;
    retry_possible: boolean;
  }>;
  tokens_refreshed: number;
}

class AccountRefreshService {
  private state: RefreshState = {
    isLoading: false,
    lastRefresh: null,
    error: null,
    retryCount: 0
  };

  private listeners: Array<(state: RefreshState) => void> = [];
  private debounceTimer: number | null = null;
  private readonly DEBOUNCE_MS = 2000; // 2 second debounce
  private readonly MIN_REFRESH_INTERVAL = 30000; // 30 seconds minimum between refreshes
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 5000, 15000]; // Progressive backoff

  // Subscribe to state changes
  subscribe(listener: (state: RefreshState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private setState(updates: Partial<RefreshState>) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): RefreshState {
    return { ...this.state };
  }

  // Debounced refresh that prevents excessive API calls
  refreshAccounts(): Promise<RefreshResponse | null> {
    return new Promise((resolve) => {
      // Clear existing debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // Check rate limiting
      const now = Date.now();
      if (this.state.lastRefresh && now - this.state.lastRefresh < this.MIN_REFRESH_INTERVAL) {
        const waitTime = this.MIN_REFRESH_INTERVAL - (now - this.state.lastRefresh);
        console.log(`Rate limited: wait ${Math.ceil(waitTime / 1000)} seconds`);
        this.setState({ 
          error: `Please wait ${Math.ceil(waitTime / 1000)} seconds before refreshing again` 
        });
        resolve(null);
        return;
      }

      // Set debounce timer
      this.debounceTimer = window.setTimeout(async () => {
        try {
          const result = await this.performRefresh();
          resolve(result);
        } catch (error) {
          console.error('Refresh failed:', error);
          resolve(null);
        }
      }, this.DEBOUNCE_MS);

      // Immediately show loading state
      this.setState({ 
        isLoading: true, 
        error: null 
      });
    });
  }

  private async performRefresh(): Promise<RefreshResponse> {
    console.log('Performing account balance refresh...');
    
    try {
      this.setState({ isLoading: true, error: null });

      const { data, error } = await getSupabase().functions.invoke('refresh-account-balances', {
        body: {},
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (error) {
        throw new Error(`Edge Function error: ${error.message}`);
      }

      const response: RefreshResponse = data;

      if (!response.success && response.errors?.length > 0) {
        // Check if any errors are retryable
        const retryableErrors = response.errors.filter(e => e.retry_possible);
        const nonRetryableErrors = response.errors.filter(e => !e.retry_possible);
        
        if (nonRetryableErrors.length > 0) {
          // Non-retryable errors (like expired login)
          const errorMessage = nonRetryableErrors[0].error;
          this.setState({
            isLoading: false,
            error: errorMessage,
            retryCount: 0 // Reset retry count for non-retryable errors
          });
          throw new Error(errorMessage);
        } else if (retryableErrors.length > 0 && this.state.retryCount < this.MAX_RETRIES) {
          // Retryable errors - attempt retry with backoff
          const delayMs = this.RETRY_DELAYS[this.state.retryCount] || 15000;
          console.log(`Retrying refresh in ${delayMs}ms (attempt ${this.state.retryCount + 1})`);
          
          this.setState({ 
            retryCount: this.state.retryCount + 1,
            error: `Retrying... (${this.state.retryCount + 1}/${this.MAX_RETRIES})`
          });

          await new Promise(resolve => setTimeout(resolve, delayMs));
          return this.performRefresh(); // Recursive retry
        }
      }

      // Success case
      this.setState({
        isLoading: false,
        lastRefresh: Date.now(),
        error: null,
        retryCount: 0
      });

      console.log('Refresh successful:', {
        accounts: response.accounts?.length || 0,
        updated: response.updated_count,
        tokens_refreshed: response.tokens_refreshed
      });

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      this.setState({
        isLoading: false,
        error: errorMessage,
        lastRefresh: Date.now() // Still update to prevent spam
      });

      console.error('Account refresh failed:', errorMessage);
      throw error;
    }
  }

  // Force refresh (bypasses debounce and rate limiting)
  async forceRefresh(): Promise<RefreshResponse> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    // Reset rate limiting
    this.setState({ lastRefresh: null, retryCount: 0 });
    
    return this.performRefresh();
  }

  // Get time until next refresh is allowed
  getTimeUntilNextRefresh(): number {
    if (!this.state.lastRefresh) return 0;
    
    const elapsed = Date.now() - this.state.lastRefresh;
    return Math.max(0, this.MIN_REFRESH_INTERVAL - elapsed);
  }

  // Check if refresh is currently allowed
  canRefresh(): boolean {
    return !this.state.isLoading && this.getTimeUntilNextRefresh() === 0;
  }

  // Clear any error state
  clearError() {
    this.setState({ error: null });
  }
}

// Export singleton instance
export const accountRefreshService = new AccountRefreshService();

// Export types
export type { RefreshState, Account, RefreshResponse };