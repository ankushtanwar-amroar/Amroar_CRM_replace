/**
 * Configure Search Metadata Admin Page
 * Located at: Setup → Features → Configure Search
 * 
 * Allows administrators to:
 * - Enable/disable objects from global search
 * - Set object display priorities
 * - Configure which fields are searchable per object
 * - Set preview fields for search results
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';

// Icons
import {
  ArrowLeft,
  Search,
  Database,
  Settings,
  Eye,
  EyeOff,
  GripVertical,
  ChevronRight,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Info,
  Star,
  FileText,
  Hash,
  Users,
  Building2,
  DollarSign,
  CheckSquare,
  Calendar,
  Mail,
} from 'lucide-react';

// Services
import searchConfigService from '../services/searchConfigService';

// ============================================================================
// ICON MAPPING
// ============================================================================

const OBJECT_ICONS = {
  lead: Users,
  contact: Users,
  account: Building2,
  opportunity: DollarSign,
  task: CheckSquare,
  event: Calendar,
  emailmessage: Mail,
  default: Database,
};

const getObjectIcon = (objectName) => {
  return OBJECT_ICONS[objectName?.toLowerCase()] || OBJECT_ICONS.default;
};

// ============================================================================
// TAB 1: OBJECTS CONFIGURATION
// ============================================================================

const ObjectsTab = ({ objects, onRefresh, loading }) => {
  const [localObjects, setLocalObjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    setLocalObjects(objects);
  }, [objects]);

  const filteredObjects = localObjects.filter(obj =>
    obj.object_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    obj.object_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleSearchable = async (obj) => {
    setUpdating(obj.object_name);
    try {
      await searchConfigService.updateObjectSearchable(
        obj.object_name,
        !obj.is_searchable
      );
      
      setLocalObjects(prev =>
        prev.map(o =>
          o.object_name === obj.object_name
            ? { ...o, is_searchable: !o.is_searchable }
            : o
        )
      );
      
      toast.success(
        `${obj.object_label} ${!obj.is_searchable ? 'added to' : 'removed from'} search`
      );
    } catch (error) {
      console.error('Error updating object:', error);
      toast.error('Failed to update object searchability');
    } finally {
      setUpdating(null);
    }
  };

  const handlePriorityChange = async (obj, newPriority) => {
    try {
      await searchConfigService.updateObjectPriority(obj.object_name, parseInt(newPriority));
      
      setLocalObjects(prev =>
        prev.map(o =>
          o.object_name === obj.object_name
            ? { ...o, priority: parseInt(newPriority) }
            : o
        ).sort((a, b) => a.priority - b.priority)
      );
      
      toast.success(`${obj.object_label} priority updated`);
    } catch (error) {
      console.error('Error updating priority:', error);
      toast.error('Failed to update priority');
    }
  };

  const searchableCount = localObjects.filter(o => o.is_searchable).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Searchable Objects</h3>
          <p className="text-sm text-slate-500 mt-1">
            Enable or disable objects from appearing in global search results
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-green-100 text-green-700">
            {searchableCount} of {localObjects.length} enabled
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search objects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="object-search-input"
        />
      </div>

      {/* Objects List */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                <span className="ml-3 text-slate-600">Loading objects...</span>
              </div>
            ) : filteredObjects.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {searchQuery ? 'No objects match your search' : 'No objects found'}
              </div>
            ) : (
              filteredObjects.map((obj) => {
                const Icon = getObjectIcon(obj.object_name);
                return (
                  <div
                    key={obj.object_name}
                    className={`flex items-center justify-between px-4 py-4 hover:bg-slate-50 transition-colors ${
                      !obj.is_searchable ? 'opacity-60' : ''
                    }`}
                    data-testid={`object-row-${obj.object_name}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Drag Handle (visual only for now) */}
                      <GripVertical className="h-4 w-4 text-slate-300 cursor-grab" />
                      
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        obj.is_searchable ? 'bg-indigo-100' : 'bg-slate-100'
                      }`}>
                        <Icon className={`h-5 w-5 ${
                          obj.is_searchable ? 'text-indigo-600' : 'text-slate-400'
                        }`} />
                      </div>
                      
                      {/* Object Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">
                            {obj.object_label}
                          </span>
                          {obj.is_custom && (
                            <Badge variant="outline" className="text-xs">Custom</Badge>
                          )}
                          {obj.is_from_schema_builder && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              Schema Builder
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm text-slate-500 font-mono">
                          {obj.object_name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Priority Selector */}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-500">Priority:</Label>
                        <Select
                          value={String(obj.priority)}
                          onValueChange={(val) => handlePriorityChange(obj, val)}
                          disabled={!obj.is_searchable}
                        >
                          <SelectTrigger className="w-20 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => (
                              <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                            ))}
                            <SelectItem value="100">Default</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Toggle Switch */}
                      <div className="flex items-center gap-3">
                        <span className={`text-sm ${obj.is_searchable ? 'text-green-600' : 'text-slate-400'}`}>
                          {obj.is_searchable ? 'Searchable' : 'Not Searchable'}
                        </span>
                        <Switch
                          checked={obj.is_searchable}
                          onCheckedChange={() => handleToggleSearchable(obj)}
                          disabled={updating === obj.object_name}
                          data-testid={`toggle-${obj.object_name}`}
                        />
                        {updating === obj.object_name && (
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="flex items-start gap-3 pt-4">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">How Object Priority Works</p>
            <p className="text-sm text-blue-700 mt-1">
              Objects with lower priority numbers appear first in search results.
              For example, if Lead has priority 1 and Account has priority 3, 
              Lead results will appear before Account results.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================================================
// TAB 2: FIELDS CONFIGURATION
// ============================================================================

const FieldsTab = ({ objects, loading: objectsLoading }) => {
  const [selectedObject, setSelectedObject] = useState('');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (selectedObject) {
      loadFields(selectedObject);
    }
  }, [selectedObject]);

  const loadFields = async (objectName) => {
    setLoading(true);
    try {
      const data = await searchConfigService.getObjectFields(objectName);
      setFields(data.fields || []);
    } catch (error) {
      console.error('Error loading fields:', error);
      toast.error('Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSearchable = async (field) => {
    setUpdating(field.field_name);
    try {
      await searchConfigService.updateFieldConfig(selectedObject, field.field_name, {
        is_searchable: !field.is_searchable,
      });
      
      setFields(prev =>
        prev.map(f =>
          f.field_name === field.field_name
            ? { ...f, is_searchable: !f.is_searchable }
            : f
        )
      );
      
      toast.success(
        `${field.field_label} ${!field.is_searchable ? 'added to' : 'removed from'} search`
      );
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error('Failed to update field');
    } finally {
      setUpdating(null);
    }
  };

  const filteredFields = fields.filter(f =>
    f.field_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.field_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const searchableObjects = objects.filter(o => o.is_searchable);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-800">Searchable Fields</h3>
        <p className="text-sm text-slate-500 mt-1">
          Configure which fields are included in search for each object
        </p>
      </div>

      {/* Object Selector */}
      <div className="flex items-center gap-4">
        <Label className="text-sm font-medium">Select Object:</Label>
        <Select value={selectedObject} onValueChange={setSelectedObject}>
          <SelectTrigger className="w-64" data-testid="object-selector">
            <SelectValue placeholder="Choose an object..." />
          </SelectTrigger>
          <SelectContent>
            {searchableObjects.map(obj => (
              <SelectItem key={obj.object_name} value={obj.object_name}>
                {obj.object_label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedObject ? (
        <Card className="bg-slate-50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-slate-500">Select an object to configure its searchable fields</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="field-search-input"
            />
          </div>

          {/* Fields List */}
          <Card>
            <CardContent className="p-0">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 border-b text-xs font-semibold text-slate-600 uppercase">
                <div className="col-span-5">Field</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-4 text-center">Searchable</div>
              </div>

              <div className="divide-y divide-slate-100">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    <span className="ml-3 text-slate-600">Loading fields...</span>
                  </div>
                ) : filteredFields.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    {searchQuery ? 'No fields match your search' : 'No fields found'}
                  </div>
                ) : (
                  filteredFields.map((field) => (
                    <div
                      key={field.field_name}
                      className={`grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-slate-50 transition-colors ${
                        !field.is_searchable ? 'opacity-60' : ''
                      }`}
                      data-testid={`field-row-${field.field_name}`}
                    >
                      {/* Field Name */}
                      <div className="col-span-5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">
                            {field.field_label}
                          </span>
                          {field.is_default_searchable && !field.is_custom && (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                              Default
                            </Badge>
                          )}
                          {field.is_custom && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                              Custom
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-mono">
                          {field.field_name}
                        </span>
                      </div>

                      {/* Field Type */}
                      <div className="col-span-3">
                        <Badge variant="secondary" className="text-xs capitalize">
                          {field.field_type}
                        </Badge>
                      </div>

                      {/* Searchable Toggle */}
                      <div className="col-span-4 flex justify-center">
                        <Switch
                          checked={field.is_searchable}
                          onCheckedChange={() => handleToggleSearchable(field)}
                          disabled={updating === field.field_name}
                          data-testid={`toggle-field-${field.field_name}`}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Legend:</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <span><strong>Default:</strong> Standard fields automatically searchable based on field type (text, email, phone)</span>
                <span><strong>Custom:</strong> Custom fields created in Object Manager</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

// ============================================================================
// TAB 3: PREVIEW SETTINGS
// ============================================================================

const PreviewSettingsTab = () => {
  const [settings, setSettings] = useState({
    results_per_object: 5,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await searchConfigService.getPreviewSettings();
      setSettings({
        results_per_object: data.results_per_object || 5,
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await searchConfigService.updatePreviewSettings(settings.results_per_object);
      toast.success('Preview settings saved');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <span className="ml-3 text-slate-600">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-800">Search Preview Settings</h3>
        <p className="text-sm text-slate-500 mt-1">
          Configure how search results are displayed in the global search dropdown
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Results Limit
          </CardTitle>
          <CardDescription>
            Maximum number of results to show per object in the search dropdown
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label>Results per object:</Label>
            <Select
              value={String(settings.results_per_object)}
              onValueChange={(val) => setSettings(prev => ({ ...prev, results_per_object: parseInt(val) }))}
            >
              <SelectTrigger className="w-24" data-testid="results-per-object">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10, 15, 20].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-slate-500">
            Setting a lower number improves search speed. Higher numbers show more results but may slow down search.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} data-testid="save-preview-settings">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      {/* Preview Example */}
      <Card className="bg-slate-50 border-slate-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview Example
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="space-y-3">
              {/* Example result */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Users className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">
                      John <mark className="bg-amber-200 px-0.5 rounded">Smith</mark>
                    </span>
                    <Badge className="bg-orange-100 text-orange-700 text-xs">Lead</Badge>
                  </div>
                  <span className="text-sm text-slate-500">john.smith@example.com</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center">
                Shows up to {settings.results_per_object} results like this per object type
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const SearchMetadataAdminPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('objects');
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadObjects();
  }, []);

  const loadObjects = async () => {
    setLoading(true);
    try {
      const data = await searchConfigService.getAllObjects();
      setObjects(data.objects || []);
    } catch (error) {
      console.error('Error loading objects:', error);
      toast.error('Failed to load objects');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'objects', label: 'Objects', icon: Database },
    { id: 'fields', label: 'Fields', icon: FileText },
    { id: 'preview', label: 'Preview Settings', icon: Eye },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/setup')}
                className="text-slate-600"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Search className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Configure Search Metadata</h1>
                  <p className="text-sm text-slate-500">Customize global search behavior</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-t border-slate-100">
          <div className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-6xl mx-auto">
        {activeTab === 'objects' && (
          <ObjectsTab objects={objects} onRefresh={loadObjects} loading={loading} />
        )}
        {activeTab === 'fields' && (
          <FieldsTab objects={objects} loading={loading} />
        )}
        {activeTab === 'preview' && (
          <PreviewSettingsTab />
        )}
      </div>
    </div>
  );
};

export default SearchMetadataAdminPage;
