import React, { useState, useEffect } from 'react';
import { Clock, Phone, Mail, MessageSquare, Calendar, Check, Plus, Filter } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const activityIcons = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageSquare,
  meeting: Calendar,
  note: MessageSquare,
  task: Check,
  event: Calendar
};

const Timeline = ({ objectType, recordId, tenantId }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, [objectType, recordId, tenantId]);

  const fetchActivities = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/crm-platform/activities?object_type=${objectType}&record_id=${recordId}&tenant_id=${tenantId}`
      );
      setActivities(response.data.activities || []);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Loading timeline...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-lg font-semibold">Activity Timeline</h3>
        <div className="flex items-center space-x-2">
          <button className="p-2 hover:bg-gray-100 rounded">
            <Filter className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Activity
          </button>
        </div>
      </div>

      <div className="p-4">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No activities yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type] || Clock;
              return (
                <div key={activity.id} className="flex space-x-3 pb-4 border-b last:border-b-0">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-gray-900">{activity.subject}</h4>
                      <span className="text-xs text-gray-500">{formatDate(activity.activity_date)}</span>
                    </div>
                    {activity.description && (
                      <p className="text-sm text-gray-600 mb-2">{activity.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span className="capitalize">{activity.type}</span>
                      <span className="capitalize">{activity.status}</span>
                      {activity.assigned_to && <span>Assigned to: {activity.assigned_to}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Timeline;
