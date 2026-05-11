import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, Save, RotateCcw, Eye, FileText, MessageSquare, Phone, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import { renderContent, buildVariableMap } from '../utils/contentVariables';

/**
 * Phase 81.80 — Content Configuration page.
 *
 * Lets a tenant admin customise the three consent / disclaimer surfaces:
 *   1. Consent Disclosure popup (multi-section legal text)
 *   2. Review and Continue popup (intro body + checkbox)
 *   3. SMS Security disclaimer
 *
 * No section is mandatory — if the tenant doesn't customise it, the public
 * signing UI falls back to the system defaults from the backend.
 */

const VARIABLES = [
  { token: '{{user_name}}', label: 'Recipient name' },
  { token: '{{email}}', label: 'Recipient email' },
  { token: '{{phone}}', label: 'Phone (masked)' },
  { token: '{{phone_last4}}', label: 'Phone last 4' },
  { token: '{{company_name}}', label: 'Company name' },
  { token: '{{document_name}}', label: 'Document name' },
  { token: '{{date}}', label: "Today's date" },
];

const SECTIONS = [
  { id: 'consent_disclosure', label: 'Consent Disclosure', icon: FileText, hint: 'Multi-section legal text shown after the checkbox link.' },
  { id: 'review_continue', label: 'Review & Continue', icon: MessageSquare, hint: 'Intro popup with checkbox before signing starts.' },
  { id: 'sms_disclaimer', label: 'SMS Security', icon: Phone, hint: 'Shown when document was delivered via secure SMS.' },
];

// ─── Reusable inputs ───
const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</label>
    {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    {children}
  </div>
);

const TextInput = ({ value, onChange, ...rest }) => (
  <input
    type="text"
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
    {...rest}
  />
);

const TextArea = ({ value, onChange, rows = 4, ...rest }) => (
  <textarea
    rows={rows}
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
    {...rest}
  />
);

const VariableChips = ({ onInsert }) => (
  <div className="flex flex-wrap gap-1.5">
    {VARIABLES.map((v) => (
      <button
        key={v.token}
        type="button"
        onClick={() => onInsert(v.token)}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 rounded hover:bg-indigo-100"
        data-testid={`var-chip-${v.token.replace(/[{}]/g, '')}`}
        title={v.label}
      >
        {v.token}
      </button>
    ))}
  </div>
);

// ─── Section editors ───

const ConsentDisclosureEditor = ({ content, setContent }) => {
  const [openIdx, setOpenIdx] = useState(0);
  const sections = content.sections || [];
  const updateSection = (i, patch) => {
    const next = [...sections];
    next[i] = { ...next[i], ...patch };
    setContent({ ...content, sections: next });
  };
  const addSection = () => {
    setContent({ ...content, sections: [...sections, { title: 'New section', content: '' }] });
    setOpenIdx(sections.length);
  };
  const removeSection = (i) => {
    const next = sections.filter((_, idx) => idx !== i);
    setContent({ ...content, sections: next });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title">
          <TextInput value={content.title} onChange={(v) => setContent({ ...content, title: v })} data-testid="cd-title" />
        </Field>
        <Field label="Subtitle">
          <TextInput value={content.subtitle} onChange={(v) => setContent({ ...content, subtitle: v })} data-testid="cd-subtitle" />
        </Field>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Disclosure sections</label>
          <button onClick={addSection} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100" data-testid="cd-add-section">
            <Plus className="h-3.5 w-3.5" /> Add section
          </button>
        </div>
        <div className="space-y-2">
          {sections.map((s, i) => (
            <div key={i} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
                <button onClick={() => setOpenIdx(openIdx === i ? -1 : i)} className="flex items-center gap-2 truncate flex-1 text-left">
                  {openIdx === i ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <span className="truncate">{s.title || `Section ${i + 1}`}</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeSection(i); }} className="p-1 text-gray-400 hover:text-red-600" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {openIdx === i && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-100 bg-gray-50/50">
                  <Field label="Section title">
                    <TextInput value={s.title} onChange={(v) => updateSection(i, { title: v })} />
                  </Field>
                  <Field label="Section content" hint="Plain text. Variables like {{company_name}} are auto-substituted at render.">
                    <TextArea rows={5} value={s.content} onChange={(v) => updateSection(i, { content: v })} />
                  </Field>
                </div>
              )}
            </div>
          ))}
          {sections.length === 0 && (
            <p className="text-xs text-gray-500 px-3 py-4 text-center bg-gray-50 rounded-lg">No sections — click "Add section" to get started.</p>
          )}
        </div>
      </div>
      <Field label="Footer">
        <TextInput value={content.footer} onChange={(v) => setContent({ ...content, footer: v })} data-testid="cd-footer" />
      </Field>
    </div>
  );
};

