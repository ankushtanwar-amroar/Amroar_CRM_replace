/**
 * Page Builder - Enterprise Edition
 * 
 * Drag-and-drop page builder for configuring app pages.
 * Features:
 * - Component library panel (left)
 * - Canvas with region-based templates (center)
 * - Property configuration panel (right)
 * - Template switching
 * - Save/Load functionality
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { 
  Save, Layout, Settings, Undo, Redo, 
  Eye, ChevronLeft, AlertCircle, Loader2,
  PanelLeft, PanelRight, Monitor, Sparkles
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { toast } from 'sonner';

import ComponentLibrary from './ComponentLibrary';
import BuilderCanvas from './BuilderCanvas';
import PropertyPanel from './PropertyPanel';
import TemplateSelector from './TemplateSelector';
import { 
  getPage, updatePage, getComponentRegistry 
} from '../services/appManagerService';

const PageBuilder = () => {
  const { pageId } = useParams();
  const navigate = useNavigate();
  
  // Page state
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // Builder state
  const [components, setComponents] = useState([]);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [template, setTemplate] = useState('header_two_column');
  const [layout, setLayout] = useState({ template: 'header_two_column', regions: {} });
  
  // History for undo/redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Panels visibility
  const [showLibrary, setShowLibrary] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  
  // Load page and component registry
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Load page
        const pageData = await getPage(pageId);
        setPage(pageData);
        
        // Load existing layout
        if (pageData.layout) {
          setTemplate(pageData.layout.template || 'header_two_column');
          setLayout(pageData.layout);
          
          // Flatten regions into components array for easier manipulation
          const allComponents = [];
          const regions = pageData.layout.regions || {};
          Object.entries(regions).forEach(([regionName, regionComponents]) => {
            regionComponents.forEach(comp => {
              allComponents.push({
                ...comp,
                region: regionName
              });
            });
          });
          setComponents(allComponents);
        }
        
        // Load component registry
        await getComponentRegistry();
        
      } catch (err) {
        console.error('Error loading page:', err);
        setError('Failed to load page');
      } finally {
        setLoading(false);
      }
    };
    
    if (pageId) {
      loadData();
    }
  }, [pageId]);
  
  // Save to history for undo/redo
  const saveToHistory = useCallback((newComponents) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.stringify(newComponents));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);
  
  // Handle component drop from library
  const handleComponentDrop = useCallback((componentType, region, index, dropConfig) => {
    const componentDef = window.__componentRegistry?.[componentType];
    
    // Use config from drag item (for app_page) or default config
    const config = dropConfig || componentDef?.default_config || {};
    
    const newComponent = {
      id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      component_type: componentType,
      region: region,
      order: index,
      config: config
    };
    
    const newComponents = [...components];
    
    // Find insert position based on region and index
    const regionComponents = newComponents.filter(c => c.region === region);
    const otherComponents = newComponents.filter(c => c.region !== region);
    
    // Insert at index
    regionComponents.splice(index, 0, newComponent);
    
    // Update orders
    regionComponents.forEach((c, i) => c.order = i);
    
    const updatedComponents = [...otherComponents, ...regionComponents];
    setComponents(updatedComponents);
    saveToHistory(updatedComponents);
    setSelectedComponent(newComponent);
    
    // Use name from config (for app_page) or from registry
    const displayName = config?.pageName || componentDef?.name || componentType;
    toast.success(`Added ${displayName}`);
  }, [components, saveToHistory]);
  
  // Handle component reorder within/between regions
  const handleComponentMove = useCallback((dragId, targetRegion, targetIndex) => {
    const newComponents = [...components];
    const dragIndex = newComponents.findIndex(c => c.id === dragId);
    
    if (dragIndex === -1) return;
    
    const [draggedComponent] = newComponents.splice(dragIndex, 1);
    draggedComponent.region = targetRegion;
    
    // Get components in target region
    const regionComponents = newComponents.filter(c => c.region === targetRegion);
    const otherComponents = newComponents.filter(c => c.region !== targetRegion);
    
    // Insert at target index
    regionComponents.splice(targetIndex, 0, draggedComponent);
    
    // Update orders
    regionComponents.forEach((c, i) => c.order = i);
    
    const updatedComponents = [...otherComponents, ...regionComponents];
    setComponents(updatedComponents);
    saveToHistory(updatedComponents);
  }, [components, saveToHistory]);
  
  // Handle component removal
  const handleComponentRemove = useCallback((componentId) => {
    const newComponents = components.filter(c => c.id !== componentId);
    setComponents(newComponents);
    saveToHistory(newComponents);
    
    if (selectedComponent?.id === componentId) {
      setSelectedComponent(null);
    }
    
    toast.success('Component removed');
  }, [components, selectedComponent, saveToHistory]);
  
  // Handle component config update
  const handleConfigUpdate = useCallback((componentId, newConfig) => {
    const newComponents = components.map(c => 
      c.id === componentId ? { ...c, config: newConfig } : c
    );
    setComponents(newComponents);
    
    if (selectedComponent?.id === componentId) {
      setSelectedComponent({ ...selectedComponent, config: newConfig });
    }
  }, [components, selectedComponent]);
  
  // Handle template change
  const handleTemplateChange = useCallback((newTemplate) => {
    setTemplate(newTemplate);
    
    // When changing templates, we may need to relocate components
    // For now, keep components but they may need to be reassigned
    toast.info(`Template changed to ${newTemplate}`);
  }, []);
  
  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setComponents(JSON.parse(history[historyIndex - 1]));
    }
  }, [history, historyIndex]);
  
  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setComponents(JSON.parse(history[historyIndex + 1]));
    }
  }, [history, historyIndex]);
  
  // Save layout
  const handleSave = async () => {
    setSaving(true);
    
    try {
      // Convert components array back to regions format
      const regions = {};
      components.forEach(comp => {
        if (!regions[comp.region]) {
          regions[comp.region] = [];
        }
        regions[comp.region].push({
          id: comp.id,
          component_type: comp.component_type,
          region: comp.region,
          order: comp.order,
          config: comp.config
        });
      });
      
      // Sort by order within each region
      Object.keys(regions).forEach(region => {
        regions[region].sort((a, b) => a.order - b.order);
      });
      
      const layoutData = {
        template: template,
        regions: regions
      };
      
      await updatePage(pageId, { layout: layoutData });
      
      toast.success('Page layout saved successfully');
    } catch (err) {
      console.error('Error saving layout:', err);
      toast.error('Failed to save layout');
    } finally {
      setSaving(false);
    }
  };
  
  // Handle close
  const handleClose = () => {
    navigate(-1);
  };
  
  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-slate-100">
        {/* Header Skeleton */}
        <div className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center px-5">
          <div className="animate-pulse flex items-center gap-4 flex-1">
            <div className="h-8 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-px bg-slate-200" />
            <div className="h-8 w-48 bg-slate-200 rounded" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="text-slate-600 font-medium">Loading Page Builder...</span>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-screen flex flex-col bg-slate-100">
        <div className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center px-5">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Error Loading Page</h2>
            <p className="text-slate-500 mb-6">{error}</p>
            <Button onClick={() => navigate(-1)}>Go Back</Button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col bg-slate-100" data-testid="page-builder">
        {/* Enterprise Header */}
        <header className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClose}
              className="text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="h-8 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-md">
                <Layout className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {page?.name || 'Page Builder'}
                  </span>
                  {page?.type === 'home_page' && (
                    <Badge className="bg-blue-100 text-blue-700 border-0 font-medium text-xs">
                      Home Page
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Drag and drop components to build your page
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* History Controls */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="h-8 w-8 p-0 hover:bg-white"
                data-testid="undo-btn"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="h-8 w-8 p-0 hover:bg-white"
                data-testid="redo-btn"
              >
                <Redo className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="h-6 w-px bg-slate-200" />
            
            {/* Panel Toggles */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <Button 
                variant={showLibrary ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => setShowLibrary(!showLibrary)}
                className={`h-8 w-8 p-0 ${showLibrary ? 'bg-white shadow-sm' : 'hover:bg-white'}`}
                title="Toggle Component Library"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant={showProperties ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => setShowProperties(!showProperties)}
                className={`h-8 w-8 p-0 ${showProperties ? 'bg-white shadow-sm' : 'hover:bg-white'}`}
                title="Toggle Properties Panel"
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="h-6 w-px bg-slate-200" />
            
            {/* Preview */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.open(`/crm-platform`, '_blank')}
              className="gap-2"
              data-testid="preview-btn"
            >
              <Monitor className="h-4 w-4" />
              Preview
            </Button>
            
            {/* Save */}
            <Button 
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 min-w-[100px]"
              data-testid="save-layout-btn"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </header>
        
        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Component Library - Left Panel */}
          {showLibrary && (
            <ComponentLibrary 
              onClose={() => setShowLibrary(false)}
              appId={page?.app_id}
              currentPageId={pageId}
            />
          )}
          
          {/* Canvas - Center */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Template Selector */}
            <TemplateSelector 
              currentTemplate={template}
              onTemplateChange={handleTemplateChange}
            />
            
            {/* Canvas */}
            <BuilderCanvas
              template={template}
              components={components}
              selectedComponent={selectedComponent}
              onComponentSelect={setSelectedComponent}
              onComponentDrop={handleComponentDrop}
              onComponentMove={handleComponentMove}
              onComponentRemove={handleComponentRemove}
            />
          </div>
          
          {/* Property Panel - Right */}
          {showProperties && selectedComponent && (
            <PropertyPanel
              component={selectedComponent}
              onConfigUpdate={handleConfigUpdate}
              onRemove={() => handleComponentRemove(selectedComponent.id)}
              onClose={() => setSelectedComponent(null)}
            />
          )}
        </div>
      </div>
    </DndProvider>
  );
};

export default PageBuilder;
