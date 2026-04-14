/**
 * DynamicRecordView - Enterprise-Grade Record Detail Page
 * 
 * This is the runtime record page shown when clicking any record in Sales Console.
 * It uses the Dynamic Record Page Engine for 100% metadata-driven rendering.
 * 
 * Architecture:
 * - Layout JSON from Lightning App Builder = Single Source of Truth
 * - LayoutRenderer iterates regions and mounts components dynamically
 * - No hardcoded layout logic
 * - Builder changes reflect immediately at runtime
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Loader, AlertCircle, RefreshCw, ArrowLeft, Loader2, UserCircle, Pencil, Check, X,
  Search, UserCircle2, Users2, Inbox, CheckCircle2
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Input } from '../../components/ui/input';

// Services
import lightningLayoutService from '../lightning_builder/services/lightningLayoutService';
import pageAssignmentService from '../../modules/page-assignments/services/pageAssignmentService';
import { resolveLayoutForContext, getRecordTypeIdFromRecord } from '../services/layoutResolutionService';

// Dynamic Layout Engine
import LayoutRenderer from '../engine/LayoutRenderer';

// Email Composer
import EmailComposer from '../../modules/email_templates/components/EmailComposer';

// Audit Trail
import { AuditTimeline } from '../../features/audit-trail';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Cache for user names
const userNameCache = {};

/**
 * Fetch user by ID with caching
 */
