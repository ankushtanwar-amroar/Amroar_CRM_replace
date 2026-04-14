/**
 * Audit Filters Component
 * 
 * Filter controls for the audit trail timeline.
 */
import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, X, ChevronDown } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../components/ui/popover';
import { Calendar as CalendarComponent } from '../../../components/ui/calendar';
import { format } from 'date-fns';

const AuditFilters = ({ 
  filters, 
  onFiltersChange, 
  operations = [],
  sources = [],
  onClearFilters 
}) => {
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const handleFilterChange = (key, value) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined
    });
  };
  
  const handleDateRangeChange = (range) => {
    setDateRange(range || { from: null, to: null });
    onFiltersChange({
      ...filters,
      start_date: range?.from ? format(range.from, "yyyy-MM-dd'T'00:00:00") : undefined,
      end_date: range?.to ? format(range.to, "yyyy-MM-dd'T'23:59:59") : undefined
    });
  };
  
  const activeFilterCount = Object.values(filters).filter(v => v).length;
  
  return (
    <div className="space-y-3" data-testid="audit-filters">
      {/* Primary Filters Row */}
      <div className="flex items-center gap-3">
        {/* Search/Field Filter */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search field name..."
            value={filters.field_search || ''}
            onChange={(e) => handleFilterChange('field_search', e.target.value)}
            className="pl-9 h-9 text-sm"
            data-testid="filter-field-search"
          />
        </div>
        
        {/* Operation Filter */}
        <Select 
          value={filters.operation || ''} 
          onValueChange={(val) => handleFilterChange('operation', val)}
        >
          <SelectTrigger className="w-36 h-9 text-sm" data-testid="filter-operation">
            <SelectValue placeholder="Operation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Operations</SelectItem>
            {operations.map(op => (
              <SelectItem key={op.id} value={op.id}>
                {op.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Source Filter */}
        <Select 
          value={filters.change_source || ''} 
          onValueChange={(val) => handleFilterChange('change_source', val)}
        >
          <SelectTrigger className="w-36 h-9 text-sm" data-testid="filter-source">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Sources</SelectItem>
            {sources.map(src => (
              <SelectItem key={src.id} value={src.id}>
                {src.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className="h-9 text-sm gap-2"
              data-testid="filter-date-range"
            >
              <Calendar className="h-4 w-4" />
              {dateRange.from ? (
                dateRange.to ? (
                  `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}`
                ) : (
                  format(dateRange.from, 'MMM d, yyyy')
                )
              ) : (
                'Date Range'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="range"
              selected={dateRange}
              onSelect={handleDateRangeChange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
        
        {/* Advanced Filters Toggle */}
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`gap-1.5 ${showAdvanced ? 'text-blue-600' : 'text-slate-600'}`}
        >
          <Filter className="h-4 w-4" />
          More
          <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </Button>
        
        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onClearFilters}
            className="text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4 mr-1" />
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>
      
      {/* Advanced Filters Row */}
      {showAdvanced && (
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          {/* User Filter */}
          <div className="relative flex-1 max-w-xs">
            <Input
              placeholder="Changed by user ID..."
              value={filters.changed_by_user_id || ''}
              onChange={(e) => handleFilterChange('changed_by_user_id', e.target.value)}
              className="h-9 text-sm"
              data-testid="filter-user"
            />
          </div>
          
          {/* Correlation ID Filter */}
          <div className="relative flex-1 max-w-xs">
            <Input
              placeholder="Correlation ID..."
              value={filters.correlation_id || ''}
              onChange={(e) => handleFilterChange('correlation_id', e.target.value)}
              className="h-9 text-sm font-mono"
              data-testid="filter-correlation"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditFilters;
