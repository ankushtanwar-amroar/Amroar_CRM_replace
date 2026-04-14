/**
 * useFlowVariables - Custom hook for flow variable management
 * Extracted from FlowEditorPage.js
 */
import { useMemo, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Hook to manage flow variables including webhook, scheduled trigger, and screen variables
 */
export const useFlowVariables = ({
  triggers,
  nodes,
  flowVariables,
  setFlowVariables,
  inputVariables
}) => {
  /**
   * Handler to create new flow variable
   */
  const handleCreateFlowVariable = useCallback((variable) => {
    const newVariable = {
      id: `var_${Date.now()}`,
      name: variable.name,
      type: variable.type,
      value: variable.value || '',
      createdAt: new Date().toISOString()
    };
    
    setFlowVariables(prev => [...prev, newVariable]);
    toast.success(`Created resource: ${variable.name}`);
    console.log('✅ Created new flow variable:', newVariable);
  }, [setFlowVariables]);

  /**
   * Generate webhook body fields as virtual variables
   */
  const webhookBodyVariables = useMemo(() => {
    if (!triggers || triggers.length === 0) return [];
    
    const webhookTrigger = triggers.find(t => t.type === 'incoming_webhook_trigger' || t.type === 'webhook_trigger');
    if (!webhookTrigger || !webhookTrigger.config || !webhookTrigger.config.body_fields) {
      return [];
    }
    
    return webhookTrigger.config.body_fields.map(field => ({
      id: `webhook_${field.id}`,
      name: `WebhookBody.${field.name}`,
      type: field.type,
      value: '',
      isWebhookField: true,
      required: field.required
    }));
  }, [triggers]);

  /**
   * Generate scheduled trigger object fields as virtual variables
   */
  const scheduledTriggerVariables = useMemo(() => {
    if (!triggers || triggers.length === 0) return [];
    
    const scheduledTrigger = triggers.find(t => t.type === 'scheduled_trigger');
    if (!scheduledTrigger || !scheduledTrigger.config || !scheduledTrigger.config.object) {
      return [];
    }
    
    const objectName = scheduledTrigger.config.object;
    
    const objectVariables = [
      {
        id: `scheduled_${objectName.toLowerCase()}_id`,
        name: `${objectName}.id`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} ID`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_name`,
        name: `${objectName}.name`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Name`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_email`,
        name: `${objectName}.email`,
        type: 'email',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Email`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_phone`,
        name: `${objectName}.phone`,
        type: 'phone',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Phone`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_company`,
        name: `${objectName}.company`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Company`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_status`,
        name: `${objectName}.status`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Status`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_createdAt`,
        name: `${objectName}.createdAt`,
        type: 'date',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Created Date`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_updatedAt`,
        name: `${objectName}.updatedAt`,
        type: 'date',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Updated Date`
      }
    ];
    
    return objectVariables;
  }, [triggers]);

  /**
   * Generate screen node input fields as virtual variables
   */
  const screenFieldVariables = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    
    const screenVariables = [];
    
    nodes.forEach(node => {
      if (node.data?.nodeType === 'screen' && node.data?.config?.fields) {
        node.data.config.fields.forEach(field => {
          if (field.name) {
            screenVariables.push({
              id: `screen_${node.id}_${field.id}`,
              name: `Screen.${field.name}`,
              type: field.type || 'text',
              value: '',
              isScreenField: true,
              screenNodeId: node.id,
              label: field.label || field.name
            });
          }
        });
      }
    });
    
    return screenVariables;
  }, [nodes]);

  /**
   * Combine all available variables
   */
  const allAvailableVariables = useMemo(() => {
    return [
      ...flowVariables, 
      ...inputVariables, 
      ...webhookBodyVariables, 
      ...scheduledTriggerVariables, 
      ...screenFieldVariables
    ];
  }, [flowVariables, inputVariables, webhookBodyVariables, scheduledTriggerVariables, screenFieldVariables]);

  return {
    handleCreateFlowVariable,
    webhookBodyVariables,
    scheduledTriggerVariables,
    screenFieldVariables,
    allAvailableVariables
  };
};

export default useFlowVariables;
