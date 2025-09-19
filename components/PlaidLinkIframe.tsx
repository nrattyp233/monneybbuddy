import React, { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';

interface PlaidLinkIframeProps {
    linkToken: string;
    user: User;
    onSuccess: (publicToken: string) => void;
    onExit: (error: any, metadata: any) => void;
    onEvent: (eventName: string, metadata: any) => void;
}

const PlaidLinkIframe: React.FC<PlaidLinkIframeProps> = ({ 
    linkToken, 
    user, 
    onSuccess, 
    onExit, 
    onEvent 
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState(false);
    
    useEffect(() => {
        if (!linkToken || !user) return;
        
        const iframe = iframeRef.current;
        if (!iframe) return;
        
        // Create isolated iframe content with user-specific session
        const iframeContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Plaid Link - User ${user.id.slice(-8)}</title>
    <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
    <style>
        body { 
            margin: 0; 
            padding: 20px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1f2937;
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        #link-button {
            background: #84cc16;
            color: #1f2937;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
            font-size: 16px;
            margin-top: 20px;
        }
        #link-button:hover {
            background: #65a30d;
        }
        #link-button:disabled {
            background: #6b7280;
            cursor: not-allowed;
        }
        .status {
            margin-bottom: 20px;
            text-align: center;
        }
        .user-info {
            background: #374151;
            padding: 10px 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 14px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="user-info">
        User Session: ${user.id.slice(-8)}
    </div>
    <div class="status" id="status">Initializing secure connection...</div>
    <button id="link-button" disabled>Connect Bank Account</button>
    
    <script>
        // Clear any existing Plaid/SEON data for this iframe session
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (e) {
                console.warn('Could not clear storage:', e);
            }
        }
        
        // User-specific session identifier
        const userSessionId = 'plaid_session_${user.id}_' + Date.now();
        
        // Initialize Plaid Link with user-specific configuration
        const linkHandler = Plaid.create({
            token: '${linkToken}',
            // Force fresh session with user-specific identifier
            receivedRedirectUri: null,
            onSuccess: function(public_token, metadata) {
                parent.postMessage({
                    type: 'PLAID_SUCCESS',
                    publicToken: public_token,
                    metadata: metadata,
                    userSession: userSessionId
                }, '*');
            },
            onExit: function(err, metadata) {
                parent.postMessage({
                    type: 'PLAID_EXIT',
                    error: err,
                    metadata: metadata,
                    userSession: userSessionId
                }, '*');
            },
            onEvent: function(eventName, metadata) {
                parent.postMessage({
                    type: 'PLAID_EVENT',
                    eventName: eventName,
                    metadata: metadata,
                    userSession: userSessionId
                }, '*');
            }
        });
        
        document.getElementById('status').textContent = 'Ready to connect';
        const button = document.getElementById('link-button');
        button.disabled = false;
        button.onclick = function() {
            button.textContent = 'Opening Bank Connection...';
            button.disabled = true;
            linkHandler.open();
        };
        
        // Notify parent that iframe is ready
        parent.postMessage({
            type: 'PLAID_READY',
            userSession: userSessionId
        }, '*');
    </script>
</body>
</html>
        `;
        
        // Set up message listener
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== iframe.contentWindow) return;
            
            const { type, publicToken, error, metadata, eventName, userSession } = event.data;
            
            // Verify the message is from our user session
            if (!userSession || !userSession.includes(user.id)) {
                console.warn('Received message from wrong user session:', userSession);
                return;
            }
            
            switch (type) {
                case 'PLAID_READY':
                    console.log(`✅ Plaid iframe ready for user: ${user.id}`);
                    setIsReady(true);
                    break;
                case 'PLAID_SUCCESS':
                    console.log(`🎉 Plaid success for user: ${user.id}`);
                    onSuccess(publicToken);
                    break;
                case 'PLAID_EXIT':
                    console.log(`🚪 Plaid exit for user: ${user.id}`);
                    onExit(error, metadata);
                    break;
                case 'PLAID_EVENT':
                    onEvent(eventName, metadata);
                    break;
            }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Load the iframe content
        const blob = new Blob([iframeContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        iframe.src = url;
        
        return () => {
            window.removeEventListener('message', handleMessage);
            URL.revokeObjectURL(url);
            setIsReady(false);
        };
    }, [linkToken, user, onSuccess, onExit, onEvent]);
    
    return (
        <div className="w-full h-96 border border-gray-600 rounded-lg overflow-hidden">
            <iframe
                ref={iframeRef}
                className="w-full h-full"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                title={`Plaid Link for User ${user.id.slice(-8)}`}
            />
        </div>
    );
};

export default PlaidLinkIframe;