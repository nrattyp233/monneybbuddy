import React, { useState, useEffect, useCallback } from 'react';
import { Account, Transaction, LockedSaving, TransactionStatus, GeoFence, TimeRestriction } from './types';
import { EARLY_WITHDRAWAL_PENALTY_RATE } from './constants';
import Header from './components/Header';
import BalanceSummary from './components/BalanceSummary';
import SendMoney from './components/SendMoney';
import LockedSavings from './components/LockedSavings';
import TransactionHistory from './components/TransactionHistory';
import Modal from './components/Modal';
import ProfileSettings from './components/ProfileSettings';
import SecurityTip from './components/SecurityTip';
import ConnectAccountModal from './components/ConnectAccountModal';
import type { User as SupabaseUser } from 'https://esm.sh/@supabase/supabase-js@2';
import NotificationsPanel from './components/NotificationsPanel';
import RequestMoney from './components/RequestMoney';
import TransactionDetailModal from './components/TransactionDetailModal';
import Auth from './components/Auth';
import { getSupabase } from './services/supabase';
import DeveloperSettings from './components/DeveloperSettings';

type ActiveTab = 'send' | 'lock' | 'history' | 'request';

// IMPORTANT: Replace this with your actual admin email address.
// Only the user with this email will see the "Developer Settings" button.
const ADMIN_EMAIL = 'lucasnale305@gmail.com'; 

const TRANSACTION_FEE_RATE = 0.03; // 3%

