/**
 * Audit Settings Modal
 * 
 * Configuration modal for per-object audit trail settings.
 * Includes tracking policy, retention, and source toggles.
 */
import React, { useState, useEffect } from 'react';
import { Settings, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { getAuditConfig, saveAuditConfig, getAuditSources } from '../services/auditService';

const AuditSettingsModal = ({ 
  isOpen, 
  onClose, 
  objectName,
  objectFields = [],
  onConfigSaved 
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [sources, setSources] = useState([]);
  
  const [config, setConfig] = useState({
    target_object: objectName,
    tracking_mode: 'ALL_FIELDS',
    tracked_fields: [],
    noise_fields: [],
    retention_days: 365,
    enabled_sources: ['UI', 'API', 'FLOW', 'IMPORT', 'INTEGRATION'],
    log_create: true,
    log_update: true,
    log_delete: true,
    log_merge: true,
    log_import: true,
    is_enabled: true
  });
  
  useEffect(() => {
    if (isOpen && objectName) {
      loadConfig();
      loadSources();
    }
  }, [isOpen, objectName]);
  
  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const existingConfig = await getAuditConfig(objectName, true);
      if (existingConfig) {
        setConfig(existingConfig);
      }
    } catch (err) {
      console.error('Failed to load audit config:', err);
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };
  
  const loadSources = async () => {
    try {
      const data = await getAuditSources();
      setSources(data.sources || []);
    } catch (err) {
      console.error('Failed to load audit sources:', err);
    }
  };
  
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveAuditConfig(objectName, config);
      if (onConfigSaved) {
        onConfigSaved(config);
      }
      onClose();
    } catch (err) {
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };
  
  const toggleSource = (sourceId) => {
    const currentSources = config.enabled_sources || [];
    const newSources = currentSources.includes(sourceId)
      ? currentSources.filter(s => s !== sourceId)
      : [...currentSources, sourceId];
    setConfig({ ...config, enabled_sources: newSources });
  };
  
  const toggleTrackedField = (fieldKey) => {
    const currentFields = config.tracked_fields || [];
    const newFields = currentFields.includes(fieldKey)
      ? currentFields.filter(f => f !== fieldKey)
      : [...currentFields, fieldKey];
    setConfig({ ...config, tracked_fields: newFields });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-slate-500" />
            Audit Trail Settings for {objectName?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Enable Audit Trail</Label>
                <p className="text-sm text-slate-500 mt-0.5">
                  Track changes made to {objectName} records
                </p>
              </div>
              <Switch
                checked={config.is_enabled}
                onCheckedChange={(checked) => setConfig({ ...config, is_enabled: checked })}
                data-testid="audit-enabled-toggle"
              />
            </div>
            
            {config.is_enabled && (
              <>
                {/* Tracking Policy */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700">Tracking Policy</Label>
                  <Select 
                    value={config.tracking_mode} 
                    onValueChange={(val) => setConfig({ ...config, tracking_mode: val })}
                  >
                    <SelectTrigger data-testid="tracking-mode-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL_FIELDS">Track All Fields</SelectItem>
                      <SelectItem value="SELECTED_FIELDS">Track Selected Fields Only</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {config.tracking_mode === 'SELECTED_FIELDS' && objectFields.length > 0 && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                      <Label className="text-xs font-medium text-slate-500 uppercase mb-2 block">
                        Select Fields to Track
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {objectFields.map(field => (
                          <button
                            key={field.key}
                            onClick={() => toggleTrackedField(field.key)}
                            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                              (config.tracked_fields || []).includes(field.key)
                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {field.label || field.key}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Retention Policy */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700">Retention Policy</Label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">Keep audit logs for</span>
                    <Input
                      type="number"
                      value={config.retention_days}
                      onChange={(e) => setConfig({ ...config, retention_days: parseInt(e.target.value) || 365 })}
                      className="w-24"
                      min={1}
                      max={3650}
                      data-testid="retention-days-input"
                    />
                    <span className="text-sm text-slate-600">days</span>
                  </div>
                </div>
                
                {/* Log Settings */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700">Log Settings</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'log_create', label: 'Log Creates' },
                      { key: 'log_update', label: 'Log Updates' },
                      { key: 'log_delete', label: 'Log Deletes' },
                      { key: 'log_merge', label: 'Log Merges' },
                    ].map(item => (
                      <div key={item.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <Label className="text-sm">{item.label}</Label>
                        <Switch
                          checked={config[item.key]}
                          onCheckedChange={(checked) => setConfig({ ...config, [item.key]: checked })}
                          data-testid={`${item.key}-toggle`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Sources to Record */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700">Sources to Record</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {sources.map(source => (
                      <button
                        key={source.id}
                        onClick={() => toggleSource(source.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                          (config.enabled_sources || []).includes(source.id)
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                        data-testid={`source-toggle-${source.id}`}
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                          (config.enabled_sources || []).includes(source.id)
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-200'
                        }`}>
                          {(config.enabled_sources || []).includes(source.id) && (
                            <Check className="h-3 w-3" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{source.name}</div>
                          <div className="text-xs text-slate-500">{source.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AuditSettingsModal;
