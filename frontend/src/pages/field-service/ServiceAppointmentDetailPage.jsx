/**
 * Service Appointment Detail Page
 * 
 * Displays a service appointment record using the standard field layout.
 * Technician assignment has been removed to follow metadata-driven architecture.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Calendar, ArrowLeft, RefreshCw, Trash2, MapPin, 
  Clock, Briefcase, FileText, AlertCircle,
  ChevronDown, ChevronUp, Wrench
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
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

const ServiceAppointmentDetailPage = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAppointment = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/service-appointments/${appointmentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAppointment(response.data);
    } catch (error) {
      console.error('Error fetching appointment:', error);
      toast.error('Failed to load service appointment');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this service appointment?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/service-appointments/${appointmentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Service appointment deleted');
      navigate('/service-appointments');
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Failed to delete service appointment');
    }
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
        <RefreshCw className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-lg text-slate-600">Service Appointment not found</p>
        <Button variant="outline" onClick={() => navigate('/service-appointments')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Appointments
        </Button>
      </div>
    );
  }

  const data = appointment.data || {};

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/service-appointments')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">
                  {appointment.series_id || 'Service Appointment'}
                </h1>
                <p className="text-sm text-slate-500">{data.subject || 'No subject'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchAppointment}
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
            {data.status || 'None'}
          </Badge>
          {data.work_type && (
            <Badge variant="outline" className="text-sm px-3 py-1">
              {data.work_type}
            </Badge>
          )}
          {data.work_order_id && (
            <Button
              variant="link"
              size="sm"
              onClick={() => navigate(`/work-orders/${data.work_order_id}`)}
              className="text-indigo-600 p-0 h-auto"
            >
              <Wrench className="h-4 w-4 mr-1" />
              View Work Order
            </Button>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Details */}
            <Section title="Details" icon={FileText}>
              <div className="grid grid-cols-2 gap-4">
                <FieldDisplay label="Subject" value={data.subject} />
                <FieldDisplay label="Status" value={data.status} />
                <FieldDisplay label="Work Type" value={data.work_type} />
                <FieldDisplay label="Equipment Type" value={data.equipment_type} />
              </div>
              {data.description && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <FieldDisplay label="Description" value={data.description} />
                </div>
              )}
            </Section>

            {/* Schedule */}
            <Section title="Schedule" icon={Clock}>
              <div className="grid grid-cols-2 gap-4">
                <FieldDisplay label="Earliest Start" value={formatDateTime(data.earliest_start_time)} />
                <FieldDisplay label="Due Date" value={formatDateTime(data.due_date)} />
                <FieldDisplay label="Scheduled Start" value={formatDateTime(data.scheduled_start)} />
                <FieldDisplay label="Scheduled End" value={formatDateTime(data.scheduled_end)} />
                <FieldDisplay label="Actual Start" value={formatDateTime(data.actual_start)} />
                <FieldDisplay label="Actual End" value={formatDateTime(data.actual_end)} />
              </div>
            </Section>

            {/* Address */}
            <Section title="Address" icon={MapPin}>
              <div className="grid grid-cols-2 gap-4">
                <FieldDisplay label="Street" value={data.street} />
                <FieldDisplay label="City" value={data.city} />
                <FieldDisplay label="State" value={data.state} />
                <FieldDisplay label="Postal Code" value={data.postal_code} />
                <FieldDisplay label="Country" value={data.country} />
              </div>
            </Section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* System Information */}
            <Section title="System Information" icon={Briefcase} defaultOpen={false}>
              <div className="space-y-3">
                <FieldDisplay label="Appointment ID" value={appointment.id?.slice(0, 12) + '...'} />
                <FieldDisplay label="Series ID" value={appointment.series_id} />
                <FieldDisplay label="Created" value={formatDateTime(appointment.created_at)} />
                <FieldDisplay label="Last Modified" value={formatDateTime(appointment.updated_at)} />
                <FieldDisplay label="Owner" value={appointment.owner_id?.slice(0, 12)} />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceAppointmentDetailPage;
