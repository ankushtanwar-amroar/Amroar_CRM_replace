import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';
import { Input } from '../../../components/ui/input';

/**
 * ComboField - Salesforce-style combo field that allows both:
 * 1. Selecting from a dropdown (with search)
 * 2. Typing custom text values
 * 
 * Used in Flow Builder for filter conditions
 */
const ComboField = ({ value, onChange, options = [], placeholder = 'Type or select...', disabled = false, allowCustom = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    if (allowCustom) {
      onChange(newValue);
    }
  };

  const handleOptionSelect = (optionValue) => {
    setInputValue(optionValue);
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setInputValue('');
    onChange('');
  };

  // Filter options based on search term
  const filteredOptions = options.filter(option => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      option.label?.toLowerCase().includes(search) ||
      option.value?.toLowerCase().includes(search) ||
      option.description?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-16"
        />
        
        {/* Right side controls */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* Clear button */}
          {inputValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 rounded"
              title="Clear"
            >
              <X className="h-3.5 w-3.5 text-slate-500" />
            </button>
          )}
          
          {/* Dropdown button */}
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            className="p-1 hover:bg-slate-100 rounded"
            disabled={disabled}
          >
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown Menu with Search */}
      {isOpen && options.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-80 overflow-hidden">
          {/* Search Box */}
          <div className="sticky top-0 bg-white border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="pl-8 h-8"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleOptionSelect(option.value)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 transition-colors ${
                    inputValue === option.value ? 'bg-slate-50 font-medium' : ''
                  }`}
                >
                  <div className="font-medium">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-slate-500 mt-0.5">{option.description}</div>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-slate-500 text-center">
                No results found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComboField;
