/**
 * SetupPage - CRM Setup and Configuration
 * Extracted from App.js for better maintainability
 * 
 * Updated for System Permissions:
 * - Uses useSystemPermissions hook to check access
 * - Sections are shown/hidden based on user permissions
 * - Super Admin sees all sections
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Separator } from '../../components/ui/separator';

// Hooks
import useSystemPermissions from '../../hooks/useSystemPermissions';
import { MODULE_STATES, ALL_MODULES } from '../../hooks/useModuleEntitlements';
import { useModuleEntitlementsContext } from '../../context/ModuleContext';

// Module Badge Component
import { ModuleBadge, UpgradePrompt } from '../../components/ModuleBadge';

// Icons
import {
  ArrowLeft,
  LogOut,
  Wrench,
  Search,
  Database,
  Users,
  Shield,
  Network,
  Share2,
  FileText,
  ClipboardList,
  Zap,
  MessageSquare,
  Mail,
  Calendar as CalendarIcon,
  Settings,
  X,
  Layout,
  Info,
  ChevronRight,
  ChevronDown,
  Plus,
  Loader,
  Clock,
  Edit,
  Trash2,
  CheckCircle,
  Upload,
  Download,
  FolderOpen,
  Sparkles,
  Layers,
  CreditCard,
  Key,
  Package,
  Lock,
  ArrowUpRight,
  Building2,
  Bot,
} from 'lucide-react';

// Auth hook and components from App.js
import { useAuth } from '../../App';

// Object Management Components
import { ManageObjectsTab, AddCustomFieldDialog, EditCustomFieldDialog } from '../../components/objects';

// External components
import RecordTypeManager from '../../components/RecordTypeManager';
import { AdvancedFieldManager } from '../../crm_platform/field_management';

// Setup Dashboard Components
import SetupDashboard from './components/SetupDashboard';
import DocFlowSetupDashboard from './components/DocFlowSetupDashboard';

// Company Information (rendered inline in Setup content area)
import CompanyInfoPage from './CompanyInfoPage';

// ClueBot Configuration (rendered inline in Setup content area)
import ClueBotConfigPage from './ClueBotConfigPage';

// Connections (rendered inline in Setup content area)
import ConnectionsPage from './connections/ConnectionsPage';

// Features Content Component (inline to avoid circular dependencies)
import { Search as SearchIcon, Bell, ArrowRight, Settings as SettingsIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * ModuleMenuButton Component
 * Renders a module menu item with state badge support
 * Shows all modules - locks/badges indicate access state
 */
const ModuleMenuButton = ({ 
  moduleCode, 
  icon: Icon, 
  label, 
  path, 
  getModuleState, 
  isModuleAccessible, 
  navigate, 
  location, 
  setUpgradePromptModule,
  testId,
  hideIfNotActive = false,
  className = ''
}) => {
  const { state, reason } = getModuleState(moduleCode);
  const isAccessible = isModuleAccessible(moduleCode);
  const isActive = location.pathname.includes(path);
  const isLocked = state === MODULE_STATES.PLAN_LOCKED;
  const isDisabled = state === MODULE_STATES.ADMIN_DISABLED;
  const needsLicense = state === MODULE_STATES.LICENSE_REQUIRED;

  // For DocFlow-only tenants: completely hide non-ACTIVE modules
  if (hideIfNotActive && state !== MODULE_STATES.ACTIVE) {
    return null;
  }

  const handleClick = () => {
    if (isAccessible) {
      navigate(path);
    } else if (isLocked) {
      setUpgradePromptModule({ code: moduleCode, name: label, reason });
    }
    // Disabled modules don't navigate
  };

  // Get badge styling based on state
  const getBadgeContent = () => {
    if (isLocked) {
      return (
        <span className="ml-auto flex items-center text-xs text-amber-600" title="Not included in your plan">
          <Lock className="h-3.5 w-3.5" />
        </span>
      );
    }
    if (isDisabled) {
      return (
        <span className="ml-auto text-xs text-slate-400">
          Disabled
        </span>
      );
    }
    if (needsLicense) {
      return (
        <span className="ml-auto text-xs text-purple-600">
          License
        </span>
      );
    }
    return null;
  };

  return (
    <Button
      variant={isActive ? 'secondary' : 'ghost'}
      className={`w-full justify-start h-9 font-medium ${
        isActive ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600' : ''
      } ${
        isAccessible ? 'text-slate-700 hover:bg-slate-50' : ''
      } ${
        isLocked ? 'text-slate-500 hover:bg-amber-50/50' : ''
      } ${
        isDisabled ? 'text-slate-400 cursor-not-allowed opacity-60' : ''
      } ${
        needsLicense ? 'text-slate-500 cursor-default opacity-75' : ''
      } ${className}`}
      onClick={handleClick}
      disabled={isDisabled}
      data-testid={testId}
      title={!isAccessible ? reason : undefined}
    >
      <Icon className="h-4 w-4 mr-2" />
      <span className="flex-1 text-left">{label}</span>
      {getBadgeContent()}
    </Button>
  );
};

/**
 * Helper function to get icon for object type
 */
const getObjectIcon = (objectName) => {
  const name = objectName.toLowerCase();
  if (name.includes('lead')) return '👤';
  if (name.includes('contact')) return '📇';
  if (name.includes('account')) return '🏢';
  if (name.includes('opportunity')) return '💰';
  if (name.includes('task')) return '✅';
  if (name.includes('event')) return '📅';
  if (name.includes('case')) return '📋';
  if (name.includes('invoice')) return '📄';
  return '📦';
};

