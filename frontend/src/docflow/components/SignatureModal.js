import React, { useState, useRef, useEffect } from 'react';
import { X, Pencil, Type, Upload, Check } from 'lucide-react';
import { computeInitials } from '../utils/initials';

const SIGNATURE_FONTS = [
  { name: 'Classic', family: "'Dancing Script', cursive", weight: 700 },
  { name: 'Elegant', family: "'Great Vibes', cursive", weight: 400 },
  { name: 'Flowing', family: "'Sacramento', cursive", weight: 400 },
  { name: 'Casual', family: "'Caveat', cursive", weight: 600 },
  { name: 'Smooth', family: "'Pacifico', cursive", weight: 400 },
];

const SignatureModal = ({ isOpen, onClose, onSave, fieldId, isInitials = false, assignedSignatureFieldIds = [], signerName = '' }) => {
  const [mode, setMode] = useState('type');
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState(0);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);

  // Only show "apply to all" if there are multiple assigned fields of the same type
  const otherFields = assignedSignatureFieldIds.filter(id => id !== fieldId);
  const showApplyToAll = otherFields.length > 0;

  useEffect(() => {
    if (isOpen) {
      // Reset state every time the modal opens so the signer can't accidentally
      // carry text from a previous field (e.g., typing "John Doe" for signature
      // and having it pre-filled into the next Initials modal).
      setMode('type');
      // Pre-fill for DocuSign-style UX:
      //   • Signature field → full name (e.g. "Rohit Singh")
      //   • Initials field  → derived initials (e.g. "RS")
      // In both cases the signer can overwrite before saving.
      const nameToSeed = (signerName || '').trim();
      setTypedText(nameToSeed ? (isInitials ? computeInitials(nameToSeed) : nameToSeed) : '');
      setSelectedFont(0);
      setHasDrawn(false);
      // Phase 66: Safety-first default — the "Apply to all my assigned fields"
      // checkbox must start UNCHECKED. Users must explicitly opt-in to bulk
      // apply; the previous "default ON" behavior was unsafe when counts were
      // inflated. The checkbox still renders whenever >1 owned field exists.
      setApplyToAll(false);
      if (mode === 'draw') {
        initializeCanvas();
      }
    }
    // eslint-disable-next-line
  }, [isOpen]);

  // Re-initialize the canvas whenever mode switches to 'draw' (after the canvas
  // DOM node remounts). Separate from the open-reset effect above.
  useEffect(() => {
    if (isOpen && mode === 'draw') initializeCanvas();
    // eslint-disable-next-line
  }, [mode, isOpen]);

  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const generateTypedSignatureImage = (text, fontIndex) => {
    const font = SIGNATURE_FONTS[fontIndex];
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');

    // Phase 3: Ensure transparency by NOT filling with white background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fontSize = isInitials ? 36 : 44;
    ctx.font = `${font.weight} ${fontSize}px ${font.family}`;
    ctx.fillStyle = '#1a1a2e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  };

  const removeWhiteBackground = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      // If pixel is near-white (R, G, B > 240), make it transparent
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const handleSave = () => {
    let signatureData = null;
    if (mode === 'draw') {
      if (!hasDrawn) { alert('Please draw your signature first'); return; }
      const canvas = canvasRef.current;
      removeWhiteBackground(canvas);
      signatureData = canvas.toDataURL('image/png');
    } else if (mode === 'type') {
      if (!typedText.trim()) { alert('Please type your signature first'); return; }
      signatureData = generateTypedSignatureImage(typedText, selectedFont);
    }
    if (signatureData) {
      if (applyToAll && otherFields.length > 0) {
        // Apply to current field + all other assigned signature fields
        onSave(fieldId, signatureData, [fieldId, ...otherFields]);
      } else {
        onSave(fieldId, signatureData, null);
      }
      onClose();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        removeWhiteBackground(canvas);
        onSave(fieldId, canvas.toDataURL('image/png'));
        onClose();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[95vh] overflow-y-auto" data-testid="signature-modal">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            {isInitials ? 'Add Initials' : 'Add Signature'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" data-testid="signature-modal-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setMode('draw')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'draw' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            data-testid="signature-mode-draw"
          >
            <Pencil className="h-4 w-4" />
            Draw
          </button>
          <button
            onClick={() => setMode('type')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'type' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            data-testid="signature-mode-type"
          >
            <Type className="h-4 w-4" />
            Type
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'upload' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            data-testid="signature-mode-upload"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {mode === 'draw' && (
            <div className="space-y-4">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full border-2 border-gray-300 rounded cursor-crosshair bg-white"
                data-testid="signature-canvas"
              />
              <button onClick={clearCanvas} className="text-sm text-gray-600 hover:text-gray-800" data-testid="clear-canvas-btn">
                Clear
              </button>
            </div>
          )}

          {mode === 'type' && (
            <div className="space-y-4">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={isInitials ? 'Type your initials' : 'Type your name'}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 text-lg"
                autoFocus
                data-testid="signature-type-input"
              />
              {typedText && (
                <>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Choose a style</p>
                  <div className="grid grid-cols-1 gap-2" data-testid="signature-suggestions">
                    {SIGNATURE_FONTS.map((font, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedFont(idx)}
                        className={`relative w-full h-16 border-2 rounded-lg flex items-center justify-center bg-white transition-all ${selectedFont === idx
                            ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/50'
                            : 'border-gray-200 hover:border-gray-400'
                          }`}
                        data-testid={`signature-style-${idx}`}
                      >
                        <span
                          style={{
                            fontFamily: font.family,
                            fontWeight: font.weight,
                            fontSize: isInitials ? '28px' : '34px',
                            color: '#1a1a2e',
                          }}
                        >
                          {typedText}
                        </span>
                        {selectedFont === idx && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <span className="absolute bottom-0.5 right-2 text-[10px] text-gray-400">
                          {font.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {mode === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-4">Upload an image of your signature</p>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="signature-upload" />
                <label htmlFor="signature-upload" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer" data-testid="signature-upload-btn">
                  Choose File
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Apply to All Checkbox */}
        {showApplyToAll && (
          <div className="px-6 pb-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-lg bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-colors" data-testid="apply-to-all-checkbox">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-indigo-800 font-medium">
                Apply this {isInitials ? 'initial' : 'signature'} to all my assigned {isInitials ? 'initial' : 'signature'} fields ({otherFields.length + 1} fields)
              </span>
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 p-3 sm:p-4 border-t border-gray-200 flex-wrap">
          <button onClick={onClose} className="px-3 sm:px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg min-h-[40px]" data-testid="signature-cancel-btn">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={mode === 'upload'}
            className="px-4 sm:px-6 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 min-h-[40px]"
            data-testid="signature-save-btn"
          >
            {isInitials ? 'Add Initials' : 'Add Signature'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureModal;
