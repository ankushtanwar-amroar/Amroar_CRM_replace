/**
 * CRMDashboardHome - Premium App Manager Driven Home Page
 * 
 * ARCHITECTURE RULE:
 * Home = dynamic page driven entirely by App Manager.
 * 
 * DESIGN PRINCIPLES:
 * - Premium, modern SaaS aesthetic
 * - Clean visual hierarchy
 * - Proper breathing space
 * - Subtle depth and layering
 * - Better than Salesforce visually
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Settings, Loader2, Layout, AlertCircle, Sparkles, FileText,
  Activity, PieChart, LayoutDashboard, Search, Lightbulb, 
  List, Zap, BarChart2
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

// App Manager Components
import TasksDueComponent from '../app_manager/components/TasksDueComponent';
import PipelineSnapshotComponent from '../app_manager/components/PipelineSnapshotComponent';
import QuickActionsComponent from '../app_manager/components/QuickActionsComponent';
import WorkQueueComponent from '../app_manager/components/WorkQueueComponent';
import EventsTodayComponent from '../app_manager/components/EventsTodayComponent';
import RecentRecordsComponent from '../app_manager/components/RecentRecordsComponent';
import { listApps, getAppHomePage, getPage } from '../app_manager/services/appManagerService';

/**
 * Generic Placeholder Component for unimplemented component types
 * Shows a styled card with the component name and "Coming Soon" indicator
 */
