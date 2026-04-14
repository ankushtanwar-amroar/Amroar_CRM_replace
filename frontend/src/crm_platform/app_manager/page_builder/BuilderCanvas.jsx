/**
 * Builder Canvas
 * 
 * The main canvas area showing template regions where components can be dropped.
 * Supports different templates with various region layouts.
 * Features proper drag-and-drop reordering within and between regions.
 */
import React, { useRef, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { 
  Layout, Trash2, GripVertical, 
  CheckSquare, BarChart2, Zap, Clock, Calendar, FileText, Inbox
} from 'lucide-react';
import { Button } from '../../../components/ui/button';

// Item types for drag and drop
const ItemTypes = {
  COMPONENT: 'COMPONENT',
  PLACED_COMPONENT: 'PLACED_COMPONENT'
};

// Template region configurations
const templateRegions = {
  blank: {
    regions: ['main'],
    layout: 'grid-cols-1',
    regionStyles: {
      main: 'col-span-1'
    }
  },
  header_two_column: {
    regions: ['header', 'left_column', 'right_column'],
    layout: 'grid-cols-2',
    regionStyles: {
      header: 'col-span-2',
      left_column: 'col-span-1',
      right_column: 'col-span-1'
    }
  },
  header_sidebar: {
    regions: ['header', 'main', 'sidebar'],
    layout: 'grid-cols-3',
    regionStyles: {
      header: 'col-span-3',
      main: 'col-span-2',
      sidebar: 'col-span-1'
    }
  }
};

// Region labels
const regionLabels = {
  header: 'Header',
  main: 'Main',
  left_column: 'Left Column',
  right_column: 'Right Column',
  sidebar: 'Sidebar'
};

// Component icons
const componentIcons = {
  'tasks_due': CheckSquare,
  'pipeline_snapshot': BarChart2,
  'quick_actions': Zap,
  'events_today': Calendar,
  'work_queue': Inbox,
  'recent_records': Clock,
  'app_page': Layout
};

// Draggable Placed Component
const DraggablePlacedComponent = ({ 
  component, 
  index, 
  region,
  isSelected, 
  onSelect, 
  onRemove,
  onMoveComponent
}) => {
  const ref = useRef(null);
  
  // Drag source
  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.PLACED_COMPONENT,
    item: () => ({
      type: ItemTypes.PLACED_COMPONENT,
      id: component.id,
      index,
      region,
      component_type: component.component_type
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });
  
  // Drop target for reordering
  const [{ isOver }, drop] = useDrop({
    accept: ItemTypes.PLACED_COMPONENT,
    hover: (item, monitor) => {
      if (!ref.current) return;
      
      const dragId = item.id;
      const hoverId = component.id;
      
      // Don't replace items with themselves
      if (dragId === hoverId) return;
      
      const dragIndex = item.index;
      const hoverIndex = index;
      const dragRegion = item.region;
      const hoverRegion = region;
      
      // Don't do anything if same position
      if (dragIndex === hoverIndex && dragRegion === hoverRegion) return;
      
      // Determine rectangle on screen
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      
      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      
      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      
      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      
      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      
      // Dragging downwards in same region
      if (dragRegion === hoverRegion && dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      
      // Dragging upwards in same region
      if (dragRegion === hoverRegion && dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }
      
      // Time to actually perform the action
      onMoveComponent(dragId, hoverRegion, hoverIndex);
      
      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
      item.region = hoverRegion;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  });
  
  // Connect drag and drop refs
  drag(drop(ref));
  
  const IconComponent = componentIcons[component.component_type] || FileText;
  
  // For app_page components, use the pageName from config, otherwise use registry or component_type
  const componentName = component.component_type === 'app_page' 
    ? (component.config?.pageName || 'App Page')
    : (window.__componentRegistry?.[component.component_type]?.name || component.component_type);
  
  // For app_page, show "App Page" as subtitle, otherwise show title or "No title configured"
  const componentSubtitle = component.component_type === 'app_page'
    ? 'App Page'
    : (component.config?.title || 'No title configured');
  
  return (
    <div
      ref={ref}
      onClick={onSelect}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${
        isDragging 
          ? 'border-blue-400 bg-blue-100 shadow-lg'
          : isSelected
          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
          : isOver
          ? 'border-blue-300 bg-blue-50/50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
      data-testid={`placed-component-${component.id}`}
    >
      <div className="cursor-grab active:cursor-grabbing">
        <GripVertical className={`h-4 w-4 ${isDragging ? 'text-blue-500' : 'text-slate-300'}`} />
      </div>
      <div className={`p-2 rounded-lg ${
        component.component_type === 'app_page' 
          ? (isSelected ? 'bg-indigo-100' : 'bg-indigo-50')
          : (isSelected ? 'bg-blue-100' : 'bg-slate-100')
      }`}>
        <IconComponent className={`h-4 w-4 ${
          component.component_type === 'app_page'
            ? 'text-indigo-600'
            : (isSelected ? 'text-blue-600' : 'text-slate-600')
        }`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{componentName}</p>
        <p className="text-xs text-slate-500 truncate">
          {componentSubtitle}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-opacity"
        data-testid={`remove-component-${component.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

// Droppable Region Component
const DroppableRegion = ({ 
  region, 
  components, 
  selectedComponent,
  onComponentSelect,
  onComponentDrop,
  onMoveComponent,
  onComponentRemove,
  style
}) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: [ItemTypes.COMPONENT, ItemTypes.PLACED_COMPONENT],
    drop: (item, monitor) => {
      // Only handle drops that weren't handled by a child
      if (monitor.didDrop()) return;
      
      if (item.type === ItemTypes.COMPONENT) {
        // New component from library - pass config for app_page components
        onComponentDrop(item.componentType, region, components.length, item.config);
      } else if (item.type === ItemTypes.PLACED_COMPONENT) {
        // Moving existing component to end of this region
        if (item.region !== region) {
          onMoveComponent(item.id, region, components.length);
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop()
    })
  });
  
  const isEmpty = components.length === 0;
  
  return (
    <div
      ref={drop}
      className={`${style} min-h-[120px] p-3 rounded-xl border-2 border-dashed transition-all relative ${
        isOver && canDrop
          ? 'border-blue-400 bg-blue-50'
          : canDrop
          ? 'border-slate-300 bg-slate-50/50'
          : 'border-slate-200 bg-white'
      }`}
      data-testid={`region-${region}`}
    >
      {/* Region Label */}
      <div className="flex items-center gap-2 mb-3">
        <Layout className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {regionLabels[region] || region}
        </span>
        <span className="text-xs text-slate-400">
          ({components.length})
        </span>
      </div>
      
      {/* Components */}
      {isEmpty ? (
        <div className={`flex items-center justify-center py-8 text-slate-400 ${
          isOver ? 'opacity-0' : ''
        }`}>
          <p className="text-sm">Drop components here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {components.map((comp, index) => (
            <DraggablePlacedComponent
              key={comp.id}
              component={comp}
              index={index}
              region={region}
              isSelected={selectedComponent?.id === comp.id}
              onSelect={() => onComponentSelect(comp)}
              onRemove={() => onComponentRemove(comp.id)}
              onMoveComponent={onMoveComponent}
            />
          ))}
        </div>
      )}
      
      {/* Drop indicator when dragging over empty area */}
      {isOver && canDrop && isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50/80 rounded-xl pointer-events-none">
          <p className="text-sm font-medium text-blue-600">Drop here</p>
        </div>
      )}
    </div>
  );
};

const BuilderCanvas = ({
  template,
  components,
  selectedComponent,
  onComponentSelect,
  onComponentDrop,
  onComponentMove,
  onComponentRemove
}) => {
  const templateConfig = templateRegions[template] || templateRegions.header_two_column;
  
  // Group components by region and sort by order
  const componentsByRegion = {};
  templateConfig.regions.forEach(region => {
    componentsByRegion[region] = components
      .filter(c => c.region === region)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
  
  return (
    <div 
      className="flex-1 overflow-auto p-6 bg-slate-100"
      data-testid="builder-canvas"
    >
      <div className="max-w-5xl mx-auto">
        {/* Canvas Frame */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className={`grid ${templateConfig.layout} gap-4`}>
            {templateConfig.regions.map(region => (
              <DroppableRegion
                key={region}
                region={region}
                components={componentsByRegion[region] || []}
                selectedComponent={selectedComponent}
                onComponentSelect={onComponentSelect}
                onComponentDrop={onComponentDrop}
                onMoveComponent={onComponentMove}
                onComponentRemove={onComponentRemove}
                style={templateConfig.regionStyles[region]}
              />
            ))}
          </div>
        </div>
        
        {/* Canvas info */}
        <div className="mt-4 text-center text-xs text-slate-400">
          {components.length} component{components.length !== 1 ? 's' : ''} placed
          <span className="mx-2">•</span>
          Drag to reorder
        </div>
      </div>
    </div>
  );
};

export default BuilderCanvas;
