/**
 * Component Visibility Engine Tests
 * Tests for visibility evaluation logic
 */

import {
  evaluateComponentVisibility,
  isComponentVisible,
} from '../engine/VisibilityRulesEngine';
import {
  VISIBILITY_MODES,
  LOGIC_OPERATORS,
  CONDITION_SOURCES,
} from '../types/visibilityTypes';

// Test data
const sampleRecordData = {
  status: 'Open',
  stage: 'Closed Won',
  amount: 50000,
  is_active: true,
  priority: 'High',
  owner_name: 'John Smith',
  created_date: '2024-01-15',
};

const sampleUserContext = {
  id: 'user-123',
  email: 'admin@example.com',
  role: 'admin',
  profile: 'system_administrator',
  isAdmin: true,
  permissions: {
    canApproveDiscount: true,
    canDelete: false,
  },
};

describe('Component Visibility Engine', () => {
  describe('Default Behavior', () => {
    test('No visibility config → always visible', () => {
      const result = evaluateComponentVisibility(null, sampleRecordData);
      expect(result.visible).toBe(true);
      expect(result.pending).toBe(false);
    });

    test('undefined visibility config → always visible', () => {
      const result = evaluateComponentVisibility(undefined, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('mode="always" → always visible', () => {
      const config = { mode: VISIBILITY_MODES.ALWAYS };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('Empty conditions array → always visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });
  });

  describe('Missing Data - Safe Default (Hidden)', () => {
    test('Record data null → hidden (pending)', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
        ],
      };
      const result = evaluateComponentVisibility(config, null);
      expect(result.visible).toBe(false);
      expect(result.pending).toBe(true);
    });

    test('Record data undefined → hidden (pending)', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
        ],
      };
      const result = evaluateComponentVisibility(config, undefined);
      expect(result.visible).toBe(false);
      expect(result.pending).toBe(true);
    });

    test('Field not in record → hidden (pending)', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'nonexistent_field', operator: '=', right: 'value' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(false);
      expect(result.pending).toBe(true);
    });

    test('User context missing when needed → hidden (pending)', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.USER, left: 'User.Role', operator: '=', right: 'admin' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData, null);
      expect(result.visible).toBe(false);
      expect(result.pending).toBe(true);
    });
  });

  describe('ShowWhen Mode', () => {
    test('Single condition - equals - match → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('Single condition - equals - no match → hidden', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Closed' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(false);
    });

    test('Single condition - not equals - match → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '!=', right: 'Closed' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('Number comparison - greater than', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'amount', operator: '>', right: '40000' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('Number comparison - less than', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'amount', operator: '<', right: '40000' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(false);
    });

    test('Contains operator', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'stage', operator: 'contains', right: 'Won' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('Is null operator', () => {
      const recordWithNull = { ...sampleRecordData, description: null };
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'description', operator: 'is_null', right: '' },
        ],
      };
      const result = evaluateComponentVisibility(config, recordWithNull);
      expect(result.visible).toBe(true);
    });

    test('Is not null operator', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: 'is_not_null', right: '' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });
  });

  describe('HideWhen Mode', () => {
    test('Single condition - match → hidden', () => {
      const config = {
        mode: VISIBILITY_MODES.HIDE_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(false);
    });

    test('Single condition - no match → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.HIDE_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Closed' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });
  });

  describe('AND Logic', () => {
    test('All conditions match → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        logic: LOGIC_OPERATORS.AND,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
          { source: CONDITION_SOURCES.RECORD, left: 'priority', operator: '=', right: 'High' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('One condition fails → hidden', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        logic: LOGIC_OPERATORS.AND,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
          { source: CONDITION_SOURCES.RECORD, left: 'priority', operator: '=', right: 'Low' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(false);
    });
  });

  describe('OR Logic', () => {
    test('One condition matches → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        logic: LOGIC_OPERATORS.OR,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Closed' },
          { source: CONDITION_SOURCES.RECORD, left: 'priority', operator: '=', right: 'High' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('No conditions match → hidden', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        logic: LOGIC_OPERATORS.OR,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Closed' },
          { source: CONDITION_SOURCES.RECORD, left: 'priority', operator: '=', right: 'Low' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(false);
    });
  });

  describe('User-Based Conditions', () => {
    test('User role match → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.USER, left: 'User.Role', operator: '=', right: 'admin' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData, sampleUserContext);
      expect(result.visible).toBe(true);
    });

    test('User role no match → hidden', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.USER, left: 'User.Role', operator: '=', right: 'viewer' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData, sampleUserContext);
      expect(result.visible).toBe(false);
    });

    test('User is admin check', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.USER, left: 'User.IsAdmin', operator: '=', right: 'true' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData, sampleUserContext);
      expect(result.visible).toBe(true);
    });

    test('User profile match', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.USER, left: 'User.Profile', operator: '=', right: 'system_administrator' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData, sampleUserContext);
      expect(result.visible).toBe(true);
    });
  });

  describe('Mixed Conditions (Record + User)', () => {
    test('Both record and user conditions match → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        logic: LOGIC_OPERATORS.AND,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
          { source: CONDITION_SOURCES.USER, left: 'User.Role', operator: '=', right: 'admin' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData, sampleUserContext);
      expect(result.visible).toBe(true);
    });

    test('Record matches but user does not → hidden (AND)', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        logic: LOGIC_OPERATORS.AND,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: '=', right: 'Open' },
          { source: CONDITION_SOURCES.USER, left: 'User.Role', operator: '=', right: 'viewer' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData, sampleUserContext);
      expect(result.visible).toBe(false);
    });
  });

  describe('In/Not In Operators', () => {
    test('In operator - value in list → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: 'in', right: 'Open, Pending, Draft' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });

    test('Not in operator - value not in list → visible', () => {
      const config = {
        mode: VISIBILITY_MODES.SHOW_WHEN,
        conditions: [
          { source: CONDITION_SOURCES.RECORD, left: 'status', operator: 'not_in', right: 'Closed, Cancelled' },
        ],
      };
      const result = evaluateComponentVisibility(config, sampleRecordData);
      expect(result.visible).toBe(true);
    });
  });

  describe('isComponentVisible helper', () => {
    test('Returns boolean correctly', () => {
      const result = isComponentVisible(null, sampleRecordData);
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });
  });
});
