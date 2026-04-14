import React, { useState, useEffect } from 'react';
import { getBookings, getStaff, updateBooking } from '../services/bookingService';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, Grid } from 'lucide-react';
import BookingLayout from '../components/BookingLayout';

const CalendarPage = () => {
  const [bookings, setBookings] = useState([]);
  const [staff, setStaff] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // month, week, day
  const [selectedStaff, setSelectedStaff] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentDate, view, selectedStaff]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const staffList = await getStaff();
      setStaff(staffList);

      const filters = {
        start_date: start.toISOString(),
        end_date: end.toISOString()
      };
      if (selectedStaff !== 'all') {
        filters.staff_id = selectedStaff;
      }

      const bookingsData = await getBookings(filters);
      setBookings(bookingsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = () => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    } else if (view === 'week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  };

  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + (direction * 7));
    } else {
      newDate.setDate(newDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const getBookingsForDate = (date) => {
    if (!date) return [];
    return bookings.filter(booking => {
      const bookingDate = new Date(booking.start_time);
      return bookingDate.toDateString() === date.toDateString();
    });
  };

  const getWeekDays = () => {
    const days = [];
    const startDate = new Date(currentDate);
    const day = startDate.getDay();
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
    startDate.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const handleReschedule = async (booking) => {
    const newTime = prompt('Enter new date/time (YYYY-MM-DD HH:MM):', 
      new Date(booking.start_time).toISOString().slice(0, 16).replace('T', ' '));
    
    if (newTime) {
      try {
        await updateBooking(booking.id, {
          start_time: new Date(newTime.replace(' ', 'T')).toISOString()
        });
        await loadData();
      } catch (error) {
        console.error('Failed to reschedule:', error);
        alert('Failed to reschedule booking');
      }
    }
  };

  const renderMonthView = () => {
    const days = getMonthDays();
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {weekDays.map(day => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-gray-700">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const dayBookings = getBookingsForDate(day);
            return (
              <div
                key={index}
                className={`min-h-24 p-2 border-b border-r border-gray-200 ${
                  !day ? 'bg-gray-50' : 'hover:bg-gray-50'
                }`}
              >
                {day && (
                  <>
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayBookings.slice(0, 3).map(booking => {
                        const staffMember = staff.find(s => s.id === booking.staff_id);
                        return (
                          <div
                            key={booking.id}
                            className="text-xs p-1 rounded bg-blue-100 text-blue-800 truncate cursor-pointer hover:bg-blue-200"
                            onClick={() => handleReschedule(booking)}
                            title={`${new Date(booking.start_time).toLocaleTimeString()} - ${booking.customer_name} with ${staffMember?.name}`}
                          >
                            {new Date(booking.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        );
                      })}
                      {dayBookings.length > 3 && (
                        <div className="text-xs text-gray-500">+{dayBookings.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-auto">
        <div className="grid grid-cols-8 border-b border-gray-200">
          <div className="p-3 text-sm font-semibold text-gray-700 border-r">Time</div>
          {weekDays.map(day => (
            <div key={day.toISOString()} className="p-3 text-center border-r">
              <div className="text-sm font-semibold text-gray-900">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="text-xs text-gray-600">{day.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-8">
          {hours.map(hour => (
            <React.Fragment key={hour}>
              <div className="p-2 text-xs text-gray-600 border-r border-b">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {weekDays.map(day => {
                const dayBookings = getBookingsForDate(day).filter(booking => {
                  const bookingHour = new Date(booking.start_time).getHours();
                  return bookingHour === hour;
                });
                return (
                  <div key={`${day.toISOString()}-${hour}`} className="p-1 border-r border-b min-h-16">
                    {dayBookings.map(booking => {
                      const staffMember = staff.find(s => s.id === booking.staff_id);
                      return (
                        <div
                          key={booking.id}
                          className="text-xs p-1.5 mb-1 rounded bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200"
                          onClick={() => handleReschedule(booking)}
                        >
                          <div className="font-medium">{booking.customer_name}</div>
                          <div className="text-[10px]">{staffMember?.name}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayBookings = getBookingsForDate(currentDate);

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
        </div>
        <div className="divide-y divide-gray-200">
          {hours.map(hour => {
            const hourBookings = dayBookings.filter(booking => {
              const bookingHour = new Date(booking.start_time).getHours();
              return bookingHour === hour;
            });
            return (
              <div key={hour} className="flex">
                <div className="w-20 p-3 text-sm text-gray-600 border-r">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                <div className="flex-1 p-3 min-h-20">
                  {hourBookings.map(booking => {
                    const staffMember = staff.find(s => s.id === booking.staff_id);
                    return (
                      <div
                        key={booking.id}
                        className="mb-2 p-3 rounded-lg bg-blue-50 border border-blue-200 cursor-pointer hover:bg-blue-100"
                        onClick={() => handleReschedule(booking)}
                      >
                        <div className="font-medium text-gray-900">{booking.customer_name}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {new Date(booking.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - Staff: {staffMember?.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{booking.customer_email}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <BookingLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-900">Bookings Calendar</h1>
              <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
                <button
                  onClick={() => setView('month')}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${
                    view === 'month' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <CalendarIcon size={16} className="inline mr-1" />
                  Month
                </button>
                <button
                  onClick={() => setView('week')}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${
                    view === 'week' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Grid size={16} className="inline mr-1" />
                  Week
                </button>
                <button
                  onClick={() => setView('day')}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${
                    view === 'day' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <List size={16} className="inline mr-1" />
                  Day
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Staff</option>
                {staff.map(member => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateDate(-1)}
                  className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Today
                </button>
                <button
                  onClick={() => navigateDate(1)}
                  className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <h2 className="text-xl font-semibold text-gray-800">
              {view === 'month' && currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              {view === 'week' && `Week of ${getWeekDays()[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              {view === 'day' && currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading...</div>
          </div>
        ) : (
          <>
            {view === 'month' && renderMonthView()}
            {view === 'week' && renderWeekView()}
            {view === 'day' && renderDayView()}
          </>
        )}
        </div>
      </div>
    </BookingLayout>
  );
};

export default CalendarPage;
