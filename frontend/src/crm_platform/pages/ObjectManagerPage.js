import React, { useState, useEffect } from 'react';
import { Settings, Plus, Edit, Trash2, Database } from 'lucide-react';
import platformService from '../services/platformService';
import LayoutBuilder from '../components/LayoutBuilder';

const ObjectManagerPage = ({ tenantId }) => {
  const [objects, setObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);
  const [activeTab, setActiveTab] = useState('fields');

  useEffect(() => {
    fetchObjects();
  }, [tenantId]);

  const fetchObjects = async () => {
    try {
      const data = await platformService.getObjectTypes(tenantId);
      setObjects(data.object_types || []);
    } catch (error) {
      console.error('Failed to fetch objects:', error);
    }
  };

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-50 border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Object Manager</h2>
        </div>
        <div className="p-2">
          {objects.map(obj => (
            <button
              key={obj.id}
              onClick={() => setSelectedObject(obj)}
              className={`w-full text-left px-3 py-2 rounded hover:bg-gray-200 ${
                selectedObject?.id === obj.id ? 'bg-blue-100' : ''
              }`}
            >
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4" />
                <div>
                  <div className="font-medium text-sm">{obj.label}</div>
                  <div className="text-xs text-gray-500">{obj.api_name}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedObject ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Settings className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Select an object to configure</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">{selectedObject.label}</h1>
              <p className="text-gray-500">{selectedObject.description || 'Configure object settings'}</p>
            </div>

            {/* Tabs */}
            <div className="border-b mb-6">
              <div className="flex space-x-6">
                {['fields', 'layouts', 'buttons', 'validation', 'record-types'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 px-1 border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            {activeTab === 'fields' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Fields</h2>
                  <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    New Field
                  </button>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-gray-500 text-center py-8">
                    Field configuration coming soon
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'layouts' && (
              <LayoutBuilder objectType={selectedObject.id} tenantId={tenantId} />
            )}

            {activeTab === 'buttons' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Buttons & Links</h2>
                  <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    New Button
                  </button>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-gray-500 text-center py-8">
                    Button configuration coming soon
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'validation' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Validation Rules</h2>
                  <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    New Rule
                  </button>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-gray-500 text-center py-8">
                    Validation rule configuration coming soon
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'record-types' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Record Types</h2>
                  <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    New Record Type
                  </button>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-gray-500 text-center py-8">
                    Record type configuration coming soon
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectManagerPage;
