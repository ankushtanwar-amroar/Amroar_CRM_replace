import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Mail, Plus, Edit, Trash2, Copy, Star, Eye, Code, Loader2,
  ChevronDown, ChevronRight, X, Save, ArrowLeft, Zap, Search,
  Monitor, Smartphone, Send, Check, AlertCircle, ClipboardCopy,
  User, FileText, Package, Building2, Link2, Clock
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TEMPLATE_TYPE_LABELS = {
  signer_notification: { label: 'Signer Notification', color: 'bg-indigo-100 text-indigo-700', border: 'border-indigo-200' },
  approver_notification: { label: 'Approver Notification', color: 'bg-amber-100 text-amber-700', border: 'border-amber-200' },
  reviewer_notification: { label: 'Reviewer Notification', color: 'bg-blue-100 text-blue-700', border: 'border-blue-200' },
  package_send: { label: 'Package Send', color: 'bg-purple-100 text-purple-700', border: 'border-purple-200' },
  document_signed: { label: 'Document Signed', color: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200' },
  reminder: { label: 'Reminder', color: 'bg-red-100 text-red-700', border: 'border-red-200' },
};

const VARIABLE_CATEGORIES = {
  'Recipient': { icon: User, vars: ['recipient_name', 'recipient_email'] },
  'Document': { icon: FileText, vars: ['document_name', 'status', 'due_date', 'signed_date'] },
  'Package': { icon: Package, vars: ['package_name'] },
  'Sender & Company': { icon: Building2, vars: ['sender_name', 'company_name'] },
  'Links': { icon: Link2, vars: ['signing_link', 'download_link'] },
};

const VARIABLE_EXAMPLES = {
  'recipient_name': 'John Doe',
  'recipient_email': 'john@example.com',
  'document_name': 'NDA Agreement',
  'package_name': 'Subscription Package',
  'signing_link': 'https://app.cluvik.com/sign/abc123',
  'sender_name': 'Jane Smith',
  'company_name': 'Cluvik Inc.',
  'status': 'Pending',
  'due_date': 'May 1, 2026',
  'signed_date': 'Apr 15, 2026',
  'download_link': 'https://app.cluvik.com/download/doc123',
};

const EmailTemplatesPage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [variables, setVariables] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editorMode, setEditorMode] = useState('visual');
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [varSearch, setVarSearch] = useState('');
  const [copiedVar, setCopiedVar] = useState(null);
  const [showTestEmail, setShowTestEmail] = useState(false);
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [previewSubject, setPreviewSubject] = useState('');

  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBodyHtml, setFormBodyHtml] = useState('');
  const [formType, setFormType] = useState('signer_notification');

  const editorRef = useRef(null);
  const savedRef = useRef({ name: '', subject: '', body: '', type: '' });

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_URL}/api/docflow/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setTemplates(data.templates || []);
    } catch {
      toast.error('Failed to load email templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVariables = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_URL}/api/docflow/email-templates/variables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setVariables(data.variables || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadTemplates(); loadVariables(); }, [loadTemplates, loadVariables]);

  // Keyboard shortcut: Ctrl+S
  useEffect(() => {
    if (!editing) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, formName, formSubject, formBodyHtml, formType]);

  // Track unsaved changes
  useEffect(() => {
    if (!editing) return;
    const changed = formName !== savedRef.current.name ||
      formSubject !== savedRef.current.subject ||
      formBodyHtml !== savedRef.current.body ||
      formType !== savedRef.current.type;
    setHasUnsaved(changed);
  }, [formName, formSubject, formBodyHtml, formType, editing]);

  const startEdit = (tmpl) => {
    setEditing(tmpl);
    setFormName(tmpl.name);
    setFormSubject(tmpl.subject);
    setFormBodyHtml(tmpl.body_html);
    setFormType(tmpl.template_type);
    savedRef.current = { name: tmpl.name, subject: tmpl.subject, body: tmpl.body_html, type: tmpl.template_type };
    setEditorMode('visual');
    setHasUnsaved(false);
  };

  const startCreate = () => {
    setEditing({ id: null });
    setFormName('');
    setFormSubject('');
    setFormBodyHtml('<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n  <p>Hi {{recipient_name}},</p>\n  <p>Your content here...</p>\n</div>');
    setFormType('signer_notification');
    savedRef.current = { name: '', subject: '', body: '', type: 'signer_notification' };
    setEditorMode('visual');
    setHasUnsaved(false);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Template name is required'); return; }
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const body = { name: formName, subject: formSubject, body_html: formBodyHtml, template_type: formType };
      if (editing?.id) {
        await fetch(`${API_URL}/api/docflow/email-templates/${editing.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        toast.success('Template saved');
      } else {
        await fetch(`${API_URL}/api/docflow/email-templates`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        toast.success('Template created');
      }
      savedRef.current = { name: formName, subject: formSubject, body: formBodyHtml, type: formType };
      setHasUnsaved(false);
      loadTemplates();
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this email template?')) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_URL}/api/docflow/email-templates/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) { const err = await resp.json(); toast.error(err.detail || 'Cannot delete'); return; }
      toast.success('Template deleted');
      loadTemplates();
    } catch { toast.error('Failed to delete'); }
  };

  const handleClone = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/docflow/email-templates/${id}/clone`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Template cloned');
      loadTemplates();
    } catch { toast.error('Failed to clone'); }
  };

  const handleSetDefault = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/docflow/email-templates/${id}/set-default`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Set as default');
      loadTemplates();
    } catch { toast.error('Failed to set default'); }
  };

  const handlePreview = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_URL}/api/docflow/email-templates/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: formName, subject: formSubject, body_html: formBodyHtml, template_type: formType }),
      });
      const data = await resp.json();
      setPreviewHtml(data.rendered_html || '');
      setPreviewSubject(data.subject || '');
      setShowPreview(true);
    } catch { toast.error('Failed to preview'); }
  };

  const handleSendTest = async () => {
    if (!testEmailAddr.trim()) { toast.error('Enter a test email'); return; }
    try {
      setSendingTest(true);
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_URL}/api/docflow/email-templates/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: formName, subject: formSubject, body_html: formBodyHtml, template_type: formType }),
      });
      const data = await resp.json();
      // Send the rendered HTML as a test email
      await fetch(`${API_URL}/api/docflow/email-templates/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to_email: testEmailAddr, subject: data.subject || formSubject, html_content: data.rendered_html || formBodyHtml }),
      });
      toast.success(`Test email sent to ${testEmailAddr}`);
      setShowTestEmail(false);
    } catch {
      toast.error('Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const insertVariable = (key) => {
    const tag = `{{${key}}}`;
    setFormBodyHtml(prev => prev + tag);
    setCopiedVar(key);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const copyVariable = (key) => {
    navigator.clipboard.writeText(`{{${key}}}`);
    setCopiedVar(key);
    toast.success(`Copied {{${key}}}`);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const filteredVariables = useMemo(() => {
    if (!varSearch.trim()) return null;
    const q = varSearch.toLowerCase();
    return variables.filter(v => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q));
  }, [varSearch, variables]);

  const grouped = {};
  templates.forEach(t => {
    const type = t.template_type || 'signer_notification';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(t);
  });

  // ─── EDITOR VIEW ───
  if (editing) {
    return (
      <div className="flex flex-col h-[calc(100vh-180px)] min-h-[600px]" data-testid="email-template-editor">
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => { if (hasUnsaved && !window.confirm('Discard unsaved changes?')) return; setEditing(null); }} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors" data-testid="back-to-list">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 truncate">{formName || 'Untitled Template'}</h2>
              {hasUnsaved && (
                <span className="relative flex h-2.5 w-2.5 shrink-0" title="Unsaved changes" data-testid="unsaved-indicator">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </span>
              )}
              {!hasUnsaved && editing?.id && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Device toggle */}
            <div className="hidden md:flex items-center p-0.5 bg-gray-100 rounded-lg">
              <button onClick={() => setPreviewDevice('desktop')} className={`p-1.5 rounded-md transition-colors ${previewDevice === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`} title="Desktop view" data-testid="device-desktop">
                <Monitor className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setPreviewDevice('mobile')} className={`p-1.5 rounded-md transition-colors ${previewDevice === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`} title="Mobile view" data-testid="device-mobile">
                <Smartphone className="h-3.5 w-3.5" />
              </button>
            </div>
            <button onClick={() => setShowTestEmail(true)} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors" data-testid="test-email-btn">
              <Send className="h-3.5 w-3.5" /> Test
            </button>
            <button onClick={handlePreview} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors" data-testid="preview-btn">
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm" data-testid="save-template-btn">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Save'}
              <span className="hidden sm:inline text-xs text-gray-400 font-normal ml-1">Ctrl+S</span>
            </button>
          </div>
        </div>

        {/* 3-Column Workspace */}
        <div className="flex flex-1 overflow-hidden min-w-0">
          {/* LEFT: Settings */}
          <div className="w-64 shrink-0 bg-white border-r border-gray-200 overflow-y-auto hidden lg:block" data-testid="settings-panel">
            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Template Name</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full border border-gray-200 rounded-md shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3" placeholder="My Template" data-testid="template-name-input" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
                    <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full border border-gray-200 rounded-md shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 bg-white" data-testid="template-type-select">
                      {Object.entries(TEMPLATE_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Subject Line</label>
                    <input value={formSubject} onChange={e => setFormSubject(e.target.value)} className="w-full border border-gray-200 rounded-md shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3" placeholder="Action Required: {{document_name}}" data-testid="template-subject-input" />
                  </div>
                </div>
              </div>

              {/* Info */}
              {editing?.id && (
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Details</h3>
                  <div className="space-y-2 text-xs text-gray-500">
                    {editing.is_system && <div className="flex items-center gap-1.5"><AlertCircle className="h-3 w-3" /> System template</div>}
                    {editing.is_default && <div className="flex items-center gap-1.5"><Star className="h-3 w-3 text-amber-500" /> Default for this type</div>}
                    {editing.created_at && <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Created: {new Date(editing.created_at).toLocaleDateString()}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Editor */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50" data-testid="editor-panel">
            {/* Mode Switcher */}
            <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
              <div className="flex p-0.5 bg-gray-100 rounded-lg">
                <button onClick={() => setEditorMode('visual')} className={`py-1 px-3 rounded-md text-xs font-medium transition-all ${editorMode === 'visual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`} data-testid="visual-mode-btn">
                  <Eye className="h-3 w-3 inline mr-1.5" />Visual
                </button>
                <button onClick={() => setEditorMode('html')} className={`py-1 px-3 rounded-md text-xs font-medium transition-all ${editorMode === 'html' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`} data-testid="html-mode-btn">
                  <Code className="h-3 w-3 inline mr-1.5" />HTML
                </button>
              </div>
              {/* Mobile-only settings */}
              <div className="flex items-center gap-2 lg:hidden">
                <input value={formName} onChange={e => setFormName(e.target.value)} className="border border-gray-200 rounded-md text-xs py-1 px-2 w-32" placeholder="Name" />
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-auto min-w-0" ref={editorRef}>
              {editorMode === 'html' ? (
                <div className="h-full bg-slate-950 relative">
                  <div className="absolute top-0 left-0 w-10 h-full bg-slate-900/50 flex flex-col items-center pt-3 text-slate-600 text-[11px] font-mono select-none overflow-hidden">
                    {formBodyHtml.split('\n').map((_, i) => (
                      <div key={i} className="leading-[22px]">{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    value={formBodyHtml}
                    onChange={e => setFormBodyHtml(e.target.value)}
                    className="w-full h-full pl-12 pr-4 py-3 bg-transparent text-slate-200 text-[13px] font-mono leading-[22px] resize-none focus:outline-none"
                    spellCheck={false}
                    data-testid="html-editor"
                  />
                </div>
              ) : (
                <div className="p-4 flex justify-center">
                  <div className={`transition-all duration-300 w-full ${previewDevice === 'mobile' ? 'max-w-[375px]' : ''}`}>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                      <style dangerouslySetInnerHTML={{ __html: `
                        .email-preview-container table { max-width: 100% !important; width: 100% !important; }
                        .email-preview-container td { word-break: break-word; }
                        .email-preview-container img { max-width: 100% !important; height: auto !important; }
                        .email-preview-container h1 { font-size: clamp(18px, 3vw, 28px) !important; line-height: 1.3 !important; }
                        .email-preview-container a { word-break: break-all; }
                        .email-preview-container .container { width: 100% !important; max-width: 100% !important; }
                      ` }} />
                      <div className="email-preview-container overflow-x-auto" dangerouslySetInnerHTML={{ __html: formBodyHtml }} data-testid="visual-editor" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Variables */}
          <div className="w-64 shrink-0 bg-white border-l border-gray-200 overflow-y-auto hidden md:block" data-testid="variables-panel">
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Variables</h3>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <input value={varSearch} onChange={e => setVarSearch(e.target.value)} placeholder="Search variables..." className="w-full border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs py-2 pl-8 pr-3" data-testid="var-search" />
                </div>
              </div>

              {filteredVariables ? (
                <div className="space-y-1.5">
                  {filteredVariables.map(v => {
                    const key = v.key.replace(/[{}]/g, '');
                    return (
                      <VariableChip key={key} varKey={key} label={v.label} example={VARIABLE_EXAMPLES[key]} copied={copiedVar === key} onInsert={() => insertVariable(key)} onCopy={() => copyVariable(key)} />
                    );
                  })}
                  {filteredVariables.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No matching variables</p>}
                </div>
              ) : (
                Object.entries(VARIABLE_CATEGORIES).map(([catName, catData]) => {
                  const catVars = catData.vars.map(vk => variables.find(v => v.key.includes(vk))).filter(Boolean);
                  if (catVars.length === 0) return null;
                  const Icon = catData.icon;
                  return (
                    <div key={catName}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{catName}</span>
                      </div>
                      <div className="space-y-1.5">
                        {catVars.map(v => {
                          const key = v.key.replace(/[{}]/g, '');
                          return (
                            <VariableChip key={key} varKey={key} label={v.label} example={VARIABLE_EXAMPLES[key]} copied={copiedVar === key} onInsert={() => insertVariable(key)} onCopy={() => copyVariable(key)} />
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="preview-modal">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Email Preview</h3>
                  {previewSubject && <p className="text-xs text-gray-500 mt-0.5">Subject: {previewSubject}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex p-0.5 bg-gray-100 rounded-lg">
                    <button onClick={() => setPreviewDevice('desktop')} className={`p-1 rounded ${previewDevice === 'desktop' ? 'bg-white shadow-sm' : ''}`}><Monitor className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setPreviewDevice('mobile')} className={`p-1 rounded ${previewDevice === 'mobile' ? 'bg-white shadow-sm' : ''}`}><Smartphone className="h-3.5 w-3.5" /></button>
                  </div>
                  <button onClick={() => setShowPreview(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100 p-6 flex justify-center">
                <div className={`transition-all duration-300 ${previewDevice === 'mobile' ? 'w-[375px]' : 'w-full max-w-[640px]'}`}>
                  <div className="bg-white rounded-lg shadow-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Test Email Modal */}
        {showTestEmail && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="test-email-modal">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Send Test Email</h3>
                <p className="text-xs text-gray-500 mt-1">Preview with sample data will be sent to this address.</p>
              </div>
              <input value={testEmailAddr} onChange={e => setTestEmailAddr(e.target.value)} type="email" placeholder="your@email.com" className="w-full border border-gray-200 rounded-md text-sm py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" data-testid="test-email-input" />
              <div className="flex gap-2">
                <button onClick={() => setShowTestEmail(false)} className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Cancel</button>
                <button onClick={handleSendTest} disabled={sendingTest} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50" data-testid="send-test-btn">
                  {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sendingTest ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div className="space-y-5" data-testid="email-templates-list">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Email Templates</h2>
          <p className="text-xs text-gray-500 mt-0.5">Customize email notifications for each workflow step</p>
        </div>
        <button onClick={startCreate} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm" data-testid="create-template-btn">
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 text-indigo-500 animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          {Object.entries(TEMPLATE_TYPE_LABELS).map(([typeKey, typeInfo]) => {
            const items = grouped[typeKey] || [];
            if (items.length === 0) return null;
            return (
              <div key={typeKey} data-testid={`template-group-${typeKey}`}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${typeInfo.color}`}>{typeInfo.label}</span>
                  <span className="text-xs text-gray-400">{items.length} template{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-2">
                  {items.map(tmpl => (
                    <div key={tmpl.id} className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-200 hover:shadow-sm transition-all group" data-testid={`email-tmpl-${tmpl.id}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">{tmpl.name}</span>
                            {tmpl.is_default && <Star className="h-3 w-3 text-amber-500 fill-amber-500 flex-shrink-0" />}
                            {tmpl.is_system && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">System</span>}
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{tmpl.subject}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!tmpl.is_default && (
                          <button onClick={() => handleSetDefault(tmpl.id)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded-md hover:bg-amber-50" title="Set as default" data-testid={`set-default-${tmpl.id}`}><Star className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => startEdit(tmpl)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50" title="Edit" data-testid={`edit-${tmpl.id}`}><Edit className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleClone(tmpl.id)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50" title="Clone" data-testid={`clone-${tmpl.id}`}><Copy className="h-3.5 w-3.5" /></button>
                        {!tmpl.is_system && (
                          <button onClick={() => handleDelete(tmpl.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50" title="Delete" data-testid={`delete-${tmpl.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Variable Chip Component ───
const VariableChip = ({ varKey, label, example, copied, onInsert, onCopy }) => (
  <div className="group flex items-center justify-between px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-md hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
    <div className="min-w-0 flex-1">
      <div className="text-xs font-mono text-indigo-600 truncate">{`{{${varKey}}}`}</div>
      {example && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{example}</div>}
    </div>
    <div className="flex items-center gap-0.5 ml-2 shrink-0">
      <button onClick={onCopy} className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors" title="Copy variable">
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <ClipboardCopy className="h-3 w-3" />}
      </button>
      <button onClick={onInsert} className="px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-100 rounded transition-colors" title="Insert into editor">
        + Insert
      </button>
    </div>
  </div>
);

export default EmailTemplatesPage;
