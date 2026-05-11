import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Plus, Trash2, FileText, Users, Send, CheckCircle,
  Loader2, ChevronDown, GitBranch, Layers, ArrowDownUp, Link2, Mail,
  AlertCircle, Shield, CalendarClock, Copy, ExternalLink, X, MessageSquare,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import { Badge } from '../../components/ui/badge';
// eslint-disable-next-line no-unused-vars
import TriggerConfiguration from '../components/TriggerConfiguration';  // Phase 63: imported so the Setup-Trigger code path stays fully wired up even though the Template UI currently hides the mode selector.
import ReminderConfigPicker from '../components/ReminderConfigPicker';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STEPS = [
  { id: 'delivery', label: 'Delivery Mode', icon: Send },
  { id: 'recipients', label: 'Configure Recipients', icon: Users },
  { id: 'review', label: 'Review & Send', icon: Send },
];

const ROLE_OPTIONS = [
  { value: 'SIGN', label: 'Signer', desc: 'Can fill fields and sign document' },
  { value: 'APPROVE_REJECT', label: 'Approver', desc: 'Can approve or reject (no field editing)' },
  { value: 'REVIEWER', label: 'Reviewer', desc: 'Can only view and confirm review' },
  { value: 'RECEIVE_COPY', label: 'Receive Copy', desc: 'Gets final output after completion' },
];

const DELIVERY_MODES = [
  { value: 'public_link', label: 'Public Link Only', icon: Link2, desc: 'Generate a single public signing link' },
  { value: 'email', label: 'Email Only', icon: Mail, desc: 'Send email to each recipient' },
];

const RECIPIENT_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', dot: 'bg-amber-500' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300', dot: 'bg-purple-500' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300', dot: 'bg-cyan-500' },
];

// Phase 81.18 — Field types eligible for per-recipient assignment.
// Plain `text/date/signature/initials` are always assignable. `merge` is
// included ONLY when `fallbackToInput` is true (the author flipped
// "Convert to Input" — the field is now an interactive input). Plain
// merges are CRM-populated, read-only, and visible to all recipients,
// so they MUST NOT appear in the Assign Fields panel.
// Phase 81.30 — `checkbox` + `radio` are now assignable for parity with
// signatures/text/date. Each radio "option" field is assigned individually
// (the Visual Builder stores radio groups as N sibling fields with the same
// `groupName`); senders can put each option under a different recipient if
// the legal flow requires it.
const ASSIGNABLE_FIELD_TYPES = ['signature', 'initials', 'text', 'date', 'checkbox', 'radio'];
const isAssignableField = (f) => {
  if (!f) return false;
  const t = (f.type || f.field_type || '').toLowerCase();
  if (ASSIGNABLE_FIELD_TYPES.includes(t)) return true;
  if (t === 'merge' && f.fallbackToInput === true) return true;
  return false;
};
const fieldDisplayType = (f) => {
  const t = (f.type || f.field_type || '').toLowerCase();
  if (t === 'merge' && f.fallbackToInput) {
    const input = (f.fallbackInputType || 'text').toLowerCase();
    return `merge → ${input}`;
  }
  if (t === 'radio' && (f.groupName || f.group_name)) {
    return `radio · ${f.groupName || f.group_name}`;
  }
  return t;
};

const fieldDisplayLabel = (f) => {
  const t = (f.type || f.field_type || '').toLowerCase();
  if (t === 'radio') {
    return f.optionLabel || f.option_label || f.label || 'Radio option';
  }
  if (t === 'checkbox') {
    // Phase 81.31 — prefer the user-customised `label` over the default
    // `checkboxLabel` ("Check to agree") so the Assign panel shows the
    // form-builder name instead of generic placeholder text.
    return f.label || f.checkboxLabel || 'Checkbox';
  }
  return f.label || t || 'Unnamed';
};

// Phase 81.31 — Group sibling radio fields (same `groupName`) into ONE
// virtual row in the Assign Fields panel. A radio group is always owned
// by a single recipient; assigning the group writes to every option's
// `assigned_field_ids` together.
// Phase 81.32 — `displayLabel` prefers the FIRST non-empty `field.label`
// among the group's siblings (Visual Builder's "Label" input); falls back
// to `groupName` only when no friendly label was customised.
const groupAssignableFields = (fields) => {
  const seenGroups = new Map();
  const result = [];
  const isFriendlyLabel = (s, groupName) => {
    if (!s || typeof s !== 'string') return false;
    const trimmed = s.trim();
    if (!trimmed) return false;
    if (trimmed === groupName) return false;
    return true;
  };
  for (const f of fields) {
    const t = (f.type || f.field_type || '').toLowerCase();
    const groupName = f.groupName || f.group_name;
    if (t === 'radio' && groupName) {
      const existing = seenGroups.get(groupName);
      if (existing) {
        existing.fieldIds.push(f.id);
        existing.optionLabels.push(f.optionLabel || f.option_label || f.label || '');
        if (!existing.displayLabel && isFriendlyLabel(f.label, groupName)) {
          existing.displayLabel = f.label;
        }
        continue;
      }
      const friendly = isFriendlyLabel(f.label, groupName) ? f.label : '';
      const row = {
        __isRadioGroup: true,
        id: `group::${groupName}`,
        groupName,
        displayLabel: friendly,
        label: friendly || groupName,
        type: 'radio',
        field_type: 'radio',
        page: f.page,
        fieldIds: [f.id],
        optionLabels: [f.optionLabel || f.option_label || f.label || ''],
        sample: f,
      };
      seenGroups.set(groupName, row);
      result.push(row);
    } else {
      result.push(f);
    }
  }
  for (const row of result) {
    if (row.__isRadioGroup) {
      row.label = row.displayLabel || row.groupName;
    }
  }
  return result;
};

