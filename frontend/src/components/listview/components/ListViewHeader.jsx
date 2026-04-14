/**
 * ListViewHeader - Header component for list view
 * Contains object title, create button, view selector, search, filters toggle, and view mode switcher
 */
import React from 'react';

// UI Components
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../ui/dropdown-menu';

// Icons
import {
  Plus,
  Edit,
  Trash2,
  Search,
  BarChart3,
  Filter,
  Pin,
  PinOff,
  Star,
  TableIcon,
  LayoutGrid,
  Kanban,
  Settings,
  ChevronDown,
  Columns2,
  Check,
  Copy,
  Type,
} from 'lucide-react';

// Import Record Dialog - Using wrapper for specialized form routing
import CreateRecordWrapper from '../../records/CreateRecordWrapper';
// Import List View Actions Bar
import ListViewActionsBar from './ListViewActionsBar';

// Utils
import { isSystemView as checkIsSystemView } from '../utils/listViewUtils';

const ListViewHeader = ({
  object,
  records,
  listViews,
  selectedView,
  currentViewData,
  pinnedView,
  preferencesLoaded,
  viewMode,
  searchTerm,
  showFilters,
  // Selection props
  selectedRecordIds = [],
  selectedRecords = [],
  // Auto-open create dialog props
  autoOpenCreate = false,
  onCreateDialogOpenChange,
  // Handlers
  onViewChange,
  onViewModeChange,
  onSearchChange,
  onPinView,
  onFiltersToggle,
  onRefresh,
  // Wizard dialog openers
  openNewViewDialog,
  openCloneViewDialog,
  openEditViewDialog,
  openRenameViewDialog,
  setShowDeleteViewDialog,
}) => {
  const isSystemViewSelected = checkIsSystemView(selectedView);

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2">
      {/* Compact Title Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3">
          <h2 className="text-base font-semibold text-slate-900 flex items-center">
            <BarChart3 className="h-4 w-4" />
            <span className="ml-1.5">{object.object_plural}</span>
          </h2>
          <span className="text-xs text-slate-500">
            {records.length} items • {currentViewData?.name || 'All Records'}
          </span>
          {pinnedView && (
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0">
              <Pin className="h-2.5 w-2.5 mr-0.5" />
              Pinned
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* List View Actions */}
          <ListViewActionsBar 
            objectName={object?.object_name}
            selectedRecordIds={selectedRecordIds}
            selectedRecords={selectedRecords}
            onActionComplete={onRefresh}
          />
          
          {/* Create Record Button */}
          <CreateRecordWrapper
            key={object?.object_name}
            object={object}
            onSuccess={onRefresh}
            defaultOpen={autoOpenCreate}
            onOpenChange={onCreateDialogOpenChange}
          />
        </div>
      </div>

      {/* Compact Controls Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View Selector with Pin functionality */}
        <div className="flex items-center space-x-1">
          <Label className="text-xs font-medium text-slate-600">View:</Label>
          <Select value={selectedView} onValueChange={onViewChange}>
            <SelectTrigger className="w-40 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listViews.system_views.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{view.name}</span>
                    <div className="flex items-center space-x-1">
                      {view.id === 'recently_viewed' && <Star className="h-3 w-3 text-yellow-500" />}
                      {pinnedView === view.id && <Pin className="h-3 w-3 text-indigo-500" />}
                    </div>
                  </div>
                </SelectItem>
              ))}
              {listViews.user_views.length > 0 && (
                <>
                  <div className="border-t my-1"></div>
                  {listViews.user_views.map((view) => (
                    <SelectItem key={view.id} value={view.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{view.name}</span>
                        <div className="flex items-center space-x-1">
                          {view.is_pinned && <Pin className="h-3 w-3 text-indigo-500" />}
                          {pinnedView === view.id && <Pin className="h-3 w-3 text-indigo-500" />}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>

          {/* Pin/Unpin Button - Compact */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPinView(selectedView)}
            className={`h-7 w-7 p-0 ${pinnedView === selectedView ? 'text-indigo-600' : 'text-slate-500'}`}
            title={pinnedView === selectedView ? 'Unpin this view' : 'Pin this view'}
          >
            {pinnedView === selectedView ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </Button>

          {/* Quick Edit Button - only for user views */}
          {!isSystemViewSelected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={openEditViewDialog}
              className="h-7 w-7 p-0 text-slate-500 hover:text-indigo-600"
              title="Edit List View"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Quick Delete Button - only for user views */}
          {!isSystemViewSelected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteViewDialog(true)}
              className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
              title="Delete List View"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* List View Controls Menu - Compact */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                title="List View Controls"
              >
                <Settings className="h-3.5 w-3.5" />
                <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onClick={openNewViewDialog} className="text-sm">
                <Plus className="h-3.5 w-3.5 mr-2" />
                New List View
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={openCloneViewDialog}
                disabled={selectedView === 'recently_viewed'}
                className="text-sm"
              >
                <Copy className="h-3.5 w-3.5 mr-2" />
                Clone
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={openEditViewDialog}
                disabled={isSystemViewSelected}
                className="text-sm"
              >
                <Edit className="h-3.5 w-3.5 mr-2" />
                Edit View
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={openRenameViewDialog}
                disabled={isSystemViewSelected}
                className="text-sm"
              >
                <Type className="h-3.5 w-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowDeleteViewDialog(true)}
                disabled={isSystemViewSelected}
                className="text-red-600 focus:text-red-600 text-sm"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search with persistence - Compact */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
          <Input
            placeholder={`Search ${object.object_plural.toLowerCase()}...`}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-7 text-sm"
            data-testid="search-input"
          />
        </div>

        {/* Filters Toggle - Compact */}
        <Button
          variant="outline"
          size="sm"
          onClick={onFiltersToggle}
          className="h-7 px-2 text-xs"
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filters
        </Button>

        {/* View Mode Switcher Dropdown - Compact */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1"
              title="Select List Display"
            >
              {viewMode === 'table' && <TableIcon className="h-3.5 w-3.5" />}
              {viewMode === 'kanban' && <Kanban className="h-3.5 w-3.5" />}
              {viewMode === 'grid' && <LayoutGrid className="h-3.5 w-3.5" />}
              {viewMode === 'split' && <Columns2 className="h-3.5 w-3.5" />}
              <ChevronDown className="h-2.5 w-2.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => onViewModeChange('table')}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <TableIcon className="h-3.5 w-3.5" />
                <span>Table</span>
              </div>
              {viewMode === 'table' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewModeChange('kanban')}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <Kanban className="h-3.5 w-3.5" />
                <span>Kanban</span>
              </div>
              {viewMode === 'kanban' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewModeChange('grid')}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </div>
              {viewMode === 'grid' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewModeChange('split')}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <Columns2 className="h-3.5 w-3.5" />
                <span>Split</span>
              </div>
              {viewMode === 'split' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ListViewHeader;
