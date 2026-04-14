/**
 * ListViewModals - All dialog modals for list view management
 * Contains: New, Clone, Rename, Edit, Delete view dialogs
 */
import React from 'react';

// UI Components
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';

// Icons
import {
  Plus,
  X,
  User,
  Users,
  Globe,
  LayoutList,
  RefreshCw,
  Check,
} from 'lucide-react';

// ============================================
// NEW VIEW DIALOG (4-step wizard)
// ============================================
export const NewViewDialog = ({
  open,
  onOpenChange,
  object,
  // Form state
  newViewName,
  newViewVisibility,
  newViewStep,
  newViewFilters,
  newViewColumns,
  newViewSortField,
  newViewSortOrder,
  newViewLoadingMode,
  newViewPageSize,
  savingView,
  // Setters
  setNewViewName,
  setNewViewVisibility,
  setNewViewFilters,
  setNewViewColumns,
  setNewViewSortField,
  setNewViewSortOrder,
  setNewViewLoadingMode,
  setNewViewPageSize,
  // Actions
  goToNextStep,
  goToPreviousStep,
  addFilter,
  removeFilter,
  updateFilter,
  toggleColumn,
  selectAllColumns,
  clearAllColumns,
  handleCreateListView,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New List View</DialogTitle>
          <DialogDescription>
            Step {newViewStep} of 4: {
              newViewStep === 1 ? 'Basic Information' :
              newViewStep === 2 ? 'Filter Criteria' :
              newViewStep === 3 ? 'Select Columns' :
              'Sort Order'
            }
          </DialogDescription>
        </DialogHeader>
        
        {/* Step Indicator */}
        <div className="flex items-center justify-center space-x-2 py-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === newViewStep
                  ? 'bg-indigo-600 text-white'
                  : step < newViewStep
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step < newViewStep ? <Check className="h-4 w-4" /> : step}
            </div>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {newViewStep === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">List View Name *</Label>
              <Input
                id="view-name"
                placeholder="e.g., My Hot Leads"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={newViewVisibility} onValueChange={setNewViewVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Only Me
                    </div>
                  </SelectItem>
                  <SelectItem value="team">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      My Team
                    </div>
                  </SelectItem>
                  <SelectItem value="public">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Everyone
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Record Loading Mode */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-sm font-medium text-slate-700 mb-3 block">Record Loading Mode</Label>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Select value={newViewLoadingMode} onValueChange={setNewViewLoadingMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pagination">
                        <div className="flex items-center gap-2">
                          <LayoutList className="h-4 w-4" />
                          Pagination (Page-based)
                        </div>
                      </SelectItem>
                      <SelectItem value="infinite_scroll">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" />
                          Infinite Scroll (Lazy loading)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {newViewLoadingMode === 'pagination' 
                      ? 'Records will be displayed in pages with navigation controls' 
                      : 'Records will load automatically as you scroll down'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-slate-600">
                    {newViewLoadingMode === 'pagination' ? 'Records per page' : 'Batch size'}
                  </Label>
                  <Select value={String(newViewPageSize)} onValueChange={(v) => setNewViewPageSize(Number(v))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Filters */}
        {newViewStep === 2 && (
          <div className="space-y-4 py-4">
            <div className="text-sm text-slate-600 mb-2">
              Add filters to narrow down the records in this view (optional)
            </div>
            {newViewFilters.map((filter, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select 
                  value={filter.field} 
                  onValueChange={(value) => updateFilter(idx, 'field', value)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(object.fields).map(([key, field]) => (
                      <SelectItem key={key} value={key}>{field.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select 
                  value={filter.condition} 
                  onValueChange={(value) => updateFilter(idx, 'condition', value)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="starts_with">Starts with</SelectItem>
                    <SelectItem value="not_equals">Not equals</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Value"
                  value={filter.value}
                  onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFilter(idx)}
                  className="h-9 w-9 p-0 text-slate-400 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addFilter}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Filter
            </Button>
          </div>
        )}

        {/* Step 3: Columns */}
        {newViewStep === 3 && (
          <div className="space-y-4 py-4">
            <div className="text-sm text-slate-600 mb-2">
              Select which columns to display in this view
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {Object.entries(object.fields).map(([key, field]) => (
                <label key={key} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newViewColumns.includes(key)}
                    onChange={() => toggleColumn(key)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm">{field.label}</span>
                  {field.is_custom && <Badge variant="secondary" className="text-xs">Custom</Badge>}
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllColumns}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllColumns}
              >
                Clear All
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Sort */}
        {newViewStep === 4 && (
          <div className="space-y-4 py-4">
            <div className="text-sm text-slate-600 mb-2">
              Choose default sort order for this view (optional)
            </div>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label>Sort By</Label>
                <Select value={newViewSortField} onValueChange={setNewViewSortField}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {Object.entries(object.fields).map(([key, field]) => (
                      <SelectItem key={key} value={key}>{field.label}</SelectItem>
                    ))}
                    <SelectItem value="created_at">Created Date</SelectItem>
                    <SelectItem value="updated_at">Last Modified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32 space-y-2">
                <Label>Order</Label>
                <Select value={newViewSortOrder} onValueChange={setNewViewSortOrder}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {newViewStep > 1 && (
              <Button variant="outline" onClick={goToPreviousStep}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {newViewStep < 4 ? (
              <Button 
                onClick={goToNextStep}
                disabled={newViewStep === 1 && !newViewName.trim()}
              >
                Next
              </Button>
            ) : (
              <Button 
                onClick={handleCreateListView}
                disabled={savingView || !newViewName.trim()}
              >
                {savingView ? 'Creating...' : 'Create View'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================
// CLONE VIEW DIALOG
// ============================================
export const CloneViewDialog = ({
  open,
  onOpenChange,
  newViewName,
  setNewViewName,
  savingView,
  handleCloneListView,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Clone List View</DialogTitle>
          <DialogDescription>
            Create a copy of the current list view with a new name
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clone-name">New View Name</Label>
            <Input
              id="clone-name"
              placeholder="Enter name for cloned view"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCloneListView}
            disabled={savingView || !newViewName.trim()}
          >
            {savingView ? 'Cloning...' : 'Clone View'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================
// RENAME VIEW DIALOG
// ============================================
export const RenameViewDialog = ({
  open,
  onOpenChange,
  newViewName,
  setNewViewName,
  savingView,
  handleRenameListView,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename List View</DialogTitle>
          <DialogDescription>
            Enter a new name for this list view
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rename-name">View Name</Label>
            <Input
              id="rename-name"
              placeholder="Enter new name"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleRenameListView}
            disabled={savingView || !newViewName.trim()}
          >
            {savingView ? 'Saving...' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================
// EDIT VIEW DIALOG (4-step wizard)
// ============================================
export const EditViewDialog = ({
  open,
  onOpenChange,
  object,
  // Form state
  newViewName,
  newViewVisibility,
  newViewStep,
  newViewFilters,
  newViewColumns,
  newViewSortField,
  newViewSortOrder,
  newViewLoadingMode,
  newViewPageSize,
  savingView,
  // Setters
  setNewViewName,
  setNewViewVisibility,
  setNewViewFilters,
  setNewViewColumns,
  setNewViewSortField,
  setNewViewSortOrder,
  // Actions
  goToNextStep,
  goToPreviousStep,
  addFilter,
  removeFilter,
  updateFilter,
  toggleColumn,
  handleEditListView,
  resetNewViewForm,
  setEditingViewId,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit List View</DialogTitle>
          <DialogDescription>
            Step {newViewStep} of 4: {newViewStep === 1 ? 'Basic Information' : newViewStep === 2 ? 'Filter Criteria' : newViewStep === 3 ? 'Select Columns' : 'Sort Order'}
          </DialogDescription>
        </DialogHeader>
        
        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-4">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                newViewStep >= step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {step}
              </div>
              {step < 4 && (
                <div className={`w-12 h-1 ${newViewStep > step ? 'bg-indigo-600' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        {newViewStep === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-view-name">List View Name *</Label>
              <Input
                id="edit-view-name"
                placeholder="e.g., My Hot Leads"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={newViewVisibility} onValueChange={setNewViewVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Only Me</SelectItem>
                  <SelectItem value="team">My Team</SelectItem>
                  <SelectItem value="public">All Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Record Loading Mode - DISABLED in edit mode */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-sm font-medium text-slate-700 mb-3 block">
                Record Loading Mode
                <span className="ml-2 text-xs text-amber-600 font-normal">(locked after creation)</span>
              </Label>
              <div className="space-y-3 opacity-60">
                <div className="space-y-2">
                  <Select value={newViewLoadingMode} disabled>
                    <SelectTrigger className="cursor-not-allowed">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pagination">Pagination (Page-based)</SelectItem>
                      <SelectItem value="infinite_scroll">Infinite Scroll (Lazy loading)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-slate-600">
                    {newViewLoadingMode === 'pagination' ? 'Records per page' : 'Batch size'}
                  </Label>
                  <Select value={String(newViewPageSize)} disabled>
                    <SelectTrigger className="w-32 cursor-not-allowed">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {newViewStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Filter Conditions</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addFilter}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Filter
              </Button>
            </div>
            {newViewFilters.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No filters added. Click &quot;Add Filter&quot; to add conditions.
              </div>
            ) : (
              <div className="space-y-3">
                {newViewFilters.map((filter, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                    <Select 
                      value={filter.field}
                      onValueChange={(value) => updateFilter(index, 'field', value)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(object.fields).map(([key, field]) => (
                          <SelectItem key={key} value={key}>{field.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filter.condition}
                      onValueChange={(value) => updateFilter(index, 'condition', value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="starts_with">Starts with</SelectItem>
                        <SelectItem value="not_equals">Not equals</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Value"
                      value={filter.value}
                      onChange={(e) => updateFilter(index, 'value', e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFilter(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {newViewStep === 3 && (
          <div className="space-y-4">
            <Label>Select columns to display in this view</Label>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border rounded-lg">
              {Object.entries(object.fields).map(([key, field]) => (
                <div key={key} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded">
                  <Switch
                    id={`edit-col-${key}`}
                    checked={newViewColumns.includes(key)}
                    onCheckedChange={() => toggleColumn(key)}
                  />
                  <Label htmlFor={`edit-col-${key}`} className="cursor-pointer text-sm">
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-500">{newViewColumns.length} columns selected</p>
          </div>
        )}

        {newViewStep === 4 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sort By</Label>
              <Select value={newViewSortField || 'none'} onValueChange={(val) => setNewViewSortField(val === 'none' ? '' : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select field to sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {Object.entries(object.fields).map(([key, field]) => (
                    <SelectItem key={key} value={key}>{field.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Select value={newViewSortOrder} onValueChange={setNewViewSortOrder}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending (A-Z, 0-9)</SelectItem>
                  <SelectItem value="desc">Descending (Z-A, 9-0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {newViewStep > 1 && (
              <Button variant="outline" onClick={goToPreviousStep}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              onOpenChange(false);
              if (setEditingViewId) setEditingViewId(null);
              if (resetNewViewForm) resetNewViewForm();
            }}>
              Cancel
            </Button>
            {newViewStep < 4 ? (
              <Button onClick={goToNextStep}>
                Next
              </Button>
            ) : (
              <Button 
                onClick={handleEditListView}
                disabled={savingView || !newViewName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {savingView ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================
// DELETE VIEW DIALOG
// ============================================
export const DeleteViewDialog = ({
  open,
  onOpenChange,
  viewName,
  savingView,
  handleDeleteListView,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Delete List View</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this list view? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> Deleting &quot;{viewName}&quot; will permanently remove this view.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={handleDeleteListView}
            disabled={savingView}
          >
            {savingView ? 'Deleting...' : 'Delete View'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Default export as object with all dialogs
const ListViewModals = {
  NewViewDialog,
  CloneViewDialog,
  RenameViewDialog,
  EditViewDialog,
  DeleteViewDialog,
};

export default ListViewModals;
