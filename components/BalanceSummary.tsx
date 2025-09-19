import React from 'react';
import { Account } from '../types';
import { PlusCircleIcon, BankIcon, StripeIcon, PayPalIcon, ChaseIcon, BankOfAmericaIcon, WellsFargoIcon, CapitalOneIcon, TrashIcon } from './icons';

interface RefreshState {
  isLoading: boolean;
  lastRefresh: number | null;
  error: string | null;
  retryCount: number;
}

interface BalanceSummaryProps {
  accounts: Account[];
  onConnectClick: () => void;
  onRemoveAccount: (accountId: string) => void;
  onRefreshAccounts?: () => void;
  refreshState?: RefreshState;
}

const getLogoForProvider = (provider: string) => {
    switch(provider) {
        case 'Chase': return <ChaseIcon className="w-6 h-6" />;
        case 'Bank of America': return <BankOfAmericaIcon className="w-6 h-6" />;
        case 'Wells Fargo': return <WellsFargoIcon className="w-6 h-6" />;
        case 'Capital One': return <CapitalOneIcon className="w-6 h-6" />;
        case 'Stripe': return <StripeIcon className="w-6 h-6" />;
        case 'PayPal': return <PayPalIcon className="w-6 h-6" />;
        default: return <BankIcon className="w-6 h-6" />;
    }
};

const BalanceSummary: React.FC<BalanceSummaryProps> = ({ 
  accounts, 
  onConnectClick, 
  onRemoveAccount, 
  onRefreshAccounts,
  refreshState 
}) => {
  const totalBalance = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getTimeAgo = (timestamp: number | null) => {
    if (!timestamp) return null;
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="p-4 md:p-6 bg-indigo-900/60 backdrop-blur-lg border border-indigo-400/30 rounded-2xl shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-indigo-200">Total Balance</h2>
        
        {/* Refresh Button */}
        {onRefreshAccounts && (
          <div className="flex items-center space-x-2">
            {refreshState?.lastRefresh && (
              <span className="text-xs text-indigo-300">
                {getTimeAgo(refreshState.lastRefresh)}
              </span>
            )}
            <button
              onClick={onRefreshAccounts}
              disabled={refreshState?.isLoading}
              className={`p-2 rounded-lg transition-all duration-200 ${
                refreshState?.isLoading
                  ? 'bg-indigo-700/50 cursor-not-allowed'
                  : 'bg-indigo-700 hover:bg-indigo-600 hover:scale-105'
              }`}
              title={refreshState?.isLoading ? 'Refreshing...' : 'Refresh balances'}
            >
              <svg
                className={`w-4 h-4 text-indigo-200 ${
                  refreshState?.isLoading ? 'animate-spin' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {refreshState?.error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
          <p className="text-sm text-red-300">{refreshState.error}</p>
        </div>
      )}

      <p className="text-4xl lg:text-5xl font-bold text-lime-300 tracking-tighter mb-6">
        {formatCurrency(totalBalance)}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account) => (
          <div key={account.id} className="relative bg-gray-800 border border-white/10 p-4 rounded-xl shadow-lg transition-all duration-300 hover:bg-gray-700 hover:-translate-y-1 group">
             <button 
                onClick={() => onRemoveAccount(account.id)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-gray-700 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-200"
                aria-label={`Remove ${account.name}`}
                >
                <TrashIcon className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-400">{account.name}</span>
              <div className="text-lime-400">
                {account.logo ? <img src={account.logo} alt={`${account.provider} logo`} className="w-6 h-6 rounded-md" /> : getLogoForProvider(account.provider)}
              </div>
            </div>
            <p className="text-2xl font-bold text-white tracking-tight">{formatCurrency(account.balance)}</p>
          </div>
        ))}
         <button 
            onClick={onConnectClick}
            className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-gray-600 hover:border-lime-400 text-gray-400 hover:text-lime-400 transition-all duration-300 hover:bg-gray-800/50 hover:-translate-y-1"
            >
            <PlusCircleIcon className="w-8 h-8 mb-2" />
            <span className="font-semibold">Connect New Account</span>
        </button>
      </div>
    </div>
  );
};

export default BalanceSummary;