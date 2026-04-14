import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';

const ImportWizard = ({ objectType, tenantId, onComplete }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length > 0) {
          setHeaders(jsonData[0]);
          setData(jsonData.slice(1).filter(row => row.some(cell => cell)));
          setStep(2);
        }
      } catch (error) {
        console.error('Failed to parse file:', error);
        alert('Failed to parse file. Please ensure it\'s a valid CSV or Excel file.');
      }
    };

    if (selectedFile.name.endsWith('.csv')) {
      reader.readAsText(selectedFile);
    } else {
      reader.readAsBinaryString(selectedFile);
    }
  };

  const handleMapping = (sourceField, targetField) => {
    setFieldMapping(prev => ({
      ...prev,
      [sourceField]: targetField
    }));
  };

  const handleImport = async () => {
    setImporting(true);
    
    try {
      // Transform data based on mapping
      const mappedData = data.map(row => {
        const record = { tenant_id: tenantId };
        headers.forEach((header, index) => {
          const targetField = fieldMapping[header];
          if (targetField && row[index]) {
            record[targetField] = row[index];
          }
        });
        return record;
      });

      // In a real implementation, send to backend API
      console.log('Importing data:', mappedData);
      
      // Simulate import
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setResults({
        total: mappedData.length,
        success: mappedData.length,
        failed: 0
      });
      
      setStep(4);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Import Records</h2>
        <div className="mt-4 flex items-center justify-between">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div className={`w-20 h-0.5 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* Step 1: Upload File */}
        {step === 1 && (
          <div className="text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2">Upload CSV or Excel File</h3>
            <p className="text-sm text-gray-500 mb-4">
              Select a file containing the records you want to import
            </p>
            <label className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
              <FileText className="w-5 h-5 mr-2" />
              Choose File
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Step 2: Map Fields */}
        {step === 2 && (
          <div>
            <h3 className="text-lg font-medium mb-4">Map Fields</h3>
            <p className="text-sm text-gray-500 mb-4">
              Map your file columns to {objectType} fields
            </p>
            <div className="space-y-3">
              {headers.map((header, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">{header}</label>
                    <p className="text-xs text-gray-500">
                      Sample: {data[0] && data[0][index]}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <select
                      value={fieldMapping[header] || ''}
                      onChange={(e) => handleMapping(header, e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">-- Skip --</option>
                      <option value="name">Name</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="company">Company</option>
                      <option value="status">Status</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Confirm */}
        {step === 3 && (
          <div>
            <h3 className="text-lg font-medium mb-4">Preview & Confirm</h3>
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                Ready to import {data.length} records into {objectType}
              </p>
            </div>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {Object.values(fieldMapping).filter(Boolean).map((field, index) => (
                      <th key={index} className="px-4 py-2 text-left font-medium text-gray-700">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t">
                      {headers.map((header, colIndex) => {
                        const targetField = fieldMapping[header];
                        if (!targetField) return null;
                        return (
                          <td key={colIndex} className="px-4 py-2">
                            {row[colIndex] || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 5 && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing 5 of {data.length} records
                </p>
              )}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Start Import'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && results && (
          <div className="text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium mb-2">Import Complete</h3>
            <div className="space-y-2 mb-6">
              <p className="text-sm text-gray-600">Total records: {results.total}</p>
              <p className="text-sm text-green-600">Successfully imported: {results.success}</p>
              {results.failed > 0 && (
                <p className="text-sm text-red-600">Failed: {results.failed}</p>
              )}
            </div>
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportWizard;
