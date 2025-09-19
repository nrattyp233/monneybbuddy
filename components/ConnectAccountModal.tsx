import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { Account } from '../types';
import { PlaidIcon, RefreshCwIcon, AlertTriangleIcon } from './icons';
import { getSupabase } from '../services/supabase';
import type { User } from '@supabase/supabase-js';
import PlaidLinkIframe from './PlaidLinkIframe';

interface ConnectAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnectionSuccess: (instantAccounts?: { name: string; balance: number | null; provider: string; type?: string }[]) => void; // optional immediate accounts
    user: User | null;
}

const ConnectAccountModal: React.FC<ConnectAccountModalProps> = ({ isOpen, onClose, onConnectionSuccess, user }) => {
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rawError, setRawError] = useState<any>(null);
    
    // Clear any Plaid-related browser storage when modal opens for user isolation
    useEffect(() => {
        if (isOpen && user) {
            try {
                console.log(`Clearing ALL browser storage for user isolation: ${user.id}`);
                
                // 1. Clear localStorage
                const localStorageKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (
                        key.toLowerCase().includes('plaid') || 
                        key.toLowerCase().includes('link') ||
                        key.toLowerCase().includes('bank') ||
                        key.toLowerCase().includes('account') ||
                        key.toLowerCase().includes('token')
                    )) {
                        localStorageKeys.push(key);
                    }
                }
                localStorageKeys.forEach(key => {
                    console.log(`Clearing localStorage: ${key}`);
                    localStorage.removeItem(key);
                });
                
                // 2. Clear sessionStorage
                const sessionStorageKeys = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && (
                        key.toLowerCase().includes('plaid') || 
                        key.toLowerCase().includes('link') ||
                        key.toLowerCase().includes('bank') ||
                        key.toLowerCase().includes('account') ||
                        key.toLowerCase().includes('token')
                    )) {
                        sessionStorageKeys.push(key);
                    }
                }
                sessionStorageKeys.forEach(key => {
                    console.log(`Clearing sessionStorage: ${key}`);
                    sessionStorage.removeItem(key);
                });
                
                // 3. Clear IndexedDB (if accessible)
                if (typeof indexedDB !== 'undefined') {
                    try {
                        indexedDB.databases().then(databases => {
                            databases.forEach(db => {
                                if (db.name && db.name.toLowerCase().includes('plaid')) {
                                    console.log(`Deleting IndexedDB: ${db.name}`);
                                    indexedDB.deleteDatabase(db.name);
                                }
                            });
                        }).catch(e => console.warn('Could not clear IndexedDB:', e));
                    } catch (e) {
                        console.warn('IndexedDB clearing not supported:', e);
                    }
                }
                
                // 4. Clear cookies more aggressively
                if (typeof document !== 'undefined') {
                    const allCookies = document.cookie.split(';');
                    allCookies.forEach(cookie => {
                        const eqPos = cookie.indexOf('=');
                        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                        if (name.toLowerCase().includes('plaid') || 
                            name.toLowerCase().includes('link') ||
                            name.toLowerCase().includes('bank')) {
                            console.log(`Clearing cookie: ${name}`);
                            // Clear for multiple domains and paths
                            const domains = ['', '.plaid.com', '.cdn.plaid.com', window.location.hostname];
                            const paths = ['/', '/link'];
                            domains.forEach(domain => {
                                paths.forEach(path => {
                                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
                                });
                            });
                        }
                    });
                }
                
                console.log(`✅ Completed comprehensive storage clearing for user: ${user.id}`);
            } catch (error) {
                console.warn('Could not clear browser storage:', error);
            }
        }
    }, [isOpen, user]);
    
    // Generic error handler for Supabase function calls
    const handleFunctionError = (err: any, context: 'token creation' | 'token exchange') => {
        console.error(`Error during ${context}:`, err);
        setRawError(err);
        let detailedError = `Could not initialize Plaid connection. Please try again later.`;
        if (err.message) {
            const lowerCaseMessage = err.message.toLowerCase();
            if (lowerCaseMessage.includes('cors') || lowerCaseMessage.includes('failed to fetch')) {
                detailedError = "Network Error: This is often due to a CORS policy on the server. Please ensure your Supabase Edge Function is configured with the correct CORS headers to accept requests from this app's domain.";
            } else if (lowerCaseMessage.includes('edge function')) {
                detailedError = "Server Error: The application's backend (a Supabase Edge Function) failed to process the request. This is often caused by missing API keys (like Plaid credentials) in the server's configuration. Please check the setup guide in your profile settings for more information.";
            } else if (lowerCaseMessage.includes('429') || lowerCaseMessage.includes('too many requests')) {
                detailedError = "Rate Limit Error: Too many requests have been made to Plaid. Please wait a few minutes and try again.";
            } else if (lowerCaseMessage.includes('seon') || lowerCaseMessage.includes('geolocation')) {
                detailedError = "Configuration Error: There's an issue with the Plaid Link configuration. This is usually related to security features and should resolve itself. Please try again.";
            } else {
                detailedError = `An unexpected error occurred: ${err.message}`;
            }
        }
        setError(detailedError);
    };

    // Fetch the link_token from our Supabase Edge Function
    useEffect(() => {
        if (!isOpen || !user) return;

        const createLinkToken = async () => {
            setIsLoading(true);
            setError(null);
            setRawError(null);
            setLinkToken(null); // Clear any existing token
            
            try {
                console.log(`Creating fresh Plaid link token for user: ${user.id}`);
                const supabase = getSupabase();
                const { data, error: funcError } = await supabase.functions.invoke('create-link-token', {
                    body: { 
                        user_id: user.id, // Explicitly pass user ID
                        force_refresh: true // Request fresh token
                    }
                });
                if (funcError) throw funcError;
                if (data && data.needsServerConfig) {
                    throw new Error(data.guidance || 'Server needs configuration for Plaid.');
                }
                if (!data || !data.link_token) {
                    throw new Error("Failed to retrieve a link token from the server.");
                }
                console.log(`Successfully created link token for user: ${user.id}`);
                setLinkToken(data.link_token);
            } catch (err: any) {
                handleFunctionError(err, 'token creation');
            } finally {
                setIsLoading(false);
            }
        };

        createLinkToken();
    }, [isOpen, user]);

    const onSuccess = useCallback(async (public_token: string) => {
        console.log(`🔄 Plaid onSuccess called for user: ${user?.id} with public_token: ${public_token.slice(0, 20)}...`);
        setIsLoading(true);
        setError(null);
        try {
            const supabase = getSupabase();
            console.log(`📤 Calling exchange-public-token for user: ${user?.id}`);
            const { data, error: funcError } = await supabase.functions.invoke('exchange-public-token', {
                body: { public_token },
            });

            if (funcError) {
                console.error(`❌ Exchange function error for user ${user?.id}:`, funcError);
                throw funcError;
            }
            if (data && data.needsServerConfig) {
                throw new Error(data.guidance || 'Server needs configuration for Plaid.');
            }
            if (data && data.needsReconnection) {
                // Surface a clear reconnection message
                throw new Error('Plaid requires re-authorization. Please try connecting again.');
            }

            console.log(`📥 Exchange response for user ${user?.id}:`, {
                user_id: data?.user_id,
                accounts_count: data?.accounts?.length || 0,
                accounts: data?.accounts?.map(a => ({ name: a.name, balance: a.balance })) || [],
                persisted: data?.persisted
            });
            
            // If backend persistence failed, fall back to inserting accounts client-side.
            if (data && data.accounts && Array.isArray(data.accounts) && data.persisted === false) {
                console.log(`💾 Backend persistence failed, inserting ${data.accounts.length} accounts client-side for user: ${user?.id}`);
                for (const acct of data.accounts) {
                    // Try to find existing by name
                    const { data: existing, error: selErr } = await supabase
                      .from('accounts')
                      .select('id')
                      .eq('name', acct.name)
                      .eq('user_id', data.user_id)
                      .maybeSingle();
                    if (selErr) continue;
                    if (!existing) {
                        await supabase.from('accounts').insert({
                            name: acct.name,
                            provider: acct.provider || 'Plaid',
                            type: acct.type,
                            balance: acct.balance,
                            user_id: data.user_id
                        });
                    } else {
                        await supabase.from('accounts')
                          .update({ balance: acct.balance, type: acct.type, provider: acct.provider || 'Plaid' })
                          .eq('id', existing.id);
                    }
                }
            }

            const mappedAccounts = data?.accounts?.map((a:any) => ({ 
                name: a.name, 
                balance: a.balance, 
                provider: a.provider || 'Plaid', 
                type: a.type 
            }));
            
            console.log('Calling onConnectionSuccess with mapped accounts:', mappedAccounts);
            onConnectionSuccess(mappedAccounts);
            onClose();

        } catch (err: any) {
            handleFunctionError(err, 'token exchange');
            setIsLoading(false); // Keep modal open to show error
        }
    }, [onConnectionSuccess, onClose]);
    
    const handlePlaidExit = (err: any, metadata: any) => {
        if (err != null) {
            console.log('Plaid Link exited with error:', err);
        }
        // Optionally close modal on exit
        // onClose();
    };
    
    const handlePlaidEvent = (eventName: string, metadata: any) => {
        console.log('Plaid Link event:', eventName, metadata);
    };

    // Reset state when modal is closed
    useEffect(() => {
        if (!isOpen) {
            setLinkToken(null);
            setIsLoading(true);
            setError(null);
            setRawError(null);
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Connect Bank Account">
            <div className="space-y-4">
                
                {error && (
                    <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-md flex flex-col space-y-2 text-sm text-left">
                        <div className="flex items-start space-x-3 text-red-300">
                            <AlertTriangleIcon className="w-8 h-8 flex-shrink-0 mt-0.5"/>
                            <span className="text-red-200 whitespace-pre-wrap">{error}</span>
                        </div>
                        {rawError && (
                            <details className="bg-black/20 rounded p-2 text-xs text-red-400 whitespace-pre-wrap">
                                <summary className="cursor-pointer text-red-300">Raw error details</summary>
                                {typeof rawError === 'string' ? rawError : JSON.stringify(rawError, null, 2)}
                            </details>
                        )}
                        <div className="flex justify-end pt-1">
                            <button
                                onClick={() => {
                                    setError(null); 
                                    setRawError(null); 
                                    setIsLoading(true); 
                                    setLinkToken(null);
                                }}
                                className="px-3 py-1 text-xs rounded bg-red-700 hover:bg-red-600 text-white"
                            >Retry</button>
                        </div>
                    </div>
                )}

                {isLoading && (
                    <div className="flex items-center justify-center py-8">
                        <RefreshCwIcon className="w-6 h-6 animate-spin mr-3"/>
                        <span>Initializing secure connection...</span>
                    </div>
                )}

                {linkToken && user && !isLoading && !error && (
                    <div className="space-y-4">
                        <div className="text-center text-sm text-gray-400 mb-4">
                            <PlaidIcon className="w-8 h-8 mx-auto mb-2"/>
                            Secure connection ready for user {user.email}
                        </div>
                        
                        <PlaidLinkIframe
                            linkToken={linkToken}
                            user={user}
                            onSuccess={onSuccess}
                            onExit={handlePlaidExit}
                            onEvent={handlePlaidEvent}
                        />
                        
                        <p className="text-xs text-gray-500 text-center">
                            By connecting, you agree to the Plaid <a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">End User Privacy Policy</a>.
                        </p>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ConnectAccountModal;