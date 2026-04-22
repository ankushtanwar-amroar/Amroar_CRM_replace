import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Package, FileText, CheckCircle2, Eye, Loader2, AlertCircle,
  XCircle, ChevronRight, CheckSquare, Square,
  ThumbsUp, ThumbsDown, ShieldCheck, Mail, Lock, Clock,
  Ban, AlertOctagon, Timer, ChevronDown, Download
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import InteractiveDocumentViewer from '../components/InteractiveDocumentViewer';
import SignatureModal from '../components/SignatureModal';
import SignatureReusePrompt from '../components/SignatureReusePrompt';
import ConsentScreen, { hasAcceptedConsent } from '../components/ConsentScreen';
import ConfirmSubmitDialog from '../components/ConfirmSubmitDialog';
import useSessionSignature from '../hooks/useSessionSignature';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ROLE_META = {
  SIGN:           { label: 'Signer',   icon: FileText,    color: 'bg-indigo-100 text-indigo-700' },
  VIEW_ONLY:      { label: 'Reviewer', icon: Eye,         color: 'bg-blue-100 text-blue-700' },
  REVIEWER:       { label: 'Reviewer', icon: Eye,         color: 'bg-blue-100 text-blue-700' },
  APPROVE_REJECT: { label: 'Approver', icon: ShieldCheck,  color: 'bg-amber-100 text-amber-700' },
};

const SESSION_KEY_PREFIX = 'docflow_session_';

