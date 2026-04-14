import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, Sparkles, Palette, Code, Mail, Eye,
  Wand2, MessageSquare, Lightbulb, Check, AlertTriangle,
  Monitor, Smartphone, FileText, Send
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Badge } from '../../../components/ui/badge';
import AIWriteView from './AIWriteView';
import DesignView from './DesignView';
import CodeView from './CodeView';
import InboxView from './InboxView';
import MergeFieldsPanel from './MergeFieldsPanel';

const API = process.env.REACT_APP_BACKEND_URL;

export default function EmailTemplateEditor({ template, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('design');
  const [subject, setSubject] = useState(template?.subject || '');
  const [htmlContent, setHtmlContent] = useState(template?.html_content || '');
  const [plainTextContent, setPlainTextContent] = useState(template?.plain_text_content || '');
  const [blocks, setBlocks] = useState(template?.blocks || []);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [spamHints, setSpamHints] = useState([]);
  const [showMergeFields, setShowMergeFields] = useState(false);
  const [previewDevice, setPreviewDevice] = useState('desktop');

  useEffect(() => {
    setHasChanges(true);
  }, [subject, htmlContent, plainTextContent, blocks]);

  useEffect(() => {
    checkSpamHints();
  }, [subject, htmlContent, plainTextContent]);

  const checkSpamHints = useCallback(async () => {
    if (!subject && !htmlContent) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API}/api/email-templates/ai/spam-check`,
        null,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { subject, html_content: htmlContent, plain_text_content: plainTextContent }
        }
      );
      setSpamHints(res.data.hints || []);
    } catch (error) {
      console.error('Spam check error:', error);
    }
  }, [subject, htmlContent, plainTextContent]);

  const handleSave = async () => {
    if (!subject) {
      toast.error('Subject is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API}/api/email-templates/templates/${template.id}`,
        {
          subject,
          html_content: htmlContent,
          plain_text_content: plainTextContent,
          blocks
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Template saved');
      setHasChanges(false);
      onSave?.({ ...template, subject, html_content: htmlContent, plain_text_content: plainTextContent, blocks });
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleAIGenerate = async (result) => {
    if (result.subject) setSubject(result.subject);
    if (result.body) {
      setHtmlContent(result.body);
      // Convert to blocks
      await convertHtmlToBlocks(result.body);
    }
    setActiveTab('design');
  };

  const convertHtmlToBlocks = async (html) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API}/api/email-templates/convert/html-to-blocks`,
        { html },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBlocks(res.data.blocks || []);
    } catch (error) {
      console.error('Conversion error:', error);
    }
  };

  const handleBlocksChange = async (newBlocks) => {
    setBlocks(newBlocks);
    // Convert blocks to HTML
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API}/api/email-templates/convert/blocks-to-html`,
        newBlocks,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setHtmlContent(res.data.html || '');
    } catch (error) {
      console.error('Blocks to HTML error:', error);
    }
  };

  const handleCodeChange = async (newHtml) => {
    setHtmlContent(newHtml);
  };

  const handleMakeEditable = async () => {
    await convertHtmlToBlocks(htmlContent);
    setActiveTab('design');
    toast.success('HTML converted to editable blocks');
  };

  const handleInsertMergeField = (field) => {
    const mergeTag = `{{${field.name}}}`;
    // This would need to be handled by the active editor
    // For now, we'll add it to the subject if focused there
    setSubject(prev => prev + mergeTag);
    toast.success(`Inserted ${field.label}`);
  };

  const handleSendTest = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/api/email-templates/send-test`,
        {
          subject,
          html_content: htmlContent,
          plain_text_content: plainTextContent
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Test email sent to your inbox');
    } catch (error) {
      console.error('Send test error:', error);
      toast.error(error.response?.data?.detail || 'Failed to send test email');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="border-l pl-4">
            <h1 className="font-semibold text-slate-900">{template?.name}</h1>
            <p className="text-xs text-slate-500">
              {template?.email_type === 'rich' ? 'Rich (HTML) Email' : 'Plain Text Email'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {spamHints.length > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {spamHints.length} hint{spamHints.length > 1 ? 's' : ''}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowMergeFields(!showMergeFields)}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Merge Fields
          </Button>
          <Button variant="outline" size="sm" onClick={handleSendTest}>
            <Send className="h-4 w-4 mr-2" />
            Send Test
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Subject Line */}
      <div className="bg-white border-b px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Subject Line</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject..."
            className="text-lg font-medium border-0 shadow-none px-0 focus-visible:ring-0"
          />
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="bg-white border-b px-4">
              <TabsList className="h-12 bg-transparent">
                <TabsTrigger value="ai" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Write
                </TabsTrigger>
                <TabsTrigger value="design" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                  <Palette className="h-4 w-4 mr-2" />
                  Design
                </TabsTrigger>
                <TabsTrigger value="code" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                  <Code className="h-4 w-4 mr-2" />
                  Code
                </TabsTrigger>
                <TabsTrigger value="inbox" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                  <Mail className="h-4 w-4 mr-2" />
                  Inbox View
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="ai" className="flex-1 m-0 overflow-auto">
              <AIWriteView
                onGenerate={handleAIGenerate}
                relatedObject={template?.related_object}
              />
            </TabsContent>

            <TabsContent value="design" className="flex-1 m-0 overflow-auto">
              <DesignView
                blocks={blocks}
                onChange={handleBlocksChange}
                emailType={template?.email_type}
                plainTextContent={plainTextContent}
                onPlainTextChange={setPlainTextContent}
              />
            </TabsContent>

            <TabsContent value="code" className="flex-1 m-0 overflow-auto">
              <CodeView
                htmlContent={htmlContent}
                onChange={handleCodeChange}
                onMakeEditable={handleMakeEditable}
              />
            </TabsContent>

            <TabsContent value="inbox" className="flex-1 m-0 overflow-auto bg-slate-200">
              <InboxView
                subject={subject}
                htmlContent={htmlContent}
                plainTextContent={plainTextContent}
                spamHints={spamHints}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Merge Fields Panel */}
        {showMergeFields && (
          <MergeFieldsPanel
            relatedObject={template?.related_object}
            onInsert={handleInsertMergeField}
            onClose={() => setShowMergeFields(false)}
          />
        )}
      </div>
    </div>
  );
}
