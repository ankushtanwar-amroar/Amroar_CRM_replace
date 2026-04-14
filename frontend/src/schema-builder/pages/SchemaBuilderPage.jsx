/**
 * Schema Builder - Main Page
 * ==========================
 * Admin-only module for defining Objects, Fields, and Relationships.
 * Isolated from core CRM - acts as metadata configuration layer.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, Database, Plus, Search, Settings, Trash2, 
  Edit, Eye, Link, GripVertical, ChevronRight, Building,
  UserPlus, FileText, Lock, Calendar, Mail, Phone, Hash,
  ToggleLeft, List, AlignLeft
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Field type icons mapping
const FIELD_TYPE_ICONS = {
  text: FileText,
  number: Hash,
  email: Mail,
  phone: Phone,
  date: Calendar,
  datetime: Calendar,
  checkbox: ToggleLeft,
  picklist: List,
  long_text: AlignLeft,
  lookup: Link
};

// Field type labels
const FIELD_TYPE_LABELS = {
  text: 'Text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  date: 'Date',
  datetime: 'Date/Time',
  checkbox: 'Checkbox',
  picklist: 'Picklist',
  long_text: 'Long Text',
  lookup: 'Lookup'
};

// Sortable Field Item Component
function SortableFieldItem({ field, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const FieldIcon = FIELD_TYPE_ICONS[field.field_type] || FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-white border rounded-lg hover:border-indigo-300 transition-colors ${
        isDragging ? 'shadow-lg' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-slate-100 p-1 rounded"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </button>
        <div className={`p-2 rounded-lg ${field.is_system ? 'bg-slate-100' : 'bg-indigo-50'}`}>
          <FieldIcon className={`h-4 w-4 ${field.is_system ? 'text-slate-500' : 'text-indigo-600'}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800">{field.label}</span>
            {field.is_system && (
              <Badge variant="secondary" className="text-xs">
                <Lock className="h-3 w-3 mr-1" />
                System
              </Badge>
            )}
            {field.is_required && !field.is_system && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Required
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{field.api_name}</span>
            <span>•</span>
            <span>{FIELD_TYPE_LABELS[field.field_type] || field.field_type}</span>
          </div>
        </div>
      </div>
      
      {!field.is_system && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(field)}
            className="h-8 w-8 p-0"
          >
            <Edit className="h-4 w-4 text-slate-500" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(field)}
            className="h-8 w-8 p-0 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SchemaBuilderPage() {
  const navigate = useNavigate();
  const { objectId } = useParams();
  
  // State
  const [objects, setObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);
  const [fields, setFields] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [showObjectModal, setShowObjectModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showRelationshipModal, setShowRelationshipModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  
  // Form states
  const [objectForm, setObjectForm] = useState({ label: '', api_name: '', description: '', plural_label: '' });
  const [fieldForm, setFieldForm] = useState({ 
    label: '', api_name: '', field_type: 'text', is_required: false, 
    is_searchable: false, help_text: '', picklist_values: '', lookup_object: '' 
  });
  const [relationshipForm, setRelationshipForm] = useState({
    label: '', api_name: '', target_object_id: '', is_required: false
  });
  const [editingObject, setEditingObject] = useState(null);
  const [editingField, setEditingField] = useState(null);
  
  // Field types from API
  const [fieldTypes, setFieldTypes] = useState([]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

  // Auth token
  const getToken = () => localStorage.getItem('token');
  const authHeaders = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  // Fetch objects
  const fetchObjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/schema-builder/objects`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch objects');
      const data = await res.json();
      setObjects(data);
    } catch (error) {
      console.error('Error fetching objects:', error);
      toast.error('Failed to load objects');
    }
  }, []);

  // Fetch object details
  const fetchObjectDetails = useCallback(async (objId) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/schema-builder/objects/${objId}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch object details');
      const data = await res.json();
      setSelectedObject(data.object);
      setFields(data.fields);
      setRelationships(data.relationships);
    } catch (error) {
      console.error('Error fetching object details:', error);
      toast.error('Failed to load object details');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch field types
  const fetchFieldTypes = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/schema-builder/metadata/field-types`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch field types');
      const data = await res.json();
      setFieldTypes(data);
    } catch (error) {
      console.error('Error fetching field types:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchObjects();
    fetchFieldTypes();
    setLoading(false);
  }, [fetchObjects, fetchFieldTypes]);

  // Load object when ID changes
  useEffect(() => {
    if (objectId) {
      fetchObjectDetails(objectId);
    } else {
      setSelectedObject(null);
      setFields([]);
      setRelationships([]);
    }
  }, [objectId, fetchObjectDetails]);

  // Auto-generate API name from label
  const generateApiName = (label) => {
    return label.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
  };

  // Handle object form label change
  const handleObjectLabelChange = (value) => {
    setObjectForm(prev => ({
      ...prev,
      label: value,
      api_name: editingObject ? prev.api_name : generateApiName(value),
      plural_label: prev.plural_label || `${value}s`
    }));
  };

  // Handle field form label change
  const handleFieldLabelChange = (value) => {
    setFieldForm(prev => ({
      ...prev,
      label: value,
      api_name: editingField ? prev.api_name : generateApiName(value)
    }));
  };

  // Create/Update Object
  const handleSaveObject = async () => {
    try {
      const url = editingObject 
        ? `${API_URL}/api/schema-builder/objects/${editingObject.id}`
        : `${API_URL}/api/schema-builder/objects`;
      
      const res = await fetch(url, {
        method: editingObject ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(objectForm)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to save object');
      }

      const savedObject = await res.json();
      toast.success(editingObject ? 'Object updated' : 'Object created');
      setShowObjectModal(false);
      setObjectForm({ label: '', api_name: '', description: '', plural_label: '' });
      setEditingObject(null);
      fetchObjects();
      
      if (!editingObject) {
        navigate(`/setup/schema-builder/${savedObject.id}`);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Create/Update Field
  const handleSaveField = async () => {
    try {
      const payload = {
        ...fieldForm,
        object_id: selectedObject.id,
        picklist_values: fieldForm.field_type === 'picklist' 
          ? fieldForm.picklist_values.split('\n').filter(v => v.trim())
          : null
      };

      const url = editingField
        ? `${API_URL}/api/schema-builder/fields/${editingField.id}`
        : `${API_URL}/api/schema-builder/fields`;

      const res = await fetch(url, {
        method: editingField ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to save field');
      }

      toast.success(editingField ? 'Field updated' : 'Field created');
      setShowFieldModal(false);
      setFieldForm({ label: '', api_name: '', field_type: 'text', is_required: false, is_searchable: false, help_text: '', picklist_values: '', lookup_object: '' });
      setEditingField(null);
      fetchObjectDetails(selectedObject.id);
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Create Relationship
  const handleSaveRelationship = async () => {
    try {
      const payload = {
        ...relationshipForm,
        source_object_id: selectedObject.id
      };

      const res = await fetch(`${API_URL}/api/schema-builder/relationships`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to create relationship');
      }

      toast.success('Relationship created');
      setShowRelationshipModal(false);
      setRelationshipForm({ label: '', api_name: '', target_object_id: '', is_required: false });
      fetchObjectDetails(selectedObject.id);
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    try {
      const { type, item } = deleteTarget;
      let url;
      
      if (type === 'object') {
        url = `${API_URL}/api/schema-builder/objects/${item.id}`;
      } else if (type === 'field') {
        url = `${API_URL}/api/schema-builder/fields/${item.id}`;
      } else if (type === 'relationship') {
        url = `${API_URL}/api/schema-builder/relationships/${item.id}`;
      }

      const res = await fetch(url, { method: 'DELETE', headers: authHeaders });
      
      if (!res.ok && res.status !== 204) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to delete');
      }

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);

      if (type === 'object') {
        fetchObjects();
        navigate('/setup/schema-builder');
      } else {
        fetchObjectDetails(selectedObject.id);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Handle field reorder
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex(f => f.id === active.id);
    const newIndex = fields.findIndex(f => f.id === over.id);
    
    const newFields = arrayMove(fields, oldIndex, newIndex);
    setFields(newFields);

    // Update server
    try {
      const res = await fetch(
        `${API_URL}/api/schema-builder/fields/object/${selectedObject.id}/reorder`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ field_ids: newFields.map(f => f.id) })
        }
      );

      if (!res.ok) throw new Error('Failed to reorder fields');
      toast.success('Fields reordered');
    } catch (error) {
      toast.error(error.message);
      fetchObjectDetails(selectedObject.id);
    }
  };

  // Open edit object modal
  const openEditObject = (obj) => {
    setEditingObject(obj);
    setObjectForm({
      label: obj.label,
      api_name: obj.api_name,
      description: obj.description || '',
      plural_label: obj.plural_label || ''
    });
    setShowObjectModal(true);
  };

  // Open edit field modal
  const openEditField = (field) => {
    setEditingField(field);
    setFieldForm({
      label: field.label,
      api_name: field.api_name,
      field_type: field.field_type,
      is_required: field.is_required,
      help_text: field.help_text || '',
      picklist_values: field.picklist_values?.join('\n') || '',
      lookup_object: field.lookup_object || ''
    });
    setShowFieldModal(true);
  };

  // Filter objects by search
  const filteredObjects = objects.filter(obj =>
    obj.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obj.api_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get object icon
  const getObjectIcon = (obj) => {
    if (obj.api_name === 'lead') return UserPlus;
    if (obj.api_name === 'account') return Building;
    return Database;
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="schema-builder-page">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/setup')}
                className="text-slate-600"
                data-testid="back-to-setup-btn"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center space-x-3">
                <Database className="h-5 w-5 text-indigo-600" />
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Schema Builder</h1>
                  <p className="text-xs text-slate-500">Define Objects, Fields & Relationships</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                onClick={() => navigate('/setup/schema-builder/preview')}
                data-testid="preview-schema-btn"
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Schema
              </Button>
              <Button 
                onClick={() => { setEditingObject(null); setObjectForm({ label: '', api_name: '', description: '', plural_label: '' }); setShowObjectModal(true); }}
                className="bg-indigo-600 hover:bg-indigo-700"
                data-testid="create-object-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Object
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Left Panel - Objects List */}
        <aside className="w-72 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-4">
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search objects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="search-objects-input"
                />
              </div>
            </div>

            <div className="space-y-1">
              {filteredObjects.map((obj) => {
                const ObjectIcon = getObjectIcon(obj);
                const isSelected = selectedObject?.id === obj.id;
                
                return (
                  <button
                    key={obj.id}
                    onClick={() => navigate(`/setup/schema-builder/${obj.id}`)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                      isSelected 
                        ? 'bg-indigo-50 border border-indigo-200' 
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                    data-testid={`object-item-${obj.api_name}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                        <ObjectIcon className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-slate-600'}`} />
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-slate-800">{obj.label}</div>
                        <div className="text-xs text-slate-500">{obj.api_name}</div>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                  </button>
                );
              })}

              {filteredObjects.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No objects found</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right Panel - Object Details */}
        <main className="flex-1 overflow-y-auto p-6">
          {selectedObject ? (
            <div className="max-w-4xl">
              {/* Object Header */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-100 rounded-xl">
                      {React.createElement(getObjectIcon(selectedObject), { className: 'h-6 w-6 text-indigo-600' })}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedObject.label}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{selectedObject.api_name}</Badge>
                        {!selectedObject.is_custom && (
                          <Badge variant="secondary">Standard</Badge>
                        )}
                      </div>
                      {selectedObject.description && (
                        <p className="text-sm text-slate-500 mt-2">{selectedObject.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openEditObject(selectedObject)}
                      data-testid="edit-object-btn"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => { setDeleteTarget({ type: 'object', item: selectedObject }); setShowDeleteConfirm(true); }}
                      data-testid="delete-object-btn"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>

              {/* Fields Section */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Fields</h3>
                    <p className="text-sm text-slate-500">Drag to reorder fields</p>
                  </div>
                  <Button 
                    onClick={() => { setEditingField(null); setFieldForm({ label: '', api_name: '', field_type: 'text', is_required: false, help_text: '', picklist_values: '', lookup_object: '' }); setShowFieldModal(true); }}
                    size="sm"
                    data-testid="add-field-btn"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Field
                  </Button>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={fields.map(f => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {fields.map((field) => (
                        <SortableFieldItem
                          key={field.id}
                          field={field}
                          onEdit={openEditField}
                          onDelete={(f) => { setDeleteTarget({ type: 'field', item: f }); setShowDeleteConfirm(true); }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {fields.length === 0 && (
                  <div className="text-center py-8 text-slate-500 border-2 border-dashed rounded-lg">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No fields defined yet</p>
                  </div>
                )}
              </div>

              {/* Relationships Section */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Relationships</h3>
                    <p className="text-sm text-slate-500">Lookup relationships to other objects</p>
                  </div>
                  <Button 
                    onClick={() => { setRelationshipForm({ label: '', api_name: '', target_object_id: '', is_required: false }); setShowRelationshipModal(true); }}
                    size="sm"
                    variant="outline"
                    data-testid="add-relationship-btn"
                  >
                    <Link className="h-4 w-4 mr-2" />
                    Add Relationship
                  </Button>
                </div>

                {relationships.length > 0 ? (
                  <div className="space-y-2">
                    {relationships.map((rel) => (
                      <div
                        key={rel.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Link className="h-4 w-4 text-indigo-600" />
                          <div>
                            <div className="font-medium text-slate-800">{rel.label}</div>
                            <div className="text-xs text-slate-500">
                              {rel.source_object?.label || 'Unknown'} → {rel.target_object?.label || 'Unknown'}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-50"
                          onClick={() => { setDeleteTarget({ type: 'relationship', item: rel }); setShowDeleteConfirm(true); }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 border-2 border-dashed rounded-lg">
                    <Link className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No relationships defined yet</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Database className="h-16 w-16 mb-4 opacity-30" />
              <h3 className="text-xl font-semibold mb-2">Select an Object</h3>
              <p className="text-sm mb-4">Choose an object from the left panel to view and edit its schema</p>
              <Button 
                onClick={() => { setEditingObject(null); setObjectForm({ label: '', api_name: '', description: '', plural_label: '' }); setShowObjectModal(true); }}
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Object
              </Button>
            </div>
          )}
        </main>
      </div>

      {/* Object Modal */}
      <Dialog open={showObjectModal} onOpenChange={setShowObjectModal}>
        <DialogContent className="sm:max-w-md" data-testid="object-modal">
          <DialogHeader>
            <DialogTitle>{editingObject ? 'Edit Object' : 'Create New Object'}</DialogTitle>
            <DialogDescription>
              {editingObject ? 'Update object properties' : 'Define a new schema object'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="object-label">Label *</Label>
              <Input
                id="object-label"
                value={objectForm.label}
                onChange={(e) => handleObjectLabelChange(e.target.value)}
                placeholder="e.g., Contact"
                data-testid="object-label-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="object-api-name">API Name *</Label>
              <Input
                id="object-api-name"
                value={objectForm.api_name}
                onChange={(e) => setObjectForm(prev => ({ ...prev, api_name: e.target.value }))}
                placeholder="e.g., contact"
                disabled={!!editingObject}
                data-testid="object-api-name-input"
              />
              {editingObject && (
                <p className="text-xs text-slate-500">API name cannot be changed after creation</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="object-plural">Plural Label</Label>
              <Input
                id="object-plural"
                value={objectForm.plural_label}
                onChange={(e) => setObjectForm(prev => ({ ...prev, plural_label: e.target.value }))}
                placeholder="e.g., Contacts"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="object-description">Description</Label>
              <Textarea
                id="object-description"
                value={objectForm.description}
                onChange={(e) => setObjectForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe this object..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowObjectModal(false)}>Cancel</Button>
            <Button onClick={handleSaveObject} disabled={!objectForm.label || !objectForm.api_name} data-testid="save-object-btn">
              {editingObject ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field Modal */}
      <Dialog open={showFieldModal} onOpenChange={setShowFieldModal}>
        <DialogContent className="sm:max-w-md" data-testid="field-modal">
          <DialogHeader>
            <DialogTitle>{editingField ? 'Edit Field' : 'Add New Field'}</DialogTitle>
            <DialogDescription>
              {editingField ? 'Update field properties' : `Add a new field to ${selectedObject?.label}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="field-label">Label *</Label>
              <Input
                id="field-label"
                value={fieldForm.label}
                onChange={(e) => handleFieldLabelChange(e.target.value)}
                placeholder="e.g., First Name"
                data-testid="field-label-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-api-name">API Name *</Label>
              <Input
                id="field-api-name"
                value={fieldForm.api_name}
                onChange={(e) => setFieldForm(prev => ({ ...prev, api_name: e.target.value }))}
                placeholder="e.g., first_name"
                disabled={!!editingField}
                data-testid="field-api-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-type">Field Type *</Label>
              <Select
                value={fieldForm.field_type}
                onValueChange={(value) => setFieldForm(prev => ({ ...prev, field_type: value }))}
                disabled={!!editingField}
              >
                <SelectTrigger data-testid="field-type-select">
                  <SelectValue placeholder="Select field type" />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingField && (
                <p className="text-xs text-slate-500">Field type cannot be changed after creation</p>
              )}
            </div>

            {/* Picklist values */}
            {fieldForm.field_type === 'picklist' && (
              <div className="space-y-2">
                <Label htmlFor="field-picklist">Picklist Values *</Label>
                <Textarea
                  id="field-picklist"
                  value={fieldForm.picklist_values}
                  onChange={(e) => setFieldForm(prev => ({ ...prev, picklist_values: e.target.value }))}
                  placeholder="Enter one value per line"
                  rows={4}
                />
                <p className="text-xs text-slate-500">Enter each option on a new line</p>
              </div>
            )}

            {/* Lookup object */}
            {fieldForm.field_type === 'lookup' && (
              <div className="space-y-2">
                <Label htmlFor="field-lookup">Lookup Object *</Label>
                <Select
                  value={fieldForm.lookup_object}
                  onValueChange={(value) => setFieldForm(prev => ({ ...prev, lookup_object: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target object" />
                  </SelectTrigger>
                  <SelectContent>
                    {objects.filter(o => o.id !== selectedObject?.id).map((obj) => (
                      <SelectItem key={obj.id} value={obj.api_name}>
                        {obj.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="field-required"
                checked={fieldForm.is_required}
                onCheckedChange={(checked) => setFieldForm(prev => ({ ...prev, is_required: checked }))}
              />
              <Label htmlFor="field-required" className="font-normal">Required field</Label>
            </div>

            {/* Include in Global Search - Only for searchable field types */}
            {['text', 'long_text', 'email', 'phone', 'picklist'].includes(fieldForm.field_type) && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="field-searchable"
                  checked={fieldForm.is_searchable}
                  onCheckedChange={(checked) => setFieldForm(prev => ({ ...prev, is_searchable: checked }))}
                  data-testid="include-in-search-toggle"
                />
                <Label htmlFor="field-searchable" className="font-normal">Include in Global Search</Label>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="field-help">Help Text</Label>
              <Input
                id="field-help"
                value={fieldForm.help_text}
                onChange={(e) => setFieldForm(prev => ({ ...prev, help_text: e.target.value }))}
                placeholder="Help text shown to users"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFieldModal(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveField} 
              disabled={!fieldForm.label || !fieldForm.api_name || (fieldForm.field_type === 'picklist' && !fieldForm.picklist_values) || (fieldForm.field_type === 'lookup' && !fieldForm.lookup_object)}
              data-testid="save-field-btn"
            >
              {editingField ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relationship Modal */}
      <Dialog open={showRelationshipModal} onOpenChange={setShowRelationshipModal}>
        <DialogContent className="sm:max-w-md" data-testid="relationship-modal">
          <DialogHeader>
            <DialogTitle>Add Relationship</DialogTitle>
            <DialogDescription>
              Create a lookup relationship from {selectedObject?.label} to another object
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rel-label">Relationship Label *</Label>
              <Input
                id="rel-label"
                value={relationshipForm.label}
                onChange={(e) => {
                  setRelationshipForm(prev => ({ 
                    ...prev, 
                    label: e.target.value,
                    api_name: generateApiName(e.target.value)
                  }));
                }}
                placeholder="e.g., Account"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rel-target">Target Object *</Label>
              <Select
                value={relationshipForm.target_object_id}
                onValueChange={(value) => setRelationshipForm(prev => ({ ...prev, target_object_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target object" />
                </SelectTrigger>
                <SelectContent>
                  {objects.filter(o => o.id !== selectedObject?.id).map((obj) => (
                    <SelectItem key={obj.id} value={obj.id}>
                      {obj.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rel-required"
                checked={relationshipForm.is_required}
                onCheckedChange={(checked) => setRelationshipForm(prev => ({ ...prev, is_required: checked }))}
              />
              <Label htmlFor="rel-required" className="font-normal">Required relationship</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRelationshipModal(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveRelationship} 
              disabled={!relationshipForm.label || !relationshipForm.target_object_id}
              data-testid="save-relationship-btn"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md" data-testid="delete-confirm-modal">
          <DialogHeader>
            <DialogTitle className="text-red-600">Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteTarget?.type}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-btn">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
