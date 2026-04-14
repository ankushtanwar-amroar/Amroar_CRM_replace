import React, { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { X, Save, Eye, Layers, Settings } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import ComponentLibrary from './ComponentLibrary';
import DropZone from './DropZone';
import ComponentPropertyEditor from './ComponentPropertyEditor';
import lightningLayoutService from '../services/lightningLayoutService';
import toast from 'react-hot-toast';

const LightningPageBuilder = ({ objectName, onClose, onSave }) => {
  const [layout, setLayout] = useState(null);
  const [regions, setRegions] = useState([]);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [availableFields, setAvailableFields] = useState([]);
  const [activeTab, setActiveTab] = useState('builder'); // 'builder' or 'preview'

  useEffect(() => {
    loadLayout();
    loadObjectFields();
  }, [objectName]);

  const loadLayout = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await lightningLayoutService.getLayoutForObject(objectName, token);
      
      if (response.has_custom_layout && response.layout) {
        setLayout(response.layout);
        setRegions(response.layout.regions || []);
      } else {
        // Use default template
        const template = response.default_template;
        setRegions(template.regions || []);
      }
    } catch (error) {
      console.error('Error loading layout:', error);
      toast.error('Failed to load layout');
      // Initialize with default 3-column template
      setRegions([
        { id: 'left', name: 'Left Sidebar', width: 'w-64', components: [], order: 0 },
        { id: 'main', name: 'Main Content', width: 'flex-1', components: [], order: 1 },
        { id: 'right', name: 'Right Sidebar', width: 'w-80', components: [], order: 2 }
      ]);
    }
  };

  const loadObjectFields = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/objects`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const objects = await response.json();
      const currentObject = objects.find(obj => obj.object_name === objectName);
      
      if (currentObject && currentObject.fields) {
        const fields = Object.entries(currentObject.fields).map(([name, config]) => ({
          name,
          label: config.label || name,
          type: config.type || 'text'
        }));
        setAvailableFields(fields);
      }
    } catch (error) {
      console.error('Error loading fields:', error);
    }
  };

  const handleDrop = (regionId, item) => {
    if (item.isNew) {
      // New component from library
      const newComponent = {
        id: `${item.id}-${Date.now()}`,
        type: item.type,
        label: item.label,
        field_name: item.defaultProps?.fieldType || null,
        properties: item.defaultProps || {},
        order: regions.find(r => r.id === regionId)?.components.length || 0,
        visible: true
      };

      setRegions(prev => prev.map(region => {
        if (region.id === regionId) {
          return {
            ...region,
            components: [...region.components, newComponent]
          };
        }
        return region;
      }));

      toast.success('Component added');
    }
  };

  const handleRemoveComponent = (regionId, componentId) => {
    setRegions(prev => prev.map(region => {
      if (region.id === regionId) {
        return {
          ...region,
          components: region.components.filter(c => c.id !== componentId)
        };
      }
      return region;
    }));
    toast.success('Component removed');
  };

  const handleEditComponent = (regionId, component) => {
    setSelectedComponent({ ...component, regionId });
  };

  const handleToggleVisibility = (regionId, componentId) => {
    setRegions(prev => prev.map(region => {
      if (region.id === regionId) {
        return {
          ...region,
          components: region.components.map(c => {
            if (c.id === componentId) {
              return { ...c, visible: c.visible === false ? true : false };
            }
            return c;
          })
        };
      }
      return region;
    }));
  };

  const handleSaveComponentProperties = (updatedComponent) => {
    setRegions(prev => prev.map(region => {
      if (region.id === updatedComponent.regionId) {
        return {
          ...region,
          components: region.components.map(c => {
            if (c.id === updatedComponent.id) {
              return { ...updatedComponent };
            }
            return c;
          })
        };
      }
      return region;
    }));
    setSelectedComponent(null);
    toast.success('Component updated');
  };

  const handleSaveLayout = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const layoutData = {
        object_name: objectName,
        layout_name: `${objectName} Layout`,
        template_type: 'three_column',
        regions: regions
      };

      if (layout && layout.id) {
        // Update existing
        await lightningLayoutService.updateLayout(layout.id, layoutData, token);
        toast.success('Layout updated successfully!');
      } else {
        // Create new
        await lightningLayoutService.createLayout(layoutData, token);
        toast.success('Layout created successfully!');
      }

      if (onSave) onSave();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error saving layout:', error);
      toast.error('Failed to save layout');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Lightning Page Builder
              </h1>
              <p className="text-sm text-slate-500">
                {objectName.charAt(0).toUpperCase() + objectName.slice(1)} Record Page
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Tab Switcher */}
            <div className="flex items-center space-x-2 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('builder')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'builder'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="h-4 w-4 inline-block mr-2" />
                Builder
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="h-4 w-4 inline-block mr-2" />
                Preview
              </button>
            </div>

            <Button onClick={handleSaveLayout} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Layout'}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'builder' ? (
            <>
              {/* Component Library */}
              <ComponentLibrary />

              {/* Layout Canvas */}
              <div className="flex-1 bg-slate-50 overflow-y-auto p-6">
                <div className="max-w-7xl mx-auto">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-2">
                      Page Layout
                    </h2>
                    <p className="text-sm text-slate-600">
                      Drag components from the left panel into the layout regions below
                    </p>
                  </div>

                  {/* Layout Regions */}
                  <div className="flex gap-4">
                    {regions
                      .sort((a, b) => a.order - b.order)
                      .map(region => (
                        <div key={region.id} className={region.width}>
                          <DropZone
                            region={region}
                            onDrop={handleDrop}
                            onRemoveComponent={(componentId) => handleRemoveComponent(region.id, componentId)}
                            onEditComponent={(component) => handleEditComponent(region.id, component)}
                            onToggleVisibility={(componentId) => handleToggleVisibility(region.id, componentId)}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Preview Mode */
            <div className="flex-1 bg-white overflow-y-auto p-6">
              <div className="max-w-7xl mx-auto">
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <Eye className="h-4 w-4 inline-block mr-2" />
                    Preview mode - showing how the layout will appear on record pages
                  </p>
                </div>

                <div className="flex gap-4">
                  {regions
                    .sort((a, b) => a.order - b.order)
                    .map(region => (
                      <div key={region.id} className={`${region.width} bg-slate-50 border-2 border-slate-200 rounded-lg p-4`}>
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">{region.name}</h3>
                        <div className="space-y-3">
                          {region.components
                            .filter(c => c.visible !== false)
                            .sort((a, b) => a.order - b.order)
                            .map(component => (
                              <div key={component.id} className="bg-white border border-slate-200 rounded p-3">
                                <p className="text-sm font-semibold text-slate-900">{component.label}</p>
                                <p className="text-xs text-slate-500 mt-1">Type: {component.type}</p>
                                {component.field_name && (
                                  <p className="text-xs text-slate-600 mt-1">Field: {component.field_name}</p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Component Property Editor Modal */}
        {selectedComponent && (
          <ComponentPropertyEditor
            component={selectedComponent}
            availableFields={availableFields}
            onSave={handleSaveComponentProperties}
            onClose={() => setSelectedComponent(null)}
          />
        )}
      </div>
    </DndProvider>
  );
};

export default LightningPageBuilder;
