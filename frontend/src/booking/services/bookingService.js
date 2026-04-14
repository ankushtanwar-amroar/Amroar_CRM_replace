import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

// Services
export const createService = async (serviceData) => {
  const response = await axios.post(`${API_URL}/api/booking/services`, serviceData, getAuthHeaders());
  return response.data;
};

export const getServices = async (activeOnly = false) => {
  const response = await axios.get(`${API_URL}/api/booking/services?active_only=${activeOnly}`, getAuthHeaders());
  return response.data;
};

export const getService = async (serviceId) => {
  const response = await axios.get(`${API_URL}/api/booking/services/${serviceId}`, getAuthHeaders());
  return response.data;
};

export const updateService = async (serviceId, serviceData) => {
  const response = await axios.put(`${API_URL}/api/booking/services/${serviceId}`, serviceData, getAuthHeaders());
  return response.data;
};

export const deleteService = async (serviceId) => {
  const response = await axios.delete(`${API_URL}/api/booking/services/${serviceId}`, getAuthHeaders());
  return response.data;
};

// Staff
export const createStaff = async (staffData) => {
  const response = await axios.post(`${API_URL}/api/booking/staff`, staffData, getAuthHeaders());
  return response.data;
};

export const getStaff = async (serviceId = null, activeOnly = false) => {
  let url = `${API_URL}/api/booking/staff?active_only=${activeOnly}`;
  if (serviceId) url += `&service_id=${serviceId}`;
  const response = await axios.get(url, getAuthHeaders());
  return response.data;
};

export const getStaffMember = async (staffId) => {
  const response = await axios.get(`${API_URL}/api/booking/staff/${staffId}`, getAuthHeaders());
  return response.data;
};

export const updateStaff = async (staffId, staffData) => {
  const response = await axios.put(`${API_URL}/api/booking/staff/${staffId}`, staffData, getAuthHeaders());
  return response.data;
};

export const deleteStaff = async (staffId) => {
  const response = await axios.delete(`${API_URL}/api/booking/staff/${staffId}`, getAuthHeaders());
  return response.data;
};

// Bookings
export const createBooking = async (bookingData) => {
  const response = await axios.post(`${API_URL}/api/booking/bookings`, bookingData, getAuthHeaders());
  return response.data;
};

export const getBookings = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.start_date) params.append('start_date', filters.start_date);
  if (filters.end_date) params.append('end_date', filters.end_date);
  if (filters.staff_id) params.append('staff_id', filters.staff_id);
  if (filters.status) params.append('status', filters.status);
  
  const response = await axios.get(`${API_URL}/api/booking/bookings?${params.toString()}`, getAuthHeaders());
  return response.data;
};

export const getBooking = async (bookingId) => {
  const response = await axios.get(`${API_URL}/api/booking/bookings/${bookingId}`, getAuthHeaders());
  return response.data;
};

export const updateBooking = async (bookingId, bookingData) => {
  const response = await axios.put(`${API_URL}/api/booking/bookings/${bookingId}`, bookingData, getAuthHeaders());
  return response.data;
};

export const deleteBooking = async (bookingId) => {
  const response = await axios.delete(`${API_URL}/api/booking/bookings/${bookingId}`, getAuthHeaders());
  return response.data;
};

// Availability
export const getAvailableSlots = async (serviceId, staffId, date) => {
  const response = await axios.get(
    `${API_URL}/api/booking/availability/${serviceId}/${staffId}?date=${date}`,
    getAuthHeaders()
  );
  return response.data;
};

// Public APIs
export const getPublicServices = async (tenantId) => {
  const response = await axios.get(`${API_URL}/api/booking/public/services/${tenantId}`);
  return response.data;
};

export const getPublicStaff = async (tenantId, serviceId = null) => {
  let url = `${API_URL}/api/booking/public/staff/${tenantId}`;
  if (serviceId) url += `?service_id=${serviceId}`;
  const response = await axios.get(url);
  return response.data;
};

export const getPublicAvailableSlots = async (tenantId, serviceId, staffId, date) => {
  const response = await axios.get(
    `${API_URL}/api/booking/public/availability/${tenantId}/${serviceId}/${staffId}?date=${date}`
  );
  return response.data;
};

export const createPublicBooking = async (tenantId, bookingData) => {
  const response = await axios.post(`${API_URL}/api/booking/public/bookings/${tenantId}`, bookingData);
  return response.data;
};

// Dashboard
export const getDashboardStats = async () => {
  const response = await axios.get(`${API_URL}/api/booking/dashboard/stats`, getAuthHeaders());
  return response.data;
};

// OAuth
export const getGoogleAuthUrl = async (staffId) => {
  const response = await axios.get(`${API_URL}/api/booking/oauth/google/url?staff_id=${staffId}`, getAuthHeaders());
  return response.data;
};
