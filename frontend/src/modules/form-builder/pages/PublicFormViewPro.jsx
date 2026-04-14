/**
 * Professional Public Form View - Multi-step Support
 * No Authentication Required
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${API_URL}/api/form-builder`;

const PublicFormViewPro = () => {
  const { formId } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({});
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState([]);

  // Theme and Layout State
  const [formTheme, setFormTheme] = useState({
    backgroundColor: '#f8fafc',
    cardBackgroundColor: '#ffffff',
    primaryColor: '#4f46e5',
    textColor: '#1e293b',
    buttonColor: '#10b981',
    fontFamily: 'Inter, system-ui, sans-serif'
  });
  const [formLayout, setFormLayout] = useState('1-column');

  useEffect(() => {
    loadPublicForm();
  }, [formId]);

  const loadPublicForm = async () => {
    try {
      const formResponse = await axios.get(`${API}/forms/${formId}/public`);
      const formData = formResponse.data;
      setForm(formData);

      // Load theme and layout settings
      if (formData.settings?.theme) {
        setFormTheme(formData.settings.theme);
      }
      if (formData.settings?.layout) {
        setFormLayout(formData.settings.layout);
      }

      // Setup steps - handle both multi-step and single-step forms
      if (formData.steps && formData.steps.length > 0) {
        setSteps(formData.steps);
      } else if (formData.fields && formData.fields.length > 0) {
        // Convert single-step form
        setSteps([{ id: '1', title: 'Step 1', fields: formData.fields }]);
      }
    } catch (err) {
      console.error('Error loading form:', err);
      setError('Form not found or not published');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const validateCurrentStep = () => {
    const currentStep = steps[currentStepIndex];
    if (!currentStep) return true;

    const missingFields = currentStep.fields.filter(field =>
      field.required &&
      field.type !== 'section' &&
      field.type !== 'divider' &&
      !formData[field.id]
    );

    if (missingFields.length > 0) {
      toast.error(`Please fill in all required fields: ${missingFields.map(f => f.label).join(', ')}`);
      return false;
    }
    return true;
  };

  const handleNext = (e) => {
    // Prevent any form submission
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (validateCurrentStep()) {
      setCurrentStepIndex(prev => Math.min(prev + 1, steps.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevious = (e) => {
    // Prevent any form submission
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // CRITICAL: Only submit on the last step, never before
    if (!isLastStep) {
      // This should never happen with proper button types, but safeguard it
      console.warn('Form submission attempted on non-final step. Ignoring.');
      return;
    }

    // Validate the current (last) step before submitting
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    try {
      // Use CRM-aware submission endpoint if form has CRM mapping enabled
      const submitEndpoint = form?.enable_crm_mapping
        ? `${API}/forms/${formId}/submit-with-crm`
        : `${API}/forms/${formId}/submit`;

      const response = await axios.post(submitEndpoint, formData);

      setSubmitted(true);
      setFormData({});
      setCurrentStepIndex(0);

      // Show appropriate success message
      if (response.data.crm_record_id) {
        toast.success('Form submitted successfully! CRM record created.');
      } else {
        toast.success('Form submitted successfully!');
      }

      // Log CRM record creation if available
      if (response.data.crm_record_id) {
        console.log('CRM Record Created:', response.data.crm_record_id);
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to submit form. Please try again.';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    // Prevent Enter key from submitting on non-final steps
    if (e.key === 'Enter' && !isLastStep && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      e.stopPropagation();
      // Call handleNext with event to ensure it prevents any form submission
      handleNext(e);
    }
  };

  const renderField = (field) => {
    const value = formData[field.id] || '';

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            id={field.id}
            value={value}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            rows={4}
          />
        );

      case 'select':
        return (
          <select
            id={field.id}
            value={value}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            required={field.required}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select...</option>
            {field.options?.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div className="border border-slate-300 rounded-md p-2 space-y-2 max-h-48 overflow-y-auto">
            {field.options?.map((opt, i) => (
              <label key={i} className="flex items-center hover:bg-slate-50 p-1 rounded cursor-pointer">
                <input
                  type="checkbox"
                  value={opt}
                  checked={Array.isArray(value) && value.includes(opt)}
                  onChange={(e) => {
                    const currentValues = Array.isArray(value) ? value : [];
                    const newValues = e.target.checked
                      ? [...currentValues, opt]
                      : currentValues.filter(v => v !== opt);
                    handleInputChange(field.id, newValues);
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((opt, i) => (
              <label key={i} className="flex items-center">
                <input
                  type="radio"
                  name={field.id}
                  value={opt}
                  checked={value === opt}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                  required={field.required}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {field.options?.map((opt, i) => (
              <label key={i} className="flex items-center">
                <input
                  type="checkbox"
                  value={opt}
                  checked={Array.isArray(value) && value.includes(opt)}
                  onChange={(e) => {
                    const currentValues = Array.isArray(value) ? value : [];
                    const newValues = e.target.checked
                      ? [...currentValues, opt]
                      : currentValues.filter(v => v !== opt);
                    handleInputChange(field.id, newValues);
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        );

      case 'rating':
        return (
          <div className="flex items-center space-x-1">
            {[...Array(field.maxRating || 5)].map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleInputChange(field.id, i + 1)}
                className={`text-2xl transition-colors ${value && i < value ? 'text-yellow-400' : 'text-slate-300'
                  } hover:text-yellow-400`}
              >
                ⭐
              </button>
            ))}
            {value && <span className="ml-2 text-sm text-slate-600">({value}/{field.maxRating || 5})</span>}
          </div>
        );

      case 'file':
      case 'image':
        return (
          <div>
            <input
              type="file"
              id={field.id}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (file) {
                  try {
                    // Show uploading state
                    const uploadingMessage = document.createElement('p');
                    uploadingMessage.id = `uploading-${field.id}`;
                    uploadingMessage.className = 'text-sm text-blue-600 mt-1';
                    uploadingMessage.textContent = 'Uploading...';
                    e.target.parentElement.appendChild(uploadingMessage);

                    // Upload file to S3
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/form-builder/forms/upload-file`, {
                      method: 'POST',
                      body: formData
                    });
                    
                    const result = await response.json();
                    
                    // Remove uploading message
                    const msg = document.getElementById(`uploading-${field.id}`);
                    if (msg) msg.remove();
                    
                    if (result.success) {
                      // Store the S3 URL
                      handleInputChange(field.id, result.file_url);
                      
                      // Show success message
                      const successMsg = document.createElement('p');
                      successMsg.className = 'text-sm text-green-600 mt-1';
                      successMsg.textContent = '✓ File uploaded successfully';
                      e.target.parentElement.appendChild(successMsg);
                      
                      // Remove success message after 3 seconds
                      setTimeout(() => successMsg.remove(), 3000);
                    } else {
                      throw new Error(result.error || 'Upload failed');
                    }
                  } catch (error) {
                    console.error('File upload error:', error);
                    
                    // Remove uploading message
                    const msg = document.getElementById(`uploading-${field.id}`);
                    if (msg) msg.remove();
                    
                    // Show error message
                    const errorMsg = document.createElement('p');
                    errorMsg.className = 'text-sm text-red-600 mt-1';
                    errorMsg.textContent = '✗ Upload failed. Please try again.';
                    e.target.parentElement.appendChild(errorMsg);
                    
                    setTimeout(() => errorMsg.remove(), 5000);
                  }
                }
              }}
              accept={field.type === 'image' ? 'image/*' : '*'}
              required={field.required}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            id={field.id}
            value={value}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            required={field.required}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        );

      case 'section':
        return (
          <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-2">
            {field.label}
          </h3>
        );

      case 'divider':
        return <hr className="my-6 border-slate-300" />;

      case 'grid':
        return (
          <div className={`grid gap-4 ${field.columns === 1 ? 'grid-cols-1' :
              field.columns === 2 ? 'grid-cols-2' :
                'grid-cols-3'
            }`}>
            {field.gridFields?.map((gf, i) => (
              <input
                key={i}
                type="text"
                placeholder={`Field ${i + 1}`}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            ))}
          </div>
        );

      default:
        return (
          <input
            type={field.type}
            id={field.id}
            value={value}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Form Not Available</h2>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-lg shadow-sm">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Thank You!</h2>
          <p className="text-slate-600 mb-6">
            {form?.settings?.thank_you_message || 'Your form has been submitted successfully.'}
          </p>
          {form?.settings?.allow_multiple_submissions && (
            <button
              onClick={() => {
                setSubmitted(false);
                setFormData({});
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700"
            >
              Submit Another Response
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: formTheme.backgroundColor, fontFamily: formTheme.fontFamily }}>
      {/* Toast Notifications */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />

      <div className="max-w-3xl mx-auto">
        {/* Multi-step Progress Indicator */}
        {steps.length > 1 && (
          <div className="rounded-lg shadow-sm p-6 mb-6" style={{ backgroundColor: formTheme.cardBackgroundColor }}>
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${index === currentStepIndex
                          ? 'scale-110'
                          : ''
                        }`}
                      style={{
                        backgroundColor: index === currentStepIndex
                          ? formTheme.primaryColor
                          : index < currentStepIndex
                            ? formTheme.buttonColor
                            : '#e2e8f0',
                        color: index <= currentStepIndex ? '#ffffff' : '#64748b',
                        transform: index === currentStepIndex ? 'scale(1.1)' : 'scale(1)'
                      }}
                    >
                      {index < currentStepIndex ? '✓' : index + 1}
                    </div>
                    <span className={`text-xs mt-2 font-medium ${index === currentStepIndex ? '' : ''
                      }`}
                      style={{
                        color: index === currentStepIndex ? formTheme.primaryColor : '#64748b'
                      }}>
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 rounded transition-all`}
                      style={{
                        backgroundColor: index < currentStepIndex ? formTheme.buttonColor : '#e2e8f0'
                      }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-lg shadow-sm p-8" style={{ backgroundColor: formTheme.cardBackgroundColor }}>
          <h1 className="text-3xl font-bold mb-2" style={{ color: formTheme.textColor }}>{form?.title}</h1>
          {form?.description && (
            <p className="mb-6" style={{ color: '#64748b' }}>{form.description}</p>
          )}
          {steps.length > 1 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: formTheme.textColor + '20' }}>
              <h2 className="text-xl font-semibold mb-4" style={{ color: formTheme.primaryColor }}>{currentStep?.title}</h2>
            </div>
          )}

          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} >
            <div className={`space-y-6 ${formLayout === '2-column' ? 'md:grid md:grid-cols-2 md:gap-4 md:space-y-0' :
                formLayout === '3-column' ? 'md:grid md:grid-cols-3 md:gap-4 md:space-y-0' :
                  ''
              }`}>
              {currentStep?.fields.map((field) => (
                <div key={field.id}>
                  {field.type !== 'section' && field.type !== 'divider' && (
                    <label className="block text-sm font-medium mb-2" style={{ color: formTheme.textColor }}>
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                  )}
                  {renderField(field)}
                </div>
              ))}
            </div>


            {/* Navigation Buttons */}

            <div>

              <div className={`flex border-t pt-6 border-t ${isFirstStep ? 'justify-end' : 'justify-between'
                }`} style={{ borderColor: formTheme.textColor + '20' }}>
                {!isFirstStep && (
                  <button
                    type="button"
                    onClick={(e) => handlePrevious(e)}
                    className="px-6 py-2 border rounded-md text-sm font-medium hover:bg-slate-50 transition-colors"
                    style={{
                      borderColor: formTheme.textColor + '20',
                      color: formTheme.textColor,
                      backgroundColor: 'transparent'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = formTheme.cardBackgroundColor + 'f0'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    <ChevronLeft className="h-4 w-4 inline mr-1" />
                    {formTheme.previousButtonText || 'Previous'}
                  </button>
                )}

                {!isLastStep ? (
                  <button
                    type="button"
                    onClick={(e) => handleNext(e)}
                    className="px-6 py-2 rounded-md text-sm font-medium transition-colors"
                    style={{ 
                      backgroundColor: formTheme.primaryColor,
                      color: formTheme.buttonTextColor || '#ffffff'
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    {formTheme.nextButtonText || 'Next'}
                    <ChevronRight className="h-4 w-4 inline ml-1" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-8 py-3 rounded-md font-medium transition-colors disabled:opacity-50"
                    style={{ 
                      backgroundColor: formTheme.buttonColor,
                      color: formTheme.buttonTextColor || '#ffffff'
                    }}
                    onMouseEnter={(e) => !submitting && (e.target.style.opacity = '0.9')}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    {submitting ? 'Submitting...' : (formTheme.submitButtonText || form?.settings?.submit_button_text || 'Submit form')}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PublicFormViewPro;
