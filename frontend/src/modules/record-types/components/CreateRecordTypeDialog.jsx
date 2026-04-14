import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import { Loader2, Type, ChevronDown, ChevronUp, Filter, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge } from '../../../components/ui/badge';
import PicklistValueFilter from './PicklistValueFilter';
import recordTypesService from '../services/recordTypesService';

const CreateRecordTypeDialog = ({ open, onOpenChange, onSave, editType, objectName }) => {
  const [typeName, setTypeName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [picklistValueFilters, setPicklistValueFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [objectFields, setObjectFields] = useState(null);
  const [loadingFields, setLoadingFields] = useState(false);
  const [showPicklistSection, setShowPicklistSection] = useState(false);

  // Get picklist fields from object
  const picklistFields = useMemo(() => {
    if (!objectFields?.fields) return [];
    // Handle both array and object formats for fields
    const fieldsArray = Array.isArray(objectFields.fields) 
      ? objectFields.fields 
      : Object.entries(objectFields.fields).map(([key, field]) => ({ ...field, key }));
    
    return fieldsArray.filter(f => 
      f.type === 'picklist' || f.type === 'multipicklist' || f.type === 'select'
    );
  }, [objectFields]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return Object.keys(picklistValueFilters).filter(k => 
      picklistValueFilters[k] && picklistValueFilters[k].length > 0
    ).length;
  }, [picklistValueFilters]);

  // Fetch object fields when dialog opens
  useEffect(() => {
    if (open && objectName) {
      setLoadingFields(true);
      recordTypesService.getObjectFields(objectName)
        .then(data => {
          setObjectFields(data);
        })
        .catch(err => {
          console.error('Failed to load object fields:', err);
        })
        .finally(() => {
          setLoadingFields(false);
        });
    }
  }, [open, objectName]);

  // Reset form when dialog opens/closes or editType changes
  useEffect(() => {
    if (editType) {
      setTypeName(editType.type_name || '');
      setDescription(editType.description || '');
      setIsActive(editType.is_active ?? true);
      setPicklistValueFilters(editType.picklist_value_filters || {});
      // Auto-expand if there are existing filters
      if (editType.picklist_value_filters && Object.keys(editType.picklist_value_filters).length > 0) {
        setShowPicklistSection(true);
      }
    } else {
      setTypeName('');
      setDescription('');
      setIsActive(true);
      setPicklistValueFilters({});
      setShowPicklistSection(false);
    }
  }, [editType, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!typeName.trim()) {
      toast.error('Record type name is required');
      return;
    }

    try {
      setLoading(true);
      await onSave({
        type_name: typeName.trim(),
        description: description.trim(),
        is_active: isActive,
        picklist_value_filters: picklistValueFilters
      });
      
      toast.success(editType ? 'Record type updated' : 'Record type created');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save record type');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="h-5 w-5 text-indigo-600" />
            {editType ? 'Edit Record Type' : 'Create Record Type'}
          </DialogTitle>
          <DialogDescription>
            {editType ? 'Update record type settings and picklist filters' : 'Create a new record type for this object'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic Info Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <Info className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Basic Information</span>
            </div>
            
            <div className="space-y-2">
              <Label>Record Type Name *</Label>
              <Input
                placeholder="e.g., Customer, Partner, Vendor"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                required
                data-testid="record-type-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe this record type..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                data-testid="record-type-description-input"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch 
                checked={isActive} 
                onCheckedChange={setIsActive} 
                data-testid="record-type-active-switch"
              />
              <Label>Active</Label>
            </div>
          </div>

          {/* Picklist Value Filters Section */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowPicklistSection(!showPicklistSection)}
              className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              data-testid="toggle-picklist-section"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Filter className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-medium text-slate-700 block">
                    Picklist Value Filters
                  </span>
                  <span className="text-xs text-slate-500">
                    {loadingFields 
                      ? 'Loading fields...' 
                      : picklistFields.length > 0 
                        ? `${picklistFields.length} picklist fields available`
                        : 'No picklist fields'
                    }
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px]">
                    {activeFilterCount} filtered
                  </Badge>
                )}
                {showPicklistSection ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </div>
            </button>
            
            {showPicklistSection && (
              <div className="pl-2 pr-2">
                {loadingFields ? (
                  <div className="flex items-center justify-center p-6 bg-slate-50 rounded-lg">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400 mr-2" />
                    <span className="text-sm text-slate-500">Loading picklist fields...</span>
                  </div>
                ) : (
                  <PicklistValueFilter
                    picklistFields={picklistFields}
                    filters={picklistValueFilters}
                    onChange={setPicklistValueFilters}
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="save-record-type-btn">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                editType ? 'Update' : 'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRecordTypeDialog;