/**
 * Helper function to get color for object type
 */
const getObjectColor = (objectName) => {
  const name = objectName.toLowerCase();
  if (name.includes('lead')) return 'from-orange-400 to-orange-500';
  if (name.includes('contact')) return 'from-purple-400 to-purple-500';
  if (name.includes('account')) return 'from-blue-400 to-blue-500';
  if (name.includes('opportunity')) return 'from-yellow-400 to-yellow-500';
  if (name.includes('task')) return 'from-green-400 to-green-500';
  if (name.includes('event')) return 'from-red-400 to-red-500';
  if (name.includes('case')) return 'from-pink-400 to-pink-500';
  if (name.includes('invoice')) return 'from-teal-400 to-teal-500';
  return 'from-slate-400 to-slate-500';
};

/**
 * Record Layout Section Component - Salesforce Style
 */
const RecordLayoutSection = ({ objects }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredObject, setHoveredObject] = useState(null);

  // Filter objects based on search
  const filteredObjects = objects.filter(obj => {
    const searchLower = searchQuery.toLowerCase();
    const objName = (obj.object_label || obj.object_name || '').toLowerCase();
    const objPlural = (obj.object_plural || '').toLowerCase();
    return objName.includes(searchLower) || objPlural.includes(searchLower);
  });

  const handleEditLayout = (objectName) => {
    navigate(`/crm-platform/lightning-builder?object=${objectName}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Record Page Layouts</h2>
          <p className="text-slate-600 text-sm">
            Customize how record detail pages are displayed for each object
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <span className="bg-slate-100 px-3 py-1 rounded-full">
            {objects.length} Objects
          </span>
        </div>
      </div>

      {/* Search Bar - Salesforce Style */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Search objects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-4 flex items-center"
          >
            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
        )}
      </div>

      {/* Objects Grid - Salesforce Card Style */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
          <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
            <div className="col-span-5">Object</div>
            <div className="col-span-3">API Name</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2 text-right">Action</div>
          </div>
        </div>

        {/* Object List */}
        <div className="divide-y divide-slate-100">
          {filteredObjects.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <Search className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm">No objects found matching &quot;{searchQuery}&quot;</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-blue-600 text-sm hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            filteredObjects.map((obj) => (
              <div
                key={obj.object_name}
                className={`px-6 py-4 hover:bg-blue-50 transition-colors cursor-pointer ${
                  hoveredObject === obj.object_name ? 'bg-blue-50' : ''
                }`}
                onMouseEnter={() => setHoveredObject(obj.object_name)}
                onMouseLeave={() => setHoveredObject(null)}
                onClick={() => handleEditLayout(obj.object_name)}
              >
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Object Name with Icon */}
                  <div className="col-span-5 flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getObjectColor(obj.object_name)} flex items-center justify-center text-white text-lg shadow-sm`}>
                      {getObjectIcon(obj.object_name)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {obj.object_plural || obj.object_label || obj.object_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {obj.object_label || obj.object_name}
                      </p>
                    </div>
                  </div>

                  {/* API Name */}
                  <div className="col-span-3">
                    <code className="text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">
                      {obj.object_name}
                    </code>
                  </div>

                  {/* Type Badge */}
                  <div className="col-span-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      obj.is_custom 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {obj.is_custom ? 'Custom' : 'Standard'}
                    </span>
                  </div>

                  {/* Action Button */}
                  <div className="col-span-2 text-right">
                    <Button
                      size="sm"
                      variant={hoveredObject === obj.object_name ? 'default' : 'outline'}
                      className={`transition-all ${
                        hoveredObject === obj.object_name 
                          ? 'bg-blue-600 text-white hover:bg-blue-700' 
                          : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditLayout(obj.object_name);
                      }}
                    >
                      <Layout className="h-4 w-4 mr-1" />
                      Edit Layout
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-5">
        <div className="flex items-start space-x-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Info className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900 mb-1">
              Lightning Page Builder
            </h4>
            <p className="text-sm text-blue-700">
              Click on any object to open the Lightning Page Builder. You can customize:
            </p>
            <ul className="mt-2 text-sm text-blue-700 space-y-1">
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                Column layout (2 or 3 columns)
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                Column order (drag & drop)
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                Add components (coming soon)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Manage Fields Section Component - Salesforce Style
 */
const ManageFieldsSection = ({ objects, onFieldsChanged }) => {
  const [selectedObject, setSelectedObject] = useState('');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('label');
  const [sortOrder, setSortOrder] = useState('asc');
  const [activeFieldsTab, setActiveFieldsTab] = useState('standard'); // 'standard' or 'advanced'

  useEffect(() => {
    if (selectedObject) {
      fetchCustomFields();
    }
  }, [selectedObject]);

  const fetchCustomFields = async () => {
    if (!selectedObject) return;

    setLoading(true);
    try {
      const response = await axios.get(`${API}/objects/${selectedObject}`);
      const fieldsArray = Object.entries(response.data.fields).map(([key, field]) => ({
        id: field.id || key,
        api_name: key,
        label: field.label,
        type: field.type.charAt(0).toUpperCase() + field.type.slice(1),
        options: field.options || null,
        default_value: field.default || null,
        is_required: field.required || false,
        is_custom: field.is_custom || false,
        indexed: false // Salesforce shows indexed column
      }));

      setFields(fieldsArray);
    } catch (error) {
      console.error('Error fetching fields:', error);
      toast.error('Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = () => {
    fetchCustomFields();
    if (onFieldsChanged) {
      onFieldsChanged();
    }
  };

  const handleDeleteField = async (field) => {
    const fieldType = field.is_custom ? 'custom field' : 'system field';
    const warningMessage = field.is_custom
      ? 'Are you sure you want to delete this custom field? This action cannot be undone.'
      : '⚠️ WARNING: You are about to delete a SYSTEM field! This may break functionality. Are you absolutely sure?';

    if (!window.confirm(warningMessage)) {
      return;
    }

    try {
      if (field.is_custom) {
        await axios.delete(`${API}/metadata/${selectedObject}/fields/${field.id}`);
      } else {
        await axios.post(`${API}/metadata/${selectedObject}/hide-field`, {
          field_name: field.api_name
        });
      }

      toast.success(`${field.label} deleted successfully`);
      handleFieldChange();
    } catch (error) {
      console.error('Error deleting field:', error);
      toast.error(`Failed to delete ${fieldType}`);
    }
  };

  // Sort and filter fields
  const sortedAndFilteredFields = fields
    .filter(f => 
      f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.api_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.type.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      return sortOrder === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const selectedObjectInfo = objects.find(o => o.object_name === selectedObject);
  const [objectSearchQuery, setObjectSearchQuery] = useState('');

  // Filter objects based on search
  const filteredObjects = objects.filter(obj => 
    obj.object_label.toLowerCase().includes(objectSearchQuery.toLowerCase()) ||
    obj.object_name.toLowerCase().includes(objectSearchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Salesforce-style Breadcrumb Header */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">SETUP</span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">OBJECT MANAGER</span>
          {selectedObject && (
            <>
              <ChevronRight className="h-4 w-4 text-slate-400" />
              <span className="text-blue-600 font-medium">{selectedObjectInfo?.object_label}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Left Sidebar - Searchable Object List */}
        <div className="w-72 bg-white border-r min-h-[calc(100vh-120px)] flex-shrink-0">
          {/* Search Objects */}
          <div className="p-4 border-b">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Object Manager</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Quick Find"
                value={objectSearchQuery}
                onChange={(e) => setObjectSearchQuery(e.target.value)}
                className="pl-10 h-10 border-slate-300"
              />
            </div>
          </div>

          {/* Object List */}
          <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
            {filteredObjects.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">
                No objects found
              </div>
            ) : (
              filteredObjects.map((obj) => (
                <button
                  key={obj.object_name}
                  onClick={() => setSelectedObject(obj.object_name)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors border-b border-slate-100 ${
                    selectedObject === obj.object_name
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-l-blue-600'
                      : 'text-slate-700 hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <Database className={`h-4 w-4 flex-shrink-0 ${
                    selectedObject === obj.object_name ? 'text-blue-600' : 'text-slate-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${
                      selectedObject === obj.object_name ? 'text-blue-700' : 'text-slate-700'
                    }`}>
                      {obj.object_label}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{obj.object_name}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6">
          {!selectedObject ? (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
              <Database className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">Select an Object</h3>
              <p className="text-slate-500 max-w-md mx-auto">
                Choose an object from the list to view and manage its fields, relationships, and configurations.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border">
              {/* Header Section */}
              <div className="px-6 py-4 border-b bg-slate-50">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h1 className="text-xl font-semibold text-slate-800">Fields & Relationships</h1>
                    <p className="text-sm text-slate-500 mt-1">
                      Manage all fields for {selectedObjectInfo?.object_label}
                    </p>
                  </div>
                </div>

                {/* Tabs for Standard vs Advanced Fields */}
                <div className="flex items-center gap-1 border-b -mx-6 px-6">
                  <button
                    onClick={() => setActiveFieldsTab('standard')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeFieldsTab === 'standard'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Standard & Custom Fields
                  </button>
                  <button
                    onClick={() => setActiveFieldsTab('advanced')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeFieldsTab === 'advanced'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Lookup, Rollup & Formula
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {activeFieldsTab === 'standard' ? (
                <>
                  {/* Standard Fields Header */}
                  <div className="px-6 py-3 border-b bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-500">
                        {sortedAndFilteredFields.length} Items • Sorted by {sortField === 'label' ? 'Field Label' : sortField === 'api_name' ? 'Field Name' : 'Data Type'}
                      </p>
                      <Button 
                        onClick={() => setShowAddField(true)} 
                        className="bg-blue-600 hover:bg-blue-700 h-9"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Field
                      </Button>
                    </div>

                    {/* Quick Find / Search */}
                    <div className="mt-3 flex items-center gap-4">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="Quick Find"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 h-9 border-slate-300"
                        />
                      </div>
                      <Button variant="outline" size="sm" className="h-9 text-slate-600">
                        <Clock className="h-4 w-4 mr-2" />
                        Set History Tracking
                      </Button>
                    </div>
                  </div>

              {/* Table Section */}
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="text-center py-12 text-slate-500">
                    <Loader className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                    <p>Loading fields...</p>
                  </div>
                ) : sortedAndFilteredFields.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    {searchQuery ? 'No matching fields found' : 'No fields found for this object'}
                  </div>
                ) : (
                  <table className="w-full">
                    {/* Salesforce-style Blue Header */}
                    <thead>
                      <tr className="bg-[#0176d3] text-white text-xs uppercase">
                        <th 
                          className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-[#0165b8]"
                          onClick={() => handleSort('label')}
                        >
                          <div className="flex items-center gap-1">
                            Field Label
                            {sortField === 'label' && (
                              <ChevronDown className={`h-3 w-3 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-[#0165b8]"
                          onClick={() => handleSort('api_name')}
                        >
                          <div className="flex items-center gap-1">
                            Field Name
                            {sortField === 'api_name' && (
                              <ChevronDown className={`h-3 w-3 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-[#0165b8]"
                          onClick={() => handleSort('type')}
                        >
                          <div className="flex items-center gap-1">
                            Data Type
                            {sortField === 'type' && (
                              <ChevronDown className={`h-3 w-3 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">Required</th>
                        <th className="px-4 py-3 text-left font-semibold">Field Type</th>
                        <th className="px-4 py-3 text-center font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedAndFilteredFields.map((field, index) => (
                        <tr 
                          key={field.api_name}
                          className={`hover:bg-blue-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                        >
                          <td className="px-4 py-3">
                            <button 
                              onClick={() => setEditingField(field)}
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                            >
                              {field.label}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                            {field.api_name}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              field.type === 'Text' ? 'bg-green-100 text-green-700' :
                              field.type === 'Email' ? 'bg-blue-100 text-blue-700' :
                              field.type === 'Phone' ? 'bg-purple-100 text-purple-700' :
                              field.type === 'Number' ? 'bg-orange-100 text-orange-700' :
                              field.type === 'Date' ? 'bg-pink-100 text-pink-700' :
                              field.type === 'Datetime' ? 'bg-pink-100 text-pink-700' :
                              field.type === 'Select' ? 'bg-yellow-100 text-yellow-700' :
                              field.type === 'Textarea' ? 'bg-teal-100 text-teal-700' :
                              field.type === 'Checkbox' ? 'bg-indigo-100 text-indigo-700' :
                              field.type === 'Url' ? 'bg-cyan-100 text-cyan-700' :
                              field.type === 'Currency' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {field.type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {field.is_required ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {field.is_custom ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                                Custom
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                Standard
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingField(field)}
                                className="h-8 w-8 p-0 hover:bg-blue-100"
                              >
                                <Edit className="h-4 w-4 text-slate-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteField(field)}
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer Stats */}
              {!loading && fields.length > 0 && (
                <div className="px-6 py-3 border-t bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                      {fields.filter(f => f.is_custom).length} Custom Fields
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                      {fields.filter(f => !f.is_custom).length} Standard Fields
                    </span>
                  </div>
                  <span>Total: {fields.length} fields</span>
                </div>
              )}
              </>
              ) : (
                /* Advanced Fields Tab Content */
                <div className="p-6">
                  <AdvancedFieldManager
                    objectName={selectedObject}
                    objectLabel={selectedObjectInfo?.object_label || selectedObject}
                    onFieldsChanged={handleFieldChange}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddField && selectedObject && (
        <AddCustomFieldDialog
          isOpen={showAddField}
          onClose={() => setShowAddField(false)}
          objectName={selectedObject}
          onFieldAdded={() => {
            handleFieldChange();
            setShowAddField(false);
          }}
        />
      )}

      {editingField && (
        <EditCustomFieldDialog
          isOpen={!!editingField}
          onClose={() => setEditingField(null)}
          objectName={selectedObject}
          field={editingField}
          onFieldUpdated={() => {
            handleFieldChange();
            setEditingField(null);
          }}
        />
      )}
    </div>
  );
};

/**
 * Manage Objects Section Component
 * Reuses existing ManageObjectsTab logic
 */
const ManageObjectsSection = ({ objects, onRefresh }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Manage Objects</h2>
        <p className="text-slate-600">Create and manage custom objects for your CRM</p>
      </div>
      <ManageObjectsTab objects={objects} onObjectsChanged={onRefresh} />
    </div>
  );
};

/**
 * Manage Record Types Section Component
 */
const ManageRecordTypesSection = ({ objects }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Record Types</h2>
        <p className="text-slate-600">Configure record types for different business processes</p>
      </div>
      <RecordTypeManager objects={objects} />
    </div>
  );
};

/**
 * Features Section Component
 * Shows feature cards for different configuration modules
 */
const FeaturesSection = () => {
  const navigate = useNavigate();

  const featureCards = [
    {
      id: 'email-drafts',
      title: 'Email Manager',
      description: 'Manage sent emails and drafts. View email history, edit drafts, and track communication.',
      icon: FileText,
      color: 'blue',
      path: '/setup/email-drafts',
      available: true,
    },
    {
      id: 'search-config',
      title: 'Search Configuration',
      description: 'Configure which objects and fields appear in global search results. Control searchability and display priorities.',
      icon: SearchIcon,
      color: 'indigo',
      path: '/setup/features/configure-search',
      available: true,
    },
    {
      id: 'notification-config',
      title: 'Notification Configuration',
      description: 'Manage notification preferences, email templates, and alert settings for your organization.',
      icon: Bell,
      color: 'amber',
      path: '/setup/features/notifications',
      available: false,
    },
  ];

  const getColorClasses = (color, available) => {
    if (!available) {
      return {
        bg: 'bg-slate-100',
        iconBg: 'bg-slate-200',
        iconText: 'text-slate-400',
        border: 'border-slate-200',
        hover: '',
      };
    }
    const colors = {
      blue: {
        bg: 'bg-blue-50',
        iconBg: 'bg-blue-100',
        iconText: 'text-blue-600',
        border: 'border-blue-200',
        hover: 'hover:border-blue-400 hover:shadow-md',
      },
      indigo: {
        bg: 'bg-indigo-50',
        iconBg: 'bg-indigo-100',
        iconText: 'text-indigo-600',
        border: 'border-indigo-200',
        hover: 'hover:border-indigo-400 hover:shadow-md',
      },
      amber: {
        bg: 'bg-amber-50',
        iconBg: 'bg-amber-100',
        iconText: 'text-amber-600',
        border: 'border-amber-200',
        hover: 'hover:border-amber-400 hover:shadow-md',
      },
    };
    return colors[color] || colors.indigo;
  };

  return (
    <div className="max-w-5xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
            <SettingsIcon className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Features</h1>
            <p className="text-sm text-slate-500">Configure platform features and modules</p>
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {featureCards.map((feature) => {
          const Icon = feature.icon;
          const colors = getColorClasses(feature.color, feature.available);
          
          return (
            <Card
              key={feature.id}
              className={`relative overflow-hidden transition-all cursor-pointer ${colors.border} ${colors.hover} ${
                !feature.available ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              onClick={() => feature.available && navigate(feature.path)}
              data-testid={`feature-card-${feature.id}`}
            >
              {!feature.available && (
                <div className="absolute top-3 right-3">
                  <span className="text-xs font-medium bg-slate-200 text-slate-600 px-2 py-1 rounded-full">
                    Coming Soon
                  </span>
                </div>
              )}
              
              <CardHeader className="pb-2">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.iconBg}`}>
                    <Icon className={`h-6 w-6 ${colors.iconText}`} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-slate-800">
                      {feature.title}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <CardDescription className="text-sm text-slate-600 mb-4">
                  {feature.description}
                </CardDescription>
                
                {feature.available && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`p-0 h-auto font-medium ${colors.iconText} hover:bg-transparent`}
                  >
                    Configure
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Click on any available feature card to access its configuration page. 
          More features will be added in future updates.
        </p>
      </div>
    </div>
  );
};

/**
 * Main SetupPage Component
 * CRM Setup and Configuration Hub
 */
const SetupPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [objects, setObjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    accessSecurity: true, // Default expanded
  });
  
  // System permissions hook
  const { 
    hasPermission, 
    canAccessSection, 
    isSuperAdmin, 
    loading: permissionsLoading,
    error: permissionsError,
    permissions
  } = useSystemPermissions();
  
  // Module entitlements hook - controls which modules are visible in sidebar
  // V3: Now returns ALL modules with their state (ACTIVE, PLAN_LOCKED, ADMIN_DISABLED, LICENSE_REQUIRED)
  // Uses context for global state management and refresh capability
  const { 
    isModuleEnabled,
    getModuleState,
    isModuleAccessible,
    tenantPlan,
    moduleStates,
    loading: modulesLoading 
  } = useModuleEntitlementsContext();
  
  // Determine if this tenant is DocFlow-only (CRM module is admin-disabled)
  // Also check even if still loading — cached data may already have the answer
  const crmState = getModuleState('crm');
  const isDocFlowOnly = crmState.state === MODULE_STATES.ADMIN_DISABLED;
  
  // State for upgrade prompt modal
  const [upgradePromptModule, setUpgradePromptModule] = useState(null);
  
  // Get current section from URL path
  const selectedSection = location.pathname.split('/setup/')[1] || null;

  // Check if any Access & Security item is active
  const isAccessSecurityActive = location.pathname.includes('users') ||
    location.pathname.includes('security-center') ||
    location.pathname.includes('roles-hierarchy') ||
    location.pathname.includes('public-groups') ||
    location.pathname.includes('queues') ||
    location.pathname.includes('sharing-settings') ||
    location.pathname.includes('sharing-rules') ||
    location.pathname.includes('permission-bundles') ||
    location.pathname.includes('license-plans');

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Permission check helpers
  // Show items if: loading, error, is super admin, is admin role (from auth context), or has specific permission
  // This ensures sidebar remains stable and doesn't flicker after permissions load
  const isAdminRole = user?.role_id === 'system_administrator' || user?.role === 'admin' || user?.role === 'Admin' || user?.role === 'System Administrator';
  const hasNoPermissionsLoaded = !permissions || Object.keys(permissions).length === 0;
  const shouldShowAllItems = permissionsLoading || permissionsError || (hasNoPermissionsLoaded && isAdminRole);
  
  const canViewUsers = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('view_users') || true;
  const canViewRoles = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('view_roles');
  const canManageGroups = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('manage_groups');
  const canManageQueues = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('manage_queues');
  const canManageSharingRules = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('manage_sharing_rules');
  const canManageSharingSettings = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('manage_sharing_settings');
  const canViewSecurityCenter = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('view_security_center');
  const canViewLicenses = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('view_licenses') || true;
  const canManagePermissionBundles = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('manage_permission_bundles');
  const canManageSchema = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('manage_custom_objects');
  const canManageFlows = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('manage_flows');
  const canImportData = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('import_data');
  const canExportData = () => shouldShowAllItems || isSuperAdmin || isAdminRole || hasPermission('export_data');

  const fetchObjects = async () => {
    try {
      const response = await axios.get(`${API}/objects`);
      setObjects(response.data);
    } catch (error) {
      console.error('Error fetching objects:', error);
      toast.error('Failed to load objects');
    }
  };

  useEffect(() => {
    fetchObjects();
  }, []);

  // Timeout to prevent infinite loading — fail-open after 10s
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!modulesLoading) return;
    // Reset timeout state at the start of each loading cycle
    setLoadingTimedOut(false);
    const t = setTimeout(() => setLoadingTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [modulesLoading]);

  // Show loading state while module states are being fetched
  // Bypass if timed out or if moduleStates already have data (from cache)
  // CRITICAL: Block rendering until module states are fully resolved to prevent flicker
  const hasModuleData = moduleStates && Object.keys(moduleStates).length > 0;
  if ((modulesLoading && !loadingTimedOut && !hasModuleData)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" data-testid="setup-loading">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="text-slate-600">Loading setup...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Hide back button for DocFlow-only tenants since Setup IS their home */}
              {!isDocFlowOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/')}
                  className="text-slate-600"
                  data-testid="setup-back-button"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to CRM
                </Button>
              )}
              {!isDocFlowOnly && <Separator orientation="vertical" className="h-6" />}
              <button
                onClick={() => navigate('/setup')}
                className="flex items-center space-x-3 hover:opacity-80 transition-opacity cursor-pointer"
                data-testid="header-logo-home"
              >
                <Wrench className="h-5 w-5 text-indigo-600" />
                <div className="text-left">
                  <h1 className="text-xl font-bold text-slate-800">
                    {isDocFlowOnly ? 'Cluvik DocFlow' : 'Setup'}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {isDocFlowOnly ? 'Document workflow & signing platform' : 'Configure your CRM'}
                  </p>
                </div>
              </button>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-3">
                <Badge variant="secondary" className="bg-slate-100 text-slate-700 capitalize">
                  {user?.first_name} {user?.last_name}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} className="text-slate-600">
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Left Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-4">
            {/* Search Box */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Setup..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="space-y-1">
              {/* Company Information — Global setting, always visible for all tenants */}
              {(!searchTerm || 'company'.includes(searchTerm.toLowerCase()) || 'information'.includes(searchTerm.toLowerCase()) || 'organization'.includes(searchTerm.toLowerCase())) && (
                <Button
                  variant={location.pathname.includes('company-information') ? 'secondary' : 'ghost'}
                  className={`w-full justify-start h-9 text-slate-700 hover:bg-slate-50 font-medium ${
                    location.pathname.includes('company-information') ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600' : ''
                  }`}
                  onClick={() => navigate('/setup/company-information')}
                  data-testid="company-info-link"
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  <span>Company Information</span>
                </Button>
              )}

              {/* Schema Builder - Admin Module - Only show if module is enabled and not DocFlow-only */}
              {!isDocFlowOnly && isModuleEnabled('schema_builder') && canManageSchema() && (!searchTerm || 'schema builder'.toLowerCase().includes(searchTerm.toLowerCase()) || 'schema'.toLowerCase().includes(searchTerm.toLowerCase()) || 'fields'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <Button
                  variant={location.pathname.includes('schema-builder') ? 'secondary' : 'ghost'}
                  className={`w-full justify-start h-9 text-slate-700 hover:bg-slate-50 font-medium ${
                    location.pathname.includes('schema-builder') ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600' : ''
                  }`}
                  onClick={() => navigate('/setup/schema-builder/preview')}
                  data-testid="schema-builder-link"
                >
                  <Database className="h-4 w-4 mr-2" />
                  <span>Schema Builder</span>
                </Button>
              )}

              {/* ACCESS & SECURITY - Collapsible Section */}
              {(!searchTerm || 'access'.includes(searchTerm.toLowerCase()) || 'security'.includes(searchTerm.toLowerCase()) || 'users'.includes(searchTerm.toLowerCase()) || 'roles'.includes(searchTerm.toLowerCase()) || 'groups'.includes(searchTerm.toLowerCase()) || 'queues'.includes(searchTerm.toLowerCase()) || 'sharing'.includes(searchTerm.toLowerCase()) || 'license'.includes(searchTerm.toLowerCase()) || 'permission'.includes(searchTerm.toLowerCase()) || 'bundles'.includes(searchTerm.toLowerCase())) && (
                <div className="mt-2">
                  {/* Section Header */}
                  <button
                    onClick={() => toggleSection('accessSecurity')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                      isAccessSecurityActive 
                        ? 'bg-indigo-50 text-indigo-700' 
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    data-testid="access-security-section"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Access & Security</span>
                    </div>
                    {expandedSections.accessSecurity ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  {/* Section Items */}
                  {(expandedSections.accessSecurity || searchTerm) && (
                    <div className="ml-2 mt-1 space-y-0.5 border-l-2 border-slate-200 pl-2">
                      {/* Users - Always visible */}
                      {canViewUsers() && (!searchTerm || 'users'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={selectedSection === 'users' ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            selectedSection === 'users' ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/users')}
                          data-testid="users-link"
                        >
                          <Users className="h-3.5 w-3.5 mr-2" />
                          <span>Users</span>
                        </Button>
                      )}

                      {/* Roles & Hierarchy - Hidden for DocFlow-only tenants */}
                      {!isDocFlowOnly && canViewRoles() && (!searchTerm || 'roles'.includes(searchTerm.toLowerCase()) || 'hierarchy'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('roles-hierarchy') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('roles-hierarchy') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/roles-hierarchy')}
                          data-testid="roles-hierarchy-link"
                        >
                          <Network className="h-3.5 w-3.5 mr-2" />
                          <span>Roles & Hierarchy</span>
                        </Button>
                      )}

                      {/* Permission Bundles - Hidden for DocFlow-only tenants */}
                      {!isDocFlowOnly && canManagePermissionBundles() && (!searchTerm || 'permission'.includes(searchTerm.toLowerCase()) || 'bundles'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('permission-bundles') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('permission-bundles') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/permission-bundles')}
                          data-testid="permission-bundles-link"
                        >
                          <Package className="h-3.5 w-3.5 mr-2" />
                          <span>Permission Bundles</span>
                        </Button>
                      )}

                      {/* Public Groups - Hidden for DocFlow-only tenants */}
                      {!isDocFlowOnly && canManageGroups() && (!searchTerm || 'groups'.includes(searchTerm.toLowerCase()) || 'public'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('public-groups') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('public-groups') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/public-groups')}
                          data-testid="public-groups-link"
                        >
                          <Users className="h-3.5 w-3.5 mr-2" />
                          <span>Public Groups</span>
                        </Button>
                      )}

                      {/* Queues - Hidden for DocFlow-only tenants */}
                      {!isDocFlowOnly && canManageQueues() && (!searchTerm || 'queues'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('/setup/queues') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('/setup/queues') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/queues')}
                          data-testid="queues-link"
                        >
                          <Settings className="h-3.5 w-3.5 mr-2" />
                          <span>Queues</span>
                        </Button>
                      )}

                      {/* Sharing Settings - Hidden for DocFlow-only tenants */}
                      {!isDocFlowOnly && canManageSharingSettings() && (!searchTerm || 'sharing'.includes(searchTerm.toLowerCase()) || 'defaults'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('sharing-settings') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('sharing-settings') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/sharing-settings')}
                          data-testid="sharing-settings-link"
                        >
                          <Share2 className="h-3.5 w-3.5 mr-2" />
                          <span>Sharing Settings</span>
                        </Button>
                      )}

                      {/* Sharing Rules - Hidden for DocFlow-only tenants */}
                      {!isDocFlowOnly && canManageSharingRules() && (!searchTerm || 'sharing'.includes(searchTerm.toLowerCase()) || 'rules'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('sharing-rules') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('sharing-rules') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/sharing-rules')}
                          data-testid="sharing-rules-link"
                        >
                          <Share2 className="h-3.5 w-3.5 mr-2" />
                          <span>Sharing Rules</span>
                        </Button>
                      )}

                      {/* Security Center - Hidden for DocFlow-only tenants */}
                      {!isDocFlowOnly && canViewSecurityCenter() && (!searchTerm || 'security'.includes(searchTerm.toLowerCase()) || 'audit'.includes(searchTerm.toLowerCase()) || 'permissions'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('security-center') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('security-center') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/security-center/audit-logs')}
                          data-testid="security-center-link"
                        >
                          <Shield className="h-3.5 w-3.5 mr-2" />
                          <span>Security Center</span>
                        </Button>
                      )}

                      {/* License & Plans - Always visible */}
                      {canViewLicenses() && (!searchTerm || 'license'.includes(searchTerm.toLowerCase()) || 'plans'.includes(searchTerm.toLowerCase())) && (
                        <Button
                          variant={location.pathname.includes('license-plans') ? 'secondary' : 'ghost'}
                          className={`w-full justify-start h-8 text-sm text-slate-600 hover:bg-slate-50 ${
                            location.pathname.includes('license-plans') ? 'bg-indigo-50 text-indigo-700' : ''
                          }`}
                          onClick={() => navigate('/setup/license-plans')}
                          data-testid="license-plans-link"
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-2" />
                          <span>License & Plans</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Form Builder Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && (!searchTerm || 'form builder'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="form_builder"
                  icon={FileText}
                  label="Form Builder"
                  path="/form-builder"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                />
              )}

              {/* Survey Builder V2 Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && (!searchTerm || 'survey builder'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="survey_builder"
                  icon={ClipboardList}
                  label="Survey Builder"
                  path="/survey-builder-v2"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                />
              )}

              {/* Flow Builder Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && canManageFlows() && (!searchTerm || 'flow builder'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="flow_builder"
                  icon={Zap}
                  label="Flow Builder"
                  path="/flows"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                  testId="flow-builder-link"
                />
              )}

              {/* Task Manager Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && (!searchTerm || 'task manager'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="task_manager"
                  icon={ClipboardList}
                  label="Task Manager"
                  path="/task-manager"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                />
              )}

              {/* Import Builder Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && canImportData() && (!searchTerm || 'import builder'.toLowerCase().includes(searchTerm.toLowerCase()) || 'import'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="import_builder"
                  icon={Upload}
                  label="Import Builder"
                  path="/setup/import-builder"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                  testId="import-builder-link"
                />
              )}

              {/* Export Builder Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && canExportData() && (!searchTerm || 'export builder'.toLowerCase().includes(searchTerm.toLowerCase()) || 'export'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="export_builder"
                  icon={Download}
                  label="Export Builder"
                  path="/setup/export-builder"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                  testId="export-builder-link"
                />
              )}
              
              {/* Chatbot Manager Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && (!searchTerm || 'chatbot manager'.toLowerCase().includes(searchTerm.toLowerCase()) || 'chatbot'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="chatbot_manager"
                  icon={MessageSquare}
                  label="Chatbot Manager"
                  path="/setup/chatbot-manager"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                />
              )}

              {/* DocFlow Link - Always visible for DocFlow tenants */}
              {(!searchTerm || 'docflow'.toLowerCase().includes(searchTerm.toLowerCase()) || 'doc'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="docflow"
                  icon={FileText}
                  label="DocFlow"
                  path="/setup/docflow"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                  hideIfNotActive={isDocFlowOnly}
                />
              )}

              {/* File Manager Link - Visible for DocFlow tenants */}
              {(!searchTerm || 'file manager'.toLowerCase().includes(searchTerm.toLowerCase()) || 'files'.toLowerCase().includes(searchTerm.toLowerCase()) || 'document'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="file_manager"
                  icon={FolderOpen}
                  label="File Manager"
                  path="/setup/file-manager"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                  testId="file-manager-setup-link"
                  hideIfNotActive={isDocFlowOnly}
                />
              )}

              {/* App Manager - Visible for DocFlow tenants */}
              {(!searchTerm || 'app manager'.toLowerCase().includes(searchTerm.toLowerCase()) || 'apps'.toLowerCase().includes(searchTerm.toLowerCase()) || 'home page'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="app_manager"
                  icon={Layers}
                  label="App Manager"
                  path="/setup/app-manager"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                  testId="app-manager-link"
                  hideIfNotActive={isDocFlowOnly}
                />
              )}

              {/* Features Section - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && (!searchTerm || 'features'.toLowerCase().includes(searchTerm.toLowerCase()) || 'configure search'.toLowerCase().includes(searchTerm.toLowerCase()) || 'search metadata'.toLowerCase().includes(searchTerm.toLowerCase()) || 'notification'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <Button
                  variant={location.pathname.includes('/setup/features') ? 'secondary' : 'ghost'}
                  className={`w-full justify-start h-9 text-slate-700 hover:bg-slate-50 font-medium ${
                    location.pathname.includes('/setup/features') ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600' : ''
                  }`}
                  onClick={() => navigate('/setup/features')}
                  data-testid="features-link"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  <span>Features</span>
                </Button>
              )}

              {/* Connections - External Service Integrations */}
              {(!searchTerm || 'connections'.toLowerCase().includes(searchTerm.toLowerCase()) || 'integration'.toLowerCase().includes(searchTerm.toLowerCase()) || 'api'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <Button
                  variant={location.pathname.includes('/setup/connections') ? 'secondary' : 'ghost'}
                  className={`w-full justify-start h-9 text-slate-700 hover:bg-slate-50 font-medium ${
                    location.pathname.includes('/setup/connections') ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600' : ''
                  }`}
                  onClick={() => navigate('/setup/connections')}
                  data-testid="connections-link"
                >
                  <Key className="h-4 w-4 mr-2" />
                  <span>Connections</span>
                </Button>
              )}

              {/* AI & Automation — Global setting, always visible for all tenants */}
              {(!searchTerm || 'cluebot'.includes(searchTerm.toLowerCase()) || 'bot'.includes(searchTerm.toLowerCase()) || 'ai'.includes(searchTerm.toLowerCase()) || 'automation'.includes(searchTerm.toLowerCase()) || 'assistant'.includes(searchTerm.toLowerCase())) && (
                <Button
                  variant={location.pathname.includes('cluebot-configuration') ? 'secondary' : 'ghost'}
                  className={`w-full justify-start h-9 text-slate-700 hover:bg-slate-50 font-medium ${
                    location.pathname.includes('cluebot-configuration') ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600' : ''
                  }`}
                  onClick={() => navigate('/setup/cluebot-configuration')}
                  data-testid="cluebot-config-link"
                >
                  <Bot className="h-4 w-4 mr-2" />
                  <span>AI & Automation</span>
                </Button>
              )}

              {/* Email Templates Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && (!searchTerm || 'email templates'.toLowerCase().includes(searchTerm.toLowerCase()) || 'email'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="email_templates"
                  icon={Mail}
                  label="Email Templates"
                  path="/setup/email-templates"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                />
              )}

              {/* Booking Link - Hidden for DocFlow-only tenants */}
              {!isDocFlowOnly && (!searchTerm || 'booking'.toLowerCase().includes(searchTerm.toLowerCase())) && (
                <ModuleMenuButton
                  moduleCode="booking"
                  icon={CalendarIcon}
                  label="Booking"
                  path="/booking"
                  getModuleState={getModuleState}
                  isModuleAccessible={isModuleAccessible}
                  navigate={navigate}
                  location={location}
                  setUpgradePromptModule={setUpgradePromptModule}
                />
              )}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 bg-slate-50 overflow-y-auto">
          <div className="p-6">
            {!selectedSection ? (
              isDocFlowOnly ? (
                <DocFlowSetupDashboard user={user} />
              ) : (
                <SetupDashboard user={user} objects={objects} />
              )
            ) : selectedSection === 'features' ? (
              <FeaturesSection />
            ) : selectedSection === 'fields' ? (
              <ManageFieldsSection objects={objects} onFieldsChanged={fetchObjects} />
            ) : selectedSection === 'objects' ? (
              <ManageObjectsSection objects={objects} onRefresh={fetchObjects} />
            ) : selectedSection === 'record-layout' ? (
              <RecordLayoutSection objects={objects} />
            ) : selectedSection === 'recordTypes' ? (
              <ManageRecordTypesSection objects={objects} />
            ) : selectedSection === 'company-information' ? (
              <CompanyInfoPage />
            ) : selectedSection === 'cluebot-configuration' ? (
              <ClueBotConfigPage />
            ) : selectedSection === 'connections' ? (
              <ConnectionsPage />
            ) : null}
          </div>
        </main>
      </div>
      
      {/* Upgrade Prompt Modal */}
      {upgradePromptModule && (
        <UpgradePrompt
          moduleName={upgradePromptModule.name}
          planName={tenantPlan}
          onUpgrade={() => {
            setUpgradePromptModule(null);
            // Navigate to billing/plans page
            navigate('/setup/billing');
          }}
          onClose={() => setUpgradePromptModule(null)}
        />
      )}
    </div>
  );
};

export default SetupPage;
