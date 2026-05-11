import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Package, FileText, CheckCircle2, Eye, Loader2, AlertCircle,
  XCircle, ChevronRight, CheckSquare, Square,
  ThumbsUp, ThumbsDown, ShieldCheck, Mail, Lock, Clock,
  Ban, AlertOctagon, Timer, ChevronDown, Download, Menu
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PackageDocSection from '../components/PackageDocSection';
import PackageDocSidebar from '../components/PackageDocSidebar';
import SignatureModal from '../components/SignatureModal';
import SignatureReusePrompt from '../components/SignatureReusePrompt';
import ConsentScreen, { hasAcceptedConsent } from '../components/ConsentScreen';
import ConfirmSubmitDialog from '../components/ConfirmSubmitDialog';
import SmsDisclaimerModal from '../components/SmsDisclaimerModal';
import SmsDeclineScreen from '../components/SmsDeclineScreen';
import { buildSmsAckKey, hasAcceptedSms, persistSmsAck } from '../utils/smsAck';
import useSessionSignature from '../hooks/useSessionSignature';
import { computeHiddenFieldIds } from '../utils/conditionalLogic';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ROLE_META = {
  SIGN: { label: 'Signer', icon: FileText, color: 'bg-indigo-100 text-indigo-700' },
  VIEW_ONLY: { label: 'Reviewer', icon: Eye, color: 'bg-blue-100 text-blue-700' },
  REVIEWER: { label: 'Reviewer', icon: Eye, color: 'bg-blue-100 text-blue-700' },
  APPROVE_REJECT: { label: 'Approver', icon: ShieldCheck, color: 'bg-amber-100 text-amber-700' },
};

const SESSION_KEY_PREFIX = 'docflow_session_';

