/**
 * Form Builder Main Page
 * Lists all forms with create, edit, delete, preview, duplicate actions
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
  Plus, Edit, Trash2, Eye, Copy, Share2, 
  BarChart, FileText, Search, Filter, ArrowLeft, Code, X
} from 'lucide-react';
import * as FormService from '../services/formBuilderService';

const FormBuilderPage = () => {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'published', 'draft'
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  });
  
  // HTML Snippet Modal State
  const [showSnippetModal, setShowSnippetModal] = useState(false);
  const [selectedForm, setSelectedForm] = useState(null);
  const [selectedFields, setSelectedFields] = useState([]);
  const [generatedSnippet, setGeneratedSnippet] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    loadForms();
  }, [currentPage, statusFilter]);

  const loadForms = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10'
      });
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      const response = await FormService.getForms(`?${params.toString()}`);
      setForms(response.forms || []);
      setPagination(response.pagination || pagination);
    } catch (error) {
      console.error('Error loading forms:', error);
      alert('Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadForms();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleCreateNew = () => {
    navigate('/form-builder/editor');
  };

  const handleEdit = (formId) => {
    navigate(`/form-builder/editor/${formId}`);
  };

  const handleDelete = async (formId) => {
    if (!window.confirm('Are you sure you want to delete this form? This action cannot be undone.')) {
      return;
    }

    try {
      await FormService.deleteForm(formId);
      alert('Form deleted successfully');
      loadForms();
    } catch (error) {
      console.error('Error deleting form:', error);
      alert('Failed to delete form');
    }
  };

  const handleDuplicate = async (formId) => {
    try {
      await FormService.duplicateForm(formId);
      alert('Form duplicated successfully');
      loadForms();
    } catch (error) {
      console.error('Error duplicating form:', error);
      alert('Failed to duplicate form');
    }
  };

  const handlePublish = async (formId) => {
    try {
      const result = await FormService.publishForm(formId);
      alert(`Form published! Shareable link: ${result.shareable_link}`);
      loadForms();
    } catch (error) {
      console.error('Error publishing form:', error);
      alert('Failed to publish form');
    }
  };

  const handleViewSubmissions = (formId) => {
    navigate(`/form-builder/submissions/${formId}`);
  };


  const handleGenerateSnippet = async (form) => {
    setSelectedForm(form);
    setSelectedFields(form.fields.map(f => f.id)); // Select all fields by default
    setShowSnippetModal(true);
  };

  const generateHTMLSnippet = () => {
    if (!selectedForm || selectedFields.length === 0) {
      toast.error('Please select at least one field');
      return;
    }

    const formFields = selectedForm.fields.filter(f => selectedFields.includes(f.id));
    const API_URL = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    
    const snippet = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${selectedForm.title}</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f8fafc;
            padding: 20px;
        }
        .form-container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #1e293b;
            margin-bottom: 8px;
            font-size: 24px;
        }
        .description {
            color: #64748b;
            margin-bottom: 24px;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 6px;
            color: #334155;
            font-weight: 500;
            font-size: 14px;
        }
        label .required {
            color: #ef4444;
        }
        input[type="text"],
        input[type="email"],
        input[type="tel"],
        input[type="number"],
        input[type="date"],
        input[type="url"],
        textarea,
        select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-size: 14px;
            color: #1e293b;
            background-color: white;
        }
        input:focus,
        textarea:focus,
        select:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        textarea {
            min-height: 100px;
            resize: vertical;
        }
        .radio-group,
        .checkbox-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .radio-option,
        .checkbox-option {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        button[type="submit"] {
            width: 100%;
            padding: 12px;
            background-color: #6366f1;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        button[type="submit"]:hover {
            background-color: #4f46e5;
        }
        button[type="submit"]:disabled {
            background-color: #94a3b8;
            cursor: not-allowed;
        }
        .message {
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .success {
            background-color: #dcfce7;
            color: #166534;
            border: 1px solid #86efac;
        }
        .error {
            background-color: #fee2e2;
            color: #991b1b;
            border: 1px solid #fca5a5;
        }
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="form-container">
        <h1>${selectedForm.title}</h1>
        ${selectedForm.description ? `<p class="description">${selectedForm.description}</p>` : ''}
        
        <div id="message" class="message hidden"></div>
        
        <form id="crm-form">
${formFields.map(field => {
  let fieldHTML = '';
  const required = field.required ? 'required' : '';
  const requiredLabel = field.required ? '<span class="required">*</span>' : '';
  
  switch (field.type) {
    case 'short_text':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="text" name="${field.id}" ${required} />
            </div>`;
      break;
    case 'long_text':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <textarea name="${field.id}" ${required}></textarea>
            </div>`;
      break;
    case 'email':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="email" name="${field.id}" ${required} />
            </div>`;
      break;
    case 'phone':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="tel" name="${field.id}" ${required} />
            </div>`;
      break;
    case 'number':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="number" name="${field.id}" ${required} />
            </div>`;
      break;
    case 'date':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="date" name="${field.id}" ${required} />
            </div>`;
      break;
    case 'url':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="url" name="${field.id}" ${required} />
            </div>`;
      break;
    case 'dropdown':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <select name="${field.id}" ${required}>
                    <option value="">Select an option</option>
${(field.options || []).map(opt => `                    <option value="${opt.value}">${opt.label}</option>`).join('\n')}
                </select>
            </div>`;
      break;
    case 'radio':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <div class="radio-group">
${(field.options || []).map(opt => `                    <label class="radio-option">
                        <input type="radio" name="${field.id}" value="${opt.value}" ${required} />
                        ${opt.label}
                    </label>`).join('\n')}
                </div>
            </div>`;
      break;
    case 'checkbox':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <div class="checkbox-group">
${(field.options || []).map(opt => `                    <label class="checkbox-option">
                        <input type="checkbox" name="${field.id}[]" value="${opt.value}" />
                        ${opt.label}
                    </label>`).join('\n')}
                </div>
            </div>`;
      break;
    default:
      fieldHTML = `            <!-- ${field.type} field type not supported -->`;
  }
  return fieldHTML;
}).join('\n\n')}

            <button type="submit" id="submit-btn">Submit</button>
        </form>
    </div>

    <script>
        const form = document.getElementById('crm-form');
        const submitBtn = document.getElementById('submit-btn');
        const messageDiv = document.getElementById('message');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
            messageDiv.className = 'message hidden';
            
            const formData = new FormData(form);
            const data = {};
            
            for (const [key, value] of formData.entries()) {
                if (key.endsWith('[]')) {
                    const actualKey = key.slice(0, -2);
                    if (!data[actualKey]) {
                        data[actualKey] = [];
                    }
                    data[actualKey].push(value);
                } else {
                    data[key] = value;
                }
            }
            
            try {
                const response = await fetch('${API_URL}/api/form-builder/forms/${selectedForm.id}/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ form_data: data })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    messageDiv.textContent = 'Form submitted successfully!';
                    messageDiv.className = 'message success';
                    form.reset();
                } else {
                    throw new Error(result.message || 'Submission failed');
                }
            } catch (error) {
                messageDiv.textContent = 'Error: ' + error.message;
                messageDiv.className = 'message error';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit';
            }
        });
    </script>
</body>
</html>`;

    setGeneratedSnippet(snippet);
  };

  const copySnippetToClipboard = () => {
    navigator.clipboard.writeText(generatedSnippet);
    toast.success('HTML snippet copied to clipboard!');
  };


  // Using server-side filtering now, so forms array is already filtered

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading forms...</p>
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
               <button
                onClick={() => navigate('/setup')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center space-x-2"
                title="Back to CRM"
              >
                <ArrowLeft className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700 hidden sm:inline">Back to CRM</span>
              </button> 
              <div>
                
                <h1 className="text-3xl font-bold text-slate-900 text-center">Form Builder</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Create, manage, and analyze your forms with AI assistance
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/form-builder/web-to-lead')}
                  className="inline-flex items-center px-4 py-2 border border-indigo-600 rounded-md shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Code className="h-5 w-5 mr-2" />
                  Web-to-Lead Generator
                </button>
                <button
                  onClick={handleCreateNew}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create New Form
                </button>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="mt-6 flex items-center space-x-4">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search forms..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Forms</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Forms Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {forms.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-2 text-sm font-medium text-slate-900">No forms</h3>
            <p className="mt-1 text-sm text-slate-500">
              {searchTerm ? 'No forms match your search.' : 'Get started by creating a new form.'}
            </p>
            {!searchTerm && (
              <div className="mt-6">
                <button
                  onClick={handleCreateNew}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create New Form
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <div
                key={form.id}
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-slate-900 truncate">
                      {form.title}
                    </h3>
                    {form.is_published && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Published
                      </span>
                    )}
                  </div>
                  {form.description && (
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                      {form.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                    <div className="flex items-center space-x-4">
                      <span>{form.fields?.length || 0} fields</span>
                      <span>{form.submission_count || 0} submissions</span>
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-slate-400">
                    Updated {new Date(form.updated_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="bg-slate-50 px-5 py-3 flex items-center justify-between space-x-2">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(form.id)}
                      className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 shadow-sm text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      title="Edit"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleViewSubmissions(form.id)}
                      className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 shadow-sm text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      title="View Submissions"
                    >
                      <BarChart className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleGenerateSnippet(form)}
                      className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 shadow-sm text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      title="Generate HTML Snippet"
                    >
                      <Code className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(form.id)}
                      className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 shadow-sm text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex space-x-2">
                    {!form.is_published && (
                      <button
                        onClick={() => handlePublish(form.id)}
                        className="inline-flex items-center px-2.5 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        title="Publish"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(form.id)}
                      className="inline-flex items-center px-2.5 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <div className="text-sm text-slate-700">
              Showing page {pagination.page} of {pagination.total_pages} ({pagination.total} total forms)
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!pagination.has_prev}
                className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              {/* Page numbers */}
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(pagination.total_pages - 4, currentPage - 2)) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        pageNum === currentPage
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-700 bg-white border border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!pagination.has_next}
                className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* HTML Snippet Modal */}
      {showSnippetModal && selectedForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">
                  Generate HTML Snippet
                </h2>
                <button
                  onClick={() => {
                    setShowSnippetModal(false);
                    setGeneratedSnippet('');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Select fields to include in your external HTML form
              </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {!generatedSnippet ? (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-slate-900">Select Fields</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedFields(selectedForm.fields.map(f => f.id))}
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => setSelectedFields([])}
                          className="text-xs text-slate-600 hover:text-slate-800"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {selectedForm.fields.map((field) => (
                        <label
                          key={field.id}
                          className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFields.includes(field.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFields([...selectedFields, field.id]);
                              } else {
                                setSelectedFields(selectedFields.filter(id => id !== field.id));
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-slate-900">{field.label}</div>
                            <div className="text-xs text-slate-500">
                              {field.type} {field.required && '· Required'}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <h3 className="font-medium text-slate-900 mb-3">Generated HTML Snippet</h3>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-xs max-h-96">
                      <code>{generatedSnippet}</code>
                    </pre>
                  </div>
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
                    <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                      <li>Copy the HTML snippet above</li>
                      <li>Paste it into your website's HTML file</li>
                      <li>The form will submit data to your CRM automatically</li>
                      <li>Submissions will appear in your Form Submissions page</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSnippetModal(false);
                  setGeneratedSnippet('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              {!generatedSnippet ? (
                <button
                  onClick={generateHTMLSnippet}
                  disabled={selectedFields.length === 0}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Generate Snippet
                </button>
              ) : (
                <button
                  onClick={copySnippetToClipboard}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copy Snippet
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormBuilderPage;
