import React, { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Play, CheckCircle } from 'lucide-react';
import InteractiveDocumentViewer from './InteractiveDocumentViewer';
import useGuidedFillIn from '../hooks/useGuidedFillIn';

/**
 * Phase 81.5 — Per-document Fill In wrapper for the Package signing flow.
 *
 * Reuses the SAME `useGuidedFillIn` hook + `InteractiveDocumentViewer`
 * `activeFieldId` / `onFieldClick` integration that the Template flow uses,
 * so package signing has identical:
 *   - field navigation (next/previous, page-aware)
 *   - active field highlighting + smooth scroll-to-field
 *   - field completion tracking + progress bar
 *   - guided "Start → Next … → Finish" cadence
 *
 * Scoped to ONE document (rendered once per expanded doc inside the package
 * accordion). Each document maintains its own guided session, mirroring how
 * a single-template send already behaves.
 */
export default function PackageDocFillIn({
  pdfUrl,
  fields,
  fieldValues,
  recipientIds,
  assignedFieldIds,
  onFieldsChange,
  showSignatureModal,
  testId,
}) {
  const [hiddenFieldIds, setHiddenFieldIds] = React.useState(new Set());

  const {
    activeFieldId,
    completedCount,
    totalRequired,
    allComplete,
    hasAnyRequired,
    navigableFieldIds,
    hasAnyNavigable,
    navUnfilledCount,
    started,
    start,
    goToNext,
    goToPrev,
    syncFromClick,
  } = useGuidedFillIn({
    fields: fields || [],
    fieldValues: fieldValues || {},
    hiddenFieldIds,
    recipientIds,
    assignedFieldIds,
  });

  const showStart = hasAnyNavigable && !started && navUnfilledCount > 0;
  const showNext = hasAnyNavigable && started && navUnfilledCount > 0;
  const prevCurrentIdx = activeFieldId ? (navigableFieldIds || []).indexOf(activeFieldId) : -1;
  const showPrev = hasAnyNavigable && started && prevCurrentIdx > 0;

  // Phase 81.79 — Controlled scroll on explicit user actions only.
  const [scrollToken, setScrollToken] = useState(0);
  const bumpScroll = useCallback(() => setScrollToken((t) => t + 1), []);
  const handleStart = useCallback(() => { start(); bumpScroll(); }, [start, bumpScroll]);
  const handleNext = useCallback(() => { goToNext(); bumpScroll(); }, [goToNext, bumpScroll]);
  const handlePrev = useCallback(() => { goToPrev(); bumpScroll(); }, [goToPrev, bumpScroll]);

  const pendingCount = Math.max(totalRequired - completedCount, 0);
  const progressPct = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 0;

  return (
    <div className="flex flex-col h-full" data-testid={testId}>
      {/* Compact Fill In header — same controls as Template flow, scaled for
          the per-doc accordion card. */}
      {hasAnyNavigable && (
        <div
          className="sticky top-0 z-30 bg-white border-b border-gray-200"
          data-testid={`${testId || 'pkg-doc'}-guided-header`}
        >
          <div className="px-3 sm:px-4 py-2 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs min-w-0 flex-1">
              <span
                className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[11px] font-semibold shrink-0 ${
                  (allComplete || !hasAnyRequired)
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
                data-testid={`${testId || 'pkg-doc'}-guided-pending-count`}
              >
                {pendingCount}
              </span>
              <span className="text-gray-700 font-medium truncate min-w-0">
                {!hasAnyRequired
                  ? 'No required fields in this document'
                  : pendingCount === 0
                    ? 'All required fields completed'
                    : `${completedCount} of ${totalRequired} filled — ${pendingCount} left`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {showPrev && (
                <button
                  onClick={handlePrev}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  data-testid={`${testId || 'pkg-doc'}-guided-prev-btn`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
              )}
              {showStart && (
                <button
                  onClick={handleStart}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors"
                  data-testid={`${testId || 'pkg-doc'}-guided-start-btn`}
                >
                  <Play className="h-3.5 w-3.5" />
                  Start
                </button>
              )}
              {showNext && (
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors"
                  data-testid={`${testId || 'pkg-doc'}-guided-next-btn`}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
              {allComplete && hasAnyRequired && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-md"
                  data-testid={`${testId || 'pkg-doc'}-guided-complete-pill`}
                >
                  <CheckCircle className="h-3 w-3" />
                  Document complete
                </span>
              )}
            </div>
          </div>
          {hasAnyRequired && (
            <div className="h-0.5 w-full bg-gray-100 overflow-hidden" data-testid={`${testId || 'pkg-doc'}-guided-progress`}>
              <div
                className={`h-full transition-all duration-300 ${progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <InteractiveDocumentViewer
          pdfUrl={pdfUrl}
          fields={fields}
          onFieldsChange={onFieldsChange}
          readOnly={false}
          showSignatureModal={showSignatureModal}
          externalFieldValues={fieldValues}
          activeFieldId={activeFieldId}
          onFieldClick={syncFromClick}
          onHiddenFieldsChange={setHiddenFieldIds}
          onEnterNext={handleNext}
          scrollToken={scrollToken}
        />
      </div>
    </div>
  );
}