// Backend role mapping (matches existing generateLinks contract).
const ROLE_TO_API = (roleType) => {
  switch (roleType) {
    case 'APPROVE_REJECT': return 'approver';
    case 'REVIEWER': return 'reviewer';
    case 'RECEIVE_COPY': return 'receive_copy';
    default: return 'sign';
  }
};

const detectRoutingMode = (recipients) => {
  const orders = recipients.filter(r => r.role_type !== 'RECEIVE_COPY').map(r => r.routing_order);
  if (orders.length <= 1) return 'sequential';
  const unique = new Set(orders);
  if (unique.size === orders.length) return 'sequential';
  if (unique.size === 1) return 'parallel';
  return 'mixed';
};

const groupByWave = (recipients) => {
  const groups = {};
  recipients.forEach(r => {
    const key = r.routing_order;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([order, members]) => ({ order: Number(order), members }));
};

// Back-compat: auto-map legacy `assigned_field_ids`/`assigned_components` on
// template.recipients into the new field→recipient map used in Step 2.
const buildInitialAssignments = (templateRecipients, fieldPlacements, runtimeRecipients) => {
  if (!templateRecipients?.length || !fieldPlacements?.length) return {};
  const assignments = {};
  const validFieldIds = new Set(fieldPlacements.map(f => f.id));
  templateRecipients.forEach(tr => {
    const runtime = runtimeRecipients.find(r => r.template_recipient_id === tr.id);
    if (!runtime) return;
    (tr.assigned_field_ids || tr.assigned_components || []).forEach(fid => {
      if (validFieldIds.has(fid) && !assignments[fid]) {
        assignments[fid] = runtime.id;
      }
    });
  });
  return assignments;
};

const GenerateDocumentWizard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('template');

  const [loading, setLoading] = useState(Boolean(templateId));
  const [template, setTemplate] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Step state — identical to SendPackagePage
  const [step, setStep] = useState(0);

  // Version control (template-only feature, shown in Step 3)
  const [versionHistory, setVersionHistory] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(templateId);

  // Recipients + routing (package-style)
  const [recipients, setRecipients] = useState([
    { id: '1', name: '', email: '', role_type: 'SIGN', routing_order: 1, email_template_id: '', reminder_config: null },
  ]);
  const [deliveryMode, setDeliveryMode] = useState('email');
  const [otpEnabled, setOtpEnabled] = useState(false);
  // Phase 81 — SMS verification mode. When ON, every recipient must have a
  // phone number; the signing page presents an OTP "Security Check" before
  // allowing the recipient to view/sign the document.
  const [smsMode, setSmsMode] = useState(false);

  // Field assignment map: fieldId → recipientId
  const [fieldAssignments, setFieldAssignments] = useState({});

  // Document expiry (template-only, shown in Step 3)
  const [expiryMode, setExpiryMode] = useState('no_expiry');
  const [expiryDate, setExpiryDate] = useState('');

  // Email templates
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailTemplatesLoaded, setEmailTemplatesLoaded] = useState(false);

  // Public link dialog (after send)
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState([]);

  // ─── Setup Trigger (HIDDEN in Template UI per product spec) ───
  // Phase 63: UI hidden but state, import and handler are preserved for
  // future re-enablement (requirement: "If we enable/show it in future, it
  // works exactly as expected"). DO NOT remove.
  const [triggerMode] = useState(false);      // always false — UI toggle removed from Template flow
  // eslint-disable-next-line no-unused-vars
  const [triggerConfig, setTriggerConfig] = useState({
    enabled: false,
    trigger_type: 'onUpdate',
    object_type: '',
    email_field: '',
    conditions: [],
  });

  useEffect(() => {
    if (templateId) loadTemplate();
    loadEmailTemplates();
    // eslint-disable-next-line
  }, [templateId]);

  const loadTemplate = async () => {
    // Session cache hydrate for snappy reopen.
    let hydrated = false;
    try {
      const cacheRaw = sessionStorage.getItem(`docflow_tpl_cache:${templateId}`);
      if (cacheRaw) {
        const cached = JSON.parse(cacheRaw);
        if (cached?.templateData) {
          applyTemplate(cached.templateData, true);
          setLoading(false);
          hydrated = true;
        }
      }
    } catch (_cacheErr) { /* ignore */ }

    try {
      const data = await docflowService.getTemplate(templateId);
      applyTemplate(data, false);
      setSelectedVersionId(templateId);
      setLoading(false);

      // Background: version history for Step 3 selector
      docflowService.getTemplateVersions(templateId)
        .then(vData => setVersionHistory(vData.versions || []))
        .catch(() => {});

      try {
        sessionStorage.setItem(
          `docflow_tpl_cache:${templateId}`,
          JSON.stringify({ templateData: data })
        );
      } catch (_saveErr) { /* quota — ignore */ }
    } catch (error) {
      console.error('Error loading template:', error);
      if (!hydrated) toast.error('Failed to load template');
      setLoading(false);
    }
  };

  const applyTemplate = (data, isCached) => {
    setTemplate(data);
    // Only seed recipients from template on the first (live) load, so that
    // cache-hydrate doesn't wipe in-progress edits.
    if (!isCached) return;
    const tmplRecipients = data?.recipients || [];
    if (tmplRecipients.length > 0) {
      const seeded = tmplRecipients.map((r, i) => ({
        id: String(r.id || `rcpt_${Date.now()}_${i}`),
        template_recipient_id: r.id,
        name: '',
        email: '',
        role_type: 'SIGN',
        routing_order: r.routing_order || (i + 1),
        email_template_id: '',
        // Phase 81.24
        reminder_config: null,
        _placeholder: r.placeholder_name,
      }));
      setRecipients(seeded);
      const initial = buildInitialAssignments(
        tmplRecipients,
        data?.field_placements || [],
        seeded,
      );
      if (Object.keys(initial).length) setFieldAssignments(initial);
    }
  };

  const loadEmailTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_URL}/api/docflow/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setEmailTemplates(data.templates || []);
      setEmailTemplatesLoaded(true);
    } catch {
      setEmailTemplatesLoaded(true);
    }
  };

  const routingMode = useMemo(() => detectRoutingMode(recipients), [recipients]);
  const waveGroups = useMemo(() => groupByWave(recipients), [recipients]);
  const signerRecipients = useMemo(() => recipients.filter(r => r.role_type === 'SIGN'), [recipients]);
  const isPublicLinkMode = deliveryMode === 'public_link';
  const needsRecipientStep = deliveryMode !== 'public_link';

  const addRecipient = () => {
    const maxOrder = recipients.length > 0 ? Math.max(...recipients.map(r => r.routing_order)) : 0;
    setRecipients([...recipients, {
      id: String(Date.now()), name: '', email: '', role_type: 'SIGN',
      routing_order: maxOrder + 1, email_template_id: '', reminder_config: null,
    }]);
  };

  const addParallelRecipient = (order) => {
    setRecipients([...recipients, {
      id: String(Date.now()), name: '', email: '', role_type: 'SIGN',
      routing_order: order, email_template_id: '', reminder_config: null,
    }]);
  };

  const updateRecipient = (idx, field, value) => {
    setRecipients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRecipient = (idx) => {
    if (recipients.length <= 1) return;
    const removedId = recipients[idx].id;
    setRecipients(prev => prev.filter((_, i) => i !== idx));
    setFieldAssignments(fa => {
      const newFa = { ...fa };
      Object.keys(newFa).forEach(k => { if (newFa[k] === removedId) delete newFa[k]; });
      return newFa;
    });
  };

  const assignField = (fieldId, recipientId) => {
    setFieldAssignments(prev => {
      const next = { ...prev };
      if (!recipientId) delete next[fieldId]; else next[fieldId] = recipientId;
      return next;
    });
  };

  // Phase 81.31 — Assigning a radio GROUP writes the same recipient to every
  // option's id so the entire group routes to one signer.
  const assignRadioGroup = (fieldIds, recipientId) => {
    setFieldAssignments(prev => {
      const next = { ...prev };
      fieldIds.forEach(fid => {
        if (!recipientId) delete next[fid]; else next[fid] = recipientId;
      });
      return next;
    });
  };

  const radioGroupAssignment = (fieldIds) => {
    const set = new Set(fieldIds.map(fid => fieldAssignments[fid] || ''));
    if (set.size === 1) return [...set][0];
    return '';
  };

  const getRecipientColor = (recipientId) => {
    const idx = recipients.findIndex(r => r.id === recipientId);
    return RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length] || RECIPIENT_COLORS[0];
  };

  const assignableFields = useMemo(() => {
    const all = template?.field_placements || [];
    return all.filter(isAssignableField);
  }, [template]);

  // Phase 81.31 — Group sibling radio fields into one row per groupName.
  const assignableRows = useMemo(() => groupAssignableFields(assignableFields), [assignableFields]);

  // Phase 81.18 — Auto-default converted merge fields (merge with
  // `fallbackToInput=true`) to recipient #1 when first surfaced. Plain
  // text/signature/etc. assignments remain manual. Skip if user already
  // set a value, or if the field already has a backend assigned_to.
  // Phase 81.44 — When there's EXACTLY one signer recipient, all other
  // assignable field types (signature/initials/text/date/checkbox/radio)
  // are also auto-assigned to that signer since there's no ambiguity.
  // With 2+ signers, only converted merges auto-assign; everything else
  // stays unassigned so the sender must explicitly pick who signs what.
  useEffect(() => {
    if (!signerRecipients.length || !assignableFields.length) return;
    const firstSignerId = signerRecipients[0]?.id;
    if (!firstSignerId) return;
    const autoAssignAll = signerRecipients.length === 1;
    setFieldAssignments(prev => {
      let changed = false;
      const next = { ...prev };
      assignableFields.forEach(f => {
        const t = (f.type || f.field_type || '').toLowerCase();
        const isConvertedMerge = t === 'merge' && f.fallbackToInput;
        if (!isConvertedMerge && !autoAssignAll) return;
        if (next[f.id]) return;          // already assigned
        if (f.assigned_to || f.recipient_id) return; // backend pre-assigned
        next[f.id] = firstSignerId;
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [assignableFields, signerRecipients]);

  // Phase 70: Surface template issues BEFORE the user clicks Send. We
  // inspect merge-type placements and flag any that weren't bound to a
  // CRM object/field — the exact same check the backend runs in
  // `validation_service._check_merge_fields`. Shown as a red banner in
  // Step 3 so the user knows the generation call will be rejected.
  const unconfiguredMergeFields = useMemo(() => {
    const placements = template?.field_placements || [];
    return placements
      .filter(f => (f.type || '').toLowerCase() === 'merge')
      .filter(f => {
        const obj = f.mergeObject || f.merge_object || '';
        const field = f.mergeField || f.merge_field || '';
        return !obj || !field;
      })
      .map(f => f.label || f.name || f.id || 'Unnamed');
  }, [template]);

  const assignmentStats = useMemo(() => {
    // Phase 81.31 — count radio groups as ONE row each.
    const total = assignableRows.length;
    let assigned = 0;
    assignableRows.forEach(row => {
      if (row.__isRadioGroup) {
        if (radioGroupAssignment(row.fieldIds)) assigned += 1;
      } else if (fieldAssignments[row.id]) {
        assigned += 1;
      }
    });
    return { totalFields: total, assignedFields: assigned, unassigned: total - assigned };
  }, [assignableRows, fieldAssignments]);

  const canProceed = () => {
    if (step === 0) return true;
    if (step === 1) {
      if (!needsRecipientStep) return true;
      const baseOk = recipients.every(r => r.name.trim() && r.email.trim());
      if (!baseOk) return false;
      // Phase 81.12 — SMS Disclaimer ON ⇒ phone required for actionable recipients.
      if (smsMode) {
        const ACTIONABLE = new Set(['SIGN', 'SIGNER', 'APPROVE_REJECT', 'APPROVER']);
        return recipients.every(r => {
          if (!ACTIONABLE.has(String(r.role_type || 'SIGN').toUpperCase())) return true;
          return (r.phone || '').trim().length > 0;
        });
      }
      return true;
    }
    return true;
  };

  const goToStep = useCallback((nextStep) => {
    let target = nextStep;
    // Skip recipient step when only a public link is being generated.
    if (!needsRecipientStep && target === 1) {
      target = step < 1 ? 2 : 0;
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [needsRecipientStep, step]);

  const handleSend = async () => {
    if (template?.status === 'draft') {
      toast.error('This template is in draft. Please validate and save it again');
      return;
    }

    try {
      setGenerating(true);

      // Build the recipients payload. Each recipient receives the list of
      // field IDs explicitly mapped to them via the Step-2 assignment panel.
      const apiRecipients = recipients
        .filter(r => (needsRecipientStep ? (r.name || r.email) : true))
        .map(r => {
          const assignedFieldIds = Object.entries(fieldAssignments)
            .filter(([, recipId]) => recipId === r.id)
            .map(([fid]) => fid);
          return {
            name: r.name || '',
            email: r.email || '',
            // Phase 81.13 — propagate phone so the backend SMS guard sees it.
            // Trim spaces so accidental whitespace doesn't bypass validation.
            phone: (r.phone || '').trim(),
            role: ROLE_TO_API(r.role_type),
            routing_order: r.routing_order || 1,
            assigned_components: assignedFieldIds,  // backend contract preserved
            email_template_id: r.email_template_id || undefined,
            // Phase 81.24 — per-recipient pending-signature reminder schedule.
            reminder_config: (r.reminder_config && r.reminder_config.enabled) ? r.reminder_config : undefined,
          };
        });

      // Public-link flow with no recipients → synthesize one so the backend
      // still has a record to attach the link to (mirrors legacy behavior).
      if (isPublicLinkMode && apiRecipients.length === 0) {
        apiRecipients.push({
          name: '', email: '', role: 'sign', routing_order: 1,
          assigned_components: [],
        });
      }

      const apiRoutingMode = routingMode === 'mixed' ? 'sequential' : routingMode;

      // Phase 81.13 — when SMS Disclaimer is on, every actionable recipient
      // (signer / approver) must have a phone. Validate against the UI form
      // state (`recipients`) so the check always reflects the latest values
      // typed by the user. Receive-copy roles are exempt.
      if (smsMode && !isPublicLinkMode) {
        const ACTIONABLE = new Set(['SIGN', 'SIGNER', 'APPROVE_REJECT', 'APPROVER']);
        const missingPhones = recipients
          .filter(r => ACTIONABLE.has(String(r.role_type || 'SIGN').toUpperCase()))
          .filter(r => !((r.phone || '').trim()))
          .map(r => r.name || r.email || 'Unnamed');
        if (missingPhones.length > 0) {
          toast.error(`SMS Disclaimer is ON — phone required for: ${missingPhones.join(', ')}`);
          return;
        }
      }

      const result = await docflowService.generateLinks({
        template_id: selectedVersionId || templateId,
        document_name: template?.name || '',
        routing_type: apiRoutingMode,
        delivery_mode: deliveryMode,
        send_email: !isPublicLinkMode,
        source_context: { record_id: 'manual-send', object_type: 'manual' },
        recipients: apiRecipients,
        merge_fields: {},
        expires_at: expiryMode === 'custom' && expiryDate
          ? new Date(expiryDate).toISOString()
          : null,
        require_auth: otpEnabled,
        sms_mode: !!smsMode && !isPublicLinkMode,
      });

      if (!result.success) {
        const errorMsg = result.errors?.join(', ') || result.message || 'Generation failed';
        toast.error(errorMsg);
        return;
      }

      toast.success(result.message || 'Document generated successfully!');

      // Show public-link popup if delivery included a link.
      if (isPublicLinkMode && (result.public_link || result.recipient_links?.length)) {
        const links = (result.recipient_links || []).map((r, idx) => ({
          id: idx,
          name: r.name || template?.name || 'Document',
          url: r.access_link,
        }));
        if (result.public_link && !links.find(l => l.url === result.public_link)) {
          links.unshift({ id: 'public', name: template?.name || 'Public Link', url: result.public_link });
        }
        if (links.length > 0) {
          setGeneratedLinks(links);
          setShowLinkModal(true);
          return;
        }
      }

      navigate('/setup/docflow?tab=documents');
    } catch (error) {
      console.error('Error generating document:', error);
      // Phase 70: the axios interceptor now attaches the backend's
      // `errors: [...]` array to the rejected Error. Prefer that — the
      // top-level "Processing failed." is a generic label whereas the
      // `errors` array contains the actual reason (e.g. "Template
      // validation failed: 2 merge field(s) not fully configured: ...").
      const detailed = (error?.errors || []).join(' — ');
      const baseMsg = error?.message || 'Failed to generate document';
      const full = detailed ? `${baseMsg} ${detailed}` : baseMsg;
      toast.error(full, { duration: 8000 });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copied!');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Link copied!');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const deliveryModeLabel = DELIVERY_MODES.find(m => m.value === deliveryMode)?.label || '';

  return (
    <div className="min-h-full bg-gray-50" data-testid="generate-document-wizard">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/setup/docflow')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
            data-testid="back-button"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Templates
          </button>
          <div className="flex items-center gap-3">
            <Send className="h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Generate Document</h1>
              <p className="text-sm text-gray-500 flex items-center gap-2">
                Template: {template?.name}
                {template?.version && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <GitBranch className="h-2.5 w-2.5" />
                    v{template.version}{template.is_latest !== false && ' (Latest)'}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Step Indicators — identical layout to SendPackagePage */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          {STEPS.map((s, i) => {
            const isDisabled = isPublicLinkMode && i === 1;
            return (
              <React.Fragment key={s.id}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isDisabled ? 'text-gray-300 line-through' :
                  i === step ? 'bg-indigo-50 text-indigo-700' : i < step ? 'text-emerald-600' : 'text-gray-400'
                }`}>
                  {!isDisabled && i < step ? <CheckCircle className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                  {s.label}
                  {isDisabled && <span className="text-[10px] font-normal no-underline ml-1">(skipped)</span>}
                </div>
                {i < STEPS.length - 1 && <ChevronDown className="h-4 w-4 text-gray-300 rotate-[-90deg]" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Step 1: Delivery Mode */}
        {step === 0 && (
          <div className="space-y-6" data-testid="step-delivery">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Delivery Mode</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {DELIVERY_MODES.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setDeliveryMode(opt.value)}
                    className={`flex flex-col items-start gap-1.5 p-3 rounded-lg text-left transition-colors ${
                      deliveryMode === opt.value
                        ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-300'
                        : 'text-gray-500 border border-gray-200 hover:bg-gray-50'
                    }`}
                    data-testid={`delivery-${opt.value}`}
                  >
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </div>
                    <span className="text-[11px] opacity-75">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {deliveryMode === 'public_link' && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700" data-testid="public-link-info">
                <strong>Public Link:</strong> A single signing link will be generated. Any user with the link can sign.
              </div>
            )}
          </div>
        )}

        {/* Step 2: Recipients + Field Assignment */}
        {step === 1 && (
          <div className="space-y-6" data-testid="step-recipients">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-700">Recipients</h3>
                <Badge
                  className={`text-[10px] font-semibold ${
                    routingMode === 'sequential' ? 'bg-slate-100 text-slate-600' :
                    routingMode === 'parallel' ? 'bg-violet-100 text-violet-700' :
                    'bg-amber-100 text-amber-700'
                  }`}
                  data-testid="routing-mode-badge"
                >
                  {routingMode === 'sequential' && <><ArrowDownUp className="h-3 w-3 mr-1 inline" />Sequential</>}
                  {routingMode === 'parallel' && <><Layers className="h-3 w-3 mr-1 inline" />Parallel</>}
                  {routingMode === 'mixed' && <><GitBranch className="h-3 w-3 mr-1 inline" />Mixed</>}
                </Badge>
              </div>
              <button
                onClick={addRecipient}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                data-testid="add-recipient-btn"
              >
                <Plus className="h-4 w-4" /> Add Step
              </button>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-xs text-indigo-700" data-testid="routing-tip">
              <strong>Tip:</strong> Recipients with the <em>same routing order</em> run in parallel. Different orders run sequentially.
            </div>

            {/* Phase 81.12 — SMS Disclaimer toggle. Default OFF. When ON, the
                public signing flow shows an SMS disclaimer page before the
                consent popup, and phone becomes required for actionable
                recipients. Moved here from the Review step per spec. */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between" data-testid="sms-disclaimer-section">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">SMS Disclaimer</p>
                  <p className="text-[11px] text-gray-500">
                    {smsMode
                      ? 'Recipients see an SMS disclaimer page before the consent popup. Phone is required.'
                      : 'Open normal flow directly — no disclaimer page is shown.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSmsMode(!smsMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${smsMode ? 'bg-indigo-500' : 'bg-gray-200'}`}
                data-testid="sms-disclaimer-toggle"
                aria-pressed={smsMode}
                aria-label="Toggle SMS Disclaimer"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${smsMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Wave-grouped recipients */}
            <div className="space-y-4">
              {waveGroups.map((wave, waveIdx) => (
                <div key={wave.order} className="relative" data-testid={`wave-group-${wave.order}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      wave.members.length > 1 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {wave.members.length > 1 ? <Layers className="h-3 w-3" /> : <ArrowDownUp className="h-3 w-3" />}
                      Wave {waveIdx + 1} &mdash; Order {wave.order}
                      {wave.members.length > 1 && <span className="ml-1 text-violet-500">({wave.members.length} parallel)</span>}
                    </div>
                    <button
                      onClick={() => addParallelRecipient(wave.order)}
                      className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 px-2 py-0.5 rounded border border-violet-200 hover:bg-violet-50"
                      data-testid={`add-parallel-btn-${wave.order}`}
                    >
                      <Plus className="h-3 w-3" /> Parallel
                    </button>
                  </div>

                  <div className={`space-y-2 ${wave.members.length > 1 ? 'ml-1 pl-4 border-l-2 border-violet-200' : ''}`}>
                    {wave.members.map((r) => {
                      const idx = recipients.findIndex(rec => rec.id === r.id);
                      const color = getRecipientColor(r.id);
                      return (
                        <div
                          key={r.id}
                          className={`bg-white rounded-xl border p-4 ${wave.members.length > 1 ? 'border-violet-200' : 'border-gray-200'}`}
                          data-testid={`recipient-form-${idx}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${color.bg} ${color.text}`}>
                                {r.routing_order}
                              </span>
                              <span className="text-sm font-medium text-gray-700">
                                {r.name || r._placeholder || `Recipient ${idx + 1}`}
                              </span>
                            </div>
                            {recipients.length > 1 && (
                              <button
                                onClick={() => removeRecipient(idx)}
                                className="p-1 text-gray-400 hover:text-red-500"
                                data-testid={`remove-recipient-${idx}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Name *</label>
                              <input
                                value={r.name}
                                onChange={(e) => updateRecipient(idx, 'name', e.target.value)}
                                placeholder="Full name"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                data-testid={`recipient-name-${idx}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Email *</label>
                              <input
                                value={r.email}
                                onChange={(e) => updateRecipient(idx, 'email', e.target.value)}
                                placeholder="email@example.com"
                                type="email"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                data-testid={`recipient-email-${idx}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Role</label>
                              <select
                                value={r.role_type}
                                onChange={(e) => updateRecipient(idx, 'role_type', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                data-testid={`recipient-role-${idx}`}
                              >
                                {ROLE_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Phone {smsMode ? <span className="text-rose-500">*</span> : <span className="text-gray-400">(optional)</span>}
                              </label>
                              <input
                                value={r.phone || ''}
                                onChange={(e) => updateRecipient(idx, 'phone', e.target.value)}
                                placeholder="+1 555 0100"
                                type="tel"
                                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${smsMode && !r.phone ? 'border-rose-300 bg-rose-50/40' : 'border-gray-300'}`}
                                data-testid={`recipient-phone-${idx}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Routing Order</label>
                              <input
                                type="number"
                                min={1}
                                value={r.routing_order}
                                onChange={(e) => updateRecipient(idx, 'routing_order', parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                data-testid={`recipient-order-${idx}`}
                              />
                            </div>
                            {emailTemplatesLoaded && emailTemplates.length > 0 && (
                              <div className="sm:col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">
                                  Email Template <span className="text-gray-400">(optional)</span>
                                </label>
                                <select
                                  value={r.email_template_id || ''}
                                  onChange={(e) => updateRecipient(idx, 'email_template_id', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                  data-testid={`recipient-email-template-${idx}`}
                                >
                                  <option value="">Default (based on role)</option>
                                  {emailTemplates.map(et => (
                                    <option key={et.id} value={et.id}>
                                      {et.name} — {(et.template_type || '').replace(/_/g, ' ')}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                          {/* Phase 81.24 — Per-recipient pending-signature reminder schedule */}
                          <div className="mt-3">
                            <ReminderConfigPicker
                              idx={idx}
                              dataTestPrefix="template-reminder"
                              value={r.reminder_config || null}
                              onChange={(cfg) => updateRecipient(idx, 'reminder_config', cfg)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {waveIdx < waveGroups.length - 1 && (
                    <div className="flex items-center justify-center my-3">
                      <div className="h-6 w-px bg-gray-300" />
                      <ChevronDown className="h-4 w-4 text-gray-400 -ml-2 -mr-2" />
                      <div className="h-6 w-px bg-gray-300" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Field Assignment Panel */}
            {signerRecipients.length > 0 && assignableFields.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="assign-fields-section">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">Assign Fields to Recipients</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Map each field to a specific signer.</p>
                  </div>
                  {assignmentStats.totalFields > 0 && (
                    <Badge
                      className={`text-xs ${assignmentStats.unassigned > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}
                      data-testid="assignment-stats"
                    >
                      {assignmentStats.assignedFields}/{assignmentStats.totalFields} assigned
                    </Badge>
                  )}
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm font-medium text-gray-700">{template?.name || 'Document'}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {assignableRows.length} field{assignableRows.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {assignableRows.map((row) => {
                      const isGroup = row.__isRadioGroup;
                      const assignedTo = isGroup
                        ? radioGroupAssignment(row.fieldIds)
                        : (fieldAssignments[row.id] || '');
                      const color = assignedTo ? getRecipientColor(assignedTo) : null;
                      const onChange = (e) => isGroup
                        ? assignRadioGroup(row.fieldIds, e.target.value)
                        : assignField(row.id, e.target.value);
                      const displayLabel = isGroup
                        ? `Radio Group: ${row.label}`
                        : fieldDisplayLabel(row);
                      const displayType = isGroup
                        ? `radio group · ${row.fieldIds.length} options`
                        : fieldDisplayType(row);
                      return (
                        <div
                          key={row.id}
                          className={`flex items-center gap-3 px-4 py-3 ${assignedTo ? (color?.bg || '') + '/30' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {color && <span className={`h-2 w-2 rounded-full ${color.dot}`} />}
                              <span className="text-sm text-gray-800 font-medium truncate">
                                {displayLabel}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase font-mono">
                                {displayType}
                              </span>
                              {row.page && (
                                <span className="text-[10px] text-gray-400">Page {row.page}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 w-48">
                            <select
                              value={assignedTo}
                              onChange={onChange}
                              className={`w-full px-2.5 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                assignedTo
                                  ? `${color?.border} ${color?.bg} ${color?.text}`
                                  : 'border-gray-300 bg-white text-gray-600'
                              }`}
                              data-testid={`field-assign-${row.id}`}
                            >
                              <option value="">-- Unassigned --</option>
                              {signerRecipients.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name || `Recipient ${recipients.indexOf(r) + 1}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {assignmentStats.unassigned > 0 && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {assignmentStats.unassigned} unassigned field{assignmentStats.unassigned !== 1 ? 's' : ''}.
                      Unassigned fields stay visible to every signer (matches existing template behavior).
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Send */}
        {step === 2 && (
          <div className="space-y-6" data-testid="step-review">
            {/* Phase 70: Template-issue banner — surfaces validation problems
                BEFORE the user clicks Generate & Send, so the "Processing
                failed" toast is never the first time they learn the template
                is misconfigured. */}
            {unconfiguredMergeFields.length > 0 && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3"
                data-testid="template-warning-banner"
              >
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-red-800">
                    {unconfiguredMergeFields.length} merge field
                    {unconfiguredMergeFields.length === 1 ? '' : 's'} not fully configured
                  </p>
                  <p className="text-red-700 mt-0.5">
                    {unconfiguredMergeFields.slice(0, 3).join(', ')}
                    {unconfiguredMergeFields.length > 3 && ` +${unconfiguredMergeFields.length - 3} more`}.
                    {' '}
                    Edit the template and bind each merge field to a CRM object/field before generating.
                  </p>
                  <button
                    onClick={() => navigate(`/setup/docflow/templates/${templateId}/edit`)}
                    className="text-red-700 underline text-xs mt-1 hover:text-red-900"
                    data-testid="fix-template-btn"
                  >
                    Edit Template →
                  </button>
                </div>
              </div>
            )}
            {/* Version selector (template-only) */}
            {versionHistory.length > 1 && (
              <div className="bg-indigo-50/60 rounded-xl border border-indigo-100 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <GitBranch className="h-4 w-4 text-indigo-600" />
                  Select Version
                </label>
                <select
                  value={selectedVersionId || templateId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  data-testid="version-selector"
                >
                  {versionHistory.map(v => (
                    <option key={v.id} value={v.id}>
                      v{v.version}{v.is_latest ? ' (Latest)' : ''}
                      {v.created_from_version ? ` — from v${v.created_from_version}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Send Summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Send Summary</h3>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <div><dt className="text-gray-500">Template</dt><dd className="font-medium">{template?.name}</dd></div>
                <div><dt className="text-gray-500">Recipients</dt><dd className="font-medium">{isPublicLinkMode ? 'Public link' : recipients.length}</dd></div>
                <div><dt className="text-gray-500">Delivery</dt><dd className="font-medium">{deliveryModeLabel}</dd></div>
                <div><dt className="text-gray-500">Routing</dt><dd className="font-medium capitalize">{routingMode}</dd></div>
                <div><dt className="text-gray-500">OTP</dt><dd className="font-medium">{otpEnabled ? 'Enabled' : 'Disabled'}</dd></div>
                <div><dt className="text-gray-500">SMS Disclaimer</dt><dd className="font-medium">{smsMode ? 'Enabled' : 'Disabled'}</dd></div>
                <div><dt className="text-gray-500">Expiry</dt><dd className="font-medium">{expiryMode === 'custom' && expiryDate ? new Date(expiryDate).toLocaleString() : 'Never'}</dd></div>
              </dl>
            </div>

            {/* Routing Flow */}
            {!isPublicLinkMode && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Routing Flow</h3>
                <div className="space-y-3">
                  {waveGroups.map((wave, waveIdx) => (
                    <div key={wave.order}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          wave.members.length > 1 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {wave.members.length > 1 ? <Layers className="h-3 w-3" /> : <ArrowDownUp className="h-3 w-3" />}
                          Wave {waveIdx + 1}{wave.members.length > 1 && ` — ${wave.members.length} parallel`}
                        </span>
                      </div>
                      <div className={`space-y-1 ml-1 pl-3 border-l-2 ${wave.members.length > 1 ? 'border-violet-200' : 'border-slate-200'}`}>
                        {wave.members.map((r) => {
                          const color = getRecipientColor(r.id);
                          return (
                            <div key={r.id} className="flex items-center justify-between py-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${color.bg} ${color.text}`}>
                                  {r.routing_order}
                                </span>
                                <span className="text-sm text-gray-800">{r.name || 'Unnamed'}</span>
                                {r.email && <span className="text-xs text-gray-400">({r.email})</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-indigo-50 text-indigo-700 text-xs">{r.role_type}</Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {waveIdx < waveGroups.length - 1 && (
                        <div className="flex justify-center my-2">
                          <ChevronDown className="h-4 w-4 text-gray-300" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document Expiry (template-only) */}
            <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="expiry-section">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-gray-500" />
                Document Expiry
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="expiry_mode"
                    value="no_expiry"
                    checked={expiryMode === 'no_expiry'}
                    onChange={() => { setExpiryMode('no_expiry'); setExpiryDate(''); }}
                    className="h-4 w-4 text-indigo-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">No Expiry</p>
                    <p className="text-xs text-gray-500">Document link never expires</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="expiry_mode"
                    value="custom"
                    checked={expiryMode === 'custom'}
                    onChange={() => setExpiryMode('custom')}
                    className="h-4 w-4 text-indigo-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Set Expiry Date &amp; Time</p>
                    <p className="text-xs text-gray-500">Document expires at the specified date/time</p>
                  </div>
                </label>
                {expiryMode === 'custom' && (
                  <div className="ml-7 mt-2">
                    <input
                      type="datetime-local"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      data-testid="expiry-datetime-input"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* OTP toggle (template-only — mirrors package OTP card) */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between" data-testid="otp-toggle-section">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                  <Shield className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">OTP Authentication</p>
                  <p className="text-[11px] text-gray-500">
                    {otpEnabled
                      ? 'Recipients must verify via OTP before accessing documents'
                      : 'Direct access without OTP'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOtpEnabled(!otpEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${otpEnabled ? 'bg-amber-500' : 'bg-gray-200'}`}
                data-testid="otp-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${otpEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => step > 0 ? goToStep(step - 1) : navigate('/setup/docflow')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            data-testid="prev-step-btn"
          >
            <ArrowLeft className="h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < 2 ? (
            <button
              onClick={() => goToStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="next-step-btn"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={generating || triggerMode || unconfiguredMergeFields.length > 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="generate-send-btn"
              title={unconfiguredMergeFields.length > 0
                ? 'Fix unconfigured merge fields in the template before sending'
                : undefined}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {generating ? 'Sending...' : 'Generate & Send'}
            </button>
          )}
        </div>
      </div>

      {/* Public Link Dialog */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="public-link-modal">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full p-2">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Document Link Generated</h2>
                  <p className="text-sm text-white/80">Share this link with your recipients</p>
                </div>
              </div>
              <button
                onClick={() => { setShowLinkModal(false); navigate('/setup/docflow?tab=documents'); }}
                className="text-white/70 hover:text-white"
                data-testid="close-link-modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-72 overflow-y-auto">
              {generatedLinks.map((link, idx) => (
                <div key={link.id || idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{link.name || 'Recipient'}</span>
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">Ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text" readOnly value={link.url}
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 select-all"
                      data-testid={`public-link-url-${idx}`}
                      onClick={(e) => e.target.select()}
                    />
                    <button
                      onClick={() => copyToClipboard(link.url)}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1.5 text-sm font-medium"
                      data-testid={`copy-link-btn-${idx}`}
                    >
                      <Copy className="h-4 w-4" /> Copy
                    </button>
                    <a
                      href={link.url} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium"
                      data-testid={`open-link-btn-${idx}`}
                    >
                      <ExternalLink className="h-4 w-4" /> Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end bg-gray-50">
              <button
                onClick={() => navigate('/setup/docflow?tab=documents')}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                data-testid="go-to-dashboard-btn"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerateDocumentWizard;
