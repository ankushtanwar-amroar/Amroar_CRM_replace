/**
 * LookupDisplayField - Display lookup field values as clickable links
 * 
 * Features:
 * - Displays the referenced record's name (not UUID)
 * - Clickable to navigate to the related record
 * - Shows loading state while fetching referenced record name
 * - Supports edit mode with full search/select dropdown
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, Search, X, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const LookupDisplayField = ({
  value,                // The ID of the referenced record
  field,                // Field definition with reference_to (target object)
  onChange,             // Callback when value changes (for edit mode)
  isEditable = false,   // Whether the field is editable
  displayLabel = null,  // Pre-fetched display label (optional)
}) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedName, setResolvedName] = useState(displayLabel);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentItems, setRecentItems] = useState([]);

  const targetObject = field?.reference_to || field?.referenceTo || field?.lookup_object;
  
  // Check if this is a user lookup (assigned_to, owner, created_by, etc.)
  const isUserLookup = targetObject === 'user' || 
                       field?.api_name === 'assigned_to' || 
                       field?.api_name === 'owner_id' ||
                       field?.api_name === 'created_by' ||
                       field?.api_name === 'updated_by';
  
  // Resolve the referenced record name
  useEffect(() => {
    const resolveRecordName = async () => {
      if (!value || resolvedName || !targetObject) return;
      
      setIsLoading(true);
      try {
        const token = localStorage.getItem('token');
        
        // Use special endpoint for user lookups
        let response;
        if (isUserLookup) {
          response = await fetch(`${API_URL}/api/users/${value}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
        } else {
          response = await fetch(`${API_URL}/api/dynamic-records/${targetObject}/${value}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
        
        if (response.ok) {
          const record = await response.json();
          // Try multiple name fields - handle user records specially
          let name;
          if (isUserLookup) {
            const firstName = record.first_name || record.data?.first_name || '';
            const lastName = record.last_name || record.data?.last_name || '';
            name = `${firstName} ${lastName}`.trim() || record.email || record.data?.email;
          } else {
            name = record.Name || record.name || 
                  record.data?.Name || record.data?.name ||
                  `${record.first_name || record.data?.first_name || ''} ${record.last_name || record.data?.last_name || ''}`.trim() ||
                  record.id?.substring(0, 8);
          }
          setResolvedName(name);
        }
      } catch (error) {
        console.error('Error resolving lookup name:', error);
        setResolvedName(value?.substring(0, 8) || '—');
      } finally {
        setIsLoading(false);
      }
    };

    resolveRecordName();
  }, [value, targetObject, resolvedName, isUserLookup]);

  // Search for records
  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const token = localStorage.getItem('token');
      
      // Use special endpoint for user lookups
      let response;
      if (isUserLookup) {
        response = await fetch(
          `${API_URL}/api/users?search=${encodeURIComponent(query)}&limit=10`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
      } else {
        response = await fetch(
          `${API_URL}/api/dynamic-records/${targetObject}?search=${encodeURIComponent(query)}&limit=10`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
      }
      
      if (response.ok) {
        const data = await response.json();
        const records = isUserLookup ? (data || []) : (data.records || data || []);
        setSearchResults(records.slice(0, 10).map(rec => {
          let name;
          if (isUserLookup) {
            const firstName = rec.first_name || '';
            const lastName = rec.last_name || '';
            name = `${firstName} ${lastName}`.trim() || rec.email;
          } else {
            name = rec.Name || rec.name || rec.data?.Name || rec.data?.name ||
                  `${rec.first_name || rec.data?.first_name || ''} ${rec.last_name || rec.data?.last_name || ''}`.trim() ||
                  rec.id?.substring(0, 8);
          }
          return { id: rec.id, name };
        }));
      }
    } catch (error) {
      console.error('Error searching records:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Load recent items when dropdown opens
  const loadRecentItems = async () => {
    if (!targetObject) return;
    
    try {
      const token = localStorage.getItem('token');
      
      // Use special endpoint for user lookups
      let response;
      if (isUserLookup) {
        response = await fetch(
          `${API_URL}/api/users?limit=5`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
      } else {
        response = await fetch(
          `${API_URL}/api/dynamic-records/${targetObject}?limit=5&sort=-updated_at`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
      }
      
      if (response.ok) {
        const data = await response.json();
        const records = isUserLookup ? (data || []) : (data.records || data || []);
        setRecentItems(records.slice(0, 5).map(rec => {
          let name;
          if (isUserLookup) {
            const firstName = rec.first_name || '';
            const lastName = rec.last_name || '';
            name = `${firstName} ${lastName}`.trim() || rec.email;
          } else {
            name = rec.Name || rec.name || rec.data?.Name || rec.data?.name ||
                  `${rec.first_name || rec.data?.first_name || ''} ${rec.last_name || rec.data?.last_name || ''}`.trim() ||
                  rec.id?.substring(0, 8);
          }
          return { id: rec.id, name };
        }));
      }
    } catch (error) {
      console.error('Error loading recent items:', error);
    }
  };

  // Handle record selection
  const handleSelectRecord = (record) => {
    if (onChange) {
      onChange(record.id, record.name);
    }
    setResolvedName(record.name);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Handle clear
  const handleClear = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange(null, null);
    }
    setResolvedName(null);
  };

  // Navigate to record
  const handleNavigate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (value && targetObject) {
      // Navigate to user detail page for user lookups
      if (isUserLookup) {
        navigate(`/users/${value}`);
      } else {
        navigate(`/crm/${targetObject}/${value}`);
      }
    }
  };

  // Empty state
  if (!value && !isEditable) {
    return <span className="text-slate-400 italic">—</span>;
  }

  // Loading state
  if (isLoading && !resolvedName) {
    return (
      <span className="flex items-center gap-1 text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </span>
    );
  }

  // Editable mode with search dropdown
  if (isEditable) {
    return (
      <Popover open={isSearchOpen} onOpenChange={(open) => {
        setIsSearchOpen(open);
        if (open) loadRecentItems();
      }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 text-left",
              "border rounded-md bg-white hover:bg-slate-50 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            )}
            data-testid={`lookup-field-${field?.api_name || 'unknown'}`}
          >
            <span className={cn(
              "flex-1 truncate",
              resolvedName ? "text-slate-900" : "text-slate-400"
            )}>
              {resolvedName || 'Select a record...'}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {value && (
                <button
                  onClick={handleClear}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              )}
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          {/* Search input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={`Search ${field?.label || targetObject || 'records'}...`}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8"
                autoFocus
              />
            </div>
          </div>

          {/* Search results or recent items */}
          <div className="max-h-[250px] overflow-y-auto">
            {isSearching ? (
              <div className="p-4 text-center text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Searching...
              </div>
            ) : searchQuery.length >= 2 && searchResults.length > 0 ? (
              <div className="py-1">
                <div className="px-2 py-1 text-xs text-slate-500 uppercase tracking-wide">
                  Search Results
                </div>
                {searchResults.map(record => (
                  <button
                    key={record.id}
                    onClick={() => handleSelectRecord(record)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 flex items-center gap-2"
                  >
                    <span className="truncate">{record.name}</span>
                    <ExternalLink className="h-3 w-3 text-slate-400 ml-auto flex-shrink-0" />
                  </button>
                ))}
              </div>
            ) : searchQuery.length >= 2 && searchResults.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                No records found
              </div>
            ) : recentItems.length > 0 ? (
              <div className="py-1">
                <div className="px-2 py-1 text-xs text-slate-500 uppercase tracking-wide">
                  Recent Items
                </div>
                {recentItems.map(record => (
                  <button
                    key={record.id}
                    onClick={() => handleSelectRecord(record)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 flex items-center gap-2"
                  >
                    <span className="truncate">{record.name}</span>
                    <ExternalLink className="h-3 w-3 text-slate-400 ml-auto flex-shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500">
                Type to search {field?.label || targetObject || 'records'}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Read-only display mode - clickable link
  return (
    <button
      onClick={handleNavigate}
      className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline group"
      title={`Open ${targetObject} record`}
      data-testid={`lookup-link-${field?.api_name || 'unknown'}`}
    >
      <span className="truncate max-w-[200px]">{resolvedName}</span>
      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
};

export default LookupDisplayField;
