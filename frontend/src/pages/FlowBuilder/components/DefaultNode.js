/**
 * DefaultNode - Generic node renderer for Flow Builder
 * Handles all non-specialized node types
 */
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { 
  Plus, Edit, Trash, Database, FileText, 
  Flag, Cog, Zap, Box, CheckCircle,
  ArrowRight, Send, Mail, MessageSquare,
  Play, AlertTriangle
} from 'lucide-react';

// Node type to icon and color mapping
const NODE_STYLES = {
  // Start
  start: { icon: Play, color: '#10b981', label: 'Start' },
  
  // Triggers
  trigger: { icon: Zap, color: '#10b981', label: 'Trigger' },
  record_trigger: { icon: Zap, color: '#10b981', label: 'Record Trigger' },
  webhook_trigger: { icon: Zap, color: '#9333ea', label: 'Webhook Trigger' },
  scheduled_trigger: { icon: Zap, color: '#f97316', label: 'Scheduled Trigger' },
  
  // CRM Actions
  create_record: { icon: Plus, color: '#10b981', label: 'Create Record' },
  mcp_create_record: { icon: Plus, color: '#10b981', label: 'Create Record' },
  update_record: { icon: Edit, color: '#3b82f6', label: 'Update Record' },
  mcp_update_record: { icon: Edit, color: '#3b82f6', label: 'Update Record' },
  delete_record: { icon: Trash, color: '#ef4444', label: 'Delete Record' },
  mcp_delete_record: { icon: Trash, color: '#ef4444', label: 'Delete Record' },
  get_records: { icon: Database, color: '#8b5cf6', label: 'Get Records' },
  mcp_get_records: { icon: Database, color: '#8b5cf6', label: 'Get Records' },
  mcp: { icon: Database, color: '#6366f1', label: 'CRM Action' },
  
  // Logic/Control
  assignment: { icon: ArrowRight, color: '#f59e0b', label: 'Assignment' },
  action: { icon: Zap, color: '#ec4899', label: 'Action' },
  connector: { icon: ArrowRight, color: '#f59e0b', label: 'Loop Back' },
  
  // Communication
  send_email: { icon: Mail, color: '#06b6d4', label: 'Send Email' },
  send_sms: { icon: MessageSquare, color: '#14b8a6', label: 'Send SMS' },
  
  // End/Terminal
  end: { icon: Flag, color: '#64748b', label: 'End' },
  
  // Default fallback
  default: { icon: Box, color: '#64748b', label: 'Action' }
};

const DefaultNode = ({ data, id, selected }) => {
  // Debug: log when component renders
  console.log('🎯 DefaultNode rendering:', { id, data, selected });
  
  // Safely destructure data with defaults
  const label = data?.label || 'Node';
  const nodeType = data?.nodeType || 'default';
  const config = data?.config || {};
  const hasFaultPath = data?.hasFaultPath || false;
  
  // Get style configuration
  const styleConfig = NODE_STYLES[nodeType] || NODE_STYLES['default'];
  const IconComponent = styleConfig.icon;
  
  // Determine display label
  const displayLabel = label || styleConfig.label;
  
  // Get object name for CRM actions
  const objectName = config?.object || config?.entity || '';
  
  // Check if this is an end node
  const isEndNode = nodeType === 'end' || label?.toLowerCase() === 'end';
  
  return (
    <div 
      style={{
        padding: '14px 18px',
        background: `linear-gradient(135deg, ${styleConfig.color}40 0%, ${styleConfig.color}20 100%)`,
        border: `2px solid ${styleConfig.color}`,
        borderRadius: '10px',
        width: '180px',
        minHeight: '80px',
        boxShadow: selected ? `0 0 0 2px ${styleConfig.color}` : `0 2px 8px ${styleConfig.color}30`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative'
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ 
          background: styleConfig.color, 
          width: '10px', 
          height: '10px',
          border: '2px solid white',
          top: '-5px' 
        }}
      />

      {/* Icon */}
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: styleConfig.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <IconComponent style={{ width: '16px', height: '16px', color: 'white' }} />
      </div>
      
      {/* Label */}
      <div style={{
        fontSize: '12px',
        fontWeight: '600',
        color: styleConfig.color,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '0.3px'
      }}>
        {displayLabel}
      </div>
      
      {/* Subtitle (object name) */}
      {objectName && (
        <div style={{
          fontSize: '10px',
          color: '#666',
          textAlign: 'center',
          fontWeight: '500'
        }}>
          {objectName}
        </div>
      )}

      {/* Fault Path Indicator */}
      {hasFaultPath && (
        <div style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AlertTriangle style={{ width: '10px', height: '10px', color: '#ef4444' }} />
        </div>
      )}
      
      {/* Output Handle (not for end nodes) */}
      {!isEndNode && (
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
      )}

      {/* Fault Output Handle (right side) - only if fault path is configured */}
      {hasFaultPath && (
        <Handle
          type="source"
          position={Position.Right}
          id="fault"
          style={{ 
            background: '#ef4444', 
            width: '10px', 
            height: '10px',
            border: '2px solid white',
            right: '-5px'
          }}
        />
      )}
    </div>
  );
};

export default memo(DefaultNode);
