/**
 * PathComponent - Runtime Path Component for Lightning Pages
 * Shows progress through stages based on a picklist field
 * Supports Mark Complete to advance to next stage
 */
import React, { useState, useMemo } from 'react';
import { CheckCircle, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { updateRecordField } from '../services/pathService';
import toast from 'react-hot-toast';

const PathComponent = ({
  config,
  record,
  objectName,
  onRecordUpdate,
  className = '',
}) => {
  const [updating, setUpdating] = useState(false);
  
  // Get configuration
  const picklistField = config?.picklistField;
  const stages = config?.stages || [];
  const format = config?.format || 'linear';
  const showMarkComplete = config?.showMarkCompleteButton !== false;
  
  // Get current value from record
  const recordData = record?.data || {};
  const currentValue = recordData[picklistField] || '';
  const currentIndex = stages.indexOf(currentValue);
  
  // Handle Mark Complete
  const handleMarkComplete = async () => {
    if (currentIndex >= stages.length - 1) {
      toast.error('Already at final stage');
      return;
    }
    
    const nextStage = stages[currentIndex + 1];
    setUpdating(true);
    
    try {
      const recordId = record.series_id || record.id;
      await updateRecordField(objectName, recordId, picklistField, nextStage);
      
      // Update local record state
      if (onRecordUpdate) {
        onRecordUpdate({
          ...record,
          data: {
            ...recordData,
            [picklistField]: nextStage,
          },
        });
      }
      
      toast.success(`Moved to ${nextStage}`);
    } catch (err) {
      console.error('Error updating stage:', err);
      toast.error(err.message || 'Failed to update stage');
    } finally {
      setUpdating(false);
    }
  };
  
  // Handle clicking on a stage (for non-linear mode)
  const handleStageClick = async (stage, stageIndex) => {
    if (format !== 'non-linear') return;
    if (stage === currentValue) return;
    
    setUpdating(true);
    
    try {
      const recordId = record.series_id || record.id;
      await updateRecordField(objectName, recordId, picklistField, stage);
      
      // Update local record state
      if (onRecordUpdate) {
        onRecordUpdate({
          ...record,
          data: {
            ...recordData,
            [picklistField]: stage,
          },
        });
      }
      
      toast.success(`Changed to ${stage}`);
    } catch (err) {
      console.error('Error updating stage:', err);
      toast.error(err.message || 'Failed to update stage');
    } finally {
      setUpdating(false);
    }
  };
  
  // No picklist field configured
  if (!picklistField) {
    return (
      <div className={`bg-amber-50 border border-amber-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <ChevronRight className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-700">Path</p>
            <p className="text-xs text-amber-600 truncate">
              Select a picklist field in the page builder to configure
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // No stages defined
  if (stages.length === 0) {
    return (
      <div className={`bg-slate-50 border border-slate-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600">Path</p>
            <p className="text-xs text-slate-500 truncate">
              No stages defined for {picklistField}
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // Render Linear Format - Compact vertical layout for sidebars
  const renderLinearPath = () => (
    <div className="space-y-1">
      {stages.map((stage, idx) => {
        const isComplete = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        
        return (
          <div
            key={stage}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
              isComplete ? 'bg-green-50' :
              isCurrent ? 'bg-blue-50' :
              'bg-slate-50'
            }`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
              isComplete ? 'bg-green-500 text-white' :
              isCurrent ? 'bg-blue-500 text-white' :
              'bg-slate-300 text-slate-500'
            }`}>
              {isComplete ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <span className="text-[10px] font-bold">{idx + 1}</span>
              )}
            </div>
            <span className={`text-xs font-medium truncate ${
              isComplete ? 'text-green-700' :
              isCurrent ? 'text-blue-700' :
              'text-slate-500'
            }`}>{stage}</span>
          </div>
        );
      })}
    </div>
  );
  
  // Render Non-Linear Format - Compact pill layout
  const renderNonLinearPath = () => (
    <div className="flex flex-wrap gap-1.5">
      {stages.map((stage, idx) => {
        const isComplete = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        
        return (
          <button
            key={stage}
            onClick={() => handleStageClick(stage, idx)}
            disabled={updating || isCurrent}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              isComplete 
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : isCurrent 
                  ? 'bg-blue-500 text-white cursor-default' 
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isComplete && <CheckCircle className="h-3 w-3 mr-1 inline" />}
            {stage}
          </button>
        );
      })}
    </div>
  );
  
  return (
    <div className={`bg-white border border-slate-200 rounded-lg overflow-hidden w-full ${className}`}>
      {/* Header */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Path</p>
      </div>
      
      {/* Path Stages */}
      <div className="p-3">
        {format === 'non-linear' ? renderNonLinearPath() : renderLinearPath()}
      </div>
      
      {/* Mark Complete Button */}
      {showMarkComplete && currentIndex < stages.length - 1 && (
        <div className="px-3 pb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkComplete}
            disabled={updating}
            className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
          >
            {updating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <CheckCircle className="h-3 w-3 mr-1.5" />
                Mark Complete
              </>
            )}
          </Button>
        </div>
      )}
      
      {/* Completed State */}
      {showMarkComplete && currentIndex === stages.length - 1 && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-center gap-1.5 text-green-600 text-xs bg-green-50 rounded-md py-2">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Completed</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PathComponent;
