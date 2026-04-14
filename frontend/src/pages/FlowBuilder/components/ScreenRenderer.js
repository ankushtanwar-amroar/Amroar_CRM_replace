import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Monitor, AlertCircle, ChevronRight, Info, Upload, X, File, User, Clock, Zap, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { toast } from 'sonner';
import DataTableRuntime from './DataTableRuntime';
import axios from 'axios';

// Dynamic Field Components for Screen Flow Engine
import {
  RecordLookupField,
  DateTimeWithRecommendationsField,
  DisplayRecordField,
  ReviewSummaryField,
  ServiceAppointmentSelectorField
} from './DynamicFieldComponents';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Theme style computation utilities (same as ScreenCanvas)
const getThemeStyles = (theme) => {
  const styles = {
    pageBackground: {},
    contentCard: {},
    header: {},
    headerStyle: {},
    button: {},
    contentPadding: 'p-6'
  };

  if (!theme) return styles;

  // Page background
  const bgColorMap = {
    'white': '#ffffff',
    'gray-50': '#f9fafb',
    'gray-100': '#f3f4f6',
    'blue-50': '#eff6ff',
    'indigo-50': '#eef2ff',
    'purple-50': '#faf5ff',
    'green-50': '#f0fdf4',
    'amber-50': '#fffbeb'
  };
  if (theme.pageBackground === 'custom' && theme.pageBackgroundCustom) {
    styles.pageBackground = { backgroundColor: theme.pageBackgroundCustom };
  } else if (bgColorMap[theme.pageBackground]) {
    styles.pageBackground = { backgroundColor: bgColorMap[theme.pageBackground] };
  }

  // Content card background
  if (theme.contentBackground === 'custom' && theme.contentBackgroundCustom) {
    styles.contentCard.backgroundColor = theme.contentBackgroundCustom;
  } else if (bgColorMap[theme.contentBackground]) {
    styles.contentCard.backgroundColor = bgColorMap[theme.contentBackground];
  }

  // Border radius
  const radiusMap = {
    'none': '0px',
    'sm': '4px',
    'md': '8px',
    'lg': '12px',
    'xl': '16px',
    '2xl': '24px'
  };
  if (radiusMap[theme.borderRadius]) {
    styles.contentCard.borderRadius = radiusMap[theme.borderRadius];
  }

  // Shadow
  const shadowMap = {
    'none': 'none',
    'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
  };
  if (shadowMap[theme.shadow]) {
    styles.contentCard.boxShadow = shadowMap[theme.shadow];
  }

  // Header style
  const headerGradients = {
    'blue-gradient': 'linear-gradient(to right, #2563eb, #4f46e5)',
    'indigo-gradient': 'linear-gradient(to right, #4f46e5, #9333ea)',
    'purple-gradient': 'linear-gradient(to right, #9333ea, #ec4899)',
    'green-gradient': 'linear-gradient(to right, #16a34a, #0d9488)',
    'orange-gradient': 'linear-gradient(to right, #ea580c, #ef4444)',
    'gray-gradient': 'linear-gradient(to right, #374151, #111827)'
  };
  const headerSolids = {
    'solid-blue': '#2563eb',
    'solid-indigo': '#4f46e5',
    'solid-gray': '#374151'
  };
  
  if (theme.headerStyle === 'custom' && theme.headerCustomStart && theme.headerCustomEnd) {
    styles.header = { background: `linear-gradient(to right, ${theme.headerCustomStart}, ${theme.headerCustomEnd})` };
  } else if (headerGradients[theme.headerStyle]) {
    styles.header = { background: headerGradients[theme.headerStyle] };
  } else if (headerSolids[theme.headerStyle]) {
    styles.header = { backgroundColor: headerSolids[theme.headerStyle] };
  }

  // Button color
  const buttonColors = {
    'blue': { backgroundColor: '#2563eb', hover: '#1d4ed8' },
    'indigo': { backgroundColor: '#4f46e5', hover: '#4338ca' },
    'purple': { backgroundColor: '#9333ea', hover: '#7e22ce' },
    'green': { backgroundColor: '#16a34a', hover: '#15803d' },
    'orange': { backgroundColor: '#ea580c', hover: '#c2410c' },
    'gray': { backgroundColor: '#374151', hover: '#1f2937' }
  };
  if (theme.buttonColor === 'custom' && theme.buttonColorCustom) {
    styles.button = { backgroundColor: theme.buttonColorCustom };
  } else if (buttonColors[theme.buttonColor]) {
    styles.button = buttonColors[theme.buttonColor];
  }

  // Content padding
  const paddingMap = {
    'compact': 'p-4',
    'normal': 'p-6',
    'relaxed': 'p-8',
    'spacious': 'p-12'
  };
  styles.contentPadding = paddingMap[theme.contentPadding] || 'p-6';

  return styles;
};