const App: React.FC = () => {
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [lockedSavings, setLockedSavings] = useState<LockedSaving[]>([]);
    const [activeTab, setActiveTab] = useState<ActiveTab>('send');
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isDevSettingsModalOpen, setIsDevSettingsModalOpen] = useState(false);
    const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] = useState(false);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [accountToRemove, setAccountToRemove] = useState<Account | null>(null);
    const [isClaiming, setIsClaiming] = useState<string | null>(null); // Track claiming state by transaction ID
    const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
    const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
    const [refreshError, setRefreshError] = useState<string | null>(null);

    const isAdmin = user?.email === ADMIN_EMAIL;

    useEffect(() => {
        const supabase = getSupabase();
        
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
            setLoading(false);
        };

        getSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                const newUser = session?.user ?? null;
                const currentUserId = user?.id;
                const newUserId = newUser?.id;
                
                setUser(newUser);
                
                // Clear all data when user logs out OR when a different user logs in
                if (!newUser || (currentUserId && newUserId && currentUserId !== newUserId)) {
                    const reason = !newUser ? 'User logged out' : 'Different user logged in';
                    console.log(`${reason} - clearing all data (was: ${currentUserId}, now: ${newUserId})`);
                    
                    // Clear application state
                    setAccounts([]);
                    setTransactions([]);
                    setLockedSavings([]);
                    setSelectedTransaction(null);
                    setAccountToRemove(null);
                    setIsClaiming(null);
                    setRefreshError(null);
                }
            }
        );

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, []);

    const fetchData = useCallback(async () => {
        if (!user || !user.email) return;
        const supabase = getSupabase();

        try {
            console.log('🔍 DEBUGGING: Fetching data for user:', user.id, 'email:', user.email); // Debug logging
            
            // Get transactions where user is either sender or recipient
            const { data: transactionsData, error: transactionsError } = await supabase
                .from('transactions')
                .select('*')
                .or(`from_details.eq.${user.email},to_details.eq.${user.email}`)
                .order('created_at', { ascending: false });
            
            const [accountsRes, savingsRes] = await Promise.all([
                supabase.from('accounts').select('*').eq('user_id', user.id),
                supabase.from('locked_savings').select('*').eq('user_id', user.id)
            ]);

            if (accountsRes.error) {
                console.error('Accounts fetch error:', accountsRes.error);
                throw accountsRes.error;
            }
            if (transactionsError) {
                console.error('Transactions fetch error:', transactionsError);
                throw transactionsError;
            }
            if (savingsRes.error) {
                console.error('Savings fetch error:', savingsRes.error);
                throw savingsRes.error;
            }

            console.log('🔍 DEBUGGING: Raw transactions returned:', transactionsData?.length || 0);
            if (transactionsData && transactionsData.length > 0) {
                console.log('🔍 DEBUGGING: First few transactions:', transactionsData.slice(0, 3).map(t => ({
                    id: t.id,
                    from: t.from_details,
                    to: t.to_details,
                    amount: t.amount,
                    status: t.status,
                    created: t.created_at
                })));
            }

            console.log('Fetched accounts:', accountsRes.data); // Debug logging
            setAccounts(accountsRes.data as Account[]);
            
            console.log('Raw transactions from DB:', transactionsData?.length, 'transactions');
            console.log('Transaction details:', transactionsData?.map(t => ({ 
                id: t.id, 
                from: t.from_details, 
                to: t.to_details, 
                amount: t.amount, 
                status: t.status,
                type: t.type
            })));
            
            const formattedTransactions = transactionsData.map(tx => ({
                ...tx,
                date: new Date(tx.created_at), // Map created_at to date
                geoFence: tx.geo_fence,
                timeRestriction: tx.time_restriction,
            })) as Transaction[];
            setTransactions(formattedTransactions);

            const formattedSavings = savingsRes.data.map(s => ({
                ...s,
                accountId: s.account_id,
                lockPeriodMonths: s.lock_period_months,
                startDate: new Date(s.start_date),
                endDate: new Date(s.end_date),
                paypal_order_id: s.paypal_order_id
            })) as LockedSaving[];
            setLockedSavings(formattedSavings);

        } catch (error: any) {
            const errorMessage = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            console.error("Error fetching data:", errorMessage);
            alert(`Could not fetch your data. Reason: ${errorMessage}`);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [user, fetchData]);

    // Live updates: subscribe to accounts changes for this user
    useEffect(() => {
        if (!user) return;
        const supabase = getSupabase();
        const channel = supabase
            .channel(`accounts-realtime-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'accounts',
                filter: `user_id=eq.${user.id}`,
            }, (payload) => {
                // Update local state with minimal fetch to keep UI in sync
                fetchData();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Subscribed to account balance updates');
                }
            });

        return () => {
            try { supabase.removeChannel(channel); } catch {}
        };
    }, [user, fetchData]);

    // Auto-refresh balances every 5 minutes when user is active
    useEffect(() => {
        if (!user) return;

        const autoRefresh = async () => {
            console.log('🔄 Auto-refreshing balances...');
            try {
                const supabase = getSupabase();
                const { data, error } = await supabase.functions.invoke('refresh-account-balances');
                
                if (!error && data?.success) {
                    if (data.needsReconnection) {
                        console.log('ℹ️ Auto-refresh: Plaid reconnection needed');
                        setIsConnectAccountModalOpen(true);
                    } else if (data.needsSetup) {
                        console.log('ℹ️ Auto-refresh: Database setup needed');
                    } else if (data.updatedAccounts > 0) {
                        console.log(`✅ Auto-refresh: Updated ${data.updatedAccounts} accounts`);
                        await fetchData(); // Only refresh UI if balances actually updated
                    } else {
                        console.log('ℹ️ Auto-refresh: No accounts to update');
                    }
                } else {
                    console.warn('⚠️ Auto-refresh failed:', error?.message || 'Unknown error');
                }
            } catch (error) {
                console.warn('⚠️ Auto-refresh error:', error);
            }
        };

        // Initial auto-refresh after 10 seconds
        const initialTimeout = setTimeout(autoRefresh, 10000);
        
        // Then refresh every 5 minutes
        const interval = setInterval(autoRefresh, 5 * 60 * 1000);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [user, fetchData]);

    // --- Production-Ready Balance Refresh Handler ---
    const handleRefreshBalances = async () => {
        if (!user || isRefreshingBalances) return;
        
        // Debounce: prevent rapid successive refreshes
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTime;
        const DEBOUNCE_MS = 5000; // 5 seconds minimum between refreshes
        
        if (timeSinceLastRefresh < DEBOUNCE_MS) {
            const remainingSeconds = Math.ceil((DEBOUNCE_MS - timeSinceLastRefresh) / 1000);
            alert(`⏳ Please wait ${remainingSeconds} more seconds before refreshing again.`);
            return;
        }
        
        setIsRefreshingBalances(true);
        setRefreshError(null);
        setLastRefreshTime(now);
        
        try {
            console.log('🔄 Refreshing account balances...');
            const supabase = getSupabase();
            
            const { data, error } = await supabase.functions.invoke('refresh-account-balances');
            
            if (error) {
                console.error('❌ Balance refresh failed:', error);
                const errorMsg = error.message || 'Unknown server error';
                setRefreshError(errorMsg);
                
                // Show user-friendly error based on error type
                if (errorMsg.includes('FunctionsHttpError')) {
                    alert('⚠️ Server configuration issue. Please check that Plaid credentials are properly set in your project settings.');
                } else if (errorMsg.includes('timeout')) {
                    alert('⏳ Request timed out. Please try again in a moment.');
                } else {
                    alert(`❌ Failed to refresh balances: ${errorMsg}`);
                }
                return;
            }
            
            console.log('✅ Balance refresh result:', data);
            
            if (data?.success) {
                // Clear any previous errors
                setRefreshError(null);
                
                // Refresh the UI data after successful balance update
                await fetchData();
                
                // Handle specific response flags from the server
                if (data.rateLimited) {
                    alert(`⏳ Rate limited: ${data.error}. Please try again later.`);
                } else if (data.needsReconnection) {
                    console.log('🔄 Server indicates reconnection needed, opening Plaid modal');
                    setIsConnectAccountModalOpen(true);
                    
                    const plaidError = data.plaidError ? ` (${data.plaidError.code}: ${data.plaidError.message})` : '';
                    alert(`🔐 Your bank connection needs re-authorization. Please complete the Plaid prompt.${plaidError}`);
                } else if (data.needsSetup) {
                    alert('⚠️ Database schema setup required. Please apply the database migrations first.');
                } else if (data.needsServerConfig) {
                    alert('⚠️ Server configuration incomplete. Please ensure Plaid credentials are set in project settings.');
                } else if (data.needsAuth) {
                    alert('🔐 Authentication required. Please sign in again.');
                } else if (data.updatedAccounts > 0) {
                    console.log(`✅ Successfully updated ${data.updatedAccounts} accounts`);
                    // Success - show subtle feedback without modal
                    setRefreshError(null);
                } else {
                    alert('ℹ️ No accounts were updated. You may need to connect bank accounts first.');
                }
                
                // Log any warnings/errors from the refresh process
                if (data.errors && data.errors.length > 0) {
                    console.warn('⚠️ Refresh completed with warnings:', data.errors);
                }
                
            } else {
                // Server returned success: false
                const errorMsg = data?.error || 'Unknown error from server';
                setRefreshError(errorMsg);
                
                if (data?.canRetry) {
                    alert(`⚠️ ${errorMsg}\n\nYou can try refreshing again in a moment.`);
                } else {
                    alert(`❌ ${errorMsg}`);
                }
            }
            
        } catch (error: any) {
            console.error('❌ Error refreshing balances:', error);
            const errorMsg = error.message || 'Network or client error';
            setRefreshError(errorMsg);
            
            // Provide specific guidance based on error type
            if (errorMsg.includes('NetworkError') || errorMsg.includes('fetch')) {
                alert('🌐 Network error. Please check your connection and try again.');
            } else if (errorMsg.includes('FunctionsHttpError')) {
                alert('⚠️ Server configuration issue. Please contact support if this persists.');
            } else {
                alert(`❌ Failed to refresh balances: ${errorMsg}`);
            }
        } finally {
            setIsRefreshingBalances(false);
        }
    };

    // --- Action Handlers ---

    const handleSendMoney = async (fromAccountId: string, to: string, amount: number, description: string, geoFence: GeoFence | undefined, timeRestriction: TimeRestriction | undefined) => {
        if (!user || !user.email) return Promise.reject(new Error("User not authenticated"));
        const fromAccount = accounts.find(acc => acc.id === fromAccountId);
        if (!fromAccount) {
             return Promise.reject(new Error("Invalid source account."));
        }
        
        const fee = amount * TRANSACTION_FEE_RATE;
        const totalDebit = amount + fee;
        const supabase = getSupabase();
    
        try {
            // NEW SYSTEM: Create pending bank-to-bank transfer
            console.log('🏦 Creating bank-to-bank transfer...', { 
                fromAccount: fromAccount.name, 
                amount, 
                fee, 
                to, 
                description, 
                geoFence, 
                timeRestriction 
            });
            
            // Check if sender has sufficient balance
            if (fromAccount.balance === null || fromAccount.balance < totalDebit) {
                throw new Error("Insufficient funds to cover the amount and transaction fee.");
            }

            // Create pending transaction record - recipient will choose destination account
            const { error: insertError } = await supabase.from('transactions').insert({
                user_id: user.id,
                from_details: user.email,
                to_details: to,
                from_account_id: fromAccountId,
                // to_account_id will be set when recipient accepts
                amount: amount,
                fee: fee,
                description: description,
                type: 'send',
                status: 'Pending',
                payment_method: 'bank_transfer',
                geo_fence: geoFence,
                time_restriction: timeRestriction
            });
            
            if (insertError) {
                console.error('❌ Failed to create transaction record:', insertError);
                throw insertError;
            }

            console.log('✅ Pending bank transfer created successfully');
            await fetchData(); // Refresh to show pending transaction
            setActiveTab('history');
            
            const restrictionText = geoFence || timeRestriction ? ' with restrictions' : '';
            alert(`💰 Transfer request sent to ${to}${restrictionText}! They will receive a notification to accept the transfer.`);
            
        } catch (error: any) {
            console.error("Error creating transfer:", error);
            alert(`Failed to create transfer. Reason: ${error.message || 'An unknown error occurred.'}`);
            throw error; // Re-throw for the UI component
        }
    };
    
    const handleClaimTransaction = async (tx: Transaction, selectedAccountId?: string) => {
        // For geo/time restricted transfers, get location first
        if (tx.geoFence || tx.timeRestriction) {
            if (!navigator.geolocation) {
                alert("Geolocation is not supported by your browser.");
                return;
            }

            setIsClaiming(tx.id);
            
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    await processTransferClaim(tx, selectedAccountId, {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (error) => {
                    alert(`Could not get your location: ${error.message}`);
                    setIsClaiming(null);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            // For unrestricted transfers, process immediately
            await processTransferClaim(tx, selectedAccountId);
        }
    };

    const processTransferClaim = async (tx: Transaction, selectedAccountId?: string, userCoordinates?: { latitude: number; longitude: number }) => {
        if (!user || !selectedAccountId) {
            alert("Please select a destination account to receive the funds.");
            setIsClaiming(null);
            return;
        }

        const destinationAccount = accounts.find(acc => acc.id === selectedAccountId);
        if (!destinationAccount) {
            alert("Invalid destination account selected.");
            setIsClaiming(null);
            return;
        }

        const supabase = getSupabase();
        setIsClaiming(tx.id);

        try {
            console.log('🏦 Processing bank transfer claim...', {
                transactionId: tx.id,
                fromAccount: tx.from_account_id,
                toAccount: selectedAccountId,
                amount: tx.amount,
                hasGeoRestriction: !!tx.geoFence,
                hasTimeRestriction: !!tx.timeRestriction
            });

            // Call bank transfer function
            const { data, error } = await supabase.functions.invoke('process-bank-transfer', {
                body: { 
                    transactionId: tx.id,
                    destinationAccountId: selectedAccountId,
                    userCoordinates: userCoordinates // Only present for restricted transfers
                },
            });

            if (error) {
                throw new Error(error.message || 'The backend function returned an error.');
            }
            
            if (data.success) {
                alert(`🎉 Transfer completed! $${tx.amount} has been deposited to your ${destinationAccount.name} account.`);
                await fetchData();
            } else {
                throw new Error(data.message || 'Transfer failed');
            }

        } catch (err: any) {
            const detail = err.context?.details ? JSON.parse(err.context.details).error : err.message;
            alert(`Transfer failed: ${detail}`);
        } finally {
            setIsClaiming(null);
        }
    };

    const handleRequestMoney = async (to: string, amount: number, description: string) => {
        if (!user || !user.email) return;
        const supabase = getSupabase();
        try {
            const { error } = await supabase.from('transactions').insert({
                user_id: user.id,
                from_details: user.email,
                to_details: to,
                amount: amount,
                description: description,
                type: 'request',
                status: 'Pending',
            });
            if (error) throw error;
            await fetchData();
            setActiveTab('history');
        } catch (error: any)
{
            console.error("Error requesting money:", error);
            alert(`Failed to send request. Reason: ${error.message || 'An unknown error occurred.'}`);
        }
    };

    const handleLock = async (accountId: string, amount: number, period: number) => {
        if (!user) return Promise.reject(new Error("User not authenticated."));
        const supabase = getSupabase();
    
        try {
            // Call the edge function to create a locked saving record and a PayPal order
            const { data, error } = await supabase.functions.invoke('create-lock-payment', {
                body: { accountId, amount, period },
            });
    
            if (error) throw error;
            if (!data.approval_url) throw new Error("Function did not return a PayPal approval URL.");
    
            await fetchData();
            
            // Open PayPal for user to approve the transfer
            alert("You'll be redirected to PayPal to confirm the transfer to your locked savings vault. Your locked saving will show as 'Pending' until confirmed.");
            window.open(data.approval_url, '_blank', 'noopener,noreferrer');
        } catch (error: any) {
            console.error("Error initiating lock:", error);
            alert(`Failed to lock funds. Reason: ${error.message || 'An unknown error occurred.'}`);
            throw error;
        }
    };
    
    const handleWithdraw = async (saving: LockedSaving) => {
        if (!user) return;
    
        const isEarly = new Date() < new Date(saving.endDate);
        if (isEarly) {
            const confirmed = confirm("This is an early withdrawal, and a 5% penalty will be applied. Are you sure you want to proceed?");
            if (!confirmed) return;
        }
    
        const supabase = getSupabase();
        try {
            // Call the edge function to process the withdrawal via PayPal Payouts
            const { error } = await supabase.functions.invoke('process-lock-withdrawal', {
                body: { savingId: saving.id },
            });
    
            if (error) throw error;
    
            alert("Withdrawal initiated. The funds are being sent back to your PayPal account. This may take a few moments to reflect.");
            await fetchData();
        } catch (error: any) {
            console.error("Error withdrawing funds:", error);
            const detail = error.context?.details ? JSON.parse(error.context.details).error : error.message;
            alert(`Failed to withdraw funds. Reason: ${detail || 'An unknown error occurred.'}`);
        }
    };
    
    const handleApproveRequest = async (tx: Transaction) => {
        if (!user) return;
        const fromAccount = accounts[0]; // For simplicity, use first account
        if (!fromAccount || fromAccount.balance === null || fromAccount.balance < tx.amount) {
            alert("Insufficient funds to approve this request.");
            return;
        }
        const supabase = getSupabase();
        try {
            // 1. Update user's balance
            await supabase.from('accounts').update({ balance: fromAccount.balance - tx.amount }).eq('id', fromAccount.id);
            // 2. Update transaction to completed
            await supabase.from('transactions').update({ status: 'Completed' }).eq('id', tx.id);
            await fetchData();
        } catch (error: any) {
            console.error("Error approving request:", error);
            alert(`Failed to approve request. Reason: ${error.message || 'An unknown error occurred.'}`);
        }
    };

    const handleDeclineRequest = async (tx: Transaction) => {
        const supabase = getSupabase();
        try {
            await supabase.from('transactions').update({ status: 'Declined' }).eq('id', tx.id);
            await fetchData();
        } catch (error: any) {
            console.error("Error declining request:", error);
            alert(`Failed to decline request. Reason: ${error.message || 'An unknown error occurred.'}`);
        }
    };

    const handleConnectionSuccess = async (instantAccounts?: { name: string; balance: number | null; provider: string; type?: string }[]) => {
        console.log('Connection success with accounts:', instantAccounts); // Debug logging
        
        if (instantAccounts && instantAccounts.length) {
            // Optimistically merge (avoid duplicates by name)
            setAccounts(prev => {
                const names = new Set(prev.map(p => p.name));
                const additions = instantAccounts
                  .filter(a => !names.has(a.name))
                  .map(a => ({
                    id: crypto.randomUUID(),
                    name: a.name,
                    provider: a.provider,
                    type: a.type || '',
                    balance: a.balance,
                  }));
                console.log('Adding new accounts:', additions); // Debug logging
                return [...prev, ...additions];
            });
        }
        
        // Always fetch fresh data from the server after connection
        try {
            await fetchData();
            console.log('Data fetched successfully after Plaid connection');
        } catch (error) {
            console.error('Error fetching data after Plaid connection:', error);
        }
        
        setIsConnectAccountModalOpen(false);
    };

    const handleRemoveAccount = async () => {
        if (!accountToRemove || !user) return;

        // Step 1: Check for ACTIVE locked savings. This is a business logic rule.
        const hasActiveSavings = lockedSavings.some(saving => 
            saving.accountId === accountToRemove.id && saving.status !== 'Withdrawn'
        );

        if (hasActiveSavings) {
            alert(`Cannot remove "${accountToRemove.name}". You must first withdraw or wait for all locked savings associated with this account to mature.`);
            setAccountToRemove(null);
            return;
        }

        const supabase = getSupabase();
        try {
            // Step 2: Delete associated historical records (e.g., withdrawn savings).
            // This is required to satisfy foreign key constraints in the database.
            const { error: savingsDeleteError } = await supabase
                .from('locked_savings')
                .delete()
                .eq('account_id', accountToRemove.id)
                .eq('user_id', user.id);
            
            if (savingsDeleteError) {
                throw new Error(`Failed to remove associated savings history: ${savingsDeleteError.message}`);
            }

            // Step 3: Now that child records are gone, delete the parent account.
            const { error: accountDeleteError, count } = await supabase
                .from('accounts')
                .delete({ count: 'exact' })
                .eq('id', accountToRemove.id)
                .eq('user_id', user.id);

            if (accountDeleteError) throw accountDeleteError;

            // If count is 0 after all that, it means RLS is still blocking it for another reason.
            if (count === 0) {
                throw new Error("Deletion failed. The account was not found or permission was denied by database security policies.");
            }

            await fetchData(); // Refresh data
            setAccountToRemove(null); // Close modal
        } catch (error: any) {
            console.error("Error removing account:", error);
            let errorMessage = `Failed to remove account. Reason: ${error.message || 'An unknown error occurred.'}`;
            if (error.message.includes('permission denied')) {
                errorMessage += "\nThis is often due to database security rules (Row Level Security).";
            } else if (error.message.includes('foreign key constraint')) {
                 errorMessage += "\nThis can happen if other records (like past transactions) are still linked to this account.";
            }
            alert(errorMessage);
            setAccountToRemove(null); // Close modal even on error
        }
    };


    // --- Derived State ---
    const notificationCount = transactions.filter(tx => (tx.type === 'request' && tx.to_details === user?.email && tx.status === TransactionStatus.PENDING)).length
        + lockedSavings.filter(s => s.status === 'Locked' && new Date() > new Date(s.endDate)).length;

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;
    }

    if (!user) {
        return <Auth />;
    }

    // --- Render Logic ---
    const tabStyle = "px-4 py-3 font-bold rounded-lg transition-all duration-300 w-full text-center";
    const activeTabStyle = "bg-lime-500 text-indigo-900 shadow-lg shadow-lime-500/20";
    const inactiveTabStyle = "bg-gray-700/50 hover:bg-gray-600 text-white";

    return (
        <div className="relative min-h-screen z-10">
            <Header 
                onProfileClick={() => setIsProfileModalOpen(true)}
                notificationCount={notificationCount}
                onBellClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            />
            {isNotificationsOpen && user?.email && (
                <NotificationsPanel 
                    transactions={transactions}
                    lockedSavings={lockedSavings}
                    currentUserEmail={user.email}
                    onApproveRequest={handleApproveRequest}
                    onDeclineRequest={handleDeclineRequest}
                    onWithdraw={handleWithdraw}
                    onClose={() => setIsNotificationsOpen(false)}
                />
            )}
            <main className="p-4 md:p-8 space-y-8">
                <BalanceSummary 
                    accounts={accounts} 
                    onConnectClick={() => setIsConnectAccountModalOpen(true)}
                    onRemoveAccount={(accountId: string) => {
                        const acc = accounts.find(a => a.id === accountId);
                        if (acc) setAccountToRemove(acc);
                    }}
                    onRefreshBalances={handleRefreshBalances}
                    isRefreshing={isRefreshingBalances}
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 p-2 bg-black/20 rounded-xl">
                    <button onClick={() => setActiveTab('send')} className={`${tabStyle} ${activeTab === 'send' ? activeTabStyle : inactiveTabStyle}`}>Send</button>
                    <button onClick={() => setActiveTab('request')} className={`${tabStyle} ${activeTab === 'request' ? activeTabStyle : inactiveTabStyle}`}>Request</button>
                    <button onClick={() => setActiveTab('lock')} className={`${tabStyle} ${activeTab === 'lock' ? activeTabStyle : inactiveTabStyle}`}>Lock</button>
                    <button onClick={() => setActiveTab('history')} className={`${tabStyle} ${activeTab === 'history' ? activeTabStyle : inactiveTabStyle}`}>History</button>
                </div>

                <div className="animate-fade-in-up">
                    {activeTab === 'send' && <SendMoney accounts={accounts} onSend={handleSendMoney} />}
                    {activeTab === 'request' && <RequestMoney onRequest={handleRequestMoney} />}
                    {activeTab === 'lock' && <LockedSavings accounts={accounts} lockedSavings={lockedSavings} onLock={handleLock} onWithdraw={handleWithdraw} />}
                    {activeTab === 'history' && user?.email && (
                        <TransactionHistory 
                            transactions={transactions} 
                            currentUserEmail={user.email}
                            onTransactionClick={setSelectedTransaction}
                            onApproveRequest={handleApproveRequest}
                            onDeclineRequest={handleDeclineRequest}
                            onClaimTransaction={handleClaimTransaction}
                            isClaimingId={isClaiming}
                            accounts={accounts}
                        />
                    )}
                </div>

                <SecurityTip />
            </main>
            
            <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Profile & Settings">
                 <ProfileSettings 
                    user={{ name: user.user_metadata?.name || 'User', email: user.email! }} 
                    onOpenDevSettings={() => {
                        setIsProfileModalOpen(false);
                        setIsDevSettingsModalOpen(true);
                    }}
                    isAdmin={isAdmin}
                 />
            </Modal>
            
            <Modal isOpen={isDevSettingsModalOpen} onClose={() => setIsDevSettingsModalOpen(false)} title="Developer Settings & API Guide">
                <DeveloperSettings currentUserEmail={user.email!} />
            </Modal>

            <ConnectAccountModal 
                isOpen={isConnectAccountModalOpen} 
                onClose={() => setIsConnectAccountModalOpen(false)} 
                onConnectionSuccess={handleConnectionSuccess}
                user={user}
            />

            <TransactionDetailModal
                isOpen={!!selectedTransaction}
                onClose={() => setSelectedTransaction(null)}
                transaction={selectedTransaction}
            />

             <Modal isOpen={!!accountToRemove} onClose={() => setAccountToRemove(null)} title="Confirm Account Removal">
                {accountToRemove && (
                    <div className="text-white space-y-4">
                        <p>Are you sure you want to remove the account <strong className="font-bold text-lime-300">{accountToRemove.name}</strong>?</p>
                        <p className="text-sm text-yellow-300 bg-yellow-900/30 p-3 rounded-lg">This action is irreversible. All active locked savings associated with this account must be withdrawn first.</p>
                        <div className="flex justify-end space-x-4 pt-4">
                            <button onClick={() => setAccountToRemove(null)} className="font-bold py-2 px-4 rounded-lg transition-colors bg-gray-600 hover:bg-gray-500">
                                Cancel
                            </button>
                            <button onClick={handleRemoveAccount} className="font-bold py-2 px-4 rounded-lg transition-colors bg-red-600 hover:bg-red-500">
                                Yes, Remove
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

        </div>
    );
};

export default App;