const PackagePublicView = () => {
  const { token } = useParams();
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
  const [loadingFields, setLoadingFields] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentSignFieldId, setCurrentSignFieldId] = useState(null);
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

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${token}`);
    if (stored) setSessionToken(stored);
  }, [token]);

  useEffect(() => { loadPackage(); }, [token, sessionToken]);

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
        setPackageVoidedMsg(err.detail || 'This package has been voided and is no longer available.');
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
            const mfv = doc.merge_field_values || doc.field_data || {};
            if (doc.document_id && Object.keys(mfv).length > 0) {
              initialValues[doc.document_id] = { ...mfv };
            }
          }
          if (Object.keys(initialValues).length > 0) {
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

    for (const doc of (pkgData.documents || [])) {
      const templateId = doc.template_id;
      if (!templateId || newMap[templateId]) continue;
      try {
        const res = await fetch(`${API_URL}/api/docflow/templates/${templateId}/field-placements-public`);
        if (res.ok) {
          const data = await res.json();
          let fields = data.field_placements || [];

          const assignedFieldIds = assignedComponents[templateId] || [];
          // Non-assignable types are always considered "assigned" (document-level elements)
          const NON_ASSIGNABLE = ['merge', 'checkbox', 'radio', 'label'];
          const hasAnyAssignment = fields.some(f => f.assigned_to || f.recipient_id);

          fields = fields.map(f => {
            let isAssigned;
            if (assignedFieldIds.length > 0) {
              // Explicit assigned_components map for this recipient+template
              isAssigned = assignedFieldIds.includes(f.id) || NON_ASSIGNABLE.includes(f.type);
            } else if (hasAnyAssignment) {
              // Template has field-level assignments but no explicit map for this recipient
              // → only fields without any assignment are considered "assigned to everyone"
              isAssigned = (!f.assigned_to && !f.recipient_id) || NON_ASSIGNABLE.includes(f.type);
            } else {
              // Backward compat: no assignment data at all → all fields assigned to all
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

  // Get filtered fields for a specific document (mapped to its template).
  // Applies per-recipient visibility based on assignment + current values:
  //   - Assigned                → interactive
  //   - Unassigned + has value  → read-only (visible, non-editable)
  //   - Unassigned + no value   → hidden (skipped by viewer)
  const getFieldsForDoc = useCallback((doc) => {
    const baseFields = templateFieldsMap[doc.template_id] || [];
    const values = docFieldValues[doc.document_id] || {};
    return baseFields.map(f => {
      if (f.__isAssigned) return f;
      const hasValue = values[f.id] !== undefined && values[f.id] !== null && values[f.id] !== '';
      if (hasValue) {
        // Preserve any pre-existing readOnly/field_disabled semantics
        return { ...f, readOnly: true, field_disabled: false, field_hidden: false };
      }
      return { ...f, field_hidden: true };
    });
  }, [templateFieldsMap, docFieldValues]);

  // Handle field value changes for a specific document
  const handleDocFieldsChange = useCallback((docId, values) => {
    setDocFieldValues(prev => ({
      ...prev,
      [docId]: { ...(prev[docId] || {}), ...values },
    }));
  }, []);

  // Signature modal management
  // Session signature cache — keyed per signer to prevent cross-user leakage.
  const _sigSessionKey = (pkg?.active_recipient?.email || pkg?.active_recipient?.id)
    ? `${token}::${(pkg.active_recipient.email || pkg.active_recipient.id).toLowerCase()}`
    : null;
  const { getSignature: getSessionSig, setSignature: setSessionSig, clearAll: clearSessionSig } = useSessionSignature(_sigSessionKey);

  const openSignatureModalDirect = useCallback((docId, fieldId, isInitials = false) => {
    setCurrentSignDocId(docId);
    setCurrentSignFieldId(fieldId);
    setIsInitialsField(isInitials);
    setSignatureModalOpen(true);
  }, []);

  const openSignatureModal = useCallback((docId, fieldId, isInitials = false) => {
    // If the field already has a value or no cached signature exists, open the full modal.
    const existing = (docFieldValues[docId] || {})[fieldId];
    if (existing) {
      openSignatureModalDirect(docId, fieldId, isInitials);
      return;
    }
    const cached = getSessionSig(isInitials ? 'initials' : 'signature');
    if (cached) {
      setReusePrompt({ open: true, docId, fieldId, isInitials });
      return;
    }
    openSignatureModalDirect(docId, fieldId, isInitials);
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
    const { docId, fieldId, isInitials } = reusePrompt;
    setReusePrompt({ open: false, docId: null, fieldId: null, isInitials: false });
    openSignatureModalDirect(docId, fieldId, isInitials);
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
  const allRequiredFieldsComplete = useMemo(() => {
    if (!pkg || pkg.active_recipient?.role_type !== 'SIGN') return true;
    const documents = pkg.documents || [];
    const signingTypes = new Set(['signature', 'initials', 'date']);

    for (const doc of documents) {
      const templateId = doc.template_id;
      const fields = templateFieldsMap[templateId] || [];
      const docValues = docFieldValues[doc.document_id] || {};

      for (const field of fields) {
        // Skip fields not assigned to the current recipient — they're either
        // hidden or shown read-only and should not block completion.
        if (field.__isAssigned === false) continue;
        // Only validate required signing fields (fields are already strictly filtered)
        if (signingTypes.has(field.type) && field.required !== false) {
          const val = docValues[field.id];
          if (!val || String(val).trim() === '') return false;
        }
      }
    }
    return true;
  }, [pkg, templateFieldsMap, docFieldValues]);

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

  return (
    <div className="min-h-screen bg-gray-50" data-testid="package-public-view">
      <ConsentScreen
        open={pkgShouldShowConsent}
        sessionKey={pkgConsentKey}
        documentName={package_name}
        recipientName={pkg?.active_recipient?.name}
        onContinue={() => setPkgConsentAccepted(true)}
      />
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 shrink-0">
                <Package className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 truncate" data-testid="public-package-name">{package_name}</h1>
                <p className="text-xs text-gray-500">
                  {documents.length} document{documents.length !== 1 ? 's' : ''} to {isViewOnly ? 'review' : isApprover ? 'approve' : 'sign'}
                </p>
              </div>
            </div>
            {/* Phase 74: Sender info chip — read-only header indicator */}
            {pkg?.sender && (pkg.sender.name || pkg.sender.email) && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-700 max-w-[280px] shrink-0"
                data-testid="package-sender-chip"
                title={`From: ${pkg.sender.name}${pkg.sender.email ? ` <${pkg.sender.email}>` : ''}`}
              >
                <span className="font-medium text-slate-500 uppercase tracking-wide">From</span>
                <span className="truncate font-semibold text-slate-800" data-testid="sender-name">
                  {pkg.sender.name || pkg.sender.email}
                </span>
                {pkg.sender.email && pkg.sender.name && (
                  <span className="truncate text-slate-500 hidden sm:inline" data-testid="sender-email">
                    ({pkg.sender.email})
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800" data-testid="recipient-name">{active_recipient?.name}</p>
                <p className="text-xs text-gray-500">{active_recipient?.email}</p>
              </div>
              <div className="flex items-center gap-2">
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
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Signer field hint */}
        {isSigner && hasAnyFields && !loadingFields && (
          <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 px-4 py-3 rounded-xl mb-4 border border-indigo-100" data-testid="signing-instruction">
            <FileText className="h-4 w-4 shrink-0" />
            <span>Open each document below to fill in and sign the required fields. All signature and required fields must be completed before you can submit.</span>
          </div>
        )}

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

        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {isViewOnly ? 'Documents to Review' : isApprover ? 'Documents for Approval' : 'Documents'}
        </h3>

        <div className="space-y-3 mb-6">
          {documents.map((doc, i) => {
            const fields = getFieldsForDoc(doc);
            const isActive = activeDocIndex === i;
            const docValues = docFieldValues[doc.document_id] || {};
            // Only fields interactive for the current recipient drive the progress UI.
            // Hidden (unassigned + unfilled) and read-only (unassigned + filled) fields
            // are excluded from the completion counter.
            const activeFields = fields.filter(f => !f.field_hidden && !f.readOnly && f.__isAssigned !== false);
            const completedCount = activeFields.filter(f => {
              const v = docValues[f.id];
              return v !== undefined && v !== null && String(v).trim() !== '';
            }).length;
            const hasFields = activeFields.length > 0;

            return (
              <div key={doc.document_id || i} className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid={`public-doc-${i}`}>
                <button
                  onClick={() => setActiveDocIndex(isActive ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  data-testid={`doc-toggle-${i}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm ${
                      isSigner && hasFields && completedCount === activeFields.length
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {isSigner && hasFields && completedCount === activeFields.length
                        ? <CheckCircle2 className="h-4 w-4" />
                        : doc.order}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{doc.document_name || 'Document'}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-400">{doc.status}</p>
                        {isSigner && hasFields && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            completedCount === activeFields.length
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-amber-50 text-amber-600'
                          }`} data-testid={`doc-field-status-${i}`}>
                            {completedCount}/{activeFields.length} fields
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSigner && hasFields && <span className="text-xs text-indigo-500">Fill & Sign</span>}
                    <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {isActive && (
                  <div className="border-t border-gray-100">
                    {/* Approver: signing not complete → block document access */}
                    {isApprover && !allSigningComplete ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-6" data-testid={`doc-signing-pending-${i}`}>
                        <Clock className="h-10 w-10 text-amber-400 mb-3" />
                        <p className="text-sm font-medium text-gray-700">Signing is pending by the signer</p>
                        <p className="text-xs text-gray-400 mt-1">This document will be available for review once the signer completes signing.</p>
                      </div>
                    ) : doc.document_id ? (
                      <div>
                        {/* Use InteractiveDocumentViewer for signers with fields */}
                        {isSigner && fields.length > 0 ? (
                          <div style={{ height: '70vh', minHeight: '550px' }} data-testid={`doc-interactive-viewer-${i}`}>
                            <InteractiveDocumentViewer
                              pdfUrl={`${API_URL}/api/docflow/documents/${doc.document_id}/view/unsigned`}
                              fields={fields}
                              onFieldsChange={(values) => handleDocFieldsChange(doc.document_id, values)}
                              readOnly={false}
                              showSignatureModal={(fieldId, isInit) => openSignatureModal(doc.document_id, fieldId, isInit)}
                              externalFieldValues={docValues}
                            />
                          </div>
                        ) : (
                          /* Non-signer view: use signed version if available */
                          <div className="px-4 pb-4">
                            <div className="mt-3 space-y-3">
                              <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '400px' }}>
                                <iframe
                                  src={doc.has_signed_version
                                    ? `${API_URL}/api/docflow/documents/${doc.document_id}/view/signed`
                                    : `${API_URL}/api/docflow/documents/${doc.document_id}/view/unsigned`}
                                  className="w-full h-full border-0"
                                  title={doc.document_name}
                                  data-testid={`doc-iframe-${i}`}
                                />
                              </div>
                              {isApprover && doc.has_signed_version && (
                                <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg" data-testid={`doc-signed-hint-${i}`}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  You are viewing the signed version of this document
                                </div>
                              )}
                              {isSigner && (
                                <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg" data-testid={`doc-review-hint-${i}`}>
                                  <Eye className="h-3.5 w-3.5 text-indigo-500" />
                                  Review this document before completing your signature below
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 p-4">Document not yet generated.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                !submitting ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              data-testid="mark-reviewed-btn"
            >
              <CheckCircle2 className="h-4 w-4" /> Mark as Reviewed
            </button>
          </div>
        )}

        {/* SIGN: Field validation + Complete Signing */}
        {isSigner && !recipientCompleted && (
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="sign-action-section">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Complete Your Signature</h3>
            <p className="text-xs text-gray-500 mb-4">
              {useFieldSigning
                ? `Fill in all required fields across ${documents.length > 1 ? 'all documents' : 'the document'} above, then confirm your signature below.`
                : `Review ${documents.length > 1 ? 'all documents' : 'the document'} above, then confirm your signature below.`
              }
            </p>

            {/* Field completion status */}
            {useFieldSigning && (
              <div className="mb-4 space-y-2" data-testid="field-completion-status">
                {documents.map((doc, i) => {
                  const fields = getFieldsForDoc(doc);
                  const activeFields = fields;
                  if (activeFields.length === 0) return null;
                  const docValues = docFieldValues[doc.document_id] || {};
                  const done = activeFields.filter(f => {
                    const v = docValues[f.id];
                    return v !== undefined && v !== null && String(v).trim() !== '';
                  }).length;
                  const allDone = done === activeFields.length;
                  return (
                    <div key={doc.document_id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                      allDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`} data-testid={`field-status-doc-${i}`}>
                      <span className="flex items-center gap-2">
                        {allDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {doc.document_name}
                      </span>
                      <span className="font-medium">{done}/{activeFields.length}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Validation warning */}
            {useFieldSigning && !allRequiredFieldsComplete && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4" data-testid="incomplete-fields-warning">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Please fill in all required signature and signing fields in the documents above before completing.</span>
              </div>
            )}

            <button
              onClick={() => setConfirmDialog({ open: true, action: 'sign' })}
              disabled={!canComplete || submitting}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                canComplete && !submitting ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              data-testid="complete-signing-btn"
            >
              <FileText className="h-4 w-4" /> Complete Signing
            </button>
          </div>
        )}

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
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border transition-all ${
                      !submitting ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100' : 'border-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                    data-testid="reject-btn"
                  >
                    <ThumbsDown className="h-4 w-4" /> Reject
                  </button>
                  <button
                    onClick={() => setConfirmDialog({ open: true, action: 'approve' })}
                    disabled={submitting}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                      !submitting ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    data-testid="approve-btn"
                  >
                    <ThumbsUp className="h-4 w-4" />
                    Approve
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
          confirmDialog.action === 'sign'    ? 'Confirm signing' :
          confirmDialog.action === 'approve' ? 'Confirm approval' :
          confirmDialog.action === 'review'  ? 'Confirm review' :
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
          confirmDialog.action === 'sign'    ? 'Confirm & Sign' :
          confirmDialog.action === 'approve' ? 'Confirm & Approve' :
                                               'Confirm & Submit'
        }
        confirmTone={confirmDialog.action === 'approve' ? 'emerald' : 'indigo'}
        onCancel={() => setConfirmDialog({ open: false, action: null })}
        onConfirm={async () => {
          const action = confirmDialog.action;
          // Close immediately so the spinner on the target button takes over.
          setConfirmDialog({ open: false, action: null });
          if (action === 'sign') {
            if (useFieldSigning) await handleSignWithFields();
            else await handleAction('mark-signed', 'sign');
          } else if (action === 'approve') {
            await handleAction('approve', 'approve');
          } else if (action === 'review') {
            await handleAction('mark-reviewed', 'mark as reviewed');
          }
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
              <button onClick={() => handleAction('reject', 'reject')} disabled={submitting || !rejectReason.trim()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50" data-testid="confirm-reject-btn">{submitting ? 'Rejecting...' : 'Reject & Void'}</button>
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
              <button onClick={handleVoidPublic} disabled={voiding || !voidReason.trim()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50" data-testid="confirm-void-btn">{voiding ? 'Voiding...' : 'Void Package'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackagePublicView;
