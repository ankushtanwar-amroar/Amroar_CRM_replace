import React from 'react';
import { PenTool, Plus, X } from 'lucide-react';

/**
 * SignatureReusePrompt
 * Lightweight popover shown when the signer clicks a new signature field
 * and a previously-drawn signature is already cached for this session.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   dataUrl: string (base64 PNG of the stored signature)
 *   onReuse: () => void     — use the cached signature
 *   onDrawNew: () => void   — open the full signature modal
 *   type: 'signature' | 'initials'
 */
const SignatureReusePrompt = ({ open, onClose, dataUrl, onReuse, onDrawNew, type = 'signature' }) => {
  if (!open || !dataUrl) return null;
  const label = type === 'initials' ? 'initials' : 'signature';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      data-testid="signature-reuse-backdrop"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="signature-reuse-prompt"
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Use your previous {label}?</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" data-testid="signature-reuse-close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-center" style={{ minHeight: 90 }}>
            <img
              src={dataUrl}
              alt={`Saved ${label}`}
              className="max-h-20 max-w-full object-contain"
              data-testid="signature-reuse-preview"
            />
          </div>
          <p className="mt-3 text-xs text-gray-500 text-center leading-relaxed">
            We saved your {label} from earlier in this session. You can reuse it here or draw a new one.
          </p>
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onDrawNew}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            data-testid="signature-reuse-draw-new-btn"
          >
            <Plus className="h-3.5 w-3.5" />
            Draw new
          </button>
          <button
            onClick={onReuse}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            data-testid="signature-reuse-accept-btn"
          >
            <PenTool className="h-3.5 w-3.5" />
            Use this {label}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureReusePrompt;
