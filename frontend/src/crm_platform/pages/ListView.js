import React, { useState, useEffect } from 'react';
import { Loader, AlertCircle, Search, Filter, Plus } from 'lucide-react';
import platformService from '../services/platformService';
import { useConsole } from '../contexts/ConsoleContext';

const ListView = ({ objectType, tenantId, onRecordClick }) => {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Use console context only if available (for backward compatibility)
  let openRecordAsSubtab = null;
  try {
    const consoleContext = useConsole();
    openRecordAsSubtab = consoleContext?.openRecordAsSubtab;
  } catch (e) {
    // Console context not available, use callback instead
  }

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch from CRM Platform API which connects to existing collections
        const data = await platformService.getRecords(objectType, tenantId, 50, 0);
        
        console.log('Fetched records:', data);
        setRecords(data.records || []);
        setTotal(data.total || 0);
      } catch (err) {
        console.error('Error fetching records:', err);
        setError(err.message || 'Failed to load records');
      } finally {
        setLoading(false);
      }
    };

    if (tenantId && objectType) {
      fetchRecords();
    }
  }, [objectType, tenantId]);

  const handleRecordClick = (record) => {
    // Use callback if provided, otherwise use console context
    if (onRecordClick) {
      onRecordClick(record);
    } else if (openRecordAsSubtab) {
      const recordId = record._global_id || record.id;
      const publicId = record._public_id;
      const title = record.name || record.first_name || publicId || recordId;
      openRecordAsSubtab(objectType, recordId, publicId, title);
    }
  };

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

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button className="flex items-center px-4 py-2 border rounded-lg hover:bg-gray-50">
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>
          </div>
          <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            New
          </button>
        </div>

        {/* Records count */}
        <div className="px-4 py-2 bg-gray-50 border-b text-sm text-gray-600">
          {total} items • Displaying {records.length}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                    {loading ? 'Loading...' : 'No records found. Create records from your CRM dashboard.'}
                  </td>
                </tr>
              ) : (
                records.map((record, index) => {
                  // Determine display name based on object type
                  let displayName = '—';
                  if (objectType === 'lead' || objectType === 'contact') {
                    displayName = `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.email || record.name;
                  } else if (objectType === 'account') {
                    displayName = record.name || record.company_name;
                  } else if (objectType === 'opportunity') {
                    displayName = record.name || record.title;
                  } else if (objectType === 'task') {
                    displayName = record.subject || record.title || record.description;
                  } else {
                    displayName = record.name || record.title || record.first_name;
                  }
                  
                  return (
                    <tr 
                      key={record.id || index} 
                      onClick={() => handleRecordClick(record)}
                      className="hover:bg-gray-50 cursor-pointer border-b"
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-blue-600 hover:underline">
                          {displayName || '—'}
                        </div>
                        {record.email && (
                          <div className="text-xs text-gray-500">{record.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {record._public_id || record.id?.substring(0, 8) || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 capitalize">
                        {record._object_type || objectType}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          record.status === 'active' || record.status === 'open' 
                            ? 'bg-green-100 text-green-800' 
                            : record.status === 'closed' || record.status === 'inactive'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {record.status || 'Active'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ListView;
