import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Check,
  X,
  Settings
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || '';

const RecordTypeManager = ({ objects }) => {
  const [selectedObject, setSelectedObject] = useState('');
  const [recordTypes, setRecordTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRecordType, setEditingRecordType] = useState(null);

  useEffect(() => {
    if (selectedObject) {
      fetchRecordTypes();
    }
  }, [selectedObject]);

  const fetchRecordTypes = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/objects/${selectedObject}/record-types`);
      setRecordTypes(response.data || []);
    } catch (error) {
      console.error('Error fetching record types:', error);
      toast.error('Failed to load record types');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recordType) => {
    if (!window.confirm(`Delete record type "${recordType.name}"?`)) return;

    try {
      await axios.delete(`${API}/api/record-types/${recordType.id}`);
      toast.success('Record type deleted successfully');
      fetchRecordTypes();
    } catch (error) {
      console.error('Error deleting record type:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete record type');
    }
  };

  return (
    <div className="space-y-4">
      {/* Object Selector */}
      <div>
        <Label>Select Object</Label>
        <Select value={selectedObject} onValueChange={setSelectedObject}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose an object..." />
          </SelectTrigger>
          <SelectContent>
            {objects.map((obj) => (
              <SelectItem key={obj.object_name} value={obj.object_name}>
                {obj.object_label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedObject && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Record Types for {objects.find(o => o.object_name === selectedObject)?.object_label}
            </h3>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Record Type
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : recordTypes.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
              <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-600 mb-2">No record types defined</p>
              <p className="text-sm text-slate-500 mb-4">Create record types to enable different business processes</p>
              <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create First Record Type
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recordTypes.map((rt) => (
                <div key={rt.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-lg">{rt.name}</h4>
                      <p className="text-sm text-slate-600 font-mono">{rt.api_name}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      {rt.is_default && (
                        <Badge className="bg-green-100 text-green-800 mr-2">Default</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingRecordType(rt)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rt)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {rt.description && (
                    <p className="text-sm text-slate-600 mb-3">{rt.description}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Status: {rt.is_active ? 'Active' : 'Inactive'}</span>
                    {rt.picklist_values && rt.picklist_values.length > 0 && (
                      <span>{rt.picklist_values.length} field filter(s)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      {(showCreateDialog || editingRecordType) && (
        <RecordTypeDialog
          isOpen={true}
          onClose={() => {
            setShowCreateDialog(false);
            setEditingRecordType(null);
          }}
          objectName={selectedObject}
          recordType={editingRecordType}
          onSuccess={() => {
            fetchRecordTypes();
            setShowCreateDialog(false);
            setEditingRecordType(null);
          }}
        />
      )}
    </div>
  );
};

// Create/Edit Record Type Dialog
const RecordTypeDialog = ({ isOpen, onClose, objectName, recordType, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    api_name: '',
    description: '',
    is_default: false,
    ...recordType
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (recordType) {
        // Update
        await axios.put(`${API}/api/record-types/${recordType.id}`, formData);
        toast.success('Record type updated successfully');
      } else {
        // Create
        await axios.post(`${API}/api/objects/${objectName}/record-types`, formData);
        toast.success('Record type created successfully');
      }
      onSuccess();
    } catch (error) {
      console.error('Error saving record type:', error);
      toast.error(error.response?.data?.detail || 'Failed to save record type');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recordType ? 'Edit' : 'Create'} Record Type</DialogTitle>
          <DialogDescription>
            Define a business process variant for this object
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Enterprise Lead"
              required
            />
          </div>

          <div>
            <Label>API Name *</Label>
            <Input
              value={formData.api_name}
              onChange={(e) => setFormData({ ...formData, api_name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              placeholder="e.g., enterprise_lead"
              className="font-mono"
              required
            />
            <p className="text-xs text-slate-500 mt-1">Use lowercase with underscores</p>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe this record type..."
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={formData.is_default}
              onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
            />
            <Label>Set as default record type</Label>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Saving...' : (recordType ? 'Update' : 'Create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RecordTypeManager;
