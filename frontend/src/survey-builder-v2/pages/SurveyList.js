import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import surveyService from '../services/surveyService';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Plus, Search, BarChart, Users, FileText, Trash2, Copy, Eye, Sparkles,ArrowLeft } from 'lucide-react';

const SurveyList = () => {
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    loadSurveys();
  }, [page, statusFilter, searchQuery]);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      const result = await surveyService.listSurveys(page, 20, statusFilter, searchQuery);
      setSurveys(result.surveys || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Error loading surveys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (surveyId) => {
    if (!window.confirm('Are you sure you want to delete this survey?')) return;
    try {
      await surveyService.deleteSurvey(surveyId);
      loadSurveys();
    } catch (error) {
      console.error('Error deleting survey:', error);
    }
  };

  const handleDuplicate = async (surveyId) => {
    try {
      const newSurvey = await surveyService.duplicateSurvey(surveyId);
      navigate(`/survey-builder-v2/builder/${newSurvey.id}`);
    } catch (error) {
      console.error('Error duplicating survey:', error);
    }
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    try {
      setAiGenerating(true);
      const survey = await surveyService.aiGenerateSurvey(aiPrompt);
      setShowAIModal(false);
      setAiPrompt('');
      navigate(`/survey-builder-v2/builder/${survey.id}`);
    } catch (error) {
      console.error('Error generating survey:', error);
      alert('Failed to generate survey. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      draft: 'secondary',
      active: 'default',
      paused: 'outline',
      closed: 'destructive'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
           <button
                onClick={() => navigate('/setup')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center space-x-2"
                title="Back to CRM"
              >
                <ArrowLeft className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700 hidden sm:inline">Back to CRM</span>
              </button> 
          <div>
            <h1 className="text-3xl font-bold text-center">Survey Builder</h1>
            <p className="text-gray-600 mt-1">Create, manage, and analyze surveys with AI</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAIModal(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              AI Generate Survey
            </Button>
            <Button onClick={() => navigate('/survey-builder-v2/builder/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Survey
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search surveys..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Tabs value={statusFilter || 'all'} onValueChange={(val) => setStatusFilter(val === 'all' ? null : val)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              {/* <TabsTrigger value="paused">Paused</TabsTrigger> */}
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Survey Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Loading surveys...</p>
        </div>
      ) : surveys.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No surveys yet</h3>
          <p className="text-gray-600 mb-4">Create your first survey or use AI to generate one</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setShowAIModal(true)} variant="outline">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Generate
            </Button>
            <Button onClick={() => navigate('/survey-builder-v2/builder/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Survey
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {surveys.map((survey) => (
            <Card key={survey.id} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1" onClick={() => navigate(`/survey-builder-v2/builder/${survey.id}`)}>
                    <CardTitle className="text-lg mb-1">{survey.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{survey.description || 'No description'}</CardDescription>
                  </div>
                  {getStatusBadge(survey.status)}
                </div>
              </CardHeader>
              <CardContent>
                {survey.ai_generated && (
                  <Badge variant="secondary" className="mb-3">
                    <Sparkles className="w-3 h-3 mr-1" />
                    AI Generated
                  </Badge>
                )}
                <div className="grid grid-cols-3 gap-2 mb-4 text-sm text-gray-600">
                  <div className="flex items-center">
                    <FileText className="w-4 h-4 mr-1" />
                    {survey.questions?.length || 0} questions
                  </div>
                  <div className="flex items-center">
                    <Users className="w-4 h-4 mr-1" />
                    {survey.total_responses || 0} responses
                  </div>
                  <div className="flex items-center">
                    <BarChart className="w-4 h-4 mr-1" />
                    {survey.completion_rate || 0}%
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/survey-builder-v2/responses/${survey.id}`)}
                  >
                    <Users className="w-4 h-4 mr-1" />
                    Responses
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/survey-builder-v2/analytics/${survey.id}`)}
                  >
                    <BarChart className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDuplicate(survey.id)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(survey.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* AI Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Survey with AI
              </CardTitle>
              <CardDescription>
                Describe what kind of survey you want to create, and AI will build it for you
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full p-3 border rounded-lg min-h-[120px] mb-4"
                placeholder="Example: Create a customer satisfaction survey for a restaurant with questions about food quality, service, ambiance, and overall experience. Include NPS question."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAIModal(false)} disabled={aiGenerating}>
                  Cancel
                </Button>
                <Button onClick={handleAIGenerate} disabled={!aiPrompt.trim() || aiGenerating}>
                  {aiGenerating ? 'Generating...' : 'Generate Survey'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="mt-6 flex justify-center gap-2">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="py-2 px-4">Page {page} of {Math.ceil(total / 20)}</span>
          <Button
            variant="outline"
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default SurveyList;
