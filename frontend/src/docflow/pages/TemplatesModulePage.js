import React, { useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import EmailTemplatesPage from './EmailTemplatesPage';
import SmsTemplatesPage from './SmsTemplatesPage';

/**
 * Phase 81.81 — Unified Templates module.
 *
 * Hosts two channel sub-tabs: Email Templates (existing, untouched) and the
 * new SMS Templates page. Sub-tab state is local — the outer DocFlowDashboard
 * tab routing only cares about `activeTab === 'templates_module'`.
 */
const TABS = [
  { id: 'email', label: 'Email Templates', icon: Mail },
  { id: 'sms', label: 'SMS Templates', icon: MessageSquare },
];

const TemplatesModulePage = () => {
  const [sub, setSub] = useState('email');

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" data-testid="templates-module-page">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Templates</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Customise notification templates for every signing channel.
        </p>
      </div>

      <div className="border-b border-gray-200 mb-5">
        <nav className="flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = sub === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSub(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
                data-testid={`templates-subtab-${t.id}`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div data-testid={`templates-subcontent-${sub}`}>
        {sub === 'email' ? <EmailTemplatesPage /> : <SmsTemplatesPage />}
      </div>
    </div>
  );
};

export default TemplatesModulePage;