const ReviewContinueEditor = ({ content, setContent }) => {
  const insertInto = (key) => (token) => {
    setContent({ ...content, [key]: `${content[key] || ''}${token}` });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title"><TextInput value={content.title} onChange={(v) => setContent({ ...content, title: v })} data-testid="rc-title" /></Field>
        <Field label="Subtitle"><TextInput value={content.subtitle} onChange={(v) => setContent({ ...content, subtitle: v })} data-testid="rc-subtitle" /></Field>
      </div>
      <Field label="Body (HTML allowed)" hint="Click a variable to insert it at the end.">
        <VariableChips onInsert={insertInto('body_html')} />
        <TextArea rows={10} value={content.body_html} onChange={(v) => setContent({ ...content, body_html: v })} data-testid="rc-body" />
      </Field>
      <Field label="Footer (HTML allowed)">
        <TextArea rows={5} value={content.footer_html} onChange={(v) => setContent({ ...content, footer_html: v })} data-testid="rc-footer" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Disclosure link text"><TextInput value={content.disclosure_link_text} onChange={(v) => setContent({ ...content, disclosure_link_text: v })} /></Field>
        <Field label="Continue button label"><TextInput value={content.continue_label} onChange={(v) => setContent({ ...content, continue_label: v })} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Checkbox label"><TextInput value={content.checkbox_text} onChange={(v) => setContent({ ...content, checkbox_text: v })} data-testid="rc-checkbox" /></Field>
        <Field label="Validation error"><TextInput value={content.error_text} onChange={(v) => setContent({ ...content, error_text: v })} /></Field>
      </div>
    </div>
  );
};

const SmsDisclaimerEditor = ({ content, setContent }) => {
  const insertInto = (key) => (token) => {
    setContent({ ...content, [key]: `${content[key] || ''}${token}` });
  };
  const updateBullet = (i, v) => {
    const next = [...(content.bullets || [])];
    next[i] = v;
    setContent({ ...content, bullets: next });
  };
  const addBullet = () => setContent({ ...content, bullets: [...(content.bullets || []), 'New highlight'] });
  const removeBullet = (i) => setContent({ ...content, bullets: (content.bullets || []).filter((_, idx) => idx !== i) });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title"><TextInput value={content.title} onChange={(v) => setContent({ ...content, title: v })} data-testid="sms-title" /></Field>
        <Field label="Subtitle"><TextInput value={content.subtitle} onChange={(v) => setContent({ ...content, subtitle: v })} data-testid="sms-subtitle" /></Field>
      </div>
      <Field label="Info box title"><TextInput value={content.info_box_title} onChange={(v) => setContent({ ...content, info_box_title: v })} /></Field>
      <Field label="Info box message (HTML allowed)" hint="Use {{phone}} to render the masked phone.">
        <VariableChips onInsert={insertInto('info_box_message')} />
        <TextArea rows={3} value={content.info_box_message} onChange={(v) => setContent({ ...content, info_box_message: v })} data-testid="sms-info-message" />
      </Field>
      <Field label="Consent text (HTML allowed)">
        <VariableChips onInsert={insertInto('consent_text')} />
        <TextArea rows={3} value={content.consent_text} onChange={(v) => setContent({ ...content, consent_text: v })} data-testid="sms-consent" />
      </Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Highlights (bullet list)</label>
          <button onClick={addBullet} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100">
            <Plus className="h-3.5 w-3.5" /> Add bullet
          </button>
        </div>
        {(content.bullets || []).map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <TextInput value={b} onChange={(v) => updateBullet(i, v)} />
            <button onClick={() => removeBullet(i)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Continue button label"><TextInput value={content.continue_label} onChange={(v) => setContent({ ...content, continue_label: v })} /></Field>
        <Field label="Decline button label"><TextInput value={content.decline_label} onChange={(v) => setContent({ ...content, decline_label: v })} /></Field>
      </div>
      <Field label="Footer"><TextInput value={content.footer} onChange={(v) => setContent({ ...content, footer: v })} /></Field>
    </div>
  );
};

// ─── Preview ───
const Preview = ({ sectionType, content }) => {
  const previewCtx = {
    user_name: 'Jordan Reeves',
    email: 'jordan@example.com',
    phone_masked: '●●●3210',
    company_name: 'Your Company',
    document_name: 'Authorization to Release Records',
  };
  const rendered = useMemo(() => renderContent(content, previewCtx), [content]);
  if (sectionType === 'consent_disclosure') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 max-h-[500px] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900">{rendered.title}</h3>
        <p className="text-xs text-gray-500 mb-4">{rendered.subtitle}</p>
        {(rendered.sections || []).map((s, i) => (
          <div key={i} className="mb-4">
            <h4 className="text-sm font-bold text-gray-800 mb-1">{s.title}</h4>
            <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{s.content}</p>
          </div>
        ))}
        <p className="text-[11px] text-gray-400 mt-4 pt-3 border-t border-gray-100">{rendered.footer}</p>
      </div>
    );
  }
  if (sectionType === 'review_continue') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 max-h-[500px] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900">{rendered.title}</h3>
        <p className="text-xs text-gray-500 mb-4">{rendered.subtitle}</p>
        <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: rendered.body_html || '' }} />
        <div className="text-xs text-gray-500 mt-4 pt-3 border-t border-gray-100 prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: rendered.footer_html || '' }} />
        <a className="text-xs underline text-indigo-700 block mt-3">{rendered.disclosure_link_text}</a>
        <label className="flex items-start gap-2 mt-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
          <input type="checkbox" disabled />
          <span className="text-sm">{rendered.checkbox_text}</span>
        </label>
        <button disabled className="mt-3 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg opacity-80">{rendered.continue_label}</button>
      </div>
    );
  }
  // sms_disclaimer
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white px-4 py-3">
        <h3 className="font-bold">{rendered.title}</h3>
        <p className="text-xs text-indigo-100">{rendered.subtitle}</p>
      </div>
      <div className="p-4 space-y-3">
        <div className="bg-indigo-50 rounded-lg p-3">
          <p className="text-sm font-semibold text-gray-900">{rendered.info_box_title}</p>
          <p className="text-xs text-gray-700 mt-1" dangerouslySetInnerHTML={{ __html: rendered.info_box_message || '' }} />
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-gray-800" dangerouslySetInnerHTML={{ __html: rendered.consent_text || '' }} />
          <ul className="mt-2 text-xs text-gray-700 list-disc pl-5">
            {(rendered.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
        <div className="flex gap-2">
          <button disabled className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg">{rendered.decline_label}</button>
          <button disabled className="flex-1 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg opacity-80">{rendered.continue_label}</button>
        </div>
        <p className="text-[10px] text-gray-500 text-center">{rendered.footer}</p>
      </div>
    </div>
  );
};

