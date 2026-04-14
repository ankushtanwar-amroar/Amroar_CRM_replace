import React, { useState, useEffect } from 'react';
import { getBookings, getServices, getStaff, createBooking, updateBooking, deleteBooking } from '../services/bookingService';
import { Plus, Edit2, Trash2, Calendar, Clock, User, Mail, Phone, X } from 'lucide-react';
import BookingLayout from '../components/BookingLayout';

const BookingsPage = () => {
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [formData, setFormData] = useState({
    service_id: '',
    staff_id: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    start_time: '',
    notes: '',
    status: 'confirmed'
  });

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    try {
      const [bookingsData, servicesData, staffData] = await Promise.all([
        getBookings(filterStatus !== 'all' ? { status: filterStatus } : {}),
        getServices(true),
        getStaff()
      ]);
      setBookings(bookingsData);
      setServices(servicesData);
      setStaff(staffData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingBooking) {
        await updateBooking(editingBooking.id, {
          start_time: formData.start_time,
          status: formData.status,
          notes: formData.notes
        });
      } else {
        await createBooking(formData);
      }
      await loadData();
      handleCloseModal();
    } catch (error) {
      console.error('Failed to save booking:', error);
      alert('Failed to save booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (booking) => {
    setEditingBooking(booking);
    setFormData({
      service_id: booking.service_id,
      staff_id: booking.staff_id,
      customer_name: booking.customer_name,
      customer_email: booking.customer_email,
      customer_phone: booking.customer_phone || '',
      start_time: new Date(booking.start_time).toISOString().slice(0, 16),
      notes: booking.notes || '',
      status: booking.status
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (bookingId) => {
    if (window.confirm('Are you sure you want to delete this booking?')) {
      try {
        await deleteBooking(bookingId);
        await loadData();
      } catch (error) {
        console.error('Failed to delete booking:', error);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBooking(null);
    setFormData({
      service_id: '',
      staff_id: '',
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      start_time: '',
      notes: '',
      status: 'confirmed'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      confirmed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800',
      no_show: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <BookingLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Bookings</h1>
              <p className="text-gray-600 mt-1">Manage all appointments</p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus size={20} />
              New Booking
            </button>
          </div>

          <div className="mb-4 flex gap-2">
            {['all', 'confirmed', 'pending', 'cancelled', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg capitalize ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Customer</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Service</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Staff</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date & Time</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Contact</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => {
                    const service = services.find(s => s.id === booking.service_id);
                    const staffMember = staff.find(s => s.id === booking.staff_id);
                    
                    return (
                      <tr key={booking.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{booking.customer_name}</div>
                          <div className="text-sm text-gray-500">{booking.customer_email}</div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900">{service?.name || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-900">{staffMember?.name || 'N/A'}</td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-900">
                            {new Date(booking.start_time).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(booking.start_time).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full capitalize ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {booking.customer_phone && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Phone size={14} />
                              <span>{booking.customer_phone}</span>
                            </div>
                          )}
                          {booking.google_meet_link && (
                            <a 
                              href={booking.google_meet_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Meet Link
                            </a>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(booking)}
                              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(booking.id)}
                              className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {bookings.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No bookings found</p>
                  <p className="text-sm">Create a new booking to get started</p>
                </div>
              )}
            </div>
          </div>

          {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold">
                    {editingBooking ? 'Edit Booking' : 'New Booking'}
                  </h2>
                  <button
                    onClick={handleCloseModal}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="space-y-4">
                    {!editingBooking && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Service *
                          </label>
                          <select
                            value={formData.service_id}
                            onChange={(e) => setFormData({ ...formData, service_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                          >
                            <option value="">Select a service</option>
                            {services.map((service) => (
                              <option key={service.id} value={service.id}>
                                {service.name} ({service.duration} min)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Staff *
                          </label>
                          <select
                            value={formData.staff_id}
                            onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                          >
                            <option value="">Select staff member</option>
                            {staff
                              .filter(s => !formData.service_id || s.services.includes(formData.service_id))
                              .map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Customer Name *
                            </label>
                            <input
                              type="text"
                              value={formData.customer_name}
                              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Email *
                            </label>
                            <input
                              type="email"
                              value={formData.customer_email}
                              onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone
                          </label>
                          <input
                            type="tel"
                            value={formData.customer_phone}
                            onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date & Time *
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="completed">Completed</option>
                        <option value="no_show">No Show</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notes
                      </label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows="3"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : editingBooking ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </BookingLayout>
  );
};

export default BookingsPage;
