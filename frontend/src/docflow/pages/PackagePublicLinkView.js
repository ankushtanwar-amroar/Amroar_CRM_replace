import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Package, FileText, CheckCircle2, Loader2, AlertCircle,
  XCircle, ChevronRight, User, Mail, Download,
  Clock, ArrowRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import InteractiveDocumentViewer from '../components/InteractiveDocumentViewer';
import SignatureModal from '../components/SignatureModal';

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
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentSignFieldId, setCurrentSignFieldId] = useState(null);
  const [currentSignDocId, setCurrentSignDocId] = useState(null);
  const [isInitialsField, setIsInitialsField] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Completed state
  const [completedResult, setCompletedResult] = useState(null);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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
    if (!userName.trim() || !userEmail.trim()) {
      toast.error('Please enter your name and email');
      return;
    }

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
    return templateFieldsMap[doc.template_id] || [];
  }, [templateFieldsMap]);

  const handleDocFieldsChange = useCallback((docId, values) => {
    setDocFieldValues(prev => ({
      ...prev,
      [docId]: { ...(prev[docId] || {}), ...values },
    }));
  }, []);

  const openSignatureModal = useCallback((docId, fieldId, isInitials = false) => {
    setCurrentSignDocId(docId);
    setCurrentSignFieldId(fieldId);
    setIsInitialsField(isInitials);
    setSignatureModalOpen(true);
  }, []);

  const handleSignatureSave = useCallback((fieldId, sigData) => {
    if (!currentSignDocId) return;
    setDocFieldValues(prev => ({
      ...prev,
      [currentSignDocId]: { ...(prev[currentSignDocId] || {}), [fieldId]: sigData },
    }));
  }, [currentSignDocId]);

  // Check if all required fields are filled
  const allRequiredFieldsComplete = useMemo(() => {
    const documents = pkg?.documents || [];
    const signingTypes = new Set(['signature', 'initials', 'date']);

    for (const doc of documents) {
      const fields = templateFieldsMap[doc.template_id] || [];
      const docValues = docFieldValues[doc.document_id] || {};

      for (const field of fields) {
        if (signingTypes.has(field.type) && field.required !== false) {
          const val = docValues[field.id];
          if (!val || String(val).trim() === '') return false;
        }
      }
    }
    return true;
  }, [pkg, templateFieldsMap, docFieldValues]);

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
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    data-testid="public-link-email-input"
                    onKeyDown={(e) => e.key === 'Enter' && handleProceed()}
                  />
                </div>
              </div>
              <button
                onClick={handleProceed}
                disabled={checking || !userName.trim() || !userEmail.trim()}
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
  if (flowState === 'signing') {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="public-link-signing">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-5">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                <Package className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900" data-testid="signing-package-name">{pkg?.package_name || 'Document Package'}</h1>
                <p className="text-xs text-gray-500">
                  {documents.length} document{documents.length !== 1 ? 's' : ''} to sign
                </p>
              </div>
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
        <div className="max-w-3xl mx-auto px-4 py-6">
          {loadingFields && (
            <div className="flex items-center justify-center py-6 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              <span className="ml-2 text-sm text-gray-500">Loading document fields...</span>
            </div>
          )}

          {hasAnyFields && !loadingFields && (
            <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 px-4 py-3 rounded-xl mb-4 border border-indigo-100" data-testid="signing-instruction">
              <FileText className="h-4 w-4 shrink-0" />
              <span>Open each document below to fill in and sign the required fields. All signature and required fields must be completed before you can submit.</span>
            </div>
          )}

          <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>

          <div className="space-y-3 mb-6">
            {documents.map((doc, i) => {
              const fields = getFieldsForDoc(doc);
              const isActive = activeDocIndex === i;
              const docValues = docFieldValues[doc.document_id] || {};
              const completedCount = fields.filter(f => {
                const v = docValues[f.id];
                return v !== undefined && v !== null && String(v).trim() !== '';
              }).length;
              const docHasFields = fields.length > 0;

              return (
                <div key={doc.document_id || i} className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid={`public-link-doc-${i}`}>
                  <button
                    onClick={() => setActiveDocIndex(isActive ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    data-testid={`public-link-doc-toggle-${i}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm ${
                        docHasFields && completedCount === fields.length && fields.length > 0
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {docHasFields && completedCount === fields.length && fields.length > 0
                          ? <CheckCircle2 className="h-4 w-4" />
                          : doc.order || i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{doc.document_name || 'Document'}</p>
                        <div className="flex items-center gap-2">
                          {docHasFields && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              completedCount === fields.length && fields.length > 0
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                            }`} data-testid={`public-link-doc-field-status-${i}`}>
                              {completedCount}/{fields.length} fields
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                  </button>

                  {isActive && (
                    <div className="border-t border-gray-100">
                      {doc.document_id ? (
                        fields.length > 0 ? (
                          <div style={{ height: '550px' }} data-testid={`public-link-interactive-viewer-${i}`}>
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
                          <div className="px-4 pb-4">
                            <div className="mt-3 bg-gray-100 rounded-lg overflow-hidden" style={{ height: '400px' }}>
                              <iframe
                                src={`${API_URL}/api/docflow/documents/${doc.document_id}/view/unsigned`}
                                className="w-full h-full border-0"
                                title={doc.document_name}
                                data-testid={`public-link-iframe-${i}`}
                              />
                            </div>
                          </div>
                        )
                      ) : (
                        <p className="text-sm text-gray-400 p-4">Document not yet generated.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit Button */}
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="public-link-submit-section">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Submit Your Signature</h3>
            <p className="text-xs text-gray-500 mb-4">
              {hasAnyFields
                ? `Fill in all required fields across ${documents.length > 1 ? 'all documents' : 'the document'} above, then submit.`
                : `Review ${documents.length > 1 ? 'all documents' : 'the document'} above, then submit.`
              }
            </p>

            {/* Field completion status */}
            {hasAnyFields && (
              <div className="mb-4 space-y-2" data-testid="public-link-field-status">
                {documents.map((doc, i) => {
                  const fields = getFieldsForDoc(doc);
                  if (fields.length === 0) return null;
                  const docValues = docFieldValues[doc.document_id] || {};
                  const done = fields.filter(f => {
                    const v = docValues[f.id];
                    return v !== undefined && v !== null && String(v).trim() !== '';
                  }).length;
                  const allDone = done === fields.length;
                  return (
                    <div key={doc.document_id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                      allDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`} data-testid={`public-link-field-status-doc-${i}`}>
                      <span className="flex items-center gap-2">
                        {allDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {doc.document_name}
                      </span>
                      <span className="font-medium">{done}/{fields.length}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {hasAnyFields && !allRequiredFieldsComplete && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4" data-testid="public-link-incomplete-warning">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Please fill in all required signature and signing fields before submitting.</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || (hasAnyFields && !allRequiredFieldsComplete)}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                !submitting && (!hasAnyFields || allRequiredFieldsComplete)
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              data-testid="public-link-submit-btn"
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : <><FileText className="h-4 w-4" /> Submit & Sign</>}
            </button>
          </div>
        </div>

        {/* Signature Modal */}
        <SignatureModal
          isOpen={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          onSave={handleSignatureSave}
          fieldId={currentSignFieldId}
          isInitials={isInitialsField}
        />
      </div>
    );
  }

  return null;
};

export default PackagePublicLinkView;