// ─── Main page ───
const ContentConfigPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sections, setSections] = useState({}); // { type: { content, is_default, ... } }
  const [drafts, setDrafts] = useState({}); // { type: editing-content }
  const [activeSection, setActiveSection] = useState('consent_disclosure');
  const [showPreview, setShowPreview] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await docflowService.getContentConfig();
      const data = res.data || res;
      setSections(data.sections || {});
      const next = {};
      Object.keys(data.sections || {}).forEach((k) => {
        next[k] = JSON.parse(JSON.stringify(data.sections[k].content || {}));
      });
      setDrafts(next);
    } catch (e) {
      toast.error(e.message || 'Failed to load content configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await docflowService.updateContentSection(activeSection, drafts[activeSection]);
      const data = res.data || res;
      setSections((prev) => ({ ...prev, [activeSection]: data }));
      toast.success('Saved');
    } catch (e) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset this section to system defaults? Your custom content will be lost.')) return;
    try {
      setResetting(true);
      const res = await docflowService.resetContentSection(activeSection);
      const data = res.data || res;
      setSections((prev) => ({ ...prev, [activeSection]: data }));
      setDrafts((prev) => ({ ...prev, [activeSection]: JSON.parse(JSON.stringify(data.content || {})) }));
      toast.success('Reset to defaults');
    } catch (e) {
      toast.error(e.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const setDraftContent = (next) => {
    setDrafts((prev) => ({ ...prev, [activeSection]: next }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        <span className="ml-3 text-sm text-gray-500">Loading content configuration...</span>
      </div>
    );
  }

  const draft = drafts[activeSection] || {};
  const isDefault = sections[activeSection]?.is_default;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" data-testid="content-config-page">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Content Configuration</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customise the consent + SMS surfaces shown to public signers. Changes apply to every signing flow in your tenant.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50" data-testid="cc-toggle-preview">
            <Eye className="h-4 w-4" /> {showPreview ? 'Hide' : 'Show'} preview
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="border-b border-gray-200 mb-5">
        <nav className="flex gap-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const sec = sections[s.id];
            const customised = sec && !sec.is_default;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeSection === s.id ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
                data-testid={`cc-tab-${s.id}`}
              >
                <Icon className="h-4 w-4" />
                <span>{s.label}</span>
                {customised && <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">Customised</span>}
                {sec?.is_default && <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">Default</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className={`grid ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-6`}>
        {/* Editor */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-xs text-gray-500">{SECTIONS.find((s) => s.id === activeSection)?.hint}</p>
          {activeSection === 'consent_disclosure' && <ConsentDisclosureEditor content={draft} setContent={setDraftContent} />}
          {activeSection === 'review_continue' && <ReviewContinueEditor content={draft} setContent={setDraftContent} />}
          {activeSection === 'sms_disclaimer' && <SmsDisclaimerEditor content={draft} setContent={setDraftContent} />}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-200">
            <button onClick={handleReset} disabled={resetting || isDefault} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50" data-testid="cc-reset-btn">
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reset to default
            </button>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50" data-testid="cc-save-btn">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
            </button>
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Preview</p>
            <Preview sectionType={activeSection} content={draft} />
            <p className="text-[11px] text-gray-400">Sample data is used for preview. Real values are substituted at signing time.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentConfigPage;
