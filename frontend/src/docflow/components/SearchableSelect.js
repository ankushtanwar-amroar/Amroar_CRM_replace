import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select...',
  disabled = false,
  labelKey = 'label',
  valueKey = 'value',
  searchable = true,
  className = '',
  'data-testid': testId = 'searchable-select'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current && searchable) {
      inputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const filteredOptions = options.filter(opt => {
    const label = typeof opt === 'string' ? opt : (opt[labelKey] || opt[valueKey] || '');
    return label.toLowerCase().includes(search.toLowerCase());
  });

  const selectedLabel = (() => {
    if (!value) return '';
    const found = options.find(opt => {
      const val = typeof opt === 'string' ? opt : (opt[valueKey] || '');
      return val === value;
    });
    if (!found) return value;
    return typeof found === 'string' ? found : (found[labelKey] || found[valueKey] || value);
  })();

  const handleSelect = (opt) => {
    const val = typeof opt === 'string' ? opt : (opt[valueKey] || '');
    onChange(val);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} data-testid={testId}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-sm border rounded-md transition-colors text-left ${
          disabled
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed text-gray-400'
            : isOpen
              ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white'
              : 'border-gray-300 hover:border-gray-400 bg-white text-gray-900'
        }`}
      >
        <span className={`truncate ${!selectedLabel ? 'text-gray-400' : ''}`}>
          {selectedLabel || placeholder}
        </span>
        <div className="flex items-center gap-1 ml-1 flex-shrink-0">
          {value && !disabled && (
            <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" onClick={handleClear} />
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type to search..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-400">No results found</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const val = typeof opt === 'string' ? opt : (opt[valueKey] || '');
                const label = typeof opt === 'string' ? opt : (opt[labelKey] || opt[valueKey] || '');
                const extra = typeof opt === 'object' ? opt.extra : null;
                const isSelected = val === value;
                return (
                  <button
                    key={val || idx}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="truncate">{label}</span>
                    {extra && <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{extra}</span>}
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

export default SearchableSelect;
