import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const ExcelObjectImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState('upload'); // 'upload', 'preview', 'creating', 'success'
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [validating, setValidating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [errors, setErrors] = useState([]);
  const [expandedErrors, setExpandedErrors] = useState(true);
  const [createdObject, setCreatedObject] = useState(null);

  const resetState = () => {
    setStep('upload');
    setFile(null);
    setPreviewData(null);
    setErrors([]);
    setCreatedObject(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        setFile(droppedFile);
        setErrors([]);
      } else {
        toast.error('Please upload an Excel file (.xlsx or .xls)');
      }
    }
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
        setErrors([]);
      } else {
        toast.error('Please upload an Excel file (.xlsx or .xls)');
      }
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/objects/import/template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'custom_object_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const handleValidate = async () => {
    if (!file) return;

    setValidating(true);
    setErrors([]);

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `${API}/api/objects/import/validate`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setPreviewData(response.data);
      
      if (response.data.valid) {
        setStep('preview');
      } else {
        setErrors(response.data.errors || []);
      }
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      if (typeof errorDetail === 'object' && errorDetail.errors) {
        setErrors(errorDetail.errors);
      } else {
        toast.error(errorDetail || 'Validation failed');
      }
    } finally {
      setValidating(false);
    }
  };

  const handleCreate = async () => {
    if (!file) return;

    setCreating(true);
    setStep('creating');

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `${API}/api/objects/import/create`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setCreatedObject(response.data.object);
      setStep('success');
      toast.success(`Created ${response.data.object.object_label} successfully!`);
      
      if (onSuccess) {
        onSuccess(response.data.object);
      }
    } catch (error) {
      setStep('preview');
      const errorDetail = error.response?.data?.detail;
      if (typeof errorDetail === 'object' && errorDetail.errors) {
        setErrors(errorDetail.errors);
      } else if (typeof errorDetail === 'object' && errorDetail.message) {
        toast.error(errorDetail.message);
      } else {
        toast.error(errorDetail || 'Failed to create object');
      }
    } finally {
      setCreating(false);
    }
  };

  const getFieldTypeColor = (type) => {
    const colors = {
      text: 'bg-blue-100 text-blue-700',
      number: 'bg-green-100 text-green-700',
      currency: 'bg-emerald-100 text-emerald-700',
      date: 'bg-purple-100 text-purple-700',
      datetime: 'bg-violet-100 text-violet-700',
      boolean: 'bg-amber-100 text-amber-700',
      picklist: 'bg-orange-100 text-orange-700',
      multipicklist: 'bg-rose-100 text-rose-700',
      lookup: 'bg-cyan-100 text-cyan-700',
      textarea: 'bg-slate-100 text-slate-700',
      email: 'bg-indigo-100 text-indigo-700',
      phone: 'bg-teal-100 text-teal-700',
      url: 'bg-sky-100 text-sky-700',
      percent: 'bg-lime-100 text-lime-700'
    };
    return colors[type] || 'bg-slate-100 text-slate-700';
  };

  const renderUploadStep = () => (
    <div className="space-y-4">
      {/* Download Template Link */}
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-green-600" />
          <span className="text-sm text-slate-700">Need a template?</span>
        </div>
        <Button
          variant="link"
          size="sm"
          onClick={handleDownloadTemplate}
          className="text-indigo-600 hover:text-indigo-700 p-0 h-auto"
          data-testid="download-template-btn"
        >
          <Download className="h-4 w-4 mr-1" />
          Download Sample Template
        </Button>
      </div>

      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive 
            ? 'border-indigo-500 bg-indigo-50' 
            : file 
              ? 'border-green-500 bg-green-50' 
              : 'border-slate-300 hover:border-slate-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        data-testid="excel-drop-zone"
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          data-testid="excel-file-input"
        />
        
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="h-10 w-10 text-green-600" />
            <div className="text-left">
              <p className="font-medium text-slate-900">{file.name}</p>
              <p className="text-sm text-slate-500">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setErrors([]);
              }}
              className="ml-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div>
            <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">
              Drag and drop your Excel file here
            </p>
            <p className="text-sm text-slate-500 mt-1">
              or click to browse
            </p>
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setExpandedErrors(!expandedErrors)}
          >
            {expandedErrors ? (
              <ChevronDown className="h-4 w-4 text-red-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-red-600" />
            )}
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="font-medium text-red-800">
              {errors.length} validation error{errors.length !== 1 ? 's' : ''} found
            </span>
          </div>
          
          {expandedErrors && (
            <ul className="mt-3 space-y-2 text-sm text-red-700 ml-6">
              {errors.map((error, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-red-400">•</span>
                  <span>
                    {error.sheet && <strong>[{error.sheet}]</strong>}{' '}
                    {error.row && `Row ${error.row}: `}
                    {error.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-slate-500 space-y-1">
        <p><strong>Excel Structure:</strong></p>
        <p>• <strong>Object</strong> sheet: Define object label, plural label, API name, description</p>
        <p>• <strong>Fields</strong> sheet: Define field label, API name, data type, required, picklist values</p>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      {/* Object Summary */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-900 mb-2">Object to Create</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-500">Label:</span>{' '}
            <span className="font-medium text-slate-900">{previewData?.object?.object_label}</span>
          </div>
          <div>
            <span className="text-slate-500">Plural:</span>{' '}
            <span className="font-medium text-slate-900">{previewData?.object?.object_plural}</span>
          </div>
          <div>
            <span className="text-slate-500">API Name:</span>{' '}
            <span className="font-mono text-slate-900">{previewData?.object?.object_name}</span>
          </div>
          <div>
            <span className="text-slate-500">Fields:</span>{' '}
            <span className="font-medium text-slate-900">{previewData?.field_count || previewData?.fields?.length}</span>
          </div>
        </div>
        {previewData?.object?.description && (
          <div className="mt-2 text-sm">
            <span className="text-slate-500">Description:</span>{' '}
            <span className="text-slate-700">{previewData.object.description}</span>
          </div>
        )}
      </div>

      {/* Fields Preview */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-2">
          Fields ({previewData?.fields?.length || 0})
        </h3>
        <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Label</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">API Name</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Type</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {previewData?.fields?.map((field, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">{field.label}</td>
                  <td className="px-3 py-2 font-mono text-slate-600 text-xs">{field.name}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-xs ${getFieldTypeColor(field.type)}`}>
                      {field.type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {field.required ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note about system fields */}
      <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded">
        <strong>Note:</strong> System fields (Created Date, Created By, Last Modified Date, 
        Last Modified By, Owner) will be automatically added to the object.
      </div>
    </div>
  );

  const renderCreatingStep = () => (
    <div className="flex flex-col items-center justify-center py-8">
      <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mb-4" />
      <p className="text-lg font-medium text-slate-900">Creating Custom Object...</p>
      <p className="text-sm text-slate-500 mt-1">
        Setting up {previewData?.object?.object_label} with {previewData?.fields?.length} fields
      </p>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>
      <p className="text-lg font-semibold text-slate-900">Object Created Successfully!</p>
      <p className="text-sm text-slate-500 mt-2 text-center">
        <strong>{createdObject?.object_label}</strong> has been created with{' '}
        {createdObject?.field_count} fields.
      </p>
      <div className="mt-4 bg-slate-50 rounded-lg p-4 w-full">
        <p className="text-sm text-slate-700">
          <strong>API Name:</strong>{' '}
          <span className="font-mono">{createdObject?.object_name}</span>
        </p>
        <p className="text-xs text-slate-500 mt-2">
          The object is now available in Object Manager. You can customize its layouts, 
          add validation rules, and start creating records.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="excel-import-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
            {step === 'success' ? 'Object Created' : 'Create Object from Excel'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload an Excel file to create a custom object with fields.'}
            {step === 'preview' && 'Review the object and fields before creating.'}
            {step === 'creating' && 'Please wait while we create your custom object...'}
            {step === 'success' && 'Your custom object has been created successfully.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'upload' && renderUploadStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'creating' && renderCreatingStep()}
          {step === 'success' && renderSuccessStep()}
        </div>

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleValidate}
                disabled={!file || validating}
                className="bg-indigo-600 hover:bg-indigo-700"
                data-testid="validate-excel-btn"
              >
                {validating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    Validate & Preview
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-green-600 hover:bg-green-700"
                data-testid="create-object-btn"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create Object
                  </>
                )}
              </Button>
            </>
          )}
          
          {step === 'success' && (
            <Button
              onClick={handleClose}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelObjectImportModal;
