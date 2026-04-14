/**
 * Component Library Panel - Enterprise Edition
 * 
 * Left sidebar showing available components grouped by category.
 * Components can be dragged onto the canvas.
 * Now includes App Pages as reusable layout components.
 */
import React, { useState, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { 
  Search, ChevronDown, ChevronRight, GripVertical,
  CheckSquare, BarChart2, Zap, Clock, Calendar, Users,
  TrendingUp, FileText, Inbox, Star, X, Sparkles, Layers, Layout
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { getComponentRegistry, listAppPages } from '../services/appManagerService';

// Icon mapping for components
const componentIcons = {
  'tasks_due': CheckSquare,
  'pipeline_snapshot': BarChart2,
  'quick_actions': Zap,
  'events_today': Calendar,
  'work_queue': Inbox,
  'recent_records': Clock,
  'key_metrics': TrendingUp,
  'reports_list': FileText,
  'assistant': Star,
  'news_feed': Users,
  'app_page': Layout
};

// Category configuration with enhanced colors
const categoryConfig = {
  productivity: { 
    label: 'Productivity', 
    icon: CheckSquare, 
    bgColor: 'bg-green-50',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    borderColor: 'border-green-200'
  },
  standard: { 
    label: 'Standard', 
    icon: Clock, 
    bgColor: 'bg-slate-50',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    borderColor: 'border-slate-200'
  },
  analytics: { 
    label: 'Analytics', 
    icon: BarChart2, 
    bgColor: 'bg-purple-50',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    borderColor: 'border-purple-200'
  },
  actions: { 
    label: 'Quick Actions', 
    icon: Zap, 
    bgColor: 'bg-amber-50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    borderColor: 'border-amber-200'
  },
  data: { 
    label: 'Data Display', 
    icon: FileText, 
    bgColor: 'bg-blue-50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    borderColor: 'border-blue-200'
  },
  ai: { 
    label: 'AI & Insights', 
    icon: Sparkles, 
    bgColor: 'bg-pink-50',
    iconBg: 'bg-pink-100',
    iconColor: 'text-pink-600',
    borderColor: 'border-pink-200'
  },
  pages: { 
    label: 'Pages', 
    icon: Layout, 
    bgColor: 'bg-indigo-50',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    borderColor: 'border-indigo-200'
  }
};

// Draggable component item
const DraggableComponent = ({ component, categoryColor }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'COMPONENT',
    item: { 
      type: 'COMPONENT',
      componentType: component.isAppPage ? 'app_page' : component.id,
      name: component.name,
      // Include page info for App Pages
      config: component.isAppPage ? {
        pageId: component.pageId,
        pageName: component.pageName,
        showTitle: true
      } : undefined
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });
  
  const IconComponent = component.isAppPage 
    ? Layout 
    : (componentIcons[component.id] || FileText);
  
  return (
    <div
      ref={drag}
      className={`flex items-center gap-3 p-3 rounded-xl border bg-white cursor-grab transition-all duration-200 ${
        isDragging 
          ? 'opacity-50 border-blue-400 shadow-lg scale-[0.98]' 
          : 'border-slate-200 hover:border-blue-300 hover:shadow-md hover:scale-[1.01]'
      }`}
      data-testid={`library-component-${component.id}`}
    >
      <div className="text-slate-300 hover:text-slate-400 cursor-grab">
        <GripVertical className="h-4 w-4" />
      </div>
      <div className={`p-2 rounded-lg ${categoryColor?.iconBg || 'bg-slate-100'}`}>
        <IconComponent className={`h-4 w-4 ${categoryColor?.iconColor || 'text-slate-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{component.name}</p>
        <p className="text-xs text-slate-500 truncate">{component.description}</p>
      </div>
      {component.isAppPage && (
        <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-600 border-indigo-200">
          Page
        </Badge>
      )}
    </div>
  );
};

const ComponentLibrary = ({ onClose, appId, currentPageId }) => {
  const [components, setComponents] = useState([]);
  const [appPages, setAppPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({
    productivity: true,
    standard: true,
    analytics: true,
    actions: true,
    data: false,
    ai: false,
    pages: true
  });
  
  useEffect(() => {
    const loadComponents = async () => {
      try {
        // Load standard components
        const data = await getComponentRegistry();
        setComponents(data.components || []);
        
        // Store in global for easy access
        const registry = {};
        (data.components || []).forEach(comp => {
          registry[comp.id] = comp;
        });
        window.__componentRegistry = registry;
        
        // Load App Pages if appId is available
        if (appId) {
          try {
            const pagesData = await listAppPages(appId, false); // Exclude home page
            // Filter out the current page to avoid circular reference
            const availablePages = (pagesData.pages || []).filter(
              p => p.id !== currentPageId && p.page_type !== 'home'
            );
            setAppPages(availablePages);
          } catch (err) {
            console.error('Error loading app pages:', err);
          }
        }
      } catch (err) {
        console.error('Error loading components:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadComponents();
  }, [appId, currentPageId]);
  
  // Convert App Pages to component format
  const pageComponents = appPages.map(page => ({
    id: `app_page_${page.id}`,
    name: page.name || 'Untitled Page',
    description: page.description || `Embed ${page.name || 'this page'} as a reusable layout`,
    category: 'pages',
    isAppPage: true,
    pageId: page.id,
    pageName: page.name
  }));
  
  // Combine standard components with page components
  const allComponents = [...components, ...pageComponents];
  
  // Filter and group components
  const filteredComponents = allComponents.filter(comp => 
    comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comp.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const groupedComponents = {};
  filteredComponents.forEach(comp => {
    const category = comp.category || 'data';
    if (!groupedComponents[category]) {
      groupedComponents[category] = [];
    }
    groupedComponents[category].push(comp);
  });
  
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };
  
  const totalComponents = filteredComponents.length;
  
  return (
    <div 
      className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm"
      data-testid="component-library"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Layers className="h-4 w-4 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900">Components</h3>
            <Badge variant="secondary" className="ml-1 bg-slate-100 text-slate-600 text-xs">
              {totalComponents}
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 hover:bg-slate-200"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 bg-white border-slate-200"
          />
        </div>
      </div>
      
      {/* Component List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-8 bg-slate-100 rounded-lg mb-2" />
                <div className="h-16 bg-slate-50 rounded-xl ml-2" />
              </div>
            ))}
          </div>
        ) : searchQuery && filteredComponents.length === 0 ? (
          <div className="text-center py-8">
            <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900 mb-1">No components found</p>
            <p className="text-xs text-slate-500">Try a different search term</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(categoryConfig).map(([categoryKey, config]) => {
              const categoryComponents = groupedComponents[categoryKey] || [];
              if (categoryComponents.length === 0) return null;
              
              const isExpanded = expandedCategories[categoryKey];
              const CategoryIcon = config.icon;
              
              return (
                <div key={categoryKey} className="space-y-2">
                  <button
                    onClick={() => toggleCategory(categoryKey)}
                    className={`flex items-center gap-2 w-full p-2.5 rounded-xl transition-all duration-200 ${
                      isExpanded ? config.bgColor + ' ' + config.borderColor + ' border' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className={`p-1.5 rounded-lg ${config.iconBg}`}>
                      <CategoryIcon className={`h-3.5 w-3.5 ${config.iconColor}`} />
                    </div>
                    <span className="text-sm font-medium text-slate-700 flex-1 text-left">
                      {config.label}
                    </span>
                    <Badge variant="secondary" className="text-xs bg-white/80 text-slate-500 font-medium">
                      {categoryComponents.length}
                    </Badge>
                  </button>
                  
                  {isExpanded && (
                    <div className="space-y-2 pl-2 animate-in slide-in-from-top-2 duration-200">
                      {categoryComponents.map(comp => (
                        <DraggableComponent 
                          key={comp.id} 
                          component={comp} 
                          categoryColor={config}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Footer hint */}
      <div className="p-4 border-t border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-blue-100 rounded-lg mt-0.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            <span className="font-medium text-slate-700">Tip:</span> Drag components onto the canvas to add them to your page layout.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ComponentLibrary;
