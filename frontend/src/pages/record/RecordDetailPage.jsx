/**
 * RecordDetailPage - Fully Dynamic, Layout-Driven Record Detail View
 * 
 * ARCHITECTURE:
 * Layout JSON = Single Source of Truth
 * 
 * The page structure is 100% determined by the Lightning App Builder configuration.
 * No static JSX, no hardcoded sidebars, no fixed placement.
 * 
 * Flow:
 * 1. Fetch layout from Lightning API (resolve for object + record type)
 * 2. Fetch record data
 * 3. Render components dynamically based on placed_components in layout
 * 
 * placed_components structure:
 * - header: Components in header region (e.g., Path)
 * - left: Components in left sidebar (e.g., Activities, Record Detail)
 * - main: Components in main content area
 * - right: Components in right sidebar (e.g., Related Lists)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { cn } from '../../lib/utils';

// Icons
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertCircle,
  Share2,
  History,
} from 'lucide-react';

// Dialog for Audit Log Modal
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

// Audit Trail
import { AuditTimeline } from '../../features/audit-trail';

// Sharing Panel
import RecordSharingPanel from '../../components/sharing/RecordSharingPanel';

// Inline Owner Field
import InlineOwnerField from '../../components/fields/InlineOwnerField';

// Component Renderer Engine
import {
  renderRegion,
  regionHasComponents,
  getLayoutGridConfig,
} from '../../components/record/engine/ComponentRenderer';

// Services
import pageAssignmentService from '../../modules/page-assignments/services/pageAssignmentService';
import lightningLayoutService from '../../crm_platform/lightning_builder/services/lightningLayoutService';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Record Header Component - Simple, non-hardcoded header
 */
const RecordHeader = ({
  record,
  objectSchema,
  objectName,
  recordType,
  onBack,
  onRefresh,
  isRefreshing,
  onShare,
  onOwnerChange,
  onAuditLog,
}) => {
  // Get record name dynamically
  const getRecordName = () => {
    if (!record || !objectSchema) return 'Loading...';
    const nameField = objectSchema.name_field || 'name';
    const data = record.data || {};
    
    if (data[nameField]) return data[nameField];
    if (data.name) return data.name;
    if (data.first_name || data.last_name) {
      return `${data.first_name || ''} ${data.last_name || ''}`.trim();
    }
    if (data.subject) return data.subject;
    if (data.title) return data.title;
    
    return 'Record';
  };

  // Get owner info from record
  const getOwnerInfo = () => {
    if (!record) return { id: null, name: null };
    const data = record.data || {};
    
    // Check various owner field names
    const ownerId = data.owner_id || data.owner || data.assigned_to || record.owner_id;
    const ownerName = data.owner_name || data.owner_display_name || null;
    
    return { id: ownerId, name: ownerName };
  };

  const ownerInfo = getOwnerInfo();

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10" data-testid="record-header">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Back and Record Info */}
          <div className="flex items-center gap-4 min-w-0">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onBack}
              className="text-slate-600 hover:text-slate-900"
              data-testid="back-button"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 truncate" data-testid="record-name">
                {getRecordName()}
              </h1>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>{objectSchema?.object_label || 'Record'}</span>
                {recordType && (
                  <>
                    <span className="text-slate-300">•</span>
                    <Badge variant="outline" className="text-xs">
                      {recordType.name}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center: Owner Field with Inline Edit */}
          <div className={cn(
            "flex items-center gap-2 px-4 py-1.5 bg-slate-50 rounded-lg border border-slate-200",
            (!ownerInfo.id || !record?.id) && "hidden"
          )}>
            <span className="text-xs text-slate-500 font-medium">Owner:</span>
            <InlineOwnerField
              ownerId={ownerInfo.id || ''}
              ownerName={ownerInfo.name}
              objectName={objectName}
              recordId={record?.id || ''}
              onOwnerChange={onOwnerChange}
              isEditable={true}
            />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onAuditLog}
              className="gap-1"
              data-testid="audit-log-button"
              title="View Audit Log"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
              className="gap-1"
              data-testid="share-button"
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="gap-1"
              data-testid="refresh-button"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

/**
 * Main RecordDetailPage Component
 */
