import React, { useState } from 'react';

interface DeveloperSettingsProps {
  currentUserEmail: string;
}

const DeveloperSettings: React.FC<DeveloperSettingsProps> = ({ currentUserEmail }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [envVars, setEnvVars] = useState({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || 'Not set',
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? '***KEY_SET***' : 'Not set',
    VITE_USE_MOCKS: import.meta.env.VITE_USE_MOCKS || 'Not set',
    NODE_ENV: import.meta.env.NODE_ENV || 'development'
  });

  const toggleSettings = () => {
    setIsOpen(!isOpen);
  };

  const isDeveloper = currentUserEmail && (
    currentUserEmail.includes('@developer.com') ||
    currentUserEmail.includes('@admin.com') ||
    envVars.NODE_ENV === 'development'
  );

  if (!isDeveloper) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Toggle Button */}
      <button
        onClick={toggleSettings}
        className="bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
        title="Developer Settings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
        </svg>
      </button>

      {/* Settings Panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 bg-white border border-gray-300 rounded-lg shadow-xl p-4 w-80 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Developer Settings</h3>
            <button
              onClick={toggleSettings}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Environment Variables</h4>
              <div className="space-y-2 text-sm">
                {Object.entries(envVars).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="font-mono text-gray-600">{key}:</span>
                    <span className={`font-mono ${value === 'Not set' ? 'text-red-500' : 'text-green-600'}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">Quick Actions</h4>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    console.log('Environment Variables:', envVars);
                    console.log('Current User:', currentUserEmail);
                  }}
                  className="w-full bg-blue-500 text-white px-3 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                >
                  Log Debug Info
                </button>
                
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.clear();
                      sessionStorage.clear();
                      window.location.reload();
                    }
                  }}
                  className="w-full bg-orange-500 text-white px-3 py-2 rounded text-sm hover:bg-orange-600 transition-colors"
                >
                  Clear Storage & Reload
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">Build Info</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Version:</span>
                  <span className="font-mono">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span>Build:</span>
                  <span className="font-mono">{new Date().toISOString().split('T')[0]}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeveloperSettings;