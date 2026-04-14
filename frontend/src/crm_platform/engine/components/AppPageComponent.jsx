/**
 * AppPageComponent - Embedded App Page Renderer
 * 
 * This component renders an App Page inline within another layout.
 * It fetches the page's layout and renders all its components.
 * 
 * Features:
 * - Fetches page layout dynamically
 * - Renders page components inline (not as a card/link)
 * - Supports nested layouts
 * - Passes context to child components
 */
import React, { useState, useEffect } from 'react';
import { Loader2, FileText, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { getPage } from '../../app_manager/services/appManagerService';

// Import home page components for rendering
import TasksDueComponent from '../../app_manager/components/TasksDueComponent';
import EventsTodayComponent from '../../app_manager/components/EventsTodayComponent';
import PipelineSnapshotComponent from '../../app_manager/components/PipelineSnapshotComponent';
import WorkQueueComponent from '../../app_manager/components/WorkQueueComponent';
import RecentRecordsComponent from '../../app_manager/components/RecentRecordsComponent';
import QuickActionsComponent from '../../app_manager/components/QuickActionsComponent';

// Component registry for home page components
const HOME_COMPONENT_MAP = {
  tasks_due: TasksDueComponent,
  events_today: EventsTodayComponent,
  pipeline_snapshot: PipelineSnapshotComponent,
  work_queue: WorkQueueComponent,
  recent_records: RecentRecordsComponent,
  quick_actions: QuickActionsComponent,
};

/**
 * Render a single component from the page layout
 */
const renderPageComponent = (component, context, index) => {
  const componentId = component.componentType || component.type || component.id;
  const Component = HOME_COMPONENT_MAP[componentId];
  
  if (!Component) {
    // Unknown component - show placeholder
    return (
      <div 
        key={component.instanceId || `comp-${index}`}
        className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center"
      >
        <FileText className="h-6 w-6 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-500">
          Component: {componentId || 'Unknown'}
        </p>
      </div>
    );
  }
  
  return (
    <Component
      key={component.instanceId || `comp-${index}`}
      config={component.config || {}}
      context={context}
    />
  );
};

/**
 * AppPageComponent - Main Component
 */
const AppPageComponent = ({ 
  config = {},
  context = {},
  record,
  recordId,
  objectName,
}) => {
  const pageId = config.pageId;
  const pageName = config.pageName || 'App Page';
  const showTitle = config.showTitle !== false;
  
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Load page data
  useEffect(() => {
    const loadPage = async () => {
      if (!pageId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        const pageData = await getPage(pageId);
        setPage(pageData);
      } catch (err) {
        console.error('Error loading app page:', err);
        setError('Failed to load page');
      } finally {
        setLoading(false);
      }
    };
    
    loadPage();
  }, [pageId]);
  
  // Build context for child components
  const childContext = {
    ...context,
    record,
    recordId,
    objectName,
    parentPageId: pageId,
  };
  
  // Loading state
  if (loading) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading page...</span>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Error state
  if (error) {
    return (
      <Card className="shadow-sm border-red-200 bg-red-50">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // No page ID configured
  if (!pageId) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
            <FileText className="h-8 w-8 text-slate-400" />
            <span className="text-sm">No page selected</span>
            <span className="text-xs text-slate-400">
              Configure this component to select an App Page
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Get components from page layout
  const layout = page?.layout || {};
  const regions = layout.regions || {};
  
  // Flatten all components from all regions
  const allComponents = [];
  Object.entries(regions).forEach(([regionName, regionComponents]) => {
    if (Array.isArray(regionComponents)) {
      regionComponents.forEach(comp => {
        allComponents.push({ ...comp, region: regionName });
      });
    }
  });
  
  // Render page components inline
  return (
    <div className="app-page-component space-y-4" data-testid="app-page-component">
      {/* Optional title */}
      {showTitle && page?.name && (
        <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
          <FileText className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-medium text-slate-700">{page.name}</h3>
        </div>
      )}
      
      {/* Render all components inline */}
      {allComponents.length > 0 ? (
        <div className="space-y-4">
          {allComponents.map((comp, idx) => renderPageComponent(comp, childContext, idx))}
        </div>
      ) : (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <p className="text-sm text-slate-500">
            This page has no components configured.
          </p>
        </div>
      )}
    </div>
  );
};

export default AppPageComponent;
