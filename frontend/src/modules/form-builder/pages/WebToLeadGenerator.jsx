import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, Code, CheckSquare, Square } from 'lucide-react';

const LEAD_FIELDS = [
  { id: 'first_name', label: 'First Name', type: 'text', required: true },
  { id: 'last_name', label: 'Last Name', type: 'text', required: true },
  { id: 'email', label: 'Email', type: 'email', required: true },
  { id: 'phone', label: 'Phone', type: 'phone', required: false },
  { id: 'company', label: 'Company', type: 'text', required: false },
  { id: 'job_title', label: 'Job Title', type: 'text', required: false },
  { id: 'industry', label: 'Industry', type: 'select', required: false, 
    options: ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Other'] },
  { id: 'annual_revenue', label: 'Annual Revenue', type: 'number', required: false },
  { id: 'website', label: 'Website', type: 'url', required: false },
  { id: 'lead_source', label: 'Lead Source', type: 'select', required: false,
    options: ['Website', 'Referral', 'Cold Call', 'Social Media', 'Advertisement', 'Partner', 'Trade Show', 'Email Campaign', 'Direct Mail', 'Other'] },
  { id: 'status', label: 'Status', type: 'select', required: false,
    options: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'] },
  { id: 'city', label: 'City', type: 'text', required: false },
  { id: 'state', label: 'State', type: 'text', required: false },
  { id: 'country', label: 'Country', type: 'text', required: false },
  { id: 'postal_code', label: 'Postal Code', type: 'text', required: false },
  { id: 'description', label: 'Description', type: 'textarea', required: false },
  { id: 'notes', label: 'Notes', type: 'textarea', required: false }
];

const WebToLeadGenerator = () => {
  const navigate = useNavigate();
  const [selectedFields, setSelectedFields] = useState(['first_name', 'last_name', 'email', 'company', 'phone', 'job_title', 'lead_source']);
  const [generatedSnippet, setGeneratedSnippet] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [tenantId, setTenantId] = useState(null);

  React.useEffect(() => {
    // Get tenant ID from localStorage or fetch from API
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setTenantId(payload.tenant_id);
      } catch (e) {
        console.error('Error parsing token:', e);
      }
    }
  }, []);

  const toggleField = (fieldId) => {
    const field = LEAD_FIELDS.find(f => f.id === fieldId);
    if (field.required) return; // Don't allow deselecting required fields
    
    if (selectedFields.includes(fieldId)) {
      setSelectedFields(selectedFields.filter(id => id !== fieldId));
    } else {
      setSelectedFields([...selectedFields, fieldId]);
    }
  };

  const selectAll = () => {
    setSelectedFields(LEAD_FIELDS.map(f => f.id));
  };

  const deselectAll = () => {
    setSelectedFields(LEAD_FIELDS.filter(f => f.required).map(f => f.id));
  };

  const generateHTMLSnippet = () => {
    const fields = LEAD_FIELDS.filter(f => selectedFields.includes(f.id));
    const API_URL = process.env.REACT_APP_BACKEND_URL || window.location.origin;

    const snippet = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web-to-Lead Form</title>
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
        <h1>Lead Information</h1>
        <p class="description">Please fill out the form below to get started.</p>
        
        <div id="message" class="message hidden"></div>
        
        <form id="web-to-lead-form">
${fields.map(field => {
  let fieldHTML = '';
  const required = field.required ? 'required' : '';
  const requiredLabel = field.required ? '<span class="required">*</span>' : '';
  
  switch (field.type) {
    case 'text':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="text" name="${field.id}" ${required} />
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
    case 'url':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <input type="url" name="${field.id}" ${required} />
            </div>`;
      break;
    case 'textarea':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <textarea name="${field.id}" ${required}></textarea>
            </div>`;
      break;
    case 'select':
      fieldHTML = `            <div class="form-group">
                <label>${field.label} ${requiredLabel}</label>
                <select name="${field.id}" ${required}>
                    <option value="">Select ${field.label}</option>
${(field.options || []).map(opt => `                    <option value="${opt}">${opt}</option>`).join('\n')}
                </select>
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
        const form = document.getElementById('web-to-lead-form');
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
                data[key] = value;
            }
            
            try {
                const response = await fetch('${API_URL}/api/web-to-lead/submit?tenant_key=${tenantId || ''}', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    messageDiv.textContent = 'Thank you! Your information has been submitted successfully.';
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
    setShowPreview(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedSnippet);
    toast.success('HTML snippet copied to clipboard!');
  };

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
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-slate-600" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Web-to-Lead Generator</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Generate HTML forms that create Leads in your CRM
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!showPreview ? (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Select Lead Fields</h2>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                  >
                    Reset to Required
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Choose which fields to include in your web form. Required fields are pre-selected and cannot be removed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {LEAD_FIELDS.map((field) => {
                const isSelected = selectedFields.includes(field.id);
                const isRequired = field.required;
                
                return (
                  <div
                    key={field.id}
                    onClick={() => toggleField(field.id)}
                    className={`
                      p-4 border-2 rounded-lg cursor-pointer transition-all
                      ${isSelected 
                        ? 'border-indigo-500 bg-indigo-50' 
                        : 'border-slate-200 bg-white hover:border-slate-300'}
                      ${isRequired ? 'cursor-not-allowed opacity-75' : ''}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5 text-indigo-600" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">
                          {field.label}
                          {isRequired && (
                            <span className="ml-2 text-xs text-red-600 font-semibold">REQUIRED</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Type: {field.type}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={generateHTMLSnippet}
                disabled={selectedFields.length === 0}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Code className="h-5 w-5" />
                Generate HTML Snippet
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Generated HTML Snippet</h2>
                <button
                  onClick={() => {
                    setShowPreview(false);
                    setGeneratedSnippet('');
                  }}
                  className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                >
                  ← Back to Field Selection
                </button>
              </div>
              
              <div className="mb-4">
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-xs max-h-96">
                  <code>{generatedSnippet}</code>
                </pre>
              </div>

              <button
                onClick={copyToClipboard}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 flex items-center justify-center gap-2"
              >
                <Copy className="h-5 w-5" />
                Copy HTML Snippet
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Code className="h-5 w-5" />
                How to Use This Snippet
              </h3>
              <ol className="space-y-2 text-sm text-blue-800 list-decimal list-inside">
                <li>Copy the HTML snippet above</li>
                <li>Create a new HTML file or paste into your existing webpage</li>
                <li>Upload to your website or web server</li>
                <li>When visitors submit the form, a new Lead will be created in your CRM</li>
                <li>View all submissions in the Leads section of your CRM</li>
              </ol>
              <div className="mt-4 p-3 bg-blue-100 rounded border border-blue-300">
                <p className="text-xs text-blue-900 font-medium">
                  <strong>Note:</strong> This form is production-ready and requires no additional setup.
                  It works on any website immediately after pasting.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebToLeadGenerator;
