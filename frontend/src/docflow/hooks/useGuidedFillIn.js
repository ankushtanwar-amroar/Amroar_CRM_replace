import { useMemo, useState, useCallback, useEffect, useRef } from 'react';

/**
 * useGuidedFillIn — DocuSign-style guided fill-in navigation.
 *
 * Computes the ordered list of required fields the current signer must
 * complete and tracks which one is currently active.
 *
 * Props:
 *   fields:             all field placements (from the template)
 *   fieldValues:        { fieldId | groupName: value }
 *   hiddenFieldIds:     Set<string>  — from the viewer's conditional-logic engine
 *   recipientIds:       string[]     — current signer's identity ids
 *                                      (active_recipient.id, .template_recipient_id, email, ...)
 *   assignedFieldIds:   string[]     — if provided, ONLY these fields are treated
 *                                      as assigned to the current signer. This is
 *                                      the backend's source of truth for packages
 *                                      and multi-recipient templates.
 *
 * Returns:
 *   requiredFieldIds:    ordered string[]  — ALL required fields for this signer
 *                                            (sorted page → y → x; minus hidden)
 *   pendingFieldIds:     ordered string[]  — not-yet-filled required fields
 *   activeFieldId:       string | null     — the field the "Fill In" arrow should point at
 *   completedCount:      number            — count of filled required fields
 *   totalRequired:       number            — total required fields
 *   allComplete:         boolean
 *   hasAnyRequired:      boolean
 *   started:             boolean           — true once user clicked Start at least once
 *   start:               () => void        — set active = first pending
 *   goToNext:            () => void        — advance to the NEXT pending after current pos
 *   setActiveFieldId:    (id) => void
 *   syncFromClick:       (id) => void      — sync to a user-clicked field (used by viewer)
 */
const GROUP_KEY_FOR = (field) => field.groupName || field.group_name || null;

const getFieldType = (field) => (field?.type || field?.field_type || '').toLowerCase();

const isRequiredByDefault = (type) => ['signature', 'initials'].includes(type);

const isExplicitlyRequired = (field) => field?.required === true || field?.required === 'true';

const isExplicitlyOptional = (field) => field?.required === false || field?.required === 'false';

const isFilled = (field, values) => {
  if (!field) return false;
  const type = getFieldType(field);
  if (type === 'radio') {
    const group = GROUP_KEY_FOR(field);
    if (group) {
      const v = values[group];
      if (v !== undefined && v !== null && String(v) !== '') return true;
    }
    // Legacy radio (no groupName) stores value on the field id directly
    const raw = values[field.id];
    return raw !== undefined && raw !== null && String(raw) !== '';
  }
  if (type === 'checkbox') {
    // For REQUIRED checkboxes, DocuSign treats filled = checked (true).
    const raw = values[field.id];
    return raw === true || raw === 'true';
  }
  if (type === 'date') {
    // 'auto' mode: always filled (viewer auto-populates today's date).
    // 'manual' mode: needs an explicit value from the signer.
    const mode = field.dateMode || 'auto';
    if (mode === 'auto') return true;
    const raw = values[field.id];
    return raw !== undefined && raw !== null && String(raw).trim() !== '';
  }
  const raw = values[field.id];
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
};

// Module-scope constant — never recreated per render. Previously lived inside
// the hook body which caused the `navigableFields` memo to invalidate every
// render → auto-advance effect re-ran → infinite render loop.
const NON_INTERACTIVE_TYPES = new Set(['label', 'merge']);

// Phase 76: radio "required" is a GROUP property. A radio field participates
// in a required group if ANY sibling (same groupName) has required=true.
// This provides backward compat for legacy templates where only one option
// was flagged required before Phase 76 propagation was added.
const isRadioGroupRequired = (field, allFields) => {
  const group = GROUP_KEY_FOR(field);
  if (!group) return Boolean(field?.required); // legacy / ungrouped radio
  return (allFields || []).some(f =>
    getFieldType(f) === 'radio' &&
    GROUP_KEY_FOR(f) === group &&
    (f.required === true || f.required === 'true')
  );
};

const shouldIncludeAsRequired = (field, allFields) => {
  const type = getFieldType(field);
  if (type === 'radio') {
    if (isExplicitlyOptional(field)) return false;
    return isRadioGroupRequired(field, allFields);
  }
  if (isExplicitlyOptional(field)) return false;
  if (isExplicitlyRequired(field)) return true;
  // Default: signature/initials are required; others need explicit required=true
  return isRequiredByDefault(type);
};

const sortByReadingOrder = (a, b) => {
  const pa = a.page || 1, pb = b.page || 1;
  if (pa !== pb) return pa - pb;
  const ya = a.y || 0, yb = b.y || 0;
  if (Math.abs(ya - yb) > 5) return ya - yb;
  return (a.x || 0) - (b.x || 0);
};

