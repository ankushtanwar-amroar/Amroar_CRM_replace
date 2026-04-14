import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chatbotService } from '../services/chatbotService';
import { ArrowLeft, ArrowRight, Save, X, Plus, Trash2, Upload, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import KnowledgeSourceManager from '../components/KnowledgeSourceManager';
import IntentBuilder from '../components/IntentBuilder';

const BotWizard = () => {
  const navigate = useNavigate();
  const { botId } = useParams();
  const isEditMode = !!botId;

  const [currentStep, setCurrentStep] = useState(1);
  const [botData, setBotData] = useState({
    name: '',
    description: '',
    avatar_url: '',
    tone: 'conversational',
    welcome_message: 'Hello! How can I help you today?',
    fallback_message: "I'm not sure I understand. Could you rephrase that?",
    persona: {
      identity_source: 'contact',
      readable_fields: [],
      identity_detection_fields: ['email', 'phone']
    },
    knowledge_sources: [],
    channels: [
      { type: 'web', enabled: true, config: {} },
      { type: 'whatsapp', enabled: false, config: {} },
      { type: 'slack', enabled: false, config: {} },
      { type: 'teams', enabled: false, config: {} }
    ],
    intents: [],
    handoff_config: {},
    escalation_enabled: false,
    daily_summary_email: ''
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      loadBot();
    }
  }, [botId]);

  const loadBot = async () => {
    try {
      setLoading(true);
      const data = await chatbotService.getBot(botId);
      setBotData(data);
    } catch (error) {
      console.error('Error loading bot:', error);
      toast.error('Failed to load bot');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setBotData(prev => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (parent, field, value) => {
    setBotData(prev => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value }
    }));
  };

  const handleSave = async () => {
    if (!botData.name.trim()) {
      toast.error('Please enter a bot name');
      return;
    }

    try {
      setSaving(true);
      if (isEditMode) {
        // Update bot with all data
        const updateData = {
          name: botData.name,
          description: botData.description,
          avatar_url: botData.avatar_url,
          tone: botData.tone,
          welcome_message: botData.welcome_message,
          fallback_message: botData.fallback_message,
          persona: botData.persona,
          channels: botData.channels,
          intents: botData.intents,
          handoff_config: botData.handoff_config,
          escalation_enabled: botData.escalation_enabled,
          daily_summary_email: botData.daily_summary_email
        };
        await chatbotService.updateBot(botId, updateData);
        toast.success('Bot updated successfully');
        // Reload to get fresh data
        await loadBot();
      } else {
        const newBot = await chatbotService.createBot({
          name: botData.name,
          description: botData.description,
          avatar_url: botData.avatar_url,
          tone: botData.tone,
          welcome_message: botData.welcome_message,
          fallback_message: botData.fallback_message
        });
        toast.success('Bot created successfully');
        navigate(`/setup/chatbot-manager/edit/${newBot.id}`);
      }
    } catch (error) {
      console.error('Error saving bot:', error);
      toast.error(error.response?.data?.detail || 'Failed to save bot');
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { number: 1, title: 'Bot Basics', description: 'Name, tone, and welcome message' },
    { number: 2, title: 'Persona & Data', description: 'Identity and CRM context' },
    { number: 3, title: 'Knowledge Sources', description: 'Training data and content' },
    { number: 4, title: 'Channels & Handoff', description: 'Deployment channels' },
    { number: 5, title: 'Intents & Actions', description: 'Conversation routing' }
  ];

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-indigo-900 mb-2">Bot Basics</h3>
        <p className="text-sm text-indigo-700">Configure your bot's identity and personality</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Bot Name *</label>
        <input
          type="text"
          value={botData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          placeholder="e.g., Customer Support Bot"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
        <textarea
          value={botData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          placeholder="Brief description of what this bot does..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tone</label>
        <select
          value={botData.tone}
          onChange={(e) => handleInputChange('tone', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="conversational">Conversational</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Welcome Message</label>
        <textarea
          value={botData.welcome_message}
          onChange={(e) => handleInputChange('welcome_message', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Fallback Message</label>
        <textarea
          value={botData.fallback_message}
          onChange={(e) => handleInputChange('fallback_message', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Preview */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">Preview</h4>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold">
              {botData.name.charAt(0).toUpperCase() || 'B'}
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-900">{botData.welcome_message}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Persona & Data Context</h3>
        <p className="text-sm text-blue-700">Configure CRM identity and accessible data</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Identity Source</label>
        <select
          value={botData.persona.identity_source}
          onChange={(e) => handleNestedChange('persona', 'identity_source', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="lead">Lead</option>
          <option value="contact">Contact</option>
          <option value="account">Account</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">Which CRM object type to identify users from</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Identity Detection Fields</label>
        <div className="space-y-2">
          {['email', 'phone', 'name'].map(field => (
            <label key={field} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={botData.persona.identity_detection_fields.includes(field)}
                onChange={(e) => {
                  const current = botData.persona.identity_detection_fields;
                  if (e.target.checked) {
                    handleNestedChange('persona', 'identity_detection_fields', [...current, field]);
                  } else {
                    handleNestedChange('persona', 'identity_detection_fields', current.filter(f => f !== field));
                  }
                }}
                className="rounded text-indigo-600"
              />
              <span className="text-sm text-gray-700 capitalize">{field}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-green-900 mb-2">Knowledge Sources</h3>
        <p className="text-sm text-green-700">Add content for your bot to learn from</p>
      </div>

      {isEditMode && botId ? (
        <KnowledgeSourceManager
          botId={botId}
          sources={botData.knowledge_sources}
          onUpdate={(sources) => handleInputChange('knowledge_sources', sources)}
        />
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-sm text-yellow-800">
            Please save the bot first to add knowledge sources
          </p>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-purple-900 mb-2">Channels & Handoff</h3>
        <p className="text-sm text-purple-700">Enable deployment channels and configure escalation</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Enable Channels</label>
        <div className="space-y-3">
          {botData.channels.map((channel, idx) => (
            <label key={idx} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={channel.enabled}
                  onChange={(e) => {
                    const newChannels = [...botData.channels];
                    newChannels[idx].enabled = e.target.checked;
                    handleInputChange('channels', newChannels);
                  }}
                  className="rounded text-indigo-600"
                />
                <div>
                  <div className="font-medium text-sm capitalize">{channel.type}</div>
                  <div className="text-xs text-gray-500">
                    {channel.type === 'web' && 'Embed widget on your website'}
                    {channel.type === 'whatsapp' && 'Connect via Twilio'}
                    {channel.type === 'slack' && 'Slack integration'}
                    {channel.type === 'teams' && 'Microsoft Teams integration'}
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={botData.escalation_enabled}
            onChange={(e) => handleInputChange('escalation_enabled', e.target.checked)}
            className="rounded text-indigo-600"
          />
          <span className="text-sm font-medium text-gray-700">Enable escalation for low-confidence responses</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Daily Summary Email (Optional)</label>
        <input
          type="email"
          value={botData.daily_summary_email || ''}
          onChange={(e) => handleInputChange('daily_summary_email', e.target.value)}
          placeholder="email@example.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-orange-900 mb-2">Intents & Actions</h3>
        <p className="text-sm text-orange-700">Configure conversation routing and responses</p>
      </div>

      <IntentBuilder
        intents={botData.intents}
        onUpdate={(intents) => handleInputChange('intents', intents)}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading bot...</p>
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
              <h1 className="text-xl font-semibold text-gray-900">
                {isEditMode ? 'Edit Bot' : 'Create New Bot'}
              </h1>
              <p className="text-sm text-gray-600">
                Step {currentStep} of {steps.length}: {steps[currentStep - 1].title}
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !botData.name}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Bot'}
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Step Navigator */}
        <div className="w-64 bg-white border-r border-gray-200 p-4">
          <div className="space-y-2">
            {steps.map((step) => (
              <button
                key={step.number}
                onClick={() => setCurrentStep(step.number)}
                className={`w-full text-left p-3 rounded-lg transition ${
                  currentStep === step.number
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      currentStep === step.number
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {step.number}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${currentStep === step.number ? 'text-indigo-900' : 'text-gray-900'}`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-500">{step.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => setCurrentStep(Math.min(steps.length, currentStep + 1))}
                disabled={currentStep === steps.length}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BotWizard;
