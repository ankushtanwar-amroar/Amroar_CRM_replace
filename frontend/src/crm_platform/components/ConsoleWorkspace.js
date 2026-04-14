import React, { useEffect, useState } from 'react';
import { useConsole } from '../contexts/ConsoleContext';
import ConsoleHeader from './ConsoleHeader';
import PrimaryTabBar from './PrimaryTabBar';
import SubtabBar from './SubtabBar';
import RecordPage from '../pages/RecordPage';
import ListView from '../pages/ListView';

const ConsoleWorkspace = ({ tenantId }) => {
  const { 
    primaryTabs, 
    activePrimaryTabId,
    subtabsByPrimaryTab,
    activeSubtabIds,
    openPrimaryTab
  } = useConsole();

  const [apps, setApps] = useState([]);

  useEffect(() => {
    // Fetch available apps/object types
    const fetchApps = async () => {
      try {
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/crm-platform/object-types?tenant_id=${tenantId}`
        );
        const data = await response.json();
        setApps(data.object_types || []);
      } catch (error) {
        console.error('Failed to fetch apps:', error);
      }
    };

    if (tenantId) {
      fetchApps();
    }
  }, [tenantId]);

  const handleSelectApp = (app) => {
    openPrimaryTab({
      id: `list-${app.id}`,
      title: app.label_plural,
      type: 'list',
      objectType: app.id,
      icon: app.icon,
      closeable: true
    });
  };

  const activePrimaryTab = primaryTabs.find(t => t.id === activePrimaryTabId);
  const activeSubtabId = activePrimaryTabId ? activeSubtabIds[activePrimaryTabId] : null;
  const subtabs = activePrimaryTabId ? subtabsByPrimaryTab[activePrimaryTabId] || [] : [];
  const activeSubtab = subtabs.find(t => t.id === activeSubtabId);

  // Determine what to render
  const contentToRender = activeSubtab || activePrimaryTab;

  return (
    <div className="h-screen flex flex-col">
      <ConsoleHeader 
        apps={apps} 
        onSelectApp={handleSelectApp}
        tenantId={tenantId}
      />
      <PrimaryTabBar />
      {activePrimaryTabId && <SubtabBar primaryTabId={activePrimaryTabId} />}
      
      <div className="flex-1 overflow-auto bg-gray-50">
        {contentToRender ? (
          contentToRender.type === 'record' ? (
            <RecordPage 
              objectType={contentToRender.objectType}
              recordId={contentToRender.recordId}
              publicId={contentToRender.publicId}
              tenantId={tenantId}
            />
          ) : contentToRender.type === 'list' ? (
            <ListView 
              objectType={contentToRender.objectType}
              tenantId={tenantId}
            />
          ) : (
            <div className="p-8 text-center text-gray-500">
              Custom content type: {contentToRender.type}
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-600 mb-2">Welcome to CRM Platform</h2>
              <p className="text-gray-500">Select an app from the launcher to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsoleWorkspace;