const fetchOwnerData = async (userId, token) => {
  if (!userId) return null;
  if (userNameCache[userId]) return userNameCache[userId];

  try {
    const response = await fetch(`${BACKEND_URL}/api/owners/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const owner = await response.json();
      const ownerData = {
        name: owner.name || 'Unknown User',
        firstName: owner.name ? owner.name.split(' ')[0] : '',
        lastName: owner.name ? owner.name.split(' ').slice(1).join(' ') : '',
        email: owner.secondary_info || '',
        type: owner.type || 'USER',
        avatarUrl: owner.avatar_url || null
      };
      userNameCache[userId] = ownerData;
      return ownerData;
    }
  } catch (error) {
    console.error('Error fetching user:', error);
  }
  return { name: 'Unknown User', firstName: '', lastName: '', email: '' };
};

/**
 * Owner Display Component - Compact inline display with Change Owner
 */
const OwnerDisplayHeader = ({ ownerId, objectApiName, recordId, onOwnerChange }) => {
  const navigate = useNavigate();
  const [ownerData, setOwnerData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showChangeOwner, setShowChangeOwner] = useState(false);
  const [owners, setOwners] = useState([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const [searchQuery, setSearchQuery] = useState('');

  // Set initial active tab when modal opens
  useEffect(() => {
    if (showChangeOwner && ownerData) {
      if (ownerData.type === 'GROUP') setActiveTab('groups');
      else if (ownerData.type === 'QUEUE') setActiveTab('queues');
      else setActiveTab('users');
      setSearchQuery(''); // Reset search
    }
  }, [showChangeOwner, ownerData]);

  useEffect(() => {
    const loadOwner = async () => {
      if (!ownerId) return;
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const data = await fetchOwnerData(ownerId, token);
      setOwnerData(data);
      setIsLoading(false);
    };
    loadOwner();
  }, [ownerId]);

  // Load owners when dialog opens
  useEffect(() => {
    const loadOwners = async () => {
      if (!showChangeOwner) return;
      setLoadingOwners(true);
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${BACKEND_URL}/api/owners`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        let fetchedOwners = Array.isArray(response.data) ? response.data : [];

        // Ensure the current owner is in the list so that the dropdown pre-fills correctly
        if (ownerId && !fetchedOwners.some(o => o.id === ownerId) && ownerData) {
          fetchedOwners.unshift({
            id: ownerId,
            name: ownerData.name,
            type: ownerData.type || 'USER',
            secondary_info: ownerData.email || ''
          });
        }

        setOwners(fetchedOwners);
      } catch (error) {
        console.error('Error loading owners:', error);
        toast.error('Failed to load owners');
      } finally {
        setLoadingOwners(false);
      }
    };
    loadOwners();
  }, [showChangeOwner]);

  if (!ownerId) return null;

  // Get owner label based on object type
  const getOwnerLabel = () => {
    const labels = {
      contact: 'Owner',
      account: 'Owner',
      lead: 'Owner',
      opportunity: 'Owner',
      deal: 'Owner',
      task: 'Assigned',
      event: 'Assigned',
    };
    return labels[objectApiName?.toLowerCase()] || 'Owner';
  };

  // Get initials for avatar
  const getInitials = () => {
    if (ownerData?.firstName && ownerData?.lastName) {
      return `${ownerData.firstName[0]}${ownerData.lastName[0]}`.toUpperCase();
    }
    if (ownerData?.name) {
      const parts = ownerData.name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return ownerData.name.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  const handleOwnerClick = () => {
    navigate(`/users/${ownerId}`);
  };

  const handleChangeOwner = async () => {
    if (!selectedOwnerId || selectedOwnerId === ownerId) {
      toast.error('Please select a different owner');
      return;
    }

    const targetOwner = owners.find(o => o.id === selectedOwnerId);
    if (!targetOwner) return;

    setIsChanging(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${BACKEND_URL}/api/objects/${objectApiName}/records/${recordId}`,
        {
          data: {},
          owner_id: targetOwner.id,
          owner_type: targetOwner.type
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`${getOwnerLabel()} changed successfully`);
      setShowChangeOwner(false);

      // Clear cache and trigger refresh
      delete userNameCache[ownerId];
      delete userNameCache[targetOwner.id];
      if (onOwnerChange) {
        onOwnerChange(targetOwner.id);
      }
    } catch (error) {
      console.error('Error changing owner:', error);
      let errorMsg = 'Failed to change owner';
      const detail = error.response?.data?.detail;
      if (detail) {
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail)) {
          errorMsg = detail.map(e => e.msg || e.message || 'Validation error').join(', ');
        } else if (typeof detail === 'object') {
          errorMsg = detail.message || JSON.stringify(detail);
        }
      }
      toast.error(errorMsg);
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-blue-200">
          {getOwnerLabel()}:
        </span>
        {isLoading ? (
          <span className="flex items-center gap-1 text-blue-100 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
          </span>
        ) : (
          <>
            <button
              onClick={handleOwnerClick}
              className="flex items-center gap-1.5 hover:bg-white/10 rounded-full px-1.5 py-0.5 transition-colors group"
              title={`View ${ownerData?.name || 'Owner'} Profile`}
              data-testid="owner-header-link"
            >
              {/* Avatar */}
              {ownerData?.avatarUrl ? (
                <img
                  src={ownerData.avatarUrl}
                  alt={ownerData?.name}
                  className="h-4 w-4 rounded-full object-cover border border-white/30"
                />
              ) : (
                <div className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center text-white text-[9px] font-medium border border-white/30">
                  {getInitials()}
                </div>
              )}
              {/* Name */}
              <span className="text-xs font-medium text-white group-hover:underline">
                {ownerData?.name || 'Unknown'}
              </span>
            </button>
            {/* Change Owner Pencil Icon */}
            <button
              onClick={() => {
                setSelectedOwnerId(ownerId);
                setShowChangeOwner(true);
              }}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Change Owner"
              data-testid="change-owner-button"
            >
              <Pencil className="h-3 w-3 text-blue-200 hover:text-white" />
            </button>
          </>
        )}
      </div>

      {/* Change Owner Dialog */}
      <Dialog open={showChangeOwner} onOpenChange={setShowChangeOwner}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Change {getOwnerLabel()}</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-3">
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="groups">Groups</TabsTrigger>
                <TabsTrigger value="queues">Queues</TabsTrigger>
              </TabsList>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-50 h-9"
                  autoFocus
                />
              </div>

              {['users', 'groups', 'queues'].map((tabType) => {
                const typeMap = { 'users': 'USER', 'groups': 'GROUP', 'queues': 'QUEUE' };
                const filteredList = owners.filter(o =>
                  o.type === typeMap[tabType] &&
                  o.name.toLowerCase().includes(searchQuery.toLowerCase())
                );

                return (
                  <TabsContent key={tabType} value={tabType} className="m-0 focus-visible:outline-none">
                    <ScrollArea className="h-[200px] border rounded-md">
                      {loadingOwners ? (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-500 bg-slate-50/50 h-full min-h-[190px]">
                          <Loader2 className="h-5 w-5 animate-spin mb-2" />
                          <p className="text-sm">Loading...</p>
                        </div>
                      ) : filteredList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-500 bg-slate-50/50 h-full min-h-[190px]">
                          <p className="text-sm">No results found.</p>
                        </div>
                      ) : (
                        <div className="p-1">
                          {filteredList.map(owner => (
                            <div
                              key={owner.id}
                              onClick={() => setSelectedOwnerId(owner.id)}
                              className={`flex items-center justify-between px-3 py-2 cursor-pointer rounded-sm hover:bg-slate-50 transition-colors ${selectedOwnerId === owner.id ? 'bg-indigo-50 border-l-2 border-indigo-600' : 'border-l-2 border-transparent'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${owner.type === 'USER' ? 'bg-blue-100 text-blue-700' :
                                    owner.type === 'GROUP' ? 'bg-indigo-100 text-indigo-700' :
                                      'bg-amber-100 text-amber-700'
                                  }`}>
                                  {owner.type === 'USER' ? <UserCircle2 className="h-3.5 w-3.5" /> :
                                    owner.type === 'GROUP' ? <Users2 className="h-3.5 w-3.5" /> :
                                      <Inbox className="h-3.5 w-3.5" />}
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className={`text-sm font-medium ${selectedOwnerId === owner.id ? 'text-indigo-900' : 'text-slate-900'}`}>
                                    {owner.name}
                                  </span>
                                  {owner.secondary_info && (
                                    <span className="text-xs text-slate-500 mt-0.5 max-w-[300px] truncate">
                                      {owner.secondary_info}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {selectedOwnerId === owner.id && (
                                <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
          <DialogFooter className="mt-2 text-right border-t pt-4">
            <DialogClose asChild>
              <Button variant="outline" disabled={isChanging} onClick={() => setSearchQuery('')}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleChangeOwner}
              disabled={isChanging || !selectedOwnerId || selectedOwnerId === ownerId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isChanging ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

/**
 * Record Header Component - Compact horizontal layout
 * Shows record name, object type, and Owner inline
 */
const RecordHeader = ({
  record,
  objectInfo,
  objectApiName,
  onRefresh,
  isRefreshing,
  onEmailClick,
  onOwnerChange,
}) => {
  const recordData = record?.data || {};
  const ownerId = record?.owner_id || record?.ownerId;
  const recordId = record?.id;

  const [showAuditModal, setShowAuditModal] = useState(false);
  
  // Get record name dynamically
  const getRecordName = () => {
    if (recordData.name) return recordData.name;
    if (recordData.first_name || recordData.last_name) {
      return `${recordData.first_name || ''} ${recordData.last_name || ''}`.trim();
    }
    if (recordData.subject) return recordData.subject;
    if (recordData.title) return recordData.title;
    return 'Record';
  };

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2.5 rounded-t-lg">
      <div className="flex items-center justify-between">
        {/* Left: Record info - horizontal compact layout */}
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h1 className="text-lg font-semibold truncate">{getRecordName()}</h1>
          <span className="text-blue-200 text-sm">•</span>
          <span className="text-blue-100 text-sm whitespace-nowrap">
            {objectInfo?.object_label || objectApiName}
          </span>
          {ownerId && (
            <>
              <span className="text-blue-200 text-sm">•</span>
              <OwnerDisplayHeader
                ownerId={ownerId}
                objectApiName={objectApiName}
                recordId={recordId}
                onOwnerChange={onOwnerChange}
              />
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 h-7 w-7 p-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Audit Log Modal */}
      <Dialog open={showAuditModal} onOpenChange={setShowAuditModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-600" />
              Audit Log - {getRecordName()}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto -mx-6 px-6">
            {showAuditModal && recordId && (
              <AuditTimeline
                objectName={objectApiName}
                recordId={recordId}
                recordLabel={getRecordName()}
                objectFields={getObjectFields()}
                showHeader={false}
                maxHeight="calc(80vh - 120px)"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/**
 * Status Path Component
 * Shows the record's progress through stages
 */
const StatusPath = ({ record, objectInfo, objectApiName, onStatusChange }) => {
  const recordData = record?.data || {};
  const statusField = objectInfo?.stage_field || 'status';
  const currentStatus = recordData[statusField] || '';

  // Get stages from schema or use defaults
  const getStages = () => {
    const fieldSchema = objectInfo?.fields?.[statusField];
    if (fieldSchema?.options) {
      return fieldSchema.options.map(opt => ({
        value: typeof opt === 'string' ? opt : opt.value,
        label: typeof opt === 'string' ? opt : (opt.label || opt.value),
      }));
    }

    // Defaults based on object type
    if (objectApiName === 'lead') {
      return [
        { value: 'New', label: 'New' },
        { value: 'Working', label: 'Working' },
        { value: 'Closed', label: 'Closed' },
        { value: 'Converted', label: 'Converted' },
      ];
    }

    return [];
  };

  const stages = getStages();
  const currentIndex = stages.findIndex(s => s.value === currentStatus);

  if (stages.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 mb-4 rounded-lg">
      <div className="flex items-center">
        {stages.map((stage, index) => {
          const isActive = stage.value === currentStatus;
          const isComplete = index < currentIndex;
          const isLast = index === stages.length - 1;

          return (
            <div key={stage.value} className="flex items-center flex-1">
              <button
                onClick={() => onStatusChange?.(statusField, stage.value)}
                className={`
                  flex-1 py-2 px-3 rounded text-sm font-medium transition-all
                  ${isActive ? 'bg-white text-blue-700 shadow' : ''}
                  ${isComplete ? 'bg-blue-400/50 text-white' : ''}
                  ${!isActive && !isComplete ? 'text-white/70 hover:bg-white/10' : ''}
                `}
              >
                <span className="truncate">{stage.label}</span>
              </button>
              {!isLast && <div className={`w-4 h-0.5 mx-1 ${index < currentIndex ? 'bg-green-400' : 'bg-white/30'}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Main DynamicRecordView Component
 * 
 * Props:
 * - objectApiName: Object API name (e.g., 'contact', 'lead')
 * - recordSeriesId: Record series ID
 * - tenantId: Tenant ID
 * - onOpenRelated: Callback when opening a related record
 * - initialData: Pre-loaded record data (for instant display from cache)
 * - initialSchema: Pre-loaded schema (for instant display from cache)
 * - initialLayout: Pre-loaded layout (for instant display from cache)
 * - onRecordUpdate: Callback when record is updated (for cache invalidation)
 */
const DynamicRecordView = ({
  objectApiName,
  recordSeriesId,
  tenantId,
  onOpenRelated,
  initialData = null,
  initialSchema = null,
  initialLayout = null,
  onRecordUpdate = null,
}) => {
  const navigate = useNavigate();

  // Core state - initialize with cached data if available
  const [record, setRecord] = useState(initialData);
  const [objectInfo, setObjectInfo] = useState(initialSchema);
  const [layout, setLayout] = useState(initialLayout);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track if using cached data (for skip loading behavior)
  const hasInitialData = !!(initialData && initialSchema);

  // UI state
  const [showEmailComposer, setShowEmailComposer] = useState(false);

  /**
   * Fetch record data
   */
  const fetchRecord = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${BACKEND_URL}/api/objects/${objectApiName}/records/${recordSeriesId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRecord(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching record:', err);
      throw err;
    }
  }, [objectApiName, recordSeriesId]);

  /**
   * Fetch object schema
   */
  const fetchObjectInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${BACKEND_URL}/api/objects/${objectApiName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setObjectInfo(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching object info:', err);
      throw err;
    }
  }, [objectApiName]);

  /**
   * Fetch layout configuration using CENTRALIZED resolution service
   * This ensures consistent resolution logic across all components
   */
  const fetchLayout = useCallback(async (recordTypeId = null) => {
    try {
      const token = localStorage.getItem('token');

      console.log(`[DynamicRecordView] Resolving layout for ${objectApiName} (recordType: ${recordTypeId || 'none'})`);

      // Use centralized layout resolution service
      const result = await resolveLayoutForContext(
        objectApiName,
        'detail',
        recordTypeId,
        token
      );

      if (result?.layout) {
        setLayout(result.layout);
        console.log(`[DynamicRecordView] Layout loaded: ${result.layout.layout_name} (source: ${result.source})`);
      } else {
        // Set minimal layout for fallback rendering
        setLayout({ placed_components: {} });
        console.log(`[DynamicRecordView] No layout found, using empty fallback`);
      }
    } catch (err) {
      console.error('Error fetching layout:', err);
      setLayout({ placed_components: {} });
    }
  }, [objectApiName]);

  /**
   * Load all data
   */
  const loadData = useCallback(async (forceRefresh = false) => {
    // Skip loading if we have initial data from cache (unless forcing refresh)
    if (hasInitialData && !forceRefresh) {
      console.log('[DynamicRecordView] Using cached data, skipping API calls');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [recordData] = await Promise.all([
        fetchRecord(),
        fetchObjectInfo(),
      ]);

      // Fetch layout based on record type (using utility to extract from record)
      const recordTypeId = getRecordTypeIdFromRecord(recordData);
      await fetchLayout(recordTypeId);

      // Notify parent of fresh data (for cache update)
      if (onRecordUpdate && recordData) {
        onRecordUpdate(recordData);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load record');
      toast.error('Failed to load record');
    } finally {
      setLoading(false);
    }
  }, [fetchRecord, fetchObjectInfo, fetchLayout, hasInitialData, onRecordUpdate]);

  // Initial load
  useEffect(() => {
    if (objectApiName && recordSeriesId) {
      loadData();
    }
  }, [objectApiName, recordSeriesId, loadData]);

  /**
   * Refresh data
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData(true);  // Force refresh to bypass cache
    setIsRefreshing(false);
    toast.success('Record refreshed');
  };

  /**
   * Handle record update (from inline editing)
   */
  const handleRecordUpdate = (updatedRecord) => {
    setRecord(updatedRecord);
  };

  /**
   * Handle field save (for status path)
   */
  const handleFieldSave = async (fieldKey, value) => {
    try {
      const token = localStorage.getItem('token');
      const updatedData = { ...record.data, [fieldKey]: value };

      await axios.put(
        `${BACKEND_URL}/api/objects/${objectApiName}/records/${recordSeriesId}`,
        { data: updatedData },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setRecord(prev => ({ ...prev, data: updatedData }));
      toast.success('Status updated');
    } catch (err) {
      console.error('Error updating field:', err);
      toast.error('Failed to update');
    }
  };

  // Build context for components
  const componentContext = {
    record,
    recordId: record?.id || record?.series_id,
    recordData: record?.data || {},
    objectName: objectApiName,
    objectSchema: objectInfo,
    objectFields: objectInfo?.fields || {},
    layout,
    onRecordUpdate: handleRecordUpdate,
    onFieldSave: handleFieldSave,
    onOpenRelated,
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-slate-600">Loading record...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-800">Failed to load record</p>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadData}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border" data-testid="dynamic-record-view">
      {/* Record Header */}
      <RecordHeader
        record={record}
        objectInfo={objectInfo}
        objectApiName={objectApiName}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onEmailClick={() => setShowEmailComposer(true)}
        onOwnerChange={handleRefresh}
      />

      {/* Dynamic Layout Renderer - Renders all components from layout including Path */}
      <LayoutRenderer
        layout={layout}
        context={componentContext}
      />

      {/* Email Composer Modal */}
      {showEmailComposer && (
        <EmailComposer
          isOpen={showEmailComposer}
          onClose={() => setShowEmailComposer(false)}
          recipientEmail={record?.data?.email}
          recipientName={record?.data?.name || `${record?.data?.first_name || ''} ${record?.data?.last_name || ''}`.trim()}
          relatedToId={record?.id || record?.series_id}
          relatedToType={objectApiName}
        />
      )}
    </div>
  );
};

export default DynamicRecordView;
