/**
 * TaskCustomFields Component
 * Displays and edits custom field values on a task
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Loader2, Save, Type, Hash, List, Calendar, CheckSquare, Settings, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getFieldIcon = (type) => {
  switch (type) {
    case 'text': return Type;
    case 'number': return Hash;
    case 'dropdown': return List;
    case 'date': return Calendar;
    case 'checkbox': return CheckSquare;
    case 'formula': return Calculator;
    default: return Type;
  }
};

const TaskCustomFields = ({ taskId, onUpdate }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  const fetchCustomFields = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/custom-fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setFields(data);
        
        // Initialize values from the response
        const initialValues = {};
        data.forEach(field => {
          initialValues[field.api_name] = field.value;
        });
        setValues(initialValues);
      }
    } catch (error) {
      console.error('Error fetching custom fields:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      fetchCustomFields();
    }
  }, [taskId, fetchCustomFields]);

  const handleValueChange = (apiName, value) => {
    setValues(prev => ({ ...prev, [apiName]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/custom-fields`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });

      if (res.ok) {
        toast.success('Custom fields saved');
        setHasChanges(false);
        if (onUpdate) onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to save custom fields');
      }
    } catch (error) {
      console.error('Error saving custom fields:', error);
      toast.error('Failed to save custom fields');
    } finally {
      setSaving(false);
    }
  };

  const renderFieldInput = (field) => {
    const value = values[field.api_name];
    const Icon = getFieldIcon(field.field_type);

    switch (field.field_type) {
      case 'text':
        return (
          <Input
            value={value || ''}
            onChange={(e) => handleValueChange(field.api_name, e.target.value)}
            placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
            data-testid={`cf-${field.api_name}`}
          />
        );
      
      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => handleValueChange(field.api_name, e.target.value ? Number(e.target.value) : null)}
            placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
            data-testid={`cf-${field.api_name}`}
          />
        );
      
      case 'dropdown':
        return (
          <Select
            value={value || ''}
            onValueChange={(v) => handleValueChange(field.api_name, v)}
          >
            <SelectTrigger data-testid={`cf-${field.api_name}`}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- None --</SelectItem>
              {(field.options || []).map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      case 'date':
        return (
          <Input
            type="date"
            value={value ? value.split('T')[0] : ''}
            onChange={(e) => handleValueChange(field.api_name, e.target.value || null)}
            data-testid={`cf-${field.api_name}`}
          />
        );
      
      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={!!value}
              onCheckedChange={(checked) => handleValueChange(field.api_name, checked)}
              data-testid={`cf-${field.api_name}`}
            />
            <span className="text-sm text-slate-600">
              {value ? 'Yes' : 'No'}
            </span>
          </div>
        );
      
      case 'formula':
        return (
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-md border">
            <Calculator className="w-4 h-4 text-slate-400" />
            <span className="font-mono text-sm font-medium text-slate-700" data-testid={`cf-${field.api_name}`}>
              {value !== null && value !== undefined ? value : '—'}
            </span>
            <span className="text-xs text-slate-400">(calculated)</span>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Type className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="text-sm">No custom fields defined</p>
        <Button
          variant="link"
          size="sm"
          onClick={() => navigate('/task-manager/custom-fields')}
          className="mt-2"
        >
          <Settings className="w-4 h-4 mr-1" />
          Manage Custom Fields
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700">Custom Fields</h4>
        {hasChanges && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            data-testid="save-custom-fields-btn"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        )}
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {fields.map(field => (
          <div key={field.id} className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs text-slate-600">
              {React.createElement(getFieldIcon(field.field_type), { className: 'w-3 h-3' })}
              {field.label}
              {field.is_required && <span className="text-red-500">*</span>}
            </Label>
            {renderFieldInput(field)}
            {field.description && (
              <p className="text-xs text-slate-400">{field.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/task-manager/custom-fields')}
          className="text-xs text-slate-500"
        >
          <Settings className="w-3 h-3 mr-1" />
          Manage Fields
        </Button>
      </div>
    </div>
  );
};

export default TaskCustomFields;
