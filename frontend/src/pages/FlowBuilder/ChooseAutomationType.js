import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowLeft, Monitor, Webhook, Clock } from 'lucide-react';

const ChooseAutomationType = () => {
  const navigate = useNavigate();

  const handleSelectType = (type) => {
    // Screen Flow requires launch mode selection first
    if (type === 'screen-flow') {
      navigate('/flows/new/screen-mode');
      return;
    }
    
    // Other flow types navigate directly to editor
    let flowTypeName = 'New Automation Flow';
    if (type === 'webhook-trigger') flowTypeName = 'New Webhook Trigger Flow';
    if (type === 'scheduled-trigger') flowTypeName = 'New Scheduled Flow';
    
    navigate('/flows/new/edit', { state: { automationType: type, flowName: flowTypeName } });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center">
          <button
            onClick={() => navigate('/flows')}
            className="mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">New Flow</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Choose Flow Type
          </h2>
          <p className="text-gray-600 text-lg">
            Select how you want to build your workflow
          </p>
        </div>

        {/* Automation Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Screen Flow */}
          <button
            onClick={() => handleSelectType('screen-flow')}
            className="group bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Monitor className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="ml-5 flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  Screen Flow
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Build interactive user experiences with screens and forms. Collect input, guide users through processes, and create step-by-step wizards.
                </p>
                <div className="mt-4 flex items-center text-sm text-blue-600 font-medium">
                  <span>Get Started</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </button>

          {/* Record Triggered Automation */}
          <button
            onClick={() => handleSelectType('record-triggered')}
            className="group bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-green-500 hover:shadow-lg transition-all duration-200 text-left"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Zap className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="ml-5 flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">
                  Record Triggered Automation
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Start your flow when a record is created or updated. Perfect for automating follow-ups, notifications, and data updates.
                </p>
                <div className="mt-4 flex items-center text-sm text-green-600 font-medium">
                  <span>Get Started</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </button>

          {/* Webhook Trigger (NEW) */}
          <button
            onClick={() => handleSelectType('webhook-trigger')}
            className="group bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-purple-500 hover:shadow-lg transition-all duration-200 text-left"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Webhook className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="ml-5 flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-purple-600 transition-colors">
                  Webhook Trigger
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Allow external systems to trigger your flow via HTTP webhooks. Perfect for integrations with third-party services, APIs, and custom applications.
                </p>
                <div className="mt-4 flex items-center text-sm text-purple-600 font-medium">
                  <span>Get Started</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </button>

          {/* Scheduled Trigger (NEW) */}
          <button
            onClick={() => handleSelectType('scheduled-trigger')}
            className="group bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-orange-500 hover:shadow-lg transition-all duration-200 text-left"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Clock className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="ml-5 flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors">
                  Scheduled Trigger
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Run your flow automatically at specific times or on a recurring schedule. Perfect for daily reports, monthly summaries, or periodic data processing.
                </p>
                <div className="mt-4 flex items-center text-sm text-orange-600 font-medium">
                  <span>Get Started</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            Need help deciding? Learn more about{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
              flow types
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChooseAutomationType;
