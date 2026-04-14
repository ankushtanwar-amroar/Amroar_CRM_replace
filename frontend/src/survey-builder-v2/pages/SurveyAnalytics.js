import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import surveyService from '../services/surveyService';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ArrowLeft, Sparkles, Download, TrendingUp, Users, Target, Clock } from 'lucide-react';

const SurveyAnalytics = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingInsights, setGeneratingInsights] = useState(false);

  useEffect(() => {
    loadData();
  }, [surveyId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [surveyData, analyticsData] = await Promise.all([
        surveyService.getSurvey(surveyId),
        surveyService.getAnalytics(surveyId)
      ]);
      setSurvey(surveyData);
      setAnalytics(analyticsData);
      if (surveyData.ai_insights) {
        setAiInsights(surveyData.ai_insights);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAIInsights = async () => {
    try {
      setGeneratingInsights(true);
      const insights = await surveyService.aiAnalyzeResponses(surveyId);
      setAiInsights(insights);
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setGeneratingInsights(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const report = await surveyService.aiGeneratePDFReport(surveyId);
      alert('PDF Report generated! (Integration pending)');
      console.log('PDF Report:', report);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

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
            <h1 className="text-3xl font-bold">{survey?.title || 'Survey Analytics'}</h1>
            <p className="text-gray-600 mt-1">Comprehensive insights and statistics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={generateAIInsights} disabled={generatingInsights}>
              <Sparkles className="w-4 h-4 mr-2" />
              {generatingInsights ? 'Generating...' : 'AI Insights'}
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.total_responses || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <Target className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{analytics?.completion_rate || 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg. Time</CardTitle>
            <Clock className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round((analytics?.average_time_seconds || 0) / 60)} min
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.completed_responses || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      {aiInsights && (
        <Card className="mb-6 bg-gradient-to-br from-purple-50 to-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Sparkles className="w-5 h-5 mr-2" />
              AI-Powered Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiInsights.findings && (
              <div>
                <h4 className="font-semibold mb-2">Key Findings</h4>
                <ul className="list-disc list-inside space-y-1">
                  {aiInsights.findings.map((finding, idx) => (
                    <li key={idx} className="text-gray-700">{finding}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiInsights.recommendations && (
              <div>
                <h4 className="font-semibold mb-2">Recommendations</h4>
                <ul className="list-disc list-inside space-y-1">
                  {aiInsights.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-gray-700">{rec}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiInsights.sentiment && (
              <div>
                <h4 className="font-semibold mb-2">Sentiment Distribution</h4>
                <div className="flex gap-4">
                  <div className="text-green-600">Positive: {aiInsights.sentiment.positive || 0}%</div>
                  <div className="text-gray-600">Neutral: {aiInsights.sentiment.neutral || 0}%</div>
                  <div className="text-red-600">Negative: {aiInsights.sentiment.negative || 0}%</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Question Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Question-by-Question Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics?.question_analytics?.length > 0 ? (
            <div className="space-y-6">
              {analytics.question_analytics.map((qa, idx) => (
                <div key={idx} className="border-b pb-4 last:border-0">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium">{qa.question_label}</h4>
                      <p className="text-sm text-gray-600">{qa.question_type}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{qa.response_count} responses</div>
                      <div className="text-sm text-gray-600">{qa.response_rate}% response rate</div>
                    </div>
                  </div>
                  {/* Distribution for choice questions */}
                  {qa.distribution && (
                    <div className="space-y-2">
                      {Object.entries(qa.distribution).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className="w-32 text-sm truncate">{key}</div>
                          <div className="flex-1 bg-gray-200 rounded-full h-6">
                            <div
                              className="bg-blue-600 h-6 rounded-full flex items-center justify-end px-2 text-white text-xs font-medium"
                              style={{ width: `${(value / qa.response_count) * 100}%` }}
                            >
                              {value}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Average for numeric questions */}
                  {qa.average !== undefined && (
                    <div className="text-sm">
                      <span className="font-medium">Average: </span>
                      <span className="text-lg font-bold text-blue-600">{qa.average}</span>
                      {qa.min !== undefined && qa.max !== undefined && (
                        <span className="text-gray-600 ml-2">(Min: {qa.min}, Max: {qa.max})</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-600 py-8">No question analytics available yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SurveyAnalytics;
