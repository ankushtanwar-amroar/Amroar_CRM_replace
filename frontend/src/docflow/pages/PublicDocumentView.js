import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import EnhancedSignaturePad from '../components/EnhancedSignaturePad';

const PublicDocumentView = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState(null);
  const [error, setError] = useState(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    loadDocument();
  }, [token]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      const data = await docflowService.getDocumentPublic(token);
      setDocument(data);
      console.log(token,"token")
      // Check if already signed
      if (data.status === 'signed' || data.status === 'completed') {
        setSigned(true);
      }
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Document not found or has expired');
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async (signatureData) => {
    if (!signerName.trim()) {
      toast.error('Please enter your name');
      return;
    }

    try {
      setSigning(true);
      await docflowService.signDocument(document.id, {
        signer_name: signerName,
        signature_image: signatureData,
        signed_at: new Date().toISOString()
      });
      
      setSigned(true);
      setShowSignaturePad(false);
      toast.success('Document signed successfully!');
      
      // Reload document to show updated status
      await loadDocument();
    } catch (error) {
      console.error('Error signing document:', error);
      toast.error('Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Document Unavailable</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <FileText className="h-8 w-8 text-indigo-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{document.template_name}</h1>
                <p className="text-sm text-gray-600">Document ID: {document.id.slice(0, 8)}</p>
              </div>
            </div>
            {signed ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Signed</span>
              </div>
            ) : (
              <div className="px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg">
                <span className="font-medium">Pending Signature</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Document Preview */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-6">
          <div className="prose max-w-none">
            {console.log(document,"document")}
            <div dangerouslySetInnerHTML={{ __html: document.generated_pdf_url || '<p>Document content loading...</p>' }} />
          </div>
        </div>

        {/* Signature Section */}
        {!signed && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sign This Document</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Full Name
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={() => setShowSignaturePad(true)}
                disabled={!signerName.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <FileText className="h-5 w-5" />
                Sign Document
              </button>
            </div>
          </div>
        )}

        {/* Audit Trail */}
        {document.audit_trail && document.audit_trail.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Trail</h2>
            <div className="space-y-3">
              {document.audit_trail.map((event, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium capitalize">{event.event}</p>
                    <p className="text-gray-600">
                      {event.user && `by ${event.user} · `}
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <EnhancedSignaturePad
          onSave={handleSign}
          onClose={() => setShowSignaturePad(false)}
        />
      )}
    </div>
  );
};

export default PublicDocumentView;
