/**
 * InsertVariableButton - Button to insert variables into text fields
 * Provides dropdown with available variables and expression functions
 */
import React, { useState, useRef, useEffect } from 'react';
import { Variable, ChevronDown, Search, Sparkles, List, Type, Hash, Calendar, Combine } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

const InsertVariableButton = ({ 
  onInsert, 
  availableVariables = [],
  triggerVariables = [],
  screenVariables = [],
  recordVariables = [],
  loopVariables = [],
  systemVariables = ['TODAY()', 'NOW()'],
  buttonText = 'Insert Variable',
  buttonSize = 'sm'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const dropdownRef = useRef(null);
  
  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Combine all variables
  const allVariables = [
    ...availableVariables.map(v => ({ ...v, category: 'general' })),
    ...triggerVariables.map(v => ({ path: `Trigger.${v.object}.${v.field}`, label: `Trigger: ${v.field}`, category: 'trigger', type: v.type })),
    ...screenVariables.map(v => ({ path: `Screen.${v}`, label: `Screen: ${v}`, category: 'screen' })),
    ...recordVariables.map(v => ({ path: `Record.${v}`, label: `Record: ${v}`, category: 'record' })),
    ...loopVariables.map(v => ({ path: v.path, label: v.label || v.path, category: 'loop' })),
  ];
  
  // Filter variables based on search
  const filteredVariables = allVariables.filter(v => {
    const matchesSearch = !searchTerm || 
      (v.label?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (v.path?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === 'all' || v.category === activeTab;
    
    return matchesSearch && matchesTab;
  });
  
  // Expression functions
  const expressionFunctions = [
    { name: 'CONCAT', syntax: 'CONCAT(value1, value2, ...)', description: 'Join multiple values' },
    { name: 'JOIN', syntax: 'JOIN(collection, separator)', description: 'Join array items' },
    { name: 'TEXT', syntax: 'TEXT(value)', description: 'Convert to text' },
    { name: 'UPPER', syntax: 'UPPER(text)', description: 'Uppercase text' },
    { name: 'LOWER', syntax: 'LOWER(text)', description: 'Lowercase text' },
    { name: 'TRIM', syntax: 'TRIM(text)', description: 'Remove whitespace' },
    { name: 'LEN', syntax: 'LEN(text)', description: 'Text length' },
    { name: 'LEFT', syntax: 'LEFT(text, n)', description: 'First n characters' },
    { name: 'RIGHT', syntax: 'RIGHT(text, n)', description: 'Last n characters' },
    { name: 'SUBSTITUTE', syntax: 'SUBSTITUTE(text, old, new)', description: 'Replace text' },
  ];
  
  const handleInsertVariable = (varPath) => {
    onInsert(`{{${varPath}}}`);
    setIsOpen(false);
    setSearchTerm('');
  };
  
  const handleInsertFunction = (func) => {
    onInsert(func.syntax);
    setIsOpen(false);
  };
  
  const handleInsertSystem = (sysVar) => {
    onInsert(sysVar);
    setIsOpen(false);
  };
  
  // Get icon for variable type
  const getIcon = (varType) => {
    if (varType === 'number' || varType === 'integer' || varType === 'currency') return <Hash className="w-3 h-3" />;
    if (varType === 'date' || varType === 'datetime') return <Calendar className="w-3 h-3" />;
    if (varType === 'array' || varType === 'collection') return <List className="w-3 h-3" />;
    return <Type className="w-3 h-3" />;
  };
  
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'trigger', label: 'Trigger' },
    { id: 'screen', label: 'Screen' },
    { id: 'record', label: 'Record' },
    { id: 'functions', label: 'Functions' },
  ];
  
  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        size={buttonSize}
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs"
      >
        <Variable className="w-3 h-3 mr-1" />
        {buttonText}
        <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>
      
      {isOpen && (
        <div className="absolute z-50 mt-1 w-80 bg-white rounded-lg shadow-lg border overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search variables..."
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b bg-gray-50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id 
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Content */}
          <div className="max-h-64 overflow-y-auto">
            {activeTab !== 'functions' ? (
              /* Variables List */
              <div className="p-1">
                {filteredVariables.length === 0 ? (
                  <div className="text-center py-4 text-sm text-gray-500">
                    No variables found
                  </div>
                ) : (
                  filteredVariables.map((v, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleInsertVariable(v.path)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-blue-50 flex items-center gap-2 group"
                    >
                      <div className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center">
                        {getIcon(v.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700 truncate">{v.label}</div>
                        <div className="text-xs text-gray-400 truncate font-mono">{`{{${v.path}}}`}</div>
                      </div>
                      <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100">
                        Insert
                      </span>
                    </button>
                  ))
                )}
                
                {/* System Variables */}
                {(activeTab === 'all' || activeTab === 'functions') && (
                  <>
                    <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50 mt-1">
                      System
                    </div>
                    {systemVariables.map((sysVar, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleInsertSystem(sysVar)}
                        className="w-full text-left px-3 py-2 rounded hover:bg-green-50 flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded bg-green-100 text-green-600 flex items-center justify-center">
                          <Calendar className="w-3 h-3" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-700">{sysVar}</div>
                          <div className="text-xs text-gray-400">
                            {sysVar.includes('TODAY') ? 'Current date' : 'Current date/time'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : (
              /* Functions List */
              <div className="p-1">
                <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">
                  Expression Functions
                </div>
                {expressionFunctions.map((func, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleInsertFunction(func)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-purple-50 flex items-center gap-2"
                  >
                    <div className="w-6 h-6 rounded bg-purple-100 text-purple-600 flex items-center justify-center">
                      <Combine className="w-3 h-3" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-700 font-mono">{func.name}</div>
                      <div className="text-xs text-gray-400">{func.description}</div>
                      <div className="text-xs text-gray-300 font-mono">{func.syntax}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer hint */}
          <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-500">
            Tip: Use <code className="bg-gray-200 px-1 rounded">+</code> to concatenate values, e.g., <code className="bg-gray-200 px-1 rounded">{`"Hello " + {{Name}}`}</code>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsertVariableButton;
