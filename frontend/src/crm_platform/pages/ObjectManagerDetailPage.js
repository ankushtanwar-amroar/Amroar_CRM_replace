import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Settings, ArrowLeft, Loader2, Pencil, Save, X, RotateCcw, Tag } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import toast from 'react-hot-toast';
import SalesConsoleHeader from '../components/SalesConsoleHeader';
import FieldsAndRelationshipsPanel from '../components/FieldsAndRelationshipsPanel';
import { ValidationRulesPage } from '../../modules/validation-rules';
import { RecordTypesPage } from '../../modules/record-types';
import PageAssignmentsPanel from '../../modules/page-assignments/components/PageAssignmentsPanel';
import LightningPagesListPanel from '../components/LightningPagesListPanel';
import { LookupConfigurationPanel } from '../../modules/lookup-hover-preview';
import DependentPicklistsConfig from '../../modules/dependent-picklists/components/DependentPicklistsConfig';
import { ActionsListPage } from '../../modules/actions';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const ObjectManagerDetailPage = ({ objectName: propObjectName, inTab = false, onTabChange }) => {
  const { objectName: paramObjectName } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const objectName = propObjectName || paramObjectName;
  const navigate = useNavigate();
  const [objectData, setObjectData] = useState(null);
  const [activeSection, setActiveSection] = useState(searchParams.get('section') || 'details');
  const [loading, setLoading] = useState(true);
  
  // Editing state for details
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    description: '',
    object_label: '',
    object_plural: ''
  });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (objectName) {
      fetchObjectData();
    }
  }, [objectName]);
  
  // Sync URL with active section when it changes
  useEffect(() => {
    if (!inTab && activeSection) {
      const currentSection = searchParams.get('section');
      if (currentSection !== activeSection) {
        setSearchParams({ section: activeSection });
      }
    }
  }, [activeSection, inTab, setSearchParams]);
  
  // Handle section change with URL update
  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    if (onTabChange) {
      onTabChange(objectName, sectionId);
    }
  };

  const fetchObjectData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/objects/${objectName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setObjectData(response.data);
      // Initialize edit data
      setEditData({
        description: response.data?.description || '',
        object_label: response.data?.object_label || '',
        object_plural: response.data?.object_plural || ''
      });
    } catch (error) {
      console.error('Error fetching object:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleStartEditing = () => {
    setEditData({
      description: objectData?.description || '',
      object_label: objectData?.object_label || '',
      object_plural: objectData?.object_plural || ''
    });
    setIsEditing(true);
  };
  
  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditData({
      description: objectData?.description || '',
      object_label: objectData?.object_label || '',
      object_plural: objectData?.object_plural || ''
    });
  };
  
  const handleSaveDetails = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      // Use the new labels endpoint for label updates
      await axios.put(`${API}/api/objects/${objectName}/labels`, {
        object_label: editData.object_label,
        object_plural: editData.object_plural,
        description: editData.description
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Object labels updated successfully');
      setIsEditing(false);
      fetchObjectData(); // Refresh data
    } catch (error) {
      console.error('Error saving object details:', error);
      toast.error(error.response?.data?.detail || 'Failed to update object labels');
    } finally {
      setSaving(false);
    }
  };

  // Reset labels to default values
  const handleResetLabels = async () => {
    try {
      setResetting(true);
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/objects/${objectName}/labels/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Labels reset to default successfully');
      fetchObjectData(); // Refresh data
    } catch (error) {
      console.error('Error resetting labels:', error);
      const message = error.response?.data?.detail || 'Failed to reset labels';
      toast.error(message);
    } finally {
      setResetting(false);
    }
  };

  // Check if labels have been modified from defaults
  const hasCustomLabels = objectData?.default_label_singular && (
    objectData.object_label !== objectData.default_label_singular ||
    objectData.object_plural !== objectData.default_label_plural
  );

  const sidebarSections = [
    { id: 'details', label: 'Details' },
    { id: 'fields', label: 'Fields & Relationships' },
    { id: 'actions', label: 'Actions' },
    { id: 'lookup-config', label: 'Lookup Configuration' },
    { id: 'field-dependencies', label: 'Field Dependencies' },
    // { id: 'manage', label: 'Manage Objects' },
    { id: 'record-layout', label: 'Record Layout' },
    { id: 'page-assignments', label: 'Page Assignments' },
    { id: 'validation-rules', label: 'Validation Rules' },
    { id: 'record-types', label: 'Record Types' }
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'details':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">Details</h2>
                {hasCustomLabels && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                    <Tag className="h-3 w-3" />
                    Custom Labels
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Reset to Default button - only show when labels have been customized */}
                {hasCustomLabels && !isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetLabels}
                    disabled={resetting}
                    className="flex items-center gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
                    data-testid="reset-labels-btn"
                  >
                    <RotateCcw className={`h-4 w-4 ${resetting ? 'animate-spin' : ''}`} />
                    {resetting ? 'Resetting...' : 'Reset to Default'}
                  </Button>
                )}
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartEditing}
                    className="flex items-center gap-2"
                    data-testid="edit-details-btn"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEditing}
                      disabled={saving}
                      data-testid="cancel-edit-btn"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveDetails}
                      disabled={saving}
                      className="bg-indigo-600 hover:bg-indigo-700"
                      data-testid="save-details-btn"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 bg-white p-6 rounded-lg border">
              <div className="col-span-2">
                <label className="text-sm font-medium text-slate-600">Description</label>
                {isEditing ? (
                  <Textarea
                    value={editData.description}
                    onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    className="mt-1"
                    rows={3}
                    placeholder="Enter object description..."
                    data-testid="description-input"
                  />
                ) : (
                  <p className="mt-1 text-slate-900">{objectData?.description || '-'}</p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-slate-600">API Name</label>
                <p className="mt-1 text-slate-900 font-mono text-sm bg-slate-50 px-2 py-1 rounded">{objectData?.object_name}</p>
                <p className="mt-1 text-xs text-slate-500">This cannot be changed</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-slate-600">Custom</label>
                <p className="mt-1 text-slate-900">{objectData?.is_custom ? 'Yes' : 'No'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-slate-600">Singular Label</label>
                {isEditing ? (
                  <Input
                    value={editData.object_label}
                    onChange={(e) => setEditData(prev => ({ ...prev, object_label: e.target.value }))}
                    className="mt-1"
                    placeholder="e.g., Lead"
                    data-testid="singular-label-input"
                  />
                ) : (
                  <p className="mt-1 text-slate-900" data-testid="singular-label-value">{objectData?.object_label}</p>
                )}
                {objectData?.default_label_singular && objectData.object_label !== objectData.default_label_singular && (
                  <p className="mt-1 text-xs text-slate-500">Default: {objectData.default_label_singular}</p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-slate-600">Plural Label</label>
                {isEditing ? (
                  <Input
                    value={editData.object_plural}
                    onChange={(e) => setEditData(prev => ({ ...prev, object_plural: e.target.value }))}
                    className="mt-1"
                    placeholder="e.g., Leads"
                    data-testid="plural-label-input"
                  />
                ) : (
                  <p className="mt-1 text-slate-900" data-testid="plural-label-value">{objectData?.object_plural}</p>
                )}
                {objectData?.default_label_plural && objectData.object_plural !== objectData.default_label_plural && (
                  <p className="mt-1 text-xs text-slate-500">Default: {objectData.default_label_plural}</p>
                )}
              </div>
            </div>
            
            {/* Label Rename Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">About Object Labels</h3>
              <p className="text-sm text-blue-800">
                Changing the object labels updates how the object appears across the CRM interface 
                (sidebar, tabs, buttons, headers). The API name remains unchanged to ensure backend 
                compatibility and existing integrations continue to work.
              </p>
            </div>
          </div>
        );
        
      case 'fields':
        return (
          <FieldsAndRelationshipsPanel 
            objectName={objectName} 
            objectLabel={objectData?.object_label || objectName}
          />
        );
        
      case 'actions':
        return (
          <ActionsListPage 
            objectName={objectName}
            objectLabel={objectData?.object_label || objectName}
          />
        );
        
      case 'lookup-config':
        return (
          <LookupConfigurationPanel 
            objectName={objectName}
            objectLabel={objectData?.object_label || objectName}
          />
        );
        
      case 'field-dependencies':
        // Transform fields object to array format expected by DependentPicklistsConfig
        const picklistFields = objectData?.fields ? 
          Object.entries(objectData.fields)
            .filter(([key, field]) => field.type === 'picklist' || field.type === 'select')
            .map(([key, field]) => ({
              api_name: key,
              label: field.label || key,
              type: 'picklist',
              options: field.options || []
            }))
          : [];
        
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Field Dependencies</h2>
            <DependentPicklistsConfig 
              objectName={objectName}
              picklistFields={picklistFields}
            />
          </div>
        );
        
      case 'manage':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Manage Objects</h2>
            <div className="bg-white p-6 rounded-lg border">
              <p className="text-slate-600">Object management options will appear here.</p>
            </div>
          </div>
        );
        
      case 'record-layout':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Record Layout</h2>
            <div className="bg-white p-6 rounded-lg border">
              <LightningPagesListPanel 
                objectName={objectName}
                objectLabel={objectData?.object_label || objectName}
              />
            </div>
          </div>
        );
        
      case 'page-assignments':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Page Assignments</h2>
            <PageAssignmentsPanel 
              objectName={objectName} 
              objectLabel={objectData?.object_label || objectName}
            />
          </div>
        );
        
      case 'validation-rules':
        return <ValidationRulesPage objectName={objectName} />;
        
      case 'record-types':
        return <RecordTypesPage objectName={objectName} />;
        
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className={`${inTab ? 'h-full' : 'h-screen'} flex flex-col bg-slate-50`}>
        {!inTab && <SalesConsoleHeader />}
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {!inTab && <SalesConsoleHeader />}
      
      {!inTab && (
        <div className="bg-white border-b px-8 py-3">
          <div className="flex items-center space-x-2 text-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/object-manager')}
              className="text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Object Manager
            </Button>
            <span className="text-slate-400">›</span>
            <span className="text-slate-900 font-medium">
              {objectData?.object_label || objectName}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Navigation */}
        <aside className="w-64 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              {objectData?.object_label || objectName}
            </h3>
            <div className="space-y-1">
              {sidebarSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionChange(section.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default ObjectManagerDetailPage;
