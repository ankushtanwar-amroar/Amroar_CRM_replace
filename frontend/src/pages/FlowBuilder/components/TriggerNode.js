/**
 * TriggerNode - Specialized node renderer for Start/Trigger nodes
 * Shows configuration details inline (Salesforce-like)
 * Requirement #9: Start Node Details Display
 */
import React from 'react';
import { Handle, Position } from 'reactflow';
import { 
  Play, Zap, Clock, Globe, Database, 
  Monitor, FileText, RefreshCw
} from 'lucide-react';

// Trigger type configurations
const TRIGGER_STYLES = {
  // Start node for screen flows
  start: { 
    icon: Play, 
    color: '#10b981', 
    label: 'Start',
    bgColor: 'from-emerald-100 to-emerald-50'
  },
  
  // Record triggers
  trigger: { 
    icon: Zap, 
    color: '#10b981', 
    label: 'Record-Triggered Flow',
    bgColor: 'from-emerald-100 to-emerald-50'
  },
  record_trigger: { 
    icon: Database, 
    color: '#10b981', 
    label: 'Record-Triggered Flow',
    bgColor: 'from-emerald-100 to-emerald-50'
  },
  db: { 
    icon: Database, 
    color: '#10b981', 
    label: 'Record-Triggered Flow',
    bgColor: 'from-emerald-100 to-emerald-50'
  },
  
  // Webhook triggers
  webhook_trigger: { 
    icon: Globe, 
    color: '#9333ea', 
    label: 'Webhook-Triggered Flow',
    bgColor: 'from-purple-100 to-purple-50'
  },
  incoming_webhook_trigger: { 
    icon: Globe, 
    color: '#9333ea', 
    label: 'Webhook-Triggered Flow',
    bgColor: 'from-purple-100 to-purple-50'
  },
  
  // Scheduled triggers  
  scheduled_trigger: { 
    icon: Clock, 
    color: '#f97316', 
    label: 'Scheduled-Triggered Flow',
    bgColor: 'from-orange-100 to-orange-50'
  },
  schedule: { 
    icon: Clock, 
    color: '#f97316', 
    label: 'Scheduled-Triggered Flow',
    bgColor: 'from-orange-100 to-orange-50'
  },
  
  // Screen flow
  screen: { 
    icon: Monitor, 
    color: '#3b82f6', 
    label: 'Screen Flow',
    bgColor: 'from-blue-100 to-blue-50'
  },
  
  // Default
  default: { 
    icon: Play, 
    color: '#64748b', 
    label: 'Start',
    bgColor: 'from-slate-100 to-slate-50'
  }
};

// Get human-readable trigger condition
const getTriggerConditionLabel = (config) => {
  if (!config) return null;
  
  const triggerEvent = config.triggerEvent || config.trigger_event || config.event;
  const triggerEvents = config.triggerEvents || config.trigger_events || [];
  
  // Combine single event with array of events
  const events = [...(triggerEvents || [])];
  if (triggerEvent && !events.includes(triggerEvent)) {
    events.unshift(triggerEvent);
  }
  
  if (events.length === 0) return null;
  
  const eventLabels = {
    'created': 'A record is created',
    'updated': 'A record is updated',
    'deleted': 'A record is deleted',
    'created_or_updated': 'A record is created or updated',
    'insert': 'A record is created',
    'update': 'A record is updated',
    'delete': 'A record is deleted'
  };
  
  const labels = events.map(e => eventLabels[e?.toLowerCase()] || e).filter(Boolean);
  
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels.join(' or ');
  return labels.slice(0, -1).join(', ') + ' or ' + labels.slice(-1);
};

// Get optimization type label
const getOptimizationLabel = (config) => {
  if (!config) return null;
  
  const optimizationType = config.optimizationType || config.optimization_type || config.mode;
  
  const optimizationLabels = {
    'actions_and_related_records': 'Actions and Related Records',
    'fast_field_updates': 'Fast Field Updates',
    'related_records': 'Actions and Related Records',
    'field_updates_only': 'Fast Field Updates',
    'default': 'Actions and Related Records'
  };
  
  return optimizationLabels[optimizationType?.toLowerCase()] || null;
};

