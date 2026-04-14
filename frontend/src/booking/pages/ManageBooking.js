import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, Mail, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ManageBooking = () => {
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const action = searchParams.get('action');

  const [booking, setBooking] = useState(null);
  const [service, setService] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [newDateTime, setNewDateTime] = useState('');

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  const loadBooking = async () => {
    try {
      // For public access, we need a different approach since we don't have auth
      // We'll fetch the booking without auth
      const response = await axios.get(`${API_URL}/api/booking/public/booking/${bookingId}`);
      setBooking(response.data);
      
      // Load service and staff
      if (response.data) {
        const [serviceRes, staffRes] = await Promise.all([
          axios.get(`${API_URL}/api/booking/public/services/${response.data.tenant_id}`),
          axios.get(`${API_URL}/api/booking/public/staff/${response.data.tenant_id}`)
        ]);
        
        const foundService = serviceRes.data.find(s => s.id === response.data.service_id);
        const foundStaff = staffRes.data.find(s => s.id === response.data.staff_id);
        
        setService(foundService);
        setStaff(foundStaff);
      }
    } catch (err) {
      setError('Booking not found or invalid link');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) {
      return;
    }

    setProcessing(true);
    try {
      await axios.put(`${API_URL}/api/booking/public/booking/${bookingId}/cancel`);
      setSuccess(true);
    } catch (err) {
      setError('Failed to cancel booking. Please contact support.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      await axios.put(`${API_URL}/api/booking/public/booking/${bookingId}/reschedule`, {
        start_time: new Date(newDateTime).toISOString()
      });
      setSuccess(true);
    } catch (err) {
      setError('Failed to reschedule booking. Please contact support.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading booking...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <XCircle className="text-red-500 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="text-green-500 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {action === 'cancel' ? 'Booking Cancelled' : 'Booking Rescheduled'}
          </h2>
          <p className="text-gray-600 mb-6">
            {action === 'cancel' 
              ? 'Your booking has been cancelled. You will receive a confirmation email shortly.'
              : 'Your booking has been rescheduled. You will receive a confirmation email with the new details.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            {action === 'cancel' ? 'Cancel Booking' : 'Reschedule Booking'}
          </h1>

          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Current Booking Details</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="text-gray-500 mt-0.5" size={20} />
                <div>
                  <div className="text-sm text-gray-600">Service</div>
                  <div className="font-medium text-gray-900">{service?.name}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <User className="text-gray-500 mt-0.5" size={20} />
                <div>
                  <div className="text-sm text-gray-600">Staff</div>
                  <div className="font-medium text-gray-900">{staff?.name}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="text-gray-500 mt-0.5" size={20} />
                <div>
                  <div className="text-sm text-gray-600">Date & Time</div>
                  <div className="font-medium text-gray-900">
                    {new Date(booking?.start_time).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="text-gray-500 mt-0.5" size={20} />
                <div>
                  <div className="text-sm text-gray-600">Customer</div>
                  <div className="font-medium text-gray-900">{booking?.customer_name}</div>
                  <div className="text-sm text-gray-600">{booking?.customer_email}</div>
                </div>
              </div>
            </div>
          </div>

          {action === 'reschedule' ? (
            <form onSubmit={handleReschedule}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select New Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.close()}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800 text-sm">
                  <strong>Warning:</strong> This action cannot be undone. Your booking will be permanently cancelled.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.close()}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Go Back
                </button>
                <button
                  onClick={handleCancel}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageBooking;
