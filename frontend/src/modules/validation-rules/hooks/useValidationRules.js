/**
 * Use Validation Rules Hook
 * Manages validation rules state
 */
import { useState, useEffect } from 'react';
import validationRulesService from '../services/validationRulesService';

export const useValidationRules = (objectName) => {
  const [rules, setRules] = useState([]);
  const [objectFields, setObjectFields] = useState([]);
  const [parentFieldGroups, setParentFieldGroups] = useState({});
  const [allFields, setAllFields] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (objectName) {
      fetchRules();
      fetchFieldsWithParents();
    }
  }, [objectName]);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await validationRulesService.getRules(objectName);
      setRules(data);
    } catch (error) {
      console.error('Error fetching validation rules:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch fields including parent lookup fields using new API
   */
  const fetchFieldsWithParents = async () => {
    try {
      const data = await validationRulesService.getAvailableFields(objectName, true, 1);
      
      // Separate regular fields from parent fields
      const regularFields = [];
      const parentGroups = {};
      
      data.forEach(field => {
        if (field.is_parent) {
          const parentObj = field.parent_object?.charAt(0).toUpperCase() + field.parent_object?.slice(1) || 'Parent';
          if (!parentGroups[parentObj]) {
            parentGroups[parentObj] = [];
          }
          parentGroups[parentObj].push({
            name: field.full_path,         // Full path like "Account.industry"
            api_name: field.api_name,      // Just the field name like "industry"
            label: field.label,
            type: field.field_type,
            isParent: true,
            parentObject: field.parent_object,
            options: field.options || []
          });
        } else {
          regularFields.push({
            name: field.api_name,
            key: field.api_name,           // Add key for consistency
            label: field.label,
            type: field.field_type,
            isParent: false,
            options: field.options || []
          });
        }
      });
      
      setObjectFields(regularFields);
      setParentFieldGroups(parentGroups);
      setAllFields(data);
    } catch (error) {
      console.error('Error fetching fields with parents:', error);
      // Fallback to old API
      try {
        const data = await validationRulesService.getObjectFields(objectName);
        if (data.fields) {
          const fieldList = Object.keys(data.fields).map(key => ({
            name: key,
            label: data.fields[key].label || key,
            type: data.fields[key].type || 'text',
            isParent: false,
            options: data.fields[key].options || []
          }));
          setObjectFields(fieldList);
        }
      } catch (fallbackError) {
        console.error('Error in fallback field fetch:', fallbackError);
      }
    }
  };

  const createRule = async (ruleData) => {
    try {
      await validationRulesService.createRule(objectName, ruleData);
      await fetchRules();
      return true;
    } catch (error) {
      throw error;
    }
  };

  const updateRule = async (ruleId, ruleData) => {
    try {
      await validationRulesService.updateRule(objectName, ruleId, ruleData);
      await fetchRules();
      return true;
    } catch (error) {
      throw error;
    }
  };

  const deleteRule = async (ruleId) => {
    try {
      await validationRulesService.deleteRule(objectName, ruleId);
      await fetchRules();
      return true;
    } catch (error) {
      throw error;
    }
  };

  return {
    rules,
    objectFields,
    parentFieldGroups,
    allFields,
    loading,
    createRule,
    updateRule,
    deleteRule,
    refresh: fetchRules
  };
};

export default useValidationRules;
