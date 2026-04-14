/**
 * SearchableFieldSelect - Searchable dropdown for selecting fields
 * Shows a search box at the top and filters available fields
 */
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

const SearchableFieldSelect = ({ 
  value, 
  onChange, 
  fields = [], 
  placeholder = 'Search fields...',
  disabled = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Get display label for selected value
  const getDisplayLabel = () => {
    if (!value) return placeholder;
    const selectedField = fields.find(f => (f.api_name || f.name) === value);
    return selectedField ? (selectedField.label || selectedField.name) : value;
  };

  // Filter fields based on search
  const filteredFields = fields.filter(field => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      (field.label || '').toLowerCase().includes(search) ||
      (field.name || '').toLowerCase().includes(search) ||
      (field.api_name || '').toLowerCase().includes(search)
    );
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 text-left border rounded-md bg-white hover:bg-gray-50 transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {getDisplayLabel()}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          {/* Search Box */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fields..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          {/* Fields List */}
          <div className="max-h-60 overflow-auto py-1">
            {filteredFields.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No fields found</div>
            ) : (
              filteredFields.map((field) => {
                const fieldValue = field.api_name || field.name;
                const isSelected = value === fieldValue;
                
                return (
                  <button
                    key={fieldValue}
                    type="button"
                    onClick={() => {
                      onChange(fieldValue);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                      isSelected ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    <div>
                      <div className="font-medium">{field.label || field.name}</div>
                      {field.type && (
                        <div className="text-xs text-gray-500">{field.type}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableFieldSelect;
