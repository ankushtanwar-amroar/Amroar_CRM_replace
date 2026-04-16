import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Plus, Trash2, FileText, Users, Send,
  Package, CheckCircle, Loader2, ChevronDown,
  GitBranch, Layers, ArrowDownUp, Link2, Mail, AlertCircle, Shield
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import { Badge } from '../../components/ui/badge';

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
  // { value: 'public_recipients', label: 'Public + Recipients', icon: Users, desc: 'Generate unique links per recipient — no emails sent' },
];

const RECIPIENT_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', dot: 'bg-amber-500' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300', dot: 'bg-purple-500' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300', dot: 'bg-cyan-500' },
];

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

const SendPackagePage = () => {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);

  const [recipients, setRecipients] = useState([
    { id: '1', name: '', email: '', role_type: 'SIGN', routing_order: 1, email_template_id: '' },
  ]);
  const [deliveryMode, setDeliveryMode] = useState('email');
  const [otpEnabled, setOtpEnabled] = useState(false);

  // Field assignment
  const [templateFields, setTemplateFields] = useState({});
  const [fieldAssignments, setFieldAssignments] = useState({});
  const [loadingFields, setLoadingFields] = useState(false);

  // Email templates
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailTemplatesLoaded, setEmailTemplatesLoaded] = useState(false);

  // Public link popup
  const [showPublicLinkDialog, setShowPublicLinkDialog] = useState(false);
  const [publicLink, setPublicLink] = useState('');

  // Recipient links popup (for public_recipients mode)
  const [showRecipientLinksDialog, setShowRecipientLinksDialog] = useState(false);
  const [recipientLinks, setRecipientLinks] = useState([]);

  useEffect(() => {
    loadPackage();
    loadEmailTemplates();
  }, [packageId]);

  const loadPackage = async () => {
    try {
      setLoading(true);
      const res = await docflowService.getPackage(packageId, false);
      const data = res.data || res;
      setPkg(data);
    } catch (e) {
      toast.error('Failed to load package');
      navigate('/setup/docflow?tab=packages');
    } finally {
      setLoading(false);
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

  const loadFieldsForDocs = useCallback(async () => {
    if (!pkg?.documents?.length) return;
    setLoadingFields(true);
    const newFields = {};
    for (const doc of pkg.documents) {
      try {
        const data = await docflowService.getFieldPlacements(doc.template_id);
        newFields[doc.template_id] = data?.field_placements || [];
      } catch (e) {
        newFields[doc.template_id] = [];
      }
    }
    setTemplateFields(newFields);
    setLoadingFields(false);
  }, [pkg]);

  useEffect(() => {
    if (pkg && step === 1 && !isPublicLinkMode) loadFieldsForDocs();
  }, [pkg, step]);

  const routingMode = useMemo(() => detectRoutingMode(recipients), [recipients]);
  const waveGroups = useMemo(() => groupByWave(recipients), [recipients]);
  const signerRecipients = useMemo(() => recipients.filter(r => r.role_type === 'SIGN'), [recipients]);

  const addRecipient = () => {
    const maxOrder = recipients.length > 0 ? Math.max(...recipients.map(r => r.routing_order)) : 0;
    setRecipients([...recipients, {
      id: String(Date.now()), name: '', email: '', role_type: 'SIGN', routing_order: maxOrder + 1, email_template_id: '',
    }]);
  };

  const addParallelRecipient = (order) => {
    setRecipients([...recipients, {
      id: String(Date.now()), name: '', email: '', role_type: 'SIGN', routing_order: order, email_template_id: '',
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

  const getRecipientColor = (recipientId) => {
    const idx = recipients.findIndex(r => r.id === recipientId);
    return RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length] || RECIPIENT_COLORS[0];
  };

  const ASSIGNABLE_FIELD_TYPES = ['signature', 'initials', 'text', 'date'];
  const assignmentStats = useMemo(() => {
    let totalFields = 0, assignedFields = 0;
    Object.values(templateFields).forEach(fields => {
      const assignable = fields.filter(f => ASSIGNABLE_FIELD_TYPES.includes(f.type));
      totalFields += assignable.length;
      assignable.forEach(f => { if (fieldAssignments[f.id]) assignedFields++; });
    });
    return { totalFields, assignedFields, unassigned: totalFields - assignedFields };
  }, [templateFields, fieldAssignments]);

  const isPublicLinkMode = deliveryMode === 'public_link';
  const needsRecipientStep = deliveryMode !== 'public_link'; // email, both, public_recipients all need recipients

  const canProceed = () => {
    if (step === 0) return true; // Delivery mode — always can proceed
    if (step === 1) {
      if (!needsRecipientStep) return true; // skipped
      if (deliveryMode === 'public_recipients') {
        // For public_recipients, email is optional since we generate links
        return recipients.every(r => r.name.trim());
      }
      return recipients.every(r => r.name.trim() && r.email.trim());
    }
    return true;
  };

  const goToStep = (nextStep) => {
    // Skip recipients step when public_link only
    if (!needsRecipientStep && nextStep === 1) {
      nextStep = step < 1 ? 2 : 0;
    }
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSend = async () => {
    try {
      setSending(true);
      const recipientsPayload = recipients.map(r => {
        const compMap = {};
        Object.entries(fieldAssignments).forEach(([fieldId, recipientId]) => {
          if (recipientId === r.id) {
            for (const [tmplId, fields] of Object.entries(templateFields)) {
              if (fields.some(f => f.id === fieldId)) {
                if (!compMap[tmplId]) compMap[tmplId] = [];
                compMap[tmplId].push(fieldId);
                break;
              }
            }
          }
        });
        return {
          name: r.name,
          email: r.email,
          role_type: r.role_type,
          routing_order: r.routing_order,
          assigned_components_map: Object.keys(compMap).length > 0 ? compMap : undefined,
          email_template_id: r.email_template_id || undefined,
        };
      });

      const payload = {
        recipients: recipientsPayload,
        delivery_mode: deliveryMode,
        routing_config: { mode: routingMode, on_reject: 'void' },
        security: { require_auth: otpEnabled, session_timeout_minutes: 15 },
      };

      const res = await docflowService.sendPackage(packageId, payload);
      const data = res.data || res;
      if (data.success) {
        toast.success('Package sent!');
        if ((deliveryMode === 'public_link' || deliveryMode === 'both') && data.public_link) {
          setPublicLink(data.public_link);
          setShowPublicLinkDialog(true);
        } else if (deliveryMode === 'public_recipients' && data.recipient_links?.length > 0) {
          // Show recipient links dialog
          setRecipientLinks(data.recipient_links);
          setShowRecipientLinksDialog(true);
        } else {
          navigate(`/setup/docflow/packages/${packageId}`);
        }
      } else {
        toast.error(data.message || 'Failed to send');
      }
    } catch (e) {
      toast.error(e?.message || 'Failed to send package');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!pkg) return null;

  const documents = pkg.documents || [];

  return (
    <div className="min-h-full bg-gray-50" data-testid="send-package-page">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate(`/setup/docflow/packages/${packageId}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3" data-testid="back-btn">
            <ArrowLeft className="h-4 w-4" /> Back to Package
          </button>
          <div className="flex items-center gap-3">
            <Send className="h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Send Package</h1>
              <p className="text-sm text-gray-500">{pkg.name} &middot; {documents.length} document{documents.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step Indicators */}
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
        {/* Step 2: Recipients + Field Assignment */}
        {step === 1 && (
          <div className="space-y-6" data-testid="step-recipients">
            {/* Header with routing mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-700">Recipients</h3>
                <Badge className={`text-[10px] font-semibold ${
                  routingMode === 'sequential' ? 'bg-slate-100 text-slate-600' :
                  routingMode === 'parallel' ? 'bg-violet-100 text-violet-700' :
                  'bg-amber-100 text-amber-700'
                }`} data-testid="routing-mode-badge">
                  {routingMode === 'sequential' && <><ArrowDownUp className="h-3 w-3 mr-1 inline" />Sequential</>}
                  {routingMode === 'parallel' && <><Layers className="h-3 w-3 mr-1 inline" />Parallel</>}
                  {routingMode === 'mixed' && <><GitBranch className="h-3 w-3 mr-1 inline" />Mixed</>}
                </Badge>
              </div>
              <button onClick={addRecipient} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700" data-testid="add-recipient-btn">
                <Plus className="h-4 w-4" /> Add Step
              </button>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-xs text-indigo-700" data-testid="routing-tip">
              <strong>Tip:</strong> Recipients with the <em>same routing order</em> run in parallel. Different orders run sequentially.
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
                    <button onClick={() => addParallelRecipient(wave.order)}
                      className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 px-2 py-0.5 rounded border border-violet-200 hover:bg-violet-50"
                      data-testid={`add-parallel-btn-${wave.order}`}>
                      <Plus className="h-3 w-3" /> Parallel
                    </button>
                  </div>

                  <div className={`space-y-2 ${wave.members.length > 1 ? 'ml-1 pl-4 border-l-2 border-violet-200' : ''}`}>
                    {wave.members.map((r) => {
                      const idx = recipients.findIndex(rec => rec.id === r.id);
                      const color = getRecipientColor(r.id);
                      return (
                        <div key={r.id} className={`bg-white rounded-xl border p-4 ${wave.members.length > 1 ? 'border-violet-200' : 'border-gray-200'}`} data-testid={`recipient-form-${idx}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${color.bg} ${color.text}`}>{r.routing_order}</span>
                              <span className="text-sm font-medium text-gray-700">{r.name || `Recipient ${idx + 1}`}</span>
                            </div>
                            {recipients.length > 1 && (
                              <button onClick={() => removeRecipient(idx)} className="p-1 text-gray-400 hover:text-red-500" data-testid={`remove-recipient-${idx}`}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Name *</label>
                              <input value={r.name} onChange={(e) => updateRecipient(idx, 'name', e.target.value)} placeholder="Full name"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid={`recipient-name-${idx}`} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Email *</label>
                              <input value={r.email} onChange={(e) => updateRecipient(idx, 'email', e.target.value)} placeholder="email@example.com" type="email"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid={`recipient-email-${idx}`} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Role</label>
                              <select value={r.role_type} onChange={(e) => updateRecipient(idx, 'role_type', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" data-testid={`recipient-role-${idx}`}>
                                {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Routing Order</label>
                              <input type="number" min={1} value={r.routing_order} onChange={(e) => updateRecipient(idx, 'routing_order', parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid={`recipient-order-${idx}`} />
                            </div>
                            {emailTemplatesLoaded && emailTemplates.length > 0 && (
                              <div className="sm:col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">Email Template <span className="text-gray-400">(optional)</span></label>
                                <select value={r.email_template_id || ''} onChange={(e) => updateRecipient(idx, 'email_template_id', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" data-testid={`recipient-email-template-${idx}`}>
                                  <option value="">Default (based on role)</option>
                                  {emailTemplates.map(et => (
                                    <option key={et.id} value={et.id}>{et.name} — {et.template_type.replace(/_/g, ' ')}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {waveIdx < waveGroups.length - 1 && (
                    <div className="flex items-center justify-center my-3">
                      <div className="h-6 w-px bg-gray-300" /><ChevronDown className="h-4 w-4 text-gray-400 -ml-2 -mr-2" /><div className="h-6 w-px bg-gray-300" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Field Assignment */}
            {signerRecipients.length > 0 && documents.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="assign-components-section">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">Assign Fields to Recipients</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Map each field to a specific signer.</p>
                  </div>
                  {assignmentStats.totalFields > 0 && (
                    <Badge className={`text-xs ${assignmentStats.unassigned > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`} data-testid="assignment-stats">
                      {assignmentStats.assignedFields}/{assignmentStats.totalFields} assigned
                    </Badge>
                  )}
                </div>

                {loadingFields ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    <span className="ml-2 text-sm text-gray-500">Loading fields...</span>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {documents.map((doc) => {
                      const allFields = templateFields[doc.template_id] || [];
                      // Only show signer-dependent fields for assignment (not merge, checkbox, radio)
                      const ASSIGNABLE_TYPES = ['signature', 'initials', 'text', 'date'];
                      const fields = allFields.filter(f => ASSIGNABLE_TYPES.includes(f.type));
                      if (fields.length === 0) return (
                        <div key={doc.template_id} className="border border-dashed border-gray-200 rounded-lg p-4">
                          <p className="text-xs text-gray-400 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span><strong>{doc.document_name}</strong> &mdash; No fields configured</span>
                          </p>
                        </div>
                      );
                      return (
                        <div key={doc.template_id} className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-indigo-500" />
                              <span className="text-sm font-medium text-gray-700">{doc.document_name}</span>
                              <span className="text-[10px] text-gray-400 ml-auto">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {fields.map((field) => {
                              const assignedTo = fieldAssignments[field.id] || '';
                              const color = assignedTo ? getRecipientColor(assignedTo) : null;
                              return (
                                <div key={field.id} className={`flex items-center gap-3 px-4 py-3 ${assignedTo ? color?.bg + '/30' : ''}`}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      {color && <span className={`h-2 w-2 rounded-full ${color.dot}`} />}
                                      <span className="text-sm text-gray-800 font-medium truncate">{field.label || field.type || 'Unnamed'}</span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase font-mono">{field.type}</span>
                                    </div>
                                  </div>
                                  <div className="shrink-0 w-48">
                                    <select value={assignedTo} onChange={(e) => assignField(field.id, e.target.value)}
                                      className={`w-full px-2.5 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                        assignedTo ? `${color?.border} ${color?.bg} ${color?.text}` : 'border-gray-300 bg-white text-gray-600'
                                      }`} data-testid={`field-assign-${field.id}`}>
                                      <option value="">-- Unassigned --</option>
                                      {signerRecipients.map((r) => (
                                        <option key={r.id} value={r.id}>{r.name || `Recipient ${recipients.indexOf(r) + 1}`}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {assignmentStats.unassigned > 0 && assignmentStats.totalFields > 0 && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{assignmentStats.unassigned} unassigned field{assignmentStats.unassigned !== 1 ? 's' : ''}. Unassigned fields visible to all signers.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Delivery Mode */}
        {step === 0 && (
          <div className="space-y-6" data-testid="step-delivery">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Delivery Mode</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {DELIVERY_MODES.map(opt => (
                  <button key={opt.value} onClick={() => setDeliveryMode(opt.value)}
                    className={`flex flex-col items-start gap-1.5 p-3 rounded-lg text-left transition-colors ${
                      deliveryMode === opt.value ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-300' : 'text-gray-500 border border-gray-200 hover:bg-gray-50'
                    }`} data-testid={`delivery-${opt.value}`}>
                    <div className="flex items-center gap-2"><opt.icon className="h-4 w-4" /><span className="text-sm font-medium">{opt.label}</span></div>
                    <span className="text-[11px] opacity-75">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between" data-testid="otp-toggle-section">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                  <Shield className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">OTP Authentication</p>
                  <p className="text-[11px] text-gray-500">
                    {otpEnabled ? 'Recipients must verify via OTP before accessing documents' : 'Direct access without OTP'}
                  </p>
                </div>
              </div>
              <button onClick={() => setOtpEnabled(!otpEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${otpEnabled ? 'bg-amber-500' : 'bg-gray-200'}`}
                data-testid="otp-toggle">
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${otpEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {deliveryMode === 'public_link' && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700" data-testid="public-link-info">
                <strong>Public Link:</strong> A single signing link will be generated. Any user with the link can sign.
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Send */}
        {step === 2 && (
          <div className="space-y-6" data-testid="step-review">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Send Summary</h3>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <div><dt className="text-gray-500">Package</dt><dd className="font-medium">{pkg.name}</dd></div>
                <div><dt className="text-gray-500">Documents</dt><dd className="font-medium">{documents.length}</dd></div>
                <div><dt className="text-gray-500">Recipients</dt><dd className="font-medium">{recipients.length}</dd></div>
                <div><dt className="text-gray-500">Delivery</dt><dd className="font-medium capitalize">{DELIVERY_MODES.find(m => m.value === deliveryMode)?.label}</dd></div>
                <div><dt className="text-gray-500">Routing</dt><dd className="font-medium capitalize">{routingMode}</dd></div>
                <div><dt className="text-gray-500">OTP</dt><dd className="font-medium">{otpEnabled ? 'Enabled' : 'Disabled'}</dd></div>
              </dl>
            </div>

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
                        Wave {waveIdx + 1}{wave.members.length > 1 && ` \u2014 ${wave.members.length} parallel`}
                      </span>
                    </div>
                    <div className={`space-y-1 ml-1 pl-3 border-l-2 ${wave.members.length > 1 ? 'border-violet-200' : 'border-slate-200'}`}>
                      {wave.members.map((r) => {
                        const color = getRecipientColor(r.id);
                        return (
                          <div key={r.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${color.bg} ${color.text}`}>{r.routing_order}</span>
                              <span className="text-sm text-gray-800">{r.name}</span>
                              {r.email && <span className="text-xs text-gray-400">({r.email})</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-indigo-50 text-indigo-700 text-xs">{r.role_type}</Badge>
                              {r.email_template_id && (
                                <Badge className="bg-purple-50 text-purple-700 text-[10px]">
                                  {emailTemplates.find(et => et.id === r.email_template_id)?.name || 'Custom Template'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {waveIdx < waveGroups.length - 1 && (
                      <div className="flex justify-center my-2"><ChevronDown className="h-4 w-4 text-gray-300" /></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <button onClick={() => step > 0 ? goToStep(step - 1) : navigate(`/setup/docflow/packages/${packageId}`)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800" data-testid="prev-step-btn">
            <ArrowLeft className="h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < 2 ? (
            <button onClick={() => goToStep(step + 1)} disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="next-step-btn">
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={sending}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
              data-testid="send-package-btn">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending...' : 'Send Package'}
            </button>
          )}
        </div>
      </div>

      {/* Public Link Dialog */}
      {showPublicLinkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="public-link-dialog">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Package Sent!</h3>
                <p className="text-xs text-gray-500">Share this link with your signers</p>
              </div>
            </div>
            <div className="mb-5">
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={publicLink}
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700 font-mono truncate" data-testid="public-link-input" />
                <button onClick={() => { navigator.clipboard.writeText(publicLink); toast.success('Copied!'); }}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700" data-testid="copy-link-btn">
                  Copy
                </button>
              </div>
            </div>
            <button onClick={() => { setShowPublicLinkDialog(false); navigate(`/setup/docflow/packages/${packageId}`); }}
              className="w-full py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50" data-testid="close-dialog-btn">
              Go to Package Details
            </button>
          </div>
        </div>
      )}

      {showRecipientLinksDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="recipient-links-dialog">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Package Created!</h3>
                <p className="text-xs text-gray-500">Share each recipient's unique signing link — no emails were sent</p>
              </div>
            </div>
            <div className="space-y-3 mb-5 max-h-72 overflow-y-auto">
              {recipientLinks.map((rl, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-900">{rl.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{rl.role || 'SIGN'}</span>
                  </div>
                  {rl.email && <p className="text-xs text-gray-500 mb-2">{rl.email}</p>}
                  <div className="flex items-center gap-2">
                    <input type="text" readOnly value={rl.signing_link || rl.access_link || ''}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs bg-gray-50 text-gray-600 font-mono truncate"
                      data-testid={`recipient-link-${idx}`} />
                    <button
                      onClick={() => { navigator.clipboard.writeText(rl.signing_link || rl.access_link || ''); toast.success(`Copied link for ${rl.name}`); }}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700"
                      data-testid={`copy-recipient-link-${idx}`}>
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { setShowRecipientLinksDialog(false); navigate(`/setup/docflow/packages/${packageId}`); }}
              className="w-full py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50" data-testid="close-recipient-links-btn">
              Go to Package Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SendPackagePage;
