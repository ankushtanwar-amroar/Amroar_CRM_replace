import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Search,
  Loader2,
  Users,
  Building2,
  DollarSign,
  CheckSquare,
  Calendar,
  Mail,
  Database,
  ArrowRight,
  Filter,
  SortAsc,
  Clock,
  Star,
  ChevronRight,
  X,
  Settings
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';

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

// Object colors
const OBJECT_COLORS = {
  lead: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', icon: 'bg-orange-100' },
  contact: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', icon: 'bg-blue-100' },
  account: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', icon: 'bg-purple-100' },
  opportunity: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', icon: 'bg-green-100' },
  task: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', icon: 'bg-amber-100' },
  event: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200', icon: 'bg-pink-100' },
  default: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', icon: 'bg-slate-100' }
};

const getObjectIcon = (objectName) => OBJECT_ICONS[objectName?.toLowerCase()] || OBJECT_ICONS.default;
const getObjectColors = (objectName) => OBJECT_COLORS[objectName?.toLowerCase()] || OBJECT_COLORS.default;

/**
 * Highlight matched text
 */
const HighlightedText = ({ text, query }) => {
  if (!text || !query) return <span>{text}</span>;
  
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const textLower = text.toLowerCase();
  
  let lastIndex = 0;
  const matches = [];
  
  tokens.forEach(token => {
    let index = 0;
    while ((index = textLower.indexOf(token, index)) !== -1) {
      matches.push({ start: index, end: index + token.length });
      index += 1;
    }
  });
  
  matches.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const match of matches) {
    if (merged.length === 0 || match.start > merged[merged.length - 1].end) {
      merged.push({ ...match });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, match.end);
    }
  }
  
  const parts = [];
  merged.forEach(({ start, end }) => {
    if (start > lastIndex) parts.push({ text: text.slice(lastIndex, start), highlight: false });
    parts.push({ text: text.slice(start, end), highlight: true });
    lastIndex = end;
  });
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), highlight: false });
  
  if (parts.length === 0) return <span>{text}</span>;
  
  return (
    <span>
      {parts.map((part, i) => (
        part.highlight ? (
          <mark key={i} className="bg-amber-200/80 text-amber-900 px-0.5 rounded-sm font-medium">{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      ))}
    </span>
  );
};

/**
 * Sidebar Filter Item
 */
const FilterItem = ({ name, label, count, icon: Icon, isActive, onClick }) => {
  const colors = getObjectColors(name);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left",
        isActive 
          ? `${colors.bg} ${colors.text} ring-2 ring-inset ring-current/20` 
          : "hover:bg-slate-100 text-slate-700"
      )}
    >
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", isActive ? colors.icon : "bg-slate-100")}>
            <Icon className={cn("h-4 w-4", isActive ? colors.text : "text-slate-500")} />
          </div>
        )}
        <span className="font-medium text-sm">{label}</span>
      </div>
      <Badge variant="secondary" className={cn("text-xs", isActive ? "bg-white/50" : "bg-slate-200")}>
        {count}
      </Badge>
    </button>
  );
};

/**
 * Search Result Card (for full page view)
 */
const SearchResultCard = ({ result, query, onClick, isTopResult = false }) => {
  const Icon = getObjectIcon(result.object_name);
  const colors = getObjectColors(result.object_name);
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-white rounded-xl border transition-all cursor-pointer",
        isTopResult 
          ? "border-indigo-200 shadow-md hover:shadow-lg p-5" 
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm p-4"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
          colors.icon
        )}>
          <Icon className={cn("h-6 w-6", colors.text)} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-900 truncate text-lg group-hover:text-indigo-600 transition-colors">
              <HighlightedText text={result.primary_value} query={query} />
            </h3>
            <Badge variant="secondary" className={cn("text-xs px-2", colors.bg, colors.text)}>
              {result.object_label}
            </Badge>
            {isTopResult && (
              <Badge className="bg-amber-100 text-amber-700 text-xs">
                <Star className="h-3 w-3 mr-1" />
                Top Result
              </Badge>
            )}
          </div>
          
          {result.secondary_value && (
            <p className="text-sm text-slate-500 truncate mb-2">
              <HighlightedText text={result.secondary_value} query={query} />
            </p>
          )}
          
          {/* Additional fields if available */}
          {result.additional_fields && Object.keys(result.additional_fields).length > 0 && (
            <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
              {Object.entries(result.additional_fields).slice(0, 3).map(([key, value]) => (
                value && (
                  <span key={key} className="flex items-center gap-1">
                    <span className="text-slate-400">{key}:</span>
                    <span className="text-slate-600">{value}</span>
                  </span>
                )
              ))}
            </div>
          )}
        </div>
        
        {/* Arrow */}
        <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all flex-shrink-0 mt-2" />
      </div>
    </div>
  );
};

