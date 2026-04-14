import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicServices, getPublicStaff, getPublicAvailableSlots, createPublicBooking } from '../services/bookingService';
import { Calendar, Clock, User, Mail, Phone, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const PublicBooking = () => {
  const { tenantId } = useParams();
  
  const [step, setStep] = useState(1);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    email: '',
    phone: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bookingDetails, setBookingDetails] = useState(null);

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    if (selectedService) {
      loadStaff();
    }
  }, [selectedService]);

  useEffect(() => {
    if (selectedService && selectedStaff && selectedDate) {
      loadSlots();
    }
  }, [selectedService, selectedStaff, selectedDate]);

  const loadServices = async () => {
    try {
      const data = await getPublicServices(tenantId);
      setServices(data);
    } catch (error) {
      console.error('Failed to load services:', error);
    }
  };

  const loadStaff = async () => {
    try {
      const data = await getPublicStaff(tenantId, selectedService.id);
      setStaff(data);
    } catch (error) {
      console.error('Failed to load staff:', error);
    }
  };

  const loadSlots = async () => {
    try {
      const data = await getPublicAvailableSlots(tenantId, selectedService.id, selectedStaff.id, selectedDate);
      setSlots(data.slots || []);
    } catch (error) {
      console.error('Failed to load slots:', error);
    }
  };

  const handleServiceSelect = (service) => {
    setSelectedService(service);
    setSelectedStaff(null);
    setSelectedSlot(null);
    setStep(2);
  };

  const handleStaffSelect = (staffMember) => {
    setSelectedStaff(staffMember);
    setSelectedSlot(null);
    setStep(3);
  };

  const handleSlotSelect = (slot) => {
    setSelectedSlot(slot);
    setStep(4);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const booking = await createPublicBooking(tenantId, {
        service_id: selectedService.id,
        staff_id: selectedStaff.id,
        start_time: selectedSlot.start,
        customer_name: customerInfo.name,
        customer_email: customerInfo.email,
        customer_phone: customerInfo.phone,
        notes: customerInfo.notes
      });
      setBookingDetails(booking);
      setSuccess(true);
      setStep(5);
    } catch (error) {
      console.error('Failed to create booking:', error);
      alert('Failed to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getNextDays = (count = 7) => {
    const days = [];
    for (let i = 0; i < count; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-600" size={48} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Booking Confirmed!</h1>
          <p className="text-gray-600 mb-6">Your appointment has been successfully scheduled.</p>
          
          <div className="bg-gray-50 rounded-lg p-6 text-left mb-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Service:</span>
                <span className="font-medium text-gray-900">{selectedService?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Staff:</span>
                <span className="font-medium text-gray-900">{selectedStaff?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date & Time:</span>
                <span className="font-medium text-gray-900">
                  {new Date(selectedSlot?.start).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Duration:</span>
                <span className="font-medium text-gray-900">{selectedService?.duration} minutes</span>
              </div>
              {bookingDetails?.google_meet_link && (
                <div className="flex justify-between items-start">
                  <span className="text-gray-600">Google Meet:</span>
                  <a 
                    href={bookingDetails.google_meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Join Meeting
                  </a>
                </div>
              )}
            </div>
          </div>
          
          <p className="text-sm text-gray-600 mb-6">
            A confirmation email has been sent to <strong>{customerInfo.email}</strong>
          </p>
          
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Book Another Appointment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto py-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <h1 className="text-3xl font-bold mb-2">Book Your Appointment</h1>
            <p className="text-blue-100">Follow the steps below to schedule your visit</p>
          </div>

          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {['Service', 'Staff', 'Time', 'Details', 'Confirm'].map((label, index) => (
                <React.Fragment key={label}>
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                      step > index + 1 ? 'bg-green-500 text-white' :
                      step === index + 1 ? 'bg-blue-600 text-white' :
                      'bg-gray-200 text-gray-600'
                    }`}>
                      {step > index + 1 ? '✓' : index + 1}
                    </div>
                    <span className="ml-2 text-sm font-medium text-gray-700">{label}</span>
                  </div>
                  {index < 4 && (
                    <div className={`flex-1 h-1 mx-2 ${
                      step > index + 1 ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="p-6">
            {step === 1 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Select a Service</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {services.map((service) => (
                    <div
                      key={service.id}
                      onClick={() => handleServiceSelect(service)}
                      className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: service.color }}
                        />
                        {service.price && (
                          <span className="text-lg font-bold text-gray-900">${service.price}</span>
                        )}
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">{service.name}</h3>
                      {service.description && (
                        <p className="text-gray-600 text-sm mb-3">{service.description}</p>
                      )}
                      <div className="flex items-center text-sm text-gray-500">
                        <Clock size={16} className="mr-1" />
                        <span>{service.duration} minutes</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center text-blue-600 hover:text-blue-700 mb-6"
                >
                  <ChevronLeft size={20} />
                  <span>Back to Services</span>
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Select Staff Member</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {staff.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => handleStaffSelect(member)}
                      className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all"
                    >
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">{member.name}</h3>
                      <div className="flex items-center text-sm text-gray-600 mb-2">
                        <Mail size={14} className="mr-1.5" />
                        <span>{member.email}</span>
                      </div>
                      {member.phone && (
                        <div className="flex items-center text-sm text-gray-600 mb-2">
                          <Phone size={14} className="mr-1.5" />
                          <span>{member.phone}</span>
                        </div>
                      )}
                      {member.bio && (
                        <p className="text-gray-600 text-sm mt-3">{member.bio}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center text-blue-600 hover:text-blue-700 mb-6"
                >
                  <ChevronLeft size={20} />
                  <span>Back to Staff</span>
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Select Date & Time</h2>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {getNextDays(14).map((date) => {
                      const dateObj = new Date(date);
                      return (
                        <button
                          key={date}
                          onClick={() => setSelectedDate(date)}
                          className={`flex-shrink-0 px-4 py-3 rounded-lg border-2 transition-all ${
                            selectedDate === date
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-center">
                            <div className="text-xs text-gray-600">
                              {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                            </div>
                            <div className="text-lg font-bold text-gray-900">
                              {dateObj.getDate()}
                            </div>
                            <div className="text-xs text-gray-600">
                              {dateObj.toLocaleDateString('en-US', { month: 'short' })}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Available Time Slots</label>
                  {slots.length > 0 ? (
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                      {slots.map((slot, index) => (
                        <button
                          key={index}
                          onClick={() => handleSlotSelect(slot)}
                          className="px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-sm font-medium"
                        >
                          {new Date(slot.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No available slots for this date. Please select another date.
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center text-blue-600 hover:text-blue-700 mb-6"
                >
                  <ChevronLeft size={20} />
                  <span>Back to Time Selection</span>
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Information</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={customerInfo.email}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={customerInfo.notes}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="3"
                    />
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 mt-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Booking Summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Service:</span>
                        <span className="font-medium text-gray-900">{selectedService?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Staff:</span>
                        <span className="font-medium text-gray-900">{selectedStaff?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Date & Time:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(selectedSlot?.start).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Duration:</span>
                        <span className="font-medium text-gray-900">{selectedService?.duration} min</span>
                      </div>
                      {selectedService?.price && (
                        <div className="flex justify-between pt-2 border-t border-blue-200">
                          <span className="text-gray-600 font-semibold">Price:</span>
                          <span className="font-bold text-gray-900">${selectedService.price}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Confirming...' : 'Confirm Booking'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicBooking;
