import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, FileText, Download, Eye, Loader2, Send, ArrowLeft, XCircle, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PDFDocument, rgb } from 'pdf-lib';
import InteractiveDocumentViewer, { formatLocalMMDDYYYY, formatDate, DATE_FORMATS, getRadioGroupName } from '../components/InteractiveDocumentViewer';
import SignatureModal from '../components/SignatureModal';
import SignatureReusePrompt from '../components/SignatureReusePrompt';
import ConsentScreen, { hasAcceptedConsent } from '../components/ConsentScreen';
import SmsDisclaimerModal from '../components/SmsDisclaimerModal';
import SmsDeclineScreen from '../components/SmsDeclineScreen';
import { buildSmsAckKey, hasAcceptedSms, persistSmsAck } from '../utils/smsAck';
import ConfirmSubmitDialog from '../components/ConfirmSubmitDialog';
import useSessionSignature from '../hooks/useSessionSignature';
import useGuidedFillIn from '../hooks/useGuidedFillIn';
import { emailError as validateEmail } from '../utils/emailValidator';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const PublicDocumentViewEnhanced = () => {
  const { token } = useParams();

  // Generator state
  const [isGenerator, setIsGenerator] = useState(false);
  const [generatorInfo, setGeneratorInfo] = useState(null);

  // Active document state (child or direct)
  const [activeToken, setActiveToken] = useState(token);
  const [docData, setDocData] = useState(null);
  // Phase 80: when the sender voids this recipient mid-session, we surface a
  // blocking modal and disable every action. State toggled by the background
  // poll below and the initial load.
  const [accessRevoked, setAccessRevoked] = useState(false);
  // Phase 81.67 — full document/package void: when set, render a clean "Voided" banner.
  const [voidedInfo, setVoidedInfo] = useState(null);
  // Phase 81 — SMS disclaimer acknowledgment (not OTP verification).
  const [smsRequired, setSmsRequired] = useState(false);
  // smsMode: whether actual SMS sending is enabled (independent of popup).
  const [smsModeEnabled, setSmsModeEnabled] = useState(false);
  const [smsAcknowledged, setSmsAcknowledged] = useState(false);
  // Phase 81.83 — Decline shows a clean exit screen; not persisted, so re-opening
  // the link prompts again.
  const [smsDeclined, setSmsDeclined] = useState(false);
  const [smsPhoneMasked, setSmsPhoneMasked] = useState('');
  const [template, setTemplate] = useState({ field_placements: [], recipients: [] });
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [viewMode, setViewMode] = useState('unsigned');
  const [fieldValues, setFieldValues] = useState({});
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentFieldId, setCurrentFieldId] = useState(null);
  const [currentFieldStyle, setCurrentFieldStyle] = useState(null);
  // Signature fontSize fix — track the active field's authored box so the
  // typed signature image is generated at the correct resolution.
  const [currentFieldDims, setCurrentFieldDims] = useState({ width: null, height: null });
  const [isInitialsField, setIsInitialsField] = useState(false);
  // Reuse prompt state (shows when a cached signature exists for this session)
  const [reusePrompt, setReusePrompt] = useState({ open: false, fieldId: null, isInitials: false });
  const [roleAction, setRoleAction] = useState(null); // 'approving', 'rejecting', 'reviewing'
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  // Kept for backward-compat references elsewhere, but no longer user-facing —
  // the Finish flow now uses `showFinishConfirm` + ConfirmSubmitDialog instead.
  const [signerConfirmed, setSignerConfirmed] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  // User identity + verification
  const [formData, setFormData] = useState({ signer_name: '', signer_email: '' });
  // Phase 81.28 — frontend-only email validation state.
  const [emailErr, setEmailErr] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStep, setVerificationStep] = useState(1); // 1: Details, 2: OTP
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [instantiating, setInstantiating] = useState(false);

  const signingTypes = new Set(['signature', 'initials', 'date']);
  // Phase 81.11 — `merge` is interactive (especially with fallbackToInput).
  // Including it here ensures merge fields owned by future recipients are
  // marked field_hidden (not just readOnly) so they're completely hidden
  // from the current signer's view.
  const interactiveTypes = new Set(['signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown', 'merge']);
  const templateRecipients = template?.recipients || [];

  // Session signature cache — keyed by document token + signer email so
  // different signers on the same device do NOT share cached signatures.
  const sessionKey = formData.signer_email ? `${token}::${formData.signer_email.toLowerCase()}` : null;
  const { getSignature, setSignature, clearAll: clearSessionSig } = useSessionSignature(sessionKey);

  // Consent screen state — required BEFORE the document view for all roles.
  const [consentAccepted, setConsentAccepted] = useState(false);
  // useEffect(() => {
  //   // Hydrate acceptance state when the session key becomes known
  //   if (sessionKey) setConsentAccepted(hasAcceptedConsent(sessionKey));
  // }, [sessionKey]);

  // Guided fill-in: track conditional-logic hidden fields (emitted by viewer)
  const [hiddenFieldIds, setHiddenFieldIds] = useState(new Set());
  const _activeRecipient = docData?.active_recipient || {};
  const _recipientIds = [
    _activeRecipient.id,
    _activeRecipient.template_recipient_id,
    _activeRecipient.recipient_id,
    _activeRecipient.email,
  ].filter(Boolean);
  // Prefer the backend-provided list of field ids that belong to this signer.
  const _assignedFieldIds = Array.isArray(_activeRecipient.assigned_field_ids) && _activeRecipient.assigned_field_ids.length > 0
    ? _activeRecipient.assigned_field_ids
    : null;
  const {
    activeFieldId,
    pendingFieldIds,
    completedCount,
    totalRequired,
    allComplete: guidedAllComplete,
    hasAnyRequired,
    navigableFieldIds,
    hasAnyNavigable,
    navUnfilledCount,
    started: guidedStarted,
    start: startGuided,
    goToNext: goToNextField,
    goToPrev: goToPrevField,
    syncFromClick: syncGuidedFromClick,
  } = useGuidedFillIn({
    fields: template?.field_placements || [],
    fieldValues,
    hiddenFieldIds,
    recipientIds: _recipientIds,
    assignedFieldIds: _assignedFieldIds,
  });

  // Phase 81.79 — Controlled scroll on explicit user actions only.
  const [scrollToken, setScrollToken] = useState(0);
  const bumpScroll = useCallback(() => setScrollToken((t) => t + 1), []);
  const handleStartGuided = useCallback(() => { startGuided(); bumpScroll(); }, [startGuided, bumpScroll]);
  const handleNextGuided = useCallback(() => { goToNextField(); bumpScroll(); }, [goToNextField, bumpScroll]);
  const handlePrevGuided = useCallback(() => { goToPrevField(); bumpScroll(); }, [goToPrevField, bumpScroll]);

  // ── Load initial document or generator info ──
  useEffect(() => {
    loadInitial();
  }, [token]);

  // Phase 80 — background poll every 15s to detect mid-session voids.
  // When the sender voids this recipient, the public endpoint flips
  // `recipient_voided=true`; we pop a blocking modal and disable actions.
  useEffect(() => {
    if (!activeToken || isGenerator) return;
    let cancelled = false;
    const check = async () => {
      try {
        const resp = await fetch(`${API_URL}/api/docflow/documents/public/${activeToken}`);
        if (cancelled) return;
        // Phase 81.67 (security fix) — mid-session void detection: if the
        // sender voids the document while the recipient has it open, the
        // next poll returns 410 with code='document_voided' and we flip
        // the page to the voided banner immediately.
        if (resp.status === 410) {
          try {
            const errBody = await resp.json();
            const detail = errBody?.detail;
            if (detail && typeof detail === 'object' && detail.code === 'document_voided') {
              setVoidedInfo({
                entity: 'document',
                name: detail.document_name || '',
                reason: detail.void_reason || '',
                voidedAt: detail.voided_at || null,
              });
              return;
            }
          } catch (_) { /* fall through */ }
        }
        if (!resp.ok) return;
        const data = await resp.json();
        if (data?.recipient_voided || data?.active_recipient?.voided) {
          setAccessRevoked(true);
        }
      } catch (_) { /* network hiccups are non-fatal */ }
    };
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeToken, isGenerator, API_URL]);

  const loadInitial = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/docflow/documents/public/${token}`);
      if (!response.ok) {
        // Phase 81.67 — detect entity-voided 410 with structured detail.
        if (response.status === 410) {
          let detail = null;
          try { detail = (await response.json())?.detail; } catch (_) { /* empty */ }
          if (detail && typeof detail === 'object' && detail.code === 'document_voided') {
            setVoidedInfo({
              entity: 'document',
              name: detail.document_name || '',
              reason: detail.void_reason || '',
              voidedAt: detail.voided_at || null,
            });
            setLoading(false);
            return;
          }
        }
        throw new Error('Document not found or expired');
      }
      const data = await response.json();

      if (data.is_generator) {
        // This is a reusable public link - show the identity form
        setIsGenerator(true);
        setGeneratorInfo(data);
        setLoading(false);
        return;
      }

      // Normal document (direct link / email link / child doc)
      setIsGenerator(false);
      setActiveToken(token);
      // Phase 80: if already voided, flip the revoked state immediately.
      if (data?.recipient_voided || data?.active_recipient?.voided) {
        setAccessRevoked(true);
      }
      // Phase 81: Surface SMS disclaimer requirement to the modal gate.
      // Phase 81.4 — only show disclaimer when the active recipient still has
      // a pending action (signer or approver). For viewers, completed signers,
      // already-approved approvers, voided/declined/expired recipients, or
      // when the document itself is in a terminal state, keep the popup
      // suppressed so they reopen straight into the read-only document.
      const ar = data?.active_recipient || {};
      const recRole = String(ar.role_type || ar.role || 'SIGN').toUpperCase();
      const recStatus = String(ar.status || '').toLowerCase();
      const docStatus = String(data?.status || data?.document_status || '').toLowerCase();
      const terminalRecipient = ['signed', 'completed', 'approved', 'rejected', 'declined', 'voided', 'expired', 'skipped'].includes(recStatus);
      const terminalDoc = ['completed', 'signed', 'voided', 'expired', 'declined', 'cancelled'].includes(docStatus);
      const isActionableRole = recRole === 'SIGN' || recRole === 'APPROVE_REJECT' || recRole === 'APPROVER' || recRole === 'SIGNER';
      const recipientIsActionable = isActionableRole && !terminalRecipient && !terminalDoc && !data?.recipient_voided && !ar.voided;

      // sms_mode controls SMS sending; sms_required (driven by sms_consent) controls popup.
      setSmsModeEnabled(!!data?.sms_mode);

      if (data?.sms_required && recipientIsActionable) {
        setSmsRequired(true);
        // Phase 81.83 — honour persisted acceptance per (doc, token, recipient).
        const ackKey = buildSmsAckKey({
          scope: 'doc',
          id: data?.id || data?.document_id,
          token,
          extra: ar?.email || ar?.id,
        });
        setSmsAcknowledged(hasAcceptedSms(ackKey));
        setSmsPhoneMasked(data?.recipient_phone_masked || '');
      } else {
        setSmsRequired(false);
        setSmsAcknowledged(true); // Skip to signing flow if SMS not required / not actionable
      }
      populateDocState(data);
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error(error.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const populateDocState = (data) => {
    setDocData(data);

    const activeRecipient = data.active_recipient || {};
    if (activeRecipient.name || activeRecipient.email) {
      setFormData({
        signer_name: activeRecipient.name || '',
        signer_email: activeRecipient.email || ''
      });
    }

    // Verification state
    if (data.is_verified) {
      setIsVerified(true);
    } else if (data.status === 'signed' || data.status === 'completed') {
      setIsVerified(true);
    } else if (data.require_auth === false) {
      setIsVerified(true);
    }

    if (data.template_id) {
      loadTemplate(data.template_id);
    }

    // Pre-fill field values
    const merged = {};
    if (data.field_data) Object.assign(merged, data.field_data);
    if (data.merge_field_values) Object.assign(merged, data.merge_field_values);
    if (data.salesforce_context?.fields) Object.assign(merged, data.salesforce_context.fields);
    setFieldValues(merged);
  };

  // ── Load child document by its token ──
  const loadChildDocument = async (childToken) => {
    try {
      const response = await fetch(`${API_URL}/api/docflow/documents/public/${childToken}`);
      if (!response.ok) throw new Error('Failed to load your document');
      const data = await response.json();
      setActiveToken(childToken);
      setIsGenerator(false);
      populateDocState(data);
    } catch (error) {
      console.error('Error loading child document:', error);
      toast.error(error.message || 'Failed to load document');
    }
  };

  const loadTemplate = async (templateId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/docflow/templates/${templateId}/field-placements-public`
      );
      if (response.ok) {
        const data = await response.json();
        setTemplate({
          field_placements: data.field_placements || [],
          recipients: data.recipients || []
        });
      }
    } catch (error) {
      console.error('Error loading template:', error);
    }
  };

  // ── Generator flow: Instantiate a new child document ──
  const handleInstantiate = async () => {
    // Phase 81.28 — frontend-only email validation guard. Mirrors backend
    // requirements without changing the API contract.
    const err = validateEmail(formData.signer_email, { required: true });
    if (!formData.signer_name?.trim() || err) {
      setEmailTouched(true);
      setEmailErr(err);
      if (!formData.signer_name?.trim() && !err) toast.error('Please enter your name');
      else if (err) toast.error(err);
      return;
    }
    setEmailErr('');

    try {
      setInstantiating(true);
      const response = await fetch(`${API_URL}/api/docflow/documents/public/instantiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: formData.signer_name,
          email: formData.signer_email
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        // Phase 81.67 (security fix) — handle voided generator: surface the
        // full-page banner instead of a useless [object Object] toast.
        if (response.status === 410 && err?.detail && typeof err.detail === 'object' && err.detail.code === 'document_voided') {
          setVoidedInfo({
            entity: 'document',
            name: err.detail.document_name || '',
            reason: err.detail.void_reason || '',
            voidedAt: err.detail.voided_at || null,
          });
          return;
        }
        const msg = typeof err?.detail === 'string' ? err.detail : (err?.detail?.message || 'Failed to create document instance');
        throw new Error(msg);
      }

      const result = await response.json();
      const childToken = result.child_token;
      const requireAuth = result.require_auth;

      if (requireAuth) {
        // Need OTP - send it using the child token
        setActiveToken(childToken);
        await sendOtpForToken(childToken, formData.signer_name, formData.signer_email);
        setVerificationStep(2);
      } else {
        // No auth needed - load child document directly
        setIsVerified(true);
        await loadChildDocument(childToken);
        toast.success('Document ready for signing');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setInstantiating(false);
    }
  };

  // ── OTP helpers ──
  const sendOtpForToken = async (tkn, name, email) => {
    const response = await fetch(`${API_URL}/api/docflow/documents/public/verify/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tkn, name, email })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to send verification code');
    }
    toast.success('Verification code sent to your email');
  };

  const handleSendOtp = async () => {
    if (!formData.signer_name || !formData.signer_email) {
      toast.error('Please enter your name and email');
      return;
    }
    try {
      setVerifying(true);
      // For generator flow, first instantiate then send OTP
      if (isGenerator) {
        await handleInstantiate();
        return;
      }
      // For direct documents with auth
      await sendOtpForToken(activeToken, formData.signer_name, formData.signer_email);
      setVerificationStep(2);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length < 4) {
      toast.error('Please enter the verification code');
      return;
    }
    try {
      setVerifying(true);
      const response = await fetch(`${API_URL}/api/docflow/documents/public/verify/check-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: activeToken,
          email: formData.signer_email,
          otp: otpCode
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Invalid verification code');
      }
      setIsVerified(true);
      toast.success('Identity verified successfully');
      // Load the child document after OTP verification
      await loadChildDocument(activeToken);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setVerifying(false);
    }
  };

  // ── Signature handling ──
  const openSignatureModalDirect = (fieldId, isInitials = false, field = null) => {
    setCurrentFieldId(fieldId);
    setIsInitialsField(isInitials);
    setCurrentFieldStyle(field?.style || null);
    setCurrentFieldDims({
      width: Number(field?.width) || null,
      height: Number(field?.height) || null,
    });
    setSignatureModalOpen(true);
  };

  const showSignatureModal = (fieldId, isInitials = false, field = null) => {
    // If the field is already signed, just reopen the full modal (legacy behavior).
    if (fieldValues[fieldId]) {
      openSignatureModalDirect(fieldId, isInitials, field);
      return;
    }
    // If a cached signature exists for this type → show reuse prompt first.
    const cached = getSignature(isInitials ? 'initials' : 'signature');
    if (cached) {
      setReusePrompt({
        open: true,
        fieldId,
        isInitials,
        fieldStyle: field?.style,
        fieldWidth: Number(field?.width) || null,
        fieldHeight: Number(field?.height) || null,
      });
      return;
    }
    openSignatureModalDirect(fieldId, isInitials, field);
  };

  const handleReuseAccept = () => {
    const { fieldId, isInitials } = reusePrompt;
    const cached = getSignature(isInitials ? 'initials' : 'signature');
    if (cached && fieldId) {
      setFieldValues(prev => ({ ...prev, [fieldId]: cached }));
    }
    setReusePrompt({ open: false, fieldId: null, isInitials: false });
  };

  const handleReuseDrawNew = () => {
    const { fieldId, isInitials, fieldStyle, fieldWidth, fieldHeight } = reusePrompt;
    setReusePrompt({ open: false, fieldId: null, isInitials: false });
    openSignatureModalDirect(fieldId, isInitials, {
      style: fieldStyle,
      width: fieldWidth,
      height: fieldHeight,
    });
  };

  const handleSignatureSave = (fieldId, signatureData, applyToFieldIds) => {
    // Cache the most-recent signature/initials for reuse across subsequent fields.
    setSignature(isInitialsField ? 'initials' : 'signature', signatureData);

    // Phase 64/66: Defense-in-depth. Verify each target field is actually
    // owned by the active recipient before writing. Source of truth =
    // `active_recipient.assigned_field_ids` (with back-compat fallbacks).
    const activeRcpt = docData?.active_recipient;
    const assignedIds = activeRcpt?.assigned_field_ids || [];
    const hasAssignments = assignedIds.length > 0;
    const tplRid = activeRcpt?.template_recipient_id;
    const activeId = activeRcpt?.id;
    const placements = template?.field_placements || [];
    const isFieldOwned = (fid) => {
      const f = placements.find(p => p.id === fid);
      if (!f) return false;
      const fieldAssignedTo = f.assigned_to || f.recipient_id;
      if (fieldAssignedTo) {
        return fieldAssignedTo === tplRid || fieldAssignedTo === activeId;
      }
      if (hasAssignments) return assignedIds.includes(fid);
      return true; // legacy templates with no assignment system
    };

    if (applyToFieldIds && applyToFieldIds.length > 1) {
      const safeIds = applyToFieldIds.filter(isFieldOwned);
      const targets = safeIds.length ? safeIds : [fieldId];
      setFieldValues(prev => {
        const updated = { ...prev };
        targets.forEach(fid => { updated[fid] = signatureData; });
        return updated;
      });
    } else {
      setFieldValues(prev => ({ ...prev, [fieldId]: signatureData }));
    }
  };

  const handleFieldsChange = (values) => {
    setFieldValues(values);
  };

  const canSign = () => {
    if (!docData?.can_sign) return false;
    if (!formData.signer_name) return false;
    const activeRcpt = docData?.active_recipient || {};
    if (activeRcpt.email && !formData.signer_email) return false;

    const assignedIds = activeRcpt?.assigned_field_ids || [];
    const hasAssignments = assignedIds.length > 0;
    const placements = template?.field_placements || [];

    const isOwnedByActive = (f) => {
      const fieldAssignedTo = f.assigned_to || f.recipient_id;
      if (fieldAssignedTo) {
        return fieldAssignedTo === activeRcpt?.template_recipient_id || fieldAssignedTo === activeRcpt?.id;
      }
      if (hasAssignments) return assignedIds.includes(f.id);
      return true;
    };

    // Phase 81.63 — Collect RADIO groups that have at least one required,
    // assigned, visible placement. A group is "satisfied" when ANY of its
    // placements' group-key stores a non-empty value.
    const requiredRadioGroups = new Map(); // key -> Set<groupName>
    const requiredNonRadioFields = [];
    for (const f of placements) {
      if (!interactiveTypes.has(f.type)) continue;
      if (!f.required) continue;
      if (hiddenFieldIds && hiddenFieldIds.has(f.id)) continue;
      if (!isOwnedByActive(f)) continue;
      if (f.type === 'radio') {
        const group = f.groupName || f.group_name || f.id;
        requiredRadioGroups.set(group, true);
      } else {
        requiredNonRadioFields.push(f);
      }
    }

    // Non-radio: storage key is the placement id.
    for (const field of requiredNonRadioFields) {
      const v = fieldValues[field.id];
      if (field.type === 'checkbox') {
        if (!(v === true || v === 'true')) return false;
      } else {
        if (v === undefined || v === null || String(v).trim() === '') return false;
      }
    }

    // Radio: storage key is groupName; any non-empty value satisfies.
    for (const group of requiredRadioGroups.keys()) {
      const v = fieldValues[group];
      if (v === undefined || v === null || String(v).trim() === '') return false;
    }

    return true;
  };

  const handleSign = async () => {
    if (!canSign()) {
      toast.error('Please fill all required fields and provide your signature');
      return;
    }
    try {
      setSigning(true);
      const hasSignedVersion = docData.signed_s3_key || docData.signed_file_url;
      const baseVersion = hasSignedVersion ? 'signed' : 'unsigned';
      const pdfResponse = await fetch(`${API_URL}/api/docflow/documents/${docData.id}/view/${baseVersion}`);
       if (!pdfResponse.ok) {
        const errorData = await pdfResponse.json(); 
        throw new Error(errorData.detail || "Failed to load PDF");
      }
      const pdfBytes = await pdfResponse.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      // Embed Helvetica up-front so we can measure text width for alignment.
      const { StandardFonts } = await import('pdf-lib');
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const measureTextWidth = (text, size) => {
        try { return helv.widthOfTextAtSize(String(text ?? ''), size); } catch { return 0; }
      };

      for (const field of template?.field_placements || []) {
        const pageIndex = field.page - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) continue;
        const page = pages[pageIndex];
        const { width: pdfW, height: pdfH } = page.getSize();
        // Scale from builder's 800px coordinate system to actual PDF point dimensions
        const scale = pdfW / 800;
        const ptWidth = field.width * scale;
        const ptHeight = field.height * scale;
        const x = field.x * scale;
        const y = pdfH - (field.y * scale) - ptHeight;
        const fieldValue = fieldValues[field.id];

        const fieldAssignedTo = field.assigned_to || field.recipient_id;
        const activeRcpt = docData?.active_recipient;
        const assignedIds = activeRcpt?.assigned_field_ids || [];
        const hasAssignments = assignedIds.length > 0;
        
        let isAssigned = true;
        if (fieldAssignedTo) {
            isAssigned = fieldAssignedTo === activeRcpt?.template_recipient_id || fieldAssignedTo === activeRcpt?.id;
        } else if (hasAssignments && interactiveTypes.has(field.type)) {
            isAssigned = assignedIds.includes(field.id);
        }

        if (interactiveTypes.has(field.type) && !isAssigned) {
          continue;
        }

        if (field.type === 'signature' && fieldValue) {
          if (fieldValue.startsWith('data:image')) {
            try {
              const base64Data = fieldValue.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              let image;
              if (fieldValue.includes('data:image/png')) image = await pdfDoc.embedPng(imageBytes);
              else if (fieldValue.includes('data:image/jpeg') || fieldValue.includes('data:image/jpg')) image = await pdfDoc.embedJpg(imageBytes);
              if (image) {
                // Aspect-fit + align (Phase 56) — signature respects
                // field.style.textAlign (left/center/right) inside the box.
                const aspect = image.width / image.height || 1;
                let fitW = ptHeight * aspect;
                let fitH = ptHeight;
                if (fitW > ptWidth) { fitW = ptWidth; fitH = ptWidth / aspect; }
                const align = field.style?.textAlign || 'center';
                const subX = align === 'left' ? x : align === 'right' ? x + (ptWidth - fitW) : x + (ptWidth - fitW) / 2;
                const subY = y + (ptHeight - fitH) / 2;
                page.drawImage(image, { x: subX, y: subY, width: fitW, height: fitH });
              }
            } catch (error) { console.error('Error embedding signature:', error); }
          }
        } else if (field.type === 'initials' && fieldValue) {
          if (fieldValue.startsWith('data:image')) {
            try {
              const base64Data = fieldValue.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              let image;
              if (fieldValue.includes('data:image/png')) image = await pdfDoc.embedPng(imageBytes);
              else if (fieldValue.includes('data:image/jpeg') || fieldValue.includes('data:image/jpg')) image = await pdfDoc.embedJpg(imageBytes);
              if (image) {
                const aspect = image.width / image.height || 1;
                let fitW = ptHeight * aspect;
                let fitH = ptHeight;
                if (fitW > ptWidth) { fitW = ptWidth; fitH = ptWidth / aspect; }
                const align = field.style?.textAlign || 'center';
                const subX = align === 'left' ? x : align === 'right' ? x + (ptWidth - fitW) : x + (ptWidth - fitW) / 2;
                const subY = y + (ptHeight - fitH) / 2;
                page.drawImage(image, { x: subX, y: subY, width: fitW, height: fitH });
              }
            } catch (error) { console.error('Error embedding initials:', error); }
          }
        } else if ((field.type === 'text' || field.type === 'date') && (fieldValue || (field.type === 'date' && (field.dateMode || 'auto') === 'auto'))) {
          // For 'date' type:
          //   - auto mode: always draw (fallback to today's local date in the field's chosen format)
          //   - manual mode: draw only if user picked a value
          const dateFmt = DATE_FORMATS.includes(field.dateFormat) ? field.dateFormat : 'MM/DD/YYYY';
          const drawValue = field.type === 'date'
            ? (fieldValue || formatDate(new Date(), dateFmt))
            : fieldValue;
          // Mirror resolveResponsiveFontSize from the viewer: same 0.85 height
          // multiplier and 2.5 width divisor, no hard cap, so the PDF matches
          // the live signing preview at any authored font size.
          const baseFs = (parseInt(field.style?.fontSize || '10') || 10) * scale;
          const hCap = Math.max(6, (ptHeight - 2 * scale) * 0.85);
          const wCap = Math.max(6, ptWidth / 2.5);
          const fSize = Math.max(6, Math.min(baseFs, hCap, wCap));
          const pad = 5 * scale;
          const textW = measureTextWidth(drawValue, fSize);
          let xOff;
          if (field.style?.textAlign === 'center') xOff = Math.max(pad, (ptWidth - textW) / 2);
          else if (field.style?.textAlign === 'right') xOff = Math.max(pad, ptWidth - textW - pad);
          else xOff = pad;
          page.drawText(drawValue.toString(), { x: x + xOff, y: y + (ptHeight / 2) - (fSize * 0.35), size: fSize, font: helv, color: rgb(0, 0, 0) });
        } else if (field.type === 'checkbox') {
          // Phase 73: Center the checkbox horizontally within the field
          // bounding box to match the signing-view DOM rendering (which uses
          // `justify-center`). Previously `boxX = x + 2 * scale` left-aligned
          // the check, which visibly shifted it left compared to the signing
          // preview — the shift grew proportionally with the field's distance
          // from the page top-left (scale amplification).
          const boxSize = Math.min(14 * scale, ptHeight - 4 * scale);
          const boxX = x + (ptWidth - boxSize) / 2;
          const boxY = y + (ptHeight - boxSize) / 2;
          page.drawRectangle({ x: boxX, y: boxY, width: boxSize, height: boxSize, borderColor: rgb(0, 0, 0), borderWidth: 1 });
          if (fieldValue === true || fieldValue === 'true') {
            page.drawLine({ start: { x: boxX + 2 * scale, y: boxY + boxSize / 2 }, end: { x: boxX + boxSize / 2, y: boxY + 2 * scale }, color: rgb(0, 0, 0), thickness: 1.5 });
            page.drawLine({ start: { x: boxX + boxSize / 2, y: boxY + 2 * scale }, end: { x: boxX + boxSize - 2 * scale, y: boxY + boxSize - 2 * scale }, color: rgb(0, 0, 0), thickness: 1.5 });
          }
          // Phase 62: checkbox labels are NEVER drawn in the final PDF
          // (DocuSign-style). Label data stays in the field definition.
        } else if (field.type === 'radio') {
          // Support both models:
          //   Legacy: { radioOptions: ['A','B'], fieldValue = 'A' }  → draw all options + filled circle next to selected
          //   New:    { groupName, optionValue, optionLabel }        → draw ONE circle; filled if group value === optionValue
          const isLegacy = Array.isArray(field.radioOptions) && field.radioOptions.length > 0 && !field.optionValue && !field.option_value;
          if (isLegacy) {
            const options = field.radioOptions;
            const selectedVal = fieldValue || field.selectedOption || '';
            const isVertical = (field.radioLayout || 'vertical') === 'vertical';
            const optSize = 8 * scale;
            let optX = x + 2 * scale;
            let optY = y + ptHeight - 10 * scale;
            options.forEach((opt) => {
              page.drawCircle({ x: optX + optSize / 2, y: optY - optSize / 2, size: optSize / 2, borderColor: rgb(0, 0, 0), borderWidth: 1 });
              if (selectedVal === opt) {
                page.drawCircle({ x: optX + optSize / 2, y: optY - optSize / 2, size: optSize / 2 - 2 * scale, color: rgb(0, 0, 0) });
              }
              page.drawText(opt, { x: optX + optSize + 3 * scale, y: optY - optSize / 2 - 3 * scale, size: 8 * scale, color: rgb(0, 0, 0) });
              if (isVertical) optY -= 14 * scale; else optX += 70 * scale;
            });
          } else {
            const group = getRadioGroupName(field);
            const optionValue = field.optionValue || field.option_value || field.id;
            const optionLabel = field.optionLabel || field.option_label || field.label || 'Option';
            const groupVal = fieldValues[group];
            const checked = groupVal === optionValue;
            // Only render the SELECTED option in the final PDF. Unchecked
            // options are omitted so the completed document stays clean.
            if (!checked) continue;
            // Phase 73: Center the radio circle horizontally within the field
            // bounding box (matches signing view). Previously `optX = x + 2`
            // placed it at the left edge → visible shift on the final PDF.
            const optSize = Math.min(12 * scale, ptHeight - 4 * scale);
            const optX = x + (ptWidth - optSize) / 2;
            const optY = y + (ptHeight - optSize) / 2;
            page.drawCircle({ x: optX + optSize / 2, y: optY + optSize / 2, size: optSize / 2, borderColor: rgb(0, 0, 0), borderWidth: 1 });
            page.drawCircle({ x: optX + optSize / 2, y: optY + optSize / 2, size: optSize / 2 - 2.5 * scale, color: rgb(0, 0, 0) });
            // Phase 56: Option label is NEVER drawn in the final PDF (DocuSign-style).
          }
        } else if (field.type === 'merge') {
          const mergeObj = field.merge_object || field.mergeObject || '';
          const mField = field.merge_field || field.mergeField || '';
          const fullKey = `${mergeObj}.${mField}`;
          const mergeValue = fieldValue || fieldValues[fullKey] || fieldValues[mField] || field.defaultValue || '';
          // Skip raw merge patterns ({{...}}) — they are UI placeholders, not real data.
          // Also skip when showLabelInPreview is false and no real value was resolved.
          const isMergePattern = /^\{\{.*\}\}$/.test(mergeValue);
          if (mergeValue && !isMergePattern) {
            const baseFs = (parseInt(field.style?.fontSize || '10') || 10) * scale;
            const hCap = Math.max(6, (ptHeight - 2 * scale) * 0.85);
            const wCap = Math.max(6, ptWidth / 2.5);
            const fSize = Math.max(6, Math.min(baseFs, hCap, wCap));
            const textW = measureTextWidth(mergeValue, fSize);
            const pad = 2 * scale;
            let xOff;
            if (field.style?.textAlign === 'center') xOff = Math.max(pad, (ptWidth - textW) / 2);
            else if (field.style?.textAlign === 'right') xOff = Math.max(pad, ptWidth - textW - pad);
            else xOff = pad;
            page.drawText(mergeValue.toString(), { x: x + xOff, y: y + (ptHeight / 2) - 3 * scale, size: fSize, font: helv, color: rgb(0, 0, 0) });
          }
        } else if (field.type === 'label' && field.text) {
          const baseFs = (parseInt(field.style?.fontSize || '12') || 12) * scale;
          const hCap = Math.max(6, (ptHeight - 2 * scale) * 0.85);
          const wCap = Math.max(6, ptWidth / 2.5);
          const labelSize = Math.max(6, Math.min(baseFs, hCap, wCap));
          const pad = 2 * scale;
          const textW = measureTextWidth(field.text, labelSize);
          let xOff;
          if (field.style?.textAlign === 'center') xOff = Math.max(pad, (ptWidth - textW) / 2);
          else if (field.style?.textAlign === 'right') xOff = Math.max(pad, ptWidth - textW - pad);
          else xOff = pad;
          page.drawText(field.text.toString(), { x: x + xOff, y: y + (ptHeight / 2) - (labelSize * 0.35), size: labelSize, font: helv, color: rgb(0, 0, 0) });
        }
      }

      const modifiedPdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const signFormData = new FormData();
      signFormData.append('signed_pdf', pdfBlob, `${docData.template_name}_signed.pdf`);
      signFormData.append('signer_name', formData.signer_name);
      signFormData.append('signer_email', formData.signer_email);
      signFormData.append('recipient_token', activeToken);
      signFormData.append('field_data', JSON.stringify(fieldValues));

      const response = await fetch(`${API_URL}/api/docflow/documents/${docData.id}/sign`, { method: 'POST', body: signFormData });
      if (!response.ok) throw new Error('Failed to sign document');

      toast.success('Document signed successfully!');
      await loadChildDocument(activeToken);
      setViewMode('signed');
      // Session signing complete — clear cached signature so a subsequent
      // signer on the same device cannot reuse it accidentally.
      clearSessionSig();
    } catch (error) {
      console.error('Error signing document:', error);
      toast.error(error.message || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  // Role-based actions for Approver/Reviewer on template-level documents
  const handleRoleAction = async (action, reason) => {
    if (action === 'reject' && !reason) {
      setShowRejectModal(true);
      return;
    }
    if (action === 'approve' && !showApproveConfirm) {
      setShowApproveConfirm(true);
      return;
    }
    try {
      setRoleAction(action === 'approve' ? 'approving' : action === 'reject' ? 'rejecting' : 'reviewing');
      const resp = await fetch(`${API_URL}/api/docflow/documents/${docData.id}/role-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          recipient_token: activeToken,
          name: formData.signer_name,
          email: formData.signer_email,
          reason: reason || undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || `Failed to ${action}`);
      }
      toast.success(action === 'approve' ? 'Document approved!' : action === 'reject' ? 'Document rejected!' : 'Review confirmed!');
      setShowRejectModal(false);
      setRejectReason('');
      setShowApproveConfirm(false);
      await loadChildDocument(activeToken);
    } catch (error) {
      toast.error(error.message || `Failed to ${action}`);
    } finally {
      setRoleAction(null);
    }
  };


  const getPdfViewUrl = () => {
    // Show signed version if doc is signed/completed/partially_signed (has been signed by signer)
    // Approver/Reviewer should always see the signed version
    const activeRole = (docData?.active_recipient?.role_type || docData?.active_recipient?.role || 'SIGN').toUpperCase();
    const isNonSigner = activeRole !== 'SIGN' && activeRole !== 'SIGNER';
    const hasSigned = ['signed', 'completed', 'partially_signed'].includes(docData?.status);
    const version = (hasSigned && (isNonSigner || ['signed', 'completed'].includes(docData?.status))) ? 'signed' : viewMode;
    return `${API_URL}/api/docflow/documents/${docData?.id}/view/${version}`;
  };

  const handleDownload = () => {
    const url = getPdfViewUrl();
    const version = ['signed', 'completed'].includes(docData?.status) ? 'signed' : viewMode;
    const filename = `${docData?.template_name}_${version}.pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50" data-testid="loading-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  // ── Generator View: Name/Email entry ──
  if (isGenerator && !docData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" data-testid="generator-view">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden">
          <div className="bg-indigo-600 p-6 text-center">
            <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white" data-testid="generator-title">
              {generatorInfo?.template_name || 'Document'}
            </h2>
            <p className="text-indigo-100 text-sm mt-1">Enter your details to access this document</p>
          </div>

          <div className="p-8">
            {verificationStep === 1 ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={formData.signer_name}
                    onChange={(e) => setFormData({ ...formData, signer_name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="Enter your full name"
                    data-testid="signer-name-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    value={formData.signer_email}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormData({ ...formData, signer_email: v });
                      // Live-clear the error as the user fixes it.
                      if (emailTouched) setEmailErr(validateEmail(v, { required: true }));
                    }}
                    onBlur={() => {
                      setEmailTouched(true);
                      setEmailErr(validateEmail(formData.signer_email, { required: true }));
                    }}
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={!!(emailErr && emailTouched)}
                    className={`w-full px-4 py-2.5 border rounded-lg outline-none transition-all ${emailErr && emailTouched ? 'border-rose-400 focus:ring-2 focus:ring-rose-400 bg-rose-50/40' : 'border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent'}`}
                    placeholder="you@example.com"
                    data-testid="signer-email-input"
                  />
                  {emailErr && emailTouched && (
                    <p className="text-[11px] text-rose-600 mt-1" data-testid="signer-email-error">{emailErr}</p>
                  )}
                </div>
                <button
                  onClick={handleInstantiate}
                  disabled={instantiating || !formData.signer_name || !formData.signer_email || !!validateEmail(formData.signer_email, { required: true })}
                  className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  data-testid="access-document-btn"
                >
                  {instantiating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  {generatorInfo?.require_auth ? 'Continue & Verify' : 'Access Document'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <p className="text-sm text-gray-600">A verification code has been sent to</p>
                  <p className="font-semibold text-gray-900">{formData.signer_email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 text-center">Enter 6-digit Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-3xl font-bold tracking-[0.5em] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="000000"
                    data-testid="otp-input"
                  />
                </div>
                <button
                  onClick={handleVerifyOtp}
                  disabled={verifying || otpCode.length < 6}
                  className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  data-testid="verify-otp-btn"
                >
                  {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  Verify & Open Document
                </button>
                <button
                  onClick={() => { setVerificationStep(1); setOtpCode(''); }}
                  className="w-full text-indigo-600 text-sm font-medium py-2 hover:underline"
                  data-testid="change-email-btn"
                >
                  <ArrowLeft className="h-4 w-4 inline mr-1" />
                  Change Details
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 81.67 — Document/Package voided full-screen banner ──
  if (voidedInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-rose-50 p-6" data-testid="document-voided-view">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center border border-rose-100">
          <div className="h-16 w-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            This {voidedInfo.entity} has been voided
          </h2>
          {voidedInfo.name && (
            <p className="text-sm text-gray-600 mb-3">
              <span className="font-semibold">{voidedInfo.name}</span>
            </p>
          )}
          <p className="text-sm text-gray-600">
            The sender has cancelled this signing request. You no longer have access to view or sign this {voidedInfo.entity}.
          </p>
          {voidedInfo.reason && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-left">
              <div className="text-xs font-semibold text-rose-800 mb-1">Reason for cancellation:</div>
              <div className="text-sm text-rose-700">{voidedInfo.reason}</div>
            </div>
          )}
          {voidedInfo.voidedAt && (
            <div className="mt-3 text-xs text-gray-400">
              Cancelled on {new Date(voidedInfo.voidedAt).toLocaleString()}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-6">
            If you believe this was a mistake, please contact the sender directly.
          </p>
        </div>
      </div>
    );
  }

  // ── Document not found ──
  if (!docData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50" data-testid="not-found-view">
        <div className="text-center">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Document Not Found</h2>
          <p className="text-gray-600">This document may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  // ── Document View ──
  // SMS Disclaimer gate: shown as full screen overlay when sms_mode=true
  // and recipient hasn't acknowledged yet. Blocks all document content.
  if (!accessRevoked && smsRequired && smsDeclined && activeToken) {
    return <SmsDeclineScreen onReconsider={() => setSmsDeclined(false)} />;
  }
  if (!accessRevoked && smsRequired && !smsAcknowledged && activeToken) {
    return (
      <SmsDisclaimerModal
        token={activeToken}
        scope="document"
        documentType="document"
        smsMode={smsModeEnabled}
        phoneMasked={smsPhoneMasked}
        documentName={docData?.template_name}
        documentId={docData?.id}
        recipientId={docData?.active_recipient?.id}
        recipientName={docData?.active_recipient?.name || formData?.signer_name}
        recipientEmail={docData?.active_recipient?.email}
        companyName={docData?.tenant_name}
        onContinue={() => {
          // Phase 81.83 — persist per-recipient acceptance.
          const ar = docData?.active_recipient || {};
          const ackKey = buildSmsAckKey({
            scope: 'doc',
            id: docData?.id,
            token: activeToken,
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

  // Consent gate: shown once per signer session (only when verified)
  const shouldShowConsent = sessionKey && !consentAccepted &&
    docData?.status !== 'completed' && docData?.status !== 'signed';

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8" data-testid="document-view">
      {/* Phase 80: Access-revoked blocking popup. Overlays the whole page
          with click-blocking backdrop when the sender voids this recipient. */}
      {accessRevoked && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" data-testid="access-revoked-modal">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-rose-50 px-5 py-4 flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900">Signing request cancelled</h3>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700 space-y-2">
              <p>This signing request has been <strong>voided by the sender</strong>.</p>
              <p className="text-xs text-gray-500">
                You no longer have access to sign this document. If you believe this was a mistake, please contact the sender directly.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end">
              <button
                onClick={() => window.close()}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
                data-testid="access-revoked-close"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* E-Sign Disclosure / Review and Continue */}
      <ConsentScreen
        open={shouldShowConsent && !accessRevoked }
        sessionKey={sessionKey}
        documentName={docData?.template_name}
        documentId={docData?.id}
        recipientName={formData?.signer_name}
        recipientEmail={docData?.active_recipient?.email}
        token={activeToken}
        companyName={docData?.tenant_name}
        onContinue={() => setConsentAccepted(true)}
        submitting={signing}
      />
      <div className={`max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 ${accessRevoked ? 'pointer-events-none select-none opacity-60' : ''}`}>
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1 order-2 sm:order-1">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1.5 sm:mb-2 break-words" data-testid="document-title">
                {docData.template_name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-600">
                <span>Status: <span className={`font-semibold ${
                  docData.status === 'signed' || docData.status === 'completed' ? 'text-green-600' :
                  docData.status === 'sent' || docData.status === 'viewed' ? 'text-blue-600' :
                  'text-gray-600'
                }`} data-testid="document-status">{docData.status}</span></span>
                {docData.recipient_name && (
                  <span className="truncate max-w-full">Recipient: {docData.recipient_name}</span>
                )}
              </div>
            </div>
            <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 shrink-0 flex-wrap order-1 sm:order-2">
              {/* Phase 74: Sender info — read-only chip showing who sent the document */}
              {docData.sender && (docData.sender.name || docData.sender.email) && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] sm:text-xs text-slate-700 max-w-full sm:max-w-[280px]"
                  data-testid="document-sender-chip"
                  title={`From: ${docData.sender.name}${docData.sender.email ? ` <${docData.sender.email}>` : ''}`}
                >
                  <span className="font-medium text-slate-500 uppercase tracking-wide shrink-0">From</span>
                  <span className="truncate font-semibold text-slate-800 min-w-0" data-testid="sender-name">
                    {docData.sender.name || docData.sender.email}
                  </span>
                  {docData.sender.email && docData.sender.name && (
                    <span className="truncate text-slate-500 hidden sm:inline min-w-0" data-testid="sender-email">
                      ({docData.sender.email})
                    </span>
                  )}
                </div>
              )}
              {(docData.status === 'signed' || docData.status === 'completed') && (
                <div className="flex items-center gap-1.5 text-green-600" data-testid="signed-badge">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-sm font-semibold">Signed</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Signed Banner */}
        {(docData.status === 'signed' || docData.status === 'completed') && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Document Signed</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-500">
                  Signed on {new Date(docData.signed_at || Date.now()).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full sm:w-auto"
                data-testid="download-signed-btn"
              >
                <Download className="h-4 w-4" />
                <span>Download Signed PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Guided signing header — Start / Next / Finish bar (DocuSign-like) */}
        {docData.status !== 'completed' && docData.status !== 'signed' && docData?.can_sign && isVerified && (() => {
          const role = (docData?.active_recipient?.role_type || docData?.active_recipient?.role || 'SIGN').toUpperCase();
          const isSigner = role === 'SIGN' || role === 'SIGNER';
          const recipientDone = ['completed', 'signed', 'approved', 'reviewed', 'declined'].includes(docData?.active_recipient?.status);
          if (!isSigner || recipientDone) return null;

          const pendingCount = pendingFieldIds.length;
          const progressPct = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 0;
          // Start/Next appear whenever there are ANY navigable (interactive)
          // fields with room to advance — required OR optional. Finish still
          // depends only on required-field completion.
          const showStart = hasAnyNavigable && !guidedStarted && navUnfilledCount > 0;
          const showNext  = hasAnyNavigable && guidedStarted  && navUnfilledCount > 0;
          // Previous: enabled once we're somewhere past the first navigable field.
          const prevCurrentIdx = activeFieldId ? (navigableFieldIds || []).indexOf(activeFieldId) : -1;
          const showPrev = hasAnyNavigable && guidedStarted && prevCurrentIdx > 0;
          const canFinish = (guidedAllComplete || !hasAnyRequired) && !signing && canSign();

          return (
            <div
              className="sticky top-0 z-30 bg-white rounded-lg shadow-sm border border-gray-200 mb-4"
              data-testid="guided-signing-header"
            >
              <div className="p-2.5 sm:p-3 flex items-center justify-between flex-wrap gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-0">
                    <span
                      className={`inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full text-xs font-semibold shrink-0 ${
                        (guidedAllComplete || !hasAnyRequired)
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}
                      data-testid="guided-pending-count"
                    >
                      {pendingCount}
                    </span>
                    <span className="text-gray-700 font-medium truncate min-w-0">
                      {!hasAnyRequired
                        ? 'No required fields — click Finish to complete'
                        : pendingCount === 0
                          ? 'All required fields completed'
                          : `${completedCount} of ${totalRequired} required completed — ${pendingCount} left`}
                    </span>
                  </div>
                  {/* Phase 65: "Your Tasks" strip — compact DocuSign-style task
                      counter scoped to the current recipient. Shows total
                      assigned interactive fields (required + optional) and
                      how many are filled. Hidden when there are none. */}
                  {hasAnyNavigable && (
                    <div
                      className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 border-l border-gray-200 pl-3 whitespace-nowrap"
                      data-testid="your-tasks-strip"
                      title="Fields assigned to you"
                    >
                      <span className="font-semibold text-gray-600">Your Tasks:</span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${
                          navUnfilledCount === 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-50 text-slate-700'
                        }`}
                        data-testid="your-tasks-count"
                      >
                        {navigableFieldIds.length - navUnfilledCount}
                        <span className="text-gray-400">/</span>
                        {navigableFieldIds.length}
                        <span className="text-gray-400 text-[10px] ml-0.5">filled</span>
                      </span>
                    </div>
                  )}
                  {/* Phase 72: Compact signer-identity chip — replaces the
                      left-sidebar "Signer Information" card to give the
                      document full-width canvas. Hovering reveals full name +
                      email in a tooltip for quick reference. */}
                  {(formData?.signer_name || formData?.signer_email) && (
                    <div
                      className="hidden md:flex items-center gap-1.5 text-xs text-gray-600 border-l border-gray-200 pl-3 max-w-[260px] cursor-default"
                      data-testid="signer-info-chip"
                      title={`${formData.signer_name || ''}${formData.signer_email ? ` • ${formData.signer_email}` : ''}`}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold uppercase shrink-0">
                        {(formData.signer_name || formData.signer_email || '?').trim().charAt(0)}
                      </span>
                      <span className="truncate font-medium text-gray-700">
                        {formData.signer_name || formData.signer_email}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 w-full sm:w-auto justify-end flex-wrap">
                  {showPrev && (
                    <button
                      onClick={handlePrevGuided}
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm min-h-[40px]"
                      data-testid="guided-prev-btn"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </button>
                  )}
                  {showStart && (
                    <button
                      onClick={handleStartGuided}
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm min-h-[40px]"
                      data-testid="guided-start-btn"
                    >
                      <Play className="h-4 w-4" />
                      <span>Start</span>
                    </button>
                  )}
                  {showNext && (
                    <button
                      onClick={handleNextGuided}
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm min-h-[40px]"
                      data-testid="guided-next-btn"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={async() => {
                      setSignerConfirmed(true);
                      await handleSign();
                    }}
                    disabled={!canFinish}
                    className={`inline-flex items-center gap-1 sm:gap-1.5 px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all shadow-sm min-h-[40px] ${
                      canFinish
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                    data-testid="guided-finish-btn"
                    title={
                      !canFinish && !guidedAllComplete
                        ? 'Fill all required fields first'
                        : undefined
                    }
                  >
                    {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    <span>{signing ? 'Signing...' : 'Finish'}</span>
                  </button>
                </div>
              </div>
              {hasAnyRequired && (
                <div className="h-1 w-full bg-gray-100 rounded-b-lg overflow-hidden" data-testid="guided-progress-bar">
                  <div
                    className={`h-full transition-all duration-300 ${progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-1 gap-6">
          {/* Phase 72: Left sidebar "Signer Information" panel removed.
              Signer name + email now live as a compact chip in the guided
              header (`data-testid="signer-info-chip"`). This frees the
              entire width for the document. The hidden `complete-signing-btn`
              button was kept (moved into a hidden wrapper below) so existing
              automation hooks don't break. */}
          <div className="hidden" aria-hidden="true">
            <button
              onClick={() => setShowFinishConfirm(true)}
              disabled={!canSign() || signing || !isVerified}
              data-testid="complete-signing-btn"
            >
              {signing ? 'Signing...' : 'Complete Signing'}
            </button>
            <span data-testid="signer-name-display">{formData.signer_name}</span>
            <span data-testid="signer-email-display">{formData.signer_email}</span>
          </div>

          {/* Document Viewer */}
          {(() => {
            return (
          <div className="col-span-1">
            <div
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative"
              style={{ height: 'min(80vh, 800px)', minHeight: '520px' }}
            >
              {/* Verification Overlay (for direct/email links that still need auth) */}
              {!isVerified && (
                <div className="absolute inset-0 z-40 bg-gray-900/10 backdrop-blur-md flex items-center justify-center p-6">
                  <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden">
                    <div className="bg-indigo-600 p-6 text-center">
                      <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Eye className="h-8 w-8 text-white" />
                      </div>
                      <h2 className="text-xl font-bold text-white">Document Access Verification</h2>
                      <p className="text-indigo-100 text-sm mt-1">Please verify your identity to view and sign this document</p>
                    </div>
                    <div className="p-8">
                      {verificationStep === 1 ? (
                        <div className="space-y-4">
                          {(() => {
                            const activeR = docData?.active_recipient || {};
                            const namePreFilled = !!(activeR.name);
                            const emailPreFilled = !!(activeR.email);
                            return (
                              <>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                                  <input
                                    type="text"
                                    value={formData.signer_name}
                                    onChange={(e) => !namePreFilled && setFormData({ ...formData, signer_name: e.target.value })}
                                    disabled={namePreFilled}
                                    className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${namePreFilled ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''}`}
                                    placeholder="Enter your full name"
                                    data-testid="signer-name-input"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                                  <input
                                    type="email"
                                    value={formData.signer_email}
                                    onChange={(e) => {
                                      if (emailPreFilled) return;
                                      const v = e.target.value;
                                      setFormData({ ...formData, signer_email: v });
                                      if (emailTouched) setEmailErr(validateEmail(v, { required: true }));
                                    }}
                                    onBlur={() => {
                                      if (emailPreFilled) return;
                                      setEmailTouched(true);
                                      setEmailErr(validateEmail(formData.signer_email, { required: true }));
                                    }}
                                    disabled={emailPreFilled}
                                    autoComplete="email"
                                    inputMode="email"
                                    aria-invalid={!!(emailErr && emailTouched)}
                                    className={`w-full px-4 py-2.5 border rounded-lg outline-none transition-all ${
                                      emailPreFilled
                                        ? 'bg-gray-100 text-gray-600 cursor-not-allowed border-gray-300'
                                        : (emailErr && emailTouched)
                                          ? 'border-rose-400 focus:ring-2 focus:ring-rose-400 bg-rose-50/40'
                                          : 'border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    }`}
                                    placeholder="you@example.com"
                                    data-testid="signer-email-input"
                                  />
                                  {!emailPreFilled && emailErr && emailTouched && (
                                    <p className="text-[11px] text-rose-600 mt-1" data-testid="signer-email-error">{emailErr}</p>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                          <button
                            onClick={() => {
                              // Phase 81.28 — pre-validate before triggering OTP send.
                              const err = validateEmail(formData.signer_email, { required: true });
                              if (err) {
                                setEmailTouched(true);
                                setEmailErr(err);
                                toast.error(err);
                                return;
                              }
                              handleSendOtp();
                            }}
                            disabled={verifying || !formData.signer_name || !formData.signer_email || !!validateEmail(formData.signer_email, { required: true })}
                            className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            data-testid="send-otp-btn"
                          >
                            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                            Send Verification Code
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-center mb-6">
                            <p className="text-sm text-gray-600">A verification code has been sent to</p>
                            <p className="font-semibold text-gray-900">{formData.signer_email}</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5 text-center">Enter 6-digit Code</label>
                            <input
                              type="text"
                              maxLength={6}
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                              className="w-full text-center text-3xl font-bold tracking-[0.5em] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              placeholder="000000"
                              data-testid="otp-input"
                            />
                          </div>
                          <button
                            onClick={handleVerifyOtp}
                            disabled={verifying || otpCode.length < 6}
                            className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            data-testid="verify-otp-btn"
                          >
                            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                            Verify & Open Document
                          </button>
                          <button
                            onClick={() => setVerificationStep(1)}
                            className="w-full text-indigo-600 text-sm font-medium py-2 hover:underline"
                            data-testid="change-email-btn"
                          >
                            Change Email Address
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {isVerified && (() => {
                const activeRole = (docData?.active_recipient?.role_type || docData?.active_recipient?.role || 'SIGN').toUpperCase();
                const isCompleted = ['completed', 'signed'].includes(docData.status);
                const isDeclined = docData.status === 'declined';
                const isApprover = activeRole === 'APPROVE_REJECT';
                const isReviewer = activeRole === 'VIEW_ONLY' || activeRole === 'REVIEWER';
                const recipientStatus = docData?.active_recipient?.status;
                const recipientDone = ['completed', 'signed', 'approved', 'reviewed', 'declined'].includes(recipientStatus);

                // Status banner for completed actions
                const StatusBanner = () => {
                  if (!recipientDone && !isCompleted && !isDeclined) return null;
                  const statusConfig = {
                    approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle className="h-5 w-5 text-emerald-600" /> },
                    reviewed: { label: 'Review Completed', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: <CheckCircle className="h-5 w-5 text-blue-600" /> },
                    signed: { label: 'Signed', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle className="h-5 w-5 text-emerald-600" /> },
                    declined: { label: 'Rejected', bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: <XCircle className="h-5 w-5 text-red-600" /> },
                  };
                  const st = statusConfig[recipientStatus] || statusConfig[isDeclined ? 'declined' : 'signed'] || statusConfig['signed'];
                  const rejectComment = docData?.reject_reason || docData?.active_recipient?.reject_reason;
                  return (
                    <div className={`flex flex-col px-5 py-3 ${st.bg} border ${st.text} rounded-lg mb-3`} data-testid="action-status-banner">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {st.icon}
                          <span className="font-semibold text-sm">{st.label}</span>
                        </div>
                        <span className="text-xs opacity-70">{new Date(docData?.active_recipient?.action_at || Date.now()).toLocaleString()}</span>
                      </div>
                      {rejectComment && (
                        <div className="mt-2 pt-2 border-t border-red-200/50 text-sm">
                          <span className="font-medium">Reason: </span>{rejectComment}
                        </div>
                      )}
                    </div>
                  );
                };

                // Approver/Reviewer action header
                const ActionHeader = () => {
                  if (recipientDone || isCompleted || isDeclined) return null;
                  if (isApprover) {
                    return (
                      <div className="flex items-center justify-between px-5 py-3 bg-white border border-gray-200 rounded-lg mb-3" data-testid="approver-actions">
                        <p className="text-sm text-gray-600 font-medium">Review the document, then approve or reject</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleRoleAction('reject')} disabled={!!roleAction}
                            className="px-5 py-2 bg-white border-2 border-red-500 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                            data-testid="reject-btn">
                            {roleAction === 'rejecting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Reject
                          </button>
                          <button onClick={() => handleRoleAction('approve')} disabled={!!roleAction}
                            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors"
                            data-testid="approve-btn">
                            {roleAction === 'approving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Approve
                          </button>
                        </div>
                      </div>
                    );
                  }
                  if (isReviewer) {
                    return (
                      <div className="flex items-center justify-between px-5 py-3 bg-white border border-gray-200 rounded-lg mb-3" data-testid="reviewer-actions">
                        <p className="text-sm text-gray-600 font-medium">Review the document below, then confirm</p>
                        <button onClick={() => handleRoleAction('review')} disabled={!!roleAction}
                          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors"
                          data-testid="confirm-review-btn">
                          {roleAction === 'reviewing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          Confirm Review
                        </button>
                      </div>
                    );
                  }
                  return null;
                };

                // For non-signer roles or completed docs, show read-only PDF with action header
                if (isApprover || isReviewer || isCompleted || isDeclined || recipientDone) {
                  return (
                    <div className="h-full flex flex-col" style={{ minHeight: '70vh' }}>
                      <StatusBanner />
                      <ActionHeader />
                      <div className="flex-1 relative rounded-lg overflow-hidden border border-gray-200">
                        <iframe
                          src={`${getPdfViewUrl()}#toolbar=1&navpanes=0&scrollbar=1`}
                          className="w-full h-full border-0"
                          style={{ minHeight: '60vh' }}
                          title="Document"
                          data-testid="pdf-iframe"
                        />
                      </div>
                    </div>
                  );
                }

                // Default: Signer view
                return (
                  <InteractiveDocumentViewer
                    pdfUrl={getPdfViewUrl()}
                    fields={(template?.field_placements || []).map((f) => {
                      const activeRcpt = docData?.active_recipient;
                      const assignedIds = activeRcpt?.assigned_field_ids || [];
                      const hasAssignments = assignedIds.length > 0;
                      const fieldAssignedTo = f.assigned_to || f.recipient_id;
                      let isAssigned = true;
                      let hadExplicitOwnership = false;
                      if (fieldAssignedTo) {
                        // Field has explicit assignment — check it matches current recipient
                        hadExplicitOwnership = true;
                        isAssigned = fieldAssignedTo === activeRcpt?.template_recipient_id
                                  || fieldAssignedTo === activeRcpt?.id;
                      } else if (hasAssignments && interactiveTypes.has(f.type)) {
                        // Document-level explicit assignment list (per recipient)
                        hadExplicitOwnership = true;
                        isAssigned = assignedIds.includes(f.id);
                      }

                      if (isAssigned) {
                        // Phase 81.47/81.48 — author-time readOnly fields
                        // stay visible to their owner as printed text
                        // (not editable).
                        const authorReadOnly = f.readOnly === true;
                        return authorReadOnly
                          ? { ...f, readOnly: true }
                          : { ...f, field_disabled: false, field_hint: 'Complete this field' };
                      }

                      // Phase 81.48 — REVERT Phase 81.47's hide-from-non-owners
                      // rule. Author-time Read-Only fields are ALWAYS visible
                      // to every recipient as non-editable printed text. This
                      // matches the user's spec: "Read Only Fields Must Always
                      // Be Visible." Owner-ship affects editability elsewhere,
                      // not visibility of readOnly fields.
                      if (f.readOnly === true) {
                        return { ...f, readOnly: true };
                      }

                      // Phase 81.18 — Merge fields (plain OR converted-to-input)
                      // are ALWAYS visible to every recipient — they represent
                      // contract data that all signers should see (CRM merge
                      // values are read-only by definition; converted merges
                      // are filled by the assigned signer but the entered
                      // value still appears for the others). Render as
                      // read-only when this signer doesn't own it.
                      if ((f.type || f.field_type) === 'merge') {
                        return { ...f, readOnly: true };
                      }

                      // Phase 81.30 — Unassigned interactive field. If a prior
                      // signer (or the system) has filled a value, surface it
                      // READ-ONLY so this recipient can see what's already
                      // been done. Otherwise hide completely (DocuSign-style:
                      // signers should never see another signer's empty
                      // placeholder). Honours the radio-group value model.
                      if (interactiveTypes.has(f.type)) {
                        if (hadExplicitOwnership) {
                          let hasValue = false;
                          const t = f.type || f.field_type;
                          if (t === 'radio') {
                            const group = f.groupName || f.group_name;
                            const groupVal = group ? fieldValues[group] : undefined;
                            const optionValue = f.optionValue || f.option_value || f.id;
                            hasValue = groupVal !== undefined && groupVal !== '' && groupVal === optionValue;
                            if (!hasValue && Array.isArray(f.radioOptions) && f.radioOptions.length > 0) {
                              const v = fieldValues[f.id];
                              hasValue = v !== undefined && v !== null && v !== '';
                            }
                          } else if (t === 'checkbox') {
                            hasValue = fieldValues[f.id] === true || fieldValues[f.id] === 'true';
                          } else {
                            const v = fieldValues[f.id];
                            hasValue = v !== undefined && v !== null && v !== '';
                          }
                          return hasValue
                            ? { ...f, readOnly: true }
                            : { ...f, field_hidden: true };
                        }
                        // Truly orphaned (no recipient has any assignment AND
                        // the field has no assigned_to) → keep visible to the
                        // active signer so the doc isn't blocked by a missing
                        // sender configuration. Phase 81.1's original case.
                        return { ...f, field_disabled: false, field_hint: 'Complete this field' };
                      }

                      return { ...f, readOnly: true };
                    })}
                    onFieldsChange={handleFieldsChange}
                    readOnly={!docData?.can_sign}
                    showSignatureModal={showSignatureModal}
                    externalFieldValues={fieldValues}
                    activeFieldId={activeFieldId}
                    onHiddenFieldsChange={setHiddenFieldIds}
                    onFieldClick={syncGuidedFromClick}
                    onEnterNext={handleNextGuided}
                    scrollToken={scrollToken}
                  />
                );
              })()}
            </div>
          </div>
            );
          })()}
        </div>
      </div>

      <SignatureModal
        isOpen={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSave={handleSignatureSave}
        fieldId={currentFieldId}
        isInitials={isInitialsField}
        signerName={formData?.signer_name || ''}
        fieldStyle={currentFieldStyle}
        fieldWidth={currentFieldDims.width}
        fieldHeight={currentFieldDims.height}
        assignedSignatureFieldIds={(() => {
          // Phase 66: Correct owner-only filter.
          // Source of truth for "what's mine" is `active_recipient.assigned_field_ids`
          // (the same signal used by the field mapping above). Template
          // placements don't carry `assigned_to` on this endpoint, so the
          // previous `f.assigned_to === recipientId` check was silently
          // returning every field → inflated "7 fields" count.
          const fieldType = isInitialsField ? 'initials' : 'signature';
          const activeRcpt = docData?.active_recipient;
          const assignedIds = activeRcpt?.assigned_field_ids || [];
          const hasAssignments = assignedIds.length > 0;
          const placements = template?.field_placements || [];
          // Legacy back-compat: if template has per-field `assigned_to`
          // (newer data shape) honour it as a secondary signal.
          const tplRid = activeRcpt?.template_recipient_id;
          const activeId = activeRcpt?.id;
          return placements
            .filter(f => {
              if (f.type !== fieldType) return false;
              const fieldAssignedTo = f.assigned_to || f.recipient_id;
              if (fieldAssignedTo) {
                return fieldAssignedTo === tplRid || fieldAssignedTo === activeId;
              }
              if (hasAssignments) {
                return assignedIds.includes(f.id);
              }
              // No assignment system at all → legacy behavior (everyone sees all).
              return true;
            })
            .map(f => f.id);
        })()}
      />

      {/* Signature reuse prompt — lightweight popover shown on subsequent signature fields */}
      <SignatureReusePrompt
        open={reusePrompt.open}
        dataUrl={getSignature(reusePrompt.isInitials ? 'initials' : 'signature')}
        type={reusePrompt.isInitials ? 'initials' : 'signature'}
        onClose={() => setReusePrompt({ open: false, fieldId: null, isInitials: false })}
        onReuse={handleReuseAccept}
        onDrawNew={handleReuseDrawNew}
      />

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="reject-reason-modal">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Reject Document</h3>
                <p className="text-xs text-gray-500">Please provide a reason for rejection</p>
              </div>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection (required)..."
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              data-testid="reject-reason-input"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }} className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button
                onClick={() => handleRoleAction('reject', rejectReason)}
                disabled={!rejectReason.trim() || !!roleAction}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                data-testid="confirm-reject-btn"
              >
                {roleAction === 'rejecting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {showApproveConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="approve-confirm-modal">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Approve Document</h3>
                <p className="text-xs text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">Are you sure you want to approve this document?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowApproveConfirm(false)} className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
                No
              </button>
              <button
                onClick={() => handleRoleAction('approve')}
                disabled={!!roleAction}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                data-testid="confirm-approve-btn"
              >
                {roleAction === 'approving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Yes, Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finish-signing confirmation dialog (replaces acknowledgement checkbox) */}
      <ConfirmSubmitDialog
        open={showFinishConfirm}
        submitting={signing}
        title="Confirm signing"
        message="You have completed all required fields. Are you sure you want to submit your signature?"
        confirmLabel="Confirm & Sign"
        confirmTone="indigo"
        onCancel={() => setShowFinishConfirm(false)}
        onConfirm={async () => {
          setSignerConfirmed(true);
          await handleSign();
          setShowFinishConfirm(false);
        }}
      />
    </div>
  );
};

export default PublicDocumentViewEnhanced;
