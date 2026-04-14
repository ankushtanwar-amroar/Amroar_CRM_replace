/**
 * Sales Home Page
 * 
 * Renders the Sales app home page using the page configuration.
 * Components are rendered based on the page layout from App Manager.
 */
import React, { useState, useEffect } from 'react';
import { AlertCircle, Home } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { getAppHomePage, listApps } from '../services/appManagerService';
import TasksDueComponent from '../components/TasksDueComponent';
import PipelineSnapshotComponent from '../components/PipelineSnapshotComponent';
import QuickActionsComponent from '../components/QuickActionsComponent';

// Component registry mapping
const componentMap = {
  'tasks_due': TasksDueComponent,
  'pipeline_snapshot': PipelineSnapshotComponent,
  'quick_actions': QuickActionsComponent,
  // Add more components as they are built
};

const SalesHomePage = () => {
  const [pageConfig, setPageConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appId, setAppId] = useState(null);

  useEffect(() => {
    fetchSalesApp();
  }, []);

  const fetchSalesApp = async () => {
    setLoading(true);
    setError(null);
    try {
      // First get the Sales app
      const appsResponse = await listApps();
      const salesApp = appsResponse.apps?.find(app => app.api_name === 'sales');
      
      if (!salesApp) {
        setError('Sales app not found. Please contact your administrator.');
        return;
      }

      setAppId(salesApp.id);

      // Then get the home page
      const homePage = await getAppHomePage(salesApp.id);
      setPageConfig(homePage);
    } catch (err) {
      console.error('Error fetching Sales Home:', err);
      setError('Failed to load Sales Home page');
    } finally {
      setLoading(false);
    }
  };

  const renderComponent = (componentConfig) => {
    const Component = componentMap[componentConfig.component_type];
    
    if (!Component) {
      console.warn(`Unknown component type: ${componentConfig.component_type}`);
      return (
        <Card key={componentConfig.id} className="p-4 text-gray-500">
          Component not available: {componentConfig.component_type}
        </Card>
      );
    }

    return (
      <Component 
        key={componentConfig.id} 
        config={componentConfig.config || {}} 
      />
    );
  };

  const renderRegion = (regionName, components = []) => {
    if (!components || components.length === 0) return null;

    // Sort by order
    const sortedComponents = [...components].sort((a, b) => (a.order || 0) - (b.order || 0));

    return (
      <div className="space-y-4">
        {sortedComponents.map(comp => renderComponent(comp))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6" data-testid="sales-home-loading">
        {/* Header skeleton */}
        <div className="animate-pulse h-12 bg-gray-200 rounded-lg w-full" />
        
        {/* Content skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />
          <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]" data-testid="sales-home-error">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Page</h2>
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  if (!pageConfig) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]" data-testid="sales-home-empty">
        <Home className="h-12 w-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">No Home Page Configured</h2>
        <p className="text-gray-500">Please contact your administrator to set up the Sales Home page.</p>
      </div>
    );
  }

  const { layout } = pageConfig;
  const regions = layout?.regions || {};
  const template = layout?.template || 'header_two_column';

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen" data-testid="sales-home-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Home className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{pageConfig.name}</h1>
            {pageConfig.description && (
              <p className="text-sm text-gray-500">{pageConfig.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Header Region - Full Width */}
      {regions.header?.length > 0 && (
        <div className="w-full" data-testid="region-header">
          {renderRegion('header', regions.header)}
        </div>
      )}

      {/* Content Area - Based on Template */}
      {template === 'header_two_column' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div data-testid="region-left">
            {renderRegion('left_column', regions.left_column)}
          </div>

          {/* Right Column */}
          <div data-testid="region-right">
            {renderRegion('right_column', regions.right_column)}
          </div>
        </div>
      )}

      {template === 'header_one_column' && (
        <div data-testid="region-main">
          {renderRegion('main', regions.main)}
        </div>
      )}

      {template === 'header_sidebar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main */}
          <div className="lg:col-span-2" data-testid="region-main">
            {renderRegion('main', regions.main)}
          </div>

          {/* Sidebar */}
          <div data-testid="region-sidebar">
            {renderRegion('sidebar', regions.sidebar)}
          </div>
        </div>
      )}

      {template === 'three_column' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div data-testid="region-left">
            {renderRegion('left_column', regions.left_column)}
          </div>
          <div data-testid="region-main">
            {renderRegion('main', regions.main)}
          </div>
          <div data-testid="region-right">
            {renderRegion('right_column', regions.right_column)}
          </div>
        </div>
      )}

      {template === 'blank' && (
        <div data-testid="region-main">
          {renderRegion('main', regions.main)}
        </div>
      )}
    </div>
  );
};

export default SalesHomePage;