const PlaceholderComponent = ({ componentType, config }) => {
  // Map component types to icons and labels
  const componentMeta = {
    system_health: { icon: Activity, label: 'System Health', color: 'text-green-600', bg: 'bg-green-50' },
    dashboard_embed: { icon: LayoutDashboard, label: 'Dashboard', color: 'text-purple-600', bg: 'bg-purple-50' },
    report_chart: { icon: PieChart, label: 'Report Chart', color: 'text-blue-600', bg: 'bg-blue-50' },
    setup_quick_find: { icon: Search, label: 'Quick Find', color: 'text-slate-600', bg: 'bg-slate-50' },
    setup_shortcuts: { icon: Zap, label: 'Shortcuts', color: 'text-amber-600', bg: 'bg-amber-50' },
    recommendations: { icon: Lightbulb, label: 'Recommendations', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    list_view: { icon: List, label: 'List View', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    rich_text: { icon: FileText, label: 'Rich Text', color: 'text-slate-600', bg: 'bg-slate-50' },
    ai_next_best_actions: { icon: Sparkles, label: 'AI Insights', color: 'text-pink-600', bg: 'bg-pink-50' },
  };

  const meta = componentMeta[componentType] || { 
    icon: BarChart2, 
    label: config?.title || componentType, 
    color: 'text-slate-600', 
    bg: 'bg-slate-50' 
  };
  const Icon = meta.icon;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${meta.bg}`}>
            <Icon className={`h-4 w-4 ${meta.color}`} />
          </div>
          {config?.title || meta.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Icon className={`h-10 w-10 ${meta.color} opacity-30 mb-3`} />
          <p className="text-sm text-slate-500 mb-1">{meta.label}</p>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Coming Soon</span>
        </div>
      </CardContent>
    </Card>
  );
};

// Component mapping for dynamic rendering
// Includes both implemented components and placeholder fallbacks
const COMPONENT_MAP = {
  // Implemented components
  'tasks_due': TasksDueComponent,
  'pipeline_snapshot': PipelineSnapshotComponent,
  'quick_actions': QuickActionsComponent,
  'work_queue': WorkQueueComponent,
  'events_today': EventsTodayComponent,
  'events_due': EventsTodayComponent,
  'recent_records': RecentRecordsComponent,
};

// Components that should show placeholder UI (not yet implemented)
const PLACEHOLDER_COMPONENTS = [
  'system_health',
  'dashboard_embed', 
  'report_chart',
  'setup_quick_find',
  'setup_shortcuts',
  'recommendations',
  'list_view',
  'rich_text',
  'ai_next_best_actions'
];

/**
 * Resolves a component type to a React component
 * Returns the implemented component or a placeholder for unimplemented ones
 */
const resolveComponent = (componentType, config) => {
  // Check if it's an implemented component
  if (COMPONENT_MAP[componentType]) {
    return COMPONENT_MAP[componentType];
  }
  
  // Check if it's a known placeholder component
  if (PLACEHOLDER_COMPONENTS.includes(componentType)) {
    return (props) => <PlaceholderComponent componentType={componentType} {...props} />;
  }
  
  // Unknown component - return null to skip rendering
  return null;
};

// Embedded App Page Component for Home Page
const EmbeddedAppPageComponent = ({ config, context }) => {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const loadPage = async () => {
      if (!config?.pageId) {
        setLoading(false);
        return;
      }
      try {
        setError(null);
        const pageData = await getPage(config.pageId);
        console.log('Loaded embedded page:', pageData);
        setPage(pageData);
      } catch (err) {
        console.error('Error loading embedded page:', err);
        setError(err.message || 'Failed to load page');
      } finally {
        setLoading(false);
      }
    };
    loadPage();
  }, [config?.pageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 bg-white rounded-xl border border-slate-200">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500">Loading page...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-red-50 rounded-xl border border-red-200">
        <FileText className="h-8 w-8 text-red-400 mb-2" />
        <span className="text-sm text-red-600">{error}</span>
      </div>
    );
  }

  if (!config?.pageId || !page) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-slate-200">
        <FileText className="h-8 w-8 text-slate-300 mb-2" />
        <span className="text-sm text-slate-500">No page configured</span>
      </div>
    );
  }

  // Get components from page layout
  const layout = page?.layout || {};
  const regions = layout?.regions || {};
  
  // Flatten all components from all regions
  const allComponents = [];
  Object.entries(regions).forEach(([regionName, regionComponents]) => {
    if (Array.isArray(regionComponents)) {
      regionComponents.forEach(comp => {
        allComponents.push({ ...comp, _region: regionName });
      });
    }
  });

  console.log('Embedded page components:', allComponents);

  // If no components found, show empty state
  if (allComponents.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="embedded-app-page-empty">
        {/* Header */}
        {config.showTitle !== false && page?.name && (
          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 border-b border-slate-200">
            <Layout className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-medium text-slate-700">{page.name}</h3>
            <span className="text-xs text-slate-400 ml-auto">Embedded Page</span>
          </div>
        )}
        {/* Empty State */}
        <div className="p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3">
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-600 mb-1">No components in this page</p>
          <p className="text-xs text-slate-400">Add components to "{page?.name}" in the Page Builder</p>
        </div>
      </div>
    );
  }

  // Render all components
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="embedded-app-page">
      {/* Header */}
      {config.showTitle !== false && page?.name && (
        <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 border-b border-slate-200">
          <Layout className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-medium text-slate-700">{page.name}</h3>
          <span className="text-xs text-slate-400 ml-auto">Embedded Page</span>
        </div>
      )}
      {/* Components */}
      <div className="p-4 space-y-4">
        {allComponents.map((comp, idx) => {
          const componentType = comp.component_type || comp.componentType || comp.type;
          const Component = resolveComponent(componentType, comp.config);
          
          if (!Component) {
            // Unknown component - show minimal indicator instead of error
            console.warn(`Skipping unknown component type: ${componentType}`);
            return null;
          }
          
          return (
            <Component 
              key={comp.id || idx} 
              config={comp.config || {}} 
              context={context} 
            />
          );
        })}
      </div>
    </div>
  );
};

// Add app_page to the component map after EmbeddedAppPageComponent is defined
COMPONENT_MAP['app_page'] = EmbeddedAppPageComponent;

/**
 * Template Renderer - Premium layouts with proper spacing
 */
const TemplateRenderer = ({ template, regions, renderComponent }) => {
  const hasHeader = regions?.header?.length > 0;
  const hasLeftColumn = regions?.left_column?.length > 0;
  const hasRightColumn = regions?.right_column?.length > 0;
  const hasMain = regions?.main?.length > 0;
  const hasSidebar = regions?.sidebar?.length > 0;
  
  switch (template) {
    case 'header_two_column':
      return (
        <div className="space-y-8">
          {/* Header Region - Full Width */}
          {hasHeader && (
            <section>
              {regions.header.map(comp => renderComponent(comp))}
            </section>
          )}
          
          {/* Two Column Layout with proper ratio */}
          {(hasLeftColumn || hasRightColumn) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column */}
              {hasLeftColumn && (
                <div className="space-y-8">
                  {regions.left_column.map(comp => renderComponent(comp))}
                </div>
              )}
              
              {/* Right Column */}
              {hasRightColumn && (
                <div className="space-y-8">
                  {regions.right_column.map(comp => renderComponent(comp))}
                </div>
              )}
            </div>
          )}
        </div>
      );
      
    case 'header_sidebar':
      return (
        <div className="space-y-8">
          {/* Header Region */}
          {hasHeader && (
            <section>
              {regions.header.map(comp => renderComponent(comp))}
            </section>
          )}
          
          {/* Main + Sidebar Layout */}
          {(hasMain || hasSidebar) && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
              {hasMain && (
                <div className="space-y-8">
                  {regions.main.map(comp => renderComponent(comp))}
                </div>
              )}
              {hasSidebar && (
                <div className="space-y-8">
                  {regions.sidebar.map(comp => renderComponent(comp))}
                </div>
              )}
            </div>
          )}
        </div>
      );
      
    case 'blank':
    default:
      return (
        <div className="space-y-8">
          {hasHeader && regions.header.map(comp => renderComponent(comp))}
          {hasMain && regions.main.map(comp => renderComponent(comp))}
          {hasLeftColumn && regions.left_column.map(comp => renderComponent(comp))}
          {hasRightColumn && regions.right_column.map(comp => renderComponent(comp))}
          {hasSidebar && regions.sidebar.map(comp => renderComponent(comp))}
        </div>
      );
  }
};

/**
 * Empty State - Premium design
 */
const EmptyHomeState = ({ onEditLayout, canEdit }) => (
  <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6">
    {/* Decorative background */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-100/40 rounded-full blur-3xl" />
    </div>
    
    <div className="relative">
      <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/30 mx-auto">
        <Layout className="h-12 w-12 text-white" />
      </div>
      
      <h2 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">
        Welcome to Your Workspace
      </h2>
      <p className="text-lg text-slate-500 max-w-md mb-8 leading-relaxed">
        Your home page is ready to be customized. Add powerful components like 
        Tasks, Pipeline, Events, and more.
      </p>
      
      {canEdit && (
        <Button 
          onClick={onEditLayout}
          size="lg"
          className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 
            shadow-lg shadow-blue-500/30 px-8 py-6 text-base font-semibold rounded-xl"
          data-testid="configure-home-btn"
        >
          <Sparkles className="h-5 w-5" />
          Configure Your Home
        </Button>
      )}
    </div>
  </div>
);

/**
 * Loading State - Premium skeleton
 */
const LoadingState = () => (
  <div className="min-h-[65vh] flex flex-col items-center justify-center">
    <div className="relative">
      {/* Animated rings */}
      <div className="absolute inset-0 animate-ping">
        <div className="w-16 h-16 rounded-full border-4 border-blue-200" />
      </div>
      <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    </div>
    <p className="text-slate-500 mt-6 font-medium">Loading your workspace...</p>
  </div>
);

/**
 * Error State
 */
const ErrorState = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6">
    <div className="w-20 h-20 rounded-2xl bg-rose-50 flex items-center justify-center mb-6">
      <AlertCircle className="h-10 w-10 text-rose-500" />
    </div>
    <h2 className="text-xl font-semibold text-slate-900 mb-2">
      Unable to Load Home
    </h2>
    <p className="text-slate-500 mb-6 max-w-sm">{error}</p>
    <Button variant="outline" onClick={onRetry} className="rounded-xl">
      Try Again
    </Button>
  </div>
);

/**
 * Main Dashboard Home Component - Premium Edition
 */
const CRMDashboardHome = ({ 
  currentUser, 
  objects,
  onSelectObject,
  onOpenObjectManager,
  onOpenActivities,
  onRefresh
}) => {
  const navigate = useNavigate();
  
  const [homeConfig, setHomeConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const isAdmin = currentUser?.role_id === 'system_administrator';
  
  const fetchHomeLayout = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Include inactive apps in the check to properly detect if any apps exist
      const appsResponse = await listApps(true);
      const allApps = appsResponse.apps || [];
      
      // Filter to active apps only for display
      const activeApps = allApps.filter(app => app.is_active);
      
      // Find Sales Console (default), or fall back to first active app
      const activeApp = activeApps.find(app => 
        app.api_name === 'sales_console' || app.api_name === 'sales'
      ) || activeApps[0];
      
      if (!activeApp) {
        // No active apps found - show empty state
        setHomeConfig(null);
        setIsLoading(false);
        return;
      }
      
      const homePage = await getAppHomePage(activeApp.id);
      
      if (homePage && homePage.layout) {
        setHomeConfig({
          ...homePage,
          appId: activeApp.id,
          appName: activeApp.name
        });
      } else {
        // App exists but no home page configured - still allow editing
        setHomeConfig({
          id: null,
          appId: activeApp.id,
          appName: activeApp.name,
          layout: null
        });
      }
    } catch (err) {
      console.error('Error fetching home layout:', err);
      if (err.response?.status !== 404) {
        setError('Failed to load home page configuration');
      }
      setHomeConfig(null);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchHomeLayout();
  }, []);
  
  const handleEditLayout = () => {
    if (homeConfig?.id) {
      // Home page exists - go to page builder
      navigate(`/setup/page-builder/${homeConfig.id}`);
    } else if (homeConfig?.appId) {
      // App exists but no home page - go to app's page list to create one
      navigate(`/setup/app-manager/${homeConfig.appId}`);
    } else {
      // No apps at all - go to app manager to create first app
      navigate('/setup/app-manager');
    }
  };
  
  const renderComponent = (comp) => {
    if (!comp) return null;
    
    const Component = resolveComponent(comp.component_type, comp.config);
    
    if (!Component) {
      console.warn(`Skipping unknown component type: ${comp.component_type}`);
      return null;
    }
    
    return (
      <Component 
        key={comp.id} 
        config={comp.config || {}}
        context={{
          currentUser,
          objects,
          onSelectObject,
          onOpenObjectManager,
          onOpenActivities,
          onRefresh
        }}
      />
    );
  };
  
  const hasComponents = () => {
    if (!homeConfig?.layout?.regions) return false;
    const regions = homeConfig.layout.regions;
    return Object.values(regions).some(region => region && region.length > 0);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <LoadingState />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <ErrorState error={error} onRetry={fetchHomeLayout} />
      </div>
    );
  }
  
  if (!homeConfig || !hasComponents()) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-slate-50 relative" data-testid="crm-home-empty">
        <EmptyHomeState 
          onEditLayout={handleEditLayout}
          canEdit={isAdmin}
        />
      </div>
    );
  }
  
  const { layout } = homeConfig;
  const template = layout.template || 'header_two_column';
  const regions = layout.regions || {};
  
  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50/80 via-white to-blue-50/30" data-testid="crm-home">
      {/* Premium Container - Tighter spacing */}
      <div className="w-full max-w-7xl mx-auto px-6 py-3">
        {/* Admin Edit Button - Floating, elegant */}
        {isAdmin && homeConfig.id && (
          <div className="flex justify-end mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditLayout}
              className="gap-2 text-slate-500 hover:text-slate-900 bg-white/80 backdrop-blur-sm 
                border-slate-200 shadow-sm hover:shadow-md rounded-xl transition-all duration-200"
              data-testid="edit-home-layout-btn"
            >
              <Settings className="h-4 w-4" />
              Customize Home
            </Button>
          </div>
        )}
        
        {/* Dynamic Layout Renderer */}
        <TemplateRenderer
          template={template}
          regions={regions}
          renderComponent={renderComponent}
        />
      </div>
    </div>
  );
};

export default CRMDashboardHome;
