/**
 * SendNotificationConfigPanel - Configure Send Notification Node for Flow Builder
 * 
 * Allows configuring:
 * - Recipient (User ID or field reference)
 * - Notification Title
 * - Notification Message
 * - Target Record (for deep linking)
 * - Priority (Critical, Normal, FYI)
 */
import React, { useState, useEffect } from 'react';
import { Bell, User, Variable, FileText, AlertCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Textarea } from '../../../../components/ui/textarea';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

/**
 * Variable Picker Button Component
 */
const VariablePickerButton = ({ onInsert, context }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Get available variables from context
  const triggerEntity = context?.triggerConfig?.entity || context?.triggerConfig?.object || 'Record';
  
  const triggerFields = [
    { name: `Trigger.${triggerEntity}.Id`, label: 'Record ID' },
    { name: `Trigger.${triggerEntity}.Name`, label: 'Record Name' },
    { name: `Trigger.${triggerEntity}.OwnerId`, label: 'Owner ID' },
    { name: `Trigger.${triggerEntity}.CreatedById`, label: 'Created By ID' },
  ];
  
  const systemVariables = [
    { name: 'System.CurrentUser', label: 'Current User ID' },
    { name: 'System.CurrentDate', label: 'Current Date' },
    { name: 'System.CurrentDateTime', label: 'Current Date & Time' },
  ];
  
  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="text-xs"
      >
        <Variable className="h-3 w-3 mr-1" />
        Insert Variable
      </Button>
    );
  }
  
  return (
    <div className="absolute z-50 right-0 top-6 w-64 bg-white border rounded-lg shadow-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold">Insert Variable</span>
        <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-5 w-5 p-0">×</Button>
      </div>
      
      {/* Trigger Fields */}
      <div className="mb-3">
        <div className="text-[10px] text-slate-500 uppercase mb-1">Trigger - {triggerEntity}</div>
        {triggerFields.map(v => (
          <button
            key={v.name}
            onClick={() => { onInsert(`{{${v.name}}}`); setIsOpen(false); }}
            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-100 block"
          >
            {v.label} <code className="text-[9px] ml-1 text-slate-500">{`{{${v.name}}}`}</code>
          </button>
        ))}
      </div>
      
      {/* System Variables */}
      <div>
        <div className="text-[10px] text-slate-500 uppercase mb-1">System</div>
        {systemVariables.map(v => (
          <button
            key={v.name}
            onClick={() => { onInsert(`{{${v.name}}}`); setIsOpen(false); }}
            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-100 block"
          >
            {v.label} <code className="text-[9px] ml-1 text-slate-500">{`{{${v.name}}}`}</code>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Main Send Notification Config Panel
 */
const SendNotificationConfigPanel = ({ config = {}, handleConfigChange, context }) => {
  const [recipientMode, setRecipientMode] = useState(config.recipient_mode || 'field');
  const [systemUsers, setSystemUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Get trigger entity for field references
  const triggerEntity = context?.triggerConfig?.entity || context?.triggerConfig?.object || 'Record';
  
  // Fetch system users for dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API}/api/users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSystemUsers(response.data || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);
  
  // Handle recipient mode change
  const handleRecipientModeChange = (mode) => {
    setRecipientMode(mode);
    handleConfigChange('recipient_mode', mode);
    
    if (mode === 'field') {
      handleConfigChange('recipient_user_id', `{!Trigger.${triggerEntity}.OwnerId}`);
    } else {
      handleConfigChange('recipient_user_id', '');
    }
  };
  
  // Available field references for recipient
  const recipientFields = [
    { value: `{!Trigger.${triggerEntity}.OwnerId}`, label: 'Record Owner' },
    { value: `{!Trigger.${triggerEntity}.CreatedById}`, label: 'Record Creator' },
    { value: `{!Trigger.${triggerEntity}.assigned_to}`, label: 'Assigned User' },
  ];
  
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <Bell className="h-5 w-5 text-indigo-600" />
        <div>
          <h3 className="font-semibold text-sm">Send Notification</h3>
          <p className="text-xs text-slate-500">Send an in-app notification to a user</p>
        </div>
      </div>
      
      {/* Recipient */}
      <div className="border rounded-lg p-4 bg-slate-50">
        <Label className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          Recipient *
        </Label>
        
        <div className="mt-3 space-y-3">
          {/* Mode Selector */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={recipientMode === 'field' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleRecipientModeChange('field')}
            >
              <FileText className="h-3 w-3 mr-1" />
              Record Field
            </Button>
            <Button
              type="button"
              variant={recipientMode === 'user' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleRecipientModeChange('user')}
            >
              <User className="h-3 w-3 mr-1" />
              Specific User
            </Button>
          </div>
          
          {/* Field Reference Selector */}
          {recipientMode === 'field' && (
            <Select
              value={config.recipient_user_id || ''}
              onValueChange={(value) => handleConfigChange('recipient_user_id', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a field reference" />
              </SelectTrigger>
              <SelectContent>
                {recipientFields.map(field => (
                  <SelectItem key={field.value} value={field.value}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {/* System User Selector */}
          {recipientMode === 'user' && (
            <Select
              value={config.recipient_user_id || ''}
              onValueChange={(value) => handleConfigChange('recipient_user_id', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select a user"} />
              </SelectTrigger>
              <SelectContent>
                {systemUsers.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        
        <p className="text-xs text-slate-500 mt-2">
          Who should receive this notification?
        </p>
      </div>
      
      {/* Title */}
      <div>
        <div className="flex items-center justify-between mb-1 relative">
          <Label className="text-sm font-medium">Notification Title *</Label>
          <VariablePickerButton 
            onInsert={(v) => handleConfigChange('title', (config.title || '') + v)}
            context={context}
          />
        </div>
        <Input
          value={config.title || ''}
          onChange={(e) => handleConfigChange('title', e.target.value)}
          placeholder="e.g., New Lead Assigned"
          data-testid="notification-title-input"
        />
        <p className="text-xs text-slate-500 mt-1">
          Supports variables like {'{{Trigger.Record.Name}}'}
        </p>
      </div>
      
      {/* Message */}
      <div>
        <div className="flex items-center justify-between mb-1 relative">
          <Label className="text-sm font-medium">Message *</Label>
          <VariablePickerButton 
            onInsert={(v) => handleConfigChange('message', (config.message || '') + v)}
            context={context}
          />
        </div>
        <Textarea
          value={config.message || ''}
          onChange={(e) => handleConfigChange('message', e.target.value)}
          placeholder="e.g., A new lead has been assigned to you: {{Trigger.Lead.Name}}"
          rows={3}
          data-testid="notification-message-input"
        />
        <p className="text-xs text-slate-500 mt-1">
          Detailed message body with variable support
        </p>
      </div>
      
      {/* Target Record (Optional) */}
      <div className="border rounded-lg p-4 bg-slate-50">
        <Label className="text-sm font-medium">Target Record (for deep link)</Label>
        <p className="text-xs text-slate-500 mb-3">
          Clicking the notification will open this record
        </p>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Object Type</Label>
            <Select
              value={config.target_object_type || ''}
              onValueChange={(value) => handleConfigChange('target_object_type', value)}
            >
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="Select object" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="opportunity">Opportunity</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="event">Event</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-xs">Object ID</Label>
            <Input
              value={config.target_object_id || ''}
              onChange={(e) => handleConfigChange('target_object_id', e.target.value)}
              placeholder="{!Trigger.Record.Id}"
              className="mt-1"
            />
          </div>
        </div>
        
        {!config.target_object_type && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Without a target, notification won't link to a record
          </p>
        )}
      </div>
      
      {/* Priority */}
      <div>
        <Label className="text-sm font-medium">Priority</Label>
        <Select
          value={config.priority || 'NORMAL'}
          onValueChange={(value) => handleConfigChange('priority', value)}
        >
          <SelectTrigger className="w-full mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CRITICAL">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Critical - Requires immediate attention
              </span>
            </SelectItem>
            <SelectItem value="NORMAL">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Normal - Standard notification
              </span>
            </SelectItem>
            <SelectItem value="FYI">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                FYI - Informational only
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500 mt-1">
          Critical notifications appear with higher visual priority
        </p>
      </div>
      
      {/* Preview */}
      <div className="border rounded-lg p-4 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-medium text-indigo-900">Preview</span>
        </div>
        
        <div className="bg-white rounded-lg p-3 shadow-sm border">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              config.priority === 'CRITICAL' ? 'bg-red-100' :
              config.priority === 'FYI' ? 'bg-slate-100' : 'bg-blue-100'
            }`}>
              <Bell className={`h-4 w-4 ${
                config.priority === 'CRITICAL' ? 'text-red-600' :
                config.priority === 'FYI' ? 'text-slate-600' : 'text-blue-600'
              }`} />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">
                {config.title || 'Notification Title'}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {config.message || 'Notification message will appear here...'}
              </div>
              {config.target_object_type && (
                <div className="text-xs text-indigo-600 mt-2">
                  → Opens {config.target_object_type} record
                </div>
              )}
            </div>
          </div>
        </div>
        
        <p className="text-[10px] text-slate-500 mt-2">
          Variables will be replaced with actual values at runtime
        </p>
      </div>
    </div>
  );
};

export default SendNotificationConfigPanel;