export default function useGuidedFillIn({
  fields = [],
  fieldValues = {},
  hiddenFieldIds = new Set(),
  recipientIds = [],
  assignedFieldIds = null,
}) {
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [started, setStarted] = useState(false);
  // Tracks the previous activeFieldId to detect when the user clicks an
  // already-filled date field (vs. when a date value is actually committed).
  const prevActiveFieldIdRef = useRef(null);
  // Tracks the field that was just auto-advanced FROM (so we can detect when
  // the auto-advance jumped over a newly-revealed conditional field).
  const lastAutoAdvanceSourceRef = useRef(null);
  // Tracks the previous navigable IDs to detect newly-visible fields.
  // null = not yet initialized (first render).
  const prevNavigableIdsRef = useRef(null);

  const recipientIdSet = useMemo(() => {
    return new Set((recipientIds || []).filter(Boolean).map(x => String(x)));
  }, [recipientIds]);

  const assignedSet = useMemo(() => {
    if (!assignedFieldIds || !Array.isArray(assignedFieldIds) || assignedFieldIds.length === 0) return null;
    return new Set(assignedFieldIds.map(String));
  }, [assignedFieldIds]);

  /** Determine whether a field belongs to the current signer. */
  const isAssignedToCurrentSigner = useCallback((field) => {
    // 1. If backend provided an explicit list of assigned field IDs, use it as truth.
    if (assignedSet) return assignedSet.has(String(field.id));

    // 2. Otherwise, match via field.assigned_to / field.recipient_id vs any of the
    //    signer's known identity ids.
    const fieldAssigned = field.assigned_to || field.recipient_id;
    if (!fieldAssigned) return true; // unassigned fields are "public"
    if (recipientIdSet.size === 0) return true; // no signer identity known yet
    return recipientIdSet.has(String(fieldAssigned));
  }, [assignedSet, recipientIdSet]);

  // ─── ALL interactive fields (for Start/Next navigation) ───
  // Previously `requiredFields` drove both navigation AND Finish-enabled logic,
  // which meant Start/Next skipped optional fields. We now split them:
  //   navigableFields  — ALL visible+assigned interactive fields (Start/Next traverses these)
  //   requiredFields   — only required ones (drive the X/Y counter + Finish button)
  const navigableFields = useMemo(() => {
    const eligible = (fields || []).filter(f => {
      if (!f || !f.id) return false;
      if (hiddenFieldIds && hiddenFieldIds.has(f.id)) return false;
      if (f.field_disabled) return false;
      if (f.field_hidden) return false;
      if (f.readOnly) return false;
      if (!isAssignedToCurrentSigner(f)) return false;
      const t = getFieldType(f);
      // Merge with fallbackToInput is interactive → include
      if (t === 'merge' && (f.fallbackToInput === true)) return true;
      // Label is static; merge (without fallback) is CRM-populated or rendered
      // as read-only text — both are "not interactive" from the signer's
      // perspective and are skipped.
      if (NON_INTERACTIVE_TYPES.has(t)) return false;
      return true;
    });
    // De-dup radio groups
    const seenGroups = new Set();
    const deduped = [];
    eligible.forEach(f => {
      if (getFieldType(f) === 'radio') {
        const group = GROUP_KEY_FOR(f);
        if (group) {
          if (seenGroups.has(group)) return;
          seenGroups.add(group);
        }
      }
      deduped.push(f);
    });
    deduped.sort(sortByReadingOrder);
    return deduped;
  }, [fields, hiddenFieldIds, isAssignedToCurrentSigner]);

  const navigableFieldIds = useMemo(() => navigableFields.map(f => f.id), [navigableFields]);

  // ─── Ordered list of REQUIRED fields for this signer (drives Finish + counter) ───
  const requiredFields = useMemo(() => {
    const eligible = (fields || []).filter(f => {
      if (!f || !f.id) return false;
      if (hiddenFieldIds && hiddenFieldIds.has(f.id)) return false;
      if (f.field_disabled) return false;
      if (f.field_hidden) return false;
      if (f.readOnly) return false;
      if (!isAssignedToCurrentSigner(f)) return false;
      return shouldIncludeAsRequired(f, fields);
    });

    // De-duplicate radio groups — only the first field in each group counts.
    const seenGroups = new Set();
    const deduped = [];
    eligible.forEach(f => {
      if (getFieldType(f) === 'radio') {
        const group = GROUP_KEY_FOR(f);
        if (group) {
          if (seenGroups.has(group)) return;
          seenGroups.add(group);
        }
      }
      deduped.push(f);
    });

    // Natural reading/signing order: page → y → x.
    deduped.sort(sortByReadingOrder);
    return deduped;
  }, [fields, hiddenFieldIds, isAssignedToCurrentSigner]);

  const requiredFieldIds = useMemo(() => requiredFields.map(f => f.id), [requiredFields]);

  const pendingFields = useMemo(() => {
    return requiredFields.filter(f => !isFilled(f, fieldValues));
  }, [requiredFields, fieldValues]);

  const pendingFieldIds = useMemo(() => pendingFields.map(f => f.id), [pendingFields]);

  const totalRequired = requiredFieldIds.length;
  const completedCount = totalRequired - pendingFieldIds.length;
  const hasAnyRequired = totalRequired > 0;
  // Document is complete if: NO required fields exist, OR all required fields are filled.
  // This allows optional-only documents to be marked complete.
  const allComplete = pendingFieldIds.length === 0;

  // Auto-advance: after a field is filled, move to the next UNFILLED navigable
  // field so the signer flows through everything (DocuSign-style), not just the
  // required ones. Falls back to next navigable if all are filled.
  //
  // Phase 81.11 — DO NOT auto-advance for text-input fields (text + merge with
  // text/email/tel fallback). Typing fires onChange on every keystroke; the
  // first character would mark the field "filled" and steal focus mid-word.
  // For these fields, advancement happens ONLY on explicit Tab / Next click.
  // Auto-advance still applies to one-shot fills: signature, initials,
  // checkbox, radio, date (manual date picker = single click commit).
  //
  // Date editing fix: when the user clicks an already-filled manual date field
  // to edit it, activeFieldId changes but fieldValues hasn't changed yet.
  // By comparing to prevActiveFieldIdRef, we detect this "just activated" case
  // and skip auto-advance so the calendar can open. The next time the effect
  // runs (when fieldValues changes after the user picks a date), activeFieldId
  // matches the ref and auto-advance proceeds normally.
  useEffect(() => {
    if (!activeFieldId) {
      prevActiveFieldIdRef.current = null;
      return;
    }

    const activeField = navigableFields.find(f => f.id === activeFieldId);
    if (!activeField) {
      // Active no longer navigable (e.g., hidden by conditional) → first unfilled pending
      prevActiveFieldIdRef.current = null;
      setActiveFieldId(pendingFieldIds[0] || navigableFieldIds[0] || null);
      return;
    }

    // Skip auto-advance for text-input style fields (typing) and date fields.
    // Date fields (manual mode and merge+date fallback) must not auto-advance on
    // value change because the browser fires onChange before the user finishes
    // typing all 4 year digits, causing premature focus jumps and wrong years like
    // 1905. Advancement happens via onBlur or explicit Tab/Enter/Next instead.
    const activeType = getFieldType(activeField);
    const isManualDate = activeType === 'date' && (activeField.dateMode || 'auto') === 'manual';
    const isMergeDateFallback =
      activeType === 'merge' &&
      activeField.fallbackToInput === true &&
      (activeField.fallbackInputType || 'text') === 'date';
    const isTextInput =
      activeType === 'text' ||
      isManualDate ||
      isMergeDateFallback ||
      (activeType === 'merge' &&
        activeField.fallbackToInput === true &&
        (activeField.fallbackInputType || 'text') !== 'checkbox');
    if (isTextInput) {
      prevActiveFieldIdRef.current = activeFieldId;
      return;
    }

    // Compute unfilled across all navigable (required + optional)
    const navUnfilled = navigableFields.filter(f => !isFilled(f, fieldValues)).map(f => f.id);
    const nowFilled = !navUnfilled.includes(activeFieldId);

    if (nowFilled) {
      prevActiveFieldIdRef.current = activeFieldId;
      const currentIdx = navigableFieldIds.indexOf(activeFieldId);
      // Next UNFILLED after current position; else first unfilled; else next navigable; else stay
      const nextId = navigableFieldIds
        .slice(currentIdx + 1)
        .find(id => navUnfilled.includes(id))
        || navUnfilled[0]
        || navigableFieldIds[currentIdx + 1]
        || null;
      lastAutoAdvanceSourceRef.current = activeFieldId;
      setActiveFieldId(nextId);
    } else {
      prevActiveFieldIdRef.current = activeFieldId;
    }
  }, [fieldValues, navigableFields, navigableFieldIds, pendingFieldIds, activeFieldId]);

  // Detects conditional fields that became visible AFTER an auto-advance.
  // When a radio/checkbox fill triggers a conditional field to appear, the
  // hiddenFieldIds update arrives one tick later (setTimeout(0) in the viewer),
  // so auto-advance runs with stale navigableFields and skips the new field.
  // This effect fires whenever navigableFieldIds changes, checks if newly-visible
  // unfilled fields appeared between the auto-advance source and current active,
  // and redirects to the first such field.
  useEffect(() => {
    const prevIds = prevNavigableIdsRef.current;
    if (prevIds === null) {
      prevNavigableIdsRef.current = navigableFieldIds;
      return;
    }
    const prevSet = new Set(prevIds);
    prevNavigableIdsRef.current = navigableFieldIds;
    if (!started) return;
    const srcId = lastAutoAdvanceSourceRef.current;
    if (!srcId) return;
    const newlyVisible = navigableFields.filter(
      f => !prevSet.has(f.id) && !isFilled(f, fieldValues)
    );
    if (newlyVisible.length === 0) {
      lastAutoAdvanceSourceRef.current = null;
      return;
    }
    const srcIdx = navigableFieldIds.indexOf(srcId);
    const currActiveIdx = navigableFieldIds.indexOf(activeFieldId);
    if (srcIdx === -1 || currActiveIdx === -1) {
      lastAutoAdvanceSourceRef.current = null;
      return;
    }
    const candidates = newlyVisible
      .filter(f => {
        const idx = navigableFieldIds.indexOf(f.id);
        return idx !== -1 && idx > srcIdx && idx <= currActiveIdx;
      })
      .sort(sortByReadingOrder);
    lastAutoAdvanceSourceRef.current = null;
    if (candidates.length > 0) {
      setActiveFieldId(candidates[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigableFieldIds]);

  const start = useCallback(() => {
    setStarted(true);
    // Start at the first UNFILLED navigable field; if all are filled, land on first.
    const firstUnfilled = navigableFields.find(f => !isFilled(f, fieldValues));
    const first = (firstUnfilled ? firstUnfilled.id : navigableFieldIds[0]) || null;
    setActiveFieldId(first);
  }, [navigableFields, navigableFieldIds, fieldValues]);

  const goToNext = useCallback(() => {
    setStarted(true);
    if (!activeFieldId) {
      const firstUnfilled = navigableFields.find(f => !isFilled(f, fieldValues));
      setActiveFieldId((firstUnfilled ? firstUnfilled.id : navigableFieldIds[0]) || null);
      return;
    }
    const currentIdx = navigableFieldIds.indexOf(activeFieldId);
    // Prefer the next UNFILLED; if none after, wrap to first unfilled; else advance linearly.
    const nextUnfilledAfter = navigableFields
      .slice(currentIdx + 1)
      .find(f => !isFilled(f, fieldValues));
    const nextId = nextUnfilledAfter?.id
      || (navigableFields.find(f => !isFilled(f, fieldValues)) || {}).id
      || navigableFieldIds[(currentIdx + 1) % Math.max(1, navigableFieldIds.length)]
      || null;
    setActiveFieldId(nextId);
  }, [navigableFields, navigableFieldIds, activeFieldId, fieldValues]);

  const goToPrev = useCallback(() => {
    setStarted(true);
    if (!activeFieldId) {
      setActiveFieldId(navigableFieldIds[0] || null);
      return;
    }
    const currentIdx = navigableFieldIds.indexOf(activeFieldId);
    if (currentIdx <= 0) return; // Already at first — Previous is a no-op (button also disabled).
    setActiveFieldId(navigableFieldIds[currentIdx - 1]);
  }, [navigableFieldIds, activeFieldId]);

  const syncFromClick = useCallback((fieldId) => {
    // Clicking ANY navigable field should sync the guided cursor (not just required).
    if (!fieldId) return;
    const clicked = (fields || []).find(f => f.id === fieldId);
    if (!clicked) return;
    let targetId = fieldId;
    if (getFieldType(clicked) === 'radio') {
      const group = GROUP_KEY_FOR(clicked);
      if (group) {
        const groupLead = navigableFields.find(f => GROUP_KEY_FOR(f) === group);
        if (groupLead) targetId = groupLead.id;
      }
    }
    if (navigableFieldIds.includes(targetId)) {
      setStarted(true);
      setActiveFieldId(targetId);
    }
  }, [fields, navigableFieldIds, navigableFields]);

  // Navigation availability — Start/Next should appear whenever there's any
  // navigable field (required OR optional). "Finish" still keys off required.
  const navUnfilledCount = navigableFields.filter(f => !isFilled(f, fieldValues)).length;
  const hasAnyNavigable = navigableFieldIds.length > 0;
  const navAllComplete = hasAnyNavigable && navUnfilledCount === 0;

  return {
    requiredFieldIds,
    pendingFieldIds,
    activeFieldId,
    completedCount,
    totalRequired,
    allComplete,
    hasAnyRequired,
    // NEW — navigation-specific (all interactive fields)
    navigableFieldIds,
    hasAnyNavigable,
    navUnfilledCount,
    navAllComplete,
    // flow controls
    started,
    start,
    goToNext,
    goToPrev,
    setActiveFieldId,
    syncFromClick,
  };
}
