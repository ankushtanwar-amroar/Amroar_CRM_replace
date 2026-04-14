/**
 * Events Today Component
 * 
 * Shows upcoming calendar events for today and the near future.
 * Part of the App Manager page builder component library.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, Clock, MapPin, ChevronRight, RefreshCw,
  AlertCircle, Video, Users
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

const EventsTodayComponent = ({ config = {} }) => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(config.date_range || 'today');

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        date_range: dateRange,
        max_rows: config.max_rows || 5,
        show_location: config.show_location !== false
      });
      
      const response = await fetch(
        `${API_URL}/api/app-manager/components/data/events-today?${params}`,
        { headers: getHeaders() }
      );
      
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      setError('Failed to load events');
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [dateRange]);

  const handleEventClick = (event) => {
    navigate(`/sales/event/${event.id}`);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    });
  };

  const isHappeningNow = (startTime, endTime) => {
    if (!startTime) return false;
    const now = new Date();
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000); // Default 1hr
    return now >= start && now <= end;
  };

  const isUpcoming = (startTime) => {
    if (!startTime) return false;
    const now = new Date();
    const start = new Date(startTime);
    const diff = start - now;
    return diff > 0 && diff <= 30 * 60 * 1000; // Within 30 minutes
  };

  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'next_7_days', label: 'Next 7 Days' },
    { value: 'next_15_days', label: 'Next 15 Days' },
    { value: 'next_30_days', label: 'Next 30 Days' }
  ];

  return (
    <Card 
      className="flex flex-col overflow-hidden" 
      style={{ height: '380px', minHeight: '380px', maxHeight: '380px' }}
      data-testid="events-today-component"
    >
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Calendar className="h-4 w-4 text-blue-600" />
            </div>
            <CardTitle className="text-lg font-semibold">
              {config.title || 'Upcoming Events'}
            </CardTitle>
            {events.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700">
                {events.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[130px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateRangeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchEvents}
              className="h-8 w-8 p-0"
              data-testid="refresh-events-btn"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-20 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-red-500">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <div className="p-3 bg-slate-100 rounded-full mb-3">
              <Calendar className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium">No upcoming events</p>
            <p className="text-xs text-slate-400">Your calendar is clear</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const happeningNow = isHappeningNow(event.start_time, event.end_time);
              const upcoming = isUpcoming(event.start_time);

              return (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                    happeningNow 
                      ? 'bg-green-50 border-green-200 hover:border-green-300' 
                      : upcoming 
                        ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                        : 'bg-white border-slate-200 hover:border-blue-200'
                  }`}
                  data-testid={`event-item-${event.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-slate-900 truncate">
                          {event.subject || event.name || 'Untitled Event'}
                        </span>
                        {happeningNow && (
                          <Badge className="bg-green-500 text-white text-xs animate-pulse">
                            Now
                          </Badge>
                        )}
                        {upcoming && !happeningNow && (
                          <Badge className="bg-amber-500 text-white text-xs">
                            Soon
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(event.start_time)} • {formatTime(event.start_time)}
                          {event.end_time && ` - ${formatTime(event.end_time)}`}
                        </span>
                        {config.show_location !== false && event.location && (
                          <span className="flex items-center gap-1 truncate max-w-[150px]">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                        )}
                        {event.is_online && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Video className="h-3 w-3" />
                            Virtual
                          </span>
                        )}
                        {event.attendees_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {event.attendees_count}
                          </span>
                        )}
                      </div>
                      {event.related_to_name && (
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          → {event.related_to_name}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {events.length > 0 && (
          <Button
            variant="link"
            className="w-full mt-3 text-sm"
            onClick={() => navigate('/sales/event')}
            data-testid="view-all-events-btn"
          >
            View All Events
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default EventsTodayComponent;