const ScreenRenderer = ({ 
  node, 
  onNext, 
  onPrevious, 
  onFinish, 
  context, 
  screenData,
  showPrevious = false,
  showNext = true,
  showFinish = false
}) => {
  const config = node.data?.config || {};
  const fields = config.fields || [];
  const screenTitle = config.screenTitle || node.data?.label || 'Screen';
  const screenDescription = config.screenDescription || '';
  
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form data with default values, context values, or saved screen data
  useEffect(() => {
    const initialData = {};
    fields.forEach(field => {
      // Priority: saved screenData > context > default value
      const savedValue = screenData[`Screen.${field.name}`];
      const contextValue = context[`Screen.${field.name}`];
      initialData[field.name] = savedValue || contextValue || field.defaultValue || '';
    });
    setFormData(initialData);
  }, [node.id]);

  // Evaluate Toast rules on screen load (onLoad timing)
  useEffect(() => {
    const toastConfig = config.toast;
    if (!toastConfig?.rules || toastConfig.triggerTiming !== 'onLoad') return;

    // Combine context with current screen data for evaluation
    const fullContext = { 
      ...context, 
      ...Object.fromEntries(
        Object.entries(screenData).map(([k, v]) => [k, v])
      )
    };

    evaluateToastRules(toastConfig.rules, fullContext);
  }, [node.id, config.toast]);

  // Evaluate toast rules and show matching toasts
  const evaluateToastRules = (rules, evalContext) => {
    if (!rules || rules.length === 0) return;

    rules.forEach(rule => {
      if (!rule.condition || rule.condition.trim() === '') {
        // No condition - always show
        showToast(rule);
        return;
      }

      // Evaluate condition
      try {
        const conditionResult = evaluateCondition(rule.condition, evalContext);
        if (conditionResult) {
          showToast(rule);
        }
      } catch (err) {
        console.warn('Toast condition evaluation failed:', rule.condition, err);
      }
    });
  };

  // Simple condition evaluator (supports basic comparisons)
  const evaluateCondition = (condition, evalContext) => {
    // Resolve variables in condition first
    let resolvedCondition = condition;
    const varMatches = condition.match(/\{\{([^}]+)\}\}/g);
    if (varMatches) {
      varMatches.forEach(match => {
        const varName = match.replace(/\{\{|\}\}/g, '').trim();
        let value = evalContext[varName];
        
        // Try nested access (e.g., Screen.email)
        if (value === undefined && varName.includes('.')) {
          const parts = varName.split('.');
          value = evalContext[parts.join('.')];
        }
        
        // Handle string vs number representation
        if (typeof value === 'string') {
          resolvedCondition = resolvedCondition.replace(match, `"${value}"`);
        } else {
          resolvedCondition = resolvedCondition.replace(match, value ?? 'null');
        }
      });
    }

    // Evaluate simple conditions: ==, !=, >, <, isNotNull, isNull, isEmpty, isNotEmpty
    if (resolvedCondition.includes(' isNotNull')) {
      const varName = resolvedCondition.replace(' isNotNull', '').trim().replace(/"/g, '');
      return varName !== null && varName !== undefined && varName !== '' && varName !== 'null';
    }
    if (resolvedCondition.includes(' isNull')) {
      const varName = resolvedCondition.replace(' isNull', '').trim().replace(/"/g, '');
      return varName === null || varName === undefined || varName === '' || varName === 'null';
    }
    if (resolvedCondition.includes(' isEmpty')) {
      const varName = resolvedCondition.replace(' isEmpty', '').trim().replace(/"/g, '');
      return varName === null || varName === undefined || varName === '';
    }
    if (resolvedCondition.includes(' isNotEmpty')) {
      const varName = resolvedCondition.replace(' isNotEmpty', '').trim().replace(/"/g, '');
      return varName !== null && varName !== undefined && varName !== '';
    }

    // Simple eval for basic comparisons (be careful with this!)
    try {
      // Only allow safe comparisons
      const sanitized = resolvedCondition
        .replace(/==/g, '===')
        .replace(/!=/g, '!==');
      // eslint-disable-next-line no-new-func
      return new Function(`return ${sanitized}`)();
    } catch {
      return false;
    }
  };

  // Show toast using sonner
  const showToast = (rule) => {
    const toastOptions = {
      duration: rule.duration || 3000,
      dismissible: rule.dismissible !== false
    };

    // Resolve variables in message
    let message = rule.message || '';
    const fullContext = { ...context, ...screenData };
    const msgMatches = message.match(/\{\{([^}]+)\}\}/g);
    if (msgMatches) {
      msgMatches.forEach(match => {
        const varName = match.replace(/\{\{|\}\}/g, '').trim();
        const value = fullContext[varName] || fullContext[`Screen.${varName}`] || '';
        message = message.replace(match, value);
      });
    }

    switch (rule.type) {
      case 'success':
        toast.success(rule.title || 'Success', { description: message, ...toastOptions });
        break;
      case 'error':
        toast.error(rule.title || 'Error', { description: message, ...toastOptions });
        break;
      case 'warning':
        toast.warning(rule.title || 'Warning', { description: message, ...toastOptions });
        break;
      case 'info':
      default:
        toast(rule.title || 'Info', { icon: 'ℹ️', description: message, ...toastOptions });
        break;
    }
  };

  const handleFieldChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
    
    // Clear error for this field
    if (errors[fieldName]) {
      setErrors(prev => ({
        ...prev,
        [fieldName]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    let isValid = true;

    fields.forEach(field => {
      // SALESFORCE: Skip validation for fields hidden by visibility rules
      if (!isFieldVisible(field)) {
        return;
      }
      
      // SALESFORCE: Skip validation for read-only fields
      if (field.readOnly) {
        return;
      }

      // Data Table validation - check output variable and edited data validation
      if (field.type === 'DataTable' && field.required) {
        const outputVar = field.selectionMode === 'single' ? field.outputSingleVar : field.outputMultiVar;
        if (outputVar) {
          const selectionValue = formData[outputVar];
          if (!selectionValue || (Array.isArray(selectionValue) && selectionValue.length === 0)) {
            newErrors[outputVar] = field.errorMessage || `${field.label}: Selection is required`;
            isValid = false;
            return;
          }
        }
        
        // Validate inline editing if enabled
        if (field.tableMode === 'inlineEditable' && field.editedDataVar) {
          const editedData = formData[field.editedDataVar] || [];
          
          // Check for cell-level validation errors
          editedData.forEach((editedRow, idx) => {
            (field.editableColumns || []).forEach(fieldName => {
              const validationKey = `validation_${fieldName}`;
              const validation = field[validationKey] || {};
              const value = editedRow[fieldName];
              
              // Required check
              if (validation.required && (!value || String(value).trim() === '')) {
                newErrors[`${field.editedDataVar}_${idx}_${fieldName}`] = `${fieldName} is required`;
                isValid = false;
              }
              
              // Max length for text
              const column = (field.columns || []).find(c => c.field === fieldName);
              if (column?.type === 'text' && validation.maxLength) {
                if (String(value || '').length > validation.maxLength) {
                  newErrors[`${field.editedDataVar}_${idx}_${fieldName}`] = `${fieldName} exceeds max length`;
                  isValid = false;
                }
              }
              
              // Number range
              if (column?.type === 'number') {
                const numValue = parseFloat(value);
                if (validation.min !== null && validation.min !== undefined && numValue < validation.min) {
                  newErrors[`${field.editedDataVar}_${idx}_${fieldName}`] = `${fieldName} below minimum`;
                  isValid = false;
                }
                if (validation.max !== null && validation.max !== undefined && numValue > validation.max) {
                  newErrors[`${field.editedDataVar}_${idx}_${fieldName}`] = `${fieldName} above maximum`;
                  isValid = false;
                }
              }
            });
          });
        }
        
        return; // Skip other validations for DataTable
      }

      const value = formData[field.name];
      const strValue = value ? String(value).trim() : '';

      // Required field validation
      if (field.required) {
        if (!value || strValue === '') {
          newErrors[field.name] = field.errorMessage || `${field.label} is required`;
          isValid = false;
          return;
        }
      }

      // Skip further validation if field is empty and not required
      if (!value || strValue === '') {
        return;
      }

      // SALESFORCE: Min/Max Length Validation (Text fields)
      if (['Text', 'Email', 'Phone', 'URL', 'Textarea'].includes(field.type)) {
        if (field.minLength && strValue.length < field.minLength) {
          newErrors[field.name] = field.errorMessage || `Minimum ${field.minLength} characters required`;
          isValid = false;
          return;
        }
        if (field.maxLength && strValue.length > field.maxLength) {
          newErrors[field.name] = field.errorMessage || `Maximum ${field.maxLength} characters allowed`;
          isValid = false;
          return;
        }
      }

      // SALESFORCE: Min/Max Value Validation (Number fields)
      if (['Number', 'Currency', 'Percent'].includes(field.type)) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          if (field.minValue !== null && field.minValue !== undefined && numValue < field.minValue) {
            newErrors[field.name] = field.errorMessage || `Minimum value is ${field.minValue}`;
            isValid = false;
            return;
          }
          if (field.maxValue !== null && field.maxValue !== undefined && numValue > field.maxValue) {
            newErrors[field.name] = field.errorMessage || `Maximum value is ${field.maxValue}`;
            isValid = false;
            return;
          }
        }
      }

      // SALESFORCE: Custom Pattern Validation (Regex)
      if (field.pattern && strValue) {
        try {
          const regex = new RegExp(field.pattern);
          if (!regex.test(strValue)) {
            newErrors[field.name] = field.errorMessage || `Invalid format for ${field.label}`;
            isValid = false;
            return;
          }
        } catch (e) {
          console.warn('Invalid regex pattern:', field.pattern);
        }
      }

      // Email validation
      if (field.type === 'Email' && strValue) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(strValue)) {
          newErrors[field.name] = field.errorMessage || 'Please enter a valid email address';
          isValid = false;
          return;
        }
      }

      // Phone validation (basic)
      if (field.type === 'Phone' && strValue) {
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(strValue)) {
          newErrors[field.name] = field.errorMessage || 'Please enter a valid phone number';
          isValid = false;
          return;
        }
      }

      // Number validation
      if (field.type === 'Number' && strValue) {
        if (isNaN(value)) {
          newErrors[field.name] = field.errorMessage || 'Please enter a valid number';
          isValid = false;
          return;
        }
      }
    });

    setErrors(newErrors);
    
    // SALESFORCE: Auto-scroll to first error
    if (!isValid) {
      const firstErrorField = Object.keys(newErrors)[0];
      if (firstErrorField) {
        const errorElement = document.querySelector(`[name="${firstErrorField}"]`);
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          errorElement.focus();
        }
      }
    }
    
    return isValid;
  };

  // SALESFORCE: Conditional Visibility Evaluation
  const isFieldVisible = (field) => {
    if (!field.hasVisibilityRule || !field.visibilityRule) {
      return true; // Always visible if no rule
    }

    const rule = field.visibilityRule;
    const compareValue = formData[rule.field];
    const ruleValue = rule.value;

    // Evaluate visibility based on operator
    switch (rule.operator) {
      case 'equals':
        return String(compareValue) === String(ruleValue);
      
      case 'not_equals':
        return String(compareValue) !== String(ruleValue);
      
      case 'contains':
        return String(compareValue || '').toLowerCase().includes(String(ruleValue).toLowerCase());
      
      case 'not_contains':
        return !String(compareValue || '').toLowerCase().includes(String(ruleValue).toLowerCase());
      
      case 'starts_with':
        return String(compareValue || '').toLowerCase().startsWith(String(ruleValue).toLowerCase());
      
      case 'greater_than':
        return parseFloat(compareValue) > parseFloat(ruleValue);
      
      case 'less_than':
        return parseFloat(compareValue) < parseFloat(ruleValue);
      
      case 'is_empty':
        return !compareValue || String(compareValue).trim() === '';
      
      case 'is_not_empty':
        return compareValue && String(compareValue).trim() !== '';
      
      default:
        return true;
    }
  };

  // NEXT BUTTON: Validate and move forward
  const handleNext = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    // Transform form data to Screen.* format
    const screenDataFormatted = {};
    Object.keys(formData).forEach(key => {
      screenDataFormatted[`Screen.${key}`] = formData[key];
    });

    // Evaluate Toast rules on Next click (onNextClick timing)
    const toastConfig = config.toast;
    if (toastConfig?.rules && toastConfig.triggerTiming === 'onNextClick') {
      const fullContext = { ...context, ...screenDataFormatted };
      evaluateToastRules(toastConfig.rules, fullContext);
    }
    
    // Check for Return URL (Salesforce behavior)
    const returnUrl = config.return_url;
    if (returnUrl && returnUrl.trim()) {
      console.log('🔗 Return URL configured:', returnUrl);
      
      // Evaluate variables in return URL
      const evaluatedUrl = evaluateReturnURL(returnUrl, { ...context, ...screenDataFormatted });
      console.log('🔗 Evaluated Return URL:', evaluatedUrl);
      
      // Check for unresolved variables (still contains {{ or {! patterns)
      const hasUnresolvedVars = evaluatedUrl.includes('{{') || evaluatedUrl.includes('{!');
      
      if (hasUnresolvedVars) {
        console.error('🔗 Return URL contains unresolved variables:', evaluatedUrl);
        setIsSubmitting(false);
        
        // Show error to user
        const unresolvedPattern = /\{\{([^}]+)\}\}|\{!([^}]+)\}/g;
        const matches = [...evaluatedUrl.matchAll(unresolvedPattern)];
        const unresolvedVars = matches.map(m => m[1] || m[2]).join(', ');
        
        alert(`Cannot redirect: Variable(s) not found: ${unresolvedVars}\n\nMake sure all variables exist and are available before this screen.`);
        return;
      }
      
      // Perform redirect and terminate flow
      if (evaluatedUrl && evaluatedUrl.trim()) {
        console.log('🔗 Redirecting to:', evaluatedUrl);
        
        // Small delay to show submitting state
        setTimeout(() => {
          window.location.href = evaluatedUrl;
        }, 300);
        
        return; // Terminate flow - do not call onNext
      }
    }
    
    // Default behavior: Continue to next node
    await onNext(screenDataFormatted);
    
    setIsSubmitting(false);
  };

  /**
   * Evaluate Return URL with variable substitution
   * Supports both {!Variable} and {{Variable}} syntax
   * Salesforce Rule: Only resolves variables that exist in context
   */
  const evaluateReturnURL = (urlTemplate, contextData) => {
    let result = urlTemplate;
    
    // Pattern 1: {{Variable}} or {{Screen.field}}
    const pattern1 = /\{\{([^}]+)\}\}/g;
    result = result.replace(pattern1, (match, varPath) => {
      const value = getVariableValue(varPath.trim(), contextData);
      // Keep placeholder if variable not found (for validation)
      return value !== null && value !== undefined ? String(value) : match;
    });
    
    // Pattern 2: {!Variable} or {!Screen.field}
    const pattern2 = /\{!([^}]+)\}/g;
    result = result.replace(pattern2, (match, varPath) => {
      const value = getVariableValue(varPath.trim(), contextData);
      // Keep placeholder if variable not found (for validation)
      return value !== null && value !== undefined ? String(value) : match;
    });
    
    return result;
  };

  /**
   * Get variable value from context by path
   * Supports nested paths like 'NewRecord.Id' or 'Screen.email'
   * Salesforce Rule: Returns null if variable doesn't exist
   */
  const getVariableValue = (varPath, contextData) => {
    const parts = varPath.split('.');
    let value = contextData;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  };

  // PREVIOUS BUTTON: Navigate back without validation
  const handlePrevious = () => {
    // No validation required - just go back
    onPrevious();
  };

  // FINISH BUTTON: Validate and complete flow
  const handleFinish = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    // Transform form data to Screen.* format
    const screenDataFormatted = {};
    Object.keys(formData).forEach(key => {
      screenDataFormatted[`Screen.${key}`] = formData[key];
    });
    
    // Call onFinish handler
    await onFinish(screenDataFormatted);
    
    setIsSubmitting(false);
  };

  const renderField = (field, index) => {
    // SALESFORCE: Skip rendering if field is hidden by visibility rule
    if (!isFieldVisible(field)) {
      return null;
    }

    const fieldValue = formData[field.name] || '';
    const fieldError = errors[field.name];
    const isReadOnly = field.readOnly || false;
    
    // Get field-level custom styles
    const getFieldStyles = () => {
      const style = field.style || {};
      const styles = {
        container: {},
        label: {},
        input: {}
      };
      
      if (!style || Object.keys(style).length === 0) return styles;
      
      // Label color
      const labelColors = {
        'default': '#374151',
        'blue': '#2563eb',
        'indigo': '#4f46e5',
        'purple': '#9333ea',
        'green': '#16a34a',
        'amber': '#d97706',
        'red': '#dc2626',
        'gray': '#6b7280'
      };
      if (style.labelColor && style.labelColor !== 'default') {
        styles.label.color = labelColors[style.labelColor] || '#374151';
      }
      
      // Background color
      const bgColors = {
        'transparent': 'transparent',
        'white': '#ffffff',
        'gray-50': '#f9fafb',
        'blue-50': '#eff6ff',
        'green-50': '#f0fdf4',
        'purple-50': '#faf5ff',
        'amber-50': '#fffbeb',
        'red-50': '#fef2f2'
      };
      if (style.backgroundColor && style.backgroundColor !== 'transparent') {
        styles.container.backgroundColor = bgColors[style.backgroundColor] || 'transparent';
        styles.container.padding = '12px';
        styles.container.borderRadius = '8px';
      }
      
      // Border color
      const borderColors = {
        'default': '#d1d5db',
        'blue': '#3b82f6',
        'indigo': '#6366f1',
        'purple': '#a855f7',
        'green': '#22c55e',
        'amber': '#f59e0b',
        'red': '#ef4444',
        'gray': '#9ca3af'
      };
      if (style.borderColor && style.borderColor !== 'default') {
        styles.input.borderColor = borderColors[style.borderColor];
        styles.input.borderWidth = style.borderWidth ? `${style.borderWidth}px` : '1px';
      }
      
      // Border radius
      const borderRadii = {
        'none': '0px',
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        'full': '9999px'
      };
      if (style.borderRadius) {
        styles.input.borderRadius = borderRadii[style.borderRadius] || '6px';
      }
      
      return styles;
    };
    
    const fieldStyles = getFieldStyles();
    
    // Common input props
    const commonProps = {
      name: field.name,
      value: fieldValue,
      onChange: (e) => handleFieldChange(field.name, e.target.value),
      disabled: isReadOnly,
      className: isReadOnly ? 'bg-gray-100 cursor-not-allowed' : '',
      style: Object.keys(fieldStyles.input).length > 0 ? fieldStyles.input : {}
    };
    
    switch (field.type) {
      case 'Text':
      case 'Email':
      case 'Phone':
        return (
          <div key={field.id || index} className="space-y-2" style={fieldStyles.container}>
            <Label className="text-sm font-medium" style={fieldStyles.label.color ? { color: fieldStyles.label.color } : { color: '#374151' }}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type={field.type === 'Email' ? 'email' : field.type === 'Phone' ? 'tel' : 'text'}
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.helpText || `Enter ${field.label}`}
              className={fieldError ? 'border-red-500' : ''}
              style={commonProps.style}
            />
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      case 'Number':
        return (
          <div key={field.id || index} className="space-y-2" style={fieldStyles.container}>
            <Label className="text-sm font-medium" style={fieldStyles.label.color ? { color: fieldStyles.label.color } : { color: '#374151' }}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="number"
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.helpText || `Enter ${field.label}`}
              className={fieldError ? 'border-red-500' : ''}
              style={commonProps.style}
            />
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      case 'Date':
        return (
          <div key={field.id || index} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="date"
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              className={fieldError ? 'border-red-500' : ''}
            />
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      case 'Textarea':
        return (
          <div key={field.id || index} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.helpText || `Enter ${field.label}`}
              rows={4}
              className={fieldError ? 'border-red-500' : ''}
            />
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      case 'Checkbox':
        return (
          <div key={field.id || index} className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id={field.name}
                checked={fieldValue === true || fieldValue === 'true'}
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <Label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
            </div>
            {field.helpText && (
              <p className="text-xs text-gray-500 ml-7">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600 ml-7">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      case 'Dropdown':
        // For dropdown, options would be in field.options
        const options = field.options || ['Option 1', 'Option 2', 'Option 3'];
        return (
          <div key={field.id || index} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select
              value={fieldValue}
              onValueChange={(value) => handleFieldChange(field.name, value)}
            >
              <SelectTrigger className={fieldError ? 'border-red-500' : ''}>
                <SelectValue placeholder={`Select ${field.label}`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option, idx) => (
                  <SelectItem key={idx} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      case 'DataTable':
        return (
          <div key={field.id || index} className="mb-6">
            <DataTableRuntime
              field={field}
              executionContext={context}
              onValueChange={(varName, value) => {
                console.log(`[DATA TABLE] Setting ${varName} =`, value);
                handleFieldChange(varName, value);
              }}
              validationError={errors[field.outputSingleVar || field.outputMultiVar]}
            />
          </div>
        );

      // =====================================================
      // NEW FIELD TYPES FOR DYNAMIC SCREEN FLOWS
      // These use separate component imports to avoid hook violations
      // =====================================================
      
      case 'RecordLookup':
      case 'ObjectLookup':
        return (
          <RecordLookupField
            key={field.id || index}
            field={field}
            value={fieldValue}
            onChange={(val) => handleFieldChange(field.name, val)}
            onNameChange={handleFieldChange}
            error={fieldError}
            isReadOnly={isReadOnly}
            context={context}
          />
        );
      
      case 'DateTime':
      case 'DateTimeLocal':
        return (
          <div key={field.id || index} className="space-y-2" style={fieldStyles.container}>
            <Label className="text-sm font-medium" style={fieldStyles.label.color ? { color: fieldStyles.label.color } : { color: '#374151' }}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="datetime-local"
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              className={fieldError ? 'border-red-500' : ''}
              disabled={isReadOnly}
              style={commonProps.style}
            />
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      case 'DateTimeWithRecommendations':
        return (
          <DateTimeWithRecommendationsField
            key={field.id || index}
            field={field}
            value={fieldValue}
            onChange={(val) => handleFieldChange(field.name, val)}
            onLinkedChange={handleFieldChange}
            error={fieldError}
            isReadOnly={isReadOnly}
          />
        );
      
      case 'DisplayRecord':
      case 'RecordDisplay':
        return (
          <DisplayRecordField
            key={field.id || index}
            field={field}
            context={context}
          />
        );
      
      case 'ReviewSummary':
        return (
          <ReviewSummaryField
            key={field.id || index}
            field={field}
            context={context}
            formData={formData}
          />
        );
      
      case 'ServiceAppointmentSelector':
        return (
          <ServiceAppointmentSelectorField
            key={field.id || index}
            field={field}
            value={fieldValue}
            onChange={(val) => handleFieldChange(field.name, val)}
            error={fieldError}
            context={context}
          />
        );
      
      // =====================================================
      // END OF NEW FIELD TYPES
      // =====================================================

      case 'FileUpload':
      case 'File':
        // File Upload Component (C2 requirement)
        const API = process.env.REACT_APP_BACKEND_URL;
        const fileData = fieldValue ? (typeof fieldValue === 'string' ? JSON.parse(fieldValue) : fieldValue) : null;
        
        const handleFileUpload = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          
          // Check file size (max 10MB by default, configurable)
          const maxSize = (field.maxFileSizeMB || 10) * 1024 * 1024;
          if (file.size > maxSize) {
            toast.error(`File too large. Max size: ${field.maxFileSizeMB || 10}MB`);
            return;
          }
          
          // Check allowed types if specified
          if (field.allowedTypes && field.allowedTypes.length > 0) {
            const fileExt = file.name.split('.').pop()?.toLowerCase();
            if (!field.allowedTypes.some(t => t.toLowerCase() === fileExt)) {
              toast.error(`File type not allowed. Allowed: ${field.allowedTypes.join(', ')}`);
              return;
            }
          }
          
          try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${API}/api/files/upload`, {
              method: 'POST',
              body: formData
            });
            
            if (!response.ok) throw new Error('Upload failed');
            
            const result = await response.json();
            
            // Store file metadata in the field value
            const fileMetadata = {
              id: result.id || result.file_id,
              name: file.name,
              url: result.url || result.file_url,
              size: file.size,
              type: file.type,
              uploadedAt: new Date().toISOString()
            };
            
            handleFieldChange(field.name, JSON.stringify(fileMetadata));
            toast.success('File uploaded successfully');
          } catch (err) {
            console.error('File upload error:', err);
            toast.error('Failed to upload file. Please try again.');
          }
        };
        
        const handleRemoveFile = () => {
          handleFieldChange(field.name, '');
        };
        
        return (
          <div key={field.id || index} className="space-y-2" style={fieldStyles.container}>
            <Label className="text-sm font-medium" style={fieldStyles.label.color ? { color: fieldStyles.label.color } : { color: '#374151' }}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            
            {!fileData ? (
              <div className="relative">
                <input
                  type="file"
                  id={`file-${field.name}`}
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  accept={field.allowedTypes?.map(t => `.${t}`).join(',')}
                  disabled={isReadOnly}
                />
                <div className={`flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg transition-colors ${
                  isReadOnly ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                } ${fieldError ? 'border-red-400' : 'border-gray-300'}`}>
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Click to upload or drag and drop
                  </span>
                </div>
                {field.allowedTypes && field.allowedTypes.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Allowed: {field.allowedTypes.join(', ')} | Max: {field.maxFileSizeMB || 10}MB
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center gap-2">
                  <File className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{fileData.name}</p>
                    <p className="text-xs text-gray-500">
                      {(fileData.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                )}
              </div>
            )}
            
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      
      default:
        return (
          <div key={field.id || index} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="text"
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.helpText || `Enter ${field.label}`}
              className={fieldError ? 'border-red-500' : ''}
            />
            {field.helpText && !fieldError && (
              <p className="text-xs text-gray-500">{field.helpText}</p>
            )}
            {fieldError && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
    }
  };

  // Compute theme styles
  const themeStyles = getThemeStyles(config.theme);

  return (
    <div 
      className="overflow-hidden"
      style={{
        backgroundColor: themeStyles.contentCard.backgroundColor || '#ffffff',
        borderRadius: themeStyles.contentCard.borderRadius || '8px',
        boxShadow: themeStyles.contentCard.boxShadow || '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
      }}
    >
      {/* Screen Header */}
      <div 
        className="px-6 py-6"
        style={themeStyles.header.background ? { background: themeStyles.header.background } : { backgroundImage: 'linear-gradient(to right, #2563eb, #4f46e5)' }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Monitor className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">{screenTitle}</h2>
        </div>
        {screenDescription && (
          <p className="text-blue-100 text-sm mt-2">{screenDescription}</p>
        )}
      </div>

      {/* Screen Body */}
      <form onSubmit={(e) => e.preventDefault()} className={themeStyles.contentPadding}>
        {fields.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No fields configured for this screen</p>
          </div>
        ) : (
          <>
            {/* COLUMN LAYOUT RENDERING */}
            {config.layout?.type === 'twoColumn' ? (
              // 2-COLUMN LAYOUT - Responsive: stacks to 1 column on mobile
              <div className="space-y-5">
                {(() => {
                  // Separate full-width and column-specific fields
                  const visibleFields = fields.filter(f => isFieldVisible(f));
                  const fullWidthFields = visibleFields.filter(f => f.layout?.span === 'full');
                  const col1Fields = visibleFields.filter(f => f.layout?.span !== 'full' && (f.layout?.col === 1 || !f.layout?.col));
                  const col2Fields = visibleFields.filter(f => f.layout?.span !== 'full' && f.layout?.col === 2);
                  
                  // Build rows
                  const rows = [];
                  let col1Idx = 0;
                  let col2Idx = 0;
                  
                  visibleFields.forEach((field) => {
                    if (field.layout?.span === 'full') {
                      rows.push({ type: 'full', field });
                    } else {
                      const isCol1 = field.layout?.col === 1 || !field.layout?.col;
                      if (isCol1 && col1Fields[col1Idx] === field) {
                        rows.push({
                          type: 'pair',
                          left: col1Fields[col1Idx],
                          right: col2Fields[col2Idx] || null
                        });
                        col1Idx++;
                        if (col2Fields[col2Idx]) col2Idx++;
                      } else if (!col1Fields.slice(col1Idx).length && field === col2Fields[col2Idx]) {
                        rows.push({ type: 'pair', left: null, right: field });
                        col2Idx++;
                      }
                    }
                  });
                  
                  // Remaining col2 fields
                  while (col2Idx < col2Fields.length) {
                    rows.push({ type: 'pair', left: null, right: col2Fields[col2Idx] });
                    col2Idx++;
                  }
                  
                  return rows.map((row, rowIdx) => {
                    if (row.type === 'full') {
                      return (
                        <div key={`row-${rowIdx}`} className="w-full">
                          {renderField(row.field, rowIdx)}
                        </div>
                      );
                    } else {
                      return (
                        <div key={`row-${rowIdx}`} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>{row.left && renderField(row.left, rowIdx * 2)}</div>
                          <div>{row.right && renderField(row.right, rowIdx * 2 + 1)}</div>
                        </div>
                      );
                    }
                  });
                })()}
              </div>
            ) : (
              // 1-COLUMN LAYOUT (Default)
              <div className="space-y-5">
                {fields.map((field, index) => renderField(field, index))}
              </div>
            )}
          </>
        )}

        {/* SALESFORCE-STYLE BUTTON FOOTER */}
        <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-gray-200">
          {/* Previous Button (Left) */}
          <div>
            {showPrevious && (
              <button
                type="button"
                onClick={handlePrevious}
                disabled={isSubmitting}
                className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
            )}
          </div>

          {/* Next and Finish Buttons (Right) */}
          <div className="flex gap-3">
            {showNext && (
              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting || fields.length === 0}
                className="px-6 py-3 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
                style={themeStyles.button.backgroundColor ? { backgroundColor: themeStyles.button.backgroundColor } : { backgroundColor: '#2563eb' }}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
            
            {showFinish && (
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSubmitting || fields.length === 0}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  'Finish'
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default ScreenRenderer;
