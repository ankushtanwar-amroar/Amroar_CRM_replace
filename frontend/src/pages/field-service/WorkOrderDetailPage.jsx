/**
 * Work Order Detail Page - Shows work order details and related service appointments
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Wrench, ArrowLeft, RefreshCw, Edit, Trash2, Calendar,
  Plus, MapPin, Clock, User, Briefcase, FileText, Users,
  ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
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

const appointmentStatusColors = {
  'None': 'bg-slate-100 text-slate-600',
  'Scheduled': 'bg-blue-100 text-blue-700',
  'Dispatched': 'bg-purple-100 text-purple-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700'
};

// Collapsible Section Component
const Section = ({ title, icon: Icon, children, defaultOpen = true, badge = null }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full"
      >
        <CardHeader className="py-3 px-4 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4 text-slate-500" />}
              <CardTitle className="text-sm font-medium text-slate-700">{title}</CardTitle>
              {badge}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </CardHeader>
      </button>
      {isOpen && <CardContent className="p-4">{children}</CardContent>}
    </Card>
  );
};

// Field Display Component
const FieldDisplay = ({ label, value, className = '' }) => (
  <div className={className}>
    <p className="text-xs text-slate-500 mb-1">{label}</p>
    <p className="text-sm font-medium text-slate-800">{value || '-'}</p>
  </div>
);

const WorkOrderDetailPage = () => {
  const { workOrderId } = useParams();
  const navigate = useNavigate();
  
  const [workOrder, setWorkOrder] = useState(null);
  const [serviceAppointments, setServiceAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [showCreateAppointment, setShowCreateAppointment] = useState(false);
  const [serviceAppointmentObject, setServiceAppointmentObject] = useState(null);

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

  const fetchWorkOrder = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/work-orders/${workOrderId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWorkOrder(response.data);
    } catch (error) {
      console.error('Error fetching work order:', error);
      toast.error('Failed to load work order');
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  const fetchServiceAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/work-orders/${workOrderId}/service-appointments`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setServiceAppointments(response.data.records || []);
    } catch (error) {
      console.error('Error fetching service appointments:', error);
      // Don't show error toast - might be no appointments
      setServiceAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    fetchWorkOrder();
    fetchServiceAppointments();
  }, [fetchWorkOrder, fetchServiceAppointments]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this work order?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/work-orders/${workOrderId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Work order deleted');
      navigate('/work-orders');
    } catch (error) {
      console.error('Error deleting work order:', error);
      toast.error('Failed to delete work order');
    }
  };

  const handleCreateAppointmentSuccess = () => {
    setShowCreateAppointment(false);
    fetchServiceAppointments();
    toast.success('Service appointment created');
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-lg text-slate-600">Work Order not found</p>
        <Button variant="outline" onClick={() => navigate('/work-orders')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Work Orders
        </Button>
      </div>
    );
  }

  const data = workOrder.data || {};

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/work-orders')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Wrench className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">
                  {workOrder.series_id || 'Work Order'}
                </h1>
                <p className="text-sm text-slate-500">{data.subject || 'No subject'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchWorkOrder}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Status Bar */}
        <div className="flex items-center gap-4">
          <Badge className={`text-sm px-3 py-1 ${statusColors[data.status] || 'bg-slate-100'}`}>
            {data.status || 'New'}
          </Badge>
          <Badge className={`text-sm px-3 py-1 ${priorityColors[data.priority] || 'bg-slate-100'}`}>
            {data.priority || 'Medium'} Priority
          </Badge>
          {data.work_type && (
            <Badge variant="outline" className="text-sm px-3 py-1">
              {data.work_type}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Information Section */}
            <Section title="Information" icon={FileText}>
              <div className="grid grid-cols-2 gap-4">
                <FieldDisplay label="Subject" value={data.subject} />
                <FieldDisplay label="Status" value={data.status} />
                <FieldDisplay label="Priority" value={data.priority} />
                <FieldDisplay label="Work Type" value={data.work_type} />
                <FieldDisplay label="Account" value={data.account_id?.slice(0, 12)} />
                <FieldDisplay label="Contact" value={data.contact_id?.slice(0, 12)} />
              </div>
              {data.description && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <FieldDisplay label="Description" value={data.description} />
                </div>
              )}
            </Section>

            {/* Scheduling Section */}
            <Section title="Scheduling" icon={Clock}>
              <div className="grid grid-cols-2 gap-4">
                <FieldDisplay label="Start Date" value={formatDateTime(data.start_date)} />
                <FieldDisplay label="End Date" value={formatDateTime(data.end_date)} />
                <FieldDisplay label="Duration" value={data.duration ? `${data.duration} ${data.duration_type || 'Hours'}` : '-'} />
                <FieldDisplay label="Service Territory" value={data.service_territory_id?.slice(0, 12)} />
              </div>
            </Section>

            {/* Address Section */}
            <Section title="Address" icon={MapPin}>
              <div className="grid grid-cols-2 gap-4">
                <FieldDisplay label="Street" value={data.street} />
                <FieldDisplay label="City" value={data.city} />
                <FieldDisplay label="State" value={data.state} />
                <FieldDisplay label="Postal Code" value={data.postal_code} />
                <FieldDisplay label="Country" value={data.country} />
              </div>
            </Section>

            {/* Service Appointments Section */}
            <Section 
              title="Service Appointments" 
              icon={Calendar}
              badge={
                <Badge variant="secondary" className="ml-2">
                  {serviceAppointments.length}
                </Badge>
              }
            >
              <div className="mb-4">
                <Button
                  size="sm"
                  onClick={() => setShowCreateAppointment(true)}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="create-appointment-from-wo-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Service Appointment
                </Button>
              </div>

              {appointmentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : serviceAppointments.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Calendar className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm">No service appointments yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Appointment #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceAppointments.map((sa) => {
                      const saData = sa.data || {};
                      return (
                        <TableRow 
                          key={sa.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => navigate(`/service-appointments/${sa.id}`)}
                        >
                          <TableCell className="font-medium text-green-600">
                            {sa.series_id || sa.id?.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <Badge className={appointmentStatusColors[saData.status] || 'bg-slate-100'}>
                              {saData.status || 'None'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDateTime(saData.scheduled_start || saData.earliest_start_time)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* System Information */}
            <Section title="System Information" icon={Briefcase} defaultOpen={false}>
              <div className="space-y-3">
                <FieldDisplay label="Work Order ID" value={workOrder.id?.slice(0, 12) + '...'} />
                <FieldDisplay label="Series ID" value={workOrder.series_id} />
                <FieldDisplay label="Created" value={formatDateTime(workOrder.created_at)} />
                <FieldDisplay label="Last Modified" value={formatDateTime(workOrder.updated_at)} />
                <FieldDisplay label="Owner" value={workOrder.owner_id?.slice(0, 12)} />
              </div>
            </Section>
          </div>
        </div>
      </div>

      {/* Create Service Appointment Dialog - Standard metadata-driven form */}
      {serviceAppointmentObject && (
        <CreateRecordDialog
          object={serviceAppointmentObject}
          defaultOpen={showCreateAppointment}
          onOpenChange={setShowCreateAppointment}
          onSuccess={handleCreateAppointmentSuccess}
          prefilledValues={{ work_order_id: workOrder?.id }}
        />
      )}

    </div>
  );
};

export default WorkOrderDetailPage;
