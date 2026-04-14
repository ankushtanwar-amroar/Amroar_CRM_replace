/**
 * Email Templates Page - Phase 9
 * Admin UI for customizing email templates
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Edit2,
  Search,
  Loader2,
  Eye,
  Send,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
  Code,
  FileText,
  Variable,
  History,
  CheckCircle,
  AlertCircle,
  Copy,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TEMPLATE_ICONS = {
  task_assigned: '📋',
  mentioned_in_comment: '💬',
  task_overdue: '⚠️',
  dependency_unblocked: '✅',
  approval_requested: '🔔',
  approval_approved: '✅',
  approval_rejected: '❌',
};

const EmailTemplatesPage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templateHistory, setTemplateHistory] = useState([]);
  
  // Editor state
  const [editorData, setEditorData] = useState({
    subject: '',
    html_body: '',
    plain_body: '',
    is_enabled: true,
  });
  const [editorTab, setEditorTab] = useState('html');
  const [variables, setVariables] = useState([]);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/email-templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const fetchVariables = async (templateType) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/email-templates/${templateType}/variables`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setVariables(data.variables || []);
      }
    } catch (error) {
      console.error('Error fetching variables:', error);
    }
  };

  const openEditor = async (template) => {
    setSelectedTemplate(template);
    
    // Fetch full template if needed
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${API_URL}/api/task-manager/email-templates/${template.template_type}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    if (response.ok) {
      const fullTemplate = await response.json();
      setEditorData({
        subject: fullTemplate.subject || '',
        html_body: fullTemplate.html_body || '',
        plain_body: fullTemplate.plain_body || '',
        is_enabled: fullTemplate.is_enabled !== false,
      });
      await fetchVariables(template.template_type);
      setEditorOpen(true);
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/email-templates/${selectedTemplate.template_type}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(editorData)
        }
      );
      
      if (response.ok) {
        toast.success('Template saved');
        setEditorOpen(false);
        fetchTemplates();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to save template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (template) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/email-templates/${template.template_type}/toggle`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        toast.success(`Template ${template.is_enabled ? 'disabled' : 'enabled'}`);
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error toggling template:', error);
      toast.error('Failed to toggle template');
    }
  };

  const handleReset = async () => {
    if (!selectedTemplate) return;
    
    if (!window.confirm('Reset this template to default? Your customizations will be lost.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/email-templates/${selectedTemplate.template_type}/reset`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        toast.success('Template reset to default');
        setEditorOpen(false);
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error resetting template:', error);
      toast.error('Failed to reset template');
    }
  };

  const handlePreview = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/email-templates/preview`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            template_type: selectedTemplate.template_type,
            ...editorData
          })
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setPreviewContent(data);
        setPreviewOpen(true);
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Preview failed');
      }
    } catch (error) {
      console.error('Error previewing template:', error);
      toast.error('Failed to preview template');
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    
    setSendingTest(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/email-templates/test`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            template_type: selectedTemplate.template_type,
            to_email: testEmail
          })
        }
      );
      
      if (response.ok) {
        toast.success(`Test email sent to ${testEmail}`);
        setTestEmailOpen(false);
        setTestEmail('');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      toast.error('Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const fetchHistory = async (template) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/email-templates/${template.template_type}/history`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setTemplateHistory(data.history || []);
        setHistoryOpen(true);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const insertVariable = (variable) => {
    const tag = `{{${variable}}}`;
    
    if (editorTab === 'html') {
      setEditorData(prev => ({
        ...prev,
        html_body: prev.html_body + tag
      }));
    } else if (editorTab === 'plain') {
      setEditorData(prev => ({
        ...prev,
        plain_body: prev.plain_body + tag
      }));
    } else if (editorTab === 'subject') {
      setEditorData(prev => ({
        ...prev,
        subject: prev.subject + tag
      }));
    }
    
    toast.success(`Inserted ${tag}`);
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.template_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-full pb-8 bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/task-manager"
              className="text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Email Templates</h1>
              <p className="text-sm text-slate-500">Customize notification emails</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-templates"
            />
          </div>
        </div>

        {/* Templates List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTemplates.map(template => (
              <div
                key={template.template_type}
                className="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors"
                data-testid={`template-card-${template.template_type}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">
                      {TEMPLATE_ICONS[template.template_type] || '📧'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{template.name}</h3>
                        {template.is_default && (
                          <Badge variant="outline" className="text-xs">Default</Badge>
                        )}
                        <Badge
                          variant={template.is_enabled ? 'default' : 'secondary'}
                          className={template.is_enabled ? 'bg-green-100 text-green-700' : ''}
                        >
                          {template.is_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{template.description}</p>
                      {template.updated_at && (
                        <p className="text-xs text-slate-400 mt-1">
                          Last modified: {new Date(template.updated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(template)}
                      data-testid={`toggle-template-${template.template_type}`}
                    >
                      {template.is_enabled ? (
                        <ToggleRight className="w-5 h-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchHistory(template)}
                    >
                      <History className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditor(template)}
                      data-testid={`edit-template-${template.template_type}`}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{TEMPLATE_ICONS[selectedTemplate?.template_type] || '📧'}</span>
              Edit: {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Customize the email template for {selectedTemplate?.name?.toLowerCase()} notifications
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* Subject */}
            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input
                value={editorData.subject}
                onChange={(e) => setEditorData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject..."
                data-testid="template-subject-input"
              />
            </div>

            {/* Variables Panel */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Variable className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Available Variables</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {variables.map(variable => (
                  <Badge
                    key={variable}
                    variant="outline"
                    className="cursor-pointer hover:bg-blue-100 transition-colors"
                    onClick={() => insertVariable(variable)}
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-2">
                Click a variable to insert it at the cursor position
              </p>
            </div>

            {/* Body Tabs */}
            <Tabs value={editorTab} onValueChange={setEditorTab}>
              <TabsList>
                <TabsTrigger value="html" className="flex items-center gap-1">
                  <Code className="w-4 h-4" />
                  HTML Body
                </TabsTrigger>
                <TabsTrigger value="plain" className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  Plain Text
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="html" className="mt-4">
                <Textarea
                  value={editorData.html_body}
                  onChange={(e) => setEditorData(prev => ({ ...prev, html_body: e.target.value }))}
                  placeholder="HTML email body..."
                  rows={15}
                  className="font-mono text-sm"
                  data-testid="template-html-body"
                />
              </TabsContent>
              
              <TabsContent value="plain" className="mt-4">
                <Textarea
                  value={editorData.plain_body}
                  onChange={(e) => setEditorData(prev => ({ ...prev, plain_body: e.target.value }))}
                  placeholder="Plain text fallback..."
                  rows={15}
                  className="font-mono text-sm"
                  data-testid="template-plain-body"
                />
              </TabsContent>
            </Tabs>

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
              <div>
                <Label>Enable Template</Label>
                <p className="text-xs text-slate-500">When disabled, the default template will be used</p>
              </div>
              <Switch
                checked={editorData.is_enabled}
                onCheckedChange={(checked) => setEditorData(prev => ({ ...prev, is_enabled: checked }))}
                data-testid="template-enabled-switch"
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="w-4 h-4 mr-1" />
                Preview
              </Button>
              <Button variant="outline" onClick={() => setTestEmailOpen(true)}>
                <Send className="w-4 h-4 mr-1" />
                Send Test
              </Button>
              {!selectedTemplate?.is_default && (
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Reset to Default
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Template
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview how the email will look with sample data
            </DialogDescription>
          </DialogHeader>
          
          {previewContent && (
            <div className="space-y-4">
              <div className="bg-slate-100 p-3 rounded">
                <Label className="text-xs text-slate-500">Subject</Label>
                <p className="font-medium">{previewContent.subject}</p>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600">HTML Preview</span>
                </div>
                <div 
                  className="p-4 bg-white max-h-96 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: previewContent.html_body }}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test email to verify the template looks correct
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              placeholder="your@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="mt-2"
              data-testid="test-email-input"
            />
            <p className="text-xs text-slate-500 mt-2">
              The email will be sent with sample data for preview purposes
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestEmailOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendTest} disabled={sendingTest}>
              {sendingTest && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Test Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Template History</DialogTitle>
            <DialogDescription>
              Audit log of changes to this template
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-96 overflow-y-auto">
            {templateHistory.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No changes recorded</p>
            ) : (
              <div className="space-y-3">
                {templateHistory.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${
                      log.action === 'create' ? 'bg-green-500' :
                      log.action === 'update' ? 'bg-blue-500' :
                      log.action === 'toggle' ? 'bg-yellow-500' :
                      log.action === 'reset' ? 'bg-red-500' : 'bg-slate-400'
                    }`} />
                    <div>
                      <p className="font-medium capitalize">{log.action}</p>
                      <p className="text-xs text-slate-500">
                        Version {log.version} • {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailTemplatesPage;
