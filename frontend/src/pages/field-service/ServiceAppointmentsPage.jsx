/**
 * Service Appointments List Page - Displays all service appointments
 * Uses standard metadata-driven CreateRecordDialog like all other objects
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, Plus, RefreshCw, Search, Filter, 
  Eye, Trash2, MoreHorizontal, ChevronLeft, ChevronRight,
  Users
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
  'None': 'bg-slate-100 text-slate-600',
  'Scheduled': 'bg-blue-100 text-blue-700',
  'Dispatched': 'bg-purple-100 text-purple-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700',
  'Cannot Complete': 'bg-red-100 text-red-700'
};

const ServiceAppointmentsPage = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [serviceAppointmentObject, setServiceAppointmentObject] = useState(null);
  const pageSize = 25;

  // Fetch Service Appointment object schema for dynamic form
  const fetchObjectSchema = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/objects/service_appointment`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setServiceAppointmentObject(response.data);
    } catch (error) {
      console.error('Error fetching service_appointment object schema:', error);
    }
  }, []);

  useEffect(() => {
    fetchObjectSchema();
  }, [fetchObjectSchema]);

  const fetchAppointments = useCallback(async () => {
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
        `${API_URL}/api/service-appointments?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setAppointments(response.data.records || []);
      setTotalCount(response.data.total || response.data.records?.length || 0);
    } catch (error) {
      console.error('Error fetching service appointments:', error);
      toast.error('Failed to load service appointments');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleDelete = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to delete this service appointment?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/service-appointments/${appointmentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Service appointment deleted');
      fetchAppointments();
    } catch (error) {
      console.error('Error deleting service appointment:', error);
      toast.error('Failed to delete service appointment');
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    fetchAppointments();
    toast.success('Service appointment created successfully');
  };

  const filteredAppointments = appointments.filter(sa => {
    const data = sa.data || {};
    const searchLower = searchTerm.toLowerCase();
    return (
      (sa.series_id || '').toLowerCase().includes(searchLower) ||
      (data.subject || '').toLowerCase().includes(searchLower) ||
      (data.work_order_id || '').toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Service Appointments</h1>
              <p className="text-sm text-slate-500">{totalCount} total records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAppointments}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-green-600 hover:bg-green-700"
              data-testid="create-service-appointment-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
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
              placeholder="Search appointments..."
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
              <SelectItem value="None">None</SelectItem>
              <SelectItem value="Scheduled">Scheduled</SelectItem>
              <SelectItem value="Dispatched">Dispatched</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
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
                <TableHead className="font-semibold">Appointment #</TableHead>
                <TableHead className="font-semibold">Subject</TableHead>
                <TableHead className="font-semibold">Work Order</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Start Time</TableHead>
                <TableHead className="font-semibold">End Time</TableHead>
                <TableHead className="font-semibold w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                    <p className="mt-2 text-sm text-slate-500">Loading appointments...</p>
                  </TableCell>
                </TableRow>
              ) : filteredAppointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Calendar className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">No service appointments found</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShowCreateForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Appointment
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAppointments.map((sa) => {
                  const data = sa.data || {};
                  return (
                    <TableRow 
                      key={sa.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(`/service-appointments/${sa.id}`)}
                      data-testid={`appointment-row-${sa.id}`}
                    >
                      <TableCell className="font-medium text-green-600">
                        {sa.series_id || sa.id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {data.subject || '-'}
                      </TableCell>
                      <TableCell className="text-indigo-600">
                        {data.work_order_id ? data.work_order_id.slice(0, 12) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[data.status] || 'bg-slate-100'}>
                          {data.status || 'None'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(data.scheduled_start || data.earliest_start_time)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(data.scheduled_end || data.due_date)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/service-appointments/${sa.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(sa.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
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

      {/* Create Service Appointment Dialog - Standard metadata-driven form */}
      {serviceAppointmentObject && (
        <CreateRecordDialog
          object={serviceAppointmentObject}
          defaultOpen={showCreateForm}
          onOpenChange={setShowCreateForm}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
};

export default ServiceAppointmentsPage;
