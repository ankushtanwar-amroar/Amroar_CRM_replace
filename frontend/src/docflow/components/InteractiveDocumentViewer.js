import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { CheckCircle, Layers, ScrollText, Check, Edit3, PenTool, Link2 } from 'lucide-react';
import { computeHiddenFieldIds } from '../utils/conditionalLogic';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// ─── Helpers ──────────────────────────────────────────────
// Supported date formats for field-level date rendering.
const DATE_FORMATS = [
  'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY/MM/DD',
  'MM-DD-YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD',
  'MM/DD/YY', 'DD/MM/YY',
  // Legacy long form kept for back-compat with existing date fields.
  'MMM DD, YYYY',
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Format a JS Date in the given format.
 * Accepted: MM/DD/YYYY (default) | DD/MM/YYYY | YYYY/MM/DD |
 *           MM-DD-YYYY | DD-MM-YYYY | YYYY-MM-DD |
 *           MM/DD/YY | DD/MM/YY | MMM DD, YYYY
 */
const formatDate = (date = new Date(), fmt = 'MM/DD/YYYY') => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const yy = String(yyyy).slice(-2);
  const mmm = MONTH_SHORT[d.getMonth()];
  switch (fmt) {
    case 'DD/MM/YYYY':   return `${dd}/${mm}/${yyyy}`;
    case 'YYYY/MM/DD':   return `${yyyy}/${mm}/${dd}`;
    case 'MM-DD-YYYY':   return `${mm}-${dd}-${yyyy}`;
    case 'DD-MM-YYYY':   return `${dd}-${mm}-${yyyy}`;
    case 'YYYY-MM-DD':   return `${yyyy}-${mm}-${dd}`;
    case 'MM/DD/YY':     return `${mm}/${dd}/${yy}`;
    case 'DD/MM/YY':     return `${dd}/${mm}/${yy}`;
    case 'MMM DD, YYYY': return `${mmm} ${dd}, ${yyyy}`;
    case 'MM/DD/YYYY':
    default:             return `${mm}/${dd}/${yyyy}`;
  }
};

// Default (MM/DD/YYYY) — named for readability in callers
const formatLocalMMDDYYYY = (date = new Date()) => formatDate(date, 'MM/DD/YYYY');

// Resolve a field's radio-group identity (new `groupName` model preferred, fallback to field.id)
const getRadioGroupName = (field) => field.groupName || field.group_name || `__single_${field.id}`;

/**
 * Responsive font-size for text-like fields. Never exceeds the author's
 * configured size; scales down when the box is too small to fit. Keeps the
 * field content strictly inside its bounding box.
 *
 *   baseSize — px value from field.style.fontSize (or default)
 *   fieldHeight — field height in px
 *   fieldWidth  — field width in px (used to clamp very narrow fields)
 */
const resolveResponsiveFontSize = (baseSize, fieldHeight, fieldWidth) => {
  const base = Math.max(6, Number(baseSize) || 10);
  // Phase 82.1 — Refined font scaling: use 0.85 multiplier (was 0.70) to
  // better respect authored font sizes. Reduces the aggressive "shrink"
  // that made 12px look smaller than 11px document text.
  const heightCap = Math.max(6, Math.floor((fieldHeight - 2) * 0.85));
  // Relax the width cap — 1em ≈ 0.5px per char is too aggressive for
  // signature/initials fields which are wide.
  const widthCap = Math.max(6, Math.floor(fieldWidth / 2.5));
  return Math.min(base, heightCap, widthCap);
};

/**
 * DateFieldInput — Hybrid-uncontrolled date input for signing fields.
 *
 * Root cause of "month/day erased while typing year":
 *   Native <input type="date"> manages MM / DD / YYYY as three separate
 *   browser-owned spinbutton sections. React's controlled `value=""` prop
 *   resets ALL sections on every render — so while the signer types the year
 *   (and the date is still "incomplete", so onChange fires with ""), React
 *   immediately overrides the input back to empty, wiping out the month and
 *   day the signer already entered.
 *
 * Fix: use `defaultValue` (uncontrolled) so React never touches the DOM value
 * after mount. A useEffect + ref handles the one case where we DO want to
 * override from outside: linked-field sync and CRM prefill.
 */
const DateFieldInput = React.memo(function DateFieldInput({
  fieldId,
  isoValue,
  dateFormat,
  onCommit,
  onEnterNext,
  isDisabled,
  className,
  style,
  title,
}) {
  const inputRef = useRef(null);

  // Sync external value changes (linked fields, CRM prefill) via DOM ref.
  // We deliberately avoid the `value` prop — setting `value=""` while the
  // signer is mid-entry would reset the browser's section state.
  useEffect(() => {
    const el = inputRef.current;
    if (el && el.value !== (isoValue || '')) {
      el.value = isoValue || '';
    }
  }, [isoValue]);

  return (
    <input
      ref={inputRef}
      type="date"
      defaultValue={isoValue || ''}
      disabled={isDisabled}
      className={className}
      style={style}
      title={title}
      data-testid={`field-${fieldId}`}
      onChange={(e) => {
        const v = e.target.value;
        // Empty string means the date is incomplete (year not finished yet) —
        // do nothing so the browser keeps its partial section state.
        if (!v) return;
        const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        // Guard against browser partial-entry auto-completions (0002, 0020 …)
        if (mm && +mm[1] >= 1000) {
          onCommit(formatDate(new Date(+mm[1], +mm[2] - 1, +mm[3]), dateFormat));
        }
      }}
      onBlur={(e) => {
        const v = e.target.value || '';
        if (!v) {
          // Signer left the field empty (cleared or never completed) — clear stored value
          onCommit('');
        } else if (typeof onEnterNext === 'function') {
          // Valid date committed and focus moved away — advance to next field
          onEnterNext();
        }
      }}
    />
  );
});

