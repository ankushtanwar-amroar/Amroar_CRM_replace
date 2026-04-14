/**
 * Form Submissions Viewer
 * Display and export form submissions
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { ArrowLeft, Download, Search, Calendar, Eye, X } from 'lucide-react';
import * as FormService from '../services/formBuilderService';

const FormSubmissions = () => {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewSubmission, setPreviewSubmission] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  });

  useEffect(() => {
    loadData();
  }, [formId, currentPage]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10'
      });
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      const [formData, submissionsResponse] = await Promise.all([
        FormService.getForm(formId),
        FormService.getFormSubmissions(formId, `?${params.toString()}`)
      ]);
      
      setForm(formData);
      
      // Handle both old array format and new paginated format
      if (Array.isArray(submissionsResponse)) {
        // Old format - just an array
        setSubmissions(submissionsResponse);
      } else if (submissionsResponse && submissionsResponse.submissions) {
        // New format - object with submissions array and pagination
        setSubmissions(submissionsResponse.submissions || []);
        setPagination(submissionsResponse.pagination || pagination);
      } else {
        setSubmissions([]);
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
      toast.error('Failed to load submissions');
      setSubmissions([]); // Ensure it's always an array
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadData();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleExport = async () => {
    try {
      const result = await FormService.exportSubmissions(formId);
      
      // Create and download CSV file
      const blob = new Blob([result.csv_data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      alert('Submissions exported successfully!');
    } catch (error) {
      console.error('Error exporting submissions:', error);
      alert('Failed to export submissions');
    }
  };

  // Submissions are already filtered from backend
  const displayedSubmissions = submissions;

  // Get key fields for table (first 5-6 important fields)
  const getKeyFields = () => {
    if (!form?.fields) return [];
    // Priority: email, name, phone, then first 3 other fields
    const emailField = form.fields.find(f => f.type === 'email');
    const nameField = form.fields.find(f => f.label.toLowerCase().includes('name'));
    const phoneField = form.fields.find(f => f.type === 'phone' || f.label.toLowerCase().includes('phone'));
    
    let keyFields = [];
    if (nameField) keyFields.push(nameField);
    if (emailField) keyFields.push(emailField);
    if (phoneField) keyFields.push(phoneField);
    
    // Add other fields up to 5 total
    const otherFields = form.fields.filter(f => 
      f.type !== 'section' && 
      f.type !== 'divider' && 
      !keyFields.includes(f)
    ).slice(0, 5 - keyFields.length);
    
    return [...keyFields, ...otherFields].slice(0, 5);
  };

  const handlePreview = (submission) => {
    setPreviewSubmission(submission);
    setShowPreviewModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading submissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => navigate('/form-builder')}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <ArrowLeft className="h-5 w-5 text-slate-600" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{form?.title}</h1>
                  <p className="text-sm text-slate-500">Form Submissions</p>
                </div>
              </div>
              <button
                onClick={handleExport}
                disabled={submissions.length === 0}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </button>
            </div>

            {/* Stats */}
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <dt className="text-sm font-medium text-slate-500 truncate">Total Submissions</dt>
                  <dd className="mt-1 text-3xl font-semibold text-slate-900">{pagination.total || 0}</dd>
                </div>
              </div>
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <dt className="text-sm font-medium text-slate-500 truncate">Form Fields</dt>
                  <dd className="mt-1 text-3xl font-semibold text-slate-900">{form?.fields?.length || 0}</dd>
                </div>
              </div>
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <dt className="text-sm font-medium text-slate-500 truncate">Latest Submission</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">
                    {submissions.length > 0 
                      ? new Date(submissions[0].submitted_at).toLocaleDateString() 
                      : 'N/A'
                    }
                  </dd>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="mt-6">
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search submissions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          {displayedSubmissions.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-2 text-sm font-medium text-slate-900">No submissions yet</h3>
              <p className="mt-1 text-sm text-slate-500">
                {searchTerm ? 'No submissions match your search.' : 'Submissions will appear here once people fill out your form.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      ID
                    </th>
                    {getKeyFields().map((field) => (
                      <th key={field.id} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        {field.label}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {displayedSubmissions.map((submission) => (
                    <tr key={submission.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {submission.id.substring(0, 8)}...
                      </td>
                      {getKeyFields().map((field) => (
                        <td key={field.id} className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                              {(() => {
                            const value = submission.data[field.id];
                            const fieldDef = form?.fields?.find(f => f.id === field.id);
                            
                            // Handle file upload fields
                            if (fieldDef?.type === 'file' && value && typeof value === 'string' && value.startsWith('http')) {
                              return (
                                <a
                                  href={value}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  📎 View File
                                </a>
                              );
                            }
                            
                            // Handle arrays
                            if (Array.isArray(value)) {
                              return value.join(', ');
                            }
                            
                            // Default
                            return value || '-';
                          })()}
                        </td>
                      ))}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {new Date(submission.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <button
                          onClick={() => handlePreview(submission)}
                          className="inline-flex items-center px-3 py-1.5 border border-slate-300 shadow-sm text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.total > 0 && (
            <div className="mt-6 flex items-center justify-between border-t border-slate-200 p-4">
              <div className="text-sm text-slate-600">
                Showing page {pagination.page} of {pagination.total_pages} ({pagination.total} total submissions)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={!pagination.has_prev}
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                {[...Array(Math.min(5, pagination.total_pages))].map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-2 border rounded-md text-sm font-medium ${
                        currentPage === pageNum
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(pagination.total_pages, prev + 1))}
                  disabled={!pagination.has_next}
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && previewSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Submission Preview</h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-md">
                  <p className="text-xs text-slate-500">Submission ID</p>
                  <p className="text-sm font-medium text-slate-900">{previewSubmission.id}</p>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-md">
                  <p className="text-xs text-slate-500">Submitted At</p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(previewSubmission.submitted_at).toLocaleString()}
                  </p>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Form Data</h4>
                  {form?.fields?.filter(f => f.type !== 'section' && f.type !== 'divider').map((field) => (
                    <div key={field.id} className="mb-3">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-900">
                        {(() => {
                          const value = previewSubmission.data[field.id];
                          
                          // Handle file upload fields
                          if (field.type === 'file' && value && typeof value === 'string' && value.startsWith('http')) {
                            return (
                              <a
                                href={value}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-2"
                              >
                                📎 Download File
                                <span className="text-xs text-slate-500">({value.split('/').pop()})</span>
                              </a>
                            );
                          }
                          
                          // Handle arrays
                          if (Array.isArray(value)) {
                            return value.join(', ');
                          }
                          
                          // Default
                          return value || '-';
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormSubmissions;
