import React, { useState } from 'react';
import { Type, Plus, RefreshCw, Edit, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Switch } from '../../../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import CreateRecordTypeDialog from '../components/CreateRecordTypeDialog';
import RecordTypeDetailPage from './RecordTypeDetailPage';
import { useRecordTypes } from '../hooks/useRecordTypes';
import { toast } from 'react-hot-toast';

const RecordTypesPage = ({ objectName }) => {
  const { recordTypes, objectFields, loading, createRecordType, updateRecordType, deleteRecordType, refresh } = useRecordTypes(objectName);
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [selectedRecordType, setSelectedRecordType] = useState(null);

  const handleCreate = () => {
    setEditingType(null);
    setShowDialog(true);
  };

  const handleEdit = (type, e) => {
    e?.stopPropagation();
    setEditingType(type);
    setShowDialog(true);
  };

  const handleSave = async (data) => {
    if (editingType) {
      await updateRecordType(editingType.id, data);
    } else {
      await createRecordType(data);
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (window.confirm('Delete this record type?')) {
      try {
        await deleteRecordType(id);
        toast.success('Record type deleted');
      } catch (error) {
        toast.error('Failed to delete');
      }
    }
  };

  const handleToggleActive = async (type, e) => {
    e?.stopPropagation();
    try {
      await updateRecordType(type.id, { ...type, is_active: !type.is_active });
      toast.success(`Record type ${type.is_active ? 'deactivated' : 'activated'}`);
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  const handleSelectRecordType = (type) => {
    setSelectedRecordType(type);
  };

  const handleBackToList = () => {
    setSelectedRecordType(null);
    refresh();
  };

  // Show detail page if a record type is selected
  if (selectedRecordType) {
    return (
      <RecordTypeDetailPage
        objectName={objectName}
        recordTypeId={selectedRecordType.id}
        recordType={selectedRecordType}
        onBack={handleBackToList}
        objectFields={objectFields}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Type className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Record Types</h1>
            <p className="text-sm text-slate-500">Manage record types for {objectName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Record Type
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Record Type Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center w-24">Active</TableHead>
              <TableHead className="text-right w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : recordTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                  No record types defined. Click New Record Type to create one.
                </TableCell>
              </TableRow>
            ) : (
              recordTypes.map((type) => (
                <TableRow 
                  key={type.id} 
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => handleSelectRecordType(type)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {type.type_name}
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{type.description || '-'}</TableCell>
                  <TableCell className="text-center">
                    <Switch 
                      checked={type.is_active} 
                      onCheckedChange={() => {}} 
                      onClick={(e) => handleToggleActive(type, e)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => handleEdit(type, e)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => handleDelete(type.id, e)} className="text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">ℹ️ Record Types</p>
        <ul className="text-xs space-y-1">
          <li>Record types control which picklist values and page layouts are available</li>
          <li><strong>Click on a record type</strong> to configure field visibility settings</li>
          <li>For <strong>page assignments</strong>, use the Page Assignments section in the sidebar</li>
          <li>For <strong>dependent picklists</strong>, configure them in Fields & Relationships → Dependencies</li>
        </ul>
      </div>

      <CreateRecordTypeDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        objectName={objectName}
        onSave={handleSave}
        editType={editingType}
      />
    </div>
  );
};

export default RecordTypesPage;