const InteractiveDocumentViewer = ({
  pdfUrl,
  fields: rawFields = [],
  onFieldsChange,
  readOnly = false,
  showSignatureModal,
  externalFieldValues = {},  // Accept external field values (like signatures)
  activeFieldId = null,      // For guided fill-in: the field to highlight + scroll to
  onHiddenFieldsChange,      // Callback: (Set<string>) => void — emitted when conditional-logic visibility changes
  onFieldClick,              // Optional: (fieldId) => void — called when any interactive field is clicked (for guided sync)
  onEnterNext,               // Phase 81.78 — Enter key from single-line text advances to next field
  scrollToken = 0,           // Phase 81.79 — bump this from parent to trigger scroll-to-active-field on explicit Start/Next/Enter actions only
}) => {
  // Normalize incoming fields so EVERY field has a fieldKey. Backward-compat:
  // legacy templates without fieldKey get a UNIQUE auto-generated key per field,
  // which means they remain INDEPENDENT (no sync). Fields that already have a
  // fieldKey (e.g., duplicates from Phase-48 builder) retain it → linked.
  const fields = useMemo(() => {
    return (rawFields || []).map(f => {
      if (!f) return f;
      if (f.fieldKey) return f;
      return {
        ...f,
        fieldKey: `fk_runtime_${f.id || Math.random().toString(36).slice(2, 10)}`,
      };
    });
  }, [rawFields]);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [fieldValues, setFieldValues] = useState({});
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState('scroll'); // 'page' or 'scroll' — Phase 72 default = scroll per product spec
  const [pdfPageHeights, setPdfPageHeights] = useState({});
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const PDF_WIDTH = 800;
  const PAGE_GAP = 16; // gap between pages in scroll mode

  // Phase 75 (mobile responsive): when the viewer container is narrower than
  // PDF_WIDTH, we visually scale down the PDF + field overlays using a CSS
  // transform. This preserves the internal coordinate system (fields stay at
  // their stored x/y/width/height relative to PDF_WIDTH), while letting the
  // canvas fit phones at 320–430px width. Desktop (>= PDF_WIDTH) stays 1x.
  const [viewportScale, setViewportScale] = useState(1);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const compute = () => {
      // Account for the viewer's own padding (p-2 sm:p-6 → ~16–48px) by
      // subtracting a safe inset so the scaled PDF never touches the edges.
      const inset = window.innerWidth < 640 ? 20 : 48;
      const available = Math.max(0, el.clientWidth - inset);
      if (available <= 0) return;
      const next = Math.min(1, available / PDF_WIDTH);
      setViewportScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  // Memoize the file prop to prevent infinite reload loops in react-pdf
  const pdfFile = useMemo(() => ({ url: pdfUrl }), [pdfUrl]);

  // Sync with external field values (from parent component)
  useEffect(() => {
    if (Object.keys(externalFieldValues).length > 0) {
      setFieldValues(prev => ({ ...prev, ...externalFieldValues }));
    }
  }, [externalFieldValues]);

  // ─── Auto-fill date fields with today's local date (field-chosen format) ───
  // Only date fields in 'auto' mode (or legacy with undefined dateMode) are auto-
  // filled. 'manual' mode fields stay empty for the signer to pick.
  // Phase 64: Strict recipient ownership — skip fields the active recipient
  // doesn't own (field_disabled / field_hidden set by the parent mapping) so
  // auto-fill never leaks values into another signer's fields. Phase 65 also
  // skips readOnly fields (unassigned-but-already-signed values) to avoid
  // re-stamping dates on another recipient's completed row.
  useEffect(() => {
    if (!fields || fields.length === 0) return;
    setFieldValues(prev => {
      let changed = false;
      const next = { ...prev };
      fields.forEach(f => {
        if ((f.type || f.field_type) !== 'date') return;
        if (f.field_disabled || f.field_hidden || f.readOnly) return;
        const mode = f.dateMode || 'auto';
        if (mode !== 'auto') return;
        if (next[f.id]) return;
        const fmt = DATE_FORMATS.includes(f.dateFormat) ? f.dateFormat : 'MM/DD/YYYY';
        next[f.id] = formatDate(new Date(), fmt);
        changed = true;
      });
      if (!changed) return prev;
      if (onFieldsChange) onFieldsChange(next);
      return next;
    });
  }, [fields, onFieldsChange]);

  // ─── Auto-select default radio option ───
  // If the signer hasn't made a choice yet AND a radio field is flagged
  // `defaultChecked`, pre-select it so recipients see the intended default
  // (they can still change it). One default per group — first wins.
  // Phase 64/65: respect strict recipient ownership (skip disabled/hidden/readOnly).
  useEffect(() => {
    if (!fields || fields.length === 0) return;
    setFieldValues(prev => {
      let changed = false;
      const next = { ...prev };
      const seenGroups = new Set();
      fields.forEach(f => {
        if ((f.type || f.field_type) !== 'radio') return;
        if (f.field_disabled || f.field_hidden || f.readOnly) return;
        if (!f.defaultChecked) return;
        const group = getRadioGroupName(f);
        if (seenGroups.has(group)) return;
        seenGroups.add(group);
        if (next[group] !== undefined && next[group] !== '') return; // user already chose / value already set
        const val = f.optionValue || f.option_value || f.id;
        next[group] = val;
        changed = true;
      });
      if (!changed) return prev;
      if (onFieldsChange) onFieldsChange(next);
      return next;
    });
  }, [fields, onFieldsChange]);

  // ─── Auto-check default checkbox ───
  // Phase 81.53 — Builder author can flag a checkbox `checked: true` to mean
  // "default checked". The signing UI must mirror that: pre-seed
  // fieldValues[field.id] = true so the checkbox renders as checked on first
  // render. Signers can still uncheck. Skip disabled / hidden / readOnly
  // fields and never overwrite an explicit prior value.
  useEffect(() => {
    if (!fields || fields.length === 0) return;
    setFieldValues(prev => {
      let changed = false;
      const next = { ...prev };
      fields.forEach(f => {
        if ((f.type || f.field_type) !== 'checkbox') return;
        if (f.field_disabled || f.field_hidden || f.readOnly) return;
        // Default-checked flag lives on `field.checked` (legacy schema) or
        // `field.defaultChecked` (newer schema for parity with radio).
        const defaultOn = f.checked === true || f.defaultChecked === true;
        if (!defaultOn) return;
        if (next[f.id] !== undefined && next[f.id] !== '') return;
        if (externalFieldValues[f.id] !== undefined && externalFieldValues[f.id] !== '') return;
        next[f.id] = true;
        changed = true;
      });
      if (!changed) return prev;
      if (onFieldsChange) onFieldsChange(next);
      return next;
    });
  }, [fields, onFieldsChange, externalFieldValues]);

  // ─── Phase 81.11: Pre-seed default values for text + merge-fallback fields ───
  // Author-configured `defaultValue` / `default_value` is shown to the signer
  // as actual content (not just a placeholder), so if the signer leaves the
  // field unedited, the value still persists into `fieldValues` and reaches
  // the final stamped PDF + webhook payload. Skip fields the active recipient
  // doesn't own and any field that already has a value.
  useEffect(() => {
    if (!fields || fields.length === 0) return;
    setFieldValues(prev => {
      let changed = false;
      const next = { ...prev };
      fields.forEach(f => {
        const t = (f.type || f.field_type || '').toLowerCase();
        if (t !== 'text' && t !== 'merge') return;
        if (f.field_disabled || f.field_hidden) return;
        // Merge fields: only pre-seed when fallback input is active (signer
        // is supposed to enter a value). CRM-resolved merges aren't user
        // inputs and shouldn't be over-stamped with defaultValue.
        if (t === 'merge' && !f.fallbackToInput) return;
        // Date-type merge fallback uses date picker, not free text — skip.
        if (t === 'merge' && (f.fallbackInputType === 'date' || f.fallbackInputType === 'checkbox')) return;
        const def = f.defaultValue ?? f.default_value;
        if (def === undefined || def === null || String(def) === '') return;
        if (next[f.id] !== undefined && next[f.id] !== '') return;
        if (externalFieldValues[f.id] !== undefined && externalFieldValues[f.id] !== '') return;
        next[f.id] = String(def);
        changed = true;
      });
      if (!changed) return prev;
      if (onFieldsChange) onFieldsChange(next);
      return next;
    });
  }, [fields, externalFieldValues, onFieldsChange]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = (page) => {
    setPageSize({ width: page.width, height: page.height });
  };

  // Track individual page heights for scroll mode
  const handleScrollPageLoad = useCallback((pageNum, page) => {
    setPdfPageHeights(prev => {
      if (prev[pageNum] === page.height) return prev;
      return { ...prev, [pageNum]: page.height };
    });
  }, []);

  // Calculate cumulative offsets for scroll mode
  const scrollPageOffsets = useMemo(() => {
    if (!numPages) return [0];
    const offsets = [0];
    for (let i = 1; i < numPages; i++) {
      const prevHeight = pdfPageHeights[i] || pageSize.height || 1035;
      offsets.push(offsets[i - 1] + prevHeight + PAGE_GAP);
    }
    return offsets;
  }, [numPages, pdfPageHeights, pageSize.height]);

  const handleFieldChange = (fieldId, value) => {
    const srcField = fieldsById.get(fieldId);
    const srcType = ((srcField?.type || srcField?.field_type) || '').toLowerCase();

    // Field linking: if the source field has a `fieldKey` AND it's a text field,
    // broadcast the value to all OTHER fields sharing the same key that are
    // visible (not conditionally hidden) and not disabled. Backward-compatible:
    // fields without a fieldKey only update themselves.
    const newValues = { ...fieldValues, [fieldId]: value };
    const syncedIds = [fieldId];
    if (srcField && srcField.fieldKey && srcType === 'text') {
      (fields || []).forEach(f => {
        if (!f || f.id === fieldId) return;
        if (f.fieldKey !== srcField.fieldKey) return;
        if ((f.type || f.field_type || '').toLowerCase() !== 'text') return;
        if (f.field_disabled) return;
        if (f.field_hidden) return;
        if (f.readOnly) return;
        if (hiddenFieldIds && hiddenFieldIds.has(f.id)) return;
        newValues[f.id] = value;
        syncedIds.push(f.id);
      });
    }
    setFieldValues(newValues);
    if (onFieldsChange) {
      onFieldsChange(newValues);
    }
  };

  // Radio (new groupName model): selecting one sets the group's value
  const handleRadioSelect = (field) => {
    const group = getRadioGroupName(field);
    const value = field.optionValue || field.option_value || field.id;
    const newValues = { ...fieldValues, [group]: value, [field.id]: value };
    setFieldValues(newValues);
    if (onFieldsChange) onFieldsChange(newValues);
  };

  // ─── Conditional logic evaluator ───────────────────────────
  // Supports TWO builder formats:
  //
  //  Format A — SOURCE-side rules (what MultiPageVisualBuilder saves):
  //    sourceField.conditionalRules = [
  //      { triggerValue, triggerCondition?, action: 'show'|'hide', targetFieldId }
  //    ]
  //
  //  Format B — TARGET-side rules (legacy / external):
  //    targetField.conditionalLogic = {
  //      operator?: 'AND'|'OR', action, rules: [{ sourceFieldId, condition, value }]
  //    }
  //
  // Evaluated against current fieldValues AND externalFieldValues on every render
  // so show/hide reacts both on initial load and on every user change.
  // Phase 81.59 — Visibility evaluator extracted to utils/conditionalLogic
  // so PackagePublicView and PackagePublicLinkView can compute the same
  // hidden set independently of the accordion mount state.
  const hiddenFieldIds = useMemo(() => {
    const values = { ...externalFieldValues, ...fieldValues };
    return computeHiddenFieldIds(fields, values);
  }, [fields, fieldValues, externalFieldValues]);

  // Emit hidden field IDs to parent so guided fill-in can skip them.
  // Compare by contents to avoid triggering a state update (and subsequent
  // re-render loop) when the Set reference changed but the hidden IDs are
  // logically the same.
  const lastEmittedHiddenRef = useRef(null);
  useEffect(() => {
    if (!onHiddenFieldsChange) return;
    const prev = lastEmittedHiddenRef.current;
    const prevSize = prev ? prev.size : -1;
    const sameSize = prev && prev.size === hiddenFieldIds.size;
    let sameContents = sameSize;
    if (sameContents) {
      for (const id of hiddenFieldIds) {
        if (!prev.has(id)) { sameContents = false; break; }
      }
    }
    if (sameContents && prevSize !== -1) return;
    lastEmittedHiddenRef.current = hiddenFieldIds;
    // Defer to next tick to avoid React's "Cannot update a component while
    // rendering a different component" warning when the parent is still mid-render.
    const t = setTimeout(() => {
      if (onHiddenFieldsChange) onHiddenFieldsChange(hiddenFieldIds);
    }, 0);
    return () => clearTimeout(t);
  }, [hiddenFieldIds, onHiddenFieldsChange]);

  // When the active required field changes, switch to the correct page
  // (in page mode) and scroll the field into view.
  const fieldsById = useMemo(() => {
    const m = new Map();
    (fields || []).forEach(f => m.set(f.id, f));
    return m;
  }, [fields]);

  const lastFocusedFieldRef = useRef(null);

  // Phase 81.78 — Scroll a field into view WITHIN the viewer's internal scroll
  // container ONLY. Previously `el.scrollIntoView({ block: 'center' })` also
  // scrolled the nearest scrolling ancestor — which on public signing pages is
  // the window — pushing the sticky header + Next button below the fold after
  // clicking Start. By computing the target scrollTop against the container
  // directly we keep the outer page scroll untouched.
  const scrollFieldIntoContainer = useCallback((el) => {
    if (!el) return;
    const container = scrollContainerRef.current;
    if (!container) {
      // Fallback to default behaviour; unlikely path.
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    const fieldRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // Already comfortably within viewport of the container? Don't move.
    const margin = 80;
    if (
      fieldRect.top >= containerRect.top + margin &&
      fieldRect.bottom <= containerRect.bottom - margin
    ) {
      return;
    }
    const currentScroll = container.scrollTop;
    const delta = (fieldRect.top - containerRect.top) - (container.clientHeight / 2) + (fieldRect.height / 2);
    const target = Math.max(0, currentScroll + delta);
    try {
      container.scrollTo({ top: target, behavior: 'smooth' });
    } catch (_) {
      container.scrollTop = target;
    }
  }, []);

  // Phase 81.79 — Page-mode: when activeFieldId crosses a page boundary,
  // sync currentPage so the user can SEE the active field's page. This is
  // a layout sync, not a scroll, and is safe to run on any active-field
  // change (including auto-advance + click sync).
  useEffect(() => {
    if (!activeFieldId) return;
    const f = fieldsById.get(activeFieldId);
    if (!f) return;
    if (viewMode === 'page' && f.page && f.page !== currentPage) {
      setCurrentPage(f.page);
    }
  }, [activeFieldId, viewMode, currentPage, fieldsById]);

  // Phase 81.79 — Scroll + focus side-effect runs ONLY when the parent bumps
  // `scrollToken` (i.e. user clicked Start, Next, or pressed Enter). Field
  // clicks, auto-advance after a fill, and initial page load do NOT trigger
  // scroll — the user keeps their visual context.
  useEffect(() => {
    if (scrollToken === 0) return;
    if (!activeFieldId) return;
    const f = fieldsById.get(activeFieldId);
    if (!f) return;
    lastFocusedFieldRef.current = activeFieldId;

    // Wait for DOM update before scrolling. In page mode the PDF page may still
    // be loading when the effect fires → retry with short polling up to ~1s.
    const timers = [];
    let attempts = 0;
    const MAX_ATTEMPTS = 8;    // 8 × 120ms ≈ 960ms
    const attempt = () => {
      attempts += 1;
      const el = document.querySelector(`[data-field-wrapper="${activeFieldId}"]`);
      if (el) {
        // First, bring the active field into view by scrolling the OUTER window
        // if the field is currently below the visible viewport. We do this
        // gently — only if needed — so the user always SEES where the focus
        // moved to after Start/Next/Enter.
        try {
          const r = el.getBoundingClientRect();
          const vh = window.innerHeight || document.documentElement.clientHeight || 0;
          // Approx header height (sticky outer header + sticky doc header).
          const headerOffset = 200;
          if (r.top < headerOffset || r.bottom > vh - 40) {
            const targetY = window.scrollY + r.top - headerOffset;
            window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
          }
        } catch (_) { /* noop */ }
        // Then scroll inside the viewer's own scroll container if the field
        // isn't centred there yet.
        scrollFieldIntoContainer(el);
        setTimeout(() => {
          try {
            const fieldType = (f.type || f.field_type || '').toLowerCase();
            if ((fieldType === 'signature' || fieldType === 'initials')
              && !f.readOnly && !f.field_disabled
              && typeof showSignatureModal === 'function'
              && !(fieldValues?.[f.id] || externalFieldValues?.[f.id])) {
              showSignatureModal(f.id, fieldType === 'initials');
              return;
            }
            const focusable = el.querySelector(
              'input:not([disabled]), textarea:not([disabled]), button:not([disabled])'
            );
            if (focusable && typeof focusable.focus === 'function') {
              focusable.focus({ preventScroll: true });
              if (focusable.setSelectionRange && typeof focusable.value === 'string') {
                const len = focusable.value.length;
                try { focusable.setSelectionRange(len, len); } catch (_) { /* noop */ }
              }
            }
          } catch (_) { /* noop */ }
        }, 360);
        return;
      }
      if (attempts < MAX_ATTEMPTS) {
        timers.push(setTimeout(attempt, 120));
      }
    };
    timers.push(setTimeout(attempt, 60));
    return () => timers.forEach(clearTimeout);
  }, [scrollToken, activeFieldId, fieldsById, scrollFieldIntoContainer, fieldValues, externalFieldValues, showSignatureModal]);

  // Phase 78: floating "Fill In" side indicator — DocuSign-style left-gutter
  // badge that tracks the active field vertically. Updates on active-field
  // change, scroll, and viewport resize. Position is expressed relative to
  // the scroll container (which owns the scrollbar), so the badge moves
  // with the document content naturally.
  const [fillInTop, setFillInTop] = useState(null);
  // Phase 81.8 — also track the left edge of the PDF page relative to the
  // scroll container so the Fill In badge sits just inside the document
  // margin (not floating in the gray gutter).
  const [docPageLeft, setDocPageLeft] = useState(8);
  const computeFillInTop = useCallback(() => {
    if (!activeFieldId) { setFillInTop(null); return; }
    const container = scrollContainerRef.current;
    if (!container) { setFillInTop(null); return; }
    const el = document.querySelector(`[data-field-wrapper="${activeFieldId}"]`);
    if (!el) { setFillInTop(null); return; }
    const fieldRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // Center the 28px-tall badge vertically against the field.
    // `top` is relative to the scroll container (absolute positioning).
    const top = (fieldRect.top - containerRect.top) + container.scrollTop + (fieldRect.height / 2) - 14;
    setFillInTop(top);

    // Left offset: find the nearest rendered PDF page element (class
    // `react-pdf__Page` or the parent bg-white wrapper) and align the badge
    // a few pixels INSIDE its left edge. Fall back to 8px if not yet rendered.
    try {
      const pageEl = container.querySelector('.react-pdf__Page') || container.querySelector('.bg-white');
      if (pageEl) {
        const pRect = pageEl.getBoundingClientRect();
        const left = Math.max(0, (pRect.left - containerRect.left) + container.scrollLeft);
        setDocPageLeft(left);
      }
    } catch (_) { /* noop */ }
  }, [activeFieldId]);

  useEffect(() => {
    // Re-compute on active field change + after short delays to catch
    // smooth-scroll animation finishing.
    computeFillInTop();
    const timers = [
      setTimeout(computeFillInTop, 250),
      setTimeout(computeFillInTop, 600),
      setTimeout(computeFillInTop, 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [computeFillInTop, viewMode, currentPage]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => computeFillInTop();
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [computeFillInTop]);

  // Click handler on the badge re-scrolls to the active field AND focuses
  // its input — so signers can use the Fill In badge as a one-click
  // "continue from here" affordance.
  const scrollToActiveField = useCallback(() => {
    if (!activeFieldId) return;
    const el = document.querySelector(`[data-field-wrapper="${activeFieldId}"]`);
    if (el) {
      scrollFieldIntoContainer(el);
    }
    // Focus after scroll completes (smooth ≈ 300ms)
    setTimeout(() => {
      try {
        if (!el) return;
        const f = fieldsById.get(activeFieldId);
        const fieldType = (f?.type || f?.field_type || '').toLowerCase();
        if ((fieldType === 'signature' || fieldType === 'initials')
          && !f?.readOnly && !f?.field_disabled
          && typeof showSignatureModal === 'function'
          && !(fieldValues?.[activeFieldId] || externalFieldValues?.[activeFieldId])) {
          showSignatureModal(activeFieldId, fieldType === 'initials');
          return;
        }
        const focusable = el.querySelector(
          'input:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        );
        if (focusable && typeof focusable.focus === 'function') {
          focusable.focus({ preventScroll: true });
        }
      } catch (_) { /* noop */ }
    }, 320);
  }, [activeFieldId, fieldsById, scrollFieldIntoContainer, fieldValues, externalFieldValues, showSignatureModal]);

  const renderField = (field) => {
    const fieldValue = fieldValues[field.id] !== undefined ? fieldValues[field.id] : externalFieldValues[field.id];
    const isFieldReadOnly = field.readOnly === true;
    const isDisabled = readOnly || field.field_disabled || isFieldReadOnly;
    const disabledStyle = field.field_disabled
      ? 'opacity-60 cursor-not-allowed'
      : isFieldReadOnly ? 'opacity-70 cursor-not-allowed' : '';

    // Phase 81.51 — Show Label in Preview / Signing toggle. When the author
    // unchecks "Show Label in Preview / Signing" in the Builder, the recipient
    // never sees the field's label as fallback placeholder/visible text.
    // The label remains stored in DB / Admin Builder / API for internal use.
    const visibleLabel = field.showLabelInPreview === false ? '' : (field.label || '');

    // Phase 81.36 — when the field is READ-ONLY due to a previous-recipient
    // completion (Phase 81.30 visibility rules already gated this branch
    // to "owned by another recipient AND has a value"), render a borderless
    // "printed" version so the next signer sees prior data as if it were
    // baked into the PDF — no blue/indigo/amber field outlines, no hover
    // states, no editable styling. Owner-of-this-field signers and unassigned
    // signers (field_disabled true OR readOnly false) still get the normal
    // interactive styling so they can fill in their own fields.
    if (isFieldReadOnly && !field.field_disabled) {
      const t = (field.type || field.field_type || '').toLowerCase();
      // Resolve the value the same way the active-render path does so the
      // printed view is byte-identical to what the prior signer entered.
      let displayValue = fieldValue;
      if (t === 'radio') {
        const group = getRadioGroupName(field);
        const optionValue = field.optionValue || field.option_value || field.id;
        const groupValue = fieldValues[group] ?? externalFieldValues[group];
        const isSelected = groupValue === optionValue || (
          Array.isArray(field.radioOptions) && fieldValue
        );
        if (!isSelected) return null;
        // Phase 81.38 — Match the signed-PDF radio glyph exactly: an outer
        // circle with a small filled inner dot, sized to the field's smaller
        // dimension so it renders as a true circle (not a flattened
        // rectangle when the author drew a wide bounding box).
        // Phase 81.39 — Wrapper carries an opaque white background so any
        // underlying empty PDF radio mark is fully masked beneath our glyph.
        const dim = Math.max(8, Math.min(field.width || 16, field.height || 16) - 2);
        return (
          <div
            className="w-full h-full flex items-center justify-center pointer-events-none bg-white"
            data-testid={`field-${field.id}`}
            data-readonly-printed="true"
          >
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{
                width: `${dim}px`,
                height: `${dim}px`,
                border: '1.5px solid #000',
                background: '#fff',
              }}
            >
              <span
                className="inline-block rounded-full bg-black"
                style={{
                  width: `${Math.max(4, Math.floor(dim * 0.55))}px`,
                  height: `${Math.max(4, Math.floor(dim * 0.55))}px`,
                }}
              />
            </span>
          </div>
        );
      }
      if (t === 'checkbox') {
        const checked = fieldValue === true || fieldValue === 'true';
        if (!checked) return null;
        // Phase 81.38 — Match the signed-PDF checkbox glyph exactly: a small
        // outlined square with a checkmark inside, sized to the field's
        // smaller dimension so it stays a true square.
        // Phase 81.39 — Wrapper carries an opaque white background so any
        // underlying empty PDF checkbox mark is fully masked beneath our glyph.
        const dim = Math.max(10, Math.min(field.width || 16, field.height || 16) - 2);
        return (
          <div
            className="w-full h-full flex items-center justify-center pointer-events-none bg-white"
            data-testid={`field-${field.id}`}
            data-readonly-printed="true"
          >
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: `${dim}px`,
                height: `${dim}px`,
                border: '1.5px solid #000',
                background: '#fff',
              }}
            >
              <Check
                style={{
                  width: `${Math.max(8, Math.floor(dim * 0.85))}px`,
                  height: `${Math.max(8, Math.floor(dim * 0.85))}px`,
                  color: '#000',
                  strokeWidth: 3,
                }}
              />
            </span>
          </div>
        );
      }
      if (t === 'signature' || t === 'initials') {
        if (!displayValue) {
          return (
            <div
              className="w-full h-full border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400 bg-gray-50/30"
              data-readonly-printed="true"
            >
              {t === 'signature' ? 'Signature' : 'Initials'}
            </div>
          );
        }
        const align = field.style?.textAlign || field.alignment || 'center';
        const justify = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';
        return (
          <div
            className={`w-full h-full flex items-center ${justify} pointer-events-none`}
            data-testid={`field-${field.id}`}
            data-readonly-printed="true"
          >
            <img src={displayValue} alt={t === 'signature' ? 'Signature' : 'Initials'}
                 className="max-w-full max-h-full object-contain" />
          </div>
        );
      }
      if (t === 'date') {
        // Stored value already in the field's chosen format — render as text.
        if (!displayValue) {
          return (
            <div
              className="w-full h-full border border-dashed border-gray-300 flex items-center px-1 text-[10px] text-gray-400 bg-gray-50/30"
              data-readonly-printed="true"
            >
              {field.placeholder || 'Date'}
            </div>
          );
        }
        const baseFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const effectiveFs = resolveResponsiveFontSize(baseFs, field.height, field.width);
        const align = field.style?.textAlign || 'left';
        const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
        return (
          <div
            className="w-full h-full flex items-center px-1 pointer-events-none whitespace-nowrap"
            style={{
              justifyContent: justify,
              fontFamily: field.style?.fontFamily || undefined,
              fontSize: `${effectiveFs}px`,
              fontWeight: field.style?.fontWeight || undefined,
              fontStyle: field.style?.fontStyle || undefined,
              textDecoration: field.style?.textDecoration || undefined,
              color: field.style?.color || '#111827',
              lineHeight: 1,
            }}
            data-testid={`field-${field.id}`}
            data-readonly-printed="true"
          >
            {displayValue}
          </div>
        );
      }
      if (t === 'text') {
        if (displayValue === undefined || displayValue === null || displayValue === '') {
          return (
            <div
              className="w-full h-full border border-dashed border-gray-300 flex items-center px-1 text-[10px] text-gray-400 bg-gray-50/30"
              data-readonly-printed="true"
            >
              {field.placeholder || ''}
            </div>
          );
        }
        const baseFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const effectiveFs = resolveResponsiveFontSize(baseFs, field.height, field.width);
        // Phase 81.41 — Single-line read-only text stays on one line (clipped
        // if too long). Multi-line wraps as before. Honours the Visual
        // Builder's Field Type dropdown so the printed view matches what was
        // configured.
        const isMultiline = field.fieldSubType === 'multi-line'
          || (field.fieldSubType !== 'single-line' && Boolean(field.multiline));
        return (
          <div
            className="w-full h-full px-1 py-0.5 pointer-events-none"
            style={{
              fontFamily: field.style?.fontFamily || undefined,
              fontSize: `${effectiveFs}px`,
              fontWeight: field.style?.fontWeight || undefined,
              fontStyle: field.style?.fontStyle || undefined,
              textAlign: field.style?.textAlign || 'left',
              color: field.style?.color || '#111827',
              whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap',
              wordBreak: isMultiline ? 'break-word' : 'normal',
              lineHeight: isMultiline ? 1.25 : 1,
              overflow: 'hidden',
              textOverflow: isMultiline ? 'clip' : 'ellipsis',
            }}
            data-testid={`field-${field.id}`}
            data-readonly-printed="true"
          >
            {String(displayValue)}
          </div>
        );
      }
      if (t === 'dropdown') {
        if (!displayValue) {
          return (
            <div
              className="w-full h-full border border-dashed border-gray-300 flex items-center px-1 text-[10px] text-gray-400 bg-gray-50/30"
              data-readonly-printed="true"
            >
              {field.placeholder || 'Select...'}
            </div>
          );
        }
        const baseFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const effectiveFs = resolveResponsiveFontSize(baseFs, field.height, field.width);
        return (
          <div
            className="w-full h-full px-1 py-0.5 pointer-events-none flex items-center"
            style={{
              fontFamily: field.style?.fontFamily || undefined,
              fontSize: `${effectiveFs}px`,
              fontWeight: field.style?.fontWeight || undefined,
              fontStyle: field.style?.fontStyle || undefined,
              textAlign: field.style?.textAlign || 'left',
              color: field.style?.color || '#111827',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            data-testid={`field-${field.id}`}
            data-readonly-printed="true"
          >
            {String(displayValue)}
          </div>
        );
      }
      // Merge / label / unknown → fall through to the default render path
      // (merge already has its own read-only path; label is static text).
    }

    switch (field.type || field.field_type) {
      case 'text': {
        const baseFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const effectiveFs = resolveResponsiveFontSize(baseFs, field.height, field.width);
        // Phase 81.9 — text fields ALWAYS render as <textarea> with
        // pre-wrap + word-break so long input wraps INSIDE the field box
        // instead of overflowing into surrounding document content.
        // Multi-line vs single-line distinction is purely about Enter handling:
        //   - single-line → Enter is blocked (does nothing; user must Tab/Next)
        //   - multi-line  → Enter inserts a newline naturally
        const lineHeight = Math.max(effectiveFs * 1.25, 16);
        const autoMulti = field.height >= lineHeight * 1.9;
        // Phase 81.23 — Honour the Visual Builder's `fieldSubType` dropdown
        // so a field explicitly set to "Multi-Line Text" wraps and accepts
        // newlines even when the author drew a small box; conversely, an
        // author-set "Single-Line Text" stays single-line regardless of
        // box height. `field.multiline` is kept as a back-compat fallback.
        const explicitMulti = field.fieldSubType === 'multi-line';
        const explicitSingle = field.fieldSubType === 'single-line';
        const isMultiline = explicitMulti
          ? true
          : explicitSingle
            ? false
            : (Boolean(field.multiline) || autoMulti);
        // Phase 81.41 — Single-line and multi-line text fields now render with
        // strictly different wrapping behaviour to match the Visual Builder's
        // Field Type dropdown:
        //   - single-line: whiteSpace=nowrap so text NEVER wraps; long values
        //     scroll horizontally inside the box.
        //   - multi-line: whiteSpace=pre-wrap (existing behaviour) so text
        //     wraps inside the box and newlines are honoured.
        const textStyle = {
          fontFamily: field.style?.fontFamily || undefined,
          fontSize: `${effectiveFs}px`,
          fontWeight: field.style?.fontWeight || undefined,
          fontStyle: field.style?.fontStyle || undefined,
          textDecoration: field.style?.textDecoration || undefined,
          textAlign: field.style?.textAlign || undefined,
          color: field.style?.color || undefined,
          whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap',
          wordBreak: isMultiline ? 'break-word' : 'normal',
          overflowX: isMultiline ? 'hidden' : 'auto',
          overflowY: isMultiline ? 'auto' : 'hidden',
          lineHeight: isMultiline ? 1.25 : 1,
          resize: 'none',
        };
        const handleKeyDown = (e) => {
          if (!isMultiline && e.key === 'Enter' && !e.shiftKey) {
            // Phase 81.78 — Single-line text: block default so no newline is
            // inserted; the container-level keyDown handler above advances to
            // the next field via onEnterNext (avoids double-firing here).
            e.preventDefault();
          }
        };
        // Phase 81.41 — Use <input type="text"> for single-line and
        // <textarea> for multi-line so the native control matches the
        // configured field type. Prevents single-line fields from wrapping
        // into multi-row visual boxes when the entered text is long.
        const sharedClass = `w-full h-full px-2 py-1 border-2 border-blue-400 bg-blue-50 rounded focus:ring-2 focus:ring-blue-400 focus:border-transparent ${disabledStyle}`;
        const sharedTitle = field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : '';
        if (!isMultiline) {
          return (
            <input
              type="text"
              value={fieldValue || ''}
              onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={field.placeholder || field.defaultValue || visibleLabel || 'Enter text...'}
              disabled={isDisabled}
              className={sharedClass}
              style={textStyle}
              title={sharedTitle}
              data-testid={`field-${field.id}`}
              maxLength={field.characterLimit || undefined}
            />
          );
        }
        return (
          <textarea
            value={fieldValue || ''}
            onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder || field.defaultValue || visibleLabel || 'Enter text...'}
            disabled={isDisabled}
            className={sharedClass}
            style={textStyle}
            title={sharedTitle}
            data-testid={`field-${field.id}`}
          />
        );
      }

      case 'date': {
        const dateMode = field.dateMode || 'auto';
        const dateFormat = DATE_FORMATS.includes(field.dateFormat) ? field.dateFormat : 'MM/DD/YYYY';
        const alignJustify = field.style?.textAlign === 'center'
          ? 'justify-center'
          : field.style?.textAlign === 'right'
            ? 'justify-end'
            : 'justify-start';
        const textAlign = field.style?.textAlign || 'left';
        // Responsive date typography: shrinks to fit a small box so a value
        // like "12/31/2026" never spills beyond the author's bounding box.
        const baseDateFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const dateFs = resolveResponsiveFontSize(baseDateFs, field.height, field.width);

        // Parse any stored format back to a Date. Accept all 4 formats so that
        // a field whose format changed later still renders the stored value.
        const parseStoredDate = (s) => {
          if (!s) return null;
          let m;
          if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) {
            // Ambiguous MM/DD vs DD/MM — resolve via the CURRENT format.
            if (dateFormat === 'DD/MM/YYYY') return new Date(+m[3], +m[2] - 1, +m[1]);
            return new Date(+m[3], +m[1] - 1, +m[2]); // MM/DD/YYYY
          }
          if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
            return new Date(+m[1], +m[2] - 1, +m[3]);
          }
          if ((m = /^([A-Za-z]{3})\s+(\d{2}),\s*(\d{4})$/.exec(s))) {
            const mi = MONTH_SHORT.indexOf(m[1]);
            if (mi >= 0) return new Date(+m[3], mi, +m[2]);
          }
          const d = new Date(s);
          return Number.isNaN(d.getTime()) ? null : d;
        };

        if (dateMode === 'manual') {
          const parsed = parseStoredDate(fieldValue || '');
          const isoValue = parsed ? formatDate(parsed, 'YYYY-MM-DD') : '';
          const manualDateStyle = {
            fontFamily: field.style?.fontFamily || undefined,
            fontSize: `${dateFs}px`,
            fontWeight: field.style?.fontWeight || undefined,
            fontStyle: field.style?.fontStyle || undefined,
            textAlign: textAlign,
            lineHeight: 1,
            color: field.style?.color || undefined,
          };
          if (isDisabled) {
            return (
              <div
                className={`w-full h-full px-2 py-1 border-2 border-green-400 bg-green-50 rounded flex items-center ${alignJustify} ${disabledStyle}`}
                style={manualDateStyle}
                title={isFieldReadOnly ? 'Read-only' : ''}
                data-testid={`field-${field.id}`}
              >
                <span className="truncate">{fieldValue || dateFormat}</span>
              </div>
            );
          }
          return (
            <DateFieldInput
              fieldId={field.id}
              isoValue={isoValue}
              dateFormat={dateFormat}
              onCommit={(formatted) => handleFieldChange(field.id, formatted)}
              onEnterNext={onEnterNext}
              className="w-full h-full px-2 py-1 border-2 border-green-400 bg-green-50 rounded focus:ring-2 focus:ring-green-400 focus:border-transparent"
              style={manualDateStyle}
            />
          );
        }

        // Auto mode: fill with today's date in the field's chosen format.
        const displayValue = fieldValue || formatDate(new Date(), dateFormat);
        // Hide the small check icon when the box is too short to comfortably fit it.
        const showCheckIcon = (field.height || 0) >= 24;
        const autoDateStyle = {
          fontFamily: field.style?.fontFamily || undefined,
          fontSize: `${dateFs}px`,
          fontWeight: field.style?.fontWeight || undefined,
          fontStyle: field.style?.fontStyle || undefined,
          lineHeight: 1,
          color: field.style?.color || undefined,
        };
        return (
          <div
            className={`w-full h-full px-2 py-1 border-2 border-green-400 bg-green-50 rounded flex items-center ${alignJustify} ${disabledStyle}`}
            style={autoDateStyle}
            title={isFieldReadOnly ? 'Read-only' : 'Automatically filled with today\'s date'}
            data-testid={`field-${field.id}`}
          >
            {showCheckIcon && <Check className="h-3 w-3 text-green-600 mr-1 flex-shrink-0" />}
            <span className="font-medium truncate">{displayValue}</span>
          </div>
        );
      }

      case 'checkbox': {
        const checked = fieldValue === true || fieldValue === 'true';
        const labelText = field.checkboxLabel || field.label || 'I agree';
        return (
          <label
            className={`flex items-center justify-center w-full h-full px-2 rounded border-2 transition-colors bg-white ${
              checked
                ? 'border-amber-500'
                : 'border-amber-400'
            } ${!isDisabled ? 'cursor-pointer hover:bg-amber-50' : ''} ${disabledStyle}`}
            data-testid={`field-${field.id}`}
            title={labelText}
          >
            <span
              className={`relative inline-flex items-center justify-center w-5 h-5 rounded border-2 flex-shrink-0 transition-colors ${
                checked
                  ? 'border-amber-600 bg-amber-500'
                  : 'border-amber-500 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.checked)}
                disabled={isDisabled}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label={labelText}
              />
              {checked && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
            </span>
          </label>
        );
      }

      case 'radio': {
        // New model: field has { groupName, optionLabel, optionValue } — one option per field
        // Legacy model: field has { radioOptions: ['A','B'], selectedOption } — multiple options in one field
        const isLegacy = Array.isArray(field.radioOptions) && field.radioOptions.length > 0 && !field.optionValue && !field.option_value;

        if (isLegacy) {
          const options = field.radioOptions;
          const selectedVal = fieldValue || field.selectedOption || '';
          const isVertical = (field.radioLayout || 'vertical') === 'vertical';
          return (
            <div
              className={`w-full h-full px-2 py-1 rounded border-2 border-pink-400 bg-white ${disabledStyle}`}
              data-testid={`field-${field.id}`}
            >
              <div className={isVertical ? 'flex flex-col gap-1' : 'flex flex-wrap gap-3'}>
                {options.map((opt, i) => (
                  <label key={i} className={`flex items-center gap-1.5 text-xs text-gray-800 ${!isDisabled ? 'cursor-pointer' : ''}`}>
                    <input
                      type="radio"
                      name={`radio-${field.id}`}
                      checked={selectedVal === opt}
                      onChange={() => !isDisabled && handleFieldChange(field.id, opt)}
                      disabled={isDisabled}
                      className="w-3.5 h-3.5 text-pink-600 accent-pink-600"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        }

        // ─── New groupName model ───
        const group = getRadioGroupName(field);
        const optionValue = field.optionValue || field.option_value || field.id;
        const optionLabel = field.optionLabel || field.option_label || field.label || 'Option';
        const groupValue = fieldValues[group] ?? externalFieldValues[group];
        const checked = groupValue === optionValue;
        // DocuSign-style UX: option labels are NEVER shown to the signer or
        // in the completed document — only the radio circle renders. The label
        // stays available for the Builder config panel and backend value
        // storage, accessible via aria-label for screen readers.
        return (
          <label
            className={`flex items-center justify-center w-full h-full rounded border-2 transition-colors bg-white ${
              checked
                ? 'border-pink-500'
                : 'border-pink-400'
            } ${!isDisabled ? 'cursor-pointer hover:bg-pink-50' : ''} ${disabledStyle}`}
            data-testid={`field-${field.id}`}
            title={optionLabel /* hover tooltip, no visible text */}
          >
            <span
              className={`relative inline-flex items-center justify-center w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
                checked ? 'border-pink-600 bg-white' : 'border-pink-500 bg-white'
              }`}
            >
              <input
                type="radio"
                name={`radio-group-${group}`}
                checked={checked}
                onChange={() => !isDisabled && handleRadioSelect(field)}
                disabled={isDisabled}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label={optionLabel}
              />
              {checked && <span className="w-2.5 h-2.5 rounded-full bg-pink-600" />}
            </span>
          </label>
        );
      }

      case 'signature': {
        const hasSignature = Boolean(fieldValue);
        const sigAlign = field.style?.textAlign || field.alignment || 'center';
        const sigJustify = sigAlign === 'left' ? 'justify-start' : sigAlign === 'right' ? 'justify-end' : 'justify-center';
        return (
          <div
            onClick={!isDisabled ? () => showSignatureModal && showSignatureModal(field.id, false, field) : null}
            className={`w-full h-full border-2 border-dashed rounded flex items-center ${sigJustify} transition-colors ${
              field.field_disabled
                ? 'border-gray-300 bg-gray-50'
                : hasSignature
                  ? 'border-indigo-500 bg-transparent border-solid'
                  : 'border-indigo-500 bg-indigo-50/70 hover:bg-indigo-100'
            } ${!isDisabled && !hasSignature ? 'cursor-pointer' : ''} ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : 'Click to sign'}
            data-testid={`field-${field.id}`}
          >
            {hasSignature ? (
              <img src={fieldValue} alt="Signature" className="max-w-full max-h-full object-contain" />
            ) : (
              <span 
                className="inline-flex items-center gap-1 font-semibold text-indigo-700 truncate px-1.5 uppercase tracking-wide"
                style={{
                  fontFamily: field.style?.fontFamily || undefined,
                  fontSize: field.style?.fontSize ? `${resolveResponsiveFontSize(field.style.fontSize, field.height, field.width)}px` : '11px',
                  fontWeight: field.style?.fontWeight || 'semibold',
                  fontStyle: field.style?.fontStyle || undefined,
                  color: field.style?.color || undefined,
                }}
              >
                <Edit3 className="h-3 w-3 shrink-0" />
                {field.field_disabled ? 'Other recipient' : 'Sign Here'}
              </span>
            )}
          </div>
        );
      }

      case 'initials': {
        const hasInitials = Boolean(fieldValue);
        const iniAlign = field.style?.textAlign || field.alignment || 'center';
        const iniJustify = iniAlign === 'left' ? 'justify-start' : iniAlign === 'right' ? 'justify-end' : 'justify-center';
        return (
          <div
            onClick={!isDisabled ? () => showSignatureModal && showSignatureModal(field.id, true, field) : null}
            className={`w-full h-full border-2 border-dashed rounded flex items-center ${iniJustify} transition-colors ${
              field.field_disabled
                ? 'border-gray-300 bg-gray-50'
                : hasInitials
                  ? 'border-indigo-500 bg-transparent border-solid'
                  : 'border-indigo-500 bg-indigo-50/70 hover:bg-indigo-100'
            } ${!isDisabled && !hasInitials ? 'cursor-pointer' : ''} ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : 'Click for initials'}
            data-testid={`field-${field.id}`}
          >
            {hasInitials ? (
              <img src={fieldValue} alt="Initials" className="max-w-full max-h-full object-contain" />
            ) : (
              <span 
                className="inline-flex items-center gap-1 font-semibold text-indigo-700 truncate px-1.5 uppercase tracking-wide"
                style={{
                  fontFamily: field.style?.fontFamily || undefined,
                  fontSize: field.style?.fontSize ? `${resolveResponsiveFontSize(field.style.fontSize, field.height, field.width)}px` : '11px',
                  fontWeight: field.style?.fontWeight || 'semibold',
                  fontStyle: field.style?.fontStyle || undefined,
                  color: field.style?.color || undefined,
                }}
              >
                <PenTool className="h-3 w-3 shrink-0" />
                {field.field_disabled ? 'Other recipient' : 'Initials'}
              </span>
            )}
          </div>
        );
      }

      case 'merge': {
        const mergeObj = field.merge_object || field.mergeObject || '';
        const mergeField = field.merge_field || field.mergeField || '';
        const fullKey = `${mergeObj}.${mergeField}`;
        // crmValue = true CRM/merge value only (never the user-entered input).
        // Previously we also accepted externalFieldValues[field.id] here, which
        // broke "convert to input": the moment the user typed 1 character, that
        // value flowed back into externalFieldValues via onFieldsChange and then
        // re-classified the field as "has CRM value", unmounting the <input/>.
        const crmValue = fieldValues[fullKey] || fieldValues[mergeField]
          || externalFieldValues[fullKey] || externalFieldValues[mergeField] || '';
        const userEnteredValue = fieldValue || '';

        // Phase 81.22 — Owner-priority for converted merge fields.
        // Previously: if `crmValue` was non-empty, we skipped the input
        // branch entirely (read-only text display). But after Phase 81.21
        // alias+field map merging, recipient 2's converted-merge could
        // inherit recipient 1's value via the shared merge key — making
        // the field appear as a plain text display (wrong type, wrong
        // editability) for its actual owner. The owner of a converted
        // merge MUST always see the configured input control (text /
        // date picker / number / checkbox) regardless of upstream values.
        if (!isDisabled && field.fallbackToInput) {
          const inputType = field.fallbackInputType || 'text';
          if (inputType === 'date') {
            const dateFormat = DATE_FORMATS.includes(field.dateFormat) ? field.dateFormat : 'MM/DD/YYYY';
            const parseStoredDate = (s) => {
              if (!s) return null;
              let m;
              if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)))     return new Date(+m[1], +m[2] - 1, +m[3]);
              if ((m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s)))   return new Date(+m[1], +m[2] - 1, +m[3]);
              if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) {
                if (dateFormat.startsWith('DD')) return new Date(+m[3], +m[2] - 1, +m[1]);
                return new Date(+m[3], +m[1] - 1, +m[2]);
              }
              if ((m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s))) {
                if (dateFormat.startsWith('DD')) return new Date(+m[3], +m[2] - 1, +m[1]);
                return new Date(+m[3], +m[1] - 1, +m[2]);
              }
              if ((m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s))) {
                const yy = 2000 + +m[3];
                if (dateFormat.startsWith('DD')) return new Date(yy, +m[2] - 1, +m[1]);
                return new Date(yy, +m[1] - 1, +m[2]);
              }
              const d = new Date(s);
              return Number.isNaN(d.getTime()) ? null : d;
            };
            const baseMergeDateFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
            const mergeDateFs = resolveResponsiveFontSize(baseMergeDateFs, field.height, field.width);
            const mergeDateStyle = {
              fontFamily: field.style?.fontFamily || undefined,
              fontSize: `${mergeDateFs}px`,
              fontWeight: field.style?.fontWeight || undefined,
              fontStyle: field.style?.fontStyle || undefined,
              textAlign: field.style?.textAlign || 'left',
              color: field.style?.color || undefined,
            };
            const parsed = parseStoredDate(userEnteredValue);
            const isoValue = parsed ? formatDate(parsed, 'YYYY-MM-DD') : '';
            return (
              <div className="w-full h-full" data-testid={`field-${field.id}`}>
                <DateFieldInput
                  fieldId={field.id}
                  isoValue={isoValue}
                  dateFormat={dateFormat}
                  onCommit={(formatted) => handleFieldChange(field.id, formatted)}
                  onEnterNext={onEnterNext}
                  className="w-full h-full px-2 py-1 border-2 border-orange-400 bg-orange-50 rounded focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  style={mergeDateStyle}
                  title={dateFormat}
                />
              </div>
            );
          }
          return (
            <div className="w-full h-full" data-testid={`field-${field.id}`}>
              {inputType === 'checkbox' ? (
                <div className="flex items-center gap-2 h-full px-2">
                  <input
                    type="checkbox"
                    checked={userEnteredValue === true || userEnteredValue === 'true'}
                    onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded border-orange-400"
                  />

                  <span className="text-xs text-gray-500">{field.showLabelInPreview === false ? '' : (visibleLabel || mergeField)}</span>

                </div>
              ) : (
                <input
                  type={inputType}
                  value={userEnteredValue}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  placeholder={field.placeholder || field.defaultValue || (field.showLabelInPreview === false ? '' : (visibleLabel || mergeField || 'Enter value...'))}
                  className="w-full h-full px-2 py-1 border-2 border-orange-400 bg-orange-50 rounded focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  style={{
                    fontFamily: field.style?.fontFamily || undefined,
                    fontSize: `${resolveResponsiveFontSize(Number((field.style?.fontSize || '').toString().replace('px', '')) || 13, field.height, field.width)}px`,
                    fontWeight: field.style?.fontWeight || undefined,
                    fontStyle: field.style?.fontStyle || undefined,
                    textAlign: field.style?.textAlign || 'left',
                    color: field.style?.color || undefined,
                  }}
                />
              )}
            </div>
          );
        }

        // Phase 81.20 — Read-only render path for converted merge fields
        // (`fallbackToInput=true`). When the active recipient does NOT own
        // this field (e.g. recipient 2 viewing a merge field assigned to
        // recipient 1, or a previously-completed signer's value), we must
        // show the saved value INLINE inside the original placement, NOT as
        // a floating disabled <input> (which shrinks, gains a spellcheck
        // squiggle, and detaches from the underlying line — the bug
        // reported in Issue 1). Falls through to the standard merge text
        // renderer below so styling/alignment exactly matches a CRM merge.
        if (!crmValue && field.fallbackToInput && isDisabled) {
          // Skip the editable-input branch entirely — render via the inline
          // text path (computed below) so the merge looks identical to a
          // CRM-resolved merge for non-owner recipients.
          // (Fall through to `displayValue` block.)
        } else if (!crmValue && field.fallbackToInput) {
          const inputType = field.fallbackInputType || 'text';
          // Phase 81.10 — date picker for merge fallback. Stores the formatted
          // string (e.g., "04/28/2026") matching the field's selected
          // dateFormat so the final signed PDF + webhook see exactly that.
          if (inputType === 'date') {
            const dateFormat = DATE_FORMATS.includes(field.dateFormat) ? field.dateFormat : 'MM/DD/YYYY';
            // Parse any previously-stored value (in any supported format) back
            // to a Date for the native picker.
            const parseStoredDate = (s) => {
              if (!s) return null;
              let m;
              if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)))     return new Date(+m[1], +m[2] - 1, +m[3]);
              if ((m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s)))   return new Date(+m[1], +m[2] - 1, +m[3]);
              if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) {
                if (dateFormat.startsWith('DD')) return new Date(+m[3], +m[2] - 1, +m[1]);
                return new Date(+m[3], +m[1] - 1, +m[2]);
              }
              if ((m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s))) {
                if (dateFormat.startsWith('DD')) return new Date(+m[3], +m[2] - 1, +m[1]);
                return new Date(+m[3], +m[1] - 1, +m[2]);
              }
              if ((m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s))) {
                const yy = 2000 + +m[3];
                if (dateFormat.startsWith('DD')) return new Date(yy, +m[2] - 1, +m[1]);
                return new Date(yy, +m[1] - 1, +m[2]);
              }
              const d = new Date(s);
              return Number.isNaN(d.getTime()) ? null : d;
            };
            const parsed = parseStoredDate(userEnteredValue);
            const isoValue = parsed ? formatDate(parsed, 'YYYY-MM-DD') : '';
            return (
              <div className="w-full h-full" data-testid={`field-${field.id}`}>
                <DateFieldInput
                  fieldId={field.id}
                  isoValue={isoValue}
                  dateFormat={dateFormat}
                  onCommit={(formatted) => !isDisabled && handleFieldChange(field.id, formatted)}
                  onEnterNext={!isDisabled ? onEnterNext : undefined}
                  isDisabled={isDisabled}
                  className={`w-full h-full px-2 py-1 text-sm border-2 border-orange-400 bg-orange-50 rounded focus:ring-2 focus:ring-orange-400 focus:border-transparent ${disabledStyle}`}
                  title={dateFormat}
                />
              </div>
            );
          }
          return (
            <div className="w-full h-full" data-testid={`field-${field.id}`}>
              {inputType === 'checkbox' ? (
                <div className="flex items-center gap-2 h-full px-2">
                  <input
                    type="checkbox"
                    checked={userEnteredValue === true || userEnteredValue === 'true'}
                    onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.checked)}
                    disabled={isDisabled}
                    className="w-4 h-4 text-orange-600 rounded border-orange-400"
                  />
                  <span className="text-xs text-gray-500">{visibleLabel || mergeField}</span>
                </div>
              ) : (
                <input
                  type={inputType}
                  value={userEnteredValue}
                  onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
                  placeholder={field.placeholder || field.defaultValue || visibleLabel || mergeField || 'Enter value...'}
                  disabled={isDisabled}
                  className={`w-full h-full px-2 py-1 text-sm border-2 border-orange-400 bg-orange-50 rounded focus:ring-2 focus:ring-orange-400 focus:border-transparent ${disabledStyle}`}
                />
              )}
            </div>
          );
        }

        // Phase 81.21 — Sequential-recipient merge type mapping fix.
        // When TWO converted merge fields share the same merge pattern
        // (e.g. both `{{event.description}}` but field 1 = text input and
        // field 2 = date picker), the previous priority `crmValue ||
        // userEnteredValue` made BOTH fields render the SAME crmValue
        // (resolved by merge_field name), so recipient 2 saw the date in
        // the text-converted field too. For converted merges we now
        // prefer the FIELD-SPECIFIC `userEnteredValue` (keyed by field.id,
        // unique per placement) and fall back to crmValue only if the
        // signer never entered anything for THIS field. CRM merges (no
        // fallbackToInput) keep `crmValue || userEnteredValue` so dynamic
        // CRM resolution still wins for those.
        const displayValue = field.fallbackToInput
          ? (userEnteredValue || crmValue)
          : (crmValue || userEnteredValue);
        const baseMergeFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const mergeFs = resolveResponsiveFontSize(baseMergeFs, field.height, field.width);
        const mergeStyle = {
          fontFamily: field.style?.fontFamily || undefined,
          fontSize: `${mergeFs}px`,
          fontWeight: field.style?.fontWeight || undefined,
          fontStyle: field.style?.fontStyle || undefined,
          textDecoration: field.style?.textDecoration || undefined,
          textAlign: field.style?.textAlign || undefined,
          color: field.style?.color || undefined,
          justifyContent: field.style?.textAlign === 'center' ? 'center' : field.style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        };
        // Phase 81.20 — Non-owner read-only view of a converted merge that
        // a previous recipient has filled: render WITHOUT the orange chrome
        // so it visually matches the final stamped output (no border, no
        // background highlight) and stays anchored to its original
        // placement. Owners + CRM merges keep the standard orange box.
        const isReadOnlyConverted = field.fallbackToInput && isDisabled;
        const mergeBoxClass = isReadOnlyConverted
          ? 'w-full h-full px-2 py-1 rounded flex items-center text-gray-700 truncate'
          : 'w-full h-full px-2 py-1 border-2 border-orange-300 bg-orange-50 rounded flex items-center text-gray-700 truncate';
        return (
          <div className={mergeBoxClass} style={mergeStyle} data-testid={`field-${field.id}`}>
            {displayValue || (isReadOnlyConverted ? '' : (field.showLabelInPreview === false ? '' : field.mergePattern))}
          </div>
        );
      }

      case 'label':
          const baseLabelFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 12;
          const labelFs = resolveResponsiveFontSize(baseLabelFs, field.height, field.width);
          return (
            <div 
              className="w-full h-full px-2 py-1 flex items-center"
              style={{
                fontFamily: field.style?.fontFamily || undefined,
                fontSize: `${labelFs}px`,
                fontWeight: field.style?.fontWeight || 'normal',
                fontStyle: field.style?.fontStyle || undefined,
                textDecoration: field.style?.textDecoration || undefined,
                textAlign: field.style?.textAlign || 'left',
                color: field.style?.color || '#000000',
                justifyContent: field.style?.textAlign === 'center' ? 'center' : field.style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
                lineHeight: 1,
              }}
            >
              {field.text || field.label || 'Static Text'}
            </div>
          );

      case 'dropdown': {
        const options = field.options || [];
        const baseFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const effectiveFs = resolveResponsiveFontSize(baseFs, field.height, field.width);
        return (
          <select
            value={fieldValue || ''}
            onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
            disabled={isDisabled}
            className={`w-full h-full px-2 py-1 border-2 border-indigo-400 bg-indigo-50 rounded focus:ring-2 focus:ring-indigo-400 focus:border-transparent ${disabledStyle}`}
            style={{
              fontFamily: field.style?.fontFamily || undefined,
              fontSize: `${effectiveFs}px`,
              fontWeight: field.style?.fontWeight || undefined,
              fontStyle: field.style?.fontStyle || undefined,
              textAlign: field.style?.textAlign || undefined,
              color: field.style?.color || undefined,
            }}
            data-testid={`field-${field.id}`}
          >
            <option value="">{field.placeholder || 'Select...'}</option>
            {options.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        );
      }

      default:
        return (
          <div className="w-full h-full border-2 border-gray-300 bg-gray-50 rounded flex items-center justify-center text-xs text-gray-500">
            {visibleLabel}
          </div>
        );
    }
  };

  // Fields for current page (page mode)
  // Phase 81.8 — sort helper so DOM order matches visual top→bottom then
  // left→right, giving native browser Tab natural reading order across all
  // fields on a page.
  const fieldSorter = useCallback((a, b) => {
    const pa = (a.page || 1), pb = (b.page || 1);
    if (pa !== pb) return pa - pb;
    const ya = Number(a.y) || 0, yb = Number(b.y) || 0;
    if (Math.abs(ya - yb) > 14) return ya - yb;
    return (Number(a.x) || 0) - (Number(b.x) || 0);
  }, []);
  const currentPageFields = fields.filter(f => f.page === currentPage);

  // Render a single page with its overlaid fields
  const renderPageWithFields = (pageNum, yOffset = 0) => {
    const pageFields = fields.filter(f => f.page === pageNum);
    const pageHeight = pdfPageHeights[pageNum] || pageSize.height || 1035;

    return (
      <div
        key={pageNum}
        // Phase 75: outer wrapper uses SCALED dimensions so surrounding
        // layout (flex/gap/shadow) flows at visual size; inner wrapper keeps
        // the internal coord system at PDF_WIDTH via CSS transform.
        style={{
          width: `${PDF_WIDTH * viewportScale}px`,
          height: `${pageHeight * viewportScale}px`,
        }}
      >
        <div
          className="relative"
          style={{
            width: `${PDF_WIDTH}px`,
            minHeight: `${pageHeight}px`,
            transform: `scale(${viewportScale})`,
            transformOrigin: 'top left',
          }}
        >
        {/* PDF page — pointer-events disabled so fields above receive clicks */}
        <div style={{ pointerEvents: 'none' }}>
          <Page
            pageNumber={pageNum}
            width={PDF_WIDTH}
            onLoadSuccess={(page) => {
              if (pageNum === 1) onPageLoadSuccess(page);
              handleScrollPageLoad(pageNum, page);
            }}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </div>

        {/* Overlay interactive fields for this page */}
        {pageFields
          .filter(field => !hiddenFieldIds.has(field.id) && !field.field_hidden)
          .slice()
          .sort(fieldSorter)
          .map((field) => {
            // Phase 65: a field not owned by the current recipient (readOnly,
            // or flagged field_disabled) must be COMPLETELY non-interactive:
            // no click, no hover cursor, no modal trigger, no guided sync.
            const isNonInteractive = Boolean(field.readOnly || field.field_disabled);
            const isActive = activeFieldId && !isNonInteractive && (
              activeFieldId === field.id ||
              // For new-model radios, active can point at any sibling in the same group
              (((field.type || field.field_type || '').toLowerCase() === 'radio') &&
                getRadioGroupName(field) === getRadioGroupName((fieldsById.get(activeFieldId) || {})))
            );
            return (
              <div
                key={field.id}
                data-field-wrapper={field.id}
                data-readonly={isNonInteractive ? 'true' : 'false'}
                className={`absolute ${isActive ? 'ring-4 ring-offset-2 ring-emerald-500 rounded shadow-lg shadow-emerald-500/30' : ''}`}
                style={{
                  left: `${field.x}px`,
                  top: `${field.y}px`,
                  width: `${field.width}px`,
                  height: `${field.height}px`,
                  pointerEvents: isNonInteractive ? 'none' : 'auto',
                  zIndex: isActive ? 20 : 10,
                  animation: isActive ? 'pulseActiveField 1.6s ease-in-out infinite' : undefined,
                }}
                onClick={isNonInteractive ? undefined : () => onFieldClick && onFieldClick(field.id)}
              >
                {/* Inner contained rect — clips field content strictly inside
                    the author's bounding box. The "Fill In" badge is rendered
                    as a SIBLING (below) so it isn't clipped. */}
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  {renderField(field)}
                </div>
                {/* Phase 81.51 — Interlink indicator on signer view. Shown
                    when this placement is configured to sync from another
                    template's field. The chain icon sits inside top-left
                    so it doesn't block signature/initials hit zones, and
                    a hover tooltip explains the link. Read-only synced
                    targets already render with a light gray fill via
                    the readOnly path; this badge gives signers an
                    explicit visual cue. */}
                {Boolean(field.linked_to?.enabled && field.linked_to?.field_id) && (
                  <div
                    className="absolute top-0.5 left-0.5 flex items-center justify-center bg-indigo-500 text-white rounded-full pointer-events-none select-none shadow-sm"
                    style={{ width: '14px', height: '14px', zIndex: 14 }}
                    title={`Interlinked Field\nSync Scope: Same Recipient${field.linked_to?.read_only_target ? ' • Read-only target' : ''}`}
                    data-testid={`signer-interlink-${field.id}`}
                  >
                    <Link2 style={{ width: '8px', height: '8px' }} />
                  </div>
                )}
                {/* Phase 77 — DocuSign-style UX: floating "Fill In" arrow
                    badge removed. Inline-visible field styling + emerald
                    ring on the active field is the only guidance needed. */}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Top bar: Navigation + View Toggle */}
      <div className="bg-white border-b border-gray-200 p-2 sm:p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5" data-testid="view-mode-toggle">
            <button
              onClick={() => setViewMode('page')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'page'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="view-mode-page"
            >
              <Layers className="h-3.5 w-3.5" />
              Page
            </button>
            <button
              onClick={() => setViewMode('scroll')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'scroll'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="view-mode-scroll"
            >
              <ScrollText className="h-3.5 w-3.5" />
              Scroll
            </button>
          </div>

          {/* Page navigation (only in page mode) */}
          {viewMode === 'page' && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-2.5 sm:px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                data-testid="prev-page-btn"
              >
                Previous
              </button>
              <span className="text-xs font-medium px-1 sm:px-2 text-gray-600 whitespace-nowrap">
                {currentPage}/{numPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(numPages || 1, currentPage + 1))}
                disabled={currentPage === numPages}
                className="px-2.5 sm:px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                data-testid="next-page-btn"
              >
                Next
              </button>
            </div>
          )}

          {/* Scroll mode page indicator */}
          {viewMode === 'scroll' && numPages && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {numPages} page{numPages !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1.5 text-gray-600 shrink-0">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs whitespace-nowrap hidden xs:inline sm:inline">Fill all fields to sign</span>
            <span className="text-xs whitespace-nowrap inline xs:hidden sm:hidden">Fill to sign</span>
          </div>
        )}
      </div>

      {/* Document Display */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-2 sm:p-6 bg-gray-100 relative"
        onKeyDown={(e) => {
          // Phase 81.78 — Global Enter-to-Next navigation.
          // Enter on any single-line input / date input / number input advances
          // to the next field (or triggers Next button). Textareas (multi-line
          // text) retain native newline behaviour. Buttons (checkbox/radio/
          // signature) also allow Enter as their native click trigger.
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
          const tgt = e.target;
          if (!tgt) return;
          const tag = (tgt.tagName || '').toUpperCase();
          // Allow newline in textareas.
          if (tag === 'TEXTAREA') return;
          // Buttons: let native click-activation happen (checkbox/radio/signature).
          if (tag === 'BUTTON') return;
          if (tag === 'INPUT') {
            const itype = (tgt.type || 'text').toLowerCase();
            // Don't hijack checkbox/radio Enter — they toggle natively.
            if (itype === 'checkbox' || itype === 'radio') return;
            e.preventDefault();
            try { tgt.blur(); } catch (_) { /* noop */ }
            // Date inputs use DateFieldInput's onBlur for advancement — calling
            // onEnterNext() here too would advance TWO fields (blur fires it once,
            // this line would fire it a second time).
            if (itype === 'date') return;
            if (typeof onEnterNext === 'function') onEnterNext();
          }
        }}
      >
        {/* Phase 78/81.8/81.47: DocuSign-style "Fill In" side indicator.
            Phase 81.47 — moved LEFT out of the page margin so the badge
            no longer overlaps PDF text. The badge body sits in the gray
            gutter (just outside the page's left edge) and the triangle
            arrow points INTO the page at the active field. Uses
            translateX(-100%) to flip the badge left of its anchor, and
            reduces the anchor to `docPageLeft - 2px` so the arrow tip
            kisses the page edge without overlapping content. */}
        {activeFieldId && fillInTop !== null && (
          <button
            type="button"
            onClick={scrollToActiveField}
            className="absolute z-20 flex items-center whitespace-nowrap group focus:outline-none"
            style={{
              left: `${docPageLeft - 2}px`,
              top: `${fillInTop}px`,
              transform: 'translateX(-100%)',
              transition: 'top 240ms cubic-bezier(0.22, 0.61, 0.36, 1), left 200ms ease-out',
            }}
            data-testid="guided-fill-in-arrow"
            aria-label="Jump to and focus the active field"
          >
            <span className="bg-emerald-500 group-hover:bg-emerald-600 text-white pl-4 pr-3 py-2 rounded-l-full rounded-r-sm shadow-lg text-sm font-semibold tracking-wide">
              Fill In
            </span>
            <span
              className="w-0 h-0 -ml-px"
              style={{
                borderTop: '11px solid transparent',
                borderBottom: '11px solid transparent',
                borderLeft: '13px solid #10b981',
              }}
            />
          </button>
        )}
        {viewMode === 'page' ? (
          /* ═══ PAGE MODE ═══ */
          <div className="flex justify-center">
            <div
              // Phase 75: outer wrapper uses SCALED dimensions; inner keeps
              // native PDF_WIDTH with a CSS transform so field coords are
              // untouched (x/y/width/height remain relative to 800px base).
              style={{
                width: `${PDF_WIDTH * viewportScale}px`,
                height: `${(pageSize.height || 1035) * viewportScale}px`,
              }}
            >
              <div
                ref={containerRef}
                className="relative bg-white shadow-lg"
                style={{
                  width: `${PDF_WIDTH}px`,
                  transform: `scale(${viewportScale})`,
                  transformOrigin: 'top left',
                }}
              >
              <div style={{ pointerEvents: 'none' }}>
                <Document
                  file={pdfFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={(error) => console.error('PDF load error:', error)}
                  loading={<div className="p-12 text-center text-gray-500">Loading document...</div>}
                  error={<div className="p-12 text-center text-red-500">Failed to load document. Please refresh the page.</div>}
                >
                  <Page
                    pageNumber={currentPage}
                    width={PDF_WIDTH}
                    onLoadSuccess={onPageLoadSuccess}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>
              </div>

              {/* Render interactive fields on current page */}
              {currentPageFields
                .filter(field => !hiddenFieldIds.has(field.id) && !field.field_hidden)
                .slice()
                .sort(fieldSorter)
                .map((field) => {
                  // Phase 65: non-owned fields must be FULLY non-interactive.
                  const isNonInteractive = Boolean(field.readOnly || field.field_disabled);
                  const isActive = activeFieldId && !isNonInteractive && (
                    activeFieldId === field.id ||
                    (((field.type || field.field_type || '').toLowerCase() === 'radio') &&
                      getRadioGroupName(field) === getRadioGroupName((fieldsById.get(activeFieldId) || {})))
                  );
                  return (
                    <div
                      key={field.id}
                      data-field-wrapper={field.id}
                      data-readonly={isNonInteractive ? 'true' : 'false'}
                      className={`absolute ${isActive ? 'ring-4 ring-offset-2 ring-emerald-500 rounded shadow-lg shadow-emerald-500/30' : ''}`}
                      style={{
                        left: `${field.x}px`,
                        top: `${field.y}px`,
                        width: `${field.width}px`,
                        height: `${field.height}px`,
                        pointerEvents: isNonInteractive ? 'none' : 'auto',
                        zIndex: isActive ? 20 : 10,
                        animation: isActive ? 'pulseActiveField 1.6s ease-in-out infinite' : undefined,
                      }}
                      onClick={isNonInteractive ? undefined : () => onFieldClick && onFieldClick(field.id)}
                    >
                      {/* Inner contained rect — clips field content inside the
                          author's bounding box. The "Fill In" badge is a sibling
                          so it isn't clipped. */}
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          overflow: 'hidden',
                          boxSizing: 'border-box',
                        }}
                      >
                        {renderField(field)}
                      </div>
                      {/* Phase 81.51 — Interlink indicator (continuous mode). */}
                      {Boolean(field.linked_to?.enabled && field.linked_to?.field_id) && (
                        <div
                          className="absolute top-0.5 left-0.5 flex items-center justify-center bg-indigo-500 text-white rounded-full pointer-events-none select-none shadow-sm"
                          style={{ width: '14px', height: '14px', zIndex: 14 }}
                          title={`Interlinked Field\nSync Scope: Same Recipient${field.linked_to?.read_only_target ? ' • Read-only target' : ''}`}
                          data-testid={`signer-interlink-${field.id}`}
                        >
                          <Link2 style={{ width: '8px', height: '8px' }} />
                        </div>
                      )}
                      {/* Phase 77 — DocuSign-style UX: floating "Fill In"
                          arrow badge removed. Inline-visible field styling
                          + emerald ring on active field is enough guidance. */}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ═══ SCROLL MODE ═══ */
          <div className="flex justify-center">
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(error) => console.error('PDF load error:', error)}
              loading={<div className="p-12 text-center text-gray-500">Loading document...</div>}
              error={<div className="p-12 text-center text-red-500">Failed to load document. Please refresh the page.</div>}
            >
              <div className="space-y-4">
                {Array.from({ length: numPages || 1 }, (_, i) => (
                  <div key={i + 1} className="bg-white shadow-lg">
                    {renderPageWithFields(i + 1)}
                  </div>
                ))}
              </div>
            </Document>
          </div>
        )}
      </div>
    </div>
  );
};

export { formatLocalMMDDYYYY, formatDate, DATE_FORMATS, getRadioGroupName };
export default InteractiveDocumentViewer;
