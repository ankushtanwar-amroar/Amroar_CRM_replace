/**
 * PathComponent - Record Stage/Progress Path
 * 
 * Renders a visual progress path showing record stages (like Lead Status path).
 * Supports marking stages as complete and navigating between stages.
 */
import React, { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../lib/utils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Default stages for common objects
const DEFAULT_STAGES = {
  lead: [
    { value: 'New', label: 'New' },
    { value: 'Working', label: 'Working' },
    { value: 'Closed', label: 'Closed' },
    { value: 'Converted', label: 'Converted' },
  ],
  opportunity: [
    { value: 'Prospecting', label: 'Prospecting' },
    { value: 'Qualification', label: 'Qualification' },
    { value: 'Proposal', label: 'Proposal' },
    { value: 'Negotiation', label: 'Negotiation' },
    { value: 'Closed Won', label: 'Closed Won' },
  ],
};

const PathComponent = ({
  config = {},
  record,
  objectName,
  objectSchema,
  onRecordUpdate,
  onFieldSave,
}) => {
  const [updating, setUpdating] = useState(false);
  
  // Determine the status field
  const statusField = config.statusField || objectSchema?.stage_field || 'status';
  const currentStatus = record?.data?.[statusField] || '';

  // Get stages from config, schema, or defaults
  const stages = useMemo(() => {
    // First check config
    if (config.stages && Array.isArray(config.stages)) {
      return config.stages;
    }

    // Then check schema field options
    const fieldSchema = objectSchema?.fields?.[statusField];
    if (fieldSchema?.options && Array.isArray(fieldSchema.options)) {
      return fieldSchema.options.map(opt => ({
        value: typeof opt === 'string' ? opt : opt.value,
        label: typeof opt === 'string' ? opt : (opt.label || opt.value),
      }));
    }

    // Fallback to defaults
    return DEFAULT_STAGES[objectName?.toLowerCase()] || [
      { value: 'New', label: 'New' },
      { value: 'In Progress', label: 'In Progress' },
      { value: 'Complete', label: 'Complete' },
    ];
  }, [config.stages, objectSchema, statusField, objectName]);

  const currentIndex = stages.findIndex(s => s.value === currentStatus);

  const handleStageClick = async (stage) => {
    if (stage.value === currentStatus) return;
    
    setUpdating(true);
    
    try {
      // If onFieldSave is provided, use it (handles API call)
      if (onFieldSave) {
        await onFieldSave(statusField, stage.value);
      } else {
        // Direct API call as fallback
        const recordId = record?.series_id || record?.id;
        if (!recordId) {
          toast.error('No record ID found');
          return;
        }
        
        const token = localStorage.getItem('token');
        const response = await axios.put(
          `${API}/objects/${objectName}/records/${recordId}`,
          { data: { [statusField]: stage.value } },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Update local state
        if (onRecordUpdate && response.data) {
          onRecordUpdate(response.data);
        }
        
        toast.success('Status updated');
      }
    } catch (error) {
      console.error('Failed to update stage:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to update status';
      toast.error(errorMsg);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-sm" data-testid="path-component">
      <div className="px-4 py-3">
        <div className="flex items-center">
          {stages.map((stage, index) => {
            const isActive = stage.value === currentStatus;
            const isComplete = index < currentIndex;
            const isLast = index === stages.length - 1;

            return (
              <div key={stage.value} className="flex items-center flex-1">
                {/* Stage Button */}
                <button
                  onClick={() => handleStageClick(stage)}
                  disabled={updating}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-white/50",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    isActive && "bg-white text-blue-700 shadow-sm",
                    isComplete && "bg-blue-500/50 text-white",
                    !isActive && !isComplete && "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <div className="flex items-center justify-center gap-2">
                    {isComplete && (
                      <Check className="h-4 w-4 text-green-400" />
                    )}
                    <span className="truncate">{stage.label}</span>
                  </div>
                </button>

                {/* Connector Line */}
                {!isLast && (
                  <div 
                    className={cn(
                      "w-4 h-0.5 mx-1",
                      index < currentIndex ? "bg-green-400" : "bg-white/30"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Mark as Complete Button */}
        {currentIndex < stages.length - 1 && (
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 text-xs"
              disabled={updating}
              onClick={() => {
                const nextStage = stages[currentIndex + 1];
                if (nextStage) handleStageClick(nextStage);
              }}
            >
              {updating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              Mark Status as Complete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PathComponent;
