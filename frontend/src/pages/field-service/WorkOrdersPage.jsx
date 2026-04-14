/**
 * Work Orders List Page - Displays all work orders with actions
 * Uses standard metadata-driven CreateRecordDialog like all other objects
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wrench, Plus, RefreshCw, Search, Filter, 
  Eye, Trash2, MoreHorizontal, ChevronLeft, ChevronRight
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import CreateRecordDialog from '../../components/records/CreateRecordDialog';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const statusColors = {
  'New': 'bg-blue-100 text-blue-700',
  'Assigned': 'bg-purple-100 text-purple-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'On Hold': 'bg-slate-100 text-slate-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700'
};

const priorityColors = {
  'Low': 'bg-slate-100 text-slate-600',
  'Medium': 'bg-blue-100 text-blue-600',
  'High': 'bg-orange-100 text-orange-600',
  'Critical': 'bg-red-100 text-red-600'
};

const WorkOrdersPage = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [workOrderObject, setWorkOrderObject] = useState(null);
  const pageSize = 25;

  // Fetch Work Order object schema for dynamic form
  const fetchObjectSchema = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/objects/work_order`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWorkOrderObject(response.data);
    } catch (error) {
      console.error('Error fetching work_order object schema:', error);
    }
  }, []);

  useEffect(() => {
    fetchObjectSchema();
  }, [fetchObjectSchema]);

  const fetchWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('limit', pageSize);
      params.append('skip', (currentPage - 1) * pageSize);
      
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await axios.get(
        `${API_URL}/api/work-orders?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setWorkOrders(response.data.records || []);
      setTotalCount(response.data.total || response.data.records?.length || 0);
    } catch (error) {
      console.error('Error fetching work orders:', error);
      toast.error('Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  const handleDelete = async (workOrderId) => {
    if (!window.confirm('Are you sure you want to delete this work order?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/work-orders/${workOrderId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Work order deleted');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error deleting work order:', error);
      toast.error('Failed to delete work order');
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    fetchWorkOrders();
    toast.success('Work order created successfully');
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    const data = wo.data || {};
    const searchLower = searchTerm.toLowerCase();
    return (
      (wo.series_id || '').toLowerCase().includes(searchLower) ||
      (data.subject || '').toLowerCase().includes(searchLower) ||
      (data.description || '').toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Wrench className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Work Orders</h1>
              <p className="text-sm text-slate-500">{totalCount} total records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchWorkOrders}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="create-work-order-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Work Order
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search work orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Assigned">Assigned</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="On Hold">On Hold</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="p-6">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-semibold">Work Order #</TableHead>
                <TableHead className="font-semibold">Subject</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Priority</TableHead>
                <TableHead className="font-semibold">Work Type</TableHead>
                <TableHead className="font-semibold">Created</TableHead>
                <TableHead className="font-semibold w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                    <p className="mt-2 text-sm text-slate-500">Loading work orders...</p>
                  </TableCell>
                </TableRow>
              ) : filteredWorkOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Wrench className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">No work orders found</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShowCreateForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Work Order
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                filteredWorkOrders.map((wo) => {
                  const data = wo.data || {};
                  return (
                    <TableRow 
                      key={wo.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(`/work-orders/${wo.id}`)}
                      data-testid={`work-order-row-${wo.id}`}
                    >
                      <TableCell className="font-medium text-indigo-600">
                        {wo.series_id || wo.id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {data.subject || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[data.status] || 'bg-slate-100'}>
                          {data.status || 'New'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityColors[data.priority] || 'bg-slate-100'}>
                          {data.priority || 'Medium'}
                        </Badge>
                      </TableCell>
                      <TableCell>{data.work_type || '-'}</TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {wo.created_at ? new Date(wo.created_at).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/work-orders/${wo.id}`)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(wo.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Work Order Dialog - Standard metadata-driven form */}
      {workOrderObject && (
        <CreateRecordDialog
          object={workOrderObject}
          defaultOpen={showCreateForm}
          onOpenChange={setShowCreateForm}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
};

export default WorkOrdersPage;
