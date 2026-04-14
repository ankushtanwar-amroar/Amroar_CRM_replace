import React, { useMemo } from 'react';
import { X, Mail, Database, GitBranch, Brain, Zap, Clock, Globe, Webhook, Table2, MessageSquare, Users, Code, Merge as MergeIcon, Edit, Repeat, Monitor, AlertTriangle, Bell } from 'lucide-react';
import { ErrorHandlingRules } from '../utils/errorHandlingRules';

const AddActionMenu = ({ onClose, onSelectAction, position, flowType, triggers }) => {
  // Determine flow type from triggers if not provided
  const currentFlowType = useMemo(() => {
    if (flowType) {
      console.log('🎯 AddActionMenu: Using provided flowType:', flowType);
      return flowType;
    }
    const detectedType = ErrorHandlingRules.getFlowTypeFromTriggers(triggers || []);
    console.log('🎯 AddActionMenu: Detected flowType from triggers:', detectedType, 'Triggers:', triggers);
    return detectedType;
  }, [flowType, triggers]);

  // Check if Add Error should be shown
  const canShowAddError = ErrorHandlingRules.canShowAddError(currentFlowType);
  
  // Requirement #4: Screen node only available for Screen Flow
  const canShowScreenNode = useMemo(() => {
    const flowTypeStr = String(currentFlowType || '').toLowerCase();
    // Only show Screen node for screen flows
    const isScreenFlow = flowTypeStr === 'screen' || 
                         flowTypeStr === 'screen-flow' || 
                         flowTypeStr === 'screen_flow';
    console.log('🎯 AddActionMenu: canShowScreenNode =', isScreenFlow, 'for flowType:', currentFlowType);
    return isScreenFlow;
  }, [currentFlowType]);
  
  console.log('🎯 AddActionMenu: canShowAddError =', canShowAddError, 'for flowType:', currentFlowType);

  const actionCategories = [
    // Requirement #4: Only include User Interaction category if Screen node is allowed
    ...(canShowScreenNode ? [{
      title: 'User Interaction',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-gradient-to-r from-blue-50 to-blue-100',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700',
      actions: [
        {
          id: 'screen',
          label: 'Screen',
          icon: Monitor,
          description: 'Display a screen to collect user input',
          type: 'screen',
          nodeType: 'screen',
          config: { 
            label: 'New Screen',
            fields: []
          }
        }
      ]
    }] : []),
    {
      title: 'Communication',
      color: 'from-purple-500 to-indigo-600',
      bgColor: 'bg-gradient-to-r from-purple-50 to-indigo-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-700',
      actions: [
        {
          id: 'send-email',
          label: 'Send Email',
          icon: Mail,
          description: 'Send an email to specified recipients',
          type: 'connector',
          nodeType: 'connector',
          config: { connector_type: 'sendgrid' }
        },
        {
          id: 'send-notification',
          label: 'Send Notification',
          icon: Bell,
          description: 'Send an in-app notification to a user',
          type: 'send_notification',
          nodeType: 'send_notification',
          config: { 
            title: '',
            message: '',
            priority: 'NORMAL'
          }
        }
      ]
    },
    {
      title: 'CRM & Data',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-gradient-to-r from-blue-50 to-blue-100',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700',
      actions: [
        {
          id: 'crm-action',
          label: 'CRM Action',
          icon: Database,
          description: 'Create, update, or delete CRM records',
          type: 'mcp',
          nodeType: 'mcp',
          config: { mcp_action: 'crm.activity.create' }
        }
      ]
    },
    {
      title: 'Logic',
      color: 'from-yellow-500 to-amber-600',
      bgColor: 'bg-gradient-to-r from-yellow-50 to-amber-50',
      borderColor: 'border-yellow-200',
      textColor: 'text-yellow-700',
      actions: [
        {
          id: 'assignment',
          label: 'Assignment',
          icon: Edit,
          description: 'Set or change the value of a variable',
          type: 'assignment',
          nodeType: 'assignment',
          config: {}
        },
        {
          id: 'decision',
          label: 'Decision',
          icon: GitBranch,
          description: 'Route records based on conditions',
          type: 'decision',
          nodeType: 'decision',
          config: {}
        },
        {
          id: 'loop',
          label: 'Loop',
          icon: Repeat,
          description: 'Iterate through a collection of records',
          type: 'loop',
          nodeType: 'loop',
          config: {}
        },
        {
          id: 'delay',
          label: 'Delay',
          icon: Clock,
          description: 'Pause execution for a specified duration',
          type: 'delay',
          nodeType: 'delay',
          config: {
            duration_value: 1,
            duration_unit: 'hours'
          }
        },
        // Conditionally include Add Error based on flow type
        ...(canShowAddError ? [{
          id: 'add_error',
          label: 'Add Error',
          icon: AlertTriangle,
          description: 'Surface an error message to the user',
          type: 'add_error',
          nodeType: 'add_error',
          config: {
            errorMessage: 'An error occurred',
            isTerminal: true
          }
        }] : []),
        // {
        //   id: 'transform',
        //   label: 'Transform',
        //   icon: GitBranch,
        //   description: 'Transform data from one format to another',
        //   type: 'transform',
        //   nodeType: 'transform',
        //   config: { transformations: [] }
        // },
        // {
        //   id: 'collection-sort',
        //   label: 'Collection Sort',
        //   icon: GitBranch,
        //   description: 'Sort a collection of records',
        //   type: 'collection_sort',
        //   nodeType: 'collection_sort',
        //   config: { sortField: '', sortOrder: 'asc' }
        // },
        // {
        //   id: 'collection-filter',
        //   label: 'Collection Filter',
        //   icon: GitBranch,
        //   description: 'Filter records from a collection',
        //   type: 'collection_filter',
        //   nodeType: 'collection_filter',
        //   config: { filterConditions: [] }
        // }
      ]
    },
    {
      title: 'AI',
      color: 'from-pink-500 to-rose-600',
      bgColor: 'bg-gradient-to-r from-pink-50 to-rose-50',
      borderColor: 'border-pink-200',
      textColor: 'text-pink-700',
      actions: [
        {
          id: 'ai-prompt',
          label: 'AI Prompt',
          icon: Brain,
          description: 'Use AI to process data or generate content',
          type: 'ai_prompt',
          nodeType: 'ai_prompt',
          config: {}
        }
      ]
    },
    {
      title: 'External Integrations',
      color: 'from-green-500 to-emerald-600',
      bgColor: 'bg-gradient-to-r from-green-50 to-emerald-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-700',
      actions: [
        // {
        //   id: 'http-request',
        //   label: 'HTTP Request',
        //   icon: Globe,
        //   description: 'Make API calls to external services',
        //   type: 'http_request',
        //   nodeType: 'http_request',
        //   config: { method: 'GET', url: '', headers: {}, body: {} }
        // },
        {
          id: 'webhook',
          label: 'Webhook',
          icon: Webhook,
          description: 'Make external API calls to integrate with external systems',
          type: 'webhook',
          nodeType: 'webhook',
          config: {}
        },
        // {
        //   id: 'database',
        //   label: 'Database Query',
        //   icon: Database,
        //   description: 'Query or update database records',
        //   type: 'database',
        //   nodeType: 'database',
        //   config: { operation: 'select', query: '' }
        // },
        // {
        //   id: 'google-sheets',
        //   label: 'Google Sheets',
        //   icon: Table2,
        //   description: 'Read or write to Google Sheets',
        //   type: 'google_sheets',
        //   nodeType: 'google_sheets',
        //   config: { operation: 'read', spreadsheetId: '', range: '' }
        // },
        // {
        //   id: 'slack',
        //   label: 'Slack Message',
        //   icon: MessageSquare,
        //   description: 'Send message to Slack channel',
        //   type: 'slack',
        //   nodeType: 'slack',
        //   config: { channel: '', message: '' }
        // },
        // {
        //   id: 'teams',
        //   label: 'Microsoft Teams',
        //   icon: Users,
        //   description: 'Send message to Teams channel',
        //   type: 'teams',
        //   nodeType: 'teams',
        //   config: { channel: '', message: '' }
        // }
      ]
    },
    // {
    //   title: 'Control Flow',
    //   color: 'from-orange-500 to-red-600',
    //   bgColor: 'bg-gradient-to-r from-orange-50 to-red-50',
    //   borderColor: 'border-orange-200',
    //   textColor: 'text-orange-700',
    //   actions: [
    //     {
    //       id: 'wait-delay',
    //       label: 'Wait / Delay',
    //       icon: Clock,
    //       description: 'Pause the flow for a specified duration',
    //       type: 'wait',
    //       nodeType: 'wait',
    //       config: { duration: 5, unit: 'minutes' }
    //     },
    //     {
    //       id: 'merge',
    //       label: 'Merge',
    //       icon: MergeIcon,
    //       description: 'Merge multiple branches into one',
    //       type: 'merge',
    //       nodeType: 'merge',
    //       config: { mode: 'wait' }
    //     },
    //     {
    //       id: 'function',
    //       label: 'Function / Script',
    //       icon: Code,
    //       description: 'Execute custom JavaScript code',
    //       type: 'function',
    //       nodeType: 'function',
    //       config: { code: 'return items;' }
    //     }
    //   ]
    // },
    // {
    //   title: 'Other',
    //   color: 'from-gray-500 to-gray-600',
    //   bgColor: 'bg-gradient-to-r from-gray-50 to-gray-100',
    //   borderColor: 'border-gray-200',
    //   textColor: 'text-gray-700',
    //   actions: [
    //     {
    //       id: 'custom-action',
    //       label: 'Custom Action',
    //       icon: Zap,
    //       description: 'Execute a custom action or script',
    //       type: 'action',
    //       nodeType: 'action',
    //       config: {}
    //     }
    //   ]
    // }
  ];

  const handleActionSelect = (action) => {
    onSelectAction(action);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40"
        onClick={onClose}
      />

      {/* Menu Card */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Add Action</h3>
              <p className="text-sm text-gray-600 mt-1">Choose an action to add to your flow</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Categories */}
          <div className="space-y-6">
            {actionCategories.map((category, idx) => (
              <div key={idx}>
                {/* Category Header */}
                <div className={`${category.bgColor} border ${category.borderColor} rounded-lg px-4 py-2 mb-3`}>
                  <h4 className={`font-semibold ${category.textColor}`}>
                    {category.title}
                  </h4>
                </div>

                {/* Actions in Category */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {category.actions.map((action) => {
                    const IconComponent = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={() => handleActionSelect(action)}
                        className="group bg-white border-2 border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:shadow-md transition-all duration-200 text-left"
                      >
                        <div className="flex items-start">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                            <IconComponent className="w-5 h-5 text-white" />
                          </div>
                          <div className="ml-3 flex-1">
                            <h5 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                              {action.label}
                            </h5>
                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                              {action.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default AddActionMenu;
