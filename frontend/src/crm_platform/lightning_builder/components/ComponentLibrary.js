import React from 'react';
import { useDrag } from 'react-dnd';
import { 
  Type, Mail, Phone, Building, Calendar, CheckSquare, List, Activity, FileText, Code,
  User, BarChart3, Link, Workflow, Users, Target
} from 'lucide-react';

const ComponentTypes = {
  FIELD: 'field',
  RELATED_LIST: 'related_list',
  ACTIVITY: 'activity',
  CUSTOM_HTML: 'custom_html',
  SECTION: 'section',
  TABS: 'tabs',
  RECORD_HEADER: 'record_header',
  PATH_COMPONENT: 'path_component',
  TABS_COMPONENT: 'tabs_component',
  ACTIVITY_ACTIONS: 'activity_actions',
  RECORD_FIELDS_PANEL: 'record_fields_panel',
  RELATED_TO_PANEL: 'related_to_panel',
  QUICK_LINKS_PANEL: 'quick_links_panel'
};

const DraggableComponent = ({ component }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'COMPONENT',
    item: { ...component, isNew: true },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  const Icon = component.icon;

  return (
    <div
      ref={drag}
      className={`p-3 border-2 border-dashed rounded-lg cursor-move hover:bg-blue-50 hover:border-blue-400 transition-all ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{component.label}</p>
          <p className="text-xs text-slate-500">{component.description}</p>
        </div>
      </div>
    </div>
  );
};

const ComponentLibrary = () => {
  const availableComponents = [
    // HEADER & PATH COMPONENTS
    {
      id: 'record-header',
      type: ComponentTypes.RECORD_HEADER,
      label: 'Record Header',
      description: 'Avatar, name, Follow button',
      icon: User,
      defaultProps: {
        showAvatar: true,
        showFollow: true,
        showActions: true
      }
    },
    {
      id: 'path-component',
      type: ComponentTypes.PATH_COMPONENT,
      label: 'Path / Status Tracker',
      description: 'Status stages progress',
      icon: Workflow,
      defaultProps: {
        showMarkComplete: true,
        stages: []
      }
    },
    {
      id: 'tabs-component',
      type: ComponentTypes.TABS_COMPONENT,
      label: 'Tabs (Activity/Details/Related)',
      description: 'Navigation tabs',
      icon: List,
      defaultProps: {
        tabs: ['Activity', 'Details', 'Related'],
        defaultTab: 'Activity'
      }
    },
    {
      id: 'activity-actions',
      type: ComponentTypes.ACTIVITY_ACTIONS,
      label: 'Activity Action Bar',
      description: 'New Task, Log Call, etc.',
      icon: Target,
      defaultProps: {
        actions: ['New Task', 'Log a Call', 'New Event', 'Email']
      }
    },
    {
      id: 'record-fields-panel',
      type: ComponentTypes.RECORD_FIELDS_PANEL,
      label: 'Record Fields Panel',
      description: 'Email, Phone, Title, etc.',
      icon: FileText,
      defaultProps: {
        fields: ['email', 'phone', 'title', 'created_at']
      }
    },
    {
      id: 'related-to-panel',
      type: ComponentTypes.RELATED_TO_PANEL,
      label: 'Related To Panel',
      description: 'Account, Opportunity links',
      icon: Link,
      defaultProps: {
        relatedObjects: ['account', 'opportunity']
      }
    },
    {
      id: 'quick-links-panel',
      type: ComponentTypes.QUICK_LINKS_PANEL,
      label: 'Quick Links',
      description: 'View Hierarchy, Send Email',
      icon: BarChart3,
      defaultProps: {
        links: ['View Hierarchy', 'Send Email']
      }
    },
    // EXISTING FIELD COMPONENTS
    {
      id: 'field-text',
      type: ComponentTypes.FIELD,
      label: 'Text Field',
      description: 'Display a text field',
      icon: Type,
      defaultProps: {
        fieldType: 'text',
        showLabel: true,
        isEditable: true
      }
    },
    {
      id: 'field-email',
      type: ComponentTypes.FIELD,
      label: 'Email Field',
      description: 'Display an email field',
      icon: Mail,
      defaultProps: {
        fieldType: 'email',
        showLabel: true,
        isEditable: true
      }
    },
    {
      id: 'field-phone',
      type: ComponentTypes.FIELD,
      label: 'Phone Field',
      description: 'Display a phone field',
      icon: Phone,
      defaultProps: {
        fieldType: 'phone',
        showLabel: true,
        isEditable: true
      }
    },
    {
      id: 'field-date',
      type: ComponentTypes.FIELD,
      label: 'Date Field',
      description: 'Display a date field',
      icon: Calendar,
      defaultProps: {
        fieldType: 'date',
        showLabel: true,
        isEditable: false
      }
    },
    {
      id: 'related-tasks',
      type: ComponentTypes.RELATED_LIST,
      label: 'Related Tasks',
      description: 'Display related tasks',
      icon: CheckSquare,
      defaultProps: {
        relatedObject: 'task',
        title: 'Tasks',
        showNewButton: true
      }
    },
    {
      id: 'related-notes',
      type: ComponentTypes.RELATED_LIST,
      label: 'Related Notes',
      description: 'Display related notes',
      icon: FileText,
      defaultProps: {
        relatedObject: 'note',
        title: 'Notes',
        showNewButton: true
      }
    },
    {
      id: 'activity-timeline',
      type: ComponentTypes.ACTIVITY,
      label: 'Activity Timeline',
      description: 'Display activity timeline',
      icon: Activity,
      defaultProps: {
        showFilters: true,
        limit: 10
      }
    },
    {
      id: 'custom-html',
      type: ComponentTypes.CUSTOM_HTML,
      label: 'Custom HTML',
      description: 'Add custom HTML content',
      icon: Code,
      defaultProps: {
        content: '<div>Custom content here</div>'
      }
    }
  ];

  return (
    <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Components</h2>
        <p className="text-xs text-slate-500 mt-1">Drag components to the layout</p>
      </div>

      <div className="p-4 space-y-3">
        {/* Field Components */}
        <div>
          <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Fields</h3>
          <div className="space-y-2">
            {availableComponents
              .filter(c => c.type === ComponentTypes.FIELD)
              .map(component => (
                <DraggableComponent key={component.id} component={component} />
              ))}
          </div>
        </div>

        {/* Related Lists */}
        <div>
          <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Related Lists</h3>
          <div className="space-y-2">
            {availableComponents
              .filter(c => c.type === ComponentTypes.RELATED_LIST)
              .map(component => (
                <DraggableComponent key={component.id} component={component} />
              ))}
          </div>
        </div>

        {/* Activity & Custom */}
        <div>
          <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Other</h3>
          <div className="space-y-2">
            {availableComponents
              .filter(c => c.type === ComponentTypes.ACTIVITY || c.type === ComponentTypes.CUSTOM_HTML)
              .map(component => (
                <DraggableComponent key={component.id} component={component} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComponentLibrary;
export { ComponentTypes };
