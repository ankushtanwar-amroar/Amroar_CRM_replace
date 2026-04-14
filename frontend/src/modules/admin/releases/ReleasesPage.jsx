/**
 * Platform Releases Page - Admin Portal
 * Manages platform version releases
 * Control Plane: Manages release catalog and tenant version assignments
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
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
  Rocket,
  Plus,
  Pencil,
  Loader2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Tag,
  Users,
  ArrowUpCircle,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const RELEASE_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-slate-100 text-slate-700' },
  { value: 'qa', label: 'QA', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'approved', label: 'Approved', color: 'bg-green-100 text-green-700' },
  { value: 'deprecated', label: 'Deprecated', color: 'bg-red-100 text-red-700' }
];

const ReleasesPage = () => {
  const { getAdminToken } = useAdminAuth();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [formData, setFormData] = useState({
    version_number: '',
    release_name: '',
    status: 'draft',
    available_for_new_tenants: false,
    available_for_upgrade: false,
    release_notes: '',
    migration_script_ref: '',
    breaking_changes: false,
    rollback_supported: true,
    features_added: [],
    features_deprecated: [],
    min_upgrade_from_version: ''
  });

  const [newFeature, setNewFeature] = useState('');
  const [newDeprecated, setNewDeprecated] = useState('');

  const fetchReleases = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/releases`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        params: { include_deprecated: true }
      });
      setReleases(response.data.releases || []);
      setError(null);
    } catch (err) {
      setError('Failed to load releases');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getAdminToken]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const handleCreate = async () => {
    try {
      setSaving(true);
      await axios.post(`${API}/releases`, formData, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      setShowCreateDialog(false);
      resetForm();
      fetchReleases();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create release');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    try {
      setSaving(true);
      const updateData = { ...formData };
      delete updateData.version_number; // Can't update version number
      
      await axios.patch(`${API}/releases/${selectedRelease.id}`, updateData, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      setShowEditDialog(false);
      setSelectedRelease(null);
      resetForm();
      fetchReleases();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update release');
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDefault = async () => {
    try {
      setSeeding(true);
      await axios.post(`${API}/releases/seed-default`, {}, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      fetchReleases();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to seed default release');
    } finally {
      setSeeding(false);
    }
  };

  const openEditDialog = (release) => {
    setSelectedRelease(release);
    setFormData({
      version_number: release.version_number,
      release_name: release.release_name,
      status: release.status,
      available_for_new_tenants: release.available_for_new_tenants,
      available_for_upgrade: release.available_for_upgrade,
      release_notes: release.release_notes || '',
      migration_script_ref: release.migration_script_ref || '',
      breaking_changes: release.breaking_changes,
      rollback_supported: release.rollback_supported,
      features_added: release.features_added || [],
      features_deprecated: release.features_deprecated || [],
      min_upgrade_from_version: release.min_upgrade_from_version || ''
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      version_number: '',
      release_name: '',
      status: 'draft',
      available_for_new_tenants: false,
      available_for_upgrade: false,
      release_notes: '',
      migration_script_ref: '',
      breaking_changes: false,
      rollback_supported: true,
      features_added: [],
      features_deprecated: [],
      min_upgrade_from_version: ''
    });
    setNewFeature('');
    setNewDeprecated('');
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData(prev => ({
        ...prev,
        features_added: [...(prev.features_added || []), newFeature.trim()]
      }));
      setNewFeature('');
    }
  };

  const removeFeature = (index) => {
    setFormData(prev => ({
      ...prev,
      features_added: prev.features_added.filter((_, i) => i !== index)
    }));
  };

  const addDeprecated = () => {
    if (newDeprecated.trim()) {
      setFormData(prev => ({
        ...prev,
        features_deprecated: [...(prev.features_deprecated || []), newDeprecated.trim()]
      }));
      setNewDeprecated('');
    }
  };

  const removeDeprecated = (index) => {
    setFormData(prev => ({
      ...prev,
      features_deprecated: prev.features_deprecated.filter((_, i) => i !== index)
    }));
  };

  const getStatusBadge = (status) => {
    const statusConfig = RELEASE_STATUSES.find(s => s.value === status);
    return (
      <Badge className={statusConfig?.color || 'bg-slate-100 text-slate-700'}>
        {statusConfig?.label || status}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6" data-testid="releases-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Rocket className="h-6 w-6 text-indigo-600" />
            Platform Releases
          </h1>
          <p className="text-slate-500 mt-1">
            Manage platform versions and control tenant upgrades
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSeedDefault}
            disabled={seeding}
            data-testid="seed-default-btn"
          >
            {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Seed Default
          </Button>
          <Button
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
            className="bg-indigo-600 hover:bg-indigo-700"
            data-testid="create-release-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Release
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Releases Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Release Catalog ({releases.length})
          </CardTitle>
          <CardDescription>
            Only one release can be marked "Available for New Tenants" at a time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : releases.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No releases found. Click "Seed Default" to create initial release.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Release Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Tenants</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release) => (
                  <TableRow key={release.id} data-testid={`release-row-${release.version_number}`}>
                    <TableCell>
                      <div className="font-mono font-medium">{release.version_number}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{release.release_name}</div>
                    </TableCell>
                    <TableCell>{getStatusBadge(release.status)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {release.available_for_new_tenants && (
                          <Badge className="bg-blue-100 text-blue-700 w-fit">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            New Tenants
                          </Badge>
                        )}
                        {release.available_for_upgrade && (
                          <Badge className="bg-purple-100 text-purple-700 w-fit">
                            <ArrowUpCircle className="h-3 w-3 mr-1" />
                            Upgrades
                          </Badge>
                        )}
                        {!release.available_for_new_tenants && !release.available_for_upgrade && (
                          <span className="text-slate-400 text-sm">Not available</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-slate-400" />
                        <span>{release.tenant_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {release.breaking_changes && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Breaking
                          </Badge>
                        )}
                        {release.rollback_supported && (
                          <Badge variant="outline" className="text-xs">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Rollback
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(release)}
                        data-testid={`edit-release-${release.version_number}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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
          setSelectedRelease(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{showEditDialog ? 'Edit Release' : 'Create New Release'}</DialogTitle>
            <DialogDescription>
              {showEditDialog ? 'Update release configuration' : 'Define a new platform release'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Version Number *</Label>
                <Input
                  value={formData.version_number}
                  onChange={(e) => setFormData({ ...formData, version_number: e.target.value })}
                  placeholder="v2.0.0"
                  disabled={showEditDialog}
                  data-testid="version-number-input"
                />
                <p className="text-xs text-slate-500">Use semantic versioning (e.g., v1.0.0)</p>
              </div>
              <div className="space-y-2">
                <Label>Release Name *</Label>
                <Input
                  value={formData.release_name}
                  onChange={(e) => setFormData({ ...formData, release_name: e.target.value })}
                  placeholder="Q1 2026 Release"
                  data-testid="release-name-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELEASE_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Minimum Upgrade From Version</Label>
                <Input
                  value={formData.min_upgrade_from_version}
                  onChange={(e) => setFormData({ ...formData, min_upgrade_from_version: e.target.value })}
                  placeholder="v1.0.0"
                />
                <p className="text-xs text-slate-500">Tenants must be on this version or higher to upgrade</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Release Notes</Label>
              <Textarea
                value={formData.release_notes}
                onChange={(e) => setFormData({ ...formData, release_notes: e.target.value })}
                placeholder="Describe what's new in this release..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Migration Script Reference</Label>
              <Input
                value={formData.migration_script_ref}
                onChange={(e) => setFormData({ ...formData, migration_script_ref: e.target.value })}
                placeholder="migrations/v2.0.0.py"
              />
            </div>

            {/* Features Added */}
            <div className="space-y-2">
              <Label>Features Added</Label>
              <div className="flex gap-2">
                <Input
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  placeholder="New feature name..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                />
                <Button type="button" variant="outline" onClick={addFeature}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.features_added?.map((feature, index) => (
                  <Badge key={index} variant="secondary" className="cursor-pointer" onClick={() => removeFeature(index)}>
                    {feature} ×
                  </Badge>
                ))}
              </div>
            </div>

            {/* Features Deprecated */}
            <div className="space-y-2">
              <Label>Features Deprecated</Label>
              <div className="flex gap-2">
                <Input
                  value={newDeprecated}
                  onChange={(e) => setNewDeprecated(e.target.value)}
                  placeholder="Deprecated feature name..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDeprecated())}
                />
                <Button type="button" variant="outline" onClick={addDeprecated}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.features_deprecated?.map((feature, index) => (
                  <Badge key={index} variant="destructive" className="cursor-pointer" onClick={() => removeDeprecated(index)}>
                    {feature} ×
                  </Badge>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div>
                  <Label>Available for New Tenants</Label>
                  <p className="text-xs text-slate-500">Default version for newly created tenants</p>
                </div>
                <Switch
                  checked={formData.available_for_new_tenants}
                  onCheckedChange={(checked) => setFormData({ ...formData, available_for_new_tenants: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div>
                  <Label>Available for Upgrade</Label>
                  <p className="text-xs text-slate-500">Existing tenants can upgrade to this version</p>
                </div>
                <Switch
                  checked={formData.available_for_upgrade}
                  onCheckedChange={(checked) => setFormData({ ...formData, available_for_upgrade: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div>
                  <Label>Breaking Changes</Label>
                  <p className="text-xs text-slate-500">Release contains breaking changes</p>
                </div>
                <Switch
                  checked={formData.breaking_changes}
                  onCheckedChange={(checked) => setFormData({ ...formData, breaking_changes: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Rollback Supported</Label>
                  <p className="text-xs text-slate-500">Tenants can rollback from this version</p>
                </div>
                <Switch
                  checked={formData.rollback_supported}
                  onCheckedChange={(checked) => setFormData({ ...formData, rollback_supported: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setSelectedRelease(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={showEditDialog ? handleUpdate : handleCreate}
              disabled={saving || !formData.version_number || !formData.release_name}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-release-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {showEditDialog ? 'Update Release' : 'Create Release'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReleasesPage;
