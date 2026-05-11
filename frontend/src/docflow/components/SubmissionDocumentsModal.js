import React, { useEffect, useState } from 'react';
import { X, Eye, Download, Loader2, FileText, Package as PackageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';

/**
 * Modal that lists all signed documents for a single submission.
 * Each document supports: View (opens presigned URL in new tab) + Download (single PDF).
 * Also offers a "Download Combined PDF" action at the top.
 */
const SubmissionDocumentsModal = ({ open, onClose, packageId, runId, submission }) => {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadingCombined, setDownloadingCombined] = useState(false);

  useEffect(() => {
    if (!open || !submission?.id) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await docflowService.listSubmissionDocuments(packageId, runId, submission.id);
        const data = res.data || res;
        setDocs(data.documents || []);
      } catch (e) {
        toast.error(e.message || 'Failed to load documents');
        setDocs([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, packageId, runId, submission]);

  const handleView = (doc) => {
    if (!doc.signed_file_url) {
      toast.error('Preview URL unavailable');
      return;
    }
    window.open(doc.signed_file_url, '_blank', 'noopener,noreferrer');
  };

  const triggerBrowserDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async (doc) => {
    try {
      setDownloadingId(doc.document_id);
      const blob = await docflowService.downloadSubmissionDocument(packageId, runId, submission.id, doc.document_id);
      const safe = (doc.document_name || 'document').replace(/\s+/g, '_');
      triggerBrowserDownload(blob, `${safe}_signed.pdf`);
      toast.success('Document downloaded');
    } catch (e) {
      toast.error(e.message || 'Failed to download document');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadCombined = async () => {
    try {
      setDownloadingCombined(true);
      const blob = await docflowService.downloadSubmissionCombined(packageId, runId, submission.id);
      const safe = (submission.name || 'submission').replace(/\s+/g, '_');
      triggerBrowserDownload(blob, `${safe}_combined_signed.pdf`);
      toast.success('Combined PDF downloaded');
    } catch (e) {
      toast.error(e.message || 'Failed to download combined PDF');
    } finally {
      setDownloadingCombined(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="submission-documents-modal"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">Submission Documents</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {submission?.name || '—'} <span className="text-gray-300 mx-1">•</span> {submission?.email || '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            data-testid="close-submission-modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Combined download bar */}
        <div className="px-6 py-3 bg-indigo-50/50 border-b border-indigo-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-indigo-900">
            <PackageIcon className="h-4 w-4" />
            <span className="font-medium">All-in-one signed PDF</span>
          </div>
          <button
            onClick={handleDownloadCombined}
            disabled={downloadingCombined || loading || docs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            data-testid="download-combined-submission"
          >
            {downloadingCombined ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download Combined PDF
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              <span className="ml-2 text-sm text-gray-500">Loading documents...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">No signed documents in this submission</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100" data-testid="submission-documents-list">
              {docs.map((doc, idx) => {
                const isDownloading = downloadingId === doc.document_id;
                return (
                  <li
                    key={doc.document_id || idx}
                    className="flex items-center justify-between py-3"
                    data-testid={`submission-doc-row-${idx}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate" data-testid={`submission-doc-name-${idx}`}>
                          {doc.document_name || `Document ${idx + 1}`}
                        </p>
                        <p className="text-[11px] text-gray-400">Signed PDF</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleView(doc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        data-testid={`view-submission-doc-${idx}`}
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={isDownloading}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                        data-testid={`download-submission-doc-${idx}`}
                      >
                        {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Download
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            data-testid="submission-modal-close-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmissionDocumentsModal;
