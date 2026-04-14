/**
 * Page Assignments Component
 * Admin UI for configuring Lightning Page assignments for New/Detail views
 * Located in: Object Settings → Pages → Assignments
 * 
 * IMPORTANT: New Page dropdown must ONLY show layouts with page_type="new"
 *            Detail Page dropdown must ONLY show layouts with page_type="detail"
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { FileText, Layout, RotateCcw, Save, Loader2, Info, Zap, AlertCircle, PlusCircle, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import pageAssignmentService from '../services/pageAssignmentService';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const PageAssignmentsPanel = ({ objectName, objectLabel }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Lightning pages for this object - ALL layouts
  const [allLightningPages, setAllLightningPages] = useState([]);
  
  // Record types for this object
  const [recordTypes, setRecordTypes] = useState([]);
  const [recordTypesEnabled, setRecordTypesEnabled] = useState(false);
  
  // Assignment state
  const [defaultNewPageId, setDefaultNewPageId] = useState('');
  const [defaultDetailPageId, setDefaultDetailPageId] = useState('');
  const [recordTypeOverrides, setRecordTypeOverrides] = useState([]);
  
  // Track if there are unsaved changes
  const [hasChanges, setHasChanges] = useState(false);

  // Filter layouts by page_type - CRITICAL for correct dropdown behavior
  const newPageLayouts = useMemo(() => {
    return allLightningPages.filter(page => page.page_type === 'new');
  }, [allLightningPages]);

  const detailPageLayouts = useMemo(() => {
    return allLightningPages.filter(page => page.page_type === 'detail');
  }, [allLightningPages]);

  useEffect(() => {
    if (objectName) {
      loadData();
    }
  }, [objectName]);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Load all data in parallel
      const [pagesResponse, assignmentsResponse, recordTypesResponse] = await Promise.all([
        // Fetch ALL layouts for this object (no page_type filter - we filter client-side)
        axios.get(`${API}/api/lightning/layouts/${objectName}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        pageAssignmentService.getAssignments(objectName),
        axios.get(`${API}/api/record-types-config/${objectName}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: [] }))
      ]);
      
      // Process Lightning pages - get all layouts
      const pages = pagesResponse.data?.layouts || pagesResponse.data?.all_layouts || 
                    (pagesResponse.data?.layout ? [pagesResponse.data.layout] : []);
      setAllLightningPages(pages);
      
      console.log('Loaded layouts:', pages.map(p => ({ id: p.id, name: p.layout_name, page_type: p.page_type })));
      
      // Process record types
      const rts = recordTypesResponse.data || [];
      setRecordTypes(rts.filter(rt => rt.is_active));
      setRecordTypesEnabled(rts.length > 0);
      
      // Process assignments
      if (assignmentsResponse.has_assignments) {
        setDefaultNewPageId(assignmentsResponse.default_new_page_id || '');
        setDefaultDetailPageId(assignmentsResponse.default_detail_page_id || '');
        
        // Merge existing overrides with any new record types that may have been created
        const existingOverrides = assignmentsResponse.record_type_overrides || [];
        const activeRecordTypes = rts.filter(rt => rt.is_active);
        
        // Build a complete list of overrides including new record types
        const mergedOverrides = activeRecordTypes.map(rt => {
          // Check if we already have an override for this record type
          const existingOverride = existingOverrides.find(o => o.record_type_id === rt.id);
          if (existingOverride) {
            return {
              ...existingOverride,
              record_type_name: rt.type_name // Update name in case it changed
            };
          }
          // Create a new empty override entry for this record type
          return {
            record_type_id: rt.id,
            record_type_name: rt.type_name,
            new_page_id: null,
            detail_page_id: null
          };
        });
        
        setRecordTypeOverrides(mergedOverrides);
      } else {
        // Auto-select defaults based on page_type
        const newPages = pages.filter(p => p.page_type === 'new');
        const detailPages = pages.filter(p => p.page_type === 'detail');
        
        if (newPages.length === 1) {
          setDefaultNewPageId(newPages[0].id);
        }
        if (detailPages.length === 1) {
          setDefaultDetailPageId(detailPages[0].id);
        }
        
        // Initialize empty overrides for each record type
        if (rts.length > 0) {
          setRecordTypeOverrides(rts.map(rt => ({
            record_type_id: rt.id,
            record_type_name: rt.type_name,
            new_page_id: null,
            detail_page_id: null
          })));
        }
      }
      
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading page assignments:', error);
      toast.error('Failed to load page assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await pageAssignmentService.saveAssignments(objectName, {
        default_new_page_id: defaultNewPageId || null,
        default_detail_page_id: defaultDetailPageId || null,
        record_type_overrides: recordTypeOverrides.map(o => ({
          record_type_id: o.record_type_id,
          new_page_id: o.new_page_id || null,
          detail_page_id: o.detail_page_id || null
        }))
      });
      
      toast.success('Page assignments saved successfully');
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving assignments:', error);
      toast.error('Failed to save page assignments');
    } finally {
      setSaving(false);
    }
  };

  const handleOverrideChange = (recordTypeId, field, value) => {
    setRecordTypeOverrides(prev => prev.map(o => 
      o.record_type_id === recordTypeId 
        ? { ...o, [field]: value === 'inherit' ? null : value }
        : o
    ));
    setHasChanges(true);
  };

  const handleResetOverride = (recordTypeId) => {
    setRecordTypeOverrides(prev => prev.map(o => 
      o.record_type_id === recordTypeId 
        ? { ...o, new_page_id: null, detail_page_id: null }
        : o
    ));
    setHasChanges(true);
  };

  const getPageName = (pageId, pageType = null) => {
    if (!pageId) return null;
    // Search in appropriate list based on pageType
    const searchList = pageType === 'new' ? newPageLayouts : 
                       pageType === 'detail' ? detailPageLayouts : 
                       allLightningPages;
    const page = searchList.find(p => p.id === pageId);
    return page?.layout_name || page?.name || 'Unknown Page';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
          <span className="text-slate-600">Loading page assignments...</span>
        </CardContent>
      </Card>
    );
  }

  // Check if we have any layouts at all
  const hasAnyLayouts = allLightningPages.length > 0;
  const hasNewLayouts = newPageLayouts.length > 0;
  const hasDetailLayouts = detailPageLayouts.length > 0;

  if (!hasAnyLayouts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layout className="h-5 w-5 text-blue-600" />
            Page Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No Lightning Pages Found</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md">
              Create Lightning Pages in the Lightning Builder first, then come back here to configure which pages are used for New and Detail views.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layout className="h-5 w-5 text-blue-600" />
              Page Assignments
            </CardTitle>
            <CardDescription className="mt-1">
              Choose which page opens by default for New and Detail. Add record-type rules if needed.
            </CardDescription>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={saving || !hasChanges}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Assignments
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Global Defaults Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
              Global Defaults
            </h3>
            <Badge variant="outline" className="text-xs">Required</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-lg border">
            {/* Default New Page */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-green-600" />
                Default New Page
                <Badge variant="outline" className="text-xs ml-1">
                  {newPageLayouts.length} available
                </Badge>
              </Label>
              <Select 
                value={defaultNewPageId || ''} 
                onValueChange={(v) => { setDefaultNewPageId(v); setHasChanges(true); }}
              >
                <SelectTrigger data-testid="default-new-page-select">
                  <SelectValue placeholder="Select a New Page layout..." />
                </SelectTrigger>
                <SelectContent>
                  {newPageLayouts.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-slate-500 text-center">
                      No New Page layouts found.<br/>
                      Create one with page_type = "new"
                    </div>
                  ) : (
                    newPageLayouts.map(page => (
                      <SelectItem key={page.id} value={page.id}>
                        <span className="flex items-center gap-2">
                          <PlusCircle className="h-3 w-3 text-green-600" />
                          {page.layout_name || page.name || 'Unnamed Page'}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Opens when user clicks &quot;New {objectLabel}&quot;
              </p>
            </div>
            
            {/* Default Detail Page */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-600" />
                Default Detail Page
                <Badge variant="outline" className="text-xs ml-1">
                  {detailPageLayouts.length} available
                </Badge>
              </Label>
              <Select 
                value={defaultDetailPageId || ''} 
                onValueChange={(v) => { setDefaultDetailPageId(v); setHasChanges(true); }}
              >
                <SelectTrigger data-testid="default-detail-page-select">
                  <SelectValue placeholder="Select a Detail Page layout..." />
                </SelectTrigger>
                <SelectContent>
                  {detailPageLayouts.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-slate-500 text-center">
                      No Detail Page layouts found.<br/>
                      Create one with page_type = "detail"
                    </div>
                  ) : (
                    detailPageLayouts.map(page => (
                      <SelectItem key={page.id} value={page.id}>
                        <span className="flex items-center gap-2">
                          <Eye className="h-3 w-3 text-blue-600" />
                          {page.layout_name || page.name || 'Unnamed Page'}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Opens when user views a {objectLabel} record
              </p>
            </div>
          </div>
        </div>
        
        {/* Record Type Overrides Section */}
        {recordTypesEnabled && (
          <>
            <Separator />
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                  Record Type Overrides
                </h3>
                <Badge variant="secondary" className="text-xs">Optional</Badge>
              </div>
              
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Override the default pages for specific record types. Leave empty to use the global defaults above.
                </p>
              </div>
              
              <div className="space-y-3">
                {recordTypes.map(rt => {
                  const override = recordTypeOverrides.find(o => o.record_type_id === rt.id) || {};
                  const hasOverride = override.new_page_id || override.detail_page_id;
                  
                  return (
                    <div 
                      key={rt.id} 
                      className={`p-4 border rounded-lg transition-colors ${
                        hasOverride ? 'bg-amber-50 border-amber-200' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Zap className={`h-4 w-4 ${hasOverride ? 'text-amber-600' : 'text-slate-400'}`} />
                          <span className="font-medium text-slate-900">{rt.type_name}</span>
                          {hasOverride && (
                            <Badge className="bg-amber-100 text-amber-700 text-xs">
                              Custom
                            </Badge>
                          )}
                        </div>
                        {hasOverride && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetOverride(rt.id)}
                            className="text-slate-500 hover:text-slate-700 h-8"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reset to Default
                          </Button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* New Page Override */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-slate-600 flex items-center gap-1">
                            <PlusCircle className="h-3 w-3 text-green-600" />
                            New Page
                          </Label>
                          <Select 
                            value={override.new_page_id || 'inherit'} 
                            onValueChange={(v) => handleOverrideChange(rt.id, 'new_page_id', v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">
                                <span className="text-slate-500">
                                  Use Default ({getPageName(defaultNewPageId, 'new') || 'Not Set'})
                                </span>
                              </SelectItem>
                              {newPageLayouts.map(page => (
                                <SelectItem key={page.id} value={page.id}>
                                  <span className="flex items-center gap-2">
                                    <PlusCircle className="h-3 w-3 text-green-600" />
                                    {page.layout_name || page.name || 'Unnamed Page'}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Detail Page Override */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-slate-600 flex items-center gap-1">
                            <Eye className="h-3 w-3 text-blue-600" />
                            Detail Page
                          </Label>
                          <Select 
                            value={override.detail_page_id || 'inherit'} 
                            onValueChange={(v) => handleOverrideChange(rt.id, 'detail_page_id', v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">
                                <span className="text-slate-500">
                                  Use Default ({getPageName(defaultDetailPageId, 'detail') || 'Not Set'})
                                </span>
                              </SelectItem>
                              {detailPageLayouts.map(page => (
                                <SelectItem key={page.id} value={page.id}>
                                  <span className="flex items-center gap-2">
                                    <Eye className="h-3 w-3 text-blue-600" />
                                    {page.layout_name || page.name || 'Unnamed Page'}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        
        {/* No Record Types Info */}
        {!recordTypesEnabled && (
          <>
            <Separator />
            <div className="flex items-start gap-2 p-3 bg-slate-50 border rounded-lg">
              <Info className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-slate-600">
                No record types configured for {objectLabel}. Create record types to enable per-type page overrides.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PageAssignmentsPanel;
