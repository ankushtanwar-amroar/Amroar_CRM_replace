import React from 'react';
import { ShieldOff } from 'lucide-react';

/**
 * Phase 81.83 — Full-screen "you declined SMS delivery" exit screen.
 *
 * Replaces the SmsDisclaimerModal once the recipient clicks Decline. Shows
 * a clear, polite message explaining the consequence and offers a Close
 * button (best-effort window.close, falls back to about:blank). The signing
 * UI behind it is NEVER mounted, so no document data is fetched or shown.
 */
export default function SmsDeclineScreen({ onReconsider }) {
  const handleClose = () => {
    try {
      window.close();
      // Some browsers ignore window.close() for tabs they didn't open. Fall
      // back to a neutral page so the user is no longer on the signing URL.
      setTimeout(() => {
        try { window.location.href = 'about:blank'; } catch { /* noop */ }
      }, 250);
    } catch {
      try { window.location.href = 'about:blank'; } catch { /* noop */ }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-4 bg-slate-900/55 backdrop-blur-sm"
      data-testid="sms-decline-screen"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-rose-500 to-orange-500 text-white px-6 py-5 flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
            <ShieldOff className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight">SMS Delivery Declined</h2>
            <p className="text-xs text-rose-50 mt-0.5">You did not agree to secure SMS delivery.</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Because secure SMS delivery is required for this signing request, we cannot
            proceed without your acknowledgement.
          </p>
          <p>
            If this was a mistake, you can return to the signing screen and accept the
            disclaimer. If you do not wish to sign, you can simply close this tab.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button
            onClick={onReconsider}
            className="order-2 sm:order-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
            data-testid="sms-decline-reconsider"
          >
            Go back
          </button>
          <button
            onClick={handleClose}
            className="order-1 sm:order-2 px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-black"
            data-testid="sms-decline-close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
