import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import Modal from './Modal';
import { Account } from '../types';
import { PlaidIcon, RefreshCwIcon, AlertTriangleIcon } from './icons';
import { getSupabase } from '../services/supabase';

interface ConnectAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnectionSuccess: (instantAccounts?: { name: string; balance: number | null; provider: string; type?: string }[]) => void; // optional immediate accounts
}

const ConnectAccountModal: React.FC<ConnectAccountModalProps> = ({ isOpen, onClose, onConnectionSuccess }) => {
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rawError, setRawError] = useState<any>(null);
    
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
        if (!isOpen) return;

        const createLinkToken = async () => {
            setIsLoading(true);
            setError(null);
            setRawError(null);
            try {
                const supabase = getSupabase();
                const { data, error: funcError } = await supabase.functions.invoke('create-link-token');

                if (funcError) throw funcError;
                if (!data || !data.link_token) throw new Error("Failed to retrieve a link token from the server.");

                setLinkToken(data.link_token);
            } catch (err: any) {
                handleFunctionError(err, 'token creation');
            } finally {
                setIsLoading(false);
            }
        };

        createLinkToken();
    }, [isOpen]);

    const onSuccess = useCallback(async (public_token: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const supabase = getSupabase();
            const { data, error: funcError } = await supabase.functions.invoke('exchange-public-token', {
                body: { public_token },
            });

            if (funcError) throw funcError;

            console.log('Plaid exchange response:', data); // Debug logging
            
            // If backend persistence failed, fall back to inserting accounts client-side.
            if (data && data.accounts && Array.isArray(data.accounts) && data.persisted === false) {
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
    
    const { open, ready } = usePlaidLink({
        token: linkToken,
        onSuccess,
        onExit: (err, metadata) => {
            if (err != null) {
                console.log('Plaid Link exited with error:', err);
            }
        },
        onEvent: (eventName, metadata) => {
            console.log('Plaid Link event:', eventName, metadata);
        },
    });

    // Reset state when modal is closed
    useEffect(() => {
        if (!isOpen) {
            setLinkToken(null);
            setIsLoading(true);
            setError(null);
            setRawError(null);
        }
    }, [isOpen]);
    
    const connectDisabled = !ready || isLoading || !linkToken || !!error;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Connect Bank Account">
            <div className="space-y-4 text-center">
                
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
                                                            setError(null); setRawError(null); setIsLoading(true); setLinkToken(null);
                                                            // retry fetching link token
                                                            const supabase = getSupabase();
                                                            supabase.functions.invoke('create-link-token')
                                                                .then(({ data, error: funcError }) => {
                                                                    if (funcError || !data?.link_token) {
                                                                        handleFunctionError(funcError || new Error('Failed to retrieve a link token on retry'), 'token creation');
                                                                    } else {
                                                                        setLinkToken(data.link_token);
                                                                    }
                                                                })
                                                                .finally(() => setIsLoading(false));
                                                        }}
                                                        className="px-3 py-1 text-xs rounded bg-red-700 hover:bg-red-600 text-white"
                                                    >Retry</button>
                                                </div>
                                        </div>
                                )}

                <div className="pt-4">
                    <button 
                        onClick={() => open()} 
                        disabled={connectDisabled}
                        className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <RefreshCwIcon className="w-5 h-5 animate-spin"/>
                                <span>Initializing...</span>
                            </>
                        ) : (
                             <>
                                <PlaidIcon className="w-6 h-6"/>
                                <span>Continue with Plaid</span>
                            </>
                        )}
                    </button>
                </div>

                 <p className="text-xs text-gray-500 pt-2">
                    By connecting, you agree to the Plaid <a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">End User Privacy Policy</a>.
                </p>
            </div>
        </Modal>
    );
};

export default ConnectAccountModal;