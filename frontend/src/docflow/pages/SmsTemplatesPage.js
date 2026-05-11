import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Loader2, Save, Trash2, Star, MessageSquare, Eye, X, Send, Edit2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';

/**
 * Phase 81.81 — SMS Templates page.
 *
 * Lives under DocFlow → Templates → SMS Templates.
 * Lets a tenant manage multiple SMS bodies and pick one as the default. The
 * default is what `/api/docflow/security/send-sms-link` uses to compose the
 * outgoing Twilio SMS for the Security Check confirmation flow.
 */

const VARIABLES = [
  { key: 'user_name', label: 'Recipient name' },
  { key: 'document_name', label: 'Document name' },
  { key: 'company_name', label: 'Company name' },
  { key: 'phone_last4', label: 'Phone last 4' },
  { key: 'link', label: 'Signing link' },
];

const renderSample = (content) => {
  const sample = {
    user_name: 'Jordan Reeves',
    document_name: 'NDA Agreement',
    company_name: 'Your Company',
    phone_last4: '3210',
    link: 'https://example.com/sign/abc123',
  };
  return (content || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => sample[k] ?? '');
};

const TemplateEditorModal = ({ open, template, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(template?.name || '');
      setContent(template?.content || '');
      setIsDefault(!!template?.is_default);
    }
  }, [open, template]);

  if (!open) return null;

  const insertVar = (key) => {
    const token = `{{${key}}}`;
    setContent((prev) => `${prev || ''}${token}`);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return; }
    if (!content.trim()) { toast.error('SMS content is required'); return; }
    try {
      setSaving(true);
      const payload = { name: name.trim(), content: content.trim(), is_default: isDefault };
      let res;
      if (template?.id) {
        res = await docflowService.updateSmsTemplate(template.id, payload);
      } else {
        res = await docflowService.createSmsTemplate(payload);
      }
      const data = res.data || res;
      toast.success(template?.id ? 'Template updated' : 'Template created');
      onSaved?.(data);
    } catch (e) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const preview = renderSample(content);
  const charCount = (content || '').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} data-testid="sms-template-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            {template?.id ? 'Edit SMS Template' : 'New SMS Template'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Template name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Default secure-link SMS"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              data-testid="sms-template-name"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">SMS content</label>
              <span className={`text-[11px] ${charCount > 320 ? 'text-amber-600' : 'text-gray-400'}`}>{charCount} chars</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVar(v.key)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 rounded hover:bg-indigo-100"
                  data-testid={`sms-var-chip-${v.key}`}
                  title={v.label}
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <textarea
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Hi {{user_name}}, your signing link for {{document_name}} is: {{link}}"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              data-testid="sms-template-content"
            />
            {charCount > 160 && (
              <p className="text-[11px] text-amber-600 mt-1">SMS over 160 chars may be split into multiple messages by carriers.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Live preview</label>
            <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono whitespace-pre-wrap text-gray-800 max-h-40 overflow-y-auto">
              {preview || <span className="text-gray-400">(empty)</span>}
            </div>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
              data-testid="sms-template-default-toggle"
            />
            <span className="text-sm text-gray-800 flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
              Use this as the default SMS template
            </span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            data-testid="sms-template-save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {template?.id ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SmsTemplatesPage = () => {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // null | template | 'new'
  const [previewOpen, setPreviewOpen] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await docflowService.listSmsTemplates();
      const data = res.data || res;
      setTemplates(data.templates || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load SMS templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSetDefault = async (t) => {
    try {
      setBusyId(t.id);
      await docflowService.setDefaultSmsTemplate(t.id);
      await load();
      toast.success(`"${t.name}" is now the default`);
    } catch (e) {
      toast.error(e.message || 'Failed to set default');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (t) => {
    if (t.is_system) { toast.error('System default template cannot be deleted'); return; }
    if (!window.confirm(`Delete SMS template "${t.name}"?`)) return;
    try {
      setBusyId(t.id);
      await docflowService.deleteSmsTemplate(t.id);
      await load();
      toast.success('Template deleted');
    } catch (e) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const onSaved = async () => {
    setEditing(null);
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        <span className="ml-3 text-sm text-gray-500">Loading SMS templates...</span>
      </div>
    );
  }

  return (
    <div data-testid="sms-templates-page" className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">SMS Templates</h2>
          <p className="text-sm text-gray-500">Customise the SMS body sent for the Security Check confirmation. The <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-amber-500 fill-amber-400" /> default</span> template is used automatically.</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-black"
          data-testid="sms-template-new"
        >
          <Plus className="h-4 w-4" /> New SMS Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600">No SMS templates yet — click "New SMS Template" to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow"
              data-testid={`sms-template-row-${t.id}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-900 truncate" data-testid={`sms-template-name-${t.id}`}>{t.name}</span>
                    {t.is_default && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full">
                        <Star className="h-3 w-3 fill-amber-500" /> Default
                      </span>
                    )}
                    {t.is_system && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-100 rounded-full">System</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap font-mono">{(t.content || '').slice(0, 220)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setPreviewOpen(t)}
                    className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    title="Preview"
                    data-testid={`sms-template-preview-${t.id}`}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {!t.is_default && (
                    <button
                      onClick={() => handleSetDefault(t)}
                      disabled={busyId === t.id}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                      title="Set as default"
                      data-testid={`sms-template-default-${t.id}`}
                    >
                      <Star className="h-3.5 w-3.5" /> Set default
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(t)}
                    className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    title="Edit"
                    data-testid={`sms-template-edit-${t.id}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {!t.is_system && (
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={busyId === t.id}
                      className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-50"
                      title="Delete"
                      data-testid={`sms-template-delete-${t.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditorModal
        open={editing !== null}
        template={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
      />

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewOpen(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 truncate">Preview: {previewOpen.name}</h3>
              <button onClick={() => setPreviewOpen(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Sample render</p>
              <div className="p-4 bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-100 rounded-xl text-sm font-mono whitespace-pre-wrap text-gray-800">
                {renderSample(previewOpen.content)}
              </div>
              <p className="text-[11px] text-gray-500">Sample variables used: Jordan Reeves / NDA Agreement / Your Company / 3210 / example.com link</p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button onClick={() => setPreviewOpen(null)} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmsTemplatesPage;
