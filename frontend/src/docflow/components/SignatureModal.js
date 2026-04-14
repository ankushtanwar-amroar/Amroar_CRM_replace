import React, { useState, useRef, useEffect } from 'react';
import { X, Pencil, Type, Upload, Check } from 'lucide-react';

const SIGNATURE_FONTS = [
  { name: 'Classic', family: "'Dancing Script', cursive", weight: 700 },
  { name: 'Elegant', family: "'Great Vibes', cursive", weight: 400 },
  { name: 'Flowing', family: "'Sacramento', cursive", weight: 400 },
  { name: 'Casual', family: "'Caveat', cursive", weight: 600 },
  { name: 'Smooth', family: "'Pacifico', cursive", weight: 400 },
];

const SignatureModal = ({ isOpen, onClose, onSave, fieldId, isInitials = false }) => {
  const [mode, setMode] = useState('draw');
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState(0);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (isOpen && mode === 'draw') {
      initializeCanvas();
    }
  }, [isOpen, mode]);

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
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fontSize = isInitials ? 36 : 44;
    ctx.font = `${font.weight} ${fontSize}px ${font.family}`;
    ctx.fillStyle = '#1a1a2e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  };

  const handleSave = () => {
    let signatureData = null;
    if (mode === 'draw') {
      if (!hasDrawn) { alert('Please draw your signature first'); return; }
      signatureData = canvasRef.current.toDataURL('image/png');
    } else if (mode === 'type') {
      if (!typedText.trim()) { alert('Please type your signature first'); return; }
      signatureData = generateTypedSignatureImage(typedText, selectedFont);
    }
    if (signatureData) {
      onSave(fieldId, signatureData);
      onClose();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => { onSave(fieldId, event.target.result); onClose(); };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4" data-testid="signature-modal">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isInitials ? 'Add Initials' : 'Add Signature'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="signature-modal-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setMode('draw')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              mode === 'draw' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="signature-mode-draw"
          >
            <Pencil className="h-4 w-4" />
            Draw
          </button>
          <button
            onClick={() => setMode('type')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              mode === 'type' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="signature-mode-type"
          >
            <Type className="h-4 w-4" />
            Type
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              mode === 'upload' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="signature-mode-upload"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
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
                        className={`relative w-full h-16 border-2 rounded-lg flex items-center justify-center bg-white transition-all ${
                          selectedFont === idx
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" data-testid="signature-cancel-btn">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={mode === 'upload'}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
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
