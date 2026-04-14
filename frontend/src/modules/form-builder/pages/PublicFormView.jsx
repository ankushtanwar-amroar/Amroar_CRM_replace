/**
 * Public Form View - No Authentication Required
 * Allows anyone to fill and submit a published form
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, AlertCircle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${API_URL}/api/form-builder`;

const PublicFormView = () => {
  const { formId } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadPublicForm();
  }, [formId]);

  const loadPublicForm = async () => {
    try {
      // Try to get the form directly (will check if it's published in backend)
      const response = await axios.post(`${API}/forms/${formId}/submit`, {}, {
        validateStatus: (status) => status < 500
      });
      
      // If we get here, form exists, let's get its details for preview
      // We'll need to create a public endpoint for getting form details
      const formResponse = await axios.get(`${API}/forms/${formId}/public`);
      setForm(formResponse.data);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    const missingFields = form.fields.filter(field => 
      field.required && !formData[field.id]
    );

    if (missingFields.length > 0) {
      alert(`Please fill in all required fields: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/forms/${formId}/submit`, formData);
      setSubmitted(true);
      setFormData({});
    } catch (err) {
      console.error('Error submitting form:', err);
      alert('Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
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
                className={`text-2xl transition-colors ${
                  value && i < value ? 'text-yellow-400' : 'text-slate-300'
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
          <input
            type="file"
            id={field.id}
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                // For now, just store filename. In production, upload to storage
                handleInputChange(field.id, file.name);
              }
            }}
            accept={field.type === 'image' ? 'image/*' : '*'}
            required={field.required}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
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
          <div className={`grid gap-4 ${
            field.columns === 1 ? 'grid-cols-1' :
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
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{form?.title}</h1>
        {form?.description && (
          <p className="text-slate-600 mb-8">{form.description}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {form?.fields?.map((field) => (
            <div key={field.id}>
              {field.type !== 'section' && field.type !== 'divider' && (
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
              )}
              {renderField(field)}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : (form?.settings?.submit_button_text || 'Submit')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PublicFormView;
