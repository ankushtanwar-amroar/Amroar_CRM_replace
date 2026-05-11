// Phase 81.43 — Reusable confirmation dialog for sensitive DocFlow actions
// (resend, void, unvoid, delete, etc.). Replaces the native window.confirm
// browser popup with a themed dialog that supports a loading state while
// the API is in-flight.
//
// Usage:
//   const [dlg, setDlg] = useState({ open: false, ... });
//   <ConfirmDialog
//     open={dlg.open}
//     title="Void recipient?"
//     description="..."
//     confirmLabel="Void"
//     variant="danger"   // 'primary' | 'danger' | 'success'
//     loading={voiding}
//     onConfirm={async () => { ... }}
//     onClose={() => setDlg({ open: false })}
//   />
import React from 'react';
import { Loader2, AlertTriangle, RotateCcw, Send } from 'lucide-react';

const VARIANT_STYLES = {
  primary: {
    icon: Send,
    iconWrap: 'bg-indigo-100 text-indigo-600',
    confirm: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  },
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-red-100 text-red-600',
    confirm: 'bg-red-600 hover:bg-red-700 text-white',
  },
  success: {
    icon: RotateCcw,
    iconWrap: 'bg-emerald-100 text-emerald-600',
    confirm: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  onConfirm,
  onClose,
  icon: IconOverride,
}) => {
  if (!open) return null;
  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
  const Icon = IconOverride || style.icon;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={handleBackdropClick}
      data-testid="confirm-dialog-backdrop"
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        data-testid="confirm-dialog"
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full ${style.iconWrap}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="confirm-dialog-title"
                className="text-base font-semibold text-gray-900 mb-1"
                data-testid="confirm-dialog-title"
              >
                {title}
              </h3>
              {description && (
                <p className="text-sm text-gray-600 leading-relaxed" data-testid="confirm-dialog-description">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-3 bg-gray-50 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${style.confirm}`}
            data-testid="confirm-dialog-confirm"
            autoFocus
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
