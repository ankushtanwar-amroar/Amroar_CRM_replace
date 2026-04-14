/**
 * Field Behavior Rules Module
 * Exports all components, hooks, and services for field behavior rules
 */

// Components
export { default as FieldBehaviorRulesPanel } from './components/FieldBehaviorRulesPanel';
export { default as BasicRuleBuilder } from './components/BasicRuleBuilder';
export { default as FormulaRuleEditor } from './components/FormulaRuleEditor';
export { default as RecordDetailWithFieldRules } from './components/RecordDetailWithFieldRules';

// Hooks
export { useFieldBehaviorRules } from './hooks/useFieldBehaviorRules';
export { useFieldBehaviorRuntime } from './hooks/useFieldBehaviorRuntime';

// Engine
export {
  evaluateFieldBehavior,
  evaluateAllFieldBehaviors,
  extractParentReferences,
  hasFieldBehaviorRules,
  RULE_MODES,
  RULE_TYPES,
  OPERATORS
} from './engine/FieldBehaviorRulesEngine';

// Services
export { default as fieldBehaviorService } from './services/fieldBehaviorService';
