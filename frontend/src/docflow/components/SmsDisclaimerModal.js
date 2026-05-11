import React, { useState, useRef, useEffect } from 'react';
import { Shield, Phone, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { docflowService } from '../services/docflowService';
import { renderContent } from '../utils/contentVariables';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Phase 81.80 — Hardcoded fallback used only if the public content config
// fails to load (network down etc.) so the SMS disclaimer never blanks out.
const FALLBACK_SMS = {
  title: 'Security Check',
  subtitle: "For your security, we've sent this document via SMS",
  info_box_title: 'Document Sent via Secure SMS',
  info_box_message:
    "This signing document has been securely delivered to <strong>{{phone}}</strong> in addition to email. This dual delivery method enhances your security and ensures you don't miss important documents.",
  consent_text:
    "By clicking <strong>Continue</strong>, you acknowledge that this document has been securely delivered to you via SMS. You also consent to receive documents electronically and authorize electronic signatures for this transaction.",
  bullets: [
    'Your information is encrypted and secure',
    'You can access this document on any device',
    'Electronic signatures are legally binding',
  ],
  footer:
    'This is a secure transaction. Your information is protected by industry-standard encryption.',
  continue_label: 'Continue to Document',
  decline_label: 'Decline',
};

/**
 * Phase 81.2 / 81.62 — SMS Disclaimer Modal.
 *
 * Renders BEFORE the consent screen when the document was sent with
 * `sms_mode=true` and the recipient hasn't yet acknowledged the SMS disclaimer.
 *
 * Phase 81.62: On Continue click, we also dispatch the signing link via
 * Twilio SMS (through /api/docflow/security/send-sms-link) so the recipient
 * gets a native SMS with the link. The user flow NEVER blocks on SMS
 * success — failure shows a transient warning but we still continue.
 */
export default function SmsDisclaimerModal({
  phoneMasked,
  token,                // Phase 81.62: public token so backend resolves the phone
  scope = 'package',    // 'package' | 'document'
  documentName,
  documentType = 'document',
  recipientId,
  packageId,            // Phase 81.80 — for content-config resolution
  documentId,           // Phase 81.80 — for content-config resolution
  recipientName,        // Phase 81.80 — variable substitution
  recipientEmail,       // Phase 81.80
  companyName,          // Phase 81.80
  smsMode = true,       // when false, skip sending the SMS link on Continue
  onContinue,
  onDecline,
}) {
  const [sending, setSending] = useState(false);
  const [smsWarning, setSmsWarning] = useState(null);
  const lastSentRef = useRef({ key: null, at: 0 });

  // Phase 81.80 — Dynamic content with variable substitution. Falls back to
  // FALLBACK_SMS if the public endpoint isn't reachable.
  const [smsContent, setSmsContent] = useState(() =>
    renderContent(FALLBACK_SMS, {
      phone_masked: phoneMasked,
      user_name: recipientName,
      email: recipientEmail,
      document_name: documentName,
      company_name: companyName,
    })
  );

  useEffect(() => {
    let cancelled = false;
    const ctx = {
      phone_masked: phoneMasked,
      user_name: recipientName,
      email: recipientEmail,
      document_name: documentName,
      company_name: companyName,
    };
    (async () => {
      try {
        const data = await docflowService.getPublicContentConfig({ token, packageId, documentId });
        if (cancelled) return;
        const sms = data?.sections?.sms_disclaimer?.content || FALLBACK_SMS;
        setSmsContent(renderContent(sms, ctx));
      } catch {
        setSmsContent(renderContent(FALLBACK_SMS, ctx));
      }
    })();
    return () => { cancelled = true; };
  }, [token, packageId, documentId, phoneMasked, recipientName, recipientEmail, documentName, companyName]);

  const handleContinueClick = async () => {
    // When smsMode=false, the popup is shown for consent only — no SMS to send.
    if (!smsMode) {
      onContinue?.();
      return;
    }

    // Phase 81.62 — Backend resolves the phone from the token so we never
    // send the raw phone over the wire. Client-side dedupe (30s) mirrors
    // the server cooldown so rapid clicks don't even round-trip.
    const link = typeof window !== 'undefined' ? window.location.href : '';
    const key = `${token || recipientId || ''}|${link}`;
    const now = Date.now();
    const stillCoolingDown = lastSentRef.current.key === key && (now - lastSentRef.current.at) < 30_000;

    if (!API_URL || !token) {
      onContinue?.();
      return;
    }
    if (stillCoolingDown) {
      onContinue?.();
      return;
    }

    setSending(true);
    setSmsWarning(null);
    try {
      const resp = await axios.post(
        `${API_URL}/api/docflow/security/send-sms-link`,
        {
          token,
          scope,
          recipient_id: recipientId || null,
          link,
          document_type: documentType,
          document_name: documentName || null,
        },
        { timeout: 12000 },
      );
      const data = resp?.data || {};
      lastSentRef.current = { key, at: now };
      if (data.success === false) {
        setSmsWarning('SMS could not be sent. You may continue.');
        setTimeout(() => { setSending(false); onContinue?.(); }, 900);
        return;
      }
      // Success case: keep loader until parent unmounts us
      onContinue?.();
    } catch (e) {
      setSmsWarning('SMS could not be sent. You may continue.');
      setTimeout(() => { setSending(false); onContinue?.(); }, 900);
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-3 sm:px-4 py-4 sm:py-6 bg-slate-900/55 backdrop-blur-sm"
      data-testid="sms-disclaimer-page"
    >
      <div
        className="w-full max-w-lg max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-disclaimer-title"
      >
        {/* Compact header — fixed at top */}
        <div className="flex items-center gap-3 px-5 sm:px-6 py-4 bg-gradient-to-br from-indigo-600 to-purple-600 text-white shrink-0">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 id="sms-disclaimer-title" className="text-lg sm:text-xl font-bold leading-tight">
              {smsContent.title}
            </h1>
            <p className="text-[11px] sm:text-xs text-indigo-100 leading-tight mt-0.5">
              {smsContent.subtitle}
            </p>
          </div>
        </div>

        {/* Scrollable content area — only scrolls on very short viewports */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4">
          {/* SMS Delivery Info */}
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-200 shrink-0 mt-0.5">
                <Phone className="h-4 w-4 text-indigo-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {smsContent.info_box_title}
                </p>
                <p
                  className="text-xs sm:text-sm text-gray-700 mt-1 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: smsContent.info_box_message || '' }}
                />
              </div>
            </div>
          </div>

          {/* Document Name */}
          {documentName && (
            <div className="bg-gray-50 rounded-lg px-3 sm:px-4 py-2.5 border border-gray-200">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Document
              </p>
              <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{documentName}</p>
            </div>
          )}

          {/* Acknowledgment Message + trust bullets */}
          <div className="bg-blue-50 rounded-lg px-3 sm:px-4 py-3 border border-blue-200 space-y-2.5">
            <p
              className="text-xs sm:text-sm text-gray-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: smsContent.consent_text || '' }}
            />
            <ul className="grid grid-cols-1 gap-1.5 text-xs text-gray-700">
              {(smsContent.bullets || []).map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sticky action footer — buttons ALWAYS visible without scroll */}
        <div className="shrink-0 px-5 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-white">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={onDecline}
              disabled={sending}
              className="order-2 sm:order-1 sm:w-1/3 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 font-semibold text-sm rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="sms-disclaimer-decline"
            >
              <XCircle className="h-4 w-4" />
              {smsContent.decline_label || 'Decline'}
            </button>
            <button
              onClick={handleContinueClick}
              disabled={sending}
              className="order-1 sm:order-2 sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
              data-testid="sms-disclaimer-continue"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {sending ? 'Sending secure SMS...' : (smsContent.continue_label || 'Continue to Document')}
            </button>
          </div>
          {smsWarning && (
            <p
              className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2 text-center"
              data-testid="sms-disclaimer-warning"
            >
              {smsWarning}
            </p>
          )}
          <p className="text-[10px] sm:text-[11px] text-gray-500 text-center mt-2 sm:mt-3">
            {smsContent.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
