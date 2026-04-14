import React, { useState } from 'react';
import { Plus, X, Zap } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const TriggerConfigPanel = ({ triggers, onUpdate, onClose }) => {
  const [localTriggers, setLocalTriggers] = useState(triggers || []);

  const addTrigger = () => {
    const newTrigger = {
      id: `trigger_${Date.now()}`,
      type: 'db',
      match_mode: 'every_time',  // Default match mode
      config: {
        entity: 'Lead',
        event: 'afterInsert',
        filter_conditions: {}
      }
    };
    setLocalTriggers([...localTriggers, newTrigger]);
  };

  const removeTrigger = (triggerId) => {
    setLocalTriggers(localTriggers.filter(t => t.id !== triggerId));
  };

  const updateTrigger = (triggerId, updates) => {
    setLocalTriggers(localTriggers.map(t => 
      t.id === triggerId ? { ...t, ...updates } : t
    ));
  };

  const updateTriggerConfig = (triggerId, configUpdates) => {
    setLocalTriggers(localTriggers.map(t => 
      t.id === triggerId ? { ...t, config: { ...t.config, ...configUpdates } } : t
    ));
  };

  const addFilterCondition = (triggerId) => {
    const trigger = localTriggers.find(t => t.id === triggerId);
    const newConditions = { ...trigger.config.filter_conditions, '': '' };
    updateTriggerConfig(triggerId, { filter_conditions: newConditions });
  };

  const updateFilterCondition = (triggerId, oldKey, newKey, value) => {
    const trigger = localTriggers.find(t => t.id === triggerId);
    const conditions = { ...trigger.config.filter_conditions };
    
    if (oldKey !== newKey) {
      delete conditions[oldKey];
    }
    conditions[newKey] = value;
    
    updateTriggerConfig(triggerId, { filter_conditions: conditions });
  };

  const removeFilterCondition = (triggerId, key) => {
    const trigger = localTriggers.find(t => t.id === triggerId);
    const conditions = { ...trigger.config.filter_conditions };
    delete conditions[key];
    updateTriggerConfig(triggerId, { filter_conditions: conditions });
  };

  const handleSave = () => {
    onUpdate(localTriggers);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-indigo-600" />
            <h2 className="text-xl font-semibold text-slate-900">Configure Triggers</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {localTriggers.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No triggers configured</p>
              <p className="text-sm text-slate-500 mb-6">
                Add a trigger to automatically run this flow when events occur
              </p>
              <Button onClick={addTrigger} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="h-4 w-4 mr-2" />
                Add First Trigger
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {localTriggers.map((trigger, index) => (
                <div key={trigger.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-slate-900">Trigger {index + 1}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTrigger(trigger.id)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {/* Trigger Type */}
                    <div>
                      <Label>Trigger Type</Label>
                      <Select
                        value={trigger.type}
                        onValueChange={(value) => updateTrigger(trigger.id, { type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="db">Database Event</SelectItem>
                          <SelectItem value="webhook">Webhook</SelectItem>
                          <SelectItem value="schedule">Schedule</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* DB Trigger Config */}
                    {trigger.type === 'db' && (
                      <>
                        <div>
                          <Label>Entity (Object)</Label>
                          <Select
                            value={trigger.config.entity}
                            onValueChange={(value) => updateTriggerConfig(trigger.id, { entity: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Lead">Lead</SelectItem>
                              <SelectItem value="Contact">Contact</SelectItem>
                              <SelectItem value="Account">Account</SelectItem>
                              <SelectItem value="Task">Task</SelectItem>
                              <SelectItem value="Event">Event</SelectItem>
                              <SelectItem value="Opportunity">Opportunity</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Event</Label>
                          <Select
                            value={trigger.config.event}
                            onValueChange={(value) => updateTriggerConfig(trigger.id, { event: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="afterInsert">After Create (Insert)</SelectItem>
                              <SelectItem value="afterUpdate">After Update</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Trigger Match Mode */}
                        <div>
                          <Label className="mb-2 block">Trigger Match Mode</Label>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`match_mode_${trigger.id}`}
                                value="every_time"
                                checked={(trigger.match_mode || 'every_time') === 'every_time'}
                                onChange={(e) => updateTrigger(trigger.id, { match_mode: e.target.value })}
                                className="w-4 h-4 text-indigo-600"
                              />
                              <span className="text-sm text-slate-700">
                                <strong>Every Time</strong> Criteria Matches
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`match_mode_${trigger.id}`}
                                value="first_time_only"
                                checked={(trigger.match_mode || 'every_time') === 'first_time_only'}
                                onChange={(e) => updateTrigger(trigger.id, { match_mode: e.target.value })}
                                className="w-4 h-4 text-indigo-600"
                              />
                              <span className="text-sm text-slate-700">
                                <strong>Only the First Time</strong> Criteria Matches
                              </span>
                            </label>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            {(trigger.match_mode || 'every_time') === 'every_time' 
                              ? '✅ Flow will execute every time a record meets the criteria.'
                              : '⚠️ Flow will execute only once per record, even if criteria matches again.'}
                          </p>
                        </div>

                        {/* Filter Conditions */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>Filter Conditions (Optional)</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addFilterCondition(trigger.id)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Condition
                            </Button>
                          </div>
                          {Object.keys(trigger.config.filter_conditions || {}).length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No conditions - trigger will run for all {trigger.config.entity} records
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(trigger.config.filter_conditions || {}).map(([key, value]) => (
                                <div key={key} className="flex gap-2">
                                  <Input
                                    placeholder="Field name (e.g., source)"
                                    value={key}
                                    onChange={(e) => updateFilterCondition(trigger.id, key, e.target.value, value)}
                                    className="flex-1"
                                  />
                                  <Input
                                    placeholder="Value (e.g., Website)"
                                    value={value}
                                    onChange={(e) => updateFilterCondition(trigger.id, key, key, e.target.value)}
                                    className="flex-1"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeFilterCondition(trigger.id, key)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-slate-500 mt-2">
                            Example: source = Website (only triggers when source field equals "Website")
                          </p>
                        </div>
                      </>
                    )}

                    {/* Webhook Config */}
                    {trigger.type === 'webhook' && (
                      <div>
                        <Label>Webhook Slug</Label>
                        <Input
                          value={trigger.config.slug || ''}
                          onChange={(e) => updateTriggerConfig(trigger.id, { slug: e.target.value })}
                          placeholder="my-webhook"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Webhook URL: /api/flow-builder/hooks/{trigger.config.slug || 'your-slug'}
                        </p>
                      </div>
                    )}

                    {/* Schedule Config */}
                    {trigger.type === 'schedule' && (
                      <div>
                        <Label>Cron Expression</Label>
                        <Input
                          value={trigger.config.cron || ''}
                          onChange={(e) => updateTriggerConfig(trigger.id, { cron: e.target.value })}
                          placeholder="0 9 * * * (Daily at 9 AM)"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Examples: "0 9 * * *" (daily 9am), "0 */6 * * *" (every 6 hours)
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                onClick={addTrigger}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Trigger
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-slate-50">
          <div className="text-sm text-slate-600">
            {localTriggers.length} trigger{localTriggers.length !== 1 ? 's' : ''} configured
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">
              Save Triggers
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TriggerConfigPanel;
