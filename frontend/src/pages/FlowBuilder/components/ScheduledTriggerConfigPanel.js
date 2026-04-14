import React, { useState, useEffect } from 'react';
import { Clock, Calendar, AlertTriangle, RefreshCw, CheckCircle, Plus, Trash2, Filter } from 'lucide-react';
import axios from 'axios';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { toast } from 'sonner';
import ResourcePickerField from './ResourcePickerField';

const ScheduledTriggerConfigPanel = ({ flowId, triggers, onUpdateTriggers, onClose }) => {
  const [scheduleType, setScheduleType] = useState('one_time');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [frequency, setFrequency] = useState('daily');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [daysOfWeek, setDaysOfWeek] = useState([]);
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(false);
  const [lastExecuted, setLastExecuted] = useState(null);
  const [nextExecution, setNextExecution] = useState(null);
  
  // New fields
  const [selectedObject, setSelectedObject] = useState('');
  const [useConditions, setUseConditions] = useState(false);
  const [conditions, setConditions] = useState([]);
  const [useCron, setUseCron] = useState(false);
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  
  const API = process.env.REACT_APP_BACKEND_URL;

  // Available CRM objects
  const crmObjects = [
    'Lead',
    'Contact',
    'Account',
    'Opportunity',
    'Case',
    'Task',
    'Event'
  ];

  // Days of week for weekly scheduling
  const weekDays = [
    { value: 0, label: 'Monday' },
    { value: 1, label: 'Tuesday' },
    { value: 2, label: 'Wednesday' },
    { value: 3, label: 'Thursday' },
    { value: 4, label: 'Friday' },
    { value: 5, label: 'Saturday' },
    { value: 6, label: 'Sunday' }
  ];

  // Common timezones
  const timezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney'
  ];

  useEffect(() => {
    // Load existing schedule configuration from triggers
    if (triggers && triggers.length > 0) {
      const scheduledTrigger = triggers.find(t => t.type === 'scheduled_trigger');
      if (scheduledTrigger && scheduledTrigger.config) {
        const config = scheduledTrigger.config;
        setScheduleType(config.schedule_type || 'one_time');
        setScheduledDate(config.scheduled_date || '');
        setScheduledTime(config.scheduled_time || '09:00');
        setFrequency(config.frequency || 'daily');
        setTimeOfDay(config.time_of_day || '09:00');
        setDaysOfWeek(config.days_of_week || []);
        setTimezone(config.timezone || 'UTC');
        setLastExecuted(config.last_executed_at);
        setNextExecution(config.next_execution_at);
        
        // Load new fields
        setSelectedObject(config.object || '');
        setUseConditions(config.use_conditions || false);
        setConditions(config.conditions || []);
        setUseCron(config.use_cron || false);
        setCronExpression(config.cron_expression || '0 9 * * *');
      }
    }
  }, [triggers]);

  const addCondition = () => {
    setConditions([...conditions, {
      id: `condition_${Date.now()}`,
      field: 'createdAt',
      operator: 'last_n_days',
      value: '7'
    }]);
  };

  const updateCondition = (index, key, value) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [key]: value };
    setConditions(updated);
  };

  const removeCondition = (index) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleSaveSchedule = () => {
    // Validation
    if (scheduleType === 'one_time') {
      if (!scheduledDate || !scheduledTime) {
        toast.error('Please select both date and time for one-time schedule');
        return;
      }
    } else if (scheduleType === 'recurring') {
      if (useCron) {
        if (!cronExpression || cronExpression.trim() === '') {
          toast.error('Please enter a valid cron expression');
          return;
        }
      } else {
        if (!frequency || !timeOfDay) {
          toast.error('Please select frequency and time of day for recurring schedule');
          return;
        }
        if (frequency === 'weekly' && daysOfWeek.length === 0) {
          toast.error('Please select at least one day for weekly schedule');
          return;
        }
      }
    }

    // Build schedule configuration
    const scheduleConfig = {
      schedule_type: scheduleType,
      timezone: timezone,
      enabled: true,
      object: selectedObject || null,
      use_conditions: selectedObject ? true : false, // Auto-set based on object selection
      conditions: selectedObject && conditions.length > 0 ? conditions.map(condition => ({
        ...condition,
        // Convert special placeholder values to actual empty string/null
        value: condition.value === '__empty__' ? '' : 
               condition.value === '__null__' ? null : 
               condition.value
      })) : [],
      use_cron: useCron
    };

    if (scheduleType === 'one_time') {
      scheduleConfig.scheduled_date = scheduledDate;
      scheduleConfig.scheduled_time = scheduledTime;
    } else {
      if (useCron) {
        scheduleConfig.cron_expression = cronExpression;
      } else {
        scheduleConfig.frequency = frequency;
        scheduleConfig.time_of_day = timeOfDay;
        if (frequency === 'weekly') {
          scheduleConfig.days_of_week = daysOfWeek;
        }
      }
    }

    // Update or create scheduled trigger
    const updatedTriggers = [...(triggers || [])];
    const scheduledTriggerIndex = updatedTriggers.findIndex(t => t.type === 'scheduled_trigger');
    
    if (scheduledTriggerIndex >= 0) {
      // Update existing
      updatedTriggers[scheduledTriggerIndex].config = scheduleConfig;
    } else {
      // Create new
      updatedTriggers.push({
        id: `trigger_${Date.now()}`,
        type: 'scheduled_trigger',
        config: scheduleConfig
      });
    }

    onUpdateTriggers(updatedTriggers);
    toast.success('Schedule configuration saved! Please save the flow to activate.');
  };

  const toggleDayOfWeek = (day) => {
    setDaysOfWeek(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      } else {
        return [...prev, day].sort();
      }
    });
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Not scheduled yet';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Handle unsaved flows
  if (flowId === 'new') {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Save Flow First
          </h3>
          <p className="text-gray-600 text-sm mb-4">
            Please configure and save your flow to set up the schedule. Once saved and activated, the flow will run automatically according to your schedule.
          </p>
          <Button
            onClick={onClose}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-6 bg-gradient-to-r from-orange-50 to-orange-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Scheduled Trigger Configuration
              </h3>
              <p className="text-sm text-gray-600">
                Configure when this flow should run automatically
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Execution Status */}
        {(lastExecuted || nextExecution) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">Scheduler Status</span>
            </div>
            {lastExecuted && (
              <div className="text-xs text-blue-800">
                <span className="font-medium">Last Executed:</span> {formatTimestamp(lastExecuted)}
              </div>
            )}
            {nextExecution && (
              <div className="text-xs text-blue-800">
                <span className="font-medium">Next Execution:</span> {formatTimestamp(nextExecution)}
              </div>
            )}
          </div>
        )}

        {/* Schedule Type Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Schedule Type</Label>
          <Select value={scheduleType} onValueChange={setScheduleType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_time">One-Time Schedule</SelectItem>
              <SelectItem value="recurring">Recurring Schedule</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* One-Time Schedule Configuration */}
        {scheduleType === 'one_time' && (
          <div className="space-y-4 border-l-4 border-orange-500 pl-4">
            <h4 className="text-sm font-semibold text-gray-900">One-Time Schedule</h4>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-xs text-orange-800">
                <strong>Note:</strong> This flow will run once at the specified date and time, then be automatically deactivated.
              </p>
            </div>
          </div>
        )}

        {/* Recurring Schedule Configuration */}
        {scheduleType === 'recurring' && (
          <div className="space-y-4 border-l-4 border-green-500 pl-4">
            <h4 className="text-sm font-semibold text-gray-900">Recurring Schedule</h4>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Days of Week Selection (for weekly only) */}
            {frequency === 'weekly' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Days of Week</Label>
                <div className="flex flex-wrap gap-2">
                  {weekDays.map(day => (
                    <button
                      key={day.value}
                      onClick={() => toggleDayOfWeek(day.value)}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                        daysOfWeek.includes(day.value)
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Time of Day</Label>
              <Input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-800">
                <strong>Note:</strong> This flow will run automatically according to the schedule until deactivated.
              </p>
            </div>
          </div>
        )}

        {/* Timezone Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map(tz => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            The schedule will use this timezone for execution
          </p>
        </div>

        {/* Cron Expression (for recurring only) */}
        {scheduleType === 'recurring' && (
          <div className="border-l-4 border-purple-500 pl-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use_cron"
                checked={useCron}
                onChange={(e) => setUseCron(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
              />
              <Label htmlFor="use_cron" className="text-sm font-semibold text-gray-900">
                Use Cron Expression (Advanced)
              </Label>
            </div>
            
            {useCron && (
              <div className="space-y-2 mt-3">
                <Label className="text-sm font-medium text-gray-700">Cron Expression</Label>
                <Input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 9 * * * (Every day at 9 AM)"
                  className="w-full font-mono text-sm"
                />
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-xs text-purple-900 font-medium mb-2">Cron Format:</p>
                  <code className="text-xs text-purple-800 block">minute hour day month weekday</code>
                  <p className="text-xs text-purple-700 mt-2">Examples:</p>
                  <ul className="text-xs text-purple-700 space-y-1 mt-1 ml-4">
                    <li>• <code>0 9 * * *</code> - Every day at 9 AM</li>
                    <li>• <code>0 */2 * * *</code> - Every 2 hours</li>
                    <li>• <code>0 9 * * 1</code> - Every Monday at 9 AM</li>
                    <li>• <code>0 0 1 * *</code> - First day of month at midnight</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Object Selection */}
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div>
            <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Data Filtering (Optional)
            </Label>
            <p className="text-xs text-gray-500 mt-1">
              Select an object and add conditions to process specific records
            </p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Select Object</Label>
            <Select value={selectedObject} onValueChange={(value) => {
              setSelectedObject(value);
              // Automatically show conditions when object is selected
              if (value) {
                setUseConditions(true);
                // Add first condition automatically if none exist
                if (conditions.length === 0) {
                  addCondition();
                }
              } else {
                setUseConditions(false);
                setConditions([]);
              }
            }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an object (optional)" />
              </SelectTrigger>
              <SelectContent>
                {crmObjects.map(obj => (
                  <SelectItem key={obj} value={obj}>{obj}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedObject && (
              <button
                type="button"
                onClick={() => {
                  setSelectedObject('');
                  setUseConditions(false);
                  setConditions([]);
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>

        {/* Conditions - Show automatically when object is selected */}
        {selectedObject && (
          <div className="border-l-4 border-blue-500 pl-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-900">Filter Conditions</Label>
              <Button
                type="button"
                onClick={addCondition}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Condition
              </Button>
            </div>

            {conditions.length === 0 ? (
              <div className="text-center py-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-xs text-gray-600">No conditions added yet</p>
                <p className="text-xs text-gray-500 mt-1">Click "Add Condition" to filter records</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conditions.map((condition, index) => (
                  <div key={condition.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">Condition {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-gray-600">Field</Label>
                        <Select
                          value={condition.field}
                          onValueChange={(value) => updateCondition(index, 'field', value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Date Fields */}
                            <SelectItem value="createdAt">Created Date</SelectItem>
                            <SelectItem value="updatedAt">Updated Date</SelectItem>
                            <SelectItem value="lastModifiedDate">Last Modified</SelectItem>
                            
                            {/* Text Fields */}
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="company">Company</SelectItem>
                            <SelectItem value="description">Description</SelectItem>
                            <SelectItem value="source">Source</SelectItem>
                            
                            {/* Status/Category Fields */}
                            <SelectItem value="status">Status</SelectItem>
                            <SelectItem value="type">Type</SelectItem>
                            <SelectItem value="priority">Priority</SelectItem>
                            <SelectItem value="stage">Stage</SelectItem>
                            
                            {/* Numeric Fields */}
                            <SelectItem value="amount">Amount</SelectItem>
                            <SelectItem value="revenue">Revenue</SelectItem>
                            <SelectItem value="numberOfEmployees">Number of Employees</SelectItem>
                            
                            {/* Boolean Fields */}
                            <SelectItem value="isActive">Is Active</SelectItem>
                            <SelectItem value="isConverted">Is Converted</SelectItem>
                            <SelectItem value="hasOptedOut">Has Opted Out</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label className="text-xs text-gray-600">Operator</Label>
                        <Select
                          value={condition.operator}
                          onValueChange={(value) => updateCondition(index, 'operator', value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Show ALL operators regardless of field type */}
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="not_contains">Does Not Contain</SelectItem>
                            <SelectItem value="starts_with">Starts With</SelectItem>
                            <SelectItem value="ends_with">Ends With</SelectItem>
                            <SelectItem value="greater_than">Greater Than</SelectItem>
                            <SelectItem value="less_than">Less Than</SelectItem>
                            <SelectItem value="greater_than_or_equal">Greater Than or Equal</SelectItem>
                            <SelectItem value="less_than_or_equal">Less Than or Equal</SelectItem>
                            <SelectItem value="is_null">Is Null</SelectItem>
                            <SelectItem value="is_not_null">Is Not Null</SelectItem>
                            <SelectItem value="is_empty">Is Empty</SelectItem>
                            <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                            <SelectItem value="in">In List</SelectItem>
                            <SelectItem value="not_in">Not In List</SelectItem>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="this_week">This Week</SelectItem>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="last_n_days">Last N Days</SelectItem>
                            <SelectItem value="last_n_hours">Last N Hours</SelectItem>
                            <SelectItem value="equals_date">Equals Date</SelectItem>
                            <SelectItem value="greater_than_date">After Date</SelectItem>
                            <SelectItem value="less_than_date">Before Date</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Value Field with ResourcePickerField */}
                      {!['is_empty', 'is_not_empty', 'is_null', 'is_not_null', 'today', 'yesterday', 'this_week', 'this_month'].includes(condition.operator) && (
                        <div>
                          <Label className="text-xs text-gray-600">Value</Label>
                          <ResourcePickerField
                            value={condition.value}
                            onChange={(value) => updateCondition(index, 'value', value)}
                            placeholder="Type or select value..."
                            showCommonValues={true}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <strong>Example:</strong> If you select "Last 7 Days" for Created Date, 
                the flow will process {selectedObject} records created in the last 7 days.
              </p>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
          <div className="flex items-start gap-2">
            <RefreshCw className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-800 space-y-1">
              <p className="font-medium">How it works:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Save your schedule configuration first</li>
                <li>Then save and activate the flow</li>
                <li>The scheduler will automatically execute the flow at the specified time</li>
                <li>You can view execution logs in the Flow Details page</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t p-4 bg-gray-50">
        <div className="flex gap-3">
          <Button
            onClick={handleSaveSchedule}
            className="flex-1 bg-orange-600 hover:bg-orange-700"
            disabled={loading}
          >
            <Clock className="w-4 h-4 mr-2" />
            Save Schedule Configuration
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            className="px-6"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScheduledTriggerConfigPanel;
