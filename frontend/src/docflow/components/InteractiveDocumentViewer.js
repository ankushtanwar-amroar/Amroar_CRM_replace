import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { CheckCircle, Layers, ScrollText, Check } from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// ─── Helpers ──────────────────────────────────────────────
// Supported date formats for field-level date rendering.
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMM DD, YYYY'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Format a JS Date in the given format.
 * Accepted: MM/DD/YYYY (default) | DD/MM/YYYY | YYYY-MM-DD | MMM DD, YYYY
 */
const formatDate = (date = new Date(), fmt = 'MM/DD/YYYY') => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mmm = MONTH_SHORT[d.getMonth()];
  switch (fmt) {
    case 'DD/MM/YYYY':   return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD':   return `${yyyy}-${mm}-${dd}`;
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
  // Leave ~4px total vertical padding; font-size should be roughly 70% of remaining height.
  const heightCap = Math.max(6, Math.floor((fieldHeight - 4) * 0.70));
  // Hard cap by width too so very narrow boxes don't crowd — 1em ≈ 0.55px per char.
  const widthCap = Math.max(6, Math.floor(fieldWidth / 3));
  return Math.min(base, heightCap, widthCap);
};

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
  const hiddenFieldIds = useMemo(() => {
    const values = { ...externalFieldValues, ...fieldValues };
    const hidden = new Set();

    const getSourceValue = (sourceFieldId) => {
      const sourceField = fields.find(f => f.id === sourceFieldId);
      if (!sourceField) return values[sourceFieldId];
      const type = sourceField.type || sourceField.field_type;
      if (type === 'radio') {
        // New model: read via the group key. Legacy: read via field id.
        const isNewModel = sourceField.groupName || sourceField.group_name || sourceField.optionValue || sourceField.option_value;
        if (isNewModel) {
          const group = getRadioGroupName(sourceField);
          return values[group] ?? values[sourceFieldId] ?? '';
        }
      }
      return values[sourceFieldId];
    };

    // ─── Build target→rules map from both formats ───
    const targetRules = new Map(); // Map<targetFieldId, Array<{sourceField, rule, action}>>

    const push = (targetId, entry) => {
      if (!targetRules.has(targetId)) targetRules.set(targetId, []);
      targetRules.get(targetId).push(entry);
    };

    // Format A: conditionalRules on source fields
    fields.forEach(sourceField => {
      const rules = sourceField.conditionalRules || [];
      rules.forEach(rule => {
        if (!rule.targetFieldId) return;
        push(rule.targetFieldId, { sourceField, rule, format: 'A' });
      });
    });

    // Format B: conditionalLogic on target fields
    fields.forEach(targetField => {
      const cl = targetField.conditionalLogic;
      if (!cl || !Array.isArray(cl.rules) || cl.rules.length === 0) return;
      cl.rules.forEach(rule => {
        const sourceField = fields.find(f => f.id === rule.sourceFieldId);
        push(targetField.id, {
          sourceField: sourceField || { id: rule.sourceFieldId },
          rule,
          format: 'B',
          operator: cl.operator,
          defaultAction: cl.action
        });
      });
    });

    // ─── Evaluate per-target ───
    const evaluateFormatA = ({ sourceField, rule }) => {
      const srcValue = getSourceValue(sourceField.id);
      const srcType = sourceField.type || sourceField.field_type;
      const { triggerValue, triggerCondition } = rule;

      if (srcType === 'checkbox') {
        const isChecked = srcValue === true || srcValue === 'true';
        return triggerValue === true || triggerValue === 'true' ? isChecked : !isChecked;
      }
      if (srcType === 'radio') {
        // For new-model radios, srcValue is the group value, triggerValue is optionValue OR optionLabel
        const isNewModel = sourceField.groupName || sourceField.optionValue;
        if (isNewModel) {
          return String(srcValue || '') === String(triggerValue || sourceField.optionValue || '');
        }
        return String(srcValue || '') === String(triggerValue || '');
      }
      if (['signature', 'initials'].includes(srcType)) {
        const filled = Boolean(srcValue);
        return triggerValue === 'filled' ? filled : !filled;
      }
      if (srcType === 'text') {
        const strVal = String(srcValue || '');
        switch (triggerCondition) {
          case 'filled': return strVal !== '';
          case 'empty': return strVal === '';
          case 'equals': return strVal === String(triggerValue || '');
          case 'contains': return strVal.includes(String(triggerValue || ''));
          default: return strVal !== '';
        }
      }
      if (srcType === 'date') {
        const strVal = String(srcValue || '');
        if (triggerCondition === 'empty') return strVal === '';
        return strVal !== '';
      }
      return String(srcValue || '') === String(triggerValue || '');
    };

    const evaluateFormatB = ({ sourceField, rule }) => {
      const sourceValue = getSourceValue(sourceField.id);
      const targetValue = rule.value;
      const strSource = sourceValue === undefined || sourceValue === null ? '' : String(sourceValue);
      switch (rule.condition) {
        case 'equals': return strSource === String(targetValue ?? '');
        case 'not_equals': return strSource !== String(targetValue ?? '');
        case 'contains': return strSource.includes(String(targetValue ?? ''));
        case 'not_empty': return strSource !== '' && sourceValue !== false;
        case 'is_empty': return strSource === '' || sourceValue === false || sourceValue === undefined;
        case 'is_checked': return sourceValue === true || sourceValue === 'true';
        case 'is_unchecked': return !(sourceValue === true || sourceValue === 'true');
        default: return false;
      }
    };

    targetRules.forEach((entries, targetId) => {
      // Partition by format since Format A rules each specify their own action
      // while Format B entries share an aggregate operator+action.
      const formatA = entries.filter(e => e.format === 'A');
      const formatB = entries.filter(e => e.format === 'B');

      // Format A: each rule independently; rules are OR'd across multiple source rules.
      // A field should hide if ANY active rule says hide AND no rule says show.
      // Simpler semantics: last matching rule wins, default visible.
      let shouldHide = false;
      let shouldShow = null; // null = unspecified

      formatA.forEach(entry => {
        const matched = evaluateFormatA(entry);
        if (!matched) return;
        if (entry.rule.action === 'hide') shouldHide = true;
        if (entry.rule.action === 'show') shouldShow = true;
      });

      // If there are "show" rules at all on this target, visibility defaults to hidden
      // until at least one show rule matches (DocuSign-like behavior).
      const hasShowRule = formatA.some(e => e.rule.action === 'show');
      if (hasShowRule && shouldShow !== true) shouldHide = true;

      // Format B: aggregate by operator/action
      if (formatB.length > 0) {
        const operator = (formatB[0].operator || 'AND').toUpperCase();
        const action = formatB[0].defaultAction || 'show';
        const results = formatB.map(evaluateFormatB);
        const allMatch = operator === 'OR' ? results.some(Boolean) : results.every(Boolean);
        if (action === 'show' && !allMatch) shouldHide = true;
        if (action === 'hide' && allMatch) shouldHide = true;
      }

      if (shouldHide) hidden.add(targetId);
    });

    return hidden;
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

  useEffect(() => {
    if (!activeFieldId) return;
    const f = fieldsById.get(activeFieldId);
    if (!f) return;
    if (viewMode === 'page' && f.page && f.page !== currentPage) {
      setCurrentPage(f.page);
    }
    // Wait for DOM update before scrolling. In page mode the PDF page may still
    // be loading when the effect fires → retry with short polling up to ~1s.
    const timers = [];
    let attempts = 0;
    const MAX_ATTEMPTS = 8;    // 8 × 120ms ≈ 960ms
    const attempt = () => {
      attempts += 1;
      const el = document.querySelector(`[data-field-wrapper="${activeFieldId}"]`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempts < MAX_ATTEMPTS) {
        timers.push(setTimeout(attempt, 120));
      }
    };
    timers.push(setTimeout(attempt, 60));
    return () => timers.forEach(clearTimeout);
  }, [activeFieldId, viewMode, currentPage, fieldsById]);

  const renderField = (field) => {
    const fieldValue = fieldValues[field.id] !== undefined ? fieldValues[field.id] : externalFieldValues[field.id];
    const isFieldReadOnly = field.readOnly === true;
    const isDisabled = readOnly || field.field_disabled || isFieldReadOnly;
    const disabledStyle = field.field_disabled
      ? 'opacity-60 cursor-not-allowed'
      : isFieldReadOnly ? 'opacity-70 cursor-not-allowed' : '';
    
    switch (field.type || field.field_type) {
      case 'text': {
        const baseFs = Number((field.style?.fontSize || '').toString().replace('px', '')) || 13;
        const effectiveFs = resolveResponsiveFontSize(baseFs, field.height, field.width);
        const textStyle = {
          fontFamily: field.style?.fontFamily || undefined,
          fontSize: `${effectiveFs}px`,
          fontWeight: field.style?.fontWeight || undefined,
          fontStyle: field.style?.fontStyle || undefined,
          textDecoration: field.style?.textDecoration || undefined,
          textAlign: field.style?.textAlign || undefined,
          color: field.style?.color || undefined,
          // Keep text on a single line — prevents multi-line wrap that would
          // visually overflow a short-height box. `text-overflow` kicks in
          // naturally because the outer wrapper already has overflow:hidden.
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          lineHeight: 1.1,
        };
        return (
          <input
            type="text"
            value={fieldValue || ''}
            onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder || field.defaultValue || field.label || 'Enter text...'}
            disabled={isDisabled}
            className={`w-full h-full px-2 py-1 border-2 border-blue-400 bg-blue-50 rounded focus:ring-2 focus:ring-blue-400 focus:border-transparent ${disabledStyle}`}
            style={textStyle}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : ''}
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
          if (isDisabled) {
            return (
              <div
                className={`w-full h-full px-2 py-1 border-2 border-green-400 bg-green-50 rounded flex items-center ${alignJustify} ${disabledStyle}`}
                style={{ fontSize: `${dateFs}px`, lineHeight: 1.1 }}
                title={isFieldReadOnly ? 'Read-only' : ''}
                data-testid={`field-${field.id}`}
              >
                <span className="text-gray-800 font-medium truncate">{fieldValue || dateFormat}</span>
              </div>
            );
          }
          return (
            <input
              type="date"
              value={isoValue}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) { handleFieldChange(field.id, ''); return; }
                const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
                if (mm) handleFieldChange(field.id, formatDate(new Date(+mm[1], +mm[2] - 1, +mm[3]), dateFormat));
              }}
              className={`w-full h-full px-2 py-1 border-2 border-green-400 bg-green-50 rounded focus:ring-2 focus:ring-green-400 focus:border-transparent`}
              style={{ textAlign, fontSize: `${dateFs}px`, lineHeight: 1.1 }}
              data-testid={`field-${field.id}`}
            />
          );
        }

        // Auto mode: fill with today's date in the field's chosen format.
        const displayValue = fieldValue || formatDate(new Date(), dateFormat);
        // Hide the small check icon when the box is too short to comfortably fit it.
        const showCheckIcon = (field.height || 0) >= 24;
        return (
          <div
            className={`w-full h-full px-2 py-1 border-2 border-green-400 bg-green-50 rounded flex items-center ${alignJustify} ${disabledStyle}`}
            style={{ fontSize: `${dateFs}px`, lineHeight: 1.1 }}
            title={isFieldReadOnly ? 'Read-only' : 'Automatically filled with today\'s date'}
            data-testid={`field-${field.id}`}
          >
            {showCheckIcon && <Check className="h-3 w-3 text-green-600 mr-1 flex-shrink-0" />}
            <span className="text-gray-800 font-medium truncate">{displayValue}</span>
          </div>
        );
      }

      case 'checkbox': {
        const checked = fieldValue === true || fieldValue === 'true';
        const labelText = field.checkboxLabel || field.label || 'I agree';
        return (
          <label
            className={`flex items-center justify-center w-full h-full px-2 rounded border-2 transition-colors ${
              checked
                ? 'border-amber-500 bg-amber-50'
                : 'border-amber-400 bg-amber-50/60'
            } ${!isDisabled ? 'cursor-pointer hover:bg-amber-100' : ''} ${disabledStyle}`}
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
              className={`w-full h-full px-2 py-1 rounded border-2 border-pink-400 bg-pink-50 ${disabledStyle}`}
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
            className={`flex items-center justify-center w-full h-full rounded border-2 transition-colors ${
              checked
                ? 'border-pink-500 bg-pink-50'
                : 'border-pink-400 bg-pink-50/60'
            } ${!isDisabled ? 'cursor-pointer hover:bg-pink-100' : ''} ${disabledStyle}`}
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
            onClick={!isDisabled ? () => showSignatureModal && showSignatureModal(field.id, false) : null}
            className={`w-full h-full border-2 rounded flex items-center ${sigJustify} transition-colors ${
              field.field_disabled
                ? 'border-gray-300 bg-gray-50'
                : hasSignature
                  ? 'border-indigo-500 bg-transparent'
                  : 'border-indigo-500 bg-indigo-50/70 hover:bg-indigo-100'
            } ${!isDisabled && !hasSignature ? 'cursor-pointer' : ''} ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : 'Click to sign'}
            data-testid={`field-${field.id}`}
          >
            {hasSignature ? (
              <img src={fieldValue} alt="Signature" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[11px] font-medium text-indigo-700 truncate px-1">
                {field.field_disabled ? 'Other recipient' : 'Click to sign'}
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
            onClick={!isDisabled ? () => showSignatureModal && showSignatureModal(field.id, true) : null}
            className={`w-full h-full border-2 rounded flex items-center ${iniJustify} transition-colors ${
              field.field_disabled
                ? 'border-gray-300 bg-gray-50'
                : hasInitials
                  ? 'border-indigo-500 bg-transparent'
                  : 'border-indigo-500 bg-indigo-50/70 hover:bg-indigo-100'
            } ${!isDisabled && !hasInitials ? 'cursor-pointer' : ''} ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : 'Click for initials'}
            data-testid={`field-${field.id}`}
          >
            {hasInitials ? (
              <img src={fieldValue} alt="Initials" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[11px] font-medium text-indigo-700 truncate px-1">
                {field.field_disabled ? 'Other recipient' : 'Click for initials'}
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
        
        if (!crmValue && field.fallbackToInput) {
          const inputType = field.fallbackInputType || 'text';
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
                  <span className="text-xs text-gray-500">{field.label || mergeField}</span>
                </div>
              ) : (
                <input
                  type={inputType}
                  value={userEnteredValue}
                  onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
                  placeholder={field.placeholder || field.defaultValue || field.label || mergeField || 'Enter value...'}
                  disabled={isDisabled}
                  className={`w-full h-full px-2 py-1 text-sm border-2 border-orange-400 bg-orange-50 rounded focus:ring-2 focus:ring-orange-400 focus:border-transparent ${disabledStyle}`}
                />
              )}
            </div>
          );
        }

        const displayValue = crmValue || userEnteredValue;
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
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        };
        return (
          <div className="w-full h-full px-2 py-1 border-2 border-orange-300 bg-orange-50 rounded flex items-center text-gray-700 truncate" style={mergeStyle} data-testid={`field-${field.id}`}>
            {displayValue || field.mergePattern}
          </div>
        );
      }

      case 'label':
        return (
          <div 
            className="w-full h-full px-2 py-1 flex items-center text-gray-900"
            style={{
              fontFamily: field.style?.fontFamily || undefined,
              fontSize: field.style?.fontSize ? `${field.style.fontSize}px` : '12px',
              fontWeight: field.style?.fontWeight || 'normal',
              fontStyle: field.style?.fontStyle || undefined,
              textDecoration: field.style?.textDecoration || undefined,
              textAlign: field.style?.textAlign || 'left',
              color: field.style?.color || '#000000',
              justifyContent: field.style?.textAlign === 'center' ? 'center' : field.style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
            }}
          >
            {field.text || field.label || 'Static Text'}
          </div>
        );

      default:
        return (
          <div className="w-full h-full border-2 border-gray-300 bg-gray-50 rounded flex items-center justify-center text-xs text-gray-500">
            {field.label}
          </div>
        );
    }
  };

  // Fields for current page (page mode)
  const currentPageFields = fields.filter(f => f.page === currentPage);

  // Render a single page with its overlaid fields
  const renderPageWithFields = (pageNum, yOffset = 0) => {
    const pageFields = fields.filter(f => f.page === pageNum);
    const pageHeight = pdfPageHeights[pageNum] || pageSize.height || 1035;

    return (
      <div
        key={pageNum}
        className="relative"
        style={{ width: `${PDF_WIDTH}px`, minHeight: `${pageHeight}px` }}
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
            // Show the "Fill In" arrow only on the specific active field, not on
            // sibling radios in the same group — prevents multiple arrows per group.
            const isFillInAnchor = isActive && activeFieldId === field.id;
            return (
              <div
                key={field.id}
                data-field-wrapper={field.id}
                data-readonly={isNonInteractive ? 'true' : 'false'}
                className={`absolute ${isActive ? 'ring-2 ring-offset-2 ring-emerald-500 rounded' : ''}`}
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
                {isFillInAnchor && (
                  <div
                    className={`absolute flex items-center gap-1 pointer-events-none whitespace-nowrap z-30 ${
                      field.x < 90
                        ? 'left-0 top-full mt-1'            /* Field near left edge → show below-left */
                        : 'right-full top-1/2 -translate-y-1/2 mr-2'  /* Default: pointer from the left */
                    }`}
                    data-testid="guided-fill-in-arrow"
                  >
                    <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-l-full rounded-r shadow-lg text-xs font-semibold">
                      Fill In
                    </div>
                    <div
                      className="w-0 h-0"
                      style={{
                        borderTop: '8px solid transparent',
                        borderBottom: '8px solid transparent',
                        borderLeft: '10px solid #10b981',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
      </div>
    );
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Top bar: Navigation + View Toggle */}
      <div className="bg-white border-b border-gray-200 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5" data-testid="view-mode-toggle">
            <button
              onClick={() => setViewMode('page')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                data-testid="prev-page-btn"
              >
                Previous
              </button>
              <span className="text-xs font-medium px-2 text-gray-600">
                Page {currentPage} of {numPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(numPages || 1, currentPage + 1))}
                disabled={currentPage === numPages}
                className="px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                data-testid="next-page-btn"
              >
                Next
              </button>
            </div>
          )}

          {/* Scroll mode page indicator */}
          {viewMode === 'scroll' && numPages && (
            <span className="text-xs text-gray-500 ml-2">
              {numPages} pages — scroll to navigate
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs">Fill all fields to sign</span>
          </div>
        )}
      </div>

      {/* Document Display */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-6 bg-gray-100"
      >
        {viewMode === 'page' ? (
          /* ═══ PAGE MODE ═══ */
          <div className="flex justify-center">
            <div ref={containerRef} className="relative bg-white shadow-lg">
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
                .map((field) => {
                  // Phase 65: non-owned fields must be FULLY non-interactive.
                  const isNonInteractive = Boolean(field.readOnly || field.field_disabled);
                  const isActive = activeFieldId && !isNonInteractive && (
                    activeFieldId === field.id ||
                    (((field.type || field.field_type || '').toLowerCase() === 'radio') &&
                      getRadioGroupName(field) === getRadioGroupName((fieldsById.get(activeFieldId) || {})))
                  );
                  // Show the "Fill In" arrow only on the specific active field, not on
                  // sibling radios in the same group — prevents multiple arrows per group.
                  const isFillInAnchor = isActive && activeFieldId === field.id;
                  return (
                    <div
                      key={field.id}
                      data-field-wrapper={field.id}
                      data-readonly={isNonInteractive ? 'true' : 'false'}
                      className={`absolute ${isActive ? 'ring-2 ring-offset-2 ring-emerald-500 rounded' : ''}`}
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
                      {isFillInAnchor && (
                        <div
                          className={`absolute flex items-center gap-1 pointer-events-none whitespace-nowrap z-30 ${
                            field.x < 90
                              ? 'left-0 top-full mt-1'
                              : 'right-full top-1/2 -translate-y-1/2 mr-2'
                          }`}
                          data-testid="guided-fill-in-arrow"
                        >
                          <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-l-full rounded-r shadow-lg text-xs font-semibold">
                            Fill In
                          </div>
                          <div
                            className="w-0 h-0"
                            style={{
                              borderTop: '8px solid transparent',
                              borderBottom: '8px solid transparent',
                              borderLeft: '10px solid #10b981',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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
