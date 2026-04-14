import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, ArrowRight, Upload, Check, Database, 
  FileSpreadsheet, Zap, CheckCircle2, AlertCircle, 
  ShieldCheck, Download, XCircle
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Progress } from '../../../components/ui/progress';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ImportWizard = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Object selection
  const [objects, setObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState('');
  const [jobName, setJobName] = useState('');
  const [importType, setImportType] = useState('insert');
  
  // Match configuration for Update/Upsert
  const [matchConfig, setMatchConfig] = useState({
    mode: 'id',
    fields: []
  });
  
  // Step 2: File upload
  const [uploadedFile, setUploadedFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [jobIdState, setJobIdState] = useState(jobId || '');
  
  // Step 3: Field mapping
  const [objectFields, setObjectFields] = useState([]);
  const [fieldMappings, setFieldMappings] = useState([]);
  
  // Step 4: Validation
  const [validationResult, setValidationResult] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validating, setValidating] = useState(false);
  
  // Step 5: Run Import
  const [importStarted, setImportStarted] = useState(false);

  useEffect(() => {
    fetchObjects();
  }, []);

  const fetchObjects = async () => {
    try {
      const response = await axios.get(`${API}/data-operations/metadata/objects`);
      setObjects(response.data);
    } catch (error) {
      console.error('Error fetching objects:', error);
      toast.error('Failed to load objects');
    }
  };

  // Step 1: Create job and select object
  const handleStep1Next = async () => {
    if (!selectedObject || !jobName) {
      toast.error('Please select an object and enter a job name');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/data-operations/import/jobs`, null, {
        params: {
          job_name: jobName,
          object_name: selectedObject,
          import_type: importType
        }
      });
      
      setJobIdState(response.data.id);
      toast.success('Job created successfully');
      setCurrentStep(2);
    } catch (error) {
      console.error('Error creating job:', error);
      toast.error('Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Upload CSV file
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `${API}/data-operations/import/jobs/${jobIdState}/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setUploadedFile(file);
      setCsvColumns(response.data.columns);
      setCsvPreview(response.data.preview);
      toast.success(`File uploaded: ${response.data.rows} rows`);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 to Step 3
  const handleStep2Next = async () => {
    if (!uploadedFile) {
      toast.error('Please upload a CSV file');
      return;
    }

    // Validate match config for Update/Upsert
    if (importType === 'update' || importType === 'upsert') {
      if (matchConfig.mode === 'id') {
        // Check if Id column exists
        const hasIdColumn = csvColumns.some(col => ['Id', 'id', 'ID', '_id'].includes(col));
        if (!hasIdColumn) {
          toast.error('CSV must contain an "Id" column for matching by Record ID');
          return;
        }
        setMatchConfig({ mode: 'id', fields: ['Id'] });
      } else if (!matchConfig.fields || matchConfig.fields.length === 0) {
        toast.error('Match configuration is required for Update/Upsert operations');
        return;
      }
      
      // Save match config
      try {
        await axios.post(
          `${API}/data-operations/import/jobs/${jobIdState}/match-config`,
          matchConfig
        );
      } catch (error) {
        console.error('Error saving match config:', error);
        toast.error('Failed to save match configuration');
        return;
      }
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API}/data-operations/metadata/objects/${selectedObject}/fields`);
      setObjectFields(response.data);
      
      // Initialize mappings
      const initialMappings = csvColumns.map(col => ({
        csv_column: col,
        field_name: '',
        field_type: ''
      }));
      setFieldMappings(initialMappings);
      
      setCurrentStep(3);
    } catch (error) {
      console.error('Error fetching fields:', error);
      toast.error('Failed to load object fields');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Save field mappings
  const handleStep3Next = async () => {
    const mappedFields = fieldMappings.filter(m => m.field_name);
    
    if (mappedFields.length === 0) {
      toast.error('Please map at least one field');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API}/data-operations/import/jobs/${jobIdState}/map-fields`,
        mappedFields
      );
      
      toast.success('Field mappings saved');
      setCurrentStep(4);
    } catch (error) {
      console.error('Error saving mappings:', error);
      toast.error('Failed to save mappings');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Validate
  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    setValidationErrors([]);
    
    try {
      const response = await axios.post(`${API}/data-operations/import/jobs/${jobIdState}/validate`);
      
      setValidationResult(response.data.validation_result);
      setValidationErrors(response.data.errors_preview || []);
      
      if (response.data.validation_result.is_valid) {
        toast.success('Validation passed! All rows are valid.');
      } else {
        toast.error(`Validation found ${response.data.validation_result.error_count} errors`);
      }
    } catch (error) {
      console.error('Error validating:', error);
      toast.error(error.response?.data?.detail || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  // Step 4 to Step 5
  const handleStep4Next = () => {
    if (!validationResult) {
      toast.error('Please validate the data first');
      return;
    }
    setCurrentStep(5);
  };

  // Step 5: Run Import
  const handleRunImport = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/data-operations/import/jobs/${jobIdState}/run`);
      
      setImportStarted(true);
      toast.success('Import started! Redirecting to job details...');
      
      setTimeout(() => {
        navigate(`/setup/jobs/import/${jobIdState}`);
      }, 2000);
    } catch (error) {
      console.error('Error starting import:', error);
      toast.error('Failed to start import');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadValidationErrors = () => {
    window.open(`${API}/data-operations/import/jobs/${jobIdState}/download/validation`, '_blank');
  };

  const handleFieldMappingChange = (csvColumn, fieldName) => {
    if (fieldName === '_skip') {
      setFieldMappings(prev =>
        prev.map(m =>
          m.csv_column === csvColumn
            ? { ...m, field_name: '', field_type: '' }
            : m
        )
      );
      return;
    }
    
    const field = objectFields.find(f => f.name === fieldName);
    setFieldMappings(prev =>
      prev.map(m =>
        m.csv_column === csvColumn
          ? { ...m, field_name: fieldName, field_type: field?.type || '' }
          : m
      )
    );
  };

  const steps = [
    { number: 1, title: 'Select Object', icon: Database },
    { number: 2, title: 'Upload CSV', icon: Upload },
    { number: 3, title: 'Map Fields', icon: FileSpreadsheet },
    { number: 4, title: 'Validate', icon: ShieldCheck },
    { number: 5, title: 'Run Import', icon: Zap }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/setup')}
                className="text-slate-600"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>
              <div className="h-6 w-px bg-slate-300" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">Import Builder</h1>
                <p className="text-sm text-slate-500">Import data from CSV files</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = currentStep > step.number;
              
              return (
                <React.Fragment key={step.number}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        isCompleted ? 'bg-green-600' : isActive ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-6 w-6 text-white" />
                      ) : (
                        <Icon className={`h-6 w-6 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      )}
                    </div>
                    <p className={`mt-2 text-sm font-medium ${
                      isActive ? 'text-indigo-600' : isCompleted ? 'text-green-600' : 'text-slate-500'
                    }`}>
                      {step.title}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-4 rounded ${
                      currentStep > step.number ? 'bg-green-600' : 'bg-slate-200'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Step 1: Select Object */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Object and Import Type</CardTitle>
              <CardDescription>Choose the object you want to import data into</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="jobName">Job Name</Label>
                <input
                  id="jobName"
                  type="text"
                  placeholder="e.g., Q1 Leads Import"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <Label htmlFor="object">Select Object</Label>
                <Select value={selectedObject} onValueChange={setSelectedObject}>
                  <SelectTrigger id="object" className="mt-1">
                    <SelectValue placeholder="Choose an object" />
                  </SelectTrigger>
                  <SelectContent>
                    {objects.map((obj) => (
                      <SelectItem key={obj.api_name} value={obj.api_name}>
                        {obj.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="importType">Import Type</Label>
                <Select value={importType} onValueChange={setImportType}>
                  <SelectTrigger id="importType" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insert">Insert (Create new records)</SelectItem>
                    <SelectItem value="update">Update (Edit existing records)</SelectItem>
                    <SelectItem value="upsert">Upsert (Insert or Update)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {importType === 'insert' && 'Create new records only'}
                  {importType === 'update' && 'Update existing records only (match key required)'}
                  {importType === 'upsert' && 'Update if match found, otherwise insert new record'}
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleStep1Next}
                  disabled={loading || !selectedObject || !jobName}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading ? 'Creating...' : 'Next'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Upload CSV */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV File</CardTitle>
              <CardDescription>
                Upload a CSV file containing the data you want to import (Max 10MB, 50,000 rows)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="file">Choose CSV File</Label>
                <div className="mt-2">
                  <input
                    id="file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-slate-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-indigo-50 file:text-indigo-700
                      hover:file:bg-indigo-100"
                  />
                </div>
              </div>

              {csvPreview && (
                <div>
                  <h3 className="font-medium text-slate-900 mb-2">Preview (First 10 rows)</h3>
                  <div className="border rounded-lg overflow-auto max-h-96">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          {csvColumns.map((col, idx) => (
                            <TableHead key={idx}>{col}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvPreview.slice(0, 10).map((row, idx) => (
                          <TableRow key={idx}>
                            {csvColumns.map((col, colIdx) => (
                              <TableCell key={colIdx}>{row[col]}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-sm text-slate-500 mt-2">
                    Total rows: <span className="font-medium">{csvPreview.length}</span>
                  </p>
                </div>
              )}

              {/* Match Configuration for Update/Upsert */}
              {(importType === 'update' || importType === 'upsert') && csvColumns.length > 0 && (
                <div className="mt-6 p-4 border-2 border-orange-200 rounded-lg bg-orange-50">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    <h3 className="font-semibold text-slate-900">Match Records By (Required)</h3>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">
                    {importType === 'update' 
                      ? 'Specify how to match existing records for updates. Records not found will fail.'
                      : 'Specify how to match existing records. If no match found, a new record will be created.'}
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="matchMode">Match Mode</Label>
                      <Select
                        value={matchConfig.mode}
                        onValueChange={(value) => setMatchConfig({ mode: value, fields: [] })}
                      >
                        <SelectTrigger id="matchMode" className="mt-1 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">Match by Record ID (Id)</SelectItem>
                          <SelectItem value="field">Match by Unique Field</SelectItem>
                          <SelectItem value="composite">Match by Composite Key</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {matchConfig.mode === 'id' && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                        <p className="text-sm text-blue-800">
                          ✓ Your CSV must include an "Id" column with existing record IDs.
                        </p>
                      </div>
                    )}

                    {matchConfig.mode === 'field' && (
                      <div>
                        <Label>Select Unique Field from CSV</Label>
                        <Select
                          value={matchConfig.fields[0] || ''}
                          onValueChange={(value) => setMatchConfig({ ...matchConfig, fields: [value] })}
                        >
                          <SelectTrigger className="mt-1 bg-white">
                            <SelectValue placeholder="Choose a field" />
                          </SelectTrigger>
                          <SelectContent>
                            {csvColumns.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {matchConfig.mode === 'composite' && (
                      <div>
                        <Label>Select Multiple Fields for Composite Key</Label>
                        <div className="mt-2 space-y-2">
                          {matchConfig.fields.map((field, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Select
                                value={field}
                                onValueChange={(value) => {
                                  const newFields = [...matchConfig.fields];
                                  newFields[idx] = value;
                                  setMatchConfig({ ...matchConfig, fields: newFields });
                                }}
                              >
                                <SelectTrigger className="bg-white">
                                  <SelectValue placeholder={`Field ${idx + 1}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {csvColumns.filter(col => !matchConfig.fields.includes(col) || col === field).map((col) => (
                                    <SelectItem key={col} value={col}>{col}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newFields = matchConfig.fields.filter((_, i) => i !== idx);
                                  setMatchConfig({ ...matchConfig, fields: newFields });
                                }}
                                className="text-red-600"
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                          {matchConfig.fields.length < 3 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMatchConfig({ ...matchConfig, fields: [...matchConfig.fields, ''] })}
                            >
                              + Add Field
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleStep2Next}
                  disabled={!uploadedFile}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Map Fields */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Map CSV Columns to Object Fields</CardTitle>
              <CardDescription>
                Match your CSV columns to the fields in the {selectedObject} object
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {csvColumns.map((csvCol) => {
                  const mapping = fieldMappings.find(m => m.csv_column === csvCol);
                  const mappedField = objectFields.find(f => f.name === mapping?.field_name);
                  
                  return (
                    <div key={csvCol} className="flex items-center space-x-4 p-4 border rounded-lg bg-slate-50">
                      <div className="flex-1">
                        <Label className="font-medium text-slate-900">{csvCol}</Label>
                        <p className="text-xs text-slate-500 mt-1">CSV Column</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                      <div className="flex-1">
                        <Select
                          value={mapping?.field_name || ''}
                          onValueChange={(value) => handleFieldMappingChange(csvCol, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_skip">-- Skip this column --</SelectItem>
                            {objectFields.map((field) => (
                              <SelectItem key={field.name} value={field.name}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{field.label}</span>
                                  {field.required && (
                                    <Badge variant="destructive" className="ml-2 text-xs">Required</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mappedField && (
                          <p className="text-xs text-slate-500 mt-1">Type: {mappedField.type}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleStep3Next}
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading ? 'Saving...' : 'Next'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Validate */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Validate Data (Dry Run)</CardTitle>
              <CardDescription>
                Check your data for errors before importing. This validation checks for:
                missing required fields, invalid formats, lookup references, and more.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Validation Action */}
              <div className="flex justify-center">
                <Button
                  onClick={handleValidate}
                  disabled={validating}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {validating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5 mr-2" />
                      Run Validation
                    </>
                  )}
                </Button>
              </div>

              {/* Validation Results */}
              {validationResult && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className={`p-6 rounded-lg border-2 ${
                    validationResult.is_valid 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-red-50 border-red-300'
                  }`}>
                    <div className="flex items-center gap-3 mb-4">
                      {validationResult.is_valid ? (
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                      ) : (
                        <XCircle className="h-8 w-8 text-red-600" />
                      )}
                      <div>
                        <h3 className={`text-lg font-bold ${
                          validationResult.is_valid ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {validationResult.is_valid 
                            ? 'Validation Passed!' 
                            : 'Validation Failed - Errors Found'}
                        </h3>
                        <p className={`text-sm ${
                          validationResult.is_valid ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {validationResult.is_valid 
                            ? 'All rows are valid and ready to import.'
                            : 'Please fix the errors before importing.'}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-slate-900">{validationResult.total_rows}</p>
                        <p className="text-sm text-slate-500">Total Rows</p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-green-600">{validationResult.valid_rows}</p>
                        <p className="text-sm text-slate-500">Valid Rows</p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-red-600">{validationResult.invalid_rows}</p>
                        <p className="text-sm text-slate-500">Invalid Rows</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {validationResult.total_rows > 0 && (
                      <div className="mt-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">Validation Progress</span>
                          <span className="font-medium">
                            {Math.round((validationResult.valid_rows / validationResult.total_rows) * 100)}% Valid
                          </span>
                        </div>
                        <Progress 
                          value={(validationResult.valid_rows / validationResult.total_rows) * 100} 
                          className="h-2"
                        />
                      </div>
                    )}
                  </div>

                  {/* Error Breakdown */}
                  {validationResult.error_summary && Object.keys(validationResult.error_summary).length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <h4 className="font-semibold text-slate-900 mb-3">Error Breakdown</h4>
                      <div className="space-y-2">
                        {Object.entries(validationResult.error_summary).map(([code, count]) => (
                          <div key={code} className="flex justify-between items-center">
                            <span className="text-sm text-slate-600">{code.replace(/_/g, ' ')}</span>
                            <Badge variant="destructive">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error Preview Table */}
                  {validationErrors.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-slate-900">Error Preview (First 50)</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadValidationErrors}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download All Errors
                        </Button>
                      </div>
                      <div className="border rounded-lg overflow-auto max-h-64">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead>Row</TableHead>
                              <TableHead>Field</TableHead>
                              <TableHead>Error Code</TableHead>
                              <TableHead>Message</TableHead>
                              <TableHead>Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {validationErrors.map((error, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{error.row}</TableCell>
                                <TableCell>{error.field}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-red-600">
                                    {error.error_code}
                                  </Badge>
                                </TableCell>
                                <TableCell className="max-w-xs truncate">{error.error_message}</TableCell>
                                <TableCell className="font-mono text-xs">{error.value}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleStep4Next}
                  disabled={!validationResult}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {validationResult?.is_valid ? 'Continue to Import' : 'Continue Anyway'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Run Import */}
        {currentStep === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Review and Run Import</CardTitle>
              <CardDescription>Review your import configuration and start the import process</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Warning if validation had errors */}
              {validationResult && !validationResult.is_valid && (
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <h4 className="font-semibold text-yellow-800">Warning: Validation Errors Found</h4>
                  </div>
                  <p className="text-sm text-yellow-700 mt-1">
                    {validationResult.invalid_rows} rows have errors and will fail during import.
                    Only {validationResult.valid_rows} rows will be processed successfully.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg bg-slate-50">
                  <p className="text-sm font-medium text-slate-700">Job Name</p>
                  <p className="text-lg font-semibold text-slate-900">{jobName}</p>
                </div>
                <div className="p-4 border rounded-lg bg-slate-50">
                  <p className="text-sm font-medium text-slate-700">Object</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {objects.find(o => o.api_name === selectedObject)?.label}
                  </p>
                </div>
                <div className="p-4 border rounded-lg bg-slate-50">
                  <p className="text-sm font-medium text-slate-700">Import Type</p>
                  <p className="text-lg font-semibold text-slate-900 capitalize">{importType}</p>
                </div>
                <div className="p-4 border rounded-lg bg-slate-50">
                  <p className="text-sm font-medium text-slate-700">Total Rows</p>
                  <p className="text-lg font-semibold text-slate-900">{csvPreview?.length || 0}</p>
                </div>
              </div>

              {/* Field Mappings Summary */}
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium text-slate-900 mb-3">Field Mappings</h3>
                <div className="space-y-2">
                  {fieldMappings
                    .filter(m => m.field_name)
                    .map((mapping, idx) => {
                      const field = objectFields.find(f => f.name === mapping.field_name);
                      return (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{mapping.csv_column}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span className="text-slate-900 font-medium">{field?.label}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {importStarted && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-sm font-medium text-green-900">Import started successfully!</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(4)} disabled={importStarted}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleRunImport}
                  disabled={loading || importStarted}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? 'Starting...' : importStarted ? 'Import Running...' : 'Run Import'}
                  <Zap className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ImportWizard;
