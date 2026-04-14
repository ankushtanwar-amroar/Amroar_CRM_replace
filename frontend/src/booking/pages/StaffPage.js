import React, { useState, useEffect } from 'react';
import { getStaff, createStaff, updateStaff, deleteStaff, getServices, getGoogleAuthUrl } from '../services/bookingService';
import { Plus, Edit2, Trash2, Calendar, Mail, Phone, Link as LinkIcon } from 'lucide-react';
import BookingLayout from '../components/BookingLayout';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const StaffPage = () => {
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    services: [],
    availability: DAYS.map(day => ({
      day,
      enabled: day !== 'saturday' && day !== 'sunday',
      slots: [{ start: '09:00', end: '17:00' }]
    }))
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [staffData, servicesData] = await Promise.all([
        getStaff(),
        getServices(true)
      ]);
      setStaff(staffData);
      setServices(servicesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingStaff) {
        await updateStaff(editingStaff.id, formData);
      } else {
        await createStaff(formData);
      }
      await loadData();
      handleCloseModal();
    } catch (error) {
      console.error('Failed to save staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (staffMember) => {
    setEditingStaff(staffMember);
    setFormData({
      name: staffMember.name,
      email: staffMember.email,
      phone: staffMember.phone || '',
      bio: staffMember.bio || '',
      services: staffMember.services || [],
      availability: staffMember.availability || DAYS.map(day => ({
        day,
        enabled: day !== 'saturday' && day !== 'sunday',
        slots: [{ start: '09:00', end: '17:00' }]
      }))
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (staffId) => {
    if (window.confirm('Are you sure you want to delete this staff member?')) {
      try {
        await deleteStaff(staffId);
        await loadData();
      } catch (error) {
        console.error('Failed to delete staff:', error);
      }
    }
  };

  const handleGoogleConnect = async (staffId) => {
    try {
      const { auth_url } = await getGoogleAuthUrl(staffId);
      window.open(auth_url, '_blank', 'width=600,height=600');
    } catch (error) {
      console.error('Failed to get auth URL:', error);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingStaff(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      bio: '',
      services: [],
      availability: DAYS.map(day => ({
        day,
        enabled: day !== 'saturday' && day !== 'sunday',
        slots: [{ start: '09:00', end: '17:00' }]
      }))
    });
  };

  const updateAvailability = (dayIndex, field, value) => {
    const newAvailability = [...formData.availability];
    newAvailability[dayIndex] = { ...newAvailability[dayIndex], [field]: value };
    setFormData({ ...formData, availability: newAvailability });
  };

  const addTimeSlot = (dayIndex) => {
    const newAvailability = [...formData.availability];
    newAvailability[dayIndex].slots.push({ start: '09:00', end: '17:00' });
    setFormData({ ...formData, availability: newAvailability });
  };

  const removeTimeSlot = (dayIndex, slotIndex) => {
    const newAvailability = [...formData.availability];
    newAvailability[dayIndex].slots.splice(slotIndex, 1);
    setFormData({ ...formData, availability: newAvailability });
  };

  const updateTimeSlot = (dayIndex, slotIndex, field, value) => {
    const newAvailability = [...formData.availability];
    newAvailability[dayIndex].slots[slotIndex][field] = value;
    setFormData({ ...formData, availability: newAvailability });
  };

  return (
    <BookingLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Staff Members</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            Add Staff
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {staff.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{member.name}</h3>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 mt-1">
                    <Mail size={14} />
                    <span>{member.email}</span>
                  </div>
                  {member.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-600 mt-1">
                      <Phone size={14} />
                      <span>{member.phone}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(member)}
                    className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {member.bio && (
                <p className="text-gray-600 text-sm mb-3">{member.bio}</p>
              )}

              <div className="mb-3">
                <div className="text-xs font-medium text-gray-500 mb-1">Services:</div>
                <div className="flex flex-wrap gap-1.5">
                  {member.services?.map((serviceId) => {
                    const service = services.find(s => s.id === serviceId);
                    return service ? (
                      <span
                        key={serviceId}
                        className="px-2 py-1 text-xs rounded-full"
                        style={{
                          backgroundColor: `${service.color}20`,
                          color: service.color
                        }}
                      >
                        {service.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>

              <button
                onClick={() => handleGoogleConnect(member.id)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  member.google_refresh_token
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                }`}
              >
                {member.google_refresh_token ? (
                  <>
                    <Calendar size={16} />
                    Calendar Connected
                  </>
                ) : (
                  <>
                    <LinkIcon size={16} />
                    Connect Google Calendar
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 my-8">
              <h2 className="text-2xl font-bold mb-4">
                {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h2>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Services *
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {services.map((service) => (
                        <label
                          key={service.id}
                          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={formData.services.includes(service.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, services: [...formData.services, service.id] });
                              } else {
                                setFormData({ ...formData, services: formData.services.filter(id => id !== service.id) });
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{service.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Availability
                    </label>
                    <div className="space-y-3">
                      {formData.availability.map((dayAvail, dayIndex) => (
                        <div key={dayAvail.day} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center gap-3 mb-2">
                            <input
                              type="checkbox"
                              checked={dayAvail.enabled}
                              onChange={(e) => updateAvailability(dayIndex, 'enabled', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm font-medium capitalize">{dayAvail.day}</span>
                          </div>
                          {dayAvail.enabled && (
                            <div className="ml-6 space-y-2">
                              {dayAvail.slots.map((slot, slotIndex) => (
                                <div key={slotIndex} className="flex items-center gap-2">
                                  <input
                                    type="time"
                                    value={slot.start}
                                    onChange={(e) => updateTimeSlot(dayIndex, slotIndex, 'start', e.target.value)}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  <span className="text-gray-500">to</span>
                                  <input
                                    type="time"
                                    value={slot.end}
                                    onChange={(e) => updateTimeSlot(dayIndex, slotIndex, 'end', e.target.value)}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  {dayAvail.slots.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeTimeSlot(dayIndex, slotIndex)}
                                      className="text-red-600 hover:text-red-700 text-sm"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addTimeSlot(dayIndex)}
                                className="text-blue-600 hover:text-blue-700 text-sm"
                              >
                                + Add Time Slot
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
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
                    {loading ? 'Saving...' : editingStaff ? 'Update' : 'Create'}
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

export default StaffPage;