/**
 * Results Group Section
 */
const ResultsGroupSection = ({ group, query, onResultClick, isExpanded = false }) => {
  const Icon = getObjectIcon(group.object_name);
  const colors = getObjectColors(group.object_name);
  const [showAll, setShowAll] = useState(isExpanded);
  
  const visibleResults = showAll ? group.results : group.results.slice(0, 5);
  const hasMore = group.results.length > 5;
  
  return (
    <div className="mb-8">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colors.icon)}>
            <Icon className={cn("h-4 w-4", colors.text)} />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">{group.object_label}</h2>
          <Badge variant="secondary" className="text-sm">
            {group.total_count || group.results.length} results
          </Badge>
        </div>
        
        {hasMore && !showAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(true)}
            className={cn("text-sm", colors.text)}
          >
            Show All ({group.results.length})
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
      
      {/* Results */}
      <div className="space-y-3">
        {visibleResults.map((result, idx) => (
          <SearchResultCard
            key={result.id}
            result={result}
            query={query}
            onClick={() => onResultClick(result)}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Main Search Results Page Component
 */
const SearchResultsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const queryParam = searchParams.get('q') || '';
  const objectFilter = searchParams.get('object') || 'all';
  const sortBy = searchParams.get('sort') || 'relevance';
  
  const [query, setQuery] = useState(queryParam);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Perform search when URL changes
  useEffect(() => {
    const performSearch = async () => {
      if (!queryParam || queryParam.length < 2) {
        setResults(null);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const token = localStorage.getItem('token');
        const params = { q: queryParam, limit: 20 }; // Max 20 per object (backend limit)
        
        if (objectFilter && objectFilter !== 'all') {
          params.objects = objectFilter; // Backend uses 'objects' param
        }
        
        const response = await axios.get(`${API}/api/search`, {
          params,
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setResults(response.data);
      } catch (err) {
        console.error('Search error:', err);
        setError('Search failed. Please try again.');
        setResults(null);
      } finally {
        setLoading(false);
      }
    };
    
    performSearch();
  }, [queryParam, objectFilter]);
  
  // Handle search form submit
  const handleSearch = (e) => {
    e.preventDefault();
    if (query.length >= 2) {
      setSearchParams({ q: query, object: objectFilter, sort: sortBy });
    }
  };
  
  // Handle filter change
  const handleFilterChange = (newFilter) => {
    setSearchParams({ q: queryParam, object: newFilter, sort: sortBy });
  };
  
  // Handle sort change
  const handleSortChange = (newSort) => {
    setSearchParams({ q: queryParam, object: objectFilter, sort: newSort });
  };
  
  // Handle result click - Navigate to CRM Lightning-style page
  const handleResultClick = (result) => {
    // Navigate to /crm/{object}/{recordId} format
    const objectName = result.object_name?.toLowerCase();
    const recordId = result.series_id;
    navigate(`/crm/${objectName}/${recordId}`);
  };
  
  // Calculate object counts
  const objectCounts = useMemo(() => {
    if (!results?.grouped_results) return {};
    const counts = { all: results.total_count };
    Object.entries(results.grouped_results).forEach(([key, group]) => {
      counts[key] = group.total_count || group.results?.length || 0;
    });
    return counts;
  }, [results]);
  
  // Get top result (highest score)
  const topResult = useMemo(() => {
    if (!results?.groups_order || objectFilter !== 'all') return null;
    
    let top = null;
    let topScore = -1;
    
    results.groups_order.forEach(groupName => {
      const group = results.grouped_results[groupName];
      group?.results?.forEach(result => {
        if (result.score > topScore) {
          topScore = result.score;
          top = result;
        }
      });
    });
    
    return top;
  }, [results, objectFilter]);
  
  // Filtered results based on object filter
  const filteredResults = useMemo(() => {
    if (!results) return null;
    if (objectFilter === 'all') return results;
    
    const group = results.grouped_results[objectFilter];
    if (!group) return results;
    
    return {
      ...results,
      groups_order: [objectFilter],
      grouped_results: { [objectFilter]: group }
    };
  }, [results, objectFilter]);
  
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <form onSubmit={handleSearch} className="flex items-center gap-4">
            <div className="relative flex-1 max-w-2xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search records..."
                className="pl-12 pr-4 h-12 text-lg bg-slate-50 border-slate-200 focus:bg-white focus:border-indigo-300 rounded-xl"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full"
                >
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>
            <Button type="submit" size="lg" className="h-12 px-6">
              Search
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="lg" 
              className="h-12 px-4"
              onClick={() => navigate('/setup/features/configure-search')}
              data-testid="search-settings-btn"
            >
              <Settings className="h-4 w-4 mr-2" />
              Search Settings
            </Button>
          </form>
          
          {/* Search info */}
          {results && (
            <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
              <span>
                Showing <strong className="text-slate-700">{results.total_count}</strong> results for "<strong className="text-slate-700">{queryParam}</strong>"
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {results.search_time_ms?.toFixed(0)}ms
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-32">
              <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter by Object
              </h3>
              
              <div className="space-y-1.5">
                <FilterItem
                  name="all"
                  label="All Results"
                  count={objectCounts.all || 0}
                  icon={Database}
                  isActive={objectFilter === 'all'}
                  onClick={() => handleFilterChange('all')}
                />
                
                {results?.groups_order?.map(objName => {
                  const group = results.grouped_results[objName];
                  if (!group?.results?.length) return null;
                  
                  return (
                    <FilterItem
                      key={objName}
                      name={objName}
                      label={group.object_label}
                      count={objectCounts[objName] || 0}
                      icon={getObjectIcon(objName)}
                      isActive={objectFilter === objName}
                      onClick={() => handleFilterChange(objName)}
                    />
                  );
                })}
              </div>
              
              {/* Sort Options */}
              <div className="mt-6 pt-4 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <SortAsc className="h-4 w-4" />
                  Sort By
                </h3>
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="recent">Recently Updated</SelectItem>
                    <SelectItem value="name">Name A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Results Area */}
          <div className="flex-1 min-w-0">
            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <span className="ml-3 text-lg text-slate-600">Searching...</span>
              </div>
            )}
            
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <p className="text-red-600 font-medium">{error}</p>
              </div>
            )}
            
            {/* No Query */}
            {!loading && !queryParam && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Search className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">Start Searching</h2>
                <p className="text-slate-500">Enter a search term to find records across your CRM</p>
              </div>
            )}
            
            {/* No Results */}
            {!loading && queryParam && results?.total_count === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Search className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">No Results Found</h2>
                <p className="text-slate-500">Try different keywords or check your spelling</p>
              </div>
            )}
            
            {/* Results */}
            {!loading && filteredResults && filteredResults.total_count > 0 && (
              <div>
                {/* Top Result */}
                {topResult && objectFilter === 'all' && (
                  <div className="mb-8">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-500" />
                      Top Result
                    </h2>
                    <SearchResultCard
                      result={topResult}
                      query={queryParam}
                      onClick={() => handleResultClick(topResult)}
                      isTopResult
                    />
                  </div>
                )}
                
                {/* Grouped Results */}
                {filteredResults.groups_order?.map(groupName => {
                  const group = filteredResults.grouped_results[groupName];
                  if (!group || group.results.length === 0) return null;
                  
                  // Skip top result in its group if showing all
                  const filteredGroupResults = objectFilter === 'all' && topResult
                    ? group.results.filter(r => r.id !== topResult.id)
                    : group.results;
                  
                  if (filteredGroupResults.length === 0) return null;
                  
                  return (
                    <ResultsGroupSection
                      key={groupName}
                      group={{ ...group, results: filteredGroupResults }}
                      query={queryParam}
                      onResultClick={handleResultClick}
                      isExpanded={objectFilter !== 'all'}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchResultsPage;
