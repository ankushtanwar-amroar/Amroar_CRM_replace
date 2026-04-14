import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, ChevronDown, Home, Users, Building2, Briefcase, CheckSquare, Calendar as CalendarIcon, X, Search } from 'lucide-react';
import SalesConsoleHeader from '../components/SalesConsoleHeader';
import DynamicListView from '../components/DynamicListView';
import DynamicRecordView from '../components/DynamicRecordView';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';

const SalesConsolePage = () => {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState(null);
  const [showAppLauncher, setShowAppLauncher] = useState(false);
  const [appSearchTerm, setAppSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState('list');
  const [selectedObject, setSelectedObject] = useState(null);
  
  // Tab management
  const [primaryTabs, setPrimaryTabs] = useState([]);
  const [activePrimaryTabId, setActivePrimaryTabId] = useState(null);

  useEffect(() => {
    // Get tenant from localStorage
    const storedTenant = localStorage.getItem('tenant');
    if (storedTenant) {
      try {
        const tenantData = JSON.parse(storedTenant);
        setTenantId(tenantData.id);
      } catch (error) {
        console.error('Error parsing tenant data:', error);
      }
    }

    // Listen for record click events from the main dashboard
    const handleMessage = (event) => {
      if (event.data.type === 'OPEN_RECORD_IN_CONSOLE') {
        const { objectName, recordId, recordName } = event.data;
        openRecordInTab(objectName, recordId, recordName);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [primaryTabs]);

  const openRecordInTab = (objectName, recordId, recordName) => {
    const tabId = `record-${objectName}-${recordId}`;
    
    // Check if tab already exists
    const existingTab = primaryTabs.find(t => t.id === tabId);
    if (existingTab) {
      setActivePrimaryTabId(tabId);
      return;
    }

    // Map object names to routes
    const routeMap = {
      'lead': 'leads',
      'account': 'accounts',
      'contact': 'contacts',
      'opportunity': 'opportunities',
      'task': 'tasks',
      'event': 'events'
    };

    const route = `${routeMap[objectName] || objectName}/${recordId}`;

    // Create new tab
    const newTab = {
      id: tabId,
      title: recordName || recordId,
      type: 'record',
      route: route,
      objectName: objectName
    };

    setPrimaryTabs([...primaryTabs, newTab]);
    setActivePrimaryTabId(tabId);
  };

  const objectTypes = [
    { id: 'home', label: 'Home', icon: Home, apiName: null },
    { id: 'lead', label: 'Leads', icon: Users, apiName: 'lead' },
    { id: 'account', label: 'Accounts', icon: Building2, apiName: 'account' },
    { id: 'contact', label: 'Contacts', icon: Users, apiName: 'contact' },
    { id: 'opportunity', label: 'Opportunities', icon: Briefcase, apiName: 'opportunity' },
    { id: 'task', label: 'Tasks', icon: CheckSquare, apiName: 'task' },
    { id: 'event', label: 'Events', icon: CalendarIcon, apiName: 'event' },
  ];

  // Available apps for the app launcher (for now just Sales Console)
  const availableApps = [
    { 
      id: 'sales-console', 
      label: 'Sales Console', 
      description: 'Manage leads, accounts, and opportunities',
      icon: Grid
    }
  ];

  // Filter apps based on search
  const filteredApps = availableApps.filter(app =>
    app.label.toLowerCase().includes(appSearchTerm.toLowerCase()) ||
    (app.description && app.description.toLowerCase().includes(appSearchTerm.toLowerCase()))
  );

  const handleSelectObject = (objectId) => {
    if (objectId === 'home') {
      setSelectedObject(null);
      setPrimaryTabs([]);
      setActivePrimaryTabId(null);
    } else {
      setSelectedObject(objectId);
      // Clear tabs when switching objects
      setPrimaryTabs([]);
      setActivePrimaryTabId(null);
    }
  };

  const closeTab = (tabId) => {
    const newTabs = primaryTabs.filter(t => t.id !== tabId);
    setPrimaryTabs(newTabs);
    
    if (activePrimaryTabId === tabId) {
      setActivePrimaryTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  };

  // Determine what to show
  const activePrimaryTab = primaryTabs.find(t => t.id === activePrimaryTabId);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Global CRM Header */}
      <SalesConsoleHeader 
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      {/* Console Navigation Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center space-x-4">
        {/* App Launcher */}
        <button
          onClick={() => setShowAppLauncher(!showAppLauncher)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          title="App Launcher"
        >
          <Grid className="w-5 h-5 text-slate-700" />
        </button>

        {/* Console Title & Object Dropdown */}
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-900">Sales Console</span>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </div>

        <div className="border-l border-slate-300 h-6"></div>

        {/* Object Navigation Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-slate-700">
              {selectedObject ? 
                objectTypes.find(o => o.id === selectedObject)?.label || 'Select Object' 
                : 'Home'}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {objectTypes.map(obj => {
              const Icon = obj.icon;
              return (
                <DropdownMenuItem 
                  key={obj.id}
                  onClick={() => handleSelectObject(obj.id)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{obj.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Primary Tabs Bar */}
      {primaryTabs.length > 0 && (
        <div className="bg-slate-100 border-b border-slate-300 flex items-center overflow-x-auto px-4">
          {primaryTabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center px-4 py-2 cursor-pointer border-r border-slate-300 ${
                activePrimaryTabId === tab.id ? 'bg-white' : 'hover:bg-slate-200'
              }`}
              onClick={() => setActivePrimaryTabId(tab.id)}
            >
              <span className="text-sm font-medium truncate max-w-xs">
                {tab.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-2 text-slate-500 hover:text-slate-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden bg-white">
        {activePrimaryTab ? (
          // Show record page in iframe
          <iframe
            src={`/${activePrimaryTab.route}`}
            className="w-full h-full border-0"
            title={activePrimaryTab.title}
          />
        ) : selectedObject ? (
          // Show dynamic list view with real data from console API
          <div className="h-full">
            <DynamicListView 
              objectApiName={selectedObject}
              tenantId={tenantId}
              onRecordClick={(record) => {
                // Open record in a new tab
                const tabId = `record-${selectedObject}-${record.id}`;
                const existingTab = primaryTabs.find(t => t.id === tabId);
                if (existingTab) {
                  setActivePrimaryTabId(tabId);
                  return;
                }

                const newTab = {
                  id: tabId,
                  title: record.name || record.id,
                  type: 'record',
                  route: `${selectedObject}/${record.id}`,
                  objectName: selectedObject
                };

                setPrimaryTabs([...primaryTabs, newTab]);
                setActivePrimaryTabId(tabId);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Home className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-slate-600 mb-2">
                Welcome to Sales Console
              </h2>
              <p className="text-slate-500">
                Select an object from the dropdown to get started
              </p>
            </div>
          </div>
        )}
      </div>

      {/* App Launcher Overlay */}
      {showAppLauncher && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => {
              setShowAppLauncher(false);
              setAppSearchTerm('');
            }}
          />
          <div className="fixed top-0 left-0 w-96 h-full bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">App Launcher</h2>
              <button
                onClick={() => {
                  setShowAppLauncher(false);
                  setAppSearchTerm('');
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={appSearchTerm}
                  onChange={(e) => setAppSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {filteredApps.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p>No apps found matching "{appSearchTerm}"</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {filteredApps.map(app => {
                    const AppIcon = app.icon;
                    return (
                      <button
                        key={app.id}
                        onClick={() => {
                          setShowAppLauncher(false);
                          setAppSearchTerm('');
                          // Already in Sales Console
                        }}
                        className="flex flex-col items-center p-6 rounded-lg hover:bg-slate-50 transition-colors border-2 border-blue-500"
                      >
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-3 shadow-md">
                          <AppIcon className="w-8 h-8 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900 text-center">{app.label}</span>
                        <span className="text-xs text-slate-500 mt-1">Active</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesConsolePage;
