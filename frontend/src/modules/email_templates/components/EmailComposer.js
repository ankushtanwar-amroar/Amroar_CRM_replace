import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  X, Send, Save, Search, FileText, Sparkles,
  Monitor, Smartphone, AlertTriangle, ChevronDown
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import MergeFieldsPanel from './MergeFieldsPanel';

const API = process.env.REACT_APP_BACKEND_URL;

export default function EmailComposer({ 
  isOpen, 
  onClose, 
  recordId, 
  recordType, 
  recipientEmail, 
  recipientName 
}) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplateSelect, setShowTemplateSelect] = useState(true);
  const [templateSearch, setTemplateSearch] = useState('');
  
  // Email content
  const [toEmail, setToEmail] = useState(recipientEmail || '');
  const [toName, setToName] = useState(recipientName || '');
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [plainTextContent, setPlainTextContent] = useState('');
  
  // UI State
  const [activeTab, setActiveTab] = useState('compose');
  const [previewMode, setPreviewMode] = useState('desktop');
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [showMergeFields, setShowMergeFields] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setToEmail(recipientEmail || '');
      setToName(recipientName || '');
    }
  }, [isOpen, recipientEmail, recipientName]);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/api/email-templates/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTemplates(res.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const handleSelectTemplate = async (template) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/api/email-templates/templates/${template.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const fullTemplate = res.data;
      setSelectedTemplate(fullTemplate);
      setSubject(fullTemplate.subject || '');
      setHtmlContent(fullTemplate.html_content || '');
      setPlainTextContent(fullTemplate.plain_text_content || '');
      setShowTemplateSelect(false);
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template');
    }
  };

  const handleStartBlank = () => {
    setSelectedTemplate(null);
    setSubject('');
    setHtmlContent('');
    setPlainTextContent('');
    setShowTemplateSelect(false);
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const token = localStorage.getItem('token');
      const draftData = {
        template_id: selectedTemplate?.id,
        record_id: recordId,
        record_type: recordType,
        to_email: toEmail,
        to_name: toName,
        subject,
        html_content: htmlContent,
        plain_text_content: plainTextContent,
        blocks: selectedTemplate?.blocks || []
      };

      if (draftId) {
        await axios.put(`${API}/api/email-templates/drafts/${draftId}`, draftData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        const res = await axios.post(`${API}/api/email-templates/drafts`, draftData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDraftId(res.data.id);
      }
      
      toast.success('Draft saved');
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error('Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSend = async () => {
    if (!toEmail) {
      toast.error('Recipient email is required');
      return;
    }
    if (!subject) {
      toast.error('Subject is required');
      return;
    }
    if (!htmlContent && !plainTextContent) {
      toast.error('Email content is required');
      return;
    }

    setSending(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/email-templates/send`, {
        to_email: toEmail,
        to_name: toName,
        subject,
        html_content: htmlContent,
        plain_text_content: plainTextContent,
        record_id: recordId,
        record_type: recordType,
        draft_id: draftId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Email sent successfully');
      onClose();
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(error.response?.data?.detail || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleSendTest = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/email-templates/send-test`, {
        subject,
        html_content: htmlContent,
        plain_text_content: plainTextContent
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Test email sent to your inbox');
    } catch (error) {
      console.error('Error sending test:', error);
      toast.error(error.response?.data?.detail || 'Failed to send test email');
    }
  };

  const handleInsertMergeField = (field) => {
    const tag = `{{${field.name}}}`;
    // For simplicity, append to subject (in a real app, you'd insert at cursor position)
    setSubject(prev => prev + ' ' + tag);
    toast.success(`Inserted ${field.label}`);
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.subject.toLowerCase().includes(templateSearch.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <DialogTitle className="flex items-center">
            <Send className="h-5 w-5 mr-2 text-indigo-600" />
            {showTemplateSelect ? 'Choose a Template' : 'Compose Email'}
          </DialogTitle>
          <div className="flex items-center space-x-2">
            {!showTemplateSelect && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setShowTemplateSelect(true)}>
                  <FileText className="h-4 w-4 mr-1" />
                  Change Template
                </Button>
                <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={savingDraft}>
                  <Save className="h-4 w-4 mr-1" />
                  {savingDraft ? 'Saving...' : 'Save Draft'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {showTemplateSelect ? (
            /* Template Selection */
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-2xl mx-auto">
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search templates..."
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full mb-4 h-auto py-4 justify-start"
                  onClick={handleStartBlank}
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center mr-3">
                      <FileText className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Blank Email</p>
                      <p className="text-sm text-slate-500">Start from scratch</p>
                    </div>
                  </div>
                </Button>

                <div className="space-y-2">
                  {filteredTemplates.map((template) => (
                    <Card
                      key={template.id}
                      className="cursor-pointer hover:border-indigo-300 transition-colors"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-slate-900">{template.name}</h4>
                            <p className="text-sm text-slate-500 mt-1">{template.subject}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {template.email_type === 'rich' ? 'HTML' : 'Plain'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Compose View */
            <>
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* To & Subject */}
                <div className="px-6 py-4 border-b space-y-3">
                  <div className="flex items-center">
                    <label className="w-16 text-sm text-slate-500">To:</label>
                    <Input
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      placeholder="recipient@example.com"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-16 text-sm text-slate-500">Subject:</label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject..."
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                  <div className="px-6 border-b">
                    <TabsList className="h-10 bg-transparent">
                      <TabsTrigger value="compose">Compose</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="compose" className="flex-1 m-0 overflow-auto p-6">
                    {selectedTemplate?.email_type === 'plain' || !htmlContent ? (
                      <Textarea
                        value={plainTextContent || htmlContent}
                        onChange={(e) => {
                          setPlainTextContent(e.target.value);
                          if (!selectedTemplate?.email_type || selectedTemplate.email_type === 'plain') {
                            setHtmlContent(`<p>${e.target.value.replace(/\n/g, '</p><p>')}</p>`);
                          }
                        }}
                        placeholder="Write your email here..."
                        className="min-h-[300px] font-mono"
                      />
                    ) : (
                      <div
                        className="prose prose-sm max-w-none p-4 border rounded-lg min-h-[300px] bg-white"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => setHtmlContent(e.currentTarget.innerHTML)}
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="preview" className="flex-1 m-0 overflow-auto p-6 bg-slate-100">
                    <div className="flex justify-center mb-4">
                      <div className="flex space-x-2">
                        <Button
                          variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setPreviewMode('desktop')}
                        >
                          <Monitor className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setPreviewMode('mobile')}
                        >
                          <Smartphone className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Card className={`mx-auto ${previewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-2xl'}`}>
                      <div className="bg-slate-100 border-b p-3">
                        <p className="text-xs text-slate-500">Subject: {subject || '(No subject)'}</p>
                      </div>
                      <CardContent className="p-6">
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: htmlContent || '<p>No content</p>' }}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Merge Fields Sidebar */}
              {showMergeFields && (
                <MergeFieldsPanel
                  relatedObject={recordType}
                  onInsert={handleInsertMergeField}
                  onClose={() => setShowMergeFields(false)}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!showTemplateSelect && (
          <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMergeFields(!showMergeFields)}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Merge Fields
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSendTest}>
                Send Test
              </Button>
            </div>
            <Button
              onClick={handleSend}
              disabled={sending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending...' : 'Send Email'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