const TriggerNode = ({ data, id, selected }) => {
  // Safely destructure data with defaults
  const label = data?.label || 'Start';
  const nodeType = data?.nodeType || data?.type || 'start';
  const config = data?.config || {};
  const triggers = data?.triggers || [];
  
  // Get the first trigger configuration if available
  const triggerConfig = triggers[0]?.config || config;
  const triggerType = triggers[0]?.type || nodeType;
  
  // Get style configuration
  const styleConfig = TRIGGER_STYLES[triggerType?.toLowerCase()] || TRIGGER_STYLES['default'];
  const IconComponent = styleConfig.icon;
  
  // Extract configuration details for inline display
  const objectName = triggerConfig?.object || triggerConfig?.entity || triggerConfig?.objectName || '';
  const triggerCondition = getTriggerConditionLabel(triggerConfig);
  const optimizationType = getOptimizationLabel(triggerConfig);
  
  // For scheduled triggers
  const scheduleType = triggerConfig?.scheduleType || triggerConfig?.schedule_type;
  const cronExpression = triggerConfig?.cronExpression || triggerConfig?.cron;
  const intervalValue = triggerConfig?.intervalValue || triggerConfig?.interval;
  const intervalUnit = triggerConfig?.intervalUnit || triggerConfig?.unit;
  
  // Build schedule description
  let scheduleDescription = null;
  if (scheduleType === 'cron' && cronExpression) {
    scheduleDescription = `Cron: ${cronExpression}`;
  } else if (scheduleType === 'interval' && intervalValue) {
    scheduleDescription = `Every ${intervalValue} ${intervalUnit || 'hours'}`;
  } else if (scheduleType === 'daily') {
    scheduleDescription = 'Runs daily';
  } else if (scheduleType === 'weekly') {
    scheduleDescription = 'Runs weekly';
  } else if (scheduleType === 'monthly') {
    scheduleDescription = 'Runs monthly';
  }
  
  // For webhook triggers
  const webhookMethod = triggerConfig?.method || 'POST';
  const webhookPath = triggerConfig?.path;
  
  // Determine if we have details to show
  const hasDetails = objectName || triggerCondition || optimizationType || scheduleDescription || webhookPath;
  
  return (
    <div 
      className={`bg-gradient-to-br ${styleConfig.bgColor}`}
      style={{
        padding: '12px 16px',
        border: `2px solid ${styleConfig.color}`,
        borderRadius: '10px',
        width: hasDetails ? '220px' : '180px',
        minHeight: hasDetails ? '100px' : '80px',
        boxShadow: selected ? `0 0 0 2px ${styleConfig.color}` : `0 2px 8px ${styleConfig.color}30`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}
      data-testid={`trigger-node-${id}`}
    >
      {/* Header with Icon and Label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        paddingBottom: hasDetails ? '6px' : '0',
        borderBottom: hasDetails ? `1px solid ${styleConfig.color}30` : 'none'
      }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: styleConfig.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <IconComponent style={{ width: '14px', height: '14px', color: 'white' }} />
        </div>
        
        <div style={{
          fontSize: '12px',
          fontWeight: '600',
          color: styleConfig.color,
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
          lineHeight: '1.2'
        }}>
          {styleConfig.label}
        </div>
      </div>
      
      {/* Configuration Details (Requirement #9) */}
      {hasDetails && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '11px',
          color: '#374151'
        }}>
          {/* Object/Entity */}
          {objectName && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Database style={{ width: '12px', height: '12px', color: '#6b7280' }} />
              <span style={{ fontWeight: '600' }}>Object:</span>
              <span style={{ color: styleConfig.color }}>{objectName}</span>
            </div>
          )}
          
          {/* Trigger Condition */}
          {triggerCondition && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px'
            }}>
              <RefreshCw style={{ width: '12px', height: '12px', color: '#6b7280', marginTop: '1px', flexShrink: 0 }} />
              <span style={{ fontWeight: '600', flexShrink: 0 }}>When:</span>
              <span style={{ color: '#4b5563' }}>{triggerCondition}</span>
            </div>
          )}
          
          {/* Optimization Type */}
          {optimizationType && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px'
            }}>
              <Zap style={{ width: '12px', height: '12px', color: '#6b7280', marginTop: '1px', flexShrink: 0 }} />
              <span style={{ fontWeight: '600', flexShrink: 0 }}>Mode:</span>
              <span style={{ color: '#4b5563' }}>{optimizationType}</span>
            </div>
          )}
          
          {/* Schedule Description */}
          {scheduleDescription && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Clock style={{ width: '12px', height: '12px', color: '#6b7280' }} />
              <span style={{ fontWeight: '600' }}>Schedule:</span>
              <span style={{ color: '#4b5563' }}>{scheduleDescription}</span>
            </div>
          )}
          
          {/* Webhook Details */}
          {webhookPath && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Globe style={{ width: '12px', height: '12px', color: '#6b7280' }} />
              <span style={{ fontWeight: '600' }}>{webhookMethod}:</span>
              <span style={{ 
                color: '#4b5563',
                fontSize: '10px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '120px'
              }}>{webhookPath}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ 
          background: styleConfig.color, 
          width: '10px', 
          height: '10px',
          border: '2px solid white',
          bottom: '-5px' 
        }}
      />
    </div>
  );
};

export default TriggerNode;
