/**
 * Public Survey View - Multi-step Support (Matching Form Builder)
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import surveyService from '../services/surveyService';

const PublicSurveyView = () => {
  const { surveyId, publicLink } = useParams();
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({});
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState([]);
  const [startTime] = useState(Date.now());
console.log(error,"error")
  // Theme and Layout
  const [theme, setTheme] = useState({
    backgroundColor: '#f8fafc',
    cardBackgroundColor: '#ffffff',
    primaryColor: '#4f46e5',
    textColor: '#1e293b',
    buttonColor: '#10b981',
    fontFamily: 'Inter, system-ui, sans-serif'
  });
  const [layout, setLayout] = useState('1-column');

  useEffect(() => {
    loadPublicSurvey();
  }, [surveyId, publicLink]);

  const loadPublicSurvey = async () => {
    try {
      let surveyData;
      if (publicLink) {
        try {
          surveyData = await surveyService.getPublicSurvey(publicLink);
          console.log(surveyData)
          if(surveyData?.detail?.includes('expired')){
            setError('expired');
            setLoading(false);
            return;
          }
        } catch (err) {
          if (err.message && err.message.includes('expired')) {
            setError('expired');
            setLoading(false);
            return;
          }
          throw err;
        }
      } else {
        const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/survey-v2/surveys/${surveyId}/public`);
        if (response.status === 410) {
          setError('expired');
          setLoading(false);
          return;
        }
        surveyData = await response.json();
      }

      setSurvey(surveyData);

      // Load theme
      if (surveyData.settings?.theme) {
        setTheme(surveyData.settings.theme);
      } else if (surveyData.branding) {
        setTheme({
          backgroundColor: surveyData.branding.backgroundColor || '#f8fafc',
          cardBackgroundColor: surveyData.branding.cardBackgroundColor || '#ffffff',
          primaryColor: surveyData.branding.primaryColor || '#4f46e5',
          textColor: surveyData.branding.textColor || '#1e293b',
          buttonColor: surveyData.branding.buttonColor || '#10b981',
          fontFamily: surveyData.branding.fontFamily || 'Inter, system-ui, sans-serif'
        });
      }

      // Load layout
      if (surveyData.settings?.layout) {
        setLayout(surveyData.settings.layout);
      } else if (surveyData.branding?.layout) {
        setLayout(surveyData.branding.layout);
      }

      // Setup steps
      if (surveyData.steps && surveyData.steps.length > 0) {
        setSteps(surveyData.steps);
      } else if (surveyData.questions && surveyData.questions.length > 0) {
        setSteps([{ id: '1', title: 'Step 1', questions: surveyData.questions }]);
      }
    } catch (err) {
      console.error('Error loading survey:', err);
      setError('Survey not found or not published');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (questionId, value) => {
    setFormData(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const validateCurrentStep = () => {
    const currentStep = steps[currentStepIndex];
    if (!currentStep) return true;

    const missingFields = currentStep.questions.filter(q =>
      q.required && !formData[q.id]
    );

    if (missingFields.length > 0) {
      alert(`Please answer all required questions`);
      return false;
    }
    return true;
  };

  const handleNext = (e) => {
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
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLastStep) return;
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    try {
      const completionTime = Math.floor((Date.now() - startTime) / 1000);
      
      await surveyService.submitResponse(survey.id, {
        answers: formData,
        completed: true,
        completion_time_seconds: completionTime,
        last_page_reached: currentStepIndex + 1,
      });

      setSubmitted(true);
      setFormData({});
      setCurrentStepIndex(0);
    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Failed to submit survey. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (question) => {
    const value = formData[question.id];

    switch (question.type) {
      case 'short_text':
      case 'email':
      case 'phone':
        return (
          <input
            type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
            value={value || ''}
            onChange={(e) => handleInputChange(question.id, e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-opacity-50"
            style={{ borderColor: theme.primaryColor + '40', focusRing: theme.primaryColor }}
            placeholder="Your answer"
          />
        );

      case 'long_text':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => handleInputChange(question.id, e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 min-h-[100px]"
            style={{ borderColor: theme.primaryColor + '40' }}
            placeholder="Your answer"
          />
        );

      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <label key={option.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name={question.id}
                  value={option.value}
                  checked={value === option.value}
                  onChange={(e) => handleInputChange(question.id, e.target.value)}
                  className="w-4 h-4"
                  style={{ accentColor: theme.primaryColor }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <label key={option.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value || []).includes(option.value)}
                  onChange={(e) => {
                    const currentValues = value || [];
                    const newValues = e.target.checked
                      ? [...currentValues, option.value]
                      : currentValues.filter(v => v !== option.value);
                    handleInputChange(question.id, newValues);
                  }}
                  className="w-4 h-4"
                  style={{ accentColor: theme.primaryColor }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );

      case 'dropdown':
        return (
          <select
            value={value || ''}
            onChange={(e) => handleInputChange(question.id, e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            style={{ borderColor: theme.primaryColor + '40' }}
          >
            <option value="">Select an option</option>
            {question.options?.map((option) => (
              <option key={option.id} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'rating':
        return (
          <div className="flex gap-2">
            {Array.from({ length: question.max_value || 5 }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleInputChange(question.id, num)}
                className="w-12 h-12 rounded-full border-2 font-medium transition"
                style={{
                  backgroundColor: value === num ? theme.primaryColor : 'transparent',
                  borderColor: value === num ? theme.primaryColor : '#d1d5db',
                  color: value === num ? 'white' : theme.textColor
                }}
              >
                ★
              </button>
            ))}
          </div>
        );

      case 'nps':
        return (
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 11 }, (_, i) => i).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleInputChange(question.id, num)}
                className="w-10 h-10 rounded border-2 font-medium transition"
                style={{
                  backgroundColor: value === num ? theme.primaryColor : 'transparent',
                  borderColor: value === num ? theme.primaryColor : '#d1d5db',
                  color: value === num ? 'white' : theme.textColor
                }}
              >
                {num}
              </button>
            ))}
          </div>
        );

      case 'yes_no':
        return (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => handleInputChange(question.id, 'Yes')}
              className="flex-1 py-3 rounded-lg border-2 font-medium transition"
              style={{
                backgroundColor: value === 'Yes' ? theme.primaryColor : 'transparent',
                borderColor: value === 'Yes' ? theme.primaryColor : '#d1d5db',
                color: value === 'Yes' ? 'white' : theme.textColor
              }}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => handleInputChange(question.id, 'No')}
              className="flex-1 py-3 rounded-lg border-2 font-medium transition"
              style={{
                backgroundColor: value === 'No' ? theme.primaryColor : 'transparent',
                borderColor: value === 'No' ? theme.primaryColor : '#d1d5db',
                color: value === 'No' ? 'white' : theme.textColor
              }}
            >
              No
            </button>
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => handleInputChange(question.id, e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            style={{ borderColor: theme.primaryColor + '40' }}
          />
        );

      case 'file_upload':
        return (
          <div className="space-y-2">
            <input
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                try {
                  const uploadResult = await surveyService.uploadFile(file);
                  if (uploadResult.success) {
                    handleInputChange(question.id, uploadResult.file_url);
                  } else {
                    alert('Failed to upload file: ' + (uploadResult.error || 'Unknown error'));
                  }
                } catch (error) {
                  console.error('File upload error:', error);
                  alert('Failed to upload file. Please try again.');
                }
              }}
              className="w-full px-4 py-2 border rounded-lg"
              style={{ borderColor: theme.primaryColor + '40' }}
              accept={question.allowed_file_types?.join(',') || '*'}
            />
            {value && (
              <p className="text-sm text-green-600">✓ File uploaded successfully</p>
            )}
          </div>
        );

      case 'likert':
        return (
          <div className="space-y-3">
            {(question.likert_labels || ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree']).map((label, idx) => (
              <label key={idx} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name={question.id}
                  value={label}
                  checked={value === label}
                  onChange={(e) => handleInputChange(question.id, e.target.value)}
                  className="w-4 h-4"
                  style={{ accentColor: theme.primaryColor }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        );

      case 'matrix':
        const matrixValue = value || {};
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border p-2 bg-gray-50"></th>
                  {(question.matrix_columns || []).map((col, idx) => (
                    <th key={idx} className="border p-2 bg-gray-50 text-sm font-medium" style={{ color: theme.textColor }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(question.matrix_rows || []).map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="border p-2 font-medium text-sm" style={{ color: theme.textColor }}>{row}</td>
                    {(question.matrix_columns || []).map((col, colIdx) => (
                      <td key={colIdx} className="border p-2 text-center">
                        <input
                          type="radio"
                          name={`${question.id}_${row}`}
                          value={col}
                          checked={matrixValue[row] === col}
                          onChange={(e) => {
                            handleInputChange(question.id, {
                              ...matrixValue,
                              [row]: e.target.value
                            });
                          }}
                          className="w-4 h-4"
                          style={{ accentColor: theme.primaryColor }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'page_break':
        return null;

      default:
        return <p className="text-gray-500">Question type not supported</p>;
    }
  };

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor }}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 mb-4" style={{ borderColor: theme.primaryColor }}></div>
          <p style={{ color: theme.textColor }}>Loading survey...</p>
        </div>
      </div>
    );
  }

  if (error === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor }}>
        <div className="text-center p-8 rounded-lg" style={{ backgroundColor: theme.cardBackgroundColor }}>
          <div className="text-6xl mb-4">⏰</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: theme.textColor }}>Survey Expired</h2>
          <p style={{ color: theme.textColor }}>This survey is no longer accepting responses.</p>
        </div>
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor }}>
        <div className="text-center p-8 rounded-lg" style={{ backgroundColor: theme.cardBackgroundColor }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: theme.textColor }}>Survey Not Found</h2>
          <p style={{ color: theme.textColor }}>This survey may have been removed or is no longer active.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor, fontFamily: theme.fontFamily }}>
        <div className="max-w-md w-full p-8 rounded-lg text-center" style={{ backgroundColor: theme.cardBackgroundColor }}>
          <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: theme.primaryColor }} />
          <h2 className="text-2xl font-bold mb-2" style={{ color: theme.textColor }}>Thank You!</h2>
          <p style={{ color: theme.textColor }}>Your response has been submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: theme.backgroundColor, fontFamily: theme.fontFamily }}>
      <div className="max-w-4xl mx-auto">
        {/* Survey Header */}
        <div className="mb-8 p-8 rounded-lg" style={{ backgroundColor: theme.cardBackgroundColor }}>
          <h1 className="text-3xl font-bold mb-2" style={{ color: theme.textColor }}>{survey.title}</h1>
          {survey.description && (
            <p className="text-lg" style={{ color: theme.textColor + 'cc' }}>{survey.description}</p>
          )}
          
          {/* Step Progress */}
          {steps.length > 1 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium" style={{ color: theme.textColor }}>
                  Step {currentStepIndex + 1} of {steps.length}
                </span>
                <span className="text-sm" style={{ color: theme.textColor }}>
                  {Math.round(((currentStepIndex + 1) / steps.length) * 100)}% Complete
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
                    backgroundColor: theme.primaryColor
                  }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Questions */}
        <form onSubmit={handleSubmit}>
          <div className="p-8 rounded-lg mb-6" style={{ backgroundColor: theme.cardBackgroundColor }}>
            {currentStep && (
              <>
                {steps.length > 1 && (
                  <h2 className="text-xl font-semibold mb-6" style={{ color: theme.textColor }}>
                    {currentStep.title}
                  </h2>
                )}

                <div className={`space-y-6 ${
                  layout === '2-column' ? 'md:grid md:grid-cols-2 md:gap-6 md:space-y-0' :
                  layout === '3-column' ? 'md:grid md:grid-cols-3 md:gap-6 md:space-y-0' :
                  ''
                }`}>
                  {currentStep.questions.map((question, idx) => (
                    <div key={question.id} className="space-y-2">
                      <label className="block font-medium" style={{ color: theme.textColor }}>
                        {idx + 1}. {question.label}
                        {question.required && <span style={{ color: '#ef4444' }}> *</span>}
                      </label>
                      {question.description && (
                        <p className="text-sm" style={{ color: theme.textColor + 'aa' }}>{question.description}</p>
                      )}
                      {renderQuestion(question)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            {!isFirstStep && (
              <button
                type="button"
                onClick={handlePrevious}
                className="px-6 py-3 rounded-lg font-medium transition flex items-center gap-2"
                style={{
                  backgroundColor: 'transparent',
                  border: `2px solid ${theme.primaryColor}`,
                  color: theme.primaryColor
                }}
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>
            )}
            
            {!isLastStep ? (
              <button
                type="button"
                onClick={handleNext}
                className="ml-auto px-6 py-3 rounded-lg font-medium transition flex items-center gap-2"
                style={{ backgroundColor: theme.buttonColor, color: 'white' }}
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="ml-auto px-6 py-3 rounded-lg font-medium transition"
                style={{ backgroundColor: theme.buttonColor, color: 'white', opacity: submitting ? 0.5 : 1 }}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default PublicSurveyView;
