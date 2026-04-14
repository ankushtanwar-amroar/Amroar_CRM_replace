import React, { useState } from 'react';
import { Type, Calendar, FileSignature, Edit3 } from 'lucide-react';

const VisualBuilder = ({ template, onUpdateFields }) => {
  const [selectedTool, setSelectedTool] = useState(null);
  const [fields, setFields] = useState(template?.signature_fields || []);

  const tools = [
    { id: 'signature', label: 'Signature', icon: FileSignature, color: 'indigo' },
    { id: 'initials', label: 'Initials', icon: Edit3, color: 'purple' },
    { id: 'date', label: 'Date', icon: Calendar, color: 'blue' },
    { id: 'text', label: 'Text Field', icon: Type, color: 'green' }
  ];

  const roles = ['client', 'internal_approver', 'witness', 'custom'];

  const handleAddField = (type) => {
    const newField = {
      id: `field-${Date.now()}`,
      field_type: type,
      role: 'client',
      position: { x: 50, y: 100, width: 200, height: 50, page: 1 },
      required: true
    };
    
    const updated = [...fields, newField];
    setFields(updated);
    onUpdateFields(updated);
  };

  const handleUpdateField = (fieldId, updates) => {
    const updated = fields.map(f => 
      f.id === fieldId ? { ...f, ...updates } : f
    );
    setFields(updated);
    onUpdateFields(updated);
  };

  const handleDeleteField = (fieldId) => {
    const updated = fields.filter(f => f.id !== fieldId);
    setFields(updated);
    onUpdateFields(updated);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Tools Palette */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Field Tools</h3>
          <div className="space-y-2">
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => handleAddField(tool.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition ${
                  selectedTool === tool.id
                    ? `border-${tool.color}-500 bg-${tool.color}-50`
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <tool.icon className={`h-5 w-5 text-${tool.color}-600`} />
                <span className="text-sm font-medium text-gray-900">{tool.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Merge Fields */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Merge Fields</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {['Account.Name', 'Opportunity.Amount', 'Contact.Email', 'Order.TotalAmount'].map(field => (
              <div
                key={field}
                className="px-3 py-2 bg-gray-50 rounded text-xs font-mono text-gray-700 cursor-move hover:bg-gray-100"
                draggable
              >
                {`{{${field}}}`}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Document Preview & Field List */}
      <div className="lg:col-span-3 space-y-4">
        {/* Preview Area */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Preview</h3>
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 min-h-96">
            <div className="text-center text-gray-500">
              <p className="text-sm">Document preview will appear here</p>
              <p className="text-xs mt-2">Drag and drop signature fields from the left panel</p>
            </div>
          </div>
        </div>

        {/* Fields List */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Signature Fields</h3>
          {fields.length === 0 ? (
            <p className="text-sm text-gray-600">No signature fields added yet. Click a tool above to add fields.</p>
          ) : (
            <div className="space-y-3">
              {fields.map(field => (
                <div key={field.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {field.field_type.replace('_', ' ')}
                      </span>
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">
                        Page {field.position.page}
                      </span>
                    </div>
                    <select
                      value={field.role}
                      onChange={(e) => handleUpdateField(field.id, { role: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {roles.map(role => (
                        <option key={role} value={role}>
                          {role.replace('_', ' ').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => handleDeleteField(field.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisualBuilder;
