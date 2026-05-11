/**
 * Phase 81.60 — PackageDocSidebar
 *
 * Left-rail navigator for a signing package. Lists every document with:
 *   - Index number + name
 *   - Status chip (Pending / In Progress / Completed / Viewed)
 *   - Required-fields progress ("3/5 filled")
 *   - Active-doc highlight + click-to-jump
 *   - Simple search filter
 *
 * Works for both PackagePublicView (email flow) and PackagePublicLinkView
 * (public-link flow). Does NOT own signing logic — purely a visual
 * navigator. Parent is responsible for switching the active doc.
 */
import React, { useState, useMemo } from 'react';
import { CheckCircle2, Clock, FileText, Search, X as XIcon, ChevronRight } from 'lucide-react';

export default function PackageDocSidebar({
  documents,
  activeDocIndex,
  onSelect,
  getDocStats,         // (doc, idx) => { filled, total, isComplete, statusLabel }
  onClose,             // optional: mobile drawer close
  searchable = true,
  title = 'Documents',
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const docs = Array.isArray(documents) ? documents : [];
    const q = query.trim().toLowerCase();
    if (!q) return docs.map((d, i) => ({ doc: d, idx: i }));
    return docs
      .map((d, i) => ({ doc: d, idx: i }))
      .filter(({ doc }) => (doc?.document_name || doc?.template_name || doc?.name || '').toLowerCase().includes(q));
  }, [documents, query]);
  const safeDocs = Array.isArray(documents) ? documents : [];

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200" data-testid="package-doc-sidebar">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{safeDocs.length} total</div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1 rounded hover:bg-gray-100 text-gray-500"
            data-testid="sidebar-close-btn"
            aria-label="Close documents list"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search */}
      {searchable && safeDocs.length > 5 && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              data-testid="sidebar-search-input"
            />
          </div>
        </div>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5" data-testid="sidebar-doc-list">
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-4">No documents match "{query}"</div>
        )}
        {filtered.map(({ doc, idx }) => {
          const stats = (typeof getDocStats === 'function' ? getDocStats(doc, idx) : null) || {};
          const { filled = 0, total = 0, isComplete = false, statusLabel, statusTone } = stats;
          const isActive = activeDocIndex === idx;

          let toneClass = 'bg-gray-100 text-gray-700';
          if (statusTone === 'complete') toneClass = 'bg-emerald-100 text-emerald-700';
          else if (statusTone === 'progress') toneClass = 'bg-amber-100 text-amber-700';
          else if (statusTone === 'viewed') toneClass = 'bg-blue-100 text-blue-700';

          const percent = total > 0 ? Math.round((filled / total) * 100) : (isComplete ? 100 : 0);

          return (
            <button
              key={doc.document_id || idx}
              type="button"
              onClick={() => onSelect(idx)}
              className={`w-full text-left rounded-lg border transition-all p-2.5 group ${
                isActive
                  ? 'border-indigo-500 bg-indigo-50/60 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30'
              }`}
              data-testid={`sidebar-doc-${idx}`}
            >
              {/* Top row: index + name + chevron */}
              <div className="flex items-start gap-2">
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-semibold ${
                    isComplete
                      ? 'bg-emerald-500 text-white'
                      : isActive
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-semibold truncate ${isActive ? 'text-indigo-900' : 'text-gray-800'}`}>
                    {doc.document_name || doc.template_name || doc.name || `Document ${idx + 1}`}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {statusLabel && (
                      <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded ${toneClass}`}>
                        {statusLabel}
                      </span>
                    )}
                    {total > 0 && (
                      <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
                        <FileText className="h-2.5 w-2.5" />
                        {filled}/{total}
                      </span>
                    )}
                    {!statusLabel && !isComplete && total === 0 && (
                      <span className="text-[10px] text-gray-400 inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" /> Pending
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${
                    isActive ? 'text-indigo-500 rotate-90' : 'text-gray-300 group-hover:text-gray-400'
                  }`}
                />
              </div>

              {/* Progress bar */}
              {total > 0 && (
                <div className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isComplete ? 'bg-emerald-500' : percent > 0 ? 'bg-indigo-500' : 'bg-gray-200'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
