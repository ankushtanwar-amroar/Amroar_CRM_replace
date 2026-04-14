import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, FileText, Download, Eye, Loader2, Send, ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PDFDocument, rgb } from 'pdf-lib';
import InteractiveDocumentViewer from '../components/InteractiveDocumentViewer';
import SignatureModal from '../components/SignatureModal';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const PublicDocumentViewEnhanced = () => {
  const { token } = useParams();

  // Generator state
  const [isGenerator, setIsGenerator] = useState(false);
  const [generatorInfo, setGeneratorInfo] = useState(null);

  // Active document state (child or direct)
  const [activeToken, setActiveToken] = useState(token);
  const [docData, setDocData] = useState(null);
  const [template, setTemplate] = useState({ field_placements: [], recipients: [] });
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [viewMode, setViewMode] = useState('unsigned');
  const [fieldValues, setFieldValues] = useState({});
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentFieldId, setCurrentFieldId] = useState(null);
  const [isInitialsField, setIsInitialsField] = useState(false);

  // User identity + verification
  const [formData, setFormData] = useState({ signer_name: '', signer_email: '' });
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStep, setVerificationStep] = useState(1); // 1: Details, 2: OTP
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [instantiating, setInstantiating] = useState(false);

  const signingTypes = new Set(['signature', 'initials', 'date']);
  const templateRecipients = template?.recipients || [];

  // ── Load initial document or generator info ──
  useEffect(() => {
    loadInitial();
  }, [token]);

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
  const showSignatureModal = (fieldId, isInitials = false) => {
    setCurrentFieldId(fieldId);
    setIsInitialsField(isInitials);
    setSignatureModalOpen(true);
  };

  const handleSignatureSave = (fieldId, signatureData) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: signatureData }));
  };

  const handleFieldsChange = (values) => {
    setFieldValues(values);
  };

  const canSign = () => {
    if (!docData?.can_sign) return false;
    if (!formData.signer_name) return false;
    const activeRecipient = docData?.active_recipient || {};
    if (activeRecipient.email && !formData.signer_email) return false;
    const activeTemplateRecipientId = activeRecipient.template_recipient_id;
    const requiredFields = (template?.field_placements || []).filter(
      f => signingTypes.has(f.type) && (f.recipient_id === activeTemplateRecipientId || !f.recipient_id) && f.required
    );
    return requiredFields.every(field => {
      const v = fieldValues[field.id];
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
      if (!pdfResponse.ok) throw new Error('Failed to load PDF');
      const pdfBytes = await pdfResponse.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

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

        if (signingTypes.has(field.type) && field.recipient_id && field.recipient_id !== docData?.active_recipient?.template_recipient_id) {
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
              if (image) page.drawImage(image, { x, y, width: ptWidth, height: ptHeight });
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
              if (image) page.drawImage(image, { x, y, width: ptWidth, height: ptHeight });
            } catch (error) { console.error('Error embedding initials:', error); }
          }
        } else if ((field.type === 'text' || field.type === 'date') && fieldValue) {
          const fSize = (parseInt(field.style?.fontSize || '10') || 10) * scale;
          const pad = 5 * scale;
          const xOff = field.style?.textAlign === 'center' ? ptWidth / 2 : field.style?.textAlign === 'right' ? ptWidth - pad : pad;
          page.drawText(fieldValue.toString(), { x: x + xOff, y: y + (ptHeight / 2) - (fSize * 0.35), size: fSize, color: rgb(0, 0, 0) });
        } else if (field.type === 'checkbox') {
          const boxSize = Math.min(14 * scale, ptHeight - 4 * scale);
          const boxX = x + 2 * scale;
          const boxY = y + (ptHeight - boxSize) / 2;
          page.drawRectangle({ x: boxX, y: boxY, width: boxSize, height: boxSize, borderColor: rgb(0, 0, 0), borderWidth: 1 });
          if (fieldValue === true || fieldValue === 'true') {
            page.drawLine({ start: { x: boxX + 2 * scale, y: boxY + boxSize / 2 }, end: { x: boxX + boxSize / 2, y: boxY + 2 * scale }, color: rgb(0, 0, 0), thickness: 1.5 });
            page.drawLine({ start: { x: boxX + boxSize / 2, y: boxY + 2 * scale }, end: { x: boxX + boxSize - 2 * scale, y: boxY + boxSize - 2 * scale }, color: rgb(0, 0, 0), thickness: 1.5 });
          }
          if (field.checkboxLabel) {
            page.drawText(field.checkboxLabel, { x: boxX + boxSize + 4 * scale, y: boxY + (boxSize / 2) - 3 * scale, size: 9 * scale, color: rgb(0, 0, 0) });
          }
        } else if (field.type === 'radio') {
          const options = field.radioOptions || ['Option 1', 'Option 2'];
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
        } else if (field.type === 'merge') {
          const mergeObj = field.merge_object || field.mergeObject || '';
          const mField = field.merge_field || field.mergeField || '';
          const fullKey = `${mergeObj}.${mField}`;
          const mergeValue = fieldValue || fieldValues[`${field.id}_fallback`] || fieldValues[fullKey] || fieldValues[mField] || field.defaultValue || '';
          if (mergeValue) {
            page.drawText(mergeValue.toString(), { x: x + 2 * scale, y: y + (ptHeight / 2) - 3 * scale, size: 10 * scale, color: rgb(0, 0, 0) });
          }
        } else if (field.type === 'label' && field.text) {
          const labelSize = (parseInt(field.style?.fontSize || '12') || 12) * scale;
          const pad = 2 * scale;
          const xOff = field.style?.textAlign === 'center' ? ptWidth / 2 : field.style?.textAlign === 'right' ? ptWidth - pad : pad;
          page.drawText(field.text.toString(), { x: x + xOff, y: y + (ptHeight / 2) - (labelSize * 0.35), size: labelSize, color: rgb(0, 0, 0) });
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
    } catch (error) {
      console.error('Error signing document:', error);
      toast.error(error.message || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  const getPdfViewUrl = () => {
    const version = ['signed', 'completed'].includes(docData?.status) ? 'signed' : viewMode;
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
  return (
    <div className="min-h-screen bg-gray-50 py-8" data-testid="document-view">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2" data-testid="document-title">
                {docData.template_name}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>Status: <span className={`font-semibold ${
                  docData.status === 'signed' || docData.status === 'completed' ? 'text-green-600' :
                  docData.status === 'sent' || docData.status === 'viewed' ? 'text-blue-600' :
                  'text-gray-600'
                }`} data-testid="document-status">{docData.status}</span></span>
                {docData.recipient_name && (
                  <span>Recipient: {docData.recipient_name}</span>
                )}
              </div>
            </div>
            {(docData.status === 'signed' || docData.status === 'completed') && (
              <div className="flex items-center gap-2 text-green-600" data-testid="signed-badge">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Signed</span>
              </div>
            )}
          </div>
        </div>

        {/* Signed Banner */}
        {(docData.status === 'signed' || docData.status === 'completed') && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Document Signed</span>
                </div>
                <span className="text-sm text-gray-500">
                  Signed on {new Date(docData.signed_at || Date.now()).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                data-testid="download-signed-btn"
              >
                <Download className="h-4 w-4" />
                Download Signed PDF
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Signer Info */}
          {docData.status !== 'completed' && docData.status !== 'signed' && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Signer Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-gray-600" data-testid="signer-name-display">
                      {formData.signer_name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-gray-600" data-testid="signer-email-display">
                      {formData.signer_email}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={handleSign}
                      disabled={!canSign() || signing || !isVerified}
                      className="w-full px-4 py-3 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      data-testid="complete-signing-btn"
                    >
                      {signing ? 'Signing...' : 'Complete Signing'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Document Viewer */}
          <div className={(docData.status !== 'signed' && docData.status !== 'completed') ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative" style={{ height: '800px' }}>
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

              {isVerified && (
                docData.status === 'completed' || docData.status === 'signed' ? (
                  <div className="h-full flex flex-col">
                    <div className="flex-1 relative">
                      <iframe
                        src={`${getPdfViewUrl()}#toolbar=1&navpanes=0&scrollbar=1`}
                        className="w-full h-full border-0"
                        title="Signed Document"
                        data-testid="signed-pdf-iframe"
                      />
                    </div>
                  </div>
                ) : (
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
                      } else if (hasAssignments && signingTypes.has(f.type)) {
                        isAssigned = assignedIds.includes(f.id);
                      }
                      // Backward compat: no assignment + no assigned_field_ids = visible to all
                      return {
                        ...f,
                        field_disabled: !isAssigned,
                        field_hint: !isAssigned
                          ? `Assigned to: ${templateRecipients?.find(r => r.id === fieldAssignedTo)?.placeholder_name || 'another recipient'}`
                          : 'Complete this field'
                      };
                    })}
                    onFieldsChange={handleFieldsChange}
                    readOnly={!docData?.can_sign}
                    showSignatureModal={showSignatureModal}
                    externalFieldValues={fieldValues}
                  />
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <SignatureModal
        isOpen={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSave={handleSignatureSave}
        fieldId={currentFieldId}
        isInitials={isInitialsField}
      />
    </div>
  );
};

export default PublicDocumentViewEnhanced;
