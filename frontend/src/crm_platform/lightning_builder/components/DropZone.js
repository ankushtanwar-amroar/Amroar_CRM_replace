import React from 'react';
import { useDrop } from 'react-dnd';
import { GripVertical, X, Settings, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../../components/ui/button';

const DroppedComponent = ({ component, onRemove, onEdit, onToggleVisibility }) => {
  return (
    <div className="group relative bg-white border-2 border-slate-200 rounded-lg p-3 hover:border-blue-400 transition-all">
      {/* Drag handle and actions */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <GripVertical className="h-4 w-4 text-slate-400 cursor-move" />
          <span className="text-sm font-semibold text-slate-900">{component.label}</span>
        </div>
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onToggleVisibility(component.id)}
            className="p-1 hover:bg-slate-100 rounded"
            title={component.visible !== false ? "Hide" : "Show"}
          >
            {component.visible !== false ? (
              <Eye className="h-4 w-4 text-slate-600" />
            ) : (
              <EyeOff className="h-4 w-4 text-slate-400" />
            )}
          </button>
          <button
            onClick={() => onEdit(component)}
            className="p-1 hover:bg-slate-100 rounded"
            title="Settings"
          >
            <Settings className="h-4 w-4 text-slate-600" />
          </button>
          <button
            onClick={() => onRemove(component.id)}
            className="p-1 hover:bg-red-100 rounded"
            title="Remove"
          >
            <X className="h-4 w-4 text-red-600" />
          </button>
        </div>
      </div>

      {/* Component preview */}
      <div className={`text-xs text-slate-500 ${component.visible === false ? 'opacity-50' : ''}`}>
        <p>Type: {component.type}</p>
        {component.field_name && <p>Field: {component.field_name}</p>}
        {component.properties && Object.keys(component.properties).length > 0 && (
          <p className="mt-1 text-xs text-blue-600">
            {Object.keys(component.properties).length} properties configured
          </p>
        )}
      </div>

      {component.visible === false && (
        <div className="absolute inset-0 bg-slate-100 bg-opacity-50 rounded-lg flex items-center justify-center">
          <span className="text-xs font-semibold text-slate-600">Hidden</span>
        </div>
      )}
    </div>
  );
};

const DropZone = ({ region, onDrop, onRemoveComponent, onEditComponent, onToggleVisibility }) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'COMPONENT',
    drop: (item) => {
      onDrop(region.id, item);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  const components = region.components || [];

  return (
    <div
      ref={drop}
      className={`min-h-[200px] border-2 border-dashed rounded-lg p-4 transition-all ${
        isOver ? 'border-blue-500 bg-blue-50' : canDrop ? 'border-slate-300' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{region.name}</h3>
        <span className="text-xs text-slate-500">{components.length} components</span>
      </div>

      {components.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
            <GripVertical className="h-8 w-8 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">Drop components here</p>
          <p className="text-xs text-slate-400 mt-1">Drag from the component library</p>
        </div>
      ) : (
        <div className="space-y-3">
          {components
            .sort((a, b) => a.order - b.order)
            .map((component) => (
              <DroppedComponent
                key={component.id}
                component={component}
                onRemove={onRemoveComponent}
                onEdit={onEditComponent}
                onToggleVisibility={onToggleVisibility}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default DropZone;
