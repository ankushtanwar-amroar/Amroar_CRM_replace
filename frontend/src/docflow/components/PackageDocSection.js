import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ChevronRight, ChevronLeft, Play, CheckCircle2, CheckCircle, Clock, Eye,
} from 'lucide-react';
import InteractiveDocumentViewer from './InteractiveDocumentViewer';
import useGuidedFillIn from '../hooks/useGuidedFillIn';

/**
 * Phase 81.6 — Package Doc Section.
 *
 * One accordion card per package document. Hosts a single `useGuidedFillIn`
 * for that doc (rules-of-hooks safe — one component per doc) and exposes
 * the Start / Next / Previous controls INSIDE the accordion header so they
 * sit alongside the document title and "Fill & Sign" affordance — matching
 * the Template flow's action-bar feel rather than floating below.
 *
 * Behaviour-only refactor:
 *   - Same `useGuidedFillIn` hook + `InteractiveDocumentViewer` integration
 *     as the Template flow.
 *   - No backend / API / submission logic changes.
 */
export default function PackageDocSection({
  doc,
  index,
  fields,
  fieldValues,
  recipientIds,
  assignedFieldIds,
  isActive,
  isSigner,
  isApprover,
  allSigningComplete,
  apiUrl,
  onToggle,
  onNextDoc,             // Called when user clicks "Next Document" after completing this doc
  onFieldsChange,
  onHiddenFieldsChange,  // Phase 81.57 — bubble dynamic conditional hidden ids up
  showSignatureModal,
  hasSignedVersion,
  autoStartToken,
  signatureModalOpen = false,  // Phase 82.2 — track if modal is open to prevent re-opening on close
}) {
  const [hiddenFieldIds, setHiddenFieldIds] = useState(new Set());

  // Phase 81.57 — Bubble the dynamic hidden-field set to the package parent
  // so the package-level "Finish" gate and per-doc stats can correctly
  // ignore conditional-hidden required fields.
  React.useEffect(() => {
    if (typeof onHiddenFieldsChange === 'function') {
      onHiddenFieldsChange(hiddenFieldIds);
    }
  }, [hiddenFieldIds, onHiddenFieldsChange]);

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
    fields: (fields || []).filter(Boolean),
    fieldValues: fieldValues || {},
    hiddenFieldIds,
    recipientIds,
    assignedFieldIds,
  });

  // Header completion stats — kept for accordion title chip.
  // Phase 81.53 — Mirror useGuidedFillIn's semantics so the chip count never
  // diverges from the actual fill state. Specifically: radio groups count
  // as ONE slot keyed off groupName; checkboxes count as filled when value
  // is truthy boolean; auto-mode date is implicitly filled.
  const _GROUP = (f) => f?.groupName || f?.group_name || null;
  const _TYPE = (f) => (f?.type || f?.field_type || '').toLowerCase();
  const _isFilled = (f, vals) => {
    const t = _TYPE(f);
    if (t === 'radio') {
      const g = _GROUP(f) || f.id;
      const v = (vals || {})[g];
      return v !== undefined && v !== null && String(v) !== '';
    }
    if (t === 'checkbox') {
      const v = (vals || {})[f.id];
      return v === true || v === 'true';
    }
    if (t === 'date') {
      if ((f.dateMode || 'auto') === 'auto') return true;
      const v = (vals || {})[f.id];
      return v !== undefined && v !== null && String(v).trim() !== '';
    }
    const v = (vals || {})[f.id];
    return v !== undefined && v !== null && String(v).trim() !== '';
  };
  const activeFieldsRaw = (fields || []).filter(
    (f) => !f.field_hidden
      && !f.readOnly
      && f.__isAssigned !== false
      && !['label', 'merge'].includes(_TYPE(f))
      // Phase 81.57 — Skip conditionally-hidden fields so the chip count
      // reflects only what the signer actually has to act on.
      && !hiddenFieldIds.has(f.id)
  );
  // Dedupe radio groups so the count reflects "user actions left", not raw placements.
  const _seenGroups = new Set();
  const activeFields = [];
  for (const f of activeFieldsRaw) {
    if (_TYPE(f) === 'radio') {
      const g = _GROUP(f);
      if (g) {
        if (_seenGroups.has(g)) continue;
        _seenGroups.add(g);
      }
    }
    activeFields.push(f);
  }
  const filledHeader = activeFields.filter((f) => _isFilled(f, fieldValues)).length;
  const headerHasFields = activeFields.length > 0;
  const headerComplete = headerHasFields && filledHeader === activeFields.length;

  const showStart = hasAnyNavigable && !started && navUnfilledCount > 0;
  const showNext = hasAnyNavigable && started && navUnfilledCount > 0;
  const prevCurrentIdx = activeFieldId ? (navigableFieldIds || []).indexOf(activeFieldId) : -1;
  const showPrev = hasAnyNavigable && started && prevCurrentIdx > 0;

  // Phase 81.79 — Controlled auto-scroll: only scroll to the active field on
  // EXPLICIT user actions (Start / Next / Enter). Field clicks, auto-advance
  // after a fill, and initial mount must NOT trigger a scroll — the user keeps
  // their visual context. We achieve this by bumping `scrollToken` only inside
  // the action handlers; the InteractiveDocumentViewer effect that scrolls is
  // keyed on this token.
  const [scrollToken, setScrollToken] = useState(0);
  const bumpScroll = useCallback(() => setScrollToken((t) => t + 1), []);

  // Wrap Start so it ALSO opens the accordion (for users who hit Start while
  // the doc is collapsed — common after "fields are still pending" prompts).
  const handleStart = (e) => {
    e?.stopPropagation?.();
    if (!isActive) onToggle?.();
    start();
    bumpScroll();
  };
  const handleNext = (e) => { e?.stopPropagation?.(); goToNext(); bumpScroll(); };
  const handlePrev = (e) => { e?.stopPropagation?.(); goToPrev(); bumpScroll(); };
  const handleEnterNext = useCallback(() => { goToNext(); bumpScroll(); }, [goToNext, bumpScroll]);

  // Fire start() + bumpScroll() when parent auto-navigates to this document
  const _startRef = useRef(start);
  _startRef.current = start;
  const _bumpScrollRef = useRef(bumpScroll);
  _bumpScrollRef.current = bumpScroll;
  const _prevAutoStartTokenRef = useRef(autoStartToken);
  useEffect(() => {
    if (!autoStartToken || autoStartToken === _prevAutoStartTokenRef.current) return;
    _prevAutoStartTokenRef.current = autoStartToken;
    _startRef.current?.();
    _bumpScrollRef.current?.();
  }, [autoStartToken]);

  return (
    <div
      className="bg-white rounded-xl border border-gray-200"
      data-testid={`public-doc-${index}`}
    >
      {/* Accordion header — title on the left, Fill In actions + Fill & Sign
          chevron on the right. Single row, scales gracefully on small screens.
          Phase 81.79 — When this card is the active (expanded) doc, pin the
          header so Start/Next/Fill & Sign stay visible while the user scrolls
          the page or the PDF below. Sits below the outer page header
          (sticky top-0 z-40, ~160px desktop / ~210px mobile). */}
      <div className={`flex items-center justify-between gap-3 px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors ${
        isActive ? 'sticky top-[210px] sm:top-40 z-20 bg-white rounded-t-xl shadow-sm border-b border-gray-100' : ''
      }`}>
        {/* Toggle (clickable area = title block) */}
        <button
          onClick={onToggle}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          data-testid={`doc-toggle-${index}`}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm shrink-0 ${
              isSigner && headerComplete
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            {isSigner && headerComplete ? <CheckCircle2 className="h-4 w-4" /> : doc.order}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">
              {doc.document_name || 'Document'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-gray-400">{doc.status}</p>
              {isSigner && headerHasFields && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    headerComplete
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                  data-testid={`doc-field-status-${index}`}
                >
                  {filledHeader}/{activeFields.length} fields
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Right action cluster — Start / Next / Previous + Fill & Sign + chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSigner && (showPrev || showStart || showNext) && (
            <div className="hidden sm:flex items-center gap-1.5">
              {showPrev && (
                <button
                  onClick={handlePrev}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  data-testid={`pkg-doc-${index}-guided-prev-btn`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
              )}
              {showStart && (
                <button
                  onClick={handleStart}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors shadow-sm"
                  data-testid={`pkg-doc-${index}-guided-start-btn`}
                >
                  <Play className="h-3.5 w-3.5" />
                  Start
                </button>
              )}
              {showNext && (
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors shadow-sm"
                  data-testid={`pkg-doc-${index}-guided-next-btn`}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {isSigner && hasAnyRequired && allComplete && (
            <span
              className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-md"
              data-testid={`pkg-doc-${index}-guided-complete-pill`}
            >
              <CheckCircle className="h-3 w-3" />
              Complete
            </span>
          )}
          {console.log(isSigner,allComplete,typeof onNextDoc === 'function',"asdasdasdasd")}
          {isSigner && allComplete && typeof onNextDoc === 'function' && (
            <button
              onClick={(e) => { e.stopPropagation(); onNextDoc(); }}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
              data-testid={`pkg-doc-${index}-next-doc-btn`}
            >
              Next Document
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 px-1.5 py-1 text-gray-400 hover:text-gray-600 transition-colors"
            data-testid={`doc-fillsign-${index}`}
          >
            {isSigner && headerHasFields && !allComplete && (
              <span className="text-xs text-indigo-500">Fill &amp; Sign</span>
            )}
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isActive ? 'rotate-90' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile-only Start/Next/Previous strip (when actions don't fit in header) */}
      {isSigner && (showPrev || showStart || showNext || (allComplete && typeof onNextDoc === 'function')) && (
        <div className="sm:hidden flex items-center justify-end gap-1.5 px-3 pb-3 -mt-1">
          {showPrev && (
            <button
              onClick={handlePrev}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
          )}
          {showStart && (
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
            >
              <Play className="h-3.5 w-3.5" />
              Start
            </button>
          )}
          {showNext && (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          {allComplete && typeof onNextDoc === 'function' && (
            <button
              onClick={(e) => { e.stopPropagation(); onNextDoc(); }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              data-testid={`pkg-doc-${index}-next-doc-btn-mobile`}
            >
              Next Document
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Progress bar — hairline under header, only when relevant */}
      {isSigner && hasAnyRequired && (
        <div
          className="h-0.5 w-full bg-gray-100"
          data-testid={`pkg-doc-${index}-guided-progress`}
        >
          <div
            className={`h-full transition-all duration-300 ${
              completedCount === totalRequired ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
            style={{
              width: `${
                totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 0
              }%`,
            }}
          />
        </div>
      )}

      {/* Body */}
      {isActive && (
        <div className="border-t border-gray-100">
          {isApprover && !allSigningComplete ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center px-6"
              data-testid={`doc-signing-pending-${index}`}
            >
              <Clock className="h-10 w-10 text-amber-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Signing is pending by the signer</p>
              <p className="text-xs text-gray-400 mt-1">
                This document will be available for review once the signer completes signing.
              </p>
            </div>
          ) : doc.document_id ? (
            isSigner && (fields || []).length > 0 ? (
              <div
                style={{ height: '78vh', minHeight: '600px' }}
                data-testid={`doc-interactive-viewer-${index}`}
              >
                <InteractiveDocumentViewer
                  pdfUrl={`${apiUrl}/api/docflow/documents/${doc.document_id}/view/unsigned`}
                  fields={fields}
                  onFieldsChange={onFieldsChange}
                  readOnly={false}
                  showSignatureModal={showSignatureModal}
                  externalFieldValues={fieldValues}
                  activeFieldId={activeFieldId}
                  onFieldClick={syncFromClick}
                  onHiddenFieldsChange={setHiddenFieldIds}
                  onEnterNext={handleEnterNext}
                  scrollToken={scrollToken}
                  signatureModalOpen={signatureModalOpen}
                />
              </div>
            ) : (
              /* Non-signer view */
              <div className="px-4 pb-4">
                <div className="mt-3 space-y-3">
                  <div
                    className="bg-gray-100 rounded-lg overflow-hidden"
                    style={{ height: '70vh', minHeight: '500px' }}
                  >
                    <iframe
                      src={
                        hasSignedVersion
                          ? `${apiUrl}/api/docflow/documents/${doc.document_id}/view/signed`
                          : `${apiUrl}/api/docflow/documents/${doc.document_id}/view/unsigned`
                      }
                      className="w-full h-full border-0"
                      title={doc.document_name}
                      data-testid={`doc-iframe-${index}`}
                    />
                  </div>
                  {isApprover && hasSignedVersion && (
                    <div
                      className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg"
                      data-testid={`doc-signed-hint-${index}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      You are viewing the signed version of this document
                    </div>
                  )}
                  {isSigner && (
                    <div
                      className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg"
                      data-testid={`doc-review-hint-${index}`}
                    >
                      <Eye className="h-3.5 w-3.5 text-indigo-500" />
                      Review this document before completing your signature below
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-gray-400 p-4">Document not yet generated.</p>
          )}
        </div>
      )}
    </div>
  );
}