const RecordDetailPage = () => {
  const { objectName, recordId } = useParams();
  const navigate = useNavigate();
  
  // Core state
  const [record, setRecord] = useState(null);
  const [objectSchema, setObjectSchema] = useState(null);
  const [layout, setLayout] = useState(null);
  const [recordType, setRecordType] = useState(null);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  // Sharing panel state
  const [showSharingPanel, setShowSharingPanel] = useState(false);
  
  // Audit log modal state
  const [showAuditLogModal, setShowAuditLogModal] = useState(false);

  /**
   * Fetch record data and resolve the appropriate layout
   */
  const fetchRecordAndLayout = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      // Step 1: Fetch the record
      console.log(`[RecordDetail] Fetching record: ${objectName}/${recordId}`);
      const recordResponse = await axios.get(
        `${API}/objects/${objectName}/records/${recordId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRecord(recordResponse.data);
      
      // Step 2: Extract record_type_id for layout resolution
      const recordTypeId = recordResponse.data?.data?.record_type_id || 
                          recordResponse.data?.record_type_id;
      
      // Fetch record type info if exists
      if (recordTypeId) {
        try {
          const rtResponse = await axios.get(
            `${API}/record-type-config-by-id/${recordTypeId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setRecordType(rtResponse.data);
        } catch (err) {
          console.warn('[RecordDetail] Could not fetch record type:', err);
        }
      }
      
      // Step 3: Resolve layout based on page assignments (supports record type overrides)
      console.log(`[RecordDetail] Resolving layout for ${objectName}, type: detail, recordTypeId: ${recordTypeId}`);
      
      const pageAssignment = await pageAssignmentService.resolvePageForContext(
        objectName, 
        'detail', 
        recordTypeId
      );
      
      if (pageAssignment.page_id) {
        console.log(`[RecordDetail] Found page assignment: ${pageAssignment.page_id} (source: ${pageAssignment.resolution_source})`);
        const layoutResponse = await lightningLayoutService.getLayoutById(
          objectName, 
          pageAssignment.page_id, 
          token
        );
        if (layoutResponse.layout) {
          console.log(`[RecordDetail] Layout loaded: ${layoutResponse.layout.layout_name}`);
          console.log(`[RecordDetail] Placed components:`, layoutResponse.layout.placed_components);
          setLayout(layoutResponse.layout);
          return;
        }
      }
      
      // Fallback: Use lightning resolve
      console.log('[RecordDetail] Using fallback layout resolution');
      const resolveResult = await lightningLayoutService.resolveLayout(objectName, 'detail', token);
      if (resolveResult.layout) {
        console.log(`[RecordDetail] Fallback layout: ${resolveResult.layout.layout_name}`);
        setLayout(resolveResult.layout);
      } else {
        // No layout found - set empty
        console.warn('[RecordDetail] No layout found for this object');
        setLayout({ placed_components: {} });
      }
      
    } catch (err) {
      console.error('[RecordDetail] Error fetching record:', err);
      setError(err.response?.data?.detail || 'Failed to load record');
      toast.error('Failed to load record details');
    } finally {
      setLoading(false);
    }
  }, [objectName, recordId]);

  /**
   * Fetch object schema
   */
  const fetchObjectSchema = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/objects/${objectName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setObjectSchema(response.data);
    } catch (err) {
      console.error('[RecordDetail] Error fetching object schema:', err);
    }
  }, [objectName]);

  // Initial data fetch
  useEffect(() => {
    if (objectName && recordId) {
      fetchRecordAndLayout();
      fetchObjectSchema();
    }
  }, [objectName, recordId, fetchRecordAndLayout, fetchObjectSchema]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRecordAndLayout();
    setIsRefreshing(false);
    toast.success('Record refreshed');
  };

  // Handle record update (from inline editing)
  const handleRecordUpdate = (updatedRecord) => {
    setRecord(updatedRecord);
  };

  // Handle field save (for inline editing and status updates)
  const handleFieldSave = useCallback(async (fieldKey, value) => {
    if (!record) {
      toast.error('No record to update');
      return;
    }
    
    const recordIdToUpdate = record.series_id || record.id;
    
    try {
      const token = localStorage.getItem('token');
      
      // Build the update payload
      const updateData = {
        [fieldKey]: value
      };
      
      console.log(`[RecordDetail] Updating field ${fieldKey} to:`, value);
      console.log(`[RecordDetail] Record ID:`, recordIdToUpdate);
      
      const response = await axios.put(
        `${API}/objects/${objectName}/records/${recordIdToUpdate}`,
        { data: updateData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state with the response
      if (response.data) {
        const updatedRecord = response.data;
        setRecord(updatedRecord);
        toast.success('Record updated');
        console.log('[RecordDetail] Record updated successfully:', updatedRecord);
      }
      
      return response.data;
    } catch (err) {
      console.error('[RecordDetail] Error updating field:', err);
      const errorMessage = err.response?.data?.detail || 'Failed to update';
      toast.error(errorMessage);
      throw err;
    }
  }, [record, objectName]);

  // Handle back navigation
  const handleBack = () => {
    navigate(-1);
  };

  // Extract placed_components from layout
  const placedComponents = layout?.placed_components || {};
  const templateType = layout?.template_type || layout?.selected_layout || 'three_column_header';
  
  // Check which regions have components
  const hasHeader = regionHasComponents(placedComponents, 'header');
  const hasLeft = regionHasComponents(placedComponents, 'left');
  const hasMain = regionHasComponents(placedComponents, 'main');
  const hasRight = regionHasComponents(placedComponents, 'right');
  
  // Build context object passed to all components
  const componentContext = {
    record,
    objectName,
    objectSchema,
    layout,
    onRecordUpdate: handleRecordUpdate,
    onFieldSave: handleFieldSave,
  };

  // Get record name for sharing panel - must be before early returns
  const getRecordName = useCallback(() => {
    if (!record || !objectSchema) return 'this record';
    const nameField = objectSchema.name_field || 'name';
    const data = record.data || {};
    
    if (data[nameField]) return data[nameField];
    if (data.name) return data.name;
    if (data.first_name || data.last_name) {
      return `${data.first_name || ''} ${data.last_name || ''}`.trim();
    }
    if (data.subject) return data.subject;
    if (data.title) return data.title;
    
    return 'this record';
  }, [record, objectSchema]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-slate-600">Loading record...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-800">Failed to load record</p>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // No layout configuration
  if (!layout || Object.keys(placedComponents).length === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <RecordHeader
          record={record}
          objectSchema={objectSchema}
          objectName={objectName}
          recordType={recordType}
          onBack={handleBack}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onShare={() => setShowSharingPanel(true)}
          onAuditLog={() => setShowAuditLogModal(true)}
          onOwnerChange={(newOwnerId, newOwnerName) => {
            // Refresh the record to show updated owner
            handleRefresh();
          }}
        />
        <RecordSharingPanel
          isOpen={showSharingPanel}
          onClose={() => setShowSharingPanel(false)}
          objectName={objectName}
          recordId={recordId}
          recordName="this record"
        />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-800">No Layout Configured</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              This record doesn't have a Lightning Page layout configured.
              <br />
              Create one in the Lightning App Builder.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate grid columns based on which regions have content
  const getGridClass = () => {
    const hasLeftContent = hasLeft;
    const hasRightContent = hasRight;
    const hasMainContent = hasMain;
    
    if (hasLeftContent && hasMainContent && hasRightContent) {
      return 'lg:grid-cols-[280px_1fr_300px]';
    } else if (hasLeftContent && hasMainContent) {
      return 'lg:grid-cols-[280px_1fr]';
    } else if (hasMainContent && hasRightContent) {
      return 'lg:grid-cols-[1fr_300px]';
    } else if (hasLeftContent && hasRightContent) {
      return 'lg:grid-cols-[280px_1fr_300px]';
    } else {
      return 'grid-cols-1';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="record-detail-page">
      {/* Record Header */}
      <RecordHeader
        record={record}
        objectSchema={objectSchema}
        objectName={objectName}
        recordType={recordType}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onShare={() => setShowSharingPanel(true)}
        onAuditLog={() => setShowAuditLogModal(true)}
        onOwnerChange={(newOwnerId, newOwnerName) => {
          // Refresh the record to show updated owner
          handleRefresh();
        }}
      />

      {/* Sharing Panel */}
      <RecordSharingPanel
        isOpen={showSharingPanel}
        onClose={() => setShowSharingPanel(false)}
        objectName={objectName}
        recordId={recordId}
        recordName={getRecordName()}
      />

      {/* Audit Log Modal */}
      <Dialog open={showAuditLogModal} onOpenChange={setShowAuditLogModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-600" />
              Audit Log - {getRecordName()}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto -mx-6 px-6">
            {showAuditLogModal && record && (
              <AuditTimeline
                objectName={objectName}
                recordId={record.id}
                recordLabel={getRecordName()}
                objectFields={objectSchema?.fields ? (
                  Array.isArray(objectSchema.fields) 
                    ? objectSchema.fields.map(f => ({
                        key: f.field_name || f.api_name || f.name,
                        label: f.label || f.field_label || f.field_name
                      }))
                    : Object.entries(objectSchema.fields).map(([key, f]) => ({
                        key: f?.field_name || f?.api_name || key,
                        label: f?.label || f?.field_label || key
                      }))
                ) : []}
                showHeader={false}
                maxHeight="calc(80vh - 120px)"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Content Area */}
      <div className="p-4 lg:p-6">
        {/* Header Region (Full Width) */}
        {hasHeader && (
          <div className="mb-4" data-testid="region-header">
            {renderRegion(placedComponents.header, componentContext)}
          </div>
        )}

        {/* Body Regions (Grid Layout) */}
        <div className={`grid gap-4 lg:gap-6 ${getGridClass()}`}>
          {/* Left Region */}
          {hasLeft && (
            <div className="space-y-4" data-testid="region-left">
              {renderRegion(placedComponents.left, componentContext)}
            </div>
          )}

          {/* Main/Center Region */}
          {hasMain && (
            <div className="space-y-4" data-testid="region-main">
              {renderRegion(placedComponents.main, componentContext)}
            </div>
          )}

          {/* Right Region */}
          {hasRight && (
            <div className="space-y-4 lg:sticky lg:top-20 lg:self-start" data-testid="region-right">
              {renderRegion(placedComponents.right, componentContext)}
            </div>
          )}
          
          {/* Fallback if only left exists (no main) */}
          {hasLeft && !hasMain && !hasRight && (
            <div className="col-span-full">
              {/* Left content takes full width */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordDetailPage;
