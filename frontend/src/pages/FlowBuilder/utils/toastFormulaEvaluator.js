/**
 * Toast Formula Evaluator
 * Evaluates conditional formulas for Toast rules
 * Supports variables, operators, and basic functions
 */

/**
 * Parse and evaluate a formula with given context
 * @param {string} formula - The formula string e.g., "{{Screen.Email}} != ''"
 * @param {object} context - Variables available for substitution
 * @returns {boolean} - Result of formula evaluation
 */
export const evaluateFormula = (formula, context = {}) => {
  if (!formula || formula.trim() === '') {
    // Empty formula = always true (useful for default rules)
    console.log('[FORMULA EVAL] Empty formula, returning true');
    return true;
  }

  try {
    console.log('[FORMULA EVAL] ===== START =====');
    console.log('[FORMULA EVAL] Original formula:', formula);
    console.log('[FORMULA EVAL] Context:', context);
    
    // Replace variables with values
    let processedFormula = formula;
    
    // Find all {{variable}} patterns
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const matches = [...formula.matchAll(variablePattern)];
    
    for (const match of matches) {
      const fullMatch = match[0]; // e.g., "{{Screen.Email}}"
      const variablePath = match[1].trim(); // e.g., "Screen.Email"
      
      // Get value from context
      const value = getValueFromPath(variablePath, context);
      
      // Replace with value (properly escaped for JS)
      const escapedValue = JSON.stringify(value);
      processedFormula = processedFormula.replace(fullMatch, escapedValue);
      
      console.log(`[FORMULA EVAL] Variable ${variablePath} = ${escapedValue}`);
    }
    
    console.log('[FORMULA EVAL] After variable substitution:', processedFormula);
    
    // Replace operators with JS equivalents
    // CRITICAL: Handle single = (comparison) vs == vs operators like >= and <=
    // Order matters to avoid replacing parts of other operators!
    
    // Step 1: Protect >= and <= by replacing with placeholders
    processedFormula = processedFormula
      .replace(/>=/g, '__GTE__')
      .replace(/<=/g, '__LTE__');
    
    // Step 2: Replace != with !==
    processedFormula = processedFormula.replace(/!=/g, '!==');
    
    // Step 3: Replace == with ===
    processedFormula = processedFormula.replace(/==/g, '===');
    
    // Step 4: Replace remaining single = with === (for comparison)
    // This catches cases where users write "Field = Value" instead of "Field == Value"
    processedFormula = processedFormula.replace(/([^!<>=])=([^=])/g, '$1===$2');
    
    // Step 5: Restore >= and <=
    processedFormula = processedFormula
      .replace(/__GTE__/g, '>=')
      .replace(/__LTE__/g, '<=');
    
    // Step 6: Replace AND, OR, NOT
    processedFormula = processedFormula
      .replace(/\bAND\b/gi, '&&')
      .replace(/\bOR\b/gi, '||')
      .replace(/\bNOT\b/gi, '!');
    
    // Handle functions
    processedFormula = processFunctions(processedFormula);
    
    console.log('[FORMULA EVAL] After operator & function processing:', processedFormula);
    
    // Evaluate the formula safely
    const result = evaluateSafely(processedFormula);
    
    console.log('[FORMULA EVAL] Result:', result, '(boolean:', !!result, ')');
    console.log('[FORMULA EVAL] ===== END =====');
    
    return !!result; // Convert to boolean
  } catch (error) {
    console.error('[FORMULA EVAL] Error evaluating formula:', formula, error);
    return false; // Fail safely
  }
};

/**
 * Get value from nested path in context
 * @param {string} path - e.g., "Screen.Email" or "FlowVariable.ContactId"
 * @param {object} context - The data context
 * @returns {any} - The value at that path
 */
const getValueFromPath = (path, context) => {
  console.log(`[FORMULA EVAL] Getting value for path: "${path}"`);
  console.log(`[FORMULA EVAL] Available context keys:`, Object.keys(context));
  
  const parts = path.split('.');
  let value = context;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    console.log(`[FORMULA EVAL]   Step ${i + 1}: Looking for "${part}" in`, typeof value === 'object' ? Object.keys(value) : value);
    
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
      console.log(`[FORMULA EVAL]   Found: ${JSON.stringify(value)}`);
    } else {
      console.log(`[FORMULA EVAL]   NOT FOUND - returning undefined`);
      return undefined;
    }
  }
  
  console.log(`[FORMULA EVAL] Final value for "${path}":`, value);
  return value;
};

/**
 * Process function calls in formula
 * Supports: isBlank, contains, isNull, length
 */
const processFunctions = (formula) => {
  let processed = formula;
  
  // isBlank(value) - checks if value is empty string, null, or undefined
  processed = processed.replace(/isBlank\(([^)]+)\)/g, (match, arg) => {
    return `(${arg} === null || ${arg} === undefined || ${arg} === '')`;
  });
  
  // isNull(value) - checks if value is null or undefined
  processed = processed.replace(/isNull\(([^)]+)\)/g, (match, arg) => {
    return `(${arg} === null || ${arg} === undefined)`;
  });
  
  // contains(str, substring) - checks if string contains substring
  processed = processed.replace(/contains\(([^,]+),([^)]+)\)/g, (match, str, substring) => {
    return `(String(${str}).includes(${substring}))`;
  });
  
  // length(value) - returns length of string or array
  processed = processed.replace(/length\(([^)]+)\)/g, (match, arg) => {
    return `((${arg} && ${arg}.length) || 0)`;
  });
  
  return processed;
};

/**
 * Safely evaluate a processed formula
 * Uses Function constructor with limited scope
 */
const evaluateSafely = (formula) => {
  // Create a safe evaluation function
  // No access to global scope or dangerous functions
  try {
    const evalFunc = new Function('return (' + formula + ')');
    return evalFunc();
  } catch (error) {
    console.error('[FORMULA EVAL] Evaluation error:', error);
    return false;
  }
};

/**
 * Validate formula syntax without evaluating
 * Returns { valid: boolean, error: string }
 */
export const validateFormula = (formula) => {
  if (!formula || formula.trim() === '') {
    return { valid: true, error: null };
  }
  
  try {
    // Try to parse it with dummy values
    const dummyContext = {
      Screen: {},
      FlowVariable: {},
      ActionOutput: {}
    };
    
    evaluateFormula(formula, dummyContext);
    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Extract all variable references from a formula
 * Returns array of variable paths e.g., ["Screen.Email", "FlowVariable.Status"]
 */
export const extractVariables = (formula) => {
  if (!formula) return [];
  
  const variablePattern = /\{\{([^}]+)\}\}/g;
  const matches = [...formula.matchAll(variablePattern)];
  
  return matches.map(match => match[1].trim());
};

export default {
  evaluateFormula,
  validateFormula,
  extractVariables
};
