import React from 'react';
import { CheckCircle2, X, Loader2 } from 'lucide-react';

/**
 * ConfirmSubmitDialog
 *
 * Final-step confirmation for signing/reviewing/approving. Replaces the old
 * "I confirm I have reviewed…" checkbox + button pattern with a crisper
 * Confirm/Cancel modal that only appears AFTER the user decides to submit.
 *
 * Props:
 *   open         — boolean
 *   title        — modal heading
 *   message      — plain string or JSX rendered in the body
 *   confirmLabel — text on the primary button (default: "Confirm")
 *   confirmTone  — "indigo" (default) | "emerald" | "red"
 *   submitting   — show spinner + disable buttons
 *   onConfirm    — primary action
 *   onCancel     — dismiss
 */
const TONE_CLASSES = {
  indigo:  'bg-indigo-600 hover:bg-indigo-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  red:     'bg-red-600 hover:bg-red-700',
};

export default function ConfirmSubmitDialog({
  open,
  title = 'Are you sure?',
  message = 'You have completed all required fields. Are you sure you want to submit?',
  confirmLabel = 'Confirm',
  confirmTone = 'indigo',
  submitting = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const toneCls = TONE_CLASSES[confirmTone] || TONE_CLASSES.indigo;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="confirm-submit-dialog"
      onClick={() => !submitting && onCancel?.()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 flex items-start gap-4">
          <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100">
            <CheckCircle2 className="h-6 w-6 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900" data-testid="confirm-submit-title">
              {title}
            </h3>
            <div className="mt-1.5 text-sm text-gray-600 leading-relaxed" data-testid="confirm-submit-message">
              {message}
            </div>
          </div>
          <button
            onClick={() => !submitting && onCancel?.()}
            className="shrink-0 text-gray-400 hover:text-gray-600 p-1 rounded"
            aria-label="Close"
            data-testid="confirm-submit-close-btn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-2 border-t border-gray-100">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            data-testid="confirm-submit-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-2 ${toneCls}`}
            data-testid="confirm-submit-confirm-btn"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
