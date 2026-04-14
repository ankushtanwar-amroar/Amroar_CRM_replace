/**
 * Lightning Pages List Component
 * Shows all Lightning Pages for an object in a table/list view
 * Replaces the old "Open Lightning Page Builder" button with a proper listing
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Plus, ChevronDown, Edit, Trash2, FileText, Calendar, 
  Clock, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, LayoutGrid
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
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
import toast from 'react-hot-toast';
import lightningLayoutService from '../lightning_builder/services/lightningLayoutService';

const LightningPagesListPanel = ({ objectName, objectLabel }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (objectName) {
      loadPages();
    }
  }, [objectName]);

  const loadPages = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await lightningLayoutService.getLayoutForObject(objectName, token);
      
      const allPages = response.layouts || response.all_layouts || 
                       (response.layout ? [response.layout] : []);
      
      // Add default page_type if not present
      const pagesWithType = allPages.map(p => ({
        ...p,
        page_type: p.page_type || 'detail'
      }));
      
      setPages(pagesWithType);
    } catch (error) {
      console.error('Error loading pages:', error);
      toast.error('Failed to load Lightning Pages');
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort pages
  const filteredAndSortedPages = useMemo(() => {
    let result = [...pages];
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        (p.layout_name || '').toLowerCase().includes(query) ||
        (p.api_name || '').toLowerCase().includes(query)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      
      if (sortField === 'layout_name') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
    
    return result;
  }, [pages, searchQuery, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedPages.length / pageSize);
  const paginatedPages = filteredAndSortedPages.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleOpenBuilder = (pageId, pageType = 'detail') => {
    // Navigate to Lightning Builder with page ID and mode
    navigate(`/crm-platform/lightning-builder?object=${objectName}&pageId=${pageId}&mode=${pageType}`);
  };

  const handleCreatePage = (pageType) => {
    // Navigate to Lightning Builder in create mode
    navigate(`/crm-platform/lightning-builder?object=${objectName}&mode=${pageType}&create=true`);
  };

  const handleDeletePage = async (pageId, pageName) => {
    if (!window.confirm(`Are you sure you want to delete "${pageName}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      await lightningLayoutService.deleteLayout(pageId, token);
      toast.success('Page deleted successfully');
      loadPages();
    } catch (error) {
      console.error('Error deleting page:', error);
      toast.error('Failed to delete page');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
        <span className="text-slate-600">Loading Lightning Pages...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with count and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-900">Lightning Pages</h3>
          <Badge variant="secondary" className="ml-2">
            {filteredAndSortedPages.length}
          </Badge>
        </div>
        
        {/* New Button with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              New
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem 
              onClick={() => handleCreatePage('new')}
              className="cursor-pointer"
            >
              <FileText className="h-4 w-4 mr-2 text-green-600" />
              <div>
                <div className="font-medium">New</div>
                <div className="text-xs text-slate-500">For record creation</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleCreatePage('detail')}
              className="cursor-pointer"
            >
              <FileText className="h-4 w-4 mr-2 text-blue-600" />
              <div>
                <div className="font-medium">Detail</div>
                <div className="text-xs text-slate-500">For record view/edit</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="pl-10"
          />
        </div>
        
        <Select value={sortField} onValueChange={(v) => { setSortField(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="layout_name">Name</SelectItem>
            <SelectItem value="page_type">Type</SelectItem>
            <SelectItem value="created_at">Created</SelectItem>
            <SelectItem value="updated_at">Last Modified</SelectItem>
          </SelectContent>
        </Select>
        
        <Button 
          variant="outline" 
          size="icon"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        >
          <ArrowUpDown className={`h-4 w-4 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      {paginatedPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-lg border-2 border-dashed">
          <LayoutGrid className="h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900">No Lightning Pages</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            {searchQuery ? 'No pages match your search' : `Create your first Lightning Page for ${objectLabel}`}
          </p>
          {!searchQuery && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Page
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleCreatePage('new')}>
                  <FileText className="h-4 w-4 mr-2 text-green-600" />
                  New Page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreatePage('detail')}>
                  <FileText className="h-4 w-4 mr-2 text-blue-600" />
                  Detail Page
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort('layout_name')}
                >
                  <div className="flex items-center gap-1">
                    Page Name
                    {sortField === 'layout_name' && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100 w-24"
                  onClick={() => handleSort('page_type')}
                >
                  <div className="flex items-center gap-1">
                    Type
                    {sortField === 'page_type' && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort('created_at')}
                >
                  <div className="flex items-center gap-1">
                    Created
                    {sortField === 'created_at' && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort('updated_at')}
                >
                  <div className="flex items-center gap-1">
                    Last Modified
                    {sortField === 'updated_at' && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPages.map((page) => (
                <TableRow key={page.id} className="hover:bg-slate-50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className={`h-4 w-4 ${page.page_type === 'new' ? 'text-green-600' : 'text-blue-600'}`} />
                      <span className="font-medium text-slate-900">
                        {page.layout_name || 'Unnamed Page'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={page.page_type === 'new' 
                        ? 'bg-green-50 text-green-700 border-green-200' 
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                      }
                    >
                      {page.page_type === 'new' ? 'New' : 'Detail'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <Calendar className="h-3 w-3" />
                      {formatDate(page.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Clock className="h-3 w-3" />
                        {formatDate(page.updated_at)}
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatTime(page.updated_at)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenBuilder(page.id, page.page_type || 'detail')}
                        className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePage(page.id, page.layout_name)}
                        className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-slate-500">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredAndSortedPages.length)} of {filteredAndSortedPages.length} pages
          </div>
          <div className="flex items-center gap-2">
            <Select 
              value={pageSize.toString()} 
              onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm text-slate-600">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LightningPagesListPanel;
