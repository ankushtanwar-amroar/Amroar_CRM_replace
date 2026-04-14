import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SalesConsolePageNew from './SalesConsolePageNew';
import platformService from '../services/platformService';

const CRMPlatformPage = () => {
  const [tenantId, setTenantId] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializePlatform = async () => {
      try {
        // Get tenant ID from localStorage or use default
        let storedTenantId = localStorage.getItem('tenant_id');
        
        // If no tenant_id, try to get from user data
        if (!storedTenantId) {
          const userData = localStorage.getItem('user');
          if (userData) {
            try {
              const user = JSON.parse(userData);
              storedTenantId = user.tenant_id;
            } catch (e) {
              console.log('Could not parse user data');
            }
          }
        }
        
        // If still no tenant_id, use a default for demo
        if (!storedTenantId) {
          storedTenantId = 'demo-tenant-' + Date.now();
          localStorage.setItem('tenant_id', storedTenantId);
          console.log('Created demo tenant:', storedTenantId);
        }
        
        console.log('Initializing CRM Platform for tenant:', storedTenantId);
        setTenantId(storedTenantId);
        
        // Initialize platform for this tenant
        await platformService.initializePlatform(storedTenantId);
        console.log('CRM Platform initialized successfully');
        setInitialized(true);
      } catch (error) {
        console.error('Failed to initialize platform:', error);
        setError(error.message || 'Failed to initialize CRM Platform');
        // Set initialized to true anyway to show the UI
        setInitialized(true);
      }
    };

    initializePlatform();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <p className="text-red-600 mb-2">Error initializing CRM Platform</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!tenantId || !initialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing CRM Platform...</p>
          <p className="text-gray-400 text-sm mt-2">This should only take a moment</p>
        </div>
      </div>
    );
  }

  return <SalesConsolePageNew />;
};

export default CRMPlatformPage;
