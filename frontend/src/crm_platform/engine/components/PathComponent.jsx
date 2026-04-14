/**
 * PathComponent - Sales Pipeline Progress Indicator
 * 
 * Displays the current stage in the sales process with visual progress.
 * Supports click-to-advance functionality.
 */
import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../../components/ui/button';

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

const PathComponent = ({ config = {}, context = {} }) => {
  const { record, objectName, objectSchema, onFieldSave } = context;
  const recordData = record?.data || {};

  // Determine status field from config or schema
  const statusField = config.statusField || objectSchema?.stage_field || 'status';
  const currentStatus = recordData[statusField] || '';

  // Get stages from config, schema, or defaults
  const stages = useMemo(() => {
    // From component config
    if (config.stages && Array.isArray(config.stages) && config.stages.length > 0) {
      return config.stages;
    }

    // From field schema options
    const fieldSchema = objectSchema?.fields?.[statusField];
    if (fieldSchema?.options && Array.isArray(fieldSchema.options)) {
      return fieldSchema.options.map(opt => ({
        value: typeof opt === 'string' ? opt : opt.value,
        label: typeof opt === 'string' ? opt : (opt.label || opt.value),
      }));
    }

    // Default stages based on object type
    const objectKey = objectName?.toLowerCase();
    return DEFAULT_STAGES[objectKey] || [
      { value: 'New', label: 'New' },
      { value: 'In Progress', label: 'In Progress' },
      { value: 'Complete', label: 'Complete' },
    ];
  }, [config.stages, objectSchema, statusField, objectName]);

  const currentIndex = stages.findIndex(s => s.value === currentStatus);

  const handleStageClick = async (stage) => {
    if (onFieldSave && stage.value !== currentStatus) {
      try {
        await onFieldSave(statusField, stage.value);
      } catch (error) {
        console.error('Failed to update stage:', error);
      }
    }
  };

  const handleMarkComplete = () => {
    const nextStage = stages[currentIndex + 1];
    if (nextStage) {
      handleStageClick(nextStage);
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-sm overflow-hidden" data-testid="path-component">
      <div className="px-3 py-2">
        {/* Stages */}
        <div className="flex items-center min-w-0">
          {stages.map((stage, index) => {
            const isActive = stage.value === currentStatus;
            const isComplete = index < currentIndex;
            const isLast = index === stages.length - 1;

            return (
              <div key={stage.value} className="flex items-center flex-1 min-w-0">
                <button
                  onClick={() => handleStageClick(stage)}
                  className={`
                    flex-1 min-w-0 py-1.5 px-2 rounded text-xs font-medium transition-all
                    focus:outline-none focus:ring-2 focus:ring-white/50
                    ${isActive ? 'bg-white text-blue-700 shadow-sm' : ''}
                    ${isComplete ? 'bg-blue-500/50 text-white' : ''}
                    ${!isActive && !isComplete ? 'bg-transparent text-white/70 hover:bg-white/10 hover:text-white' : ''}
                  `}
                >
                  <div className="flex items-center justify-center gap-1 min-w-0">
                    {isComplete && <Check className="h-3 w-3 text-green-400 flex-shrink-0" />}
                    <span className="truncate">{stage.label}</span>
                  </div>
                </button>
                {!isLast && (
                  <div className={`w-2 h-0.5 flex-shrink-0 ${index < currentIndex ? 'bg-green-400' : 'bg-white/30'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Mark as Complete Button */}
        {currentIndex >= 0 && currentIndex < stages.length - 1 && (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 text-[10px] h-6 px-2"
              onClick={handleMarkComplete}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark Complete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PathComponent;
