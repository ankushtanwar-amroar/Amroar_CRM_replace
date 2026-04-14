import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import surveyService from '../services/surveyService';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Download, Eye, Trash2, Calendar, User, CheckCircle, XCircle } from 'lucide-react';

const SurveyResponses = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [surveyId, filter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [surveyData, responsesData] = await Promise.all([
        surveyService.getSurvey(surveyId),
        surveyService.getResponses(surveyId, {
          completed: filter === 'all' ? undefined : filter === 'completed'
        })
      ]);
      setSurvey(surveyData);
      setResponses(responsesData.responses || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      await surveyService.exportToCSV(surveyId);
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  const handleDeleteResponse = async (responseId) => {
    if (!window.confirm('Delete this response?')) return;
    try {
      await surveyService.deleteResponse(surveyId, responseId);
      loadData();
    } catch (error) {
      console.error('Error deleting response:', error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/survey-builder-v2')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Surveys
        </Button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{survey?.title || 'Survey Responses'}</h1>
            <p className="text-gray-600 mt-1">{responses.length} total responses</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/survey-builder-v2/analytics/${surveyId}`)}>
              View Analytics
            </Button>
            <Button onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Responses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{responses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {responses.filter(r => r.completed).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Incomplete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {responses.filter(r => !r.completed).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {responses.length > 0 
                ? Math.round((responses.filter(r => r.completed).length / responses.length) * 100)
                : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <Button 
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
          size="sm"
        >
          All
        </Button>
        <Button 
          variant={filter === 'completed' ? 'default' : 'outline'}
          onClick={() => setFilter('completed')}
          size="sm"
        >
          Completed
        </Button>
        <Button 
          variant={filter === 'incomplete' ? 'default' : 'outline'}
          onClick={() => setFilter('incomplete')}
          size="sm"
        >
          Incomplete
        </Button>
      </div>

      {/* Responses List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : responses.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-600">No responses yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {responses.map((response) => (
            <Card key={response.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {response.completed ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-orange-600" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          {response.respondent_name && (
                            <span className="font-medium">{response.respondent_name}</span>
                          )}
                          {response.respondent_email && (
                            <span className="text-sm text-gray-600">{response.respondent_email}</span>
                          )}
                          {!response.respondent_name && !response.respondent_email && (
                            <span className="text-sm text-gray-600">Anonymous</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(response.started_at)}
                          </span>
                          {response.completion_time_seconds && (
                            <span>{Math.round(response.completion_time_seconds / 60)} min</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Answer Preview */}
                    <div className="mt-3 text-sm text-gray-700">
                      <span className="font-medium">{Object.keys(response.answers || {}).length}</span> answers provided
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/survey-builder-v2/responses/${surveyId}/view/${response.id}`)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteResponse(response.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SurveyResponses;
