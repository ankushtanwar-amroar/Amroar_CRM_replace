import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, FileText, Download, Eye, Loader2, Send, ArrowLeft, XCircle, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PDFDocument, rgb } from 'pdf-lib';
import InteractiveDocumentViewer, { formatLocalMMDDYYYY, formatDate, DATE_FORMATS, getRadioGroupName } from '../components/InteractiveDocumentViewer';
import SignatureModal from '../components/SignatureModal';
import SignatureReusePrompt from '../components/SignatureReusePrompt';
import ConsentScreen, { hasAcceptedConsent } from '../components/ConsentScreen';
import ConfirmSubmitDialog from '../components/ConfirmSubmitDialog';
import useSessionSignature from '../hooks/useSessionSignature';
import useGuidedFillIn from '../hooks/useGuidedFillIn';

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
  const [template, setTemplate] = useState({ field_placements: [], recipients: [] });
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [viewMode, setViewMode] = useState('unsigned');
  const [fieldValues, setFieldValues] = useState({});
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentFieldId, setCurrentFieldId] = useState(null);
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
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStep, setVerificationStep] = useState(1); // 1: Details, 2: OTP
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [instantiating, setInstantiating] = useState(false);

  const signingTypes = new Set(['signature', 'initials', 'date']);
  const interactiveTypes = new Set(['signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown']);
  const templateRecipients = template?.recipients || [];

  // Session signature cache — keyed by document token + signer email so
  // different signers on the same device do NOT share cached signatures.
  const sessionKey = formData.signer_email ? `${token}::${formData.signer_email.toLowerCase()}` : null;
  const { getSignature, setSignature, clearAll: clearSessionSig } = useSessionSignature(sessionKey);

  // Consent screen state — required BEFORE the document view for all roles.
  const [consentAccepted, setConsentAccepted] = useState(false);
  useEffect(() => {
    // Hydrate acceptance state when the session key becomes known
    if (sessionKey) setConsentAccepted(hasAcceptedConsent(sessionKey));
  }, [sessionKey]);

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
        if (!resp.ok) return;
        const data = await resp.json();
        if (cancelled) return;
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
    if (!formData.signer_name || !formData.signer_email) {
      toast.error('Please enter your name and email');
      return;
    }

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
        const err = await response.json();
        throw new Error(err.detail || 'Failed to create document instance');
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
  const openSignatureModalDirect = (fieldId, isInitials = false) => {
    setCurrentFieldId(fieldId);
    setIsInitialsField(isInitials);
    setSignatureModalOpen(true);
  };

  const showSignatureModal = (fieldId, isInitials = false) => {
    // If the field is already signed, just reopen the full modal (legacy behavior).
    if (fieldValues[fieldId]) {
      openSignatureModalDirect(fieldId, isInitials);
      return;
    }
    // If a cached signature exists for this type → show reuse prompt first.
    const cached = getSignature(isInitials ? 'initials' : 'signature');
    if (cached) {
      setReusePrompt({ open: true, fieldId, isInitials });
      return;
    }
    openSignatureModalDirect(fieldId, isInitials);
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
    const { fieldId, isInitials } = reusePrompt;
    setReusePrompt({ open: false, fieldId: null, isInitials: false });
    openSignatureModalDirect(fieldId, isInitials);
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

    const requiredFields = (template?.field_placements || []).filter(f => {
      if (!interactiveTypes.has(f.type)) return false;
      if (!f.required) return false;
      
      const fieldAssignedTo = f.assigned_to || f.recipient_id;
      if (fieldAssignedTo) {
        return fieldAssignedTo === activeRcpt?.template_recipient_id || fieldAssignedTo === activeRcpt?.id;
      }
      if (hasAssignments) {
        return assignedIds.includes(f.id);
      }
      return true;
    });

    return requiredFields.every(field => {
      const v = fieldValues[field.id];
      if (field.type === 'checkbox') return v === true || v === 'true';
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
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
          // Match the frontend signing-page clamp (resolveResponsiveFontSize)
          // so text never outgrows the author's rectangle in the final PDF.
          const baseFs = (parseInt(field.style?.fontSize || '10') || 10) * scale;
          const hCap = Math.max(6, (ptHeight - 4) * 0.70);
          const wCap = Math.max(6, ptWidth / 3);
          const fSize = Math.max(6, Math.min(baseFs, hCap, wCap, 24));
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
          if (mergeValue) {
            const baseFs = (parseInt(field.style?.fontSize || '10') || 10) * scale;
            const hCap = Math.max(6, (ptHeight - 4) * 0.70);
            const wCap = Math.max(6, ptWidth / 3);
            const fSize = Math.max(6, Math.min(baseFs, hCap, wCap, 24));
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
          const hCap = Math.max(6, (ptHeight - 4) * 0.70);
          const wCap = Math.max(6, ptWidth / 3);
          const labelSize = Math.max(6, Math.min(baseFs, hCap, wCap, 24));
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
                    onChange={(e) => setFormData({ ...formData, signer_email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="you@example.com"
                    data-testid="signer-email-input"
                  />
                </div>
                <button
                  onClick={handleInstantiate}
                  disabled={instantiating || !formData.signer_name || !formData.signer_email}
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
  // Consent gate: shown once per signer session (only when verified)
  const shouldShowConsent = isVerified && sessionKey && !consentAccepted &&
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
        open={shouldShowConsent && !accessRevoked}
        sessionKey={sessionKey}
        documentName={docData?.template_name}
        recipientName={formData?.signer_name}
        onContinue={() => setConsentAccepted(true)}
      />
      <div className={`max-w-7xl mx-auto px-3 sm:px-4 ${accessRevoked ? 'pointer-events-none select-none opacity-60' : ''}`}>
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
                      onClick={goToPrevField}
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm min-h-[40px]"
                      data-testid="guided-prev-btn"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </button>
                  )}
                  {showStart && (
                    <button
                      onClick={startGuided}
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm min-h-[40px]"
                      data-testid="guided-start-btn"
                    >
                      <Play className="h-4 w-4" />
                      <span>Start</span>
                    </button>
                  )}
                  {showNext && (
                    <button
                      onClick={goToNextField}
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
                    <CheckCircle className="h-4 w-4" />
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
                                    onChange={(e) => !emailPreFilled && setFormData({ ...formData, signer_email: e.target.value })}
                                    disabled={emailPreFilled}
                                    className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${emailPreFilled ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''}`}
                                    placeholder="you@example.com"
                                    data-testid="signer-email-input"
                                  />
                                </div>
                              </>
                            );
                          })()}
                          <button
                            onClick={handleSendOtp}
                            disabled={verifying || !formData.signer_name || !formData.signer_email}
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
                      if (fieldAssignedTo) {
                        // Field has explicit assignment — check it matches current recipient
                        isAssigned = fieldAssignedTo === activeRcpt?.template_recipient_id || fieldAssignedTo === activeRcpt?.id;
                      } else if (hasAssignments && interactiveTypes.has(f.type)) {
                        isAssigned = assignedIds.includes(f.id);
                      }
                      
                      if (isAssigned) {
                        return { ...f, field_disabled: false, field_hint: 'Complete this field' };
                      }
                      
                      // Unassigned field: hide interactive fields completely from other recipients
                      // during active signing flow, so they don't see each other's fields.
                      if (interactiveTypes.has(f.type)) {
                        return { ...f, field_hidden: true };
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
          // Satisfy legacy gate used by a couple of older render paths,
          // then close the dialog and run the actual sign flow.
          setSignerConfirmed(true);
          setShowFinishConfirm(false);
          await handleSign();
        }}
      />
    </div>
  );
};

export default PublicDocumentViewEnhanced;
