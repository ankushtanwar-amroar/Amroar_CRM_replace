/**
 * Phase 81.59 — Conditional-logic visibility evaluator.
 *
 * Single source of truth used by:
 *   - InteractiveDocumentViewer (signing UI rendering)
 *   - PackagePublicView (Finish gate / required counter)
 *   - PackagePublicLinkView (Finish gate / required counter)
 *
 * Mirrors the same logic that lives inside InteractiveDocumentViewer so a
 * Package's parent components can compute the dynamic hidden-field set
 * WITHOUT waiting for the accordion to mount the viewer.
 *
 * Supports two builder formats:
 *   Format A — source-side rules (what MultiPageVisualBuilder saves):
 *     sourceField.conditionalRules = [
 *       { triggerValue, triggerCondition?, action: 'show'|'hide', targetFieldId }
 *     ]
 *   Format B — target-side rules (legacy/external):
 *     targetField.conditionalLogic = {
 *       operator?: 'AND'|'OR', action, rules: [{ sourceFieldId, condition, value }]
 *     }
 */

const getRadioGroupName = (f) => {
  return f?.groupName || f?.group_name || f?.id;
};

/**
 * Compute the set of conditionally-hidden field IDs for one document/template.
 *
 * @param {Array} fields  - field placements for the doc
 * @param {Object} values - current field values, keyed by field id (and groupName for radio)
 * @returns {Set<string>} - set of placement ids that should be hidden
 */
export function computeHiddenFieldIds(fields, values) {
  const hidden = new Set();
  if (!Array.isArray(fields) || fields.length === 0) return hidden;
  fields = fields.filter(Boolean);
  values = values || {};

  const getSourceValue = (sourceFieldId) => {
    const sourceField = fields.find((f) => f?.id === sourceFieldId);
    if (!sourceField) return values[sourceFieldId];
    const type = sourceField.type || sourceField.field_type;
    if (type === 'radio') {
      // New model reads via group key. Legacy: read via field id.
      const isNewModel = sourceField.groupName || sourceField.group_name || sourceField.optionValue || sourceField.option_value;
      if (isNewModel) {
        const group = getRadioGroupName(sourceField);
        return values[group] ?? values[sourceFieldId] ?? '';
      }
    }
    return values[sourceFieldId];
  };

  // Build target → rules map.
  const targetRules = new Map();
  const push = (targetId, entry) => {
    if (!targetRules.has(targetId)) targetRules.set(targetId, []);
    targetRules.get(targetId).push(entry);
  };

  // Format A
  fields.forEach((sourceField) => {
    const rules = sourceField.conditionalRules || [];
    rules.forEach((rule) => {
      if (!rule.targetFieldId) return;
      push(rule.targetFieldId, { sourceField, rule, format: 'A' });
    });
  });

  // Format B
  fields.forEach((targetField) => {
    const cl = targetField.conditionalLogic;
    if (!cl || !Array.isArray(cl.rules) || cl.rules.length === 0) return;
    cl.rules.forEach((rule) => {
      const sourceField = fields.find((f) => f.id === rule.sourceFieldId);
      push(targetField.id, {
        sourceField: sourceField || { id: rule.sourceFieldId },
        rule,
        format: 'B',
        operator: cl.operator,
        defaultAction: cl.action,
      });
    });
  });

  const evaluateFormatA = ({ sourceField, rule }) => {
    const srcValue = getSourceValue(sourceField.id);
    const srcType = sourceField.type || sourceField.field_type;
    const { triggerValue, triggerCondition } = rule;

    if (srcType === 'checkbox') {
      const isChecked = srcValue === true || srcValue === 'true';
      return triggerValue === true || triggerValue === 'true' ? isChecked : !isChecked;
    }
    if (srcType === 'radio') {
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
    const formatA = entries.filter((e) => e.format === 'A');
    const formatB = entries.filter((e) => e.format === 'B');

    let shouldHide = false;
    let shouldShow = null;

    formatA.forEach((entry) => {
      const matched = evaluateFormatA(entry);
      if (!matched) return;
      if (entry.rule.action === 'hide') shouldHide = true;
      if (entry.rule.action === 'show') shouldShow = true;
    });

    const hasShowRule = formatA.some((e) => e.rule.action === 'show');
    if (hasShowRule && shouldShow !== true) shouldHide = true;

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
}
