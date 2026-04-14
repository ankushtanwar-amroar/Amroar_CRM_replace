import React, { useState } from 'react';
import { X, Sparkles, Send, Loader } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const AIFlowAssistant = ({ onClose, onFlowGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [examplePrompts] = useState([
    'When a lead is created, send email to ankush.t@amroar.com',
    'Create a flow: when lead is created, create an activity and send email notification',
    'Send email to {{email}} when lead status changes to Qualified',
    'When contact is created, send welcome email and create follow-up task'
  ]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a flow description');
      return;
    }

    setGenerating(true);
    try {
      const response = await axios.post(`${API}/api/flow-builder/flows/ai-generate`, {
        prompt: prompt
      });

      if (response.data.success) {
        toast.success('Flow generated successfully by AI!');
        onFlowGenerated(response.data.flow);
        setPrompt('');
      } else {
        toast.error('Failed to generate flow');
      }
    } catch (error) {
      console.error('Error generating flow:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate flow');
    } finally {
      setGenerating(false);
    }
  };

  const handleExampleClick = (example) => {
    setPrompt(example);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40"
        onClick={onClose}
      />

      {/* Assistant Panel */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center">
              <Sparkles className="w-6 h-6 mr-2" />
              <div>
                <h3 className="text-xl font-bold">AI Flow Builder</h3>
                <p className="text-sm text-indigo-100">Describe your flow in plain English</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Input Area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                💬 Describe your flow automation
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: When a lead is created, send email to test@gmail.com with subject 'Welcome' and create a follow-up activity..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                rows={4}
                disabled={generating}
              />
            </div>

            {/* Example Prompts */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">💡 Try these examples:</p>
              <div className="space-y-2">
                {examplePrompts.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(example)}
                    className="w-full text-left px-4 py-2 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg text-sm transition-all"
                    disabled={generating}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center ${
                generating || !prompt.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {generating ? (
                <>
                  <Loader className="w-5 h-5 mr-2 animate-spin" />
                  Generating flow with AI...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Generate Flow
                </>
              )}
            </button>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>✨ Powered by Gemini AI</strong>
                <br />
                The AI will create a complete flow with trigger, actions, and connections based on your description.
                You can edit the generated flow after creation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIFlowAssistant;
