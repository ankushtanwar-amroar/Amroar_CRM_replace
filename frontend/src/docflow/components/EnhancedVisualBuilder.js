import React, { useState, useRef } from 'react';
import { Type, Calendar, FileSignature, Edit3, Plus, Trash2, Move } from 'lucide-react';

// Draggable Field Component
const DraggableField = ({ field, isSelected, onSelect, onUpdate, onDelete, getColor, getIcon }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fieldRef = useRef(null);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - field.position.x,
      y: e.clientY - field.position.y
    });
    onSelect();
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    onUpdate({
      position: {
        ...field.position,
        x: Math.max(0, newX),
        y: Math.max(0, newY)
      }
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  return (
    <div
      ref={fieldRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: `${field.position.x}px`,
        top: `${field.position.y}px`,
        width: `${field.position.width}px`,
        height: `${field.position.height}px`,
        zIndex: isSelected ? 20 : 10
      }}
      className={`border-2 ${getColor(field.field_type)} ${
        isSelected ? 'ring-2 ring-indigo-500' : ''
      } cursor-move rounded flex items-center justify-center gap-2 px-2 ${
        isDragging ? 'opacity-75' : ''
      }`}
    >
      <div className="flex items-center gap-2 w-full">
        {getIcon(field.field_type)}
        <span className="text-xs font-medium flex-1 truncate">
          {field.label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 hover:bg-red-100 rounded"
        >
          <Trash2 className="h-3 w-3 text-red-600" />
        </button>
      </div>
    </div>
  );
};

const EnhancedVisualBuilder = ({ template, onUpdateFields }) => {
  const [fields, setFields] = useState(template?.signature_fields || []);
  const [selectedField, setSelectedField] = useState(null);
  const containerRef = useRef(null);

  const tools = [
    { id: 'signature', label: 'Signature', icon: FileSignature, color: 'indigo' },
    { id: 'initials', label: 'Initials', icon: Edit3, color: 'purple' },
    { id: 'date', label: 'Date', icon: Calendar, color: 'blue' },
    { id: 'text', label: 'Text Field', icon: Type, color: 'green' }
  ];

  const roles = ['client', 'internal_approver', 'witness', 'custom'];

  const addField = (type) => {
    const newField = {
      id: `field-${Date.now()}`,
      field_type: type,
      role: 'client',
      position: { 
        x: 100, 
        y: 100, 
        width: type === 'signature' ? 200 : 150, 
        height: type === 'signature' ? 60 : 40, 
        page: 1 
      },
      required: true,
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} Field`
    };
    
    const updated = [...fields, newField];
    setFields(updated);
    onUpdateFields(updated);
  };

  const updateField = (fieldId, updates) => {
    const updated = fields.map(f => 
      f.id === fieldId ? { ...f, ...updates } : f
    );
    setFields(updated);
    onUpdateFields(updated);
  };

  const deleteField = (fieldId) => {
    const updated = fields.filter(f => f.id !== fieldId);
    setFields(updated);
    onUpdateFields(updated);
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
  };

  const handleDragStop = (fieldId, d) => {
    updateField(fieldId, {
      position: {
        ...fields.find(f => f.id === fieldId)?.position,
        x: d.x,
        y: d.y
      }
    });
  };

  const handleResizeStop = (fieldId, ref, position) => {
    updateField(fieldId, {
      position: {
        ...fields.find(f => f.id === fieldId)?.position,
        x: position.x,
        y: position.y,
        width: ref.offsetWidth,
        height: ref.offsetHeight
      }
    });
  };

  const getFieldColor = (type) => {
    const colors = {
      signature: 'border-indigo-500 bg-indigo-50',
      initials: 'border-purple-500 bg-purple-50',
      date: 'border-blue-500 bg-blue-50',
      text: 'border-green-500 bg-green-50'
    };
    return colors[type] || 'border-gray-500 bg-gray-50';
  };

  const getFieldIcon = (type) => {
    const icons = {
      signature: FileSignature,
      initials: Edit3,
      date: Calendar,
      text: Type
    };
    const Icon = icons[type] || Type;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Tools Palette */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Field Tools</h3>
          <div className="space-y-2">
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => addField(tool.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 hover:border-${tool.color}-500 hover:bg-${tool.color}-50 transition`}
              >
                <tool.icon className={`h-5 w-5 text-${tool.color}-600`} />
                <div className="text-left flex-1">
                  <div className="text-sm font-medium text-gray-900">{tool.label}</div>
                  <div className="text-xs text-gray-500">Drag to add</div>
                </div>
                <Plus className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Instructions</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Click to add field</li>
              <li>• Drag to reposition</li>
              <li>• Resize from corners</li>
              <li>• Delete with trash icon</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Document Canvas */}
      <div className="lg:col-span-4 space-y-4">
        {/* Canvas Area */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Canvas</h3>
          
          <div 
            ref={containerRef}
            className="relative border-2 border-gray-300 rounded-lg bg-gray-50 min-h-[800px] overflow-hidden"
            style={{ 
              backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
          >
            {/* PDF Preview */}
            {template?.html_content && (
              <div className="absolute inset-0 pointer-events-none">
                <div 
                  className="w-full h-full p-8 bg-white shadow-lg"
                  dangerouslySetInnerHTML={{ __html: template.html_content }}
                />
              </div>
            )}

            {/* Draggable Fields */}
            {fields.map((field) => (
              <DraggableField
                key={field.id}
                field={field}
                isSelected={selectedField === field.id}
                onSelect={() => setSelectedField(field.id)}
                onUpdate={(updates) => updateField(field.id, updates)}
                onDelete={() => deleteField(field.id)}
                getColor={getFieldColor}
                getIcon={getFieldIcon}
              />
            ))}

            {/* Empty State */}
            {fields.length === 0 && !template?.html_content && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Move className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Add fields from the left panel</p>
                  <p className="text-xs mt-1">Upload a document first to see it here</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fields List */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Placed Fields ({fields.length})</h3>
          {fields.length === 0 ? (
            <p className="text-sm text-gray-600">No fields added yet. Click a tool above to add fields.</p>
          ) : (
            <div className="space-y-3">
              {fields.map((field) => (
                <div 
                  key={field.id} 
                  className={`flex items-center gap-4 p-3 rounded-lg border-2 cursor-pointer transition ${
                    selectedField === field.id 
                      ? 'border-indigo-500 bg-indigo-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedField(field.id)}
                >
                  <div className="flex items-center gap-2">
                    {getFieldIcon(field.field_type)}
                    <div>
                      <div className="text-sm font-medium text-gray-900 capitalize">
                        {field.field_type.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-500">
                        Position: ({Math.round(field.position.x)}, {Math.round(field.position.y)})
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Field label"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                    />
                  </div>

                  <select
                    value={field.role}
                    onChange={(e) => updateField(field.id, { role: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    {roles.map(role => (
                      <option key={role} value={role}>
                        {role.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteField(field.id);
                    }}
                    className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
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

export default EnhancedVisualBuilder;
