import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Grid, Search, Loader2, FileSpreadsheet, ChevronLeft, ChevronRight, 
  ChevronsLeft, ChevronsRight, Plus, Trash2
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import ExcelObjectImportModal from '../components/ExcelObjectImportModal';
import { CreateObjectDialog } from '../../components/objects';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const ObjectManagerListPage = ({ onObjectClick }) => {
  const navigate = useNavigate();
  
  // Pagination state
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [objectType, setObjectType] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // UI state
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, objectName: null });

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch paginated objects
  const fetchObjects = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }
      
      if (objectType !== 'all') {
        params.append('object_type', objectType);
      }
      
      const response = await axios.get(`${API}/api/objects/paginated?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setObjects(response.data.data || []);
      setTotal(response.data.total || 0);
      setTotalPages(response.data.totalPages || 1);
      
    } catch (error) {
      console.error('Error fetching objects:', error);
      // Fallback to non-paginated endpoint if paginated fails
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API}/api/objects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setObjects(response.data);
        setTotal(response.data.length);
        setTotalPages(1);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, objectType]);

  useEffect(() => {
    fetchObjects();
  }, [fetchObjects]);

  const handleObjectClick = (objectName) => {
    if (onObjectClick) {
      onObjectClick(objectName);
    } else {
      navigate(`/object-manager/${objectName}`);
    }
  };

  const handleDeleteObject = async (objectName) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/objects/${objectName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Object deleted successfully');
      fetchObjects();
      setDeleteConfirm({ open: false, objectName: null });
    } catch (error) {
      console.error('Error deleting object:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete object');
    }
  };

  const handleImportSuccess = () => {
    fetchObjects();
    setShowImportModal(false);
  };

  const handleObjectCreated = () => {
    fetchObjects();
    setShowCreateDialog(false);
  };

  // Pagination handlers
  const goToPage = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleLimitChange = (newLimit) => {
    setLimit(parseInt(newLimit));
    setPage(1);
  };

  // Calculate display range
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (page > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }
      
      if (page < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <Grid className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Object Manager</h1>
              <p className="text-sm text-slate-500">
                Manage all CRM objects and their configurations
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Create Custom Object Button */}
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              size="sm"
              data-testid="create-custom-object-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Custom Object
            </Button>
            
            {/* Create Object via Excel Button */}
            <Button
              onClick={() => setShowImportModal(true)}
              variant="outline"
              size="sm"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              data-testid="create-object-excel-btn"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import from Excel
            </Button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search objects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9"
              data-testid="object-search-input"
            />
          </div>
          
          {/* Type Filter */}
          <Select value={objectType} onValueChange={(val) => { setObjectType(val); setPage(1); }}>
            <SelectTrigger className="w-40 h-9" data-testid="object-type-filter">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Modals */}
      <ExcelObjectImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />
      
      <CreateObjectDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onObjectCreated={handleObjectCreated}
      />

      {/* Objects Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header with Info */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            {loading ? 'Loading...' : `Showing ${startItem}–${endItem} of ${total} objects`}
          </span>
          
          {/* Rows per page */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Rows per page:</span>
            <Select value={limit.toString()} onValueChange={handleLimitChange}>
              <SelectTrigger className="w-20 h-8 text-sm" data-testid="rows-per-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-3 text-slate-500">Loading objects...</span>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/30">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase px-4 py-3">Label</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase px-4 py-3">API Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase px-4 py-3">Type</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase px-4 py-3">Description</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {objects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center">
                      <Grid className="h-10 w-10 text-slate-300 mb-3" />
                      <p className="font-medium">No objects found</p>
                      <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                objects.map((obj) => (
                  <TableRow 
                    key={obj.object_name || obj.id}
                    className="hover:bg-indigo-50/50 transition-colors"
                    data-testid={`object-row-${obj.object_name}`}
                  >
                    <TableCell 
                      className="font-medium text-indigo-600 hover:text-indigo-700 px-4 py-3 cursor-pointer"
                      onClick={() => handleObjectClick(obj.object_name)}
                    >
                      {obj.object_label || obj.label || obj.object_name}
                    </TableCell>
                    <TableCell 
                      className="text-slate-600 font-mono text-sm px-4 py-3 cursor-pointer"
                      onClick={() => handleObjectClick(obj.object_name)}
                    >
                      {obj.object_name || obj.api_name}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge 
                        variant="outline" 
                        className={`text-xs px-2 py-0.5 ${
                          obj.is_custom 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {obj.is_custom ? 'Custom' : 'Standard'}
                      </Badge>
                    </TableCell>
                    <TableCell 
                      className="text-slate-500 text-sm px-4 py-3 max-w-xs truncate cursor-pointer"
                      onClick={() => handleObjectClick(obj.object_name)}
                    >
                      {obj.description || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {obj.is_custom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ open: true, objectName: obj.object_name });
                          }}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete custom object"
                          data-testid={`delete-object-${obj.object_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* Pagination Footer */}
        {!loading && total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            
            <div className="flex items-center gap-1">
              {/* First Page */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={page === 1}
                className="h-8 w-8 p-0 hover:bg-slate-100"
                data-testid="pagination-first"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              
              {/* Previous Page */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                className="h-8 w-8 p-0 hover:bg-slate-100"
                data-testid="pagination-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              {/* Page Numbers */}
              <div className="flex items-center gap-1 mx-2">
                {getPageNumbers().map((pageNum, idx) => (
                  pageNum === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">...</span>
                  ) : (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => goToPage(pageNum)}
                      className={`h-8 w-8 p-0 ${
                        page === pageNum 
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                          : 'hover:bg-slate-100'
                      }`}
                      data-testid={`pagination-page-${pageNum}`}
                    >
                      {pageNum}
                    </Button>
                  )
                ))}
              </div>
              
              {/* Next Page */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
                className="h-8 w-8 p-0 hover:bg-slate-100"
                data-testid="pagination-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              {/* Last Page */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(totalPages)}
                disabled={page === totalPages}
                className="h-8 w-8 p-0 hover:bg-slate-100"
                data-testid="pagination-last"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ open, objectName: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Object</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the custom object "{deleteConfirm.objectName}"? 
              This action cannot be undone and will remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteObject(deleteConfirm.objectName)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ObjectManagerListPage;
