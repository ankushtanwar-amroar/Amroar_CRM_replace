import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import surveyService from '../services/surveyService';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Calendar, Clock, User, Mail, CheckCircle, XCircle, FileText } from 'lucide-react';

const ResponseViewer = () => {
  const { surveyId, responseId } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(null);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [surveyId, responseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [surveyData, responseData] = await Promise.all([
        surveyService.getSurvey(surveyId),
        surveyService.getResponse(surveyId, responseId)
      ]);
      setSurvey(surveyData);
      setResponse(responseData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatTime = (seconds) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const getQuestionById = (questionId) => {
    if (!survey) return null;
    
    // Check in steps first
    if (survey.steps && survey.steps.length > 0) {
      for (const step of survey.steps) {
        const question = step.questions.find(q => q.id === questionId);
        if (question) return question;
      }
    }
    
    // Check in legacy questions array
    if (survey.questions && survey.questions.length > 0) {
      return survey.questions.find(q => q.id === questionId);
    }
    
    return null;
  };

  const renderAnswer = (questionId, answer) => {
    const question = getQuestionById(questionId);
    if (!question) {
      return <span className="text-gray-600">{JSON.stringify(answer)}</span>;
    }

    switch (question.type) {
      case 'short_text':
      case 'long_text':
      case 'email':
      case 'phone':
      case 'date':
        return <span className="text-gray-900 font-medium">{answer}</span>;

      case 'multiple_choice':
      case 'dropdown':
        const option = question.options?.find(opt => opt.value === answer);
        return (
          <Badge variant="secondary" className="text-sm">
            {option ? option.label : answer}
          </Badge>
        );

      case 'checkbox':
        if (!Array.isArray(answer)) return <span className="text-gray-600">No selection</span>;
        return (
          <div className="flex flex-wrap gap-2">
            {answer.map((val, idx) => {
              const opt = question.options?.find(o => o.value === val);
              return (
                <Badge key={idx} variant="secondary" className="text-sm">
                  {opt ? opt.label : val}
                </Badge>
              );
            })}
          </div>
        );

      case 'rating':
        return (
          <div className="flex items-center gap-2">
            <div className="flex">
              {Array.from({ length: question.max_value || 5 }, (_, i) => i + 1).map((num) => (
                <span
                  key={num}
                  className="text-2xl"
                  style={{ color: num <= answer ? '#fbbf24' : '#d1d5db' }}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="font-medium text-lg ml-2">{answer} / {question.max_value || 5}</span>
          </div>
        );

      case 'nps':
        const npsColor = answer <= 6 ? '#ef4444' : answer <= 8 ? '#f59e0b' : '#10b981';
        return (
          <div className="flex items-center gap-3">
            <div
              className="px-4 py-2 rounded-lg font-bold text-white text-xl"
              style={{ backgroundColor: npsColor }}
            >
              {answer}
            </div>
            <span className="text-sm text-gray-600">
              {answer <= 6 ? 'Detractor' : answer <= 8 ? 'Passive' : 'Promoter'}
            </span>
          </div>
        );

      case 'yes_no':
        return (
          <Badge variant={answer === 'Yes' ? 'default' : 'secondary'} className="text-sm">
            {answer}
          </Badge>
        );

      case 'file_upload':
        if (typeof answer === 'string' && answer.startsWith('http')) {
          return (
            <a
              href={answer}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              View Uploaded File
            </a>
          );
        }
        return <span className="text-gray-600">{answer}</span>;

      default:
        return <span className="text-gray-600">{JSON.stringify(answer)}</span>;
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
          <p className="text-gray-600">Loading response...</p>
        </div>
      </div>
    );
  }

  if (!response || !survey) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate(`/survey-builder-v2/responses/${surveyId}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Responses
        </Button>
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-600">Response not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate(`/survey-builder-v2/responses/${surveyId}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Responses
        </Button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Response Details</h1>
            <p className="text-gray-600">{survey.title}</p>
          </div>
          {response.completed ? (
            <Badge className="bg-green-600 text-white">
              <CheckCircle className="w-4 h-4 mr-1" />
              Completed
            </Badge>
          ) : (
            <Badge variant="secondary">
              <XCircle className="w-4 h-4 mr-1" />
              Incomplete
            </Badge>
          )}
        </div>
      </div>

      {/* Respondent Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Respondent Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-medium">{response.respondent_name || 'Anonymous'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{response.respondent_email || 'Not provided'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Submitted</p>
                <p className="font-medium">{formatDate(response.started_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Time Taken</p>
                <p className="font-medium">{formatTime(response.completion_time_seconds)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Answers */}
      <Card>
        <CardHeader>
          <CardTitle>Responses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(response.answers || {}).map(([questionId, answer], index) => {
              const question = getQuestionById(questionId);
              if (!question) return null;

              return (
                <div key={questionId} className="border-b pb-6 last:border-b-0 last:pb-0">
                  <div className="mb-3">
                    <h3 className="font-semibold text-lg mb-1">
                      {index + 1}. {question.label}
                    </h3>
                    {question.description && (
                      <p className="text-sm text-gray-600">{question.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Type: {question.type.replace('_', ' ')}</p>
                  </div>
                  <div className="ml-4">
                    {answer !== null && answer !== undefined && answer !== '' ? (
                      renderAnswer(questionId, answer)
                    ) : (
                      <span className="text-gray-400 italic">No answer provided</span>
                    )}
                  </div>
                </div>
              );
            })}
            
            {Object.keys(response.answers || {}).length === 0 && (
              <p className="text-center text-gray-500 py-8">No answers recorded</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResponseViewer;
