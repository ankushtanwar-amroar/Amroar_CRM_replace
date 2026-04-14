import React, { useState, useEffect } from 'react';
import { Loader, AlertCircle, Search, Filter, Plus, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { Button } from '../../components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const DynamicListView = ({ objectApiName, tenantId, onRecordClick }) => {
  const [records, setRecords] = useState([]);
  const [objectInfo, setObjectInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  useEffect(() => {
    fetchRecords();
    fetchObjectInfo();
  }, [objectApiName, page]);

  const fetchObjectInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/objects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const objects = response.data;
      const currentObject = objects.find(obj => obj.object_name === objectApiName);
      setObjectInfo(currentObject);
    } catch (err) {
      console.error('Error fetching object info:', err);
    }
  };

  const fetchRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        paginate: 'true',
        sort_by: 'series_id',
        sort_order: 'asc'
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      const response = await axios.get(
        `${BACKEND_URL}/api/objects/${objectApiName}/records?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('CRM API response:', response.data);
      
      if (response.data.records) {
        setRecords(response.data.records);
        setTotalRecords(response.data.pagination?.total || response.data.records.length);
      } else {
        setRecords(response.data);
        setTotalRecords(response.data.length);
      }
    } catch (err) {
      console.error('Error fetching records:', err);
      setError(err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchRecords();
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

  // Get field keys from object info
  const fieldKeys = objectInfo?.fields ? Object.keys(objectInfo.fields).slice(0, 5) : [];
  const nameField = objectInfo?.name_field || fieldKeys[0] || 'name';

  return (
    <div className="h-full flex flex-col bg-white">
      {/* List View Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {objectInfo?.object_plural || objectApiName.charAt(0).toUpperCase() + objectApiName.slice(1) + 's'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {totalRecords} items • All Records
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={fetchRecords}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="default" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Name
              </th>
              {fieldKeys.slice(1, 5).map((fieldKey) => (
                <th 
                  key={fieldKey} 
                  className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  {objectInfo?.fields[fieldKey]?.label || fieldKey}
                </th>
              ))}
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {records.length === 0 ? (
              <tr>
                <td colSpan={fieldKeys.length + 2} className="px-6 py-12 text-center text-slate-500">
                  No records found. Create records from the main CRM or use the New button.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr 
                  key={record.id}
                  onClick={() => onRecordClick && onRecordClick(record)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-slate-600">
                      {record.series_id || record.id}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-blue-600 hover:underline">
                      {record.data?.[nameField] || 'Untitled'}
                    </div>
                  </td>
                  {fieldKeys.slice(1, 5).map((fieldKey) => {
                    const fieldValue = record.data?.[fieldKey];
                    return (
                      <td key={fieldKey} className="px-6 py-4">
                        <div className="text-sm text-slate-900">
                          {fieldValue !== null && fieldValue !== undefined 
                            ? String(fieldValue) 
                            : '—'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {record.created_at ? new Date(record.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalRecords > 50 && (
        <div className="border-t px-6 py-3 bg-slate-50 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {((page - 1) * 50) + 1} - {Math.min(page * 50, totalRecords)} of {totalRecords} records
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              disabled={page * 50 >= totalRecords}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DynamicListView;
