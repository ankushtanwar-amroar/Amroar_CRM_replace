/**
 * NotificationPreferencesPage
 * 
 * User notification configuration page at /setup/notification-configuration
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  AtSign,
  User,
  Users,
  Calendar,
  Mail,
  Smartphone,
  ArrowLeft,
  Save,
  Check,
  Loader2
} from 'lucide-react';
import { fetchPreferences, updatePreferences } from '../services/notificationService';
import { Button } from '../../../components/ui/button';
import { Switch } from '../../../components/ui/switch';

const NotificationPreferencesPage = () => {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  useEffect(() => {
    loadPreferences();
  }, []);
  
  const loadPreferences = async () => {
    try {
      const prefs = await fetchPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleToggle = async (key, value) => {
    // Optimistic update
    setPreferences(prev => ({ ...prev, [key]: value }));
    
    try {
      await updatePreferences({ [key]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to update preference:', error);
      // Revert on error
      setPreferences(prev => ({ ...prev, [key]: !value }));
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500">Loading preferences...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">Notification Preferences</h1>
                <p className="text-sm text-slate-500">Configure how you receive notifications</p>
              </div>
            </div>
            
            {saved && (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <Check className="h-4 w-4" />
                Saved
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* In-App Notifications */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Bell className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">In-App Notifications</h2>
                <p className="text-sm text-slate-500">Bell icon notification center</p>
              </div>
            </div>
          </div>
          
          <div className="divide-y divide-slate-100">
            {/* Mentions */}
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                  <AtSign className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Mentions</p>
                  <p className="text-xs text-slate-400">When someone mentions you in Chatter</p>
                </div>
              </div>
              <Switch
                checked={preferences?.mentions_enabled ?? true}
                onCheckedChange={(checked) => handleToggle('mentions_enabled', checked)}
              />
            </div>
            
            {/* Ownership Changes */}
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-50 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Ownership Changes</p>
                  <p className="text-xs text-slate-400">When a record is transferred to you</p>
                </div>
              </div>
              <Switch
                checked={preferences?.ownership_enabled ?? true}
                onCheckedChange={(checked) => handleToggle('ownership_enabled', checked)}
              />
            </div>
            
            {/* Assignments */}
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center">
                  <Users className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Assignments</p>
                  <p className="text-xs text-slate-400">When records are assigned to you</p>
                </div>
              </div>
              <Switch
                checked={preferences?.assignments_enabled ?? true}
                onCheckedChange={(checked) => handleToggle('assignments_enabled', checked)}
              />
            </div>
            
            {/* Reminders */}
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Event Reminders</p>
                  <p className="text-xs text-slate-400">Before your scheduled events start</p>
                </div>
              </div>
              <Switch
                checked={preferences?.reminders_enabled ?? true}
                onCheckedChange={(checked) => handleToggle('reminders_enabled', checked)}
              />
            </div>
          </div>
        </div>
        
        {/* Email Notifications (Placeholder for v1.1) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6 opacity-60">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Email Notifications</h2>
                  <p className="text-sm text-slate-500">Receive notifications via email</p>
                </div>
              </div>
              <span className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded-full">Coming Soon</span>
            </div>
          </div>
          
          <div className="p-6 text-center text-sm text-slate-400">
            Email notification settings will be available in a future update.
          </div>
        </div>
        
        {/* Mobile Push (Placeholder for v1.1) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden opacity-60">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Mobile Push Notifications</h2>
                  <p className="text-sm text-slate-500">Receive notifications on mobile device</p>
                </div>
              </div>
              <span className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded-full">Coming Soon</span>
            </div>
          </div>
          
          <div className="p-6 text-center text-sm text-slate-400">
            Mobile push notification settings will be available in a future update.
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationPreferencesPage;
