import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatbotService } from '../services/chatbotService';
import { ArrowLeft,Play, Pause, Edit, Copy, Trash2, MoreVertical, Plus, MessageSquare, TrendingUp, Clock, BarChart3 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ChatbotDashboard = () => {
  const navigate = useNavigate();
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBot, setSelectedBot] = useState(null);

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    try {
      setLoading(true);
      const data = await chatbotService.listBots();
      setBots(data);
    } catch (error) {
      console.error('Error loading bots:', error);
      toast.error('Failed to load chatbots');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBot = () => {
    navigate('/setup/chatbot-manager/create');
  };

  const handleEditBot = (botId) => {
    navigate(`/setup/chatbot-manager/edit/${botId}`);
  };

  const handleToggleStatus = async (bot) => {
    try {
      await chatbotService.toggleBotStatus(bot.id);
      toast.success(`Bot ${bot.status === 'active' ? 'paused' : 'activated'}`);
      loadBots();
    } catch (error) {
      console.error('Error toggling bot status:', error);
      toast.error('Failed to update bot status');
    }
  };

  const handleDuplicateBot = async (botId) => {
    try {
      await chatbotService.duplicateBot(botId);
      toast.success('Bot duplicated successfully');
      loadBots();
    } catch (error) {
      console.error('Error duplicating bot:', error);
      toast.error('Failed to duplicate bot');
    }
  };

  const handleDeleteBot = async (bot) => {
    if (!window.confirm(`Are you sure you want to delete "${bot.name}"?`)) return;
    
    try {
      await chatbotService.deleteBot(bot.id);
      toast.success('Bot deleted successfully');
      loadBots();
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast.error('Failed to delete bot');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800 border-green-200',
      paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      draft: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getChannelIcons = (channels) => {
    const enabledChannels = channels.filter(ch => ch.enabled);
    return (
      <div className="flex gap-1">
        {enabledChannels.map((channel, idx) => (
          <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">
            {channel.type}
          </span>
        ))}
        {enabledChannels.length === 0 && (
          <span className="text-xs text-gray-400">No channels</span>
        )}
      </div>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading chatbots...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
         <button
                onClick={() => navigate('/setup')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center space-x-2"
                title="Back to CRM"
              >
                <ArrowLeft className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700 hidden sm:inline">Back to CRM</span>
              </button> 
        <div>
          <h1 className="text-2xl font-bold text-gray-900 text-center">Chatbot Manager</h1>
          <p className="text-gray-600 mt-1">Create and manage AI-powered chatbots</p>
        </div>
        <button
          onClick={handleCreateBot}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          Create New Bot
        </button>
      </div>

      {/* Bots Table */}
      {bots.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No chatbots yet</h3>
          <p className="text-gray-600 mb-4">Create your first AI chatbot to get started</p>
          <button
            onClick={handleCreateBot}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus className="h-4 w-4" />
            Create New Bot
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bots.map((bot) => (
                <tr key={bot.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {bot.avatar_url ? (
                        <img src={bot.avatar_url} alt={bot.name} className="h-10 w-10 rounded-full" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <MessageSquare className="h-5 w-5 text-indigo-600" />
                        </div>
                      )}
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{bot.name}</div>
                        <div className="text-sm text-gray-500">{bot.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(bot.status)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 font-mono">{bot.model || 'gpt-4'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">
                      {formatDate(bot.updated_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/setup/chatbot-manager/analytics/${bot.id}`)}
                        className="p-2 text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
                        title="View Analytics"
                      >
                        <BarChart3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(bot)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                        title={bot.status === 'active' ? 'Pause' : 'Activate'}
                      >
                        {bot.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleEditBot(bot.id)}
                        className="p-2 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicateBot(bot.id)}
                        className="p-2 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                        title="Duplicate"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteBot(bot)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ChatbotDashboard;
