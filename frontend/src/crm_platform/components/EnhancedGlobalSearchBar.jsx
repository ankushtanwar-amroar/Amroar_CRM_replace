/**
 * EnhancedGlobalSearchBar - Salesforce-style Global Search
 * 
 * Features:
 * - Object filter tabs (All | Leads | Contacts | Accounts...)
 * - Grouped results by object with counts
 * - Highlighted matched text
 * - Keyboard navigation (↑↓ Enter Esc)
 * - "View All Results" -> /search page
 * - Search performance indicator
 * - Premium visual design
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Command,
  ChevronRight,
  ExternalLink,
  Clock
} from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';

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

// Object colors for visual distinction
const OBJECT_COLORS = {
  lead: { bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' },
  contact: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
  account: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
  opportunity: { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  task: { bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-200' },
  event: { bg: 'bg-pink-100', text: 'text-pink-600', border: 'border-pink-200' },
  default: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' }
};

const getObjectIcon = (objectName) => {
  return OBJECT_ICONS[objectName?.toLowerCase()] || OBJECT_ICONS.default;
};

const getObjectColors = (objectName) => {
  return OBJECT_COLORS[objectName?.toLowerCase()] || OBJECT_COLORS.default;
};

/**
 * Highlight matched text component
 */
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
          <mark key={i} className="bg-amber-200/80 text-amber-900 px-0.5 rounded-sm font-medium">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      ))}
    </span>
  );
};

/**
 * Object Filter Tab Component
 */
const ObjectFilterTab = ({ name, label, count, isActive, onClick, Icon }) => {
  const colors = getObjectColors(name);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap",
        isActive 
          ? `${colors.bg} ${colors.text} ring-2 ring-offset-1 ring-${name === 'all' ? 'indigo' : name}-300`
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
      {count > 0 && (
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded-full",
          isActive ? "bg-white/50" : "bg-slate-200"
        )}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
};

/**
 * Search Result Item Component
 */
const SearchResultItem = ({ result, query, onSelect, isSelected, showObjectBadge = false }) => {
  const Icon = getObjectIcon(result.object_name);
  const colors = getObjectColors(result.object_name);
  
  return (
    <div
      onClick={() => onSelect(result)}
      className={cn(
        "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all",
        isSelected 
          ? "bg-indigo-50 border-l-3 border-l-indigo-500" 
          : "hover:bg-slate-50 border-l-3 border-l-transparent"
      )}
      data-testid={`search-result-${result.id}`}
    >
      {/* Icon */}
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
        isSelected ? "bg-indigo-100" : colors.bg
      )}>
        <Icon className={cn("h-5 w-5", isSelected ? "text-indigo-600" : colors.text)} />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 truncate">
            <HighlightedText text={result.primary_value} query={query} />
          </span>
          {showObjectBadge && (
            <Badge variant="secondary" className={cn("text-xs px-1.5 py-0", colors.bg, colors.text)}>
              {result.object_label}
            </Badge>
          )}
        </div>
        {result.secondary_value && (
          <div className="text-sm text-slate-500 truncate mt-0.5">
            <HighlightedText text={result.secondary_value} query={query} />
          </div>
        )}
      </div>
      
      {/* Arrow */}
      <ArrowRight className={cn(
        "h-4 w-4 flex-shrink-0 transition-transform",
        isSelected ? "text-indigo-500 translate-x-1" : "text-slate-300"
      )} />
    </div>
  );
};

/**
 * Search Results Group Component
 */
