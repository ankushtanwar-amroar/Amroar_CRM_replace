import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Button } from './ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Initialize localizer inside this module
const localizer = momentLocalizer(moment);

// Calendar View Component
const CalendarViewComponent = ({ hideHeader = false }) => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');

  useEffect(() => {
    fetchCalendarActivities();
  }, []);

  const fetchCalendarActivities = async () => {
    try {
      const startDate = moment().subtract(1, 'month').format('YYYY-MM-DD');
      const endDate = moment().add(2, 'months').format('YYYY-MM-DD');

      const response = await axios.get(`${API}/api/calendar/activities`, {
        params: { start_date: startDate, end_date: endDate }
      });

      const calendarEvents = response.data.activities.map(activity => ({
        id: activity.id,
        title: activity.title,
        start: new Date(activity.date || activity.start_date),
        end: activity.end_date ? new Date(activity.end_date) : new Date(activity.date || activity.start_date),
        resource: activity,
        allDay: !activity.start_date || !activity.start_date.includes('T')
      }));

      setActivities(calendarEvents);
    } catch (error) {
      console.error('Error fetching calendar activities:', error);
      toast.error('Failed to load calendar activities');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEvent = (event) => {
    const activity = event.resource;
    if (activity.related_to && activity.related_type) {
      navigate(`/object/${activity.related_type.toLowerCase()}/record/${activity.related_to}`);
    }
  };
  
  const handleNavigate = (action) => {
    let newDate = new Date(currentDate);
    
    switch (action) {
      case 'PREV':
        if (currentView === 'month') {
          newDate.setMonth(newDate.getMonth() - 1);
        } else if (currentView === 'week') {
          newDate.setDate(newDate.getDate() - 7);
        } else if (currentView === 'day') {
          newDate.setDate(newDate.getDate() - 1);
        }
        break;
      case 'NEXT':
        if (currentView === 'month') {
          newDate.setMonth(newDate.getMonth() + 1);
        } else if (currentView === 'week') {
          newDate.setDate(newDate.getDate() + 7);
        } else if (currentView === 'day') {
          newDate.setDate(newDate.getDate() + 1);
        }
        break;
      case 'TODAY':
        newDate = new Date();
        break;
      default:
        break;
    }
    
    setCurrentDate(newDate);
  };
  
  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const eventStyleGetter = (event) => {
    const activity = event.resource;
    let backgroundColor = '#6366f1'; // Default indigo

    if (activity.type === 'task') {
      backgroundColor = activity.priority === 'High' ? '#ef4444' :
        activity.priority === 'Normal' ? '#f59e0b' : '#10b981';
    } else if (activity.type === 'event') {
      backgroundColor = '#8b5cf6'; // Purple for events
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="ml-3 text-slate-600">Loading calendar...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {!hideHeader && (
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center">
            <CalendarIcon className="h-5 w-5 mr-2" />
            Activities Calendar
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {activities.length} activities • Tasks and Events
          </p>
        </div>
      )}

      <div className={`flex-1 ${hideHeader ? '' : 'p-6'} bg-white`}>
        <div style={{ height: hideHeader ? '100%' : 'calc(100vh - 200px)' }}>
          <Calendar
            localizer={localizer}
            events={activities}
            startAccessor="start"
            endAccessor="end"
            view={currentView}
            date={currentDate}
            onNavigate={handleNavigate}
            onView={handleViewChange}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            views={['month', 'week', 'day', 'agenda']}
            popup
            showMultiDayTimes
            step={60}
            showAllEvents
            className="shadow-sm border border-slate-200 rounded-lg"
            components={{
              toolbar: ({ label, view, views }) => (
                <div className="flex items-center justify-between mb-4 p-4 bg-slate-50 rounded-t-lg border-b">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNavigate('PREV')}
                    >
                      ← Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNavigate('TODAY')}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNavigate('NEXT')}
                    >
                      Next →
                    </Button>
                  </div>

                  <h3 className="text-lg font-semibold text-slate-900">{label}</h3>

                  <div className="flex items-center space-x-1">
                    {views.map(viewName => (
                      <Button
                        key={viewName}
                        variant={view === viewName ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleViewChange(viewName)}
                        className="capitalize"
                      >
                        {viewName}
                      </Button>
                    ))}
                  </div>
                </div>
              )
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default CalendarViewComponent;
