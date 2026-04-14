import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  ArrowLeft, ArrowRight, Download, Check, Database, 
  FileSpreadsheet, Search, X, Plus, Filter
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Checkbox } from '../../../components/ui/checkbox';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ExportWizard = () => {
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Object selection
  const [objects, setObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState('');
  const [jobName, setJobName] = useState('');
  
  // Step 2: Field selection
  const [objectFields, setObjectFields] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  
  // Step 3: Filters
  const [filters, setFilters] = useState([]);
  
  // Step 4: Output options
  const [outputFormat, setOutputFormat] = useState('csv');
  const [encoding, setEncoding] = useState('utf-8');
  
  // Step 5: Job execution
  const [jobId, setJobId] = useState('');
  const [exportStarted, setExportStarted] = useState(false);

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

  const fetchObjectFields = async (objectName) => {
    try {
      const response = await axios.get(`${API}/data-operations/metadata/objects/${objectName}/fields`);
      setObjectFields(response.data);
    } catch (error) {
      console.error('Error fetching fields:', error);
      toast.error('Failed to load object fields');
    }
  };

  // Step 1: Select object
  const handleStep1Next = async () => {
    if (!selectedObject || !jobName) {
      toast.error('Please select an object and enter a job name');
      return;
    }

    setLoading(true);
    try {
      await fetchObjectFields(selectedObject);
      setCurrentStep(2);
    } catch (error) {
      toast.error('Failed to load object fields');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Select fields
  const handleStep2Next = () => {
    if (selectedFields.length === 0) {
      toast.error('Please select at least one field to export');
      return;
    }
    setCurrentStep(3);
  };

  const toggleFieldSelection = (fieldName) => {
    if (selectedFields.includes(fieldName)) {
      setSelectedFields(selectedFields.filter(f => f !== fieldName));
    } else {
      setSelectedFields([...selectedFields, fieldName]);
    }
  };

  const selectAllFields = () => {
    setSelectedFields(objectFields.map(f => f.name));
  };

  const clearAllFields = () => {
    setSelectedFields([]);
  };

  const filteredFields = objectFields.filter(field => 
    field.name.toLowerCase().includes(fieldSearchQuery.toLowerCase()) ||
    field.label.toLowerCase().includes(fieldSearchQuery.toLowerCase())
  );

  // Step 3: Filters
  const addFilter = () => {
    setFilters([...filters, { field: '', operator: 'equals', value: '' }]);
  };

  const removeFilter = (index) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index, key, value) => {
    const newFilters = [...filters];
    newFilters[index][key] = value;
    setFilters(newFilters);
  };

  const handleStep3Next = () => {
    // Validate filters have required fields
    const invalidFilters = filters.filter(f => f.field && !f.value);
    if (invalidFilters.length > 0) {
      toast.error('Please complete all filter values or remove empty filters');
      return;
    }
    setCurrentStep(4);
  };

  // Step 4: Output options
  const handleStep4Next = () => {
    setCurrentStep(5);
  };

  const getPreviewFilename = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    return `${selectedObject}_export_${timestamp}.${outputFormat}`;
  };

  // Step 5: Run export
  const handleRunExport = async () => {
    setLoading(true);
    setExportStarted(true);
    
    try {
      // Create export job
      const createResponse = await axios.post(`${API}/data-operations/export/jobs`, {
        job_name: jobName,
        object_name: selectedObject,
        selected_fields: selectedFields,
        filters: filters.filter(f => f.field && f.value), // Only include complete filters
        output_format: outputFormat
      });
      
      const createdJobId = createResponse.data.id;
      setJobId(createdJobId);
      
      // Start export
      await axios.post(`${API}/data-operations/export/jobs/${createdJobId}/run`);
      
      toast.success('Export started successfully');
      
      // Navigate to job detail page
      navigate(`/setup/jobs/export/${createdJobId}`);
      
    } catch (error) {
      console.error('Error running export:', error);
      toast.error(error.response?.data?.detail || 'Failed to start export');
      setExportStarted(false);
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { num: 1, label: 'Select Object' },
      { num: 2, label: 'Select Fields' },
      { num: 3, label: 'Add Filters' },
      { num: 4, label: 'Output Options' },
      { num: 5, label: 'Run Export' }
    ];

    return (
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <React.Fragment key={step.num}>
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                currentStep === step.num 
                  ? 'bg-blue-600 text-white' 
                  : currentStep > step.num 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {currentStep > step.num ? <Check className="w-5 h-5" /> : step.num}
              </div>
              <span className="text-xs mt-2 text-gray-600 text-center max-w-20">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-1 mx-2 ${
                currentStep > step.num ? 'bg-green-600' : 'bg-gray-200'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/setup/export-builder')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Export Wizard</h1>
          <p className="text-sm text-gray-600">Export data to CSV files</p>
        </div>
      </div>

      {renderStepIndicator()}

      <Card>
        <CardContent className="pt-6">
          {/* Step 1: Select Object */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label>Export Job Name *</Label>
                <Input
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="e.g., Monthly Leads Export"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Select Object *</Label>
                <Select value={selectedObject} onValueChange={setSelectedObject}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Choose an object" />
                  </SelectTrigger>
                  <SelectContent>
                    {objects.map(obj => (
                      <SelectItem key={obj.name} value={obj.name}>
                        {obj.label} ({obj.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button onClick={handleStep1Next} disabled={loading}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Select Fields */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>Select Fields to Export *</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAllFields}>
                      Select All ({objectFields.length})
                    </Button>
                    <Button variant="outline" size="sm" onClick={clearAllFields}>
                      Clear All
                    </Button>
                  </div>
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search fields..."
                    value={fieldSearchQuery}
                    onChange={(e) => setFieldSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="border rounded-lg max-h-96 overflow-y-auto p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {filteredFields.map(field => (
                      <div key={field.name} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedFields.includes(field.name)}
                          onCheckedChange={() => toggleFieldSelection(field.name)}
                        />
                        <label className="text-sm cursor-pointer flex-1">
                          {field.label}
                          <span className="text-gray-500 text-xs ml-2">({field.name})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <Badge variant="secondary">
                    {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
                  </Badge>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleStep2Next}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Add Filters */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>Filter Records (Optional)</Label>
                  <Button variant="outline" size="sm" onClick={addFilter}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Filter
                  </Button>
                </div>

                {filters.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                    <Filter className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No filters added. All records will be exported.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filters.map((filter, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <Select 
                          value={filter.field} 
                          onValueChange={(value) => updateFilter(index, 'field', value)}
                        >
                          <SelectTrigger className="w-1/3">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {objectFields.map(field => (
                              <SelectItem key={field.name} value={field.name}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select 
                          value={filter.operator} 
                          onValueChange={(value) => updateFilter(index, 'operator', value)}
                        >
                          <SelectTrigger className="w-1/4">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="greater_than">Greater Than</SelectItem>
                            <SelectItem value="less_than">Less Than</SelectItem>
                            <SelectItem value="in">In (comma-separated)</SelectItem>
                          </SelectContent>
                        </Select>

                        <Input
                          placeholder="Value"
                          value={filter.value}
                          onChange={(e) => updateFilter(index, 'value', e.target.value)}
                          className="flex-1"
                        />

                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeFilter(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleStep3Next}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Output Options */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <Label>Output Format *</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV (Comma-Separated Values)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Encoding</Label>
                <Select value={encoding} onValueChange={setEncoding}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf-8">UTF-8 (Recommended)</SelectItem>
                    <SelectItem value="latin1">Latin-1</SelectItem>
                    <SelectItem value="ascii">ASCII</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <Label className="text-blue-900 font-semibold mb-2 block">File Preview</Label>
                <div className="flex items-center gap-2 text-blue-800">
                  <FileSpreadsheet className="w-5 h-5" />
                  <code className="text-sm">{getPreviewFilename()}</code>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleStep4Next}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Run Export */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ready to Export</h3>
                
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Object:</span>
                    <span className="text-gray-700">{selectedObject}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Fields:</span>
                    <span className="text-gray-700">{selectedFields.length} selected</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Filters:</span>
                    <span className="text-gray-700">
                      {filters.filter(f => f.field && f.value).length} active
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Format:</span>
                    <span className="text-gray-700">{outputFormat.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(4)} disabled={exportStarted}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button 
                  onClick={handleRunExport} 
                  disabled={loading || exportStarted}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? 'Starting...' : 'Run Export'}
                  <Download className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportWizard;