const SearchResultsGroup = ({ 
  group, 
  query, 
  onSelect, 
  selectedIndex, 
  startIndex,
  onViewMore,
  maxVisible = 3
}) => {
  const Icon = getObjectIcon(group.object_name);
  const colors = getObjectColors(group.object_name);
  const visibleResults = group.results.slice(0, maxVisible);
  const hasMore = group.results.length > maxVisible || group.total_count > group.results.length;
  
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      {/* Group Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2.5 sticky top-0",
        colors.bg, "bg-opacity-50"
      )}>
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", colors.text)} />
          <span className={cn("text-sm font-semibold uppercase tracking-wide", colors.text)}>
            {group.object_label}
          </span>
          <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-white/70">
            {group.total_count || group.count}
          </Badge>
        </div>
        
        {hasMore && (
          <button
            onClick={() => onViewMore(group.object_name)}
            className={cn(
              "text-xs font-medium flex items-center gap-1 hover:underline",
              colors.text
            )}
          >
            View More
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      
      {/* Results */}
      <div>
        {visibleResults.map((result, idx) => (
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

/**
 * Main Enhanced Global Search Component
 */
const EnhancedGlobalSearchBar = ({ className = '', onOpenRecordTab }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchableObjects, setSearchableObjects] = useState([]);
  
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  
  // Fetch searchable objects on mount
  useEffect(() => {
    const fetchSearchableObjects = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API}/api/search/objects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSearchableObjects(response.data || []);
      } catch (err) {
        console.warn('Failed to fetch searchable objects:', err);
      }
    };
    fetchSearchableObjects();
  }, []);
  
  // Calculate counts per object from results
  const objectCounts = useMemo(() => {
    if (!results?.grouped_results) return {};
    const counts = {};
    Object.entries(results.grouped_results).forEach(([key, group]) => {
      counts[key] = group.total_count || group.count || group.results?.length || 0;
    });
    return counts;
  }, [results]);
  
  // Filter tabs to show (only objects with results + All)
  const filterTabs = useMemo(() => {
    const tabs = [{ name: 'all', label: 'All', count: results?.total_count || 0 }];
    
    if (results?.groups_order) {
      results.groups_order.forEach(objName => {
        const group = results.grouped_results[objName];
        if (group && group.results?.length > 0) {
          tabs.push({
            name: objName,
            label: group.object_label,
            count: group.total_count || group.count || group.results.length,
            icon: getObjectIcon(objName)
          });
        }
      });
    }
    
    return tabs;
  }, [results]);
  
  // Filtered results based on active filter
  const filteredResults = useMemo(() => {
    if (!results) return null;
    if (activeFilter === 'all') return results;
    
    // Filter to single object
    const group = results.grouped_results[activeFilter];
    if (!group) return results;
    
    return {
      ...results,
      groups_order: [activeFilter],
      grouped_results: { [activeFilter]: group }
    };
  }, [results, activeFilter]);
  
  // Calculate flat list for keyboard navigation
  const flatResults = useMemo(() => {
    if (!filteredResults?.groups_order) return [];
    return filteredResults.groups_order.flatMap(
      groupName => filteredResults.grouped_results[groupName]?.results || []
    );
  }, [filteredResults]);
  
  // Calculate group start indices
  const getGroupStartIndex = useCallback((groupName) => {
    if (!filteredResults?.groups_order) return 0;
    let index = 0;
    for (const name of filteredResults.groups_order) {
      if (name === groupName) return index;
      const group = filteredResults.grouped_results[name];
      index += Math.min(group?.results?.length || 0, 3); // Max 3 visible per group
    }
    return index;
  }, [filteredResults]);
  
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
        params: { q: searchQuery, limit: 10 },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setResults(response.data);
      setSelectedIndex(0);
      setActiveFilter('all');
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
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };
  
  // Handle result selection
  const handleSelect = useCallback((result) => {
    setIsOpen(false);
    setQuery('');
    setResults(null);
    
    // Use callback if provided (for console tab navigation)
      // console.log(result,"hhhhhhhhhhhhhhhh",onOpenRecordTab);
    if (onOpenRecordTab) {
      onOpenRecordTab(result.object_name, result.series_id, result.series_id, result.primary_value);
    } else {
      // Navigate to CRM Lightning-style page: /crm/{object}/{recordId}
      const objectName = result.object_name?.toLowerCase();
      const recordId = result.series_id;
      navigate(`/crm/${objectName}/${recordId}`);
    }
  }, [navigate, onOpenRecordTab]);
  
  // Handle view more for a specific object
  const handleViewMore = useCallback((objectName) => {
    navigate(`/search?q=${encodeURIComponent(query)}&object=${objectName}`);
    setIsOpen(false);
  }, [navigate, query]);
  
  // Handle view all results
  const handleViewAll = useCallback(() => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
    setIsOpen(false);
  }, [navigate, query]);
  
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
        if (e.shiftKey || e.metaKey) {
          // Shift+Enter or Cmd+Enter opens full search page
          handleViewAll();
        } else if (flatResults[selectedIndex]) {
          handleSelect(flatResults[selectedIndex]);
        } else if (query.length >= 2) {
          handleViewAll();
        }
        break;
        
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
        
      case 'Tab':
        // Tab through filter tabs
        if (filterTabs.length > 1) {
          e.preventDefault();
          const currentIdx = filterTabs.findIndex(t => t.name === activeFilter);
          const nextIdx = e.shiftKey 
            ? (currentIdx - 1 + filterTabs.length) % filterTabs.length
            : (currentIdx + 1) % filterTabs.length;
          setActiveFilter(filterTabs[nextIdx].name);
          setSelectedIndex(0);
        }
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
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);
  
  const showDropdown = isOpen && (query.length >= 2 || results);
  
  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search records..."
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-20 h-9 w-72 bg-slate-100/80 border-slate-200 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all rounded-lg"
          data-testid="global-search-input"
        />
        
        {/* Right side indicators */}
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1.5">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          ) : query ? (
            <button
              onClick={() => {
                setQuery('');
                setResults(null);
                inputRef.current?.focus();
              }}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
            >
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          ) : (
            <kbd className="hidden sm:flex text-xs bg-slate-200 px-1.5 py-0.5 rounded font-mono items-center gap-0.5 text-slate-500">
              <Command className="h-3 w-3" />K
            </kbd>
          )}
        </div>
      </div>
      
      {/* Results Dropdown */}
      {showDropdown && (
        <div 
          className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          style={{ width: '480px', maxHeight: '75vh' }}
          data-testid="global-search-dropdown"
        >
          {/* Loading state */}
          {loading && !results && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="ml-3 text-slate-600">Searching...</span>
            </div>
          )}
          
          {/* Error state */}
          {error && (
            <div className="p-6 text-center text-red-600">
              {error}
            </div>
          )}
          
          {/* No results */}
          {!loading && results && results.total_count === 0 && (
            <div className="p-8 text-center">
              <Search className="h-12 w-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-700 font-medium">No results found</p>
              <p className="text-sm text-slate-500 mt-1">
                Try different keywords or check your spelling
              </p>
            </div>
          )}
          
          {/* Results */}
          {filteredResults && filteredResults.total_count > 0 && (
            <>
              {/* Header with counts & time */}
              <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      {results.total_count} result{results.total_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {results.search_time_ms?.toFixed(0)}ms
                    </span>
                  </div>
                  
                  <button
                    onClick={handleViewAll}
                    className="text-xs text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1"
                  >
                    View All Results
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
              
              {/* Object Filter Tabs */}
              {filterTabs.length > 1 && (
                <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100 overflow-x-auto">
                  <div className="flex items-center gap-2">
                    {filterTabs.map(tab => (
                      <ObjectFilterTab
                        key={tab.name}
                        name={tab.name}
                        label={tab.label}
                        count={tab.count}
                        isActive={activeFilter === tab.name}
                        onClick={() => {
                          setActiveFilter(tab.name);
                          setSelectedIndex(0);
                        }}
                        Icon={tab.name === 'all' ? null : tab.icon}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Grouped Results */}
              <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
                {filteredResults.groups_order?.map(groupName => {
                  const group = filteredResults.grouped_results[groupName];
                  if (!group || group.results.length === 0) return null;
                  
                  return (
                    <SearchResultsGroup
                      key={groupName}
                      group={group}
                      query={query}
                      onSelect={handleSelect}
                      selectedIndex={selectedIndex}
                      startIndex={getGroupStartIndex(groupName)}
                      onViewMore={handleViewMore}
                      maxVisible={activeFilter === 'all' ? 3 : 10}
                    />
                  );
                })}
              </div>
              
              {/* Footer with keyboard hints */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">↑</kbd>
                    <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">↓</kbd>
                    <span className="ml-1">navigate</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">↵</kbd>
                    <span className="ml-1">open</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">Tab</kbd>
                    <span className="ml-1">filter</span>
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">⇧↵</kbd>
                  <span className="ml-1">view all</span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedGlobalSearchBar;
