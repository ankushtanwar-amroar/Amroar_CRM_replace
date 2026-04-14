/**
 * ScreenFlowRunnerModal - Wraps EmbeddableScreenFlowRunner in a modal dialog
 * 
 * This component provides a modal interface for running Screen Flows from
 * record detail pages. It uses the true metadata-driven Screen Flow engine
 * (EmbeddableScreenFlowRunner) for dynamic flow rendering.
 * 
 * Features:
 * - Dynamic flow rendering from DB configuration
 * - Auto-injection of recordId and objectType context
 * - Proper modal handling with close on complete/cancel
 */

import React from 'react';
import { Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

// Import the proper embeddable flow runner
import EmbeddableScreenFlowRunner from '../../pages/FlowBuilder/EmbeddableScreenFlowRunner';

/**
 * ScreenFlowRunnerModal - Main export
 * 
 * Props:
 * - flowId: ID of the flow to run
 * - recordId: ID of the current record (for record_detail flows)
 * - objectType: Object type of the current record
 * - onClose: Callback when modal is closed
 * - onComplete: Callback when flow completes successfully
 */
const ScreenFlowRunnerModal = ({ 
  flowId, 
  recordId, 
  objectType, 
  onClose, 
  onComplete 
}) => {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="screen-flow-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" />
            Run Flow
          </DialogTitle>
        </DialogHeader>
        
        {/* Use EmbeddableScreenFlowRunner instead of custom embedded runner */}
        <EmbeddableScreenFlowRunner
          flowId={flowId}
          recordId={recordId}
          objectType={objectType}
          onComplete={onComplete}
          onClose={onClose}
          showHeader={true}
        />
      </DialogContent>
    </Dialog>
  );
};

export default ScreenFlowRunnerModal;
