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
                setUser(session?.user ?? null);
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
            console.log('Fetching data for user:', user.id); // Debug logging
            
            const [accountsRes, transactionsRes, savingsRes] = await Promise.all([
                supabase.from('accounts').select('*').eq('user_id', user.id),
                supabase.from('transactions').select('*').or(`from_details.eq.${user.email},to_details.eq.${user.email}`).order('created_at', { ascending: false }),
                supabase.from('locked_savings').select('*').eq('user_id', user.id)
            ]);

            if (accountsRes.error) {
                console.error('Accounts fetch error:', accountsRes.error);
                throw accountsRes.error;
            }
            if (transactionsRes.error) {
                console.error('Transactions fetch error:', transactionsRes.error);
                throw transactionsRes.error;
            }
            if (savingsRes.error) {
                console.error('Savings fetch error:', savingsRes.error);
                throw savingsRes.error;
            }

            console.log('Fetched accounts:', accountsRes.data); // Debug logging
            setAccounts(accountsRes.data as Account[]);
            
            const formattedTransactions = transactionsRes.data.map(tx => ({
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

    // --- Action Handlers ---

    const handleSendMoney = async (fromAccountId: string, to: string, amount: number, description: string, geoFence: GeoFence | undefined, timeRestriction: TimeRestriction | undefined) => {
        if (!user || !user.email) return Promise.reject(new Error("User not authenticated"));
        const fromAccount = accounts.find(acc => acc.id === fromAccountId);
        if (!fromAccount) {
             return Promise.reject(new Error("Invalid source account."));
        }
        
        const fee = amount * TRANSACTION_FEE_RATE;
        const totalDebit = amount + fee;
        const hasRestrictions = !!geoFence || !!timeRestriction;
        const supabase = getSupabase();
    
        try {
            if (hasRestrictions) {
                // --- INTERNAL CONDITIONAL TRANSFER ---
                if (fromAccount.balance === null || fromAccount.balance < totalDebit) {
                    throw new Error("Insufficient funds to cover the amount and transaction fee.");
                }
    
                // 1. Debit the sender's account immediately for amount + fee
                const { error: updateError } = await supabase
                    .from('accounts')
                    .update({ balance: fromAccount.balance - totalDebit })
                    .eq('id', fromAccountId);
                if (updateError) throw updateError;
    
                // 2. Create the 'Pending' transaction for the recipient to claim
                const { error: insertError } = await supabase.from('transactions').insert({
                    user_id: user.id,
                    from_details: user.email,
                    to_details: to,
                    amount: amount,
                    fee: fee,
                    description: description,
                    type: 'send',
                    status: 'Pending',
                    geo_fence: geoFence,
                    time_restriction: timeRestriction,
                });
                if (insertError) throw insertError;
    
                await fetchData();
                setActiveTab('history');
                alert('Your conditional payment has been sent. The recipient must claim it by meeting the conditions.');
    
            } else {
                // --- REAL PAYPAL TRANSFER ---
                console.log('🚀 Starting real PayPal transfer...', { amount, fee, to, description });
                
                const { data: orderData, error: orderError } = await supabase.functions.invoke('create-paypal-order', {
                    body: { 
                        amount: amount.toFixed(2), 
                        fee: fee.toFixed(2),
                        recipient_email: to, 
                        description 
                    },
                });
    
                if (orderError) {
                    console.error('❌ PayPal order creation failed:', orderError);
                    throw orderError;
                }
                
                console.log('✅ PayPal order created:', orderData);
                const { orderId, approval_url, success } = orderData;
                
                if (!success || !orderId || !approval_url) {
                    throw new Error("Failed to create PayPal order - missing required data");
                }

                // Create pending transaction record BEFORE PayPal approval
                const { error: insertError } = await supabase.from('transactions').insert({
                    user_id: user.id,
                    from_details: user.email,
                    to_details: to,
                    amount: amount,
                    fee: fee,
                    description: description,
                    type: 'send',
                    status: 'Pending',
                    paypal_order_id: orderId,
                    payment_method: 'paypal'
                });
                
                if (insertError) {
                    console.error('❌ Failed to create transaction record:', insertError);
                    throw insertError;
                }

                console.log('💳 Opening PayPal checkout window...');
                // Open PayPal approval URL in new window
                const paypalWindow = window.open(approval_url, 'paypal-checkout', 'width=600,height=700,scrollbars=yes');
                
                if (!paypalWindow) {
                    throw new Error('Failed to open PayPal checkout window. Please allow popups and try again.');
                }

                // Monitor PayPal window completion
                const checkInterval = setInterval(async () => {
                    try {
                        if (paypalWindow.closed) {
                            clearInterval(checkInterval);
                            console.log('🔄 PayPal window closed, capturing payment...');

                            // Capture the PayPal payment
                            const { data: captureData, error: captureError } = await supabase.functions.invoke('capture-paypal-order', {
                                body: { 
                                    order_id: orderId,
                                    user_id: user.id
                                }
                            });

                            if (captureError) {
                                console.error('❌ PayPal capture failed:', captureError);
                                // Update transaction status to failed
                                await supabase.from('transactions')
                                    .update({ status: 'Failed' })
                                    .eq('paypal_order_id', orderId);
                                
                                alert('❌ Payment failed. Please try again.');
                                return;
                            }

                            console.log('🎉 PayPal payment captured successfully:', captureData);
                            
                            if (captureData.success) {
                                // Update transaction status to completed
                                await supabase.from('transactions')
                                    .update({ 
                                        status: 'Completed',
                                        external_transaction_id: captureData.transaction_id
                                    })
                                    .eq('paypal_order_id', orderId);

                                alert(`🎉 $${amount} successfully sent to ${to} via PayPal!`);
                                await fetchData(); // Refresh to show completed transaction
                                setActiveTab('history');
                            } else {
                                alert('⚠️ Payment status unclear. Please check your PayPal account.');
                            }
                        }
                    } catch (error) {
                        console.error('Error in PayPal completion check:', error);
                        clearInterval(checkInterval);
                    }
                }, 2000); // Check every 2 seconds

                // Timeout after 10 minutes
                setTimeout(() => {
                    clearInterval(checkInterval);
                    if (paypalWindow && !paypalWindow.closed) {
                        paypalWindow.close();
                        console.log('⏰ PayPal checkout timed out');
                    }
                }, 600000); // 10 minutes

                console.log('⏳ Waiting for PayPal approval...');
            }
        } catch (error: any) {
            console.error("Error sending money:", error);
            alert(`Failed to send payment. Reason: ${error.message || 'An unknown error occurred.'}`);
            throw error; // Re-throw for the UI component
        }
    };
    
    const handleClaimTransaction = async (tx: Transaction) => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        setIsClaiming(tx.id);
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const supabase = getSupabase();
                try {
                    const { error } = await supabase.functions.invoke('claim-transaction', {
                        body: { transactionId: tx.id, userCoordinates: { latitude, longitude } },
                    });

                    if (error) {
                        // The function will return a specific error message
                        throw new Error(error.message || 'The backend function returned an error.');
                    }
                    
                    alert('Transaction claimed successfully!');
                    await fetchData();

                } catch (err: any) {
                     // Catching errors from the invoke call itself or thrown from the function
                    const detail = err.context?.details ? JSON.parse(err.context.details).error : err.message;
                    alert(`Claim failed: ${detail}`);
                } finally {
                    setIsClaiming(null);
                }
            },
            (error) => {
                alert(`Could not get your location: ${error.message}`);
                setIsClaiming(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
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
