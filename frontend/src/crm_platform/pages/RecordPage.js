import React, { useState, useEffect } from 'react';
import { Loader, AlertCircle } from 'lucide-react';
import platformService from '../services/platformService';
import Timeline from '../components/Timeline';
import FilesList from '../components/FilesList';

const RecordPage = ({ objectType, recordId, publicId, tenantId, onOpenRelated }) => {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        setLoading(true);
        setError(null);
        
        let recordData;
        if (publicId) {
          recordData = await platformService.resolvePublicId(publicId, tenantId);
        } else {
          recordData = await platformService.getRecord(objectType, recordId, tenantId);
        }
        
        setRecord(recordData);
      } catch (err) {
        setError(err.message || 'Failed to load record');
      } finally {
        setLoading(false);
      }
    };

    if (tenantId && (recordId || publicId)) {
      fetchRecord();
    }
  }, [objectType, recordId, publicId, tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Record not found</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {record._public_id || record.id || 'Record'}
          </h1>
          <p className="text-sm text-gray-500">
            {objectType} • {record._object_type}
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Record Details</h2>
          
          <div className="grid grid-cols-2 gap-6">
            {Object.entries(record)
              .filter(([key]) => !key.startsWith('_') && key !== 'tenant_id' && key !== 'password')
              .sort(([keyA], [keyB]) => {
                // Prioritize important fields
                const priority = ['first_name', 'last_name', 'name', 'email', 'phone', 'company', 'status'];
                const indexA = priority.indexOf(keyA);
                const indexB = priority.indexOf(keyB);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return keyA.localeCompare(keyB);
              })
              .map(([key, value]) => {
                // Format the value
                let displayValue = '—';
                if (value !== null && value !== undefined && value !== '') {
                  if (typeof value === 'object') {
                    displayValue = JSON.stringify(value, null, 2);
                  } else if (typeof value === 'boolean') {
                    displayValue = value ? 'Yes' : 'No';
                  } else if (key.includes('date') || key.includes('time')) {
                    try {
                      displayValue = new Date(value).toLocaleString();
                    } catch (e) {
                      displayValue = String(value);
                    }
                  } else {
                    displayValue = String(value);
                  }
                }
                
                return (
                  <div key={key} className="pb-3">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">
                      {key.replace(/_/g, ' ')}
                    </label>
                    <p className="text-sm text-gray-900">
                      {displayValue}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Timeline and Files */}
        <div className="mt-8 pt-6 border-t space-y-6">
          <Timeline 
            objectType={objectType}
            recordId={record._global_id || record.id}
            tenantId={tenantId}
          />
          
          <FilesList
            objectType={objectType}
            recordId={record._global_id || record.id}
            tenantId={tenantId}
          />
        </div>
      </div>
    </div>
  );
};

export default RecordPage;
