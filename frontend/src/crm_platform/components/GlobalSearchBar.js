import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Search, 
  X, 
  Loader2, 
  Users, 
  Building2, 
  Target, 
  DollarSign,
  CheckSquare,
  Calendar,
  Mail,
  FileText,
  Database,
  ArrowRight,
  Command
} from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Object icon mapping
const OBJECT_ICONS = {
  lead: Users,
  contact: Users,
  account: Building2,
  opportunity: DollarSign,
  task: CheckSquare,
  event: Calendar,
  emailmessage: Mail,
  default: Database
};

const getObjectIcon = (objectName) => {
  return OBJECT_ICONS[objectName?.toLowerCase()] || OBJECT_ICONS.default;
};

// Highlight matched text
const HighlightedText = ({ text, query }) => {
  if (!text || !query) return <span>{text}</span>;
  
  const parts = [];
  const textLower = text.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  
  let lastIndex = 0;
  const matches = [];
  
  // Find all matches
  tokens.forEach(token => {
    let index = 0;
    while ((index = textLower.indexOf(token, index)) !== -1) {
      matches.push({ start: index, end: index + token.length });
      index += 1;
    }
  });
  
  // Sort and merge overlapping matches
  matches.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const match of matches) {
    if (merged.length === 0 || match.start > merged[merged.length - 1].end) {
      merged.push({ ...match });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, match.end);
    }
  }
  
  // Build parts
  merged.forEach(({ start, end }) => {
    if (start > lastIndex) {
      parts.push({ text: text.slice(lastIndex, start), highlight: false });
    }
    parts.push({ text: text.slice(start, end), highlight: true });
    lastIndex = end;
  });
  
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }
  
  if (parts.length === 0) {
    return <span>{text}</span>;
  }
  
  return (
    <span>
      {parts.map((part, i) => (
        part.highlight ? (
          <mark key={i} className="bg-amber-200 text-amber-900 px-0.5 rounded">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      ))}
    </span>
  );
};

// Search Result Item
const SearchResultItem = ({ result, query, onSelect, isSelected }) => {
  const Icon = getObjectIcon(result.object_name);
  
  return (
    <div
      onClick={() => onSelect(result)}
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-indigo-50 border-l-2 border-indigo-500' 
          : 'hover:bg-slate-50 border-l-2 border-transparent'
      }`}
      data-testid={`search-result-${result.id}`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
        isSelected ? 'bg-indigo-100' : 'bg-slate-100'
      }`}>
        <Icon className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-slate-600'}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 truncate">
          <HighlightedText text={result.primary_value} query={query} />
        </div>
        {result.secondary_value && (
          <div className="text-sm text-slate-500 truncate">
            <HighlightedText text={result.secondary_value} query={query} />
          </div>
        )}
      </div>
      
      <ArrowRight className={`h-4 w-4 flex-shrink-0 ${
        isSelected ? 'text-indigo-500' : 'text-slate-300'
      }`} />
    </div>
  );
};

// Search Results Group
const SearchResultsGroup = ({ group, query, onSelect, selectedIndex, startIndex }) => {
  const Icon = getObjectIcon(group.object_name);
  
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 sticky top-0">
        <Icon className="h-4 w-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {group.object_label}
        </span>
        <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-slate-200 text-slate-600">
          {group.count}
        </Badge>
      </div>
      
      <div>
        {group.results.map((result, idx) => (
          <SearchResultItem
            key={result.id}
            result={result}
            query={query}
            onSelect={onSelect}
            isSelected={selectedIndex === startIndex + idx}
          />
        ))}
      </div>
    </div>
  );
};

// Main Global Search Component
const GlobalSearchBar = ({ className = '' }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState(null);
  
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  
  // Calculate flat list of results for keyboard navigation
  const flatResults = results?.groups_order?.flatMap(
    groupName => results.grouped_results[groupName]?.results || []
  ) || [];
  
  // Calculate starting index for each group
  const getGroupStartIndex = (groupName) => {
    if (!results?.groups_order) return 0;
    let index = 0;
    for (const name of results.groups_order) {
      if (name === groupName) return index;
      index += results.grouped_results[name]?.results?.length || 0;
    }
    return index;
  };
  
  // Debounced search
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/search`, {
        params: { q: searchQuery, limit: 5 },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setResults(response.data);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Please try again.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Handle input change with debounce
  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce search (300ms)
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };
  
  // Handle result selection
  const handleSelect = (result) => {
    setIsOpen(false);
    setQuery('');
    setResults(null);
    navigate(result.record_url);
  };
  
  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
        return;
      }
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < flatResults.length - 1 ? prev + 1 : prev
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
        
      case 'Enter':
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          handleSelect(flatResults[selectedIndex]);
        }
        break;
        
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
        
      default:
        break;
    }
  };
  
  // Global keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
  
  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);
  
  const showDropdown = isOpen && (query.length >= 2 || results);
  
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search..."
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-16 h-8 w-64 bg-slate-100 border-slate-200 focus:bg-white focus:border-indigo-300 transition-all"
          data-testid="global-search-input"
        />
        
        {/* Keyboard shortcut hint */}
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-0.5 text-slate-400">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : query ? (
            <button
              onClick={() => {
                setQuery('');
                setResults(null);
                inputRef.current?.focus();
              }}
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="text-xs bg-slate-200 px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5">
              <Command className="h-3 w-3" />K
            </kbd>
          )}
        </div>
      </div>
      
      {/* Results Dropdown */}
      {showDropdown && (
        <div 
          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50 max-h-[70vh] overflow-y-auto"
          style={{ minWidth: '380px' }}
          data-testid="global-search-dropdown"
        >
          {/* Loading state */}
          {loading && !results && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="ml-2 text-slate-600">Searching...</span>
            </div>
          )}
          
          {/* Error state */}
          {error && (
            <div className="p-4 text-center text-red-600">
              {error}
            </div>
          )}
          
          {/* No results */}
          {!loading && results && results.total_count === 0 && (
            <div className="p-6 text-center">
              <Search className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-600 font-medium">No results found</p>
              <p className="text-sm text-slate-500 mt-1">
                Try searching for something else
              </p>
            </div>
          )}
          
          {/* Results */}
          {results && results.total_count > 0 && (
            <>
              {/* Results header */}
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {results.total_count} result{results.total_count !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-slate-400">
                  {results.search_time_ms}ms
                </span>
              </div>
              
              {/* Grouped results */}
              <div>
                {results.groups_order?.map(groupName => {
                  const group = results.grouped_results[groupName];
                  if (!group || group.results.length === 0) return null;
                  
                  return (
                    <SearchResultsGroup
                      key={groupName}
                      group={group}
                      query={query}
                      onSelect={handleSelect}
                      selectedIndex={selectedIndex}
                      startIndex={getGroupStartIndex(groupName)}
                    />
                  );
                })}
              </div>
              
              {/* Footer with keyboard hints */}
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="bg-slate-200 px-1 rounded">↑</kbd>
                    <kbd className="bg-slate-200 px-1 rounded">↓</kbd>
                    <span>navigate</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-slate-200 px-1 rounded">↵</kbd>
                    <span>open</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-slate-200 px-1 rounded">esc</kbd>
                    <span>close</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearchBar;