const PackagePublicView = () => {
  const { packageId, token } = useParams();
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedAction, setCompletedAction] = useState(null);
  const [activeDocIndex, setActiveDocIndex] = useState(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voided, setVoided] = useState(false);

  // Session / OTP state
  const [sessionRequired, setSessionRequired] = useState(false);
  const [sessionToken, setSessionToken] = useState(null);
  const [otpStep, setOtpStep] = useState('form');
  const [otpName, setOtpName] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [sessionExpiry, setSessionExpiry] = useState(null);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState(null);
  const [remainingTime, setRemainingTime] = useState(null);
  const sessionTimerRef = useRef(null);

  // ═══ Signer field state ═══
  const [templateFieldsMap, setTemplateFieldsMap] = useState({}); // { templateId: [fields] }
  const [docFieldValues, setDocFieldValues] = useState({}); // { docId: { fieldId: value } }
  // Phase 81.60 — Mobile sidebar drawer visibility
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentSignFieldId, setCurrentSignFieldId] = useState(null);
  const [currentSignFieldStyle, setCurrentSignFieldStyle] = useState(null);
  // Signature fontSize fix — track the field's pixel box so SignatureModal
  // can render the typed signature image at exactly that size, preventing
  // aspect-fit shrinkage when the PDF is generated.
  const [currentSignFieldDims, setCurrentSignFieldDims] = useState({ width: null, height: null });
  const [currentSignDocId, setCurrentSignDocId] = useState(null);
  const [isInitialsField, setIsInitialsField] = useState(false);
  const [isPackageVoided, setIsPackageVoided] = useState(false);
  const [packageVoidedMsg, setPackageVoidedMsg] = useState('');
  // Reuse prompt state (shown when a cached signature exists for this session)
  const [reusePrompt, setReusePrompt] = useState({ open: false, docId: null, fieldId: null, isInitials: false });
  const pollingRef = useRef(null);

  // Confirm-submit dialog state (replaces the legacy "I have reviewed…" checkbox).
  // `action` encodes the pending action so we know whether the Confirm button
  // should sign / approve / mark reviewed.
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null });

  // Phase 81 — SMS disclaimer acknowledgment (not OTP verification).
  const [smsRequired, setSmsRequired] = useState(false);
  // smsMode: whether actual SMS sending is enabled (independent of popup).
  const [smsModeEnabled, setSmsModeEnabled] = useState(false);
  const [smsAcknowledged, setSmsAcknowledged] = useState(false);
  // Phase 81.83 — Decline state shows a clean exit screen instead of the
  // signing UI. Decline is NOT persisted — re-opening the link asks again.
  const [smsDeclined, setSmsDeclined] = useState(false);
  const [smsPhoneMasked, setSmsPhoneMasked] = useState('');

  // Consent screen acceptance — declared at the top of the component (before any
  // early returns) to satisfy the Rules of Hooks. The key that drives the effect
  // below is derived later from the loaded package; until `pkg` arrives the key
  // is null and the effect is a no-op.
  const [pkgConsentAccepted, setPkgConsentAccepted] = useState(false);
  const _pkgConsentKeyForEffect = (pkg?.active_recipient?.email || pkg?.active_recipient?.id)
    ? `pkg-${token}::${(pkg.active_recipient.email || pkg.active_recipient.id).toLowerCase()}`
    : null;
  useEffect(() => {
    if (_pkgConsentKeyForEffect) {
      setPkgConsentAccepted(hasAcceptedConsent(_pkgConsentKeyForEffect));
    }
  }, [_pkgConsentKeyForEffect]);

  // Phase 81.15 — Auto-open Document #1 on first entry into the package
  // signing page. Fires once per session: the moment we know the recipient
  // is an actionable signer with at least one document, set
  // `activeDocIndex = 0` if it's still null. The ref guarantees we don't
  // re-trigger if the user later collapses every doc (returns to null).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!pkg) return;
    const ar = pkg.active_recipient || {};
    const role = String(ar.role_type || ar.role || 'SIGN').toUpperCase();
    const isSignerRole = role === 'SIGN' || role === 'SIGNER';
    const isCompleted = ar.status === 'completed' || completed;
    const docs = pkg.documents || [];
    if (!isSignerRole) return;          // not a signer → respect existing UX
    if (isCompleted) return;            // already done → no auto-open
    if (docs.length === 0) return;      // nothing to open
    if (activeDocIndex !== null) {      // user already opened something
      autoOpenedRef.current = true;
      return;
    }
    autoOpenedRef.current = true;
    setActiveDocIndex(0);
  }, [pkg, completed, activeDocIndex]);

  // Auto-advance is disabled: user navigates documents using the Next button.
  const [autoStartTokens] = useState({});

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${token}`);
    if (stored) setSessionToken(stored);
  }, [token]);

  useEffect(() => { loadPackage(); }, [token, sessionToken]);

  useEffect(() => {
    if (pkg?.documents && activeDocIndex !== null) {
      const doc = pkg.documents[activeDocIndex];
      if (doc?.document_id && !docFieldValues[doc.document_id]) {
        loadDocData(doc.document_id);
      }
    }
  }, [activeDocIndex, pkg, docFieldValues]);

  // Real-time status polling — detect void/delete
  useEffect(() => {
    if (!token || isPackageVoided) return;
    const checkStatus = async () => {
      try {
        const resp = await fetch(`${API_URL}/api/docflow/packages/public/${token}/status`);
        if (!resp.ok) {
          if (resp.status === 404) { setIsPackageVoided(true); setPackageVoidedMsg('This package has been deleted and is no longer available.'); }
          return;
        }
        const data = await resp.json();
        if (data.status === 'voided' || data.status === 'not_found') {
          setIsPackageVoided(true);
          setPackageVoidedMsg(data.void_reason || 'This package has been voided and is no longer available.');
        }
      } catch { /* network error, will retry */ }
    };
    pollingRef.current = setInterval(checkStatus, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [token, isPackageVoided]);

  // Session expiry check
  useEffect(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    if (sessionExpiry) {
      const tick = () => {
        const now = new Date();
        const exp = new Date(sessionExpiry);
        const diff = exp - now;
        if (diff <= 0) { handleSessionExpired(); return; }
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setRemainingTime(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
      };
      tick();
      sessionTimerRef.current = setInterval(tick, 5000);
    } else {
      setRemainingTime(null);
    }
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [sessionExpiry]);

  const handleSessionExpired = useCallback(() => {
    setSessionToken(null);
    setSessionRequired(true);
    setOtpStep('form');
    setOtpCode('');
    setRemainingTime(null);
    setSessionExpiredMsg('Your session has expired. Please verify again to continue.');
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${token}`);
    toast.error('Session expired. Please verify again.');
  }, [token]);

  const getSessionHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    return headers;
  }, [sessionToken]);

  const loadDocData = async (docId, isInitial = false) => {
    try {
      if (!isInitial) setLoading(true);
      const headers = getSessionHeaders();
      const res = await fetch(`${API_URL}/api/docflow/documents/${docId}/view/data`, { headers });
      if (res.status === 401) { handleSessionExpired(); return; }
      if (res.status === 410) {
        const err = await res.json().catch(() => ({}));
        setIsPackageVoided(true);
        let msg = 'This package has been voided and is no longer available.';
        if (err && err.detail) {
          if (typeof err.detail === 'string') msg = err.detail;
          else if (typeof err.detail === 'object' && err.detail.message) {
            msg = err.detail.message;
            if (err.detail.void_reason) msg += ` Reason: ${err.detail.void_reason}`;
          }
        }
        setPackageVoidedMsg(msg);
        return;
      }
      if (!res.ok) throw new Error('Failed to load document data');
      const data = await res.json();
      setDocFieldValues(prev => ({ ...prev, [docId]: data.field_data || {} }));
    } catch (e) {
      console.error(e);
    } finally {
      if (!isInitial) setLoading(false);
    }
  };

  const loadPackage = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const headers = {};
      if (sessionToken) headers['X-Session-Token'] = sessionToken;
      const res = await fetch(`${API_URL}/api/docflow/packages/public/${token}`, { headers });
      if (res.status === 401) { handleSessionExpired(); return; }
      if (res.status === 410) {
        const err = await res.json().catch(() => ({}));
        setIsPackageVoided(true);
        // Phase 81.67 — handle structured detail (object) and legacy string detail.
        let msg = 'This package has been voided and is no longer available.';
        if (err && err.detail) {
          if (typeof err.detail === 'string') {
            msg = err.detail;
          } else if (typeof err.detail === 'object' && err.detail.message) {
            msg = err.detail.message;
            if (err.detail.void_reason) {
              msg += ` Reason: ${err.detail.void_reason}`;
            }
          }
        }
        setPackageVoidedMsg(msg);
        setLoading(false);
        return;
      }
      if (res.status === 404) {
        setIsPackageVoided(true);
        setPackageVoidedMsg('This package has been deleted and is no longer available.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setPkg(data);

      // If there's an active document, load its data before finishing the initial loader
      if (data.documents?.length > 0) {
        const firstDoc = data.documents[0];
        setActiveDocIndex(0);
        await loadDocData(firstDoc.document_id, true); // Pass true to indicate it's the initial load
      }

      // Phase 81 — surface SMS disclaimer requirement to the modal gate.
      // Phase 81.4 — only when active recipient still has a pending action
      // (signer or approver). Viewers, completed/approved/declined/voided
      // recipients, and terminal package states never see the popup.
      const ar = data?.active_recipient || {};
      const recRole = String(ar.role_type || ar.role || 'SIGN').toUpperCase();
      const recStatus = String(ar.status || '').toLowerCase();
      const pkgStatus = String(data?.package_status || data?.status || '').toLowerCase();
      const terminalRecipient = ['signed', 'completed', 'approved', 'rejected', 'declined', 'voided', 'expired', 'skipped'].includes(recStatus);
      const terminalPkg = ['completed', 'signed', 'voided', 'expired', 'declined', 'cancelled'].includes(pkgStatus);
      const isActionableRole = recRole === 'SIGN' || recRole === 'APPROVE_REJECT' || recRole === 'SIGNER' || recRole === 'APPROVER';
      const recipientIsActionable = isActionableRole && !terminalRecipient && !terminalPkg && !data?.all_signing_complete && !ar.voided;

      // sms_mode controls SMS sending; sms_required (driven by sms_consent) controls popup.
      setSmsModeEnabled(!!data?.sms_mode);

      if (data?.sms_required && recipientIsActionable) {
        setSmsRequired(true);
        // Phase 81.83 — Honour persisted acceptance: if the recipient already
        // accepted on this device for this token, skip the disclaimer.
        const ackKey = buildSmsAckKey({
          scope: 'pkg',
          id: packageId,
          token,
          extra: ar?.email || ar?.id,
        });
        setSmsAcknowledged(hasAcceptedSms(ackKey));
        setSmsPhoneMasked(data?.recipient_phone_masked || '');
      } else {
        setSmsRequired(false);
        setSmsAcknowledged(true); // Skip to signing flow if SMS not required / not actionable
      }

      if (data.session_required && !sessionToken) {
        setSessionRequired(true);
        if (data.active_recipient?.name) setOtpName(data.active_recipient.name);
        if (data.active_recipient?.email) setOtpEmail(data.active_recipient.email);
      } else {
        setSessionRequired(false);
        // Load field placements if the recipient is a signer
        if (data.active_recipient?.role_type === 'SIGN' &&
          data.active_recipient?.status !== 'completed' &&
          data.documents?.length > 0) {
          loadFieldPlacements(data);
          // Pre-populate field values with merge field data from generated documents
          const initialValues = {};
          for (const doc of data.documents) {
            // Phase 81.21 — Merge BOTH `merge_field_values` (alias-keyed,
            // can collide when two converted merges share the same pattern)
            // AND `field_data` (field-id-keyed, always unique per placement).
            // `field_data` takes priority on collision so each converted
            // merge field reliably displays its own previously-saved value
            // for downstream recipients in sequential signing.
            const aliasMap = doc.merge_field_values || {};
            const fieldMap = doc.field_data || {};
            const mfv = { ...aliasMap, ...fieldMap };
            if (doc.document_id && Object.keys(mfv).length > 0) {
              initialValues[doc.document_id] = { ...mfv };
            }
          }
          if (Object.keys(initialValues).length > 0) {
            // Phase 81.49 — initial values from field_data set here; linked
            // field fanout happens in a useEffect after templateFieldsMap is
            // populated (see below).
            setDocFieldValues(initialValues);
          }
        }
      }

      if (data.active_recipient?.status === 'completed') {
        setCompleted(true);
        setCompletedAction(data.active_recipient?.action_taken);
      }
    } catch (e) {
      setLoadError(e.message || 'Failed to load package');
    } finally {
      setLoading(false);
    }
  };

  // Load field placements for all documents' templates
  // IMPORTANT: We annotate fields with `__isAssigned` metadata instead of filtering.
  // The actual hide/read-only decision happens at render time based on live values,
  // so pre-filled values from prior signers/system can still be shown read-only.
  const loadFieldPlacements = async (pkgData) => {
    setLoadingFields(true);
    const newMap = {};
    const assignedComponents = pkgData.active_recipient?.assigned_components || {};
    // True when the backend provided an explicit per-recipient assignment map for
    // this package. When true, a missing or empty template entry means "zero
    // fields assigned here" — not backward-compat "all fields assigned to all".
    const hasPackageLevelAssignments = Object.keys(assignedComponents).length > 0;

    for (const doc of (pkgData.documents || [])) {
      const templateId = doc.template_id;
      if (!templateId || newMap[templateId]) continue;
      try {
        const res = await fetch(`${API_URL}/api/docflow/templates/${templateId}/field-placements-public`);
        if (res.ok) {
          const data = await res.json();
          let fields = data.field_placements || [];

          const assignedFieldIds = assignedComponents[templateId] || [];
          // Phase 81.11 — Strict per-recipient isolation for ALL field types
          // including merge fields. Only `label` (purely static document text)
          // is treated as "always-visible". Previously `merge`, `checkbox`,
          // and `radio` were globally assigned, which leaked merge fields
          // belonging to a future recipient into the current recipient's view.
          const NON_ASSIGNABLE = ['label'];
          const fieldType = (f) => (f.type || f.field_type);
          const hasAnyAssignment = fields.some(f => f.assigned_to || f.recipient_id);

          fields = fields.map(f => {
            let isAssigned;
            if (assignedFieldIds.length > 0) {
              // Explicit non-empty list for this recipient+template.
              isAssigned = assignedFieldIds.includes(f.id) || NON_ASSIGNABLE.includes(fieldType(f));
            } else if (hasPackageLevelAssignments) {
              // Package has assignment data but this template is either absent
              // from the recipient's map or explicitly empty → they own zero
              // fields here. Only non-assignable types (labels) pass through.
              // This fixes the isolation bug where ALL fields in a template
              // assigned to one recipient were incorrectly exposed to others.
              isAssigned = NON_ASSIGNABLE.includes(fieldType(f));
            } else if (hasAnyAssignment) {
              // No package-level map, but field-level assigned_to attrs exist.
              // Only fields with no explicit owner are considered "public".
              isAssigned = (!f.assigned_to && !f.recipient_id) || NON_ASSIGNABLE.includes(fieldType(f));
            } else {
              // Backward compat: no assignment data at all → all fields visible.
              isAssigned = true;
            }
            return { ...f, __isAssigned: isAssigned };
          });

          newMap[templateId] = fields;
        }
      } catch (e) {
        console.error(`Failed to load fields for template ${templateId}:`, e);
        newMap[templateId] = [];
      }
    }
    setTemplateFieldsMap(newMap);
    setLoadingFields(false);
  };

  // Phase 81.49 / Phase 2 — Resolve interlinked targets once
  // templateFieldsMap is populated. For each placement with `linked_to` that
  // points at another document's field whose source value already exists,
  // pre-fill the target (respecting same-recipient scope). Phase 2 extends
  // this to checkbox + radio: source/target value lookup uses the placement's
  // groupName as the storage key for radio fields, and the placement id for
  // text/date/checkbox.
  useEffect(() => {
    if (!pkg?.documents?.length || !Object.keys(templateFieldsMap).length) return;
    const valueKeyFor = (p) => {
      const t = (p?.type || p?.field_type || '').toLowerCase();
      if (t === 'radio') return p.groupName || p.group_name || p.id;
      return p.id;
    };
    let changed = false;
    const next = { ...docFieldValues };
    for (const d of pkg.documents) {
      const placements = templateFieldsMap[d.template_id] || [];
      for (const p of placements) {
        const link = p.linked_to;
        if (!link?.enabled || !link.field_id) continue;
        const targetKey = valueKeyFor(p);
        const currentVal = next[d.document_id]?.[targetKey];
        if (currentVal !== undefined && currentVal !== '') continue;
        let sourceValue;
        let sourceOwner;
        for (const other of pkg.documents) {
          if (other.document_id === d.document_id) continue;
          const otherPlacements = templateFieldsMap[other.template_id] || [];
          const srcField = otherPlacements.find(op => op.id === link.field_id);
          if (!srcField) continue;
          const sourceKey = valueKeyFor(srcField);
          const otherVals = next[other.document_id] || {};
          if (otherVals[sourceKey] !== undefined && otherVals[sourceKey] !== '') {
            sourceValue = otherVals[sourceKey];
            sourceOwner = srcField.assigned_to || srcField.recipient_id;
            break;
          }
        }
        if (sourceValue === undefined) continue;
        const targetOwner = p.assigned_to || p.recipient_id;
        if (sourceOwner && targetOwner && sourceOwner !== targetOwner) continue;
        next[d.document_id] = { ...(next[d.document_id] || {}), [targetKey]: sourceValue };
        changed = true;
      }
    }
    if (changed) setDocFieldValues(next);
  }, [pkg, templateFieldsMap]);

  // Get filtered fields for a specific document (mapped to its template).
  // Applies per-recipient visibility based on assignment + current values:
  //   - Assigned                → interactive
  //   - Unassigned + has value  → read-only (visible, non-editable)
  //   - Unassigned + no value   → hidden (skipped by viewer)
  const getFieldsForDoc = useCallback((doc) => {
    const baseFields = templateFieldsMap[doc.template_id] || [];
    const values = docFieldValues[doc.document_id] || {};
    // Hide interactive fields (signature/text/date/etc.) from recipients
    // who don't own them. Merge fields are EXEMPT — see Phase 81.18 below.
    const interactiveTypes = new Set(['signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown']);

    return baseFields.map(f => {
      // Phase 81.49 / Phase 2 — Interlinked TARGET fields are auto-locked
      // to read-only ONLY when read_only_target is true (default). In Two-Way
      // mode we leave the field editable so the recipient can update either
      // side and have the change sync back to the source. Lock + Two-Way
      // are mutually exclusive at author time, but we double-guard here so
      // legacy data with both flags resolves to "Two-Way wins".
      if (
        f.linked_to?.enabled &&
        f.linked_to?.field_id &&
        f.linked_to?.read_only_target !== false &&
        f.linked_to?.direction !== 'two_way'
      ) {
        return { ...f, readOnly: true, field_hint: '🔗 Synced from linked field' };
      }

      if (f.__isAssigned) {
        // Phase 81.47/81.48 — author-time readOnly fields stay visible to
        // their owner as printed text (not editable).
        return f.readOnly === true ? { ...f, readOnly: true } : f;
      }

      const t = f.type || f.field_type;

      // Phase 81.48 — REVERT Phase 81.47's hide-from-non-owners rule.
      // Author-time Read-Only fields are ALWAYS visible to every recipient
      // as non-editable printed text. "Read Only Fields Must Always Be
      // Visible" per updated spec.
      if (f.readOnly === true) {
        return { ...f, readOnly: true };
      }

      // Phase 81.18 — Merge fields (plain OR converted-to-input) are ALWAYS
      // visible to every recipient and rendered read-only when not owned.
      // Plain merges = CRM-populated contract data everyone should see.
      // Converted merges = the assigned signer fills it; the value still
      // remains visible to other signers (so contract context is preserved).
      // This matches the public-link behaviour and removes the long-standing
      // mismatch where email-package recipients saw "missing" merge fields.
      if (t === 'merge') {
        return { ...f, readOnly: true };
      }

      // Phase 81.30 — Unassigned interactive field. If a previous signer (or
      // the system) already filled a value, render it READ-ONLY so the next
      // signer can see what was done before. If nothing has been filled yet,
      // hide it entirely (DocuSign-style — signers should never see other
      // signers' empty placeholders). Radio fields are tricky: the value lives
      // under `groupName`, not the field id, so consult the group key.
      if (interactiveTypes.has(t)) {
        let hasValue = false;
        if (t === 'radio') {
          const group = f.groupName || f.group_name;
          const groupVal = group ? values[group] : undefined;
          const optionValue = f.optionValue || f.option_value || f.id;
          // Consider the option "filled" only if THIS specific option is
          // selected — sibling options stay hidden if not selected.
          hasValue = groupVal !== undefined && groupVal !== '' && groupVal === optionValue;
          // Legacy single-field-with-radioOptions model: any non-empty value.
          if (!hasValue && Array.isArray(f.radioOptions) && f.radioOptions.length > 0) {
            const v = values[f.id];
            hasValue = v !== undefined && v !== null && v !== '';
          }
        } else if (t === 'checkbox') {
          // A checkbox is only "shown" to the next recipient when it was
          // explicitly checked — leaving it unchecked is indistinguishable
          // from "skipped", so we hide unchecked checkboxes from non-owners.
          hasValue = values[f.id] === true || values[f.id] === 'true';
        } else {
          const v = values[f.id];
          hasValue = v !== undefined && v !== null && v !== '';
        }
        return { ...f, readOnly: true };
      }

      return { ...f, readOnly: true };
    });
  }, [templateFieldsMap, docFieldValues]);

  // Handle field value changes for a specific document
  // Phase 81.49 / Phase 2 — Interlinked Fields fanout. When a SOURCE field's
  // value changes, propagate to every other doc in the package whose
  // placement has `linked_to.field_id === source.id` AND is assigned to the
  // same recipient. Cross-recipient links are silently skipped per spec.
  //
  // Phase 2 additions:
  //   • Radio: source/target storage key is `groupName` (not field id) —
  //     the renderer reads `field_data[groupName]` for new-model radios.
  //     The incoming `key` from a radio change is the groupName itself.
  //   • Checkbox: storage key is field id; values are booleans (passthrough).
  //   • Two-way: when a TARGET field with `direction === 'two_way'` is
  //     edited, ALSO write the value to the SOURCE doc, then re-fanout
  //     from the source so any sibling targets stay in sync.
  const valueKeyFor = useCallback((p) => {
    const t = (p?.type || p?.field_type || '').toLowerCase();
    if (t === 'radio') return p.groupName || p.group_name || p.id;
    return p.id;
  }, []);

  const fanoutLinkedFieldValue = useCallback((sourceDocId, key, newValue) => {
    if (!pkg?.documents) return {};
    const sourceDoc = pkg.documents.find(d => d.document_id === sourceDocId);
    if (!sourceDoc) return {};
    const sourcePlacements = templateFieldsMap?.[sourceDoc.template_id] || [];
    // The incoming `key` may be a placement id (text/date/checkbox) OR a
    // groupName (radio new-model). Find every source placement whose
    // value-key equals `key`. For radio there are multiple placements per
    // group — any with `linked_to` pointing back to it from another doc
    // counts as a match.
    const matchingSources = sourcePlacements.filter(p => valueKeyFor(p) === key);
    if (matchingSources.length === 0) return {};

    const updates = {};  // { [docId]: { [key]: value } }
    for (const otherDoc of pkg.documents) {
      if (otherDoc.document_id === sourceDocId) continue;
      const placements = templateFieldsMap?.[otherDoc.template_id] || [];
      for (const p of placements) {
        const link = p.linked_to;
        if (!link?.enabled || !link.field_id) continue;
        // Match if any of the source placements (sharing `key`) has the id
        // referenced by the target's linked_to.field_id.
        const matchSource = matchingSources.find(s => s.id === link.field_id);
        if (!matchSource) continue;
        // Same-recipient scope: target owner must match source owner.
        const sourceOwner = matchSource.assigned_to || matchSource.recipient_id;
        const targetOwner = p.assigned_to || p.recipient_id;
        if (sourceOwner && targetOwner && sourceOwner !== targetOwner) continue;
        const targetKey = valueKeyFor(p);
        updates[otherDoc.document_id] = { ...(updates[otherDoc.document_id] || {}), [targetKey]: newValue };
      }
    }
    return updates;
  }, [pkg, templateFieldsMap, valueKeyFor]);

  // Phase 2 — Reverse fanout when a TARGET field with direction='two_way'
  // is edited. Walks the doc's placements to find any with a `linked_to`
  // pointing at another doc's source field. Writes the new value to the
  // source doc, then rolls a forward fanout from the source so sibling
  // targets stay in sync. Skipped when the link is read_only_target (in
  // which case the field shouldn't be editable in the first place).
  const reverseFanoutLinkedFieldValue = useCallback((targetDocId, key, newValue) => {
    if (!pkg?.documents) return {};
    const targetDoc = pkg.documents.find(d => d.document_id === targetDocId);
    if (!targetDoc) return {};
    const targetPlacements = templateFieldsMap?.[targetDoc.template_id] || [];
    // Find target placement(s) whose own value key matches the changed key
    // AND whose linked_to opts into two-way. Multiple radio fields in a
    // group share a key; pick any one with two-way + a real link.
    const triggers = targetPlacements.filter(p => {
      if (valueKeyFor(p) !== key) return false;
      const lk = p.linked_to;
      return Boolean(lk?.enabled && lk?.field_id && lk?.direction === 'two_way' && lk?.read_only_target !== true);
    });
    if (triggers.length === 0) return {};

    const updates = {};
    for (const trig of triggers) {
      const lk = trig.linked_to;
      // Locate source doc + source field by id.
      for (const otherDoc of pkg.documents) {
        if (otherDoc.document_id === targetDocId) continue;
        const placements = templateFieldsMap?.[otherDoc.template_id] || [];
        const srcField = placements.find(op => op.id === lk.field_id);
        if (!srcField) continue;
        // Same-recipient scope still applies in two-way.
        const targetOwner = trig.assigned_to || trig.recipient_id;
        const sourceOwner = srcField.assigned_to || srcField.recipient_id;
        if (sourceOwner && targetOwner && sourceOwner !== targetOwner) break;
        const sourceKey = valueKeyFor(srcField);
        updates[otherDoc.document_id] = {
          ...(updates[otherDoc.document_id] || {}),
          [sourceKey]: newValue,
        };
        // Forward-fanout from this source so sibling targets stay synced.
        const forward = fanoutLinkedFieldValue(otherDoc.document_id, sourceKey, newValue);
        for (const [docId, vals] of Object.entries(forward)) {
          if (docId === targetDocId) continue;  // don't overwrite the trigger doc
          updates[docId] = { ...(updates[docId] || {}), ...vals };
        }
        break;  // each trigger pairs to exactly one source doc
      }
    }
    return updates;
  }, [pkg, templateFieldsMap, valueKeyFor, fanoutLinkedFieldValue]);

  const handleDocFieldsChange = useCallback((docId, values) => {
    setDocFieldValues(prev => {
      const next = {
        ...prev,
        [docId]: { ...(prev[docId] || {}), ...values },
      };
      // Forward fanout: source → linked targets across the package.
      for (const [key, value] of Object.entries(values)) {
        const linkedUpdates = fanoutLinkedFieldValue(docId, key, value);
        for (const [otherDocId, otherVals] of Object.entries(linkedUpdates)) {
          next[otherDocId] = { ...(next[otherDocId] || {}), ...otherVals };
        }
        // Phase 2 — Reverse fanout for two-way targets.
        const reverseUpdates = reverseFanoutLinkedFieldValue(docId, key, value);
        for (const [otherDocId, otherVals] of Object.entries(reverseUpdates)) {
          next[otherDocId] = { ...(next[otherDocId] || {}), ...otherVals };
        }
      }
      return next;
    });
  }, [fanoutLinkedFieldValue, reverseFanoutLinkedFieldValue]);

  // Signature modal management
  // Session signature cache — keyed per signer to prevent cross-user leakage.
  const _sigSessionKey = (pkg?.active_recipient?.email || pkg?.active_recipient?.id)
    ? `${token}::${(pkg.active_recipient.email || pkg.active_recipient.id).toLowerCase()}`
    : null;
  const { getSignature: getSessionSig, setSignature: setSessionSig, clearAll: clearSessionSig } = useSessionSignature(_sigSessionKey);

  const openSignatureModalDirect = useCallback((docId, fieldId, isInitials = false, field = null) => {
    setCurrentSignDocId(docId);
    setCurrentSignFieldId(fieldId);
    setIsInitialsField(isInitials);
    setCurrentSignFieldStyle(field?.style || null);
    // Capture the field's authored box so the typed signature image
    // ends up exactly that size on the final PDF.
    setCurrentSignFieldDims({
      width: Number(field?.width) || null,
      height: Number(field?.height) || null,
    });
    setSignatureModalOpen(true);
  }, []);

  const openSignatureModal = useCallback((docId, fieldId, isInitials = false, field = null) => {
    // If the field already has a value or no cached signature exists, open the full modal.
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
    // Re-pack field style + dimensions for the modal so the regenerated
    // typed signature still respects the configured size.
    openSignatureModalDirect(docId, fieldId, isInitials, {
      style: fieldStyle,
      width: fieldWidth,
      height: fieldHeight,
    });
  }, [reusePrompt, openSignatureModalDirect]);

  const handleSignatureSave = useCallback((fieldId, sigData, applyToFieldIds) => {
    if (!currentSignDocId) return;
    // Cache the most recent signature/initials for reuse on subsequent fields.
    setSessionSig(isInitialsField ? 'initials' : 'signature', sigData);

    if (applyToFieldIds && applyToFieldIds.length > 1) {
      setDocFieldValues(prev => {
        const docVals = { ...(prev[currentSignDocId] || {}) };
        applyToFieldIds.forEach(fid => { docVals[fid] = sigData; });
        return { ...prev, [currentSignDocId]: docVals };
      });
    } else {
      setDocFieldValues(prev => ({
        ...prev,
        [currentSignDocId]: { ...(prev[currentSignDocId] || {}), [fieldId]: sigData },
      }));
    }
  }, [currentSignDocId, isInitialsField, setSessionSig]);

  // Check if all required signing fields are completed
  // Phase 81.53 — Properly handles radio (groupName key + group-required
  // semantics) and checkbox (boolean true) so the Finish button enables
  // when the user truly is done. Skips non-interactive types and fields
  // not assigned to the current recipient.
  // Phase 81.59 — Hidden fields are computed in a useMemo below; this
  // memo MUST come after `hiddenFieldsByDoc` to avoid temporal-dead-zone
  // ReferenceError. We define hiddenFieldsByDoc inline here so ordering
  // is guaranteed.
  const hiddenFieldsByDoc = useMemo(() => {
    const out = {};
    const documents = pkg?.documents || [];
    for (const doc of documents) {
      const fields = templateFieldsMap[doc.template_id] || [];
      const values = docFieldValues[doc.document_id] || {};
      out[doc.document_id] = computeHiddenFieldIds(fields, values);
    }
    return out;
  }, [pkg, templateFieldsMap, docFieldValues]);

  // Per-doc completion map — used by auto-advance to detect the moment a doc
  // transitions from incomplete → complete so we can move to the next one.
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

  const allRequiredFieldsComplete = useMemo(() => {
    if (!pkg || pkg.active_recipient?.role_type !== 'SIGN') return true;
    const documents = pkg.documents || [];
    const NON_INTERACTIVE = new Set(['label', 'merge']);

    const isRequired = (f, all) => {
      if (f.required === false || f.required === 'false') return false;
      const t = (f.type || f.field_type || '').toLowerCase();
      if (t === 'radio') {
        const group = f.groupName || f.group_name;
        if (!group) return Boolean(f.required);
        return (all || []).some(o =>
          (o.type || o.field_type) === 'radio' &&
          (o.groupName || o.group_name) === group &&
          (o.required === true || o.required === 'true')
        );
      }
      if (f.required === true || f.required === 'true') return true;
      return ['signature', 'initials'].includes(t);
    };

    const isFilled = (f, vals) => {
      const t = (f.type || f.field_type || '').toLowerCase();
      if (t === 'radio') {
        const group = f.groupName || f.group_name || f.id;
        const v = vals[group];
        return v !== undefined && v !== null && String(v) !== '';
      }
      if (t === 'checkbox') {
        const v = vals[f.id];
        return v === true || v === 'true';
      }
      if (t === 'date') {
        if ((f.dateMode || 'auto') === 'auto') return true;
        const v = vals[f.id];
        return v !== undefined && v !== null && String(v).trim() !== '';
      }
      const v = vals[f.id];
      return v !== undefined && v !== null && String(v).trim() !== '';
    };

    for (const doc of documents) {
      const templateId = doc.template_id;
      const fields = templateFieldsMap[templateId] || [];
      const docValues = docFieldValues[doc.document_id] || {};
      // Phase 81.57 — Conditional-hidden fields reported by this doc's
      // viewer are skipped here too. Without this, a "Required" text
      // input that's hidden by a Radio condition would block Finish.
      const dynamicHidden = hiddenFieldsByDoc[doc.document_id] || new Set();

      for (const field of fields) {
        if (field.__isAssigned === false) continue;
        const t = (field.type || field.field_type || '').toLowerCase();
        if (NON_INTERACTIVE.has(t)) continue;
        if (field.field_hidden || field.field_disabled) continue;
        if (field.readOnly) continue;
        if (dynamicHidden.has(field.id)) continue;
        if (!isRequired(field, fields)) continue;
        if (!isFilled(field, docValues)) return false;
      }
    }
    return true;
  }, [pkg, templateFieldsMap, docFieldValues, hiddenFieldsByDoc]);

  const hasAnyFields = useMemo(() => {
    // True if the current recipient has ANY assigned (interactive) field across documents.
    return Object.values(templateFieldsMap).some(fields =>
      fields.some(f => f.__isAssigned !== false)
    );
  }, [templateFieldsMap]);

  // ═══ OTP handlers ═══
  const handleSendOtp = async () => {
    if (!otpName.trim() || !otpEmail.trim()) { toast.error('Please enter your name and email'); return; }
    try {
      setOtpSending(true);
      const res = await fetch(`${API_URL}/api/docflow/packages/public/${token}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: otpName.trim(), email: otpEmail.trim() }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to send verification code'); }
      setOtpStep('sent');
      setSessionExpiredMsg(null);
      toast.success('Verification code sent to your email');
    } catch (e) { toast.error(e.message); }
    finally { setOtpSending(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) { toast.error('Please enter the verification code'); return; }
    try {
      setOtpVerifying(true);
      const res = await fetch(`${API_URL}/api/docflow/packages/public/${token}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail.trim(), otp_code: otpCode.trim() }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Invalid verification code'); }
      const data = await res.json();
      const newToken = data.session_token;
      setSessionToken(newToken);
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${token}`, newToken);
      setSessionRequired(false);
      setOtpStep('verified');
      if (data.expires_in_minutes) {
        const expiry = new Date(Date.now() + data.expires_in_minutes * 60000);
        setSessionExpiry(expiry.toISOString());
      }
      toast.success('Verified successfully');
    } catch (e) { toast.error(e.message); }
    finally { setOtpVerifying(false); }
  };

  // ═══ Action handlers ═══
  const handleAction = async (endpoint, actionLabel) => {
    try {
      setSubmitting(true);
      let body;
      if (endpoint === 'reject') {
        body = { reason: rejectReason, rejector_name: pkg?.active_recipient?.name };
      } else if (endpoint === 'approve') {
        body = { approver_name: pkg?.active_recipient?.name };
      } else if (endpoint === 'mark-signed') {
        body = { signer_name: pkg?.active_recipient?.name, signer_email: pkg?.active_recipient?.email };
      } else {
        body = { reviewer_name: pkg?.active_recipient?.name };
      }

      const res = await fetch(`${API_URL}/api/docflow/packages/public/${token}/${endpoint}`, {
        method: 'POST',
        headers: getSessionHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) { handleSessionExpired(); return; }
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `Failed to ${actionLabel}`); }
      const data = await res.json();
      setCompleted(true);
      setCompletedAction(data.action);
      setShowRejectDialog(false);
      toast.success(data.message || `Package ${actionLabel}`);
    } catch (e) {
      toast.error(e.message || `Failed to ${actionLabel}`);
    } finally { setSubmitting(false); }
  };

  // Sign with field data (new endpoint)
  const handleSignWithFields = async () => {
    try {
      setSubmitting(true);

      // Build documents_field_data map: { doc_id: { field_id: value } }
      const documentsFieldData = {};
      for (const doc of (pkg?.documents || [])) {
        const vals = docFieldValues[doc.document_id] || {};
        if (Object.keys(vals).length > 0) {
          documentsFieldData[doc.document_id] = vals;
        }
      }

      const body = {
        signer_name: pkg?.active_recipient?.name,
        signer_email: pkg?.active_recipient?.email,
        documents_field_data: documentsFieldData,
      };

      const res = await fetch(`${API_URL}/api/docflow/packages/public/${token}/sign-with-fields`, {
        method: 'POST',
        headers: getSessionHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) { handleSessionExpired(); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to sign package');
      }
      const data = await res.json();
      setCompleted(true);
      setCompletedAction(data.action);
      toast.success(data.message || 'Package signed successfully');
      // Session complete — clear cached signature so no other signer on the
      // same device can accidentally reuse it.
      clearSessionSig();
    } catch (e) {
      toast.error(e.message || 'Failed to sign package');
    } finally { setSubmitting(false); }
  };

  const handleVoidPublic = async () => {
    if (!voidReason.trim()) { toast.error('Please provide a reason for voiding'); return; }
    try {
      setVoiding(true);
      const res = await fetch(`${API_URL}/api/docflow/packages/public/${token}/void`, {
        method: 'POST',
        headers: getSessionHeaders(),
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      if (res.status === 401) { handleSessionExpired(); return; }
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to void package'); }
      setVoided(true);
      setShowVoidDialog(false);
      sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${token}`);
      toast.success('Package has been voided');
    } catch (e) { toast.error(e.message || 'Failed to void package'); }
    finally { setVoiding(false); }
  };

  // ── Loading ──
  if (isPackageVoided) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" data-testid="package-voided-overlay">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Ban className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Package Unavailable</h2>
          <p className="text-gray-600" data-testid="void-message-text">{packageVoidedMsg}</p>
          <p className="text-sm text-gray-400">If you believe this is an error, please contact the sender.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="package-public-loading">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-gray-500">Loading package...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (loadError) {
    const isVoided = loadError.includes('voided');
    const isExpired = loadError.includes('expired');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="package-public-error">
        <div className="text-center max-w-md px-6">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-red-50 mb-4">
            {isVoided || isExpired ? <XCircle className="h-8 w-8 text-red-400" /> : <AlertCircle className="h-8 w-8 text-red-400" />}
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {isVoided ? 'Package Voided' : isExpired ? 'Package Expired' : 'Unable to Load'}
          </h2>
          <p className="text-sm text-gray-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!pkg) return null;

  // ── OTP Verification Gate ──
  if (sessionRequired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="session-verification-gate">
        <div className="w-full max-w-md mx-4">
          {sessionExpiredMsg && (
            <div className="mb-4 flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl" data-testid="session-expired-banner">
              <AlertOctagon className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-amber-800">{sessionExpiredMsg}</p>
            </div>
          )}
          <div className="text-center mb-6">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-indigo-100 mb-3">
              <Lock className="h-6 w-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800" data-testid="verify-title">Verify Your Identity</h2>
            <p className="text-sm text-gray-500 mt-1">To access "{pkg.package_name}", please verify your identity.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            {otpStep === 'form' && (
              <div className="space-y-4" data-testid="otp-form-step">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Your Name</label>
                  <input type="text" value={otpName} onChange={(e) => setOtpName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid="otp-name-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                  <input type="email" value={otpEmail} onChange={(e) => setOtpEmail(e.target.value)} placeholder="you@example.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid="otp-email-input" />
                </div>
                <button onClick={handleSendOtp} disabled={otpSending || !otpName.trim() || !otpEmail.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" data-testid="send-otp-btn">
                  {otpSending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Mail className="h-4 w-4" /> Send Verification Code</>}
                </button>
              </div>
            )}
            {otpStep === 'sent' && (
              <div className="space-y-4" data-testid="otp-verify-step">
                <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg">
                  <Mail className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-indigo-800">Code sent to {otpEmail}</p>
                    <p className="text-xs text-indigo-600">Check your inbox and enter the 6-digit code below</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Verification Code</label>
                  <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} className="w-full px-3 py-3 border border-gray-300 rounded-lg text-center text-2xl font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-indigo-500" data-testid="otp-code-input" autoFocus />
                </div>
                <button onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length < 6} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" data-testid="verify-otp-btn">
                  {otpVerifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : <><CheckCircle2 className="h-4 w-4" /> Verify & Access</>}
                </button>
                <button onClick={() => { setOtpStep('form'); setOtpCode(''); }} className="w-full text-center text-xs text-gray-500 hover:text-gray-700" data-testid="resend-otp-link">
                  Didn't receive the code? Try again
                </button>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400">
              <Clock className="h-3 w-3" />
              <span>Session expires after {pkg.security_settings?.session_timeout_minutes || 15} minutes of inactivity</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { active_recipient, documents = [], package_name } = pkg;
  const roleType = active_recipient?.role_type || 'SIGN';
  const roleMeta = ROLE_META[roleType] || ROLE_META.SIGN;
  const RoleIcon = roleMeta.icon;
  const isViewOnly = roleType === 'VIEW_ONLY' || roleType === 'REVIEWER';
  const isApprover = roleType === 'APPROVE_REJECT';
  const isSigner = roleType === 'SIGN';
  const recipientCompleted = completed || active_recipient?.status === 'completed';
  const action = completedAction || active_recipient?.action_taken;
  const canVoidPublic = pkg.package_status === 'in_progress';
  const allSigningComplete = pkg.all_signing_complete || false;

  // ── Voided state ──
  if (voided) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="package-public-voided">
        <div className="text-center max-w-md px-6">
          <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-red-50 mb-6">
            <Ban className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Package Voided</h2>
          <p className="text-sm text-gray-500 mb-4">"{package_name}" has been voided and all pending actions have been cancelled.</p>
          <p className="text-xs text-gray-400">Reason: {voidReason}</p>
        </div>
      </div>
    );
  }

  // ── Completed state ──
  if (recipientCompleted) {
    const isRejected = action === 'rejected';
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-testid="package-public-completed">
        <div className="text-center max-w-md px-6">
          <div className={`flex h-20 w-20 mx-auto items-center justify-center rounded-full mb-6 ${isRejected ? 'bg-red-50' : 'bg-emerald-50'}`}>
            {isRejected ? <XCircle className="h-10 w-10 text-red-500" /> : <CheckCircle2 className="h-10 w-10 text-emerald-500" />}
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {isRejected ? 'Package Rejected' : isViewOnly ? 'Review Complete' : isApprover ? 'Package Approved' : isSigner ? 'Signing Complete' : 'Action Complete'}
          </h2>
          <p className="text-sm text-gray-500 mb-1">
            {isRejected ? `You have rejected "${package_name}". The package has been voided.`
              : isViewOnly ? `You have reviewed "${package_name}".`
                : isApprover ? `You have approved "${package_name}".`
                  : isSigner ? `You have signed "${package_name}".`
                    : `You have completed your action on "${package_name}".`}
          </p>
          <p className="text-xs text-gray-400">Action: {action}</p>

          {/* Download signed documents */}
          {isSigner && pkg.documents && pkg.documents.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Signed Documents</p>
              {pkg.documents.map((doc, i) => (
                <a
                  key={doc.document_id || i}
                  href={`${process.env.REACT_APP_BACKEND_URL}/api/docflow/documents/${doc.document_id}/view/signed`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
                  data-testid={`download-signed-${doc.document_id}`}
                >
                  <Download className="h-4 w-4" />
                  {doc.document_name || `Document ${i + 1}`}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Whether to use the full signing experience (fields exist)
  const useFieldSigning = isSigner && hasAnyFields;

  // Can sign = all required fields completed (acknowledgement is now captured
  // via the Confirm-Submit dialog at submission time, replacing the old checkbox).
  const canComplete = isSigner
    ? (useFieldSigning ? allRequiredFieldsComplete : true)
    : true;

  // ── Main Package View ──
  // Consent gate — required BEFORE interacting with the package documents.
  // NOTE: `pkgConsentKey` is derived below from the active recipient, but the
  // useState/useEffect for consent are declared near the top of the component
  // (alongside other hooks) to satisfy React's Rules of Hooks — they MUST be
  // called on every render regardless of the early-return loading/error gates.
  const pkgConsentKey = (pkg?.active_recipient?.email || pkg?.active_recipient?.id)
    ? `pkg-${token}::${(pkg.active_recipient.email || pkg.active_recipient.id).toLowerCase()}`
    : null;
  const pkgShouldShowConsent = !!pkgConsentKey && !pkgConsentAccepted && !isPackageVoided;

  // SMS Disclaimer gate: shown as full screen overlay when sms_mode=true
  // and recipient hasn't acknowledged yet. Blocks all package content.
  if (smsRequired && smsDeclined && !isPackageVoided) {
    return (
      <SmsDeclineScreen onReconsider={() => setSmsDeclined(false)} />
    );
  }
  if (smsRequired && !smsAcknowledged && !isPackageVoided) {
    return (
      <SmsDisclaimerModal
        token={token}
        packageId={packageId}
        scope="package"
        documentType="package"
        smsMode={smsModeEnabled}
        phoneMasked={smsPhoneMasked}
        documentName={package_name}
        recipientId={pkg?.active_recipient?.id}
        recipientName={pkg?.active_recipient?.name}
        recipientEmail={pkg?.active_recipient?.email}
        companyName={pkg?.tenant_name}
        onContinue={() => {
          // Phase 81.83 — persist per-recipient acceptance so refresh / new
          // tab / browser restart on this device don't re-prompt.
          const ar = pkg?.active_recipient;
          const ackKey = buildSmsAckKey({
            scope: 'pkg',
            id: packageId,
            token,
            extra: ar?.email || ar?.id,
          });
          persistSmsAck(ackKey);
          setSmsAcknowledged(true);
        }}
        onDecline={() => {
          setSmsDeclined(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="package-public-view">
      <ConsentScreen
        open={pkgShouldShowConsent && (!smsRequired || smsAcknowledged)}
        sessionKey={pkgConsentKey}
        documentName={package_name}
        recipientName={pkg?.active_recipient?.name}
        recipientEmail={pkg?.active_recipient?.email}
        token={token}
        packageId={packageId}
        companyName={pkg?.tenant_name}
        onContinue={() => setPkgConsentAccepted(true)}
        submitting={submitting}
      />
      {/* Header */}
      {/* Phase 81.61 — Sticky top action bar so Package name + Finish button
          are always visible while scrolling long PDFs. Responsive spacing
          preserved, no layout shift. */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-3 sm:px-6 lg:px-8 py-3 sm:py-5 shadow-sm">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0 order-2 sm:order-1">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-indigo-100 shrink-0">
                <Package className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-lg font-bold text-gray-900 break-words" data-testid="public-package-name">{package_name}</h1>
                <p className="text-xs text-gray-500">
                  {documents.length} document{documents.length !== 1 ? 's' : ''} to {isViewOnly ? 'review' : isApprover ? 'approve' : 'sign'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap order-1 sm:order-2 self-start">
              {/* Phase 74: Sender info chip — read-only header indicator */}
              {pkg?.sender && (pkg.sender.name || pkg.sender.email) && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] sm:text-xs text-slate-700 max-w-full sm:max-w-[280px] shrink-0"
                  data-testid="package-sender-chip"
                  title={`From: ${pkg.sender.name}${pkg.sender.email ? ` <${pkg.sender.email}>` : ''}`}
                >
                  <span className="font-medium text-slate-500 uppercase tracking-wide shrink-0">From</span>
                  <span className="truncate font-semibold text-slate-800 min-w-0" data-testid="sender-name">
                    {pkg.sender.name || pkg.sender.email}
                  </span>
                  {pkg.sender.email && pkg.sender.name && (
                    <span className="truncate text-slate-500 hidden sm:inline min-w-0" data-testid="sender-email">
                      ({pkg.sender.email})
                    </span>
                  )}
                </div>
              )}
              {/* Phase 81.15 — header "Finish" button. Same click handler,
                  same disabled rules, same submitting state as the bottom
                  button. Visible only to actionable signers with field
                  signing in play; mirrors the existing render guard so we
                  don't break view-only / approver / completed flows. */}
              {isSigner && !recipientCompleted && useFieldSigning && (
                <button
                  onClick={async () => {
                    // Phase 81.20 — Finish submits instantly. Required-field
                    // gating still applies via `canComplete` + the disabled
                    // attribute below, so this matches the spec: "one click
                    // finish, no popup, keep validation checks".
                    if (!canComplete || submitting) return;
                    await handleSignWithFields();
                  }}
                  disabled={!canComplete || submitting}
                  className={`inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all shrink-0 ${canComplete && !submitting
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  data-testid="finish-signing-btn-header"
                  title={canComplete ? 'Submit your signed package' : 'Complete all required fields to enable Finish'}
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  {submitting ? 'Processing...' : 'Finish'}
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 sm:mt-3 p-2.5 sm:p-3 bg-gray-50 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate" data-testid="recipient-name">{active_recipient?.name}</p>
                <p className="text-xs text-gray-500 truncate">{active_recipient?.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {sessionToken && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium" data-testid="session-active-badge">
                    <Lock className="h-2.5 w-2.5" /> Verified
                    {remainingTime && (
                      <span className="text-emerald-400 ml-0.5" data-testid="session-timer">
                        <Timer className="h-2.5 w-2.5 inline mr-0.5" />{remainingTime}
                      </span>
                    )}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${roleMeta.color}`} data-testid="recipient-role-badge">
                  <RoleIcon className="h-3 w-3" />
                  {roleMeta.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Signer field hint */}
        {/* {isSigner && hasAnyFields && !loadingFields && (
          <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 px-4 py-3 rounded-xl mb-4 border border-indigo-100" data-testid="signing-instruction">
            <FileText className="h-4 w-4 shrink-0" />
            <span>Open each document below to fill in and sign the required fields. All signature and required fields must be completed before you can submit.</span>
          </div>
        )} */}

        {/* Approver: signing pending warning */}
        {isApprover && !allSigningComplete && !recipientCompleted && (
          <div className="flex items-center gap-3 text-sm text-amber-800 bg-amber-50 px-4 py-4 rounded-xl mb-4 border border-amber-200" data-testid="signing-pending-warning">
            <Clock className="h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-semibold">Signing is pending</p>
              <p className="text-xs text-amber-600 mt-0.5">The signer has not yet completed signing. You will be able to review and approve once all documents are signed.</p>
            </div>
          </div>
        )}

        {loadingFields && (
          <div className="flex items-center justify-center py-6 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="ml-2 text-sm text-gray-500">Loading document fields...</span>
          </div>
        )}

        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between">
          <span>{isViewOnly ? 'Documents to Review' : isApprover ? 'Documents for Approval' : 'Documents'}</span>
          {/* Phase 81.60 — Mobile sidebar toggle */}
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

        {/* Phase 81.60 — Three-panel layout: sidebar | main viewer.
            Sidebar shown on lg+ screens; drawer on mobile. Only the ACTIVE
            doc renders in main to reduce clutter and let the PDF take the
            full available width. */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 mb-6">
          {/* Sidebar — desktop sticky */}
          <div className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)]">
              <PackageDocSidebar
                documents={documents}
                activeDocIndex={activeDocIndex}
                onSelect={(idx) => setActiveDocIndex(idx)}
                getDocStats={(doc, idx) => {
                  const fields = getFieldsForDoc(doc);
                  const values = docFieldValues[doc.document_id] || {};
                  const dynamicHidden = hiddenFieldsByDoc[doc.document_id] || new Set();
                  const isFilled = (f) => {
                    const t = (f.type || f.field_type || '').toLowerCase();
                    if (t === 'radio') {
                      const g = f.groupName || f.group_name || f.id;
                      const v = values[g];
                      return v !== undefined && v !== null && String(v) !== '';
                    }
                    if (t === 'checkbox') return values[f.id] === true || values[f.id] === 'true';
                    if (t === 'date') {
                      if ((f.dateMode || 'auto') === 'auto') return true;
                      const v = values[f.id];
                      return v !== undefined && v !== null && String(v).trim() !== '';
                    }
                    const v = values[f.id];
                    return v !== undefined && v !== null && String(v).trim() !== '';
                  };
                  const activeRaw = fields.filter((f) => {
                    const t = (f.type || f.field_type || '').toLowerCase();
                    if (['label', 'merge'].includes(t)) return false;
                    if (f.field_hidden || f.field_disabled) return false;
                    if (f.readOnly) return false;
                    if (f.__isAssigned === false) return false;
                    if (dynamicHidden.has(f.id)) return false;
                    return true;
                  });
                  const seenGroups = new Set();
                  const slots = [];
                  for (const f of activeRaw) {
                    const t = (f.type || f.field_type || '').toLowerCase();
                    if (t === 'radio') {
                      const g = f.groupName || f.group_name;
                      if (g) {
                        if (seenGroups.has(g)) continue;
                        seenGroups.add(g);
                      }
                    }
                    slots.push(f);
                  }
                  const filled = slots.filter(isFilled).length;
                  const isComplete = slots.length > 0 && filled === slots.length;
                  const isStarted = filled > 0 && !isComplete;
                  let statusLabel = 'Pending';
                  let statusTone = 'pending';
                  if (doc.has_signed_version) {
                    statusLabel = 'Completed';
                    statusTone = 'complete';
                  } else if (isComplete) {
                    statusLabel = 'Ready';
                    statusTone = 'complete';
                  } else if (isStarted) {
                    statusLabel = 'In Progress';
                    statusTone = 'progress';
                  }
                  return { filled, total: slots.length, isComplete: isComplete || !!doc.has_signed_version, statusLabel, statusTone };
                }}
              />
            </div>
          </div>

          {/* Mobile drawer */}
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
                    // lightweight stats to avoid duplication; use hiddenFieldsByDoc
                    const fields = getFieldsForDoc(doc);
                    const values = docFieldValues[doc.document_id] || {};
                    const dynamicHidden = hiddenFieldsByDoc[doc.document_id] || new Set();
                    let total = 0, filled = 0;
                    const seenGroups = new Set();
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
                      total += 1;
                      const hasVal = (() => {
                        if (t === 'radio') {
                          const g = f.groupName || f.group_name || f.id;
                          return values[g] !== undefined && String(values[g] || '') !== '';
                        }
                        if (t === 'checkbox') return values[f.id] === true || values[f.id] === 'true';
                        const v = values[f.id];
                        return v !== undefined && v !== null && String(v).trim() !== '';
                      })();
                      if (hasVal) filled += 1;
                    }
                    const isComplete = total > 0 && filled === total;
                    return {
                      filled,
                      total,
                      isComplete: isComplete || !!doc.has_signed_version,
                      statusLabel: doc.has_signed_version ? 'Completed' : isComplete ? 'Ready' : filled > 0 ? 'In Progress' : 'Pending',
                      statusTone: doc.has_signed_version ? 'complete' : isComplete ? 'complete' : filled > 0 ? 'progress' : 'pending',
                    };
                  }}
                />
              </div>
            </div>
          )}

          {/* Main content — render ALL docs but only display the active one.
              We keep every section mounted so any local state (scroll, viewer
              page) persists when the user switches between docs. */}
          <div className="space-y-3 min-w-0">
            {documents.map((doc, i) => {
              const fields = getFieldsForDoc(doc);
              const isActive = activeDocIndex === i;
              const docValues = docFieldValues[doc.document_id] || {};
              const recipientIds = [
                pkg?.active_recipient?.id,
                pkg?.active_recipient?.template_recipient_id,
                pkg?.active_recipient?.recipient_id,
                pkg?.active_recipient?.email,
              ].filter(Boolean);
              const assignedFieldIds = Array.isArray(pkg?.active_recipient?.assigned_components?.[doc.template_id])
                ? pkg.active_recipient.assigned_components[doc.template_id]
                : (Array.isArray(pkg?.active_recipient?.assigned_field_ids)
                  ? pkg.active_recipient.assigned_field_ids
                  : null);
              return (
                <div
                  key={doc.document_id || i}
                  style={{ display: isActive ? 'block' : 'none' }}
                  data-testid={`package-doc-wrapper-${i}`}
                >
                  <PackageDocSection
                    doc={doc}
                    index={i}
                    fields={fields}
                    fieldValues={docValues}
                    recipientIds={recipientIds}
                    assignedFieldIds={assignedFieldIds}
                    isActive={isActive}
                    isSigner={isSigner}
                    isApprover={isApprover}
                    allSigningComplete={allSigningComplete}
                    apiUrl={API_URL}
                    hasSignedVersion={!!doc.has_signed_version}
                    autoStartToken={autoStartTokens[doc.document_id] || 0}
                    onToggle={() => { /* Phase 81.60: collapse disabled — sidebar controls active doc */ }}
                    onFieldsChange={(values) => handleDocFieldsChange(doc.document_id, values)}
                    showSignatureModal={(fieldId, isInit, fieldObj) => openSignatureModal(doc.document_id, fieldId, isInit, fieldObj)}
                    signatureModalOpen={signatureModalOpen}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* VIEW_ONLY: Mark Reviewed (confirmation via dialog) */}
        {isViewOnly && !recipientCompleted && (
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="review-action-section">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Complete Your Review</h3>
            <p className="text-xs text-gray-500 mb-4">
              When you're done reviewing {documents.length > 1 ? 'all documents in' : 'the document in'} this package, click below to confirm and submit your review.
            </p>
            <button
              onClick={() => setConfirmDialog({ open: true, action: 'review' })}
              disabled={submitting}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${!submitting ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              data-testid="mark-reviewed-btn"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {submitting ? 'Processing...' : 'Mark as Reviewed'}
            </button>
          </div>
        )}

        {/* SIGN: Field validation + Complete Signing */}


        {/* APPROVE_REJECT */}
        {isApprover && !recipientCompleted && (
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="approve-reject-section">
            {!allSigningComplete ? (
              <div className="text-center py-4" data-testid="approval-disabled-notice">
                <Clock className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Waiting for Signing</h3>
                <p className="text-xs text-gray-500">Approval actions will be available once all signers have completed signing.</p>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Your Decision</h3>
                <p className="text-xs text-gray-500 mb-5">Review the signed documents above, then approve or reject this package.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRejectDialog(true)}
                    disabled={submitting}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border transition-all ${!submitting ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100' : 'border-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    data-testid="reject-btn"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />} {submitting ? 'Rejecting...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => setConfirmDialog({ open: true, action: 'approve' })}
                    disabled={submitting}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${!submitting ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    data-testid="approve-btn"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                    {submitting ? 'Approving...' : 'Approve'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Void from Public */}
      {/* {canVoidPublic && !recipientCompleted && (
        <div className="max-w-3xl mx-auto px-4 pb-8">
          <div className="border-t border-gray-200 pt-4">
            <button onClick={() => setShowVoidDialog(true)} className="flex items-center gap-2 text-xs text-red-500 hover:text-red-700 transition-colors" data-testid="void-from-public-btn">
              <Ban className="h-3.5 w-3.5" /> Void this package
            </button>
          </div>
        </div>
      )} */}

      {/* Signature Modal */}
      <SignatureModal
        isOpen={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSave={handleSignatureSave}
        fieldId={currentSignFieldId}
        isInitials={isInitialsField}
        signerName={pkg?.active_recipient?.name || ''}
        fieldStyle={currentSignFieldStyle}
        fieldWidth={currentSignFieldDims.width}
        fieldHeight={currentSignFieldDims.height}
        assignedSignatureFieldIds={(() => {
          if (!currentSignDocId || !pkg) return [];
          const fieldType = isInitialsField ? 'initials' : 'signature';
          // Find the template_id for the current document
          const doc = (pkg.documents || []).find(d => d.document_id === currentSignDocId);
          const templateId = doc?.template_id;
          // Try templateFieldsMap first, then fall back to all placements for matching template
          let placements = [];
          if (templateId && templateFieldsMap[templateId]) {
            placements = templateFieldsMap[templateId];
          } else {
            // Fallback: search all templateFieldsMap entries
            for (const [, fields] of Object.entries(templateFieldsMap)) {
              const matchingField = fields.find(f => f.type === fieldType);
              if (matchingField) { placements = fields; break; }
            }
          }
          // Phase 64: strict recipient ownership — never fan out to disabled,
          // hidden, or fields the active recipient doesn't own.
          return placements
            .filter(f => f.type === fieldType
              && !f.field_disabled
              && !f.field_hidden
              && f.__isAssigned !== false)
            .map(f => f.id);
        })()}
      />

      {/* Signature reuse prompt — lightweight popover shown on subsequent signature fields */}
      <SignatureReusePrompt
        open={reusePrompt.open}
        dataUrl={getSessionSig(reusePrompt.isInitials ? 'initials' : 'signature')}
        type={reusePrompt.isInitials ? 'initials' : 'signature'}
        onClose={() => setReusePrompt({ open: false, docId: null, fieldId: null, isInitials: false })}
        onReuse={handleReuseAccept}
        onDrawNew={handleReuseDrawNew}
      />

      {/* Final submit confirmation dialog — replaces the old acknowledgement checkbox */}
      <ConfirmSubmitDialog
        open={confirmDialog.open}
        submitting={submitting}
        title={
          confirmDialog.action === 'sign' ? 'Confirm signing' :
            confirmDialog.action === 'approve' ? 'Confirm approval' :
              confirmDialog.action === 'review' ? 'Confirm review' :
                'Are you sure?'
        }
        message={
          confirmDialog.action === 'sign'
            ? (useFieldSigning
              ? 'You have completed all required fields. Are you sure you want to submit your signature?'
              : `Are you sure you want to sign ${documents.length > 1 ? 'all documents in this package' : 'this document'}?`)
            : confirmDialog.action === 'approve'
              ? `Are you sure you want to approve ${documents.length > 1 ? 'this package' : 'this document'}? This action cannot be undone.`
              : `Are you sure you have reviewed ${documents.length > 1 ? 'all documents in' : 'the document in'} this package and want to submit your review?`
        }
        confirmLabel={
          confirmDialog.action === 'sign' ? 'Confirm & Sign' :
            confirmDialog.action === 'approve' ? 'Confirm & Approve' :
              'Confirm & Submit'
        }
        confirmTone={confirmDialog.action === 'approve' ? 'emerald' : 'indigo'}
        onCancel={() => setConfirmDialog({ open: false, action: null })}
        onConfirm={async () => {
          const action = confirmDialog.action;
          if (action === 'sign') {
            if (useFieldSigning) await handleSignWithFields();
            else await handleAction('mark-signed', 'sign');
          } else if (action === 'approve') {
            await handleAction('approve', 'approve');
          } else if (action === 'review') {
            await handleAction('mark-reviewed', 'mark as reviewed');
          }
          setConfirmDialog({ open: false, action: null });
        }}
      />

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="reject-dialog">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50"><ThumbsDown className="h-5 w-5 text-red-500" /></div>
              <div><h3 className="text-lg font-semibold text-gray-900">Reject Package</h3><p className="text-xs text-gray-500">This will void the entire package</p></div>
            </div>
            <p className="text-sm text-gray-600 mb-3">Please provide a reason for rejecting "{package_name}". This action cannot be undone.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Enter your reason for rejection..." className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4" rows={3} data-testid="reject-reason-input" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowRejectDialog(false); setRejectReason(''); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800" data-testid="cancel-reject-btn">Cancel</button>
              <button onClick={() => handleAction('reject', 'reject')} disabled={submitting || !rejectReason.trim()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2" data-testid="confirm-reject-btn">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Rejecting...' : 'Reject & Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Dialog */}
      {showVoidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="void-dialog">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50"><Ban className="h-5 w-5 text-red-500" /></div>
              <div><h3 className="text-lg font-semibold text-gray-900">Void Package</h3><p className="text-xs text-gray-500">This will permanently stop all pending actions</p></div>
            </div>
            <p className="text-sm text-gray-600 mb-3">Are you sure you want to void "{package_name}"? This action cannot be undone.</p>
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Enter the reason for voiding..." className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4" rows={3} data-testid="void-reason-input" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowVoidDialog(false); setVoidReason(''); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800" data-testid="cancel-void-btn">Cancel</button>
              <button onClick={handleVoidPublic} disabled={voiding || !voidReason.trim()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2" data-testid="confirm-void-btn">
                {voiding && <Loader2 className="h-4 w-4 animate-spin" />}
                {voiding ? 'Voiding...' : 'Void Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackagePublicView;
