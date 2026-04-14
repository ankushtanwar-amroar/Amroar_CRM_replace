/**
 * Integration Config Panels
 * Handles smaller integration nodes: ai_prompt, http_request, slack, teams, google_sheets, database, connector
 */
import React from 'react';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';

/**
 * AI Prompt Config Panel
 */
export const AIPromptConfigPanel = ({ config, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <Label>AI Prompt</Label>
        <Textarea
          className="w-full"
          value={config.prompt || ''}
          onChange={(e) => handleConfigChange('prompt', e.target.value)}
          placeholder="Enter your AI prompt here..."
          rows={5}
        />
      </div>
    </div>
  );
};

/**
 * HTTP Request Config Panel
 */
export const HTTPRequestConfigPanel = ({ config, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-green-800 font-medium">🌐 HTTP Request</p>
      </div>
      <div>
        <Label>Method</Label>
        <Select value={config.method || 'GET'} onValueChange={(value) => handleConfigChange('method', value)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>URL</Label>
        <Input 
          className="w-full" 
          value={config.url || ''} 
          onChange={(e) => handleConfigChange('url', e.target.value)} 
          placeholder="https://api.example.com" 
        />
      </div>
      <div>
        <Label>Body (JSON)</Label>
        <Textarea 
          className="w-full" 
          value={JSON.stringify(config.body || {}, null, 2)} 
          onChange={(e) => { 
            try { 
              handleConfigChange('body', JSON.parse(e.target.value)); 
            } catch(err) {
              // Invalid JSON - ignore until user completes input
            } 
          }} 
          rows={4} 
        />
      </div>
    </div>
  );
};

/**
 * Slack Config Panel
 */
export const SlackConfigPanel = ({ config, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-purple-800 font-medium">💬 Slack Message</p>
      </div>
      <div>
        <Label>Channel</Label>
        <Input 
          className="w-full" 
          value={config.channel || ''} 
          onChange={(e) => handleConfigChange('channel', e.target.value)} 
          placeholder="#general" 
        />
      </div>
      <div>
        <Label>Message</Label>
        <Textarea 
          className="w-full" 
          value={config.message || ''} 
          onChange={(e) => handleConfigChange('message', e.target.value)} 
          rows={4} 
        />
      </div>
    </div>
  );
};

/**
 * Teams Config Panel
 */
export const TeamsConfigPanel = ({ config, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-indigo-800 font-medium">👥 Teams</p>
      </div>
      <div>
        <Label>Channel</Label>
        <Input 
          className="w-full" 
          value={config.channel || ''} 
          onChange={(e) => handleConfigChange('channel', e.target.value)} 
        />
      </div>
      <div>
        <Label>Message</Label>
        <Textarea 
          className="w-full" 
          value={config.message || ''} 
          onChange={(e) => handleConfigChange('message', e.target.value)} 
          rows={4} 
        />
      </div>
    </div>
  );
};

/**
 * Google Sheets Config Panel
 */
export const GoogleSheetsConfigPanel = ({ config, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-green-800 font-medium">📊 Google Sheets</p>
      </div>
      <div>
        <Label>Spreadsheet ID</Label>
        <Input 
          className="w-full" 
          value={config.spreadsheetId || ''} 
          onChange={(e) => handleConfigChange('spreadsheetId', e.target.value)} 
        />
      </div>
      <div>
        <Label>Range</Label>
        <Input 
          className="w-full" 
          value={config.range || 'A1:Z'} 
          onChange={(e) => handleConfigChange('range', e.target.value)} 
        />
      </div>
    </div>
  );
};

/**
 * Database Config Panel
 */
export const DatabaseConfigPanel = ({ config, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-blue-800 font-medium">🗄️ Database</p>
      </div>
      <div>
        <Label>SQL Query</Label>
        <Textarea 
          className="w-full" 
          value={config.query || ''} 
          onChange={(e) => handleConfigChange('query', e.target.value)} 
          rows={5} 
        />
      </div>
    </div>
  );
};

/**
 * Connector Config Panel (Email/SendGrid)
 */
export const ConnectorConfigPanel = ({ config, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <Label>Email Service</Label>
        <Select
          value={config.email_service || 'sendgrid'}
          onValueChange={(value) => handleConfigChange('email_service', value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select email service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sendgrid">SendGrid (API)</SelectItem>
            <SelectItem value="system">System Email (SMTP)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500 mt-1">
          {config.email_service === 'system' ? '✅ Using system SMTP server' : '📧 Using SendGrid API'}
        </p>
      </div>
      <div>
        <Label>Recipient Email</Label>
        <Input
          className="w-full"
          value={config.to_email || ''}
          onChange={(e) => handleConfigChange('to_email', e.target.value)}
          placeholder="example@email.com or use variables"
        />
        <p className="text-xs text-slate-500 mt-1">Use {'{{'}variable{'}}'}  for dynamic values</p>
      </div>
      <div>
        <Label>Subject</Label>
        <Input
          className="w-full"
          value={config.subject || ''}
          onChange={(e) => handleConfigChange('subject', e.target.value)}
          placeholder="Email subject"
        />
      </div>
      <div>
        <Label>Body</Label>
        <Textarea
          className="w-full"
          value={config.body || ''}
          onChange={(e) => handleConfigChange('body', e.target.value)}
          placeholder="Email body. Use variables for dynamic values"
          rows={5}
        />
      </div>
    </div>
  );
};

export default {
  AIPromptConfigPanel,
  HTTPRequestConfigPanel,
  SlackConfigPanel,
  TeamsConfigPanel,
  GoogleSheetsConfigPanel,
  DatabaseConfigPanel,
  ConnectorConfigPanel
};
