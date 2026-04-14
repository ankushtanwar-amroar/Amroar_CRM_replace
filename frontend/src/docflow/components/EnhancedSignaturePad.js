import React, { useRef, useState } from 'react';
import { X, Type, Edit3, Upload } from 'lucide-react';

const EnhancedSignaturePad = ({ onSave, onClose }) => {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState('draw'); // draw, type, upload
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState('cursive');

  const fonts = [
    { id: 'cursive', name: 'Cursive', style: 'cursive' },
    { id: 'brush', name: 'Brush Script', style: 'Brush Script MT' },
    { id: 'signature', name: 'Signature', style: 'Dancing Script' }
  ];

  // Drawing functions
  const startDrawing = (e) => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e) => {
    if (!isDrawing || mode !== 'draw') return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    setTypedText('');
  };

  const generateTypedSignature = () => {
    if (!typedText.trim()) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = `48px ${selectedFont}`;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedText, canvas.width / 2, canvas.height / 2);
    
    setIsEmpty(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Scale image to fit canvas
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        setIsEmpty(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (isEmpty) return;
    
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL('image/png');
    console.log(onSave)
    onSave(signatureData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Add Your Signature</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Mode Selection */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('draw')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              mode === 'draw' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            <Edit3 className="h-4 w-4" />
            Draw
          </button>
          <button
            onClick={() => setMode('type')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              mode === 'type' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            <Type className="h-4 w-4" />
            Type
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              mode === 'upload' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        </div>

        {/* Type Mode Input */}
        {mode === 'type' && (
          <div className="mb-4 space-y-3">
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              onKeyUp={generateTypedSignature}
              placeholder="Type your signature here"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              {fonts.map(font => (
                <button
                  key={font.id}
                  onClick={() => {
                    setSelectedFont(font.style);
                    if (typedText) generateTypedSignature();
                  }}
                  className={`px-3 py-2 rounded border-2 transition ${
                    selectedFont === font.style
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{ fontFamily: font.style }}
                >
                  {font.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Upload Mode Input */}
        {mode === 'upload' && (
          <div className="mb-4">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Upload a clear image of your signature</p>
          </div>
        )}
        
        {/* Canvas */}
        <div className="border-2 border-gray-300 rounded-lg bg-white mb-4">
          <canvas
            ref={canvasRef}
            width={700}
            height={200}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className={`w-full ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-default'}`}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <button
            onClick={clear}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={isEmpty}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Save Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedSignaturePad;
