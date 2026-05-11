import React, { useState, useRef, useEffect } from 'react';
import { Shield, MessageSquare, RefreshCw } from 'lucide-react';
import { docflowService } from '../services/docflowService';
import { toast } from 'react-hot-toast';

/**
 * Phase 81 — SMS Security Check modal.
 *
 * Renders BEFORE the consent screen when the document was sent with
 * `sms_mode=true` and the recipient hasn't yet been SMS-verified.
 * Production-ready: real Twilio delivery when configured, stub mode
 * (logs OTP) otherwise. Calls back into the parent on success so the
 * normal signing flow can proceed.
 */
export default function SmsSecurityCheck({ token, phoneMasked, documentName, onVerified, scope = 'document' }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputs = useRef([]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const [stubbed, setStubbed] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Choose the right endpoint pair based on scope. `document` = template-flow,
  // `package` = package-flow. Both endpoints are public (token in URL).
  const sendOtp = scope === 'package'
    ? docflowService.packageSmsSendOtp
    : docflowService.smsSendOtp;
  const verifyOtp = scope === 'package'
    ? docflowService.packageSmsVerifyOtp
    : docflowService.smsVerifyOtp;

  const startResendCountdown = (seconds = 30) => {
    setResendIn(seconds);
    const t = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  // Auto-send the first OTP on mount.
  useEffect(() => {
    handleSend();
  }, []);

  const handleSend = async () => {
    setSending(true);
    try {
      const resp = await sendOtp(token);
      setSentOnce(true);
      setStubbed(!!resp.stubbed);
      startResendCountdown(30);
      toast.success(resp.stubbed
        ? 'Stub mode — check server logs for the code'
        : `Code sent to ${phoneMasked || 'your phone'}`);
      // Focus the first input
      setTimeout(() => inputs.current[0]?.focus(), 100);
    } catch (e) {
      toast.error(e.message || 'Failed to send code');
    } finally {
      setSending(false);
    }
  };

  const handleChange = (i, value) => {
    const v = value.replace(/[^0-9]/g, '').slice(0, 1);
    const next = [...code];
    next[i] = v;
    setCode(next);
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === 'Enter') handleVerify();
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setCode(pasted.split(''));
      setTimeout(() => inputs.current[5]?.focus(), 0);
    }
  };

  const handleVerify = async () => {
    const joined = code.join('');
    if (joined.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      await verifyOtp(token, joined);
      toast.success('Verified');
      onVerified && onVerified();
    } catch (e) {
      toast.error(e.message || 'Incorrect code');
      setCode(['', '', '', '', '', '']);
      setTimeout(() => inputs.current[0]?.focus(), 0);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-4" data-testid="sms-security-check">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold">Security Check</h2>
          </div>
          <p className="text-xs text-indigo-100">
            For your security, this document requires SMS verification before signing.
          </p>
        </div>

        <div className="px-6 py-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            <span>
              {sentOnce ? 'We sent a code to' : 'A code will be sent to'}{' '}
              <strong className="text-gray-900">{phoneMasked || '••••'}</strong>
            </span>
          </div>

          {documentName && (
            <p className="text-xs text-gray-500">
              Document: <span className="font-medium text-gray-700">{documentName}</span>
            </p>
          )}

          {/* OTP inputs */}
          <div className="flex items-center justify-between gap-2 pt-2" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-11 h-12 text-center text-xl font-bold text-gray-900 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                data-testid={`sms-otp-${i}`}
              />
            ))}
          </div>

          {stubbed && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <strong>Dev / Test mode:</strong> SMS provider is not configured. The OTP was logged to the server console.
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={verifying || code.join('').length !== 6}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
            data-testid="sms-verify-btn"
          >
            {verifying ? 'Verifying…' : 'Verify and Continue'}
          </button>

          <div className="flex items-center justify-between text-xs">
            <button
              onClick={handleSend}
              disabled={sending || resendIn > 0}
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 disabled:text-gray-400 font-medium"
              data-testid="sms-resend-btn"
            >
              <RefreshCw className={`h-3 w-3 ${sending ? 'animate-spin' : ''}`} />
              {resendIn > 0 ? `Resend in ${resendIn}s` : (sentOnce ? 'Resend code' : 'Send code')}
            </button>
            <span className="text-gray-400">Code expires in 10 min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
