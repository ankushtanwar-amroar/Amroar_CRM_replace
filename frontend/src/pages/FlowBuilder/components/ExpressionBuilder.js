/**
 * ExpressionBuilder - No-code expression builder for Flow Builder
 * Allows users to build concatenation/formula expressions without coding
 */
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Variable, Type, Hash, Calendar, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';

const ExpressionBuilder = ({ 
  value, 
  onChange, 
  availableVariables = [],
  label = "Value",
  placeholder = "Enter value or build expression...",
  showPreview = true,
  context = {}
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expressionParts, setExpressionParts] = useState([]);
  const [previewResult, setPreviewResult] = useState('');
  
  // Initialize from value
  useEffect(() => {
    if (value && !expressionParts.length) {
      // Check if it looks like an expression
      if (value.includes('{{') || value.includes('CONCAT(') || value.includes(' + ')) {
        parseExistingExpression(value);
      }
    }
  }, [value]);
  
  // Update preview when parts change
  useEffect(() => {
    if (expressionParts.length > 0) {
      const result = buildPreview();
      setPreviewResult(result);
    } else {
      setPreviewResult(value || '');
    }
  }, [expressionParts, context]);
  
  // Parse existing expression into parts
  const parseExistingExpression = (expr) => {
    const parts = [];
    
    // Simple parser: split by known patterns
    const tokens = expr.split(/(\{\{[^}]+\}\})/g).filter(Boolean);
    
    tokens.forEach(token => {
      if (token.startsWith('{{') && token.endsWith('}}')) {
        const varName = token.slice(2, -2).trim();
        parts.push({ type: 'variable', value: varName });
      } else if (token.trim()) {
        parts.push({ type: 'text', value: token });
      }
    });
    
    setExpressionParts(parts);
  };
  
  // Build expression string from parts
  const buildExpressionString = (parts) => {
    if (parts.length === 0) return '';
    
    return parts.map(part => {
      if (part.type === 'variable') {
        return `{{${part.value}}}`;
      }
      return part.value;
    }).join('');
  };
  
  // Build preview with sample values
  const buildPreview = () => {
    if (expressionParts.length === 0) return value || '';
    
    return expressionParts.map(part => {
      if (part.type === 'variable') {
        // Try to get value from context
        const val = getNestedValue(context, part.value);
        if (val !== null && val !== undefined) return val;
        // Show sample placeholder
        return `[${part.value}]`;
      }
      return part.value;
    }).join('');
  };
  
  // Get nested value from context
  const getNestedValue = (obj, path) => {
    if (!path) return null;
    
    // Direct lookup first
    if (obj[path] !== undefined) return obj[path];
    
    // Navigate path
    const parts = path.split('.');
    let value = obj;
    
    for (const part of parts) {
      if (value === null || value === undefined) return null;
      if (typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  };
  
  // Add new part
  const addPart = (type) => {
    const newParts = [...expressionParts];
    
    if (type === 'variable') {
      newParts.push({ type: 'variable', value: '' });
    } else if (type === 'text') {
      newParts.push({ type: 'text', value: '' });
    } else if (type === 'space') {
      newParts.push({ type: 'text', value: ' ' });
    } else if (type === 'comma') {
      newParts.push({ type: 'text', value: ', ' });
    } else if (type === 'dash') {
      newParts.push({ type: 'text', value: ' - ' });
    }
    
    setExpressionParts(newParts);
    
    // Update parent
    onChange(buildExpressionString(newParts));
  };
  
  // Update part
  const updatePart = (index, newValue) => {
    const newParts = [...expressionParts];
    newParts[index].value = newValue;
    setExpressionParts(newParts);
    onChange(buildExpressionString(newParts));
  };
  
  // Remove part
  const removePart = (index) => {
    const newParts = expressionParts.filter((_, i) => i !== index);
    setExpressionParts(newParts);
    onChange(buildExpressionString(newParts));
  };
  
  // Move part
  const movePart = (index, direction) => {
    const newParts = [...expressionParts];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newParts.length) {
      [newParts[index], newParts[newIndex]] = [newParts[newIndex], newParts[index]];
      setExpressionParts(newParts);
      onChange(buildExpressionString(newParts));
    }
  };
  
  // Get icon for variable type
  const getVariableIcon = (varPath) => {
    if (varPath.toLowerCase().includes('date')) return <Calendar className="w-3 h-3" />;
    if (varPath.toLowerCase().includes('number') || varPath.toLowerCase().includes('amount')) return <Hash className="w-3 h-3" />;
    return <Variable className="w-3 h-3" />;
  };
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          {isExpanded ? 'Simple mode' : 'Expression Builder'}
        </Button>
      </div>
      
      {!isExpanded ? (
        /* Simple text input */
        <Input
          value={value || ''}
          onChange={(e) => {
            onChange(e.target.value);
            // Clear expression parts if user is typing directly
            if (expressionParts.length > 0) {
              setExpressionParts([]);
            }
          }}
          placeholder={placeholder}
          className="font-mono text-sm"
        />
      ) : (
        /* Expression Builder UI */
        <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
          {/* Parts List */}
          {expressionParts.length > 0 && (
            <div className="space-y-2">
              {expressionParts.map((part, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-2 bg-white p-2 rounded border"
                >
                  {/* Type indicator */}
                  <div className={`w-6 h-6 rounded flex items-center justify-center ${
                    part.type === 'variable' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {part.type === 'variable' ? getVariableIcon(part.value) : <Type className="w-3 h-3" />}
                  </div>
                  
                  {/* Input */}
                  {part.type === 'variable' ? (
                    <Select
                      value={part.value}
                      onValueChange={(v) => updatePart(index, v)}
                    >
                      <SelectTrigger className="flex-1 h-8 text-sm">
                        <SelectValue placeholder="Select variable..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVariables.map((varInfo, i) => (
                          <SelectItem key={i} value={varInfo.path || varInfo}>
                            {varInfo.label || varInfo.path || varInfo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={part.value}
                      onChange={(e) => updatePart(index, e.target.value)}
                      placeholder="Text..."
                      className="flex-1 h-8 text-sm"
                    />
                  )}
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => movePart(index, 'up')}
                      disabled={index === 0}
                      className="h-6 w-6 p-0"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => movePart(index, 'down')}
                      disabled={index === expressionParts.length - 1}
                      className="h-6 w-6 p-0"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePart(index)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Add Part Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addPart('variable')}
              className="text-xs"
            >
              <Variable className="w-3 h-3 mr-1" />
              Variable
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addPart('text')}
              className="text-xs"
            >
              <Type className="w-3 h-3 mr-1" />
              Text
            </Button>
            <div className="border-l mx-1"></div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => addPart('space')}
              className="text-xs"
            >
              Space
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => addPart('comma')}
              className="text-xs"
            >
              Comma
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => addPart('dash')}
              className="text-xs"
            >
              Dash
            </Button>
          </div>
          
          {/* Preview */}
          {showPreview && (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs text-gray-500 mb-1">Preview:</div>
              <div className="bg-white border rounded px-3 py-2 font-mono text-sm text-gray-800">
                {previewResult || <span className="text-gray-400 italic">Empty</span>}
              </div>
            </div>
          )}
          
          {/* Generated Expression */}
          <div className="text-xs text-gray-500">
            <span className="font-medium">Expression: </span>
            <code className="bg-gray-200 px-1 rounded">
              {buildExpressionString(expressionParts) || '(empty)'}
            </code>
          </div>
        </div>
      )}
      
      {/* Hint for inline syntax */}
      {!isExpanded && (
        <p className="text-xs text-gray-500">
          Tip: Use <code className="bg-gray-100 px-1 rounded">{'{{variable}}'}</code> or <code className="bg-gray-100 px-1 rounded">CONCAT()</code> for expressions
        </p>
      )}
    </div>
  );
};

export default ExpressionBuilder;
