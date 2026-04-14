/**
 * License Catalog Page - Admin Portal
 * Manages global license definitions for the platform
 * Control Plane: Does NOT assign licenses to users
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Switch } from '../../../components/ui/switch';
import {
  Key,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  DollarSign,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Package
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

// Module key options - must match CRM module registry
const MODULE_KEYS = [
  { value: 'crm', label: 'CRM Core' },
  { value: 'task_manager', label: 'Task Manager' },
  { value: 'schema_builder', label: 'Schema Builder' },
  { value: 'import_builder', label: 'Import Builder' },
  { value: 'export_builder', label: 'Export Builder' },
  { value: 'form_builder', label: 'Form Builder' },
  { value: 'flow_builder', label: 'Flow Builder' },
  { value: 'survey_builder', label: 'Survey Builder' },
  { value: 'chatbot_manager', label: 'Chatbot Manager' },
  { value: 'docflow', label: 'DocFlow' },
  { value: 'file_manager', label: 'File Manager' },
  { value: 'app_manager', label: 'App Manager' }
];

const ASSIGNMENT_TYPES = [
  { value: 'per_user', label: 'Per User' },
  { value: 'per_tenant', label: 'Per Tenant' },
  { value: 'usage_based', label: 'Usage Based' }
];

const BILLING_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One Time' }
];

const VISIBILITY_MODES = [
  { value: 'hide', label: 'Hide Module' },
  { value: 'show_locked', label: 'Show Locked' }
];

const LicenseCatalogPage = () => {
  const { getAdminToken } = useAdminAuth();
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [formData, setFormData] = useState({
    license_code: '',
    license_name: '',
    module_key: '',
    description: '',
    assignment_type: 'per_user',
    default_price: 0,
    currency: 'USD',
    billing_frequency: 'monthly',
    trial_allowed: false,
    trial_days: 14,
    default_visibility_mode: 'hide',
    sort_order: 0,
    dependencies: [],
    is_active: true,
    is_base_license: false
  });

  const fetchLicenses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/license-catalog`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        params: { search: searchQuery || undefined }
      });
      setLicenses(response.data.licenses || []);
      setError(null);
    } catch (err) {
      setError('Failed to load licenses');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getAdminToken, searchQuery]);

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  const handleCreate = async () => {
    try {
      setSaving(true);
      await axios.post(`${API}/license-catalog`, formData, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      setShowCreateDialog(false);
      resetForm();
      fetchLicenses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create license');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    try {
      setSaving(true);
      const updateData = { ...formData };
      delete updateData.license_code; // Can't update code
      delete updateData.module_key; // Can't update module key
      
      await axios.patch(`${API}/license-catalog/${selectedLicense.id}`, updateData, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      setShowEditDialog(false);
      setSelectedLicense(null);
      resetForm();
      fetchLicenses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update license');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (license) => {
    if (!window.confirm(`Deactivate license "${license.license_name}"?`)) return;
    
    try {
      await axios.delete(`${API}/license-catalog/${license.id}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      fetchLicenses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to deactivate license');
    }
  };

  const handleSeedDefaults = async () => {
    try {
      setSeeding(true);
      await axios.post(`${API}/license-catalog/seed-defaults`, {}, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      fetchLicenses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to seed defaults');
    } finally {
      setSeeding(false);
    }
  };

  const openEditDialog = (license) => {
    setSelectedLicense(license);
    setFormData({
      license_code: license.license_code,
      license_name: license.license_name,
      module_key: license.module_key,
      description: license.description || '',
      assignment_type: license.assignment_type,
      default_price: license.default_price,
      currency: license.currency,
      billing_frequency: license.billing_frequency,
      trial_allowed: license.trial_allowed,
      trial_days: license.trial_days,
      default_visibility_mode: license.default_visibility_mode,
      sort_order: license.sort_order,
      dependencies: license.dependencies || [],
      is_active: license.is_active,
      is_base_license: license.is_base_license
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      license_code: '',
      license_name: '',
      module_key: '',
      description: '',
      assignment_type: 'per_user',
      default_price: 0,
      currency: 'USD',
      billing_frequency: 'monthly',
      trial_allowed: false,
      trial_days: 14,
      default_visibility_mode: 'hide',
      sort_order: 0,
      dependencies: [],
      is_active: true,
      is_base_license: false
    });
  };

  const handleDependencyToggle = (licenseCode) => {
    setFormData(prev => {
      const deps = prev.dependencies || [];
      if (deps.includes(licenseCode)) {
        return { ...prev, dependencies: deps.filter(d => d !== licenseCode) };
      } else {
        return { ...prev, dependencies: [...deps, licenseCode] };
      }
    });
  };

  return (
    <div className="p-6 space-y-6" data-testid="license-catalog-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Key className="h-6 w-6 text-indigo-600" />
            License Catalog
          </h1>
          <p className="text-slate-500 mt-1">
            Manage global license definitions. Module keys must match CRM registry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSeedDefaults}
            disabled={seeding}
            data-testid="seed-defaults-btn"
          >
            {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Seed Defaults
          </Button>
          <Button
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
            className="bg-indigo-600 hover:bg-indigo-700"
            data-testid="create-license-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create License
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search licenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="search-licenses-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* License Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Available Licenses ({licenses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : licenses.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No licenses found. Click "Seed Defaults" to create default licenses.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License</TableHead>
                  <TableHead>Module Key</TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Dependencies</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((license) => (
                  <TableRow key={license.id} data-testid={`license-row-${license.license_code}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{license.license_name}</div>
                        <div className="text-xs text-slate-500">{license.license_code}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{license.module_key}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{license.assignment_type.replace('_', ' ')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {license.default_price}/{license.billing_frequency === 'monthly' ? 'mo' : license.billing_frequency === 'yearly' ? 'yr' : 'once'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {license.dependencies?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {license.dependencies.map(dep => (
                            <Badge key={dep} variant="secondary" className="text-xs">{dep}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {license.is_active ? (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(license)}
                          data-testid={`edit-license-${license.license_code}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(license)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`delete-license-${license.license_code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setSelectedLicense(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{showEditDialog ? 'Edit License' : 'Create New License'}</DialogTitle>
            <DialogDescription>
              {showEditDialog ? 'Update license configuration' : 'Define a new license type for the platform'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>License Code *</Label>
                <Input
                  value={formData.license_code}
                  onChange={(e) => setFormData({ ...formData, license_code: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                  placeholder="CRM_CORE_SEAT"
                  disabled={showEditDialog}
                  data-testid="license-code-input"
                />
              </div>
              <div className="space-y-2">
                <Label>License Name *</Label>
                <Input
                  value={formData.license_name}
                  onChange={(e) => setFormData({ ...formData, license_name: e.target.value })}
                  placeholder="CRM Core Seat"
                  data-testid="license-name-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Module Key *</Label>
                <Select
                  value={formData.module_key}
                  onValueChange={(v) => setFormData({ ...formData, module_key: v })}
                  disabled={showEditDialog}
                >
                  <SelectTrigger data-testid="module-key-select">
                    <SelectValue placeholder="Select module..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULE_KEYS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignment Type</Label>
                <Select
                  value={formData.assignment_type}
                  onValueChange={(v) => setFormData({ ...formData, assignment_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="License description..."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Default Price</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.default_price}
                    onChange={(e) => setFormData({ ...formData, default_price: parseFloat(e.target.value) || 0 })}
                    className="pl-9"
                    data-testid="default-price-input"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData({ ...formData, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Billing Frequency</Label>
                <Select
                  value={formData.billing_frequency}
                  onValueChange={(v) => setFormData({ ...formData, billing_frequency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_FREQUENCIES.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Visibility Mode</Label>
                <Select
                  value={formData.default_visibility_mode}
                  onValueChange={(v) => setFormData({ ...formData, default_visibility_mode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITY_MODES.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trial Allowed</Label>
                  <p className="text-xs text-slate-500">Allow trial period for this license</p>
                </div>
                <Switch
                  checked={formData.trial_allowed}
                  onCheckedChange={(checked) => setFormData({ ...formData, trial_allowed: checked })}
                />
              </div>
              {formData.trial_allowed && (
                <div className="space-y-2">
                  <Label>Trial Days</Label>
                  <Input
                    type="number"
                    min="1"
                    max="90"
                    value={formData.trial_days}
                    onChange={(e) => setFormData({ ...formData, trial_days: parseInt(e.target.value) || 14 })}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Base License</Label>
                <p className="text-xs text-slate-500">Required by most other modules</p>
              </div>
              <Switch
                checked={formData.is_base_license}
                onCheckedChange={(checked) => setFormData({ ...formData, is_base_license: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-slate-500">License available for assignment</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>

            {/* Dependencies */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Dependencies
              </Label>
              <p className="text-xs text-slate-500">Select licenses that must be assigned before this one</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {licenses.filter(l => l.license_code !== formData.license_code).map(license => (
                  <Badge
                    key={license.license_code}
                    variant={formData.dependencies?.includes(license.license_code) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => handleDependencyToggle(license.license_code)}
                  >
                    {formData.dependencies?.includes(license.license_code) && (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    )}
                    {license.license_code}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setSelectedLicense(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={showEditDialog ? handleUpdate : handleCreate}
              disabled={saving || !formData.license_code || !formData.license_name || !formData.module_key}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-license-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {showEditDialog ? 'Update License' : 'Create License'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LicenseCatalogPage;
