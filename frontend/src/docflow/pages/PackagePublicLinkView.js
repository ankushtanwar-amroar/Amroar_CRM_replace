import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Package, FileText, CheckCircle2, Loader2, AlertCircle,
  XCircle, ChevronRight, User, Mail, Download,
  Clock, ArrowRight, Menu
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import InteractiveDocumentViewer from '../components/InteractiveDocumentViewer';
import PackageDocSection from '../components/PackageDocSection';
import PackageDocSidebar from '../components/PackageDocSidebar';
import SignatureModal from '../components/SignatureModal';
import { emailError as validateEmail } from '../utils/emailValidator';
import SignatureReusePrompt from '../components/SignatureReusePrompt';
import ConsentScreen, { hasAcceptedConsent } from '../components/ConsentScreen';
import useSessionSignature from '../hooks/useSessionSignature';
import { computeHiddenFieldIds } from '../utils/conditionalLogic';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const PackagePublicLinkView = () => {
  const { packageId, token } = useParams();

  // Flow state: 'loading' | 'entry' | 'otp' | 'already_submitted' | 'signing' | 'submitting' | 'completed' | 'error'
  const [flowState, setFlowState] = useState('loading');
  const [pkg, setPkg] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // User entry
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  // Phase 81.28 — frontend-only email validation. Empty until user blurs the
  // field or attempts to submit, then carries the error message string.
  const [emailErr, setEmailErr] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [checking, setChecking] = useState(false);

  // OTP state
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Existing submission (when user already submitted)
  const [existingSubmission, setExistingSubmission] = useState(null);

  // Signing state
  const [templateFieldsMap, setTemplateFieldsMap] = useState({});
  const [docFieldValues, setDocFieldValues] = useState({});
  const [loadingFields, setLoadingFields] = useState(false);
  const [activeDocIndex, setActiveDocIndex] = useState(null);
  // Phase 81.60 — Mobile sidebar drawer
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentSignFieldId, setCurrentSignFieldId] = useState(null);
  const [currentSignDocId, setCurrentSignDocId] = useState(null);
  const [isInitialsField, setIsInitialsField] = useState(false);
  // Signature fontSize fix — track the active field's authored style + box
  // so the typed signature renders at the configured size.
  const [currentSignFieldStyle, setCurrentSignFieldStyle] = useState(null);
  const [currentSignFieldDims, setCurrentSignFieldDims] = useState({ width: null, height: null });
  const [submitting, setSubmitting] = useState(false);
  const [reusePrompt, setReusePrompt] = useState({ open: false, docId: null, fieldId: null, isInitials: false });

  // Completed state
  const [completedResult, setCompletedResult] = useState(null);

  // Phase 69: Consent gate state for the package link signing flow.
  // Hoisted to the top-level (alongside other useState/useEffect calls) so
  // it is always executed on every render regardless of which branch the
  // flow is currently in. Previously declared inline just before the
  // `flowState === 'signing'` early-return block, which triggered
  // "Rendered more hooks than during the previous render" when the user
  // progressed past OTP into the signing step.
  const [plConsentAccepted, setPlConsentAccepted] = useState(false);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Phase 81.16 — Auto-open Document #1 on first entry into the public-link
  // signing page, mirroring the email-package flow (Phase 81.15). Fires once
  // per session: the moment we transition into 'signing', set
  // `activeDocIndex = 0` if it's still null. Skips when no documents exist
  // or the user has already opened any document this session (ref guard).
  const plAutoOpenedRef = React.useRef(false);
  useEffect(() => {
    if (plAutoOpenedRef.current) return;
    if (flowState !== 'signing') return;
    const docs = pkg?.documents || [];
    if (docs.length === 0) return;
    if (activeDocIndex !== null) {
      plAutoOpenedRef.current = true;
      return;
    }
    plAutoOpenedRef.current = true;
    setActiveDocIndex(0);
  }, [flowState, pkg, activeDocIndex]);

  // Auto-advance is disabled: user navigates documents using the Next button.
  const [autoStartTokens] = useState({});

  // Phase 81.79 — When user switches to a different document via sidebar,
  // smoothly scroll the page so the new doc card is visible (its sticky
  // header lands just below the outer page header). Tracks previous index
  // via ref so we DON'T scroll on the very first auto-open.
  const prevDocIndexRef = React.useRef(null);
  useEffect(() => {
    if (activeDocIndex === null) return;
    if (prevDocIndexRef.current === null) {
      prevDocIndexRef.current = activeDocIndex;
      return; // initial mount — no scroll
    }
    if (prevDocIndexRef.current === activeDocIndex) return;
    prevDocIndexRef.current = activeDocIndex;
    // Wait for the new doc wrapper to render, then scroll its top into view.
    const t = setTimeout(() => {
      const wrap = document.querySelector(`[data-testid="package-doc-wrapper-${activeDocIndex}"]`);
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const headerOffset = window.innerWidth >= 640 ? 170 : 220;
      const targetY = window.scrollY + r.top - headerOffset;
      window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }, 80);
    return () => clearTimeout(t);
  }, [activeDocIndex]);

  // Phase 69: Initialize consent-accepted state from session storage whenever
  // the email/token combo changes. Kept at the top-level with the other hooks
  // so call order is stable.
  useEffect(() => {
    const key = userEmail ? `pkglink-${token}::${userEmail.toLowerCase()}` : null;
    if (key) setPlConsentAccepted(hasAcceptedConsent(key));
    else setPlConsentAccepted(false);
  }, [userEmail, token]);

  // Load package info on mount
  useEffect(() => {
    loadPackage();
  }, [token]);

  const loadPackage = async () => {
    try {
      setFlowState('loading');
      const res = await fetch(`${API_URL}/api/docflow/packages/public-link/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setPkg(data);
      setFlowState('entry');
    } catch (e) {
      setLoadError(e.message || 'Failed to load package');
      setFlowState('error');
    }
  };

  // Check if user already submitted, then proceed
  const handleProceed = async () => {
    // Phase 81.28 — frontend-only email validation guard.
    const err = validateEmail(userEmail, { required: true });
    if (!userName.trim() || err) {
      setEmailTouched(true);
      setEmailErr(err);
      if (!userName.trim() && !err) toast.error('Please enter your name');
      else if (err) toast.error(err);
      return;
    }
    setEmailErr('');

    try {
      setChecking(true);
      const res = await fetch(`${API_URL}/api/docflow/packages/public-link/${token}/check-submission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to check submission');
      }
      const data = await res.json();

      if (data.already_submitted) {
        setExistingSubmission(data.submission);
        setFlowState('already_submitted');
      } else if (pkg?.require_otp) {
        // OTP required — send OTP first
        const sent = await sendOtp();
        if (sent) {
          setFlowState('otp');
        }
        // If send failed, stay on entry so user can retry
      } else {
        // No OTP — go directly to signing
        await loadFieldPlacements();
        setFlowState('signing');
      }
    } catch (e) {
      toast.error(e.message || 'Error checking submission status');
    } finally {
      setChecking(false);
    }
  };

  const sendOtp = async () => {
    try {
      setOtpSending(true);
      setOtpError(null);
      const res = await fetch(`${API_URL}/api/docflow/packages/public-link/${token}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName.trim(), email: userEmail.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 429) {
          // Rate limited — extract remaining seconds if available
          const detail = err.detail || 'Please wait before requesting another code';
          const match = detail.match(/(\d+)\s*seconds?/);
          if (match) setResendCooldown(parseInt(match[1], 10));
          else setResendCooldown(60);
          toast.error(detail);
          // Still transition to OTP screen if we're on entry (a previous OTP may exist)
          return true;
        }
        throw new Error(err.detail || 'Failed to send verification code');
      }
      setOtpSent(true);
      setResendCooldown(60);
      toast.success('Verification code sent to your email');
      return true;
    } catch (e) {
      const msg = e.message || 'Failed to send verification code';
      setOtpError(msg);
      toast.error(msg);
      return false;
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode.trim()) {
      toast.error('Please enter the verification code');
      return;
    }
    try {
      setOtpVerifying(true);
      const res = await fetch(`${API_URL}/api/docflow/packages/public-link/${token}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail.trim().toLowerCase(), otp_code: otpCode.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Verification failed');
      }
      toast.success('Email verified successfully');
      await loadFieldPlacements();
      setFlowState('signing');
    } catch (e) {
      toast.error(e.message || 'Invalid verification code');
    } finally {
      setOtpVerifying(false);
    }
  };

  // Load field placements for all documents
  const loadFieldPlacements = async () => {
    setLoadingFields(true);
    const newMap = {};
    for (const doc of (pkg?.documents || [])) {
      const templateId = doc.template_id;
      if (!templateId || newMap[templateId]) continue;
      try {
        const res = await fetch(`${API_URL}/api/docflow/templates/${templateId}/field-placements-public`);
        if (res.ok) {
          const data = await res.json();
          newMap[templateId] = data.field_placements || [];
        }
      } catch (e) {
        console.error(`Failed to load fields for template ${templateId}:`, e);
        newMap[templateId] = [];
      }
    }
    setTemplateFieldsMap(newMap);
    setLoadingFields(false);
  };

  const getFieldsForDoc = useCallback((doc) => {
    const baseFields = (templateFieldsMap[doc.template_id] || []).filter(Boolean);
    return baseFields.map(f => {
      // Phase 81.49 / Phase 2 — Interlinked TARGET fields are auto-locked
      // to read-only ONLY when read_only_target is true (default). In
      // Two-Way mode we keep the field editable so the recipient can update
      // either side. Lock + Two-Way are mutually exclusive at author time;
      // if both flags are set on legacy data, Two-Way wins.
      if (
        f.linked_to?.enabled &&
        f.linked_to?.field_id &&
        f.linked_to?.read_only_target !== false &&
        f.linked_to?.direction !== 'two_way'
      ) {
        return { ...f, readOnly: true, field_hint: '🔗 Synced from linked field' };
      }
      return f;
    });
  }, [templateFieldsMap]);

  // Phase 2 — value_key_for helper. Radio fields store value at groupName
  // (not placement id), all other fields use the placement id directly.
  const valueKeyFor = useCallback((p) => {
    const t = (p?.type || p?.field_type || '').toLowerCase();
    if (t === 'radio') return p.groupName || p.group_name || p.id;
    return p.id;
  }, []);

  // Phase 81.49 / Phase 2 — Pre-fill linked target fields from any source
  // value that already exists locally. Same-recipient scope still applies;
  // for the public-link flow there's only one signer so it's effectively
  // always satisfied. Uses setState callback form to read current
  // docFieldValues without depending on it (which would loop the effect).
  useEffect(() => {
    if (!pkg?.documents?.length || !Object.keys(templateFieldsMap).length) return;
    setDocFieldValues(prev => {
      let changed = false;
      const next = { ...prev };
      for (const d of pkg.documents) {
        const placements = templateFieldsMap[d.template_id] || [];
        for (const p of placements) {
          const link = p.linked_to;
          if (!link?.enabled || !link.field_id) continue;
          const targetKey = valueKeyFor(p);
          const currentVal = next[d.document_id]?.[targetKey];
          if (currentVal !== undefined && currentVal !== '') continue;
          let sourceValue;
          for (const other of pkg.documents) {
            if (other.document_id === d.document_id) continue;
            const otherPlacements = templateFieldsMap[other.template_id] || [];
            const srcField = otherPlacements.find(op => op.id === link.field_id);
            if (!srcField) continue;
            const sourceKey = valueKeyFor(srcField);
            const otherVals = next[other.document_id] || {};
            if (otherVals[sourceKey] !== undefined && otherVals[sourceKey] !== '') {
              sourceValue = otherVals[sourceKey];
              break;
            }
          }
          if (sourceValue === undefined) continue;
          next[d.document_id] = { ...(next[d.document_id] || {}), [targetKey]: sourceValue };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pkg, templateFieldsMap, valueKeyFor]);

  // Phase 2 — Forward fanout for linked source field values.
  const fanoutLinkedFieldValue = useCallback((sourceDocId, key, newValue) => {
    if (!pkg?.documents) return {};
    const sourceDoc = pkg.documents.find(d => d.document_id === sourceDocId);
    if (!sourceDoc) return {};
    const sourcePlacements = templateFieldsMap?.[sourceDoc.template_id] || [];
    const matchingSources = sourcePlacements.filter(p => valueKeyFor(p) === key);
    if (matchingSources.length === 0) return {};
    const updates = {};
    for (const otherDoc of pkg.documents) {
      if (otherDoc.document_id === sourceDocId) continue;
      const placements = templateFieldsMap?.[otherDoc.template_id] || [];
      for (const p of placements) {
        const link = p.linked_to;
        if (!link?.enabled || !link.field_id) continue;
        const matchSource = matchingSources.find(s => s.id === link.field_id);
        if (!matchSource) continue;
        const targetKey = valueKeyFor(p);
        updates[otherDoc.document_id] = { ...(updates[otherDoc.document_id] || {}), [targetKey]: newValue };
      }
    }
    return updates;
  }, [pkg, templateFieldsMap, valueKeyFor]);

  // Phase 2 — Reverse fanout for two-way targets.
  const reverseFanoutLinkedFieldValue = useCallback((targetDocId, key, newValue) => {
    if (!pkg?.documents) return {};
    const targetDoc = pkg.documents.find(d => d.document_id === targetDocId);
    if (!targetDoc) return {};
    const targetPlacements = templateFieldsMap?.[targetDoc.template_id] || [];
    const triggers = targetPlacements.filter(p => {
      if (valueKeyFor(p) !== key) return false;
      const lk = p.linked_to;
      return Boolean(lk?.enabled && lk?.field_id && lk?.direction === 'two_way' && lk?.read_only_target !== true);
    });
    if (triggers.length === 0) return {};
    const updates = {};
    for (const trig of triggers) {
      const lk = trig.linked_to;
      for (const otherDoc of pkg.documents) {
        if (otherDoc.document_id === targetDocId) continue;
        const placements = templateFieldsMap?.[otherDoc.template_id] || [];
        const srcField = placements.find(op => op.id === lk.field_id);
        if (!srcField) continue;
        const sourceKey = valueKeyFor(srcField);
        updates[otherDoc.document_id] = { ...(updates[otherDoc.document_id] || {}), [sourceKey]: newValue };
        // Cascade: forward fanout from this source to other targets.
        const forward = fanoutLinkedFieldValue(otherDoc.document_id, sourceKey, newValue);
        for (const [docId, vals] of Object.entries(forward)) {
          if (docId === targetDocId) continue;
          updates[docId] = { ...(updates[docId] || {}), ...vals };
        }
        break;
      }
    }
    return updates;
  }, [pkg, templateFieldsMap, valueKeyFor, fanoutLinkedFieldValue]);

  const handleDocFieldsChange = useCallback((docId, values) => {
    setDocFieldValues(prev => {
      const next = { ...prev };
      next[docId] = { ...(next[docId] || {}), ...values };

      // BFS over the full interlink graph so chains of any depth propagate.
      // Without BFS, only a single hop fires (Doc1→Doc2 only; Doc2→Doc3 is
      // missed). visited prevents infinite loops in circular / two-way graphs.
      const queue = Object.entries(values).map(([key, value]) => ({ srcDocId: docId, key, value }));
      const visited = new Set(queue.map(({ srcDocId, key }) => `${srcDocId}::${key}`));

      while (queue.length > 0) {
        const { srcDocId, key, value } = queue.shift();

        // Forward: any doc whose placement has linked_to pointing at srcDocId's field.
        const fwd = fanoutLinkedFieldValue(srcDocId, key, value);
        for (const [tgtDocId, tgtVals] of Object.entries(fwd)) {
          next[tgtDocId] = { ...(next[tgtDocId] || {}), ...tgtVals };
          for (const [k, v] of Object.entries(tgtVals)) {
            const vk = `${tgtDocId}::${k}`;
            if (!visited.has(vk)) { visited.add(vk); queue.push({ srcDocId: tgtDocId, key: k, value: v }); }
          }
        }

        // Reverse: srcDocId's field may itself be a two-way target; write back to source.
        const rev = reverseFanoutLinkedFieldValue(srcDocId, key, value);
        for (const [tgtDocId, tgtVals] of Object.entries(rev)) {
          next[tgtDocId] = { ...(next[tgtDocId] || {}), ...tgtVals };
          for (const [k, v] of Object.entries(tgtVals)) {
            const vk = `${tgtDocId}::${k}`;
            if (!visited.has(vk)) { visited.add(vk); queue.push({ srcDocId: tgtDocId, key: k, value: v }); }
          }
        }
      }

      return next;
    });
  }, [fanoutLinkedFieldValue, reverseFanoutLinkedFieldValue]);

  const openSignatureModalDirect = useCallback((docId, fieldId, isInitials = false, field = null) => {
    setCurrentSignDocId(docId);
    setCurrentSignFieldId(fieldId);
    setIsInitialsField(isInitials);
    setCurrentSignFieldStyle(field?.style || null);
    setCurrentSignFieldDims({
      width: Number(field?.width) || null,
      height: Number(field?.height) || null,
    });
    setSignatureModalOpen(true);
  }, []);

  // Session signature cache — keyed per signer.
  const _sigSessionKey = userEmail ? `${token}::${userEmail.toLowerCase()}` : null;
  const { getSignature: getSessionSig, setSignature: setSessionSig, clearAll: clearSessionSig } = useSessionSignature(_sigSessionKey);

  const openSignatureModal = useCallback((docId, fieldId, isInitials = false, field = null) => {
    const existing = (docFieldValues[docId] || {})[fieldId];
    if (existing) {
      openSignatureModalDirect(docId, fieldId, isInitials, field);
      return;
    }
    const cached = getSessionSig(isInitials ? 'initials' : 'signature');
    if (cached) {
      setReusePrompt({
        open: true,
        docId,
        fieldId,
        isInitials,
        fieldStyle: field?.style,
        fieldWidth: Number(field?.width) || null,
        fieldHeight: Number(field?.height) || null,
      });
      return;
    }
    openSignatureModalDirect(docId, fieldId, isInitials, field);
  }, [docFieldValues, getSessionSig, openSignatureModalDirect]);

  const handleReuseAccept = useCallback(() => {
    const { docId, fieldId, isInitials } = reusePrompt;
    const cached = getSessionSig(isInitials ? 'initials' : 'signature');
    if (cached && docId && fieldId) {
      setDocFieldValues(prev => ({
        ...prev,
        [docId]: { ...(prev[docId] || {}), [fieldId]: cached },
      }));
    }
    setReusePrompt({ open: false, docId: null, fieldId: null, isInitials: false });
  }, [reusePrompt, getSessionSig]);

  const handleReuseDrawNew = useCallback(() => {
    const { docId, fieldId, isInitials, fieldStyle, fieldWidth, fieldHeight } = reusePrompt;
    setReusePrompt({ open: false, docId: null, fieldId: null, isInitials: false });
    openSignatureModalDirect(docId, fieldId, isInitials, {
      style: fieldStyle,
      width: fieldWidth,
      height: fieldHeight,
    });
  }, [reusePrompt, openSignatureModalDirect]);

  const handleSignatureSave = useCallback((fieldId, sigData) => {
    if (!currentSignDocId) return;
    // Cache for reuse across subsequent fields in this session
    setSessionSig(isInitialsField ? 'initials' : 'signature', sigData);
    setDocFieldValues(prev => ({
      ...prev,
      [currentSignDocId]: { ...(prev[currentSignDocId] || {}), [fieldId]: sigData },
    }));
  }, [currentSignDocId, isInitialsField, setSessionSig]);

  // Phase 81.59 — Hidden fields per doc (declared before consumer
  // useMemo to avoid TDZ ReferenceError).
  const hiddenFieldsByDoc = useMemo(() => {
    const out = {};
    const documents = pkg?.documents || [];
    for (const doc of documents) {
      const fields = (templateFieldsMap[doc.template_id] || []).filter(Boolean);
      const values = docFieldValues[doc.document_id] || {};
      out[doc.document_id] = computeHiddenFieldIds(fields, values);
    }
    return out;
  }, [pkg, templateFieldsMap, docFieldValues]);

  // Phase 81.53 — Accurate completion check across ALL field types so the
  // submit button enables correctly after a checkbox/radio/text/etc. are all
  // filled. Prior implementation only enforced signature/initials/date which
  // produced false-negatives ("8/14 fields") even when the doc was complete.
  const allRequiredFieldsComplete = useMemo(() => {
    const documents = pkg?.documents || [];
    const RADIO = 'radio';
    const CHECKBOX = 'checkbox';
    const NON_INTERACTIVE = new Set(['label', 'merge']);

    const isRequired = (f, all) => {
      if (f.required === false || f.required === 'false') return false;
      const t = (f.type || f.field_type || '').toLowerCase();
      if (t === RADIO) {
        const group = f.groupName || f.group_name;
        if (!group) return Boolean(f.required);
        // Group is required if ANY sibling is required.
        return (all || []).some(o =>
          (o.type || o.field_type) === RADIO &&
          (o.groupName || o.group_name) === group &&
          (o.required === true || o.required === 'true')
        );
      }
      if (f.required === true || f.required === 'true') return true;
      // Defaults: signature/initials are required by spec.
      return ['signature', 'initials'].includes(t);
    };

    const isFilled = (f, vals) => {
      const t = (f.type || f.field_type || '').toLowerCase();
      if (t === RADIO) {
        const group = f.groupName || f.group_name || f.id;
        const v = vals[group];
        return v !== undefined && v !== null && String(v) !== '';
      }
      if (t === CHECKBOX) {
        const v = vals[f.id];
        return v === true || v === 'true';
      }
      if (t === 'date') {
        const mode = f.dateMode || 'auto';
        if (mode === 'auto') return true;  // auto-fills today's date
        const v = vals[f.id];
        return v !== undefined && v !== null && String(v).trim() !== '';
      }
      const v = vals[f.id];
      return v !== undefined && v !== null && String(v).trim() !== '';
    };

    for (const doc of documents) {
      const fields = (templateFieldsMap[doc.template_id] || []).filter(Boolean);
      const docValues = docFieldValues[doc.document_id] || {};
      // Phase 81.57 — Skip conditionally-hidden required fields.
      const dynamicHidden = hiddenFieldsByDoc[doc.document_id] || new Set();
      for (const field of fields) {
        const t = (field.type || field.field_type || '').toLowerCase();
        if (NON_INTERACTIVE.has(t)) continue;
        if (field.field_hidden || field.field_disabled) continue;
        if (field.readOnly) continue;  // read-only / linked-locked targets are auto-filled
        if (dynamicHidden.has(field.id)) continue;
        if (!isRequired(field, fields)) continue;
        if (!isFilled(field, docValues)) return false;
      }
    }
    return true;
  }, [pkg, templateFieldsMap, docFieldValues, hiddenFieldsByDoc]);

  const perDocComplete = useMemo(() => {
    const out = {};
    for (const doc of (pkg?.documents || [])) {
      const fields = getFieldsForDoc(doc);
      const values = docFieldValues[doc.document_id] || {};
      const dynamicHidden = hiddenFieldsByDoc[doc.document_id] || new Set();
      const seenGroups = new Set();
      const slots = [];
      for (const f of fields) {
        const t = (f.type || f.field_type || '').toLowerCase();
        if (['label', 'merge'].includes(t)) continue;
        if (f.field_hidden || f.field_disabled || f.readOnly) continue;
        if (f.__isAssigned === false) continue;
        if (dynamicHidden.has(f.id)) continue;
        if (t === 'radio') {
          const g = f.groupName || f.group_name;
          if (g) { if (seenGroups.has(g)) continue; seenGroups.add(g); }
        }
        slots.push(f);
      }
      const isFilled = (f) => {
        const t = (f.type || f.field_type || '').toLowerCase();
        if (t === 'radio') { const g = f.groupName || f.group_name || f.id; const v = values[g]; return v !== undefined && v !== null && String(v) !== ''; }
        if (t === 'checkbox') return values[f.id] === true || values[f.id] === 'true';
        if (t === 'date') { if ((f.dateMode || 'auto') === 'auto') return true; const v = values[f.id]; return v !== undefined && v !== null && String(v).trim() !== ''; }
        const v = values[f.id]; return v !== undefined && v !== null && String(v).trim() !== '';
      };
      out[doc.document_id] = slots.length > 0 && slots.every(isFilled);
    }
    return out;
  }, [pkg, docFieldValues, hiddenFieldsByDoc, getFieldsForDoc]);

  // Auto-advance to next pending doc when the active doc becomes complete is disabled.
  // Users must move to the next document explicitly using the Next button.

  const hasAnyFields = useMemo(() => {
    return Object.values(templateFieldsMap).some(fields => fields.length > 0);
  }, [templateFieldsMap]);

  // Submit signing
  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      const documentsFieldData = {};
      for (const doc of (pkg?.documents || [])) {
        const vals = docFieldValues[doc.document_id] || {};
        if (Object.keys(vals).length > 0) {
          documentsFieldData[doc.document_id] = vals;
        }
      }

      const res = await fetch(`${API_URL}/api/docflow/packages/public-link/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName.trim(),
          email: userEmail.trim().toLowerCase(),
          documents_field_data: documentsFieldData,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to submit');
      }

      const data = await res.json();
      setCompletedResult(data);
      setFlowState('completed');
      toast.success('Submitted successfully!');
      // Clear cached signatures on session completion
      clearSessionSig();
    } catch (e) {
      toast.error(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const documents = pkg?.documents || [];

  // ── Loading ──
  if (flowState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="public-link-loading">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-gray-500">Loading package...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (flowState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="public-link-error">
        <div className="text-center max-w-md px-6">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-red-50 mb-4">
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Unable to Load</h2>
          <p className="text-sm text-gray-500">{loadError}</p>
        </div>
      </div>
    );
  }

  // ── Entry: Name & Email form ──
  if (flowState === 'entry') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="public-link-entry">
        <div className="w-full max-w-md mx-4">
          <div className="text-center mb-6">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-indigo-100 mb-3">
              <Package className="h-6 w-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800" data-testid="public-link-title">{pkg?.package_name || 'Document Package'}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {documents.length} document{documents.length !== 1 ? 's' : ''} to review and sign
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Enter your details to get started</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    data-testid="public-link-name-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${emailErr && emailTouched ? 'text-rose-400' : 'text-gray-400'}`} />
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => {
                      const next = e.target.value;
                      setUserEmail(next);
                      // Phase 81.28 — clear error live as the user fixes it.
                      if (emailTouched) setEmailErr(validateEmail(next, { required: true }));
                    }}
                    onBlur={() => {
                      setEmailTouched(true);
                      setEmailErr(validateEmail(userEmail, { required: true }));
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    inputMode="email"
                    className={`w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${emailErr && emailTouched ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/40' : 'border-gray-300 focus:ring-indigo-500'}`}
                    data-testid="public-link-email-input"
                    aria-invalid={!!(emailErr && emailTouched)}
                    onKeyDown={(e) => e.key === 'Enter' && handleProceed()}
                  />
                </div>
                {emailErr && emailTouched && (
                  <p className="text-[11px] text-rose-600 mt-1" data-testid="public-link-email-error">{emailErr}</p>
                )}
              </div>
              <button
                onClick={handleProceed}
                disabled={checking || !userName.trim() || !userEmail.trim() || !!validateEmail(userEmail, { required: true })}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="public-link-proceed-btn"
              >
                {checking ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking...</> : <><ArrowRight className="h-4 w-4" /> Continue to Documents</>}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-4 text-center">
              Your information will be recorded with your submission for verification purposes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── OTP Verification ──
  if (flowState === 'otp') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="public-link-otp">
        <div className="w-full max-w-md mx-4">
          <div className="text-center mb-6">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-amber-100 mb-3">
              <Mail className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Verify Your Email</h2>
            <p className="text-sm text-gray-500 mt-1">
              We've sent a verification code to <span className="font-medium text-gray-700">{userEmail}</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="space-y-4">
              {otpError && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2" data-testid="public-link-otp-error">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{otpError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Verification Code</label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
                  data-testid="public-link-otp-input"
                  onKeyDown={(e) => e.key === 'Enter' && otpCode.length === 6 && verifyOtp()}
                />
              </div>
              <button
                onClick={verifyOtp}
                disabled={otpVerifying || otpCode.length < 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="public-link-verify-otp-btn"
              >
                {otpVerifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : 'Verify & Continue'}
              </button>
              <div className="text-center">
                {resendCooldown > 0 ? (
                  <p className="text-xs text-gray-400" data-testid="public-link-resend-cooldown">
                    <Clock className="inline h-3 w-3 mr-1" />
                    Resend available in {resendCooldown}s
                  </p>
                ) : (
                  <button
                    onClick={sendOtp}
                    disabled={otpSending}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                    data-testid="public-link-resend-otp-btn"
                  >
                    {otpSending ? 'Sending...' : "Didn't receive it? Resend code"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Already Submitted ──
  if (flowState === 'already_submitted' && existingSubmission) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="public-link-already-submitted">
        <div className="w-full max-w-lg mx-4">
          <div className="text-center mb-6">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-emerald-50 mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Already Submitted</h2>
            <p className="text-sm text-gray-500 mt-1">
              You have already submitted your response for "{pkg?.package_name}".
            </p>
            {existingSubmission.submitted_at && (
              <p className="text-xs text-gray-400 mt-1">
                Submitted on {new Date(existingSubmission.submitted_at).toLocaleString()}
              </p>
            )}
          </div>
          {existingSubmission.signed_documents?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Your Signed Documents</h3>
              <div className="space-y-2">
                {existingSubmission.signed_documents.map((sd, i) => (
                  <div key={sd.document_id || i} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm text-gray-700">{sd.document_name || `Document ${i + 1}`}</span>
                    </div>
                    {sd.signed_file_url && (
                      <a
                        href={sd.signed_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800"
                        data-testid={`download-signed-${i}`}
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Completed state (just submitted) ──
  if (flowState === 'completed' && completedResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="public-link-completed">
        <div className="w-full max-w-lg mx-4">
          <div className="text-center mb-6">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-emerald-50 mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Submission Complete</h2>
            <p className="text-sm text-gray-500 mt-1">
              Thank you, {userName}! Your documents have been signed and submitted.
            </p>
          </div>
          {completedResult.signed_documents?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Download Your Signed Documents</h3>
              <div className="space-y-2">
                {completedResult.signed_documents.map((sd, i) => (
                  <div key={sd.document_id || i} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm text-gray-700">{sd.document_name || `Document ${i + 1}`}</span>
                    </div>
                    {sd.signed_file_url && (
                      <a
                        href={sd.signed_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800"
                        data-testid={`completed-download-${i}`}
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Signing Flow ──
  // Consent gate for the package link signing flow (state + effect are
  // declared at the top of the component — see Phase 69 comment).
  const _plConsentKey = userEmail ? `pkglink-${token}::${userEmail.toLowerCase()}` : null;

  if (flowState === 'signing') {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="public-link-signing">
        <ConsentScreen
          open={!!_plConsentKey && !plConsentAccepted}
          sessionKey={_plConsentKey}
          documentName={pkg?.package_name}
          recipientName={userName}
          recipientEmail={userEmail}
          token={token}
          packageId={packageId}
          companyName={pkg?.tenant_name}
          onContinue={() => setPlConsentAccepted(true)}
        />
        {/* Header */}
        <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-5 shadow-sm">
          <div className="max-w-[1600px] mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 shrink-0">
                  <Package className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 break-words" data-testid="signing-package-name">{pkg?.package_name || 'Document Package'}</h1>
                  <p className="text-xs text-gray-500">
                    {documents.length} document{documents.length !== 1 ? 's' : ''} to sign
                  </p>
                </div>
              </div>
              {/* Phase 81.16 — header "Finish" button mirrors the email-package
                  signing UI. Same submit handler, same disabled rule, same
                  required-field gating as the bottom button. */}
              <button
                onClick={handleSubmit}
                disabled={submitting || (hasAnyFields && !allRequiredFieldsComplete)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0 self-start ${
                  !submitting && (!hasAnyFields || allRequiredFieldsComplete)
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
                data-testid="public-link-finish-btn-header"
                title={(!hasAnyFields || allRequiredFieldsComplete) ? 'Submit your signed package' : 'Complete all required fields to enable Finish'}
              >
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : <><FileText className="h-4 w-4" /> Finish</>}
              </button>
            </div>
            <div className="mt-3 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800" data-testid="signing-user-name">{userName}</p>
                <p className="text-xs text-gray-500">{userEmail}</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                <FileText className="h-3 w-3" /> Signer
              </span>
            </div>
          </div>
        </div>

        {/* Documents */}
        {/* Phase 81.53 — Match PackagePublicView's container width so the
            DocuSign-style "Fill In" gutter badge has enough room (it's
            absolutely positioned at translateX(-100%) outside the page's
            left edge). The 3xl cap clipped the badge off-screen. */}
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-6">
          {loadingFields && (
            <div className="flex items-center justify-center py-6 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              <span className="ml-2 text-sm text-gray-500">Loading document fields...</span>
            </div>
          )}

          {/* {hasAnyFields && !loadingFields && (
            <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 px-4 py-3 rounded-xl mb-4 border border-indigo-100" data-testid="signing-instruction">
              <FileText className="h-4 w-4 shrink-0" />
              <span>Open each document below to fill in and sign the required fields. All signature and required fields must be completed before you can submit.</span>
            </div>
          )} */}

          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between">
            <span>Documents</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-100"
              data-testid="mobile-sidebar-toggle"
            >
              <Menu className="h-3.5 w-3.5" />
              {documents.length} {documents.length === 1 ? 'doc' : 'docs'}
            </button>
          </h3>

          {/* Phase 81.60 — Sidebar + single-active-doc layout. */}
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 mb-6">
            <div className="hidden lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-7rem)]">
                <PackageDocSidebar
                  documents={documents}
                  activeDocIndex={activeDocIndex}
                  onSelect={(idx) => setActiveDocIndex(idx)}
                  getDocStats={(doc) => {
                    const fields = getFieldsForDoc(doc);
                    const values = docFieldValues[doc.document_id] || {};
                    const dynamicHidden = hiddenFieldsByDoc[doc.document_id] || new Set();
                    let total = 0, filled = 0;
                    const seenGroups = new Set();
                    for (const f of fields) {
                      const t = (f.type || f.field_type || '').toLowerCase();
                      if (['label', 'merge'].includes(t)) continue;
                      if (f.field_hidden || f.field_disabled || f.readOnly) continue;
                      if (dynamicHidden.has(f.id)) continue;
                      if (t === 'radio') {
                        const g = f.groupName || f.group_name;
                        if (g) { if (seenGroups.has(g)) continue; seenGroups.add(g); }
                      }
                      total += 1;
                      const hasVal = (() => {
                        if (t === 'radio') {
                          const g = f.groupName || f.group_name || f.id;
                          return values[g] !== undefined && String(values[g] || '') !== '';
                        }
                        if (t === 'checkbox') return values[f.id] === true || values[f.id] === 'true';
                        if (t === 'date' && (f.dateMode || 'auto') === 'auto') return true;
                        const v = values[f.id];
                        return v !== undefined && v !== null && String(v).trim() !== '';
                      })();
                      if (hasVal) filled += 1;
                    }
                    const isComplete = total > 0 && filled === total;
                    return {
                      filled,
                      total,
                      isComplete,
                      statusLabel: isComplete ? 'Ready' : filled > 0 ? 'In Progress' : 'Pending',
                      statusTone: isComplete ? 'complete' : filled > 0 ? 'progress' : 'pending',
                    };
                  }}
                />
              </div>
            </div>

            {sidebarOpen && (
              <div className="lg:hidden fixed inset-0 z-50 flex" data-testid="mobile-sidebar-drawer">
                <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
                <div className="relative w-72 max-w-[80vw] bg-white shadow-xl z-10 flex flex-col">
                  <PackageDocSidebar
                    documents={documents}
                    activeDocIndex={activeDocIndex}
                    onSelect={(idx) => { setActiveDocIndex(idx); setSidebarOpen(false); }}
                    onClose={() => setSidebarOpen(false)}
                    getDocStats={(doc) => {
                      const fields = getFieldsForDoc(doc);
                      const values = docFieldValues[doc.document_id] || {};
                      const dynamicHidden = hiddenFieldsByDoc[doc.document_id] || new Set();
                      let total = 0, filled = 0;
                      const seenGroups = new Set();
                      for (const f of fields) {
                        const t = (f.type || f.field_type || '').toLowerCase();
                        if (['label', 'merge'].includes(t)) continue;
                        if (f.field_hidden || f.field_disabled || f.readOnly) continue;
                        if (dynamicHidden.has(f.id)) continue;
                        if (t === 'radio') {
                          const g = f.groupName || f.group_name;
                          if (g) { if (seenGroups.has(g)) continue; seenGroups.add(g); }
                        }
                        total += 1;
                      }
                      return { filled, total, isComplete: false, statusLabel: 'Pending', statusTone: 'pending' };
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3 min-w-0">
              {documents.map((doc, i) => {
                const fields = getFieldsForDoc(doc);
                const docValues = docFieldValues[doc.document_id] || {};
                const isActive = activeDocIndex === i;
                return (
                  <div
                    key={doc.document_id || i}
                    style={{ display: isActive ? 'block' : 'none' }}
                    data-testid={`package-doc-wrapper-${i}`}
                  >
                    <PackageDocSection
                      doc={{ ...doc, order: doc.order || i + 1 }}
                      index={i}
                      fields={fields}
                      fieldValues={docValues}
                      recipientIds={[]}
                      assignedFieldIds={fields.map(f => f.id)}
                      isActive={isActive}
                      isSigner={true}
                      isApprover={false}
                      allSigningComplete={true}
                      apiUrl={API_URL}
                      onToggle={() => { /* Phase 81.60: collapse disabled */ }}
                      onFieldsChange={(values) => handleDocFieldsChange(doc.document_id, values)}
                      showSignatureModal={(fieldId, isInit, fieldObj) => openSignatureModal(doc.document_id, fieldId, isInit, fieldObj)}
                      hasSignedVersion={false}
                      autoStartToken={autoStartTokens[doc.document_id] || 0}
                      signatureModalOpen={signatureModalOpen || reusePrompt.open}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Button */}
        
        </div>

        {/* Signature Modal */}
        <SignatureModal
          isOpen={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          onSave={handleSignatureSave}
          fieldId={currentSignFieldId}
          isInitials={isInitialsField}
          signerName={userName || ''}
          fieldStyle={currentSignFieldStyle}
          fieldWidth={currentSignFieldDims.width}
          fieldHeight={currentSignFieldDims.height}
        />

        <SignatureReusePrompt
          open={reusePrompt.open}
          dataUrl={getSessionSig(reusePrompt.isInitials ? 'initials' : 'signature')}
          type={reusePrompt.isInitials ? 'initials' : 'signature'}
          onClose={() => setReusePrompt({ open: false, docId: null, fieldId: null, isInitials: false })}
          onReuse={handleReuseAccept}
          onDrawNew={handleReuseDrawNew}
        />
      </div>
    );
  }

  return null;
};

export default PackagePublicLinkView;
