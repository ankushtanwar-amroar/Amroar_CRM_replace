import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { chatbotService } from '../services/chatbotService';
import { ArrowLeft, TrendingUp, MessageSquare, Users, ThumbsUp, AlertCircle, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

const AnalyticsDashboard = () => {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [bot, setBot] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);

  useEffect(() => {
    loadData();
  }, [botId, period]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [botData, metricsData, convsData] = await Promise.all([
        chatbotService.getBot(botId),
        chatbotService.getBotMetrics(botId, period),
        chatbotService.listBotConversations(botId, 20)
      ]);
      setBot(botData);
      setMetrics(metricsData);
      setConversations(convsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await chatbotService.searchConversations(searchQuery, botId);
      setConversations(results);
    } catch (error) {
      console.error('Error searching:', error);
      toast.error('Search failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/setup/chatbot-manager')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Analytics - {bot?.name}</h1>
              <p className="text-sm text-gray-600">{period}-day performance metrics</p>
            </div>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <MessageSquare className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Conversations</div>
                <div className="text-2xl font-bold text-gray-900">{metrics?.total_conversations || 0}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Resolved</div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics?.resolved_percentage?.toFixed(1) || 0}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Handoff Rate</div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics?.handoff_percentage?.toFixed(1) || 0}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <ThumbsUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Avg CSAT</div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics?.avg_csat?.toFixed(1) || 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Intents */}
        {metrics?.top_intents && metrics.top_intents.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Intents</h3>
            <div className="space-y-3">
              {metrics.top_intents.map((intent, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{intent.name}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{
                          width: `${(intent.count / metrics.total_conversations) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {intent.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversation Search</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search conversations..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>

          {conversations.length > 0 ? (
            <div className="space-y-3">
              {conversations.map((conv) => (
                <div key={conv.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {conv.user_identifier || 'Anonymous'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(conv.started_at).toLocaleString()}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      conv.status === 'resolved' ? 'bg-green-100 text-green-800' :
                      conv.status === 'escalated' ? 'bg-orange-100 text-orange-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {conv.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {conv.messages?.length || 0} messages
                    {conv.intent_detected && (
                      <span className="ml-2 text-indigo-600">• {conv.intent_detected}</span>
                    )}
                    {conv.csat_score && (
                      <span className="ml-2 text-green-600">• CSAT: {conv.csat_score}/5</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No conversations found</p>
            </div>
          )}
        </div>

        {/* Failed Queries */}
        {metrics?.failed_queries > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="font-medium text-red-900">
                {metrics.failed_queries} low-confidence queries detected
              </span>
            </div>
            <p className="text-sm text-red-700 mt-1">
              Consider adding more knowledge sources or training data
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
