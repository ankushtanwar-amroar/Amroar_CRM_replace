import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const LayoutBuilder = ({ objectType, tenantId }) => {
  const [layouts, setLayouts] = useState([]);
  const [currentLayout, setCurrentLayout] = useState(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchLayouts();
  }, [objectType, tenantId]);

  const fetchLayouts = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/crm-platform/layouts?object_type_id=${objectType}&tenant_id=${tenantId}`
      );
      setLayouts(response.data.layouts || []);
      
      // Try to get default layout
      try {
        const defaultResponse = await axios.get(
          `${API_URL}/api/crm-platform/layouts/default?object_type_id=${objectType}&tenant_id=${tenantId}`
        );
        setCurrentLayout(defaultResponse.data);
      } catch (err) {
        // No default layout
      }
    } catch (error) {
      console.error('Failed to fetch layouts:', error);
    }
  };

  const createNewLayout = async () => {
    const layoutName = prompt('Enter layout name:');
    if (!layoutName) return;

    try {
      const response = await axios.post(`${API_URL}/api/crm-platform/layouts`, {
        name: layoutName,
        object_type_id: objectType,
        tenant_id: tenantId,
        tabs: [
          {
            id: 'tab-1',
            label: 'Details',
            sections: [],
            display_order: 0
          }
        ],
        is_default: layouts.length === 0
      });
      
      setCurrentLayout(response.data);
      await fetchLayouts();
      setEditMode(true);
    } catch (error) {
      console.error('Failed to create layout:', error);
      alert('Failed to create layout');
    }
  };

  const addTab = () => {
    if (!currentLayout) return;

    const tabName = prompt('Enter tab name:');
    if (!tabName) return;

    const newTab = {
      id: `tab-${Date.now()}`,
      label: tabName,
      sections: [],
      display_order: currentLayout.tabs.length
    };

    setCurrentLayout({
      ...currentLayout,
      tabs: [...currentLayout.tabs, newTab]
    });
  };

  const addSection = (tabId) => {
    if (!currentLayout) return;

    const sectionName = prompt('Enter section name:');
    if (!sectionName) return;

    const newSection = {
      id: `section-${Date.now()}`,
      label: sectionName,
      columns: 2,
      items: [],
      display_order: 0
    };

    setCurrentLayout({
      ...currentLayout,
      tabs: currentLayout.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, sections: [...tab.sections, newSection] }
          : tab
      )
    });
  };

  const saveLayout = async () => {
    if (!currentLayout) return;

    try {
      await axios.patch(
        `${API_URL}/api/crm-platform/layouts/${currentLayout.id}?tenant_id=${tenantId}`,
        {
          tabs: currentLayout.tabs
        }
      );
      alert('Layout saved successfully');
      setEditMode(false);
    } catch (error) {
      console.error('Failed to save layout:', error);
      alert('Failed to save layout');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Page Layout Builder</h2>
          <p className="text-sm text-gray-500">Design the record page layout</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={createNewLayout}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            New Layout
          </button>
        </div>
      </div>

      {!currentLayout ? (
        <div className="p-8 text-center text-gray-500">
          <p>No layout selected. Create a new layout to get started.</p>
        </div>
      ) : (
        <div className="p-4">
          {/* Layout selector */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Current Layout
            </label>
            <select
              value={currentLayout.id}
              onChange={(e) => {
                const layout = layouts.find(l => l.id === e.target.value);
                setCurrentLayout(layout);
              }}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {layouts.map(layout => (
                <option key={layout.id} value={layout.id}>
                  {layout.name} {layout.is_default ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Edit mode toggle */}
          <div className="mb-4 flex items-center justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={editMode}
                onChange={(e) => setEditMode(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Edit Mode</span>
            </label>
            {editMode && (
              <div className="space-x-2">
                <button
                  onClick={addTab}
                  className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  Add Tab
                </button>
                <button
                  onClick={saveLayout}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Save Layout
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="border rounded-lg">
            <div className="border-b bg-gray-50 flex items-center">
              {currentLayout.tabs.map(tab => (
                <div
                  key={tab.id}
                  className="px-4 py-2 border-r cursor-pointer hover:bg-gray-100"
                >
                  {tab.label}
                </div>
              ))}
            </div>

            {/* Tab content */}
            {currentLayout.tabs.map(tab => (
              <div key={tab.id} className="p-4">
                <div className="space-y-4">
                  {tab.sections.map(section => (
                    <div key={section.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">{section.label}</h3>
                        {editMode && (
                          <button className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className={`grid grid-cols-${section.columns} gap-4`}>
                        {section.items.length === 0 ? (
                          <p className="text-sm text-gray-400 col-span-2">No items yet</p>
                        ) : (
                          section.items.map(item => (
                            <div key={item.id} className="p-2 border rounded bg-gray-50">
                              {item.label || item.field_api_name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}

                  {editMode && (
                    <button
                      onClick={() => addSection(tab.id)}
                      className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600"
                    >
                      <Plus className="w-5 h-5 inline mr-2" />
                      Add Section
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LayoutBuilder;
