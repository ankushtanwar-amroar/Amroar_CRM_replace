/**
 * Tenant Licenses Tab Component - Admin Portal
 * Manages tenant seat pools (NOT user assignments)
 * User license assignment is done in CRM, not Admin Portal
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import { Switch } from '../../../components/ui/switch';
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
import {
  Key,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Loader2,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Users,
  Package,
  Info
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const TenantLicensesTab = ({ tenantId, getAdminToken }) => {
  const [licenses, setLicenses] = useState([]);
  const [catalogLicenses, setCatalogLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    license_id: '',
    seats_purchased: 1,
    override_price: null,
    use_override: false
  });

  const headers = { Authorization: `Bearer ${getAdminToken()}` };

  const fetchLicenses = useCallback(async () => {
    try {
      setLoading(true);
      const [tenantLicRes, catalogRes] = await Promise.all([
        axios.get(`${API}/tenants/${tenantId}/licenses`, { headers }),
        axios.get(`${API}/license-catalog`, { headers, params: { active_only: true } })
      ]);
      setLicenses(tenantLicRes.data || []);
      setCatalogLicenses(catalogRes.data.licenses || []);
      setError(null);
    } catch (err) {
      setError('Failed to load licenses');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, getAdminToken]);

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  const handleAddLicense = async () => {
    try {
      setSaving(true);
      const data = {
        license_id: formData.license_id,
        seats_purchased: formData.seats_purchased,
        override_price: formData.use_override ? formData.override_price : null
      };
      await axios.post(`${API}/tenants/${tenantId}/licenses`, data, { headers });
      setShowAddDialog(false);
      resetForm();
      fetchLicenses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add license');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLicense = async () => {
    try {
      setSaving(true);
      const data = {
        seats_purchased: formData.seats_purchased,
        override_price: formData.use_override ? formData.override_price : null
      };
      await axios.patch(`${API}/tenants/${tenantId}/licenses/${selectedLicense.id}`, data, { headers });
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

  const handleRemoveLicense = async (license) => {
    if (license.seats_assigned > 0) {
      setError(`Cannot remove license - ${license.seats_assigned} seats are assigned to users`);
      return;
    }
    if (!window.confirm(`Remove "${license.license_name}" from this tenant?`)) return;

    try {
      await axios.delete(`${API}/tenants/${tenantId}/licenses/${license.id}`, { headers });
      fetchLicenses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove license');
    }
  };

  const openEditDialog = (license) => {
    setSelectedLicense(license);
    setFormData({
      license_id: license.license_id,
      seats_purchased: license.seats_purchased,
      override_price: license.override_price || license.default_price_snapshot,
      use_override: license.override_price != null
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      license_id: '',
      seats_purchased: 1,
      override_price: null,
      use_override: false
    });
  };

  // Get licenses not yet added to tenant
  const availableLicenses = catalogLicenses.filter(
    cl => !licenses.find(l => l.license_id === cl.id)
  );

  // Calculate totals
  const totalSeats = licenses.reduce((sum, l) => sum + l.seats_purchased, 0);
  const totalAssigned = licenses.reduce((sum, l) => sum + l.seats_assigned, 0);
  const monthlyTotal = licenses.reduce((sum, l) => sum + (l.final_price * l.seats_purchased), 0);

  return (
    <div className="space-y-6" data-testid="tenant-licenses-tab">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">License Types</p>
                <p className="text-2xl font-bold">{licenses.length}</p>
              </div>
              <Package className="h-8 w-8 text-indigo-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Seats</p>
                <p className="text-2xl font-bold">{totalSeats}</p>
              </div>
              <Key className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Seats Assigned</p>
                <p className="text-2xl font-bold">{totalAssigned}</p>
              </div>
              <Users className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Monthly Cost</p>
                <p className="text-2xl font-bold">${monthlyTotal.toFixed(2)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Note */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Seat Pool Management</p>
            <p className="text-sm text-blue-700 mt-1">
              This screen manages the tenant's seat pool. To assign licenses to individual users, 
              use the CRM User Management within the tenant's application.
            </p>
          </div>
        </div>
      </div>

      {/* Licenses Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              License Subscriptions
            </CardTitle>
            <CardDescription>
              Manage seat allocations and pricing for this tenant
            </CardDescription>
          </div>
          <Button
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={availableLicenses.length === 0}
            data-testid="add-license-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add License
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : licenses.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No licenses assigned to this tenant yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Price/Seat</TableHead>
                  <TableHead>Monthly Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((license) => (
                  <TableRow key={license.id} data-testid={`tenant-license-row-${license.license_code}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{license.license_name}</div>
                        <div className="text-xs text-slate-500">{license.license_code}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{license.seats_purchased}</span>
                        <span className="text-slate-400">seats</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="w-32">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{license.seats_assigned} used</span>
                          <span>{license.seats_available} free</span>
                        </div>
                        <Progress 
                          value={license.seats_purchased > 0 
                            ? (license.seats_assigned / license.seats_purchased) * 100 
                            : 0
                          } 
                          className="h-2"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {license.final_price.toFixed(2)}
                        {license.override_price != null && (
                          <Badge variant="outline" className="ml-1 text-xs">Override</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        ${(license.final_price * license.seats_purchased).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {license.status === 'active' ? (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="secondary">{license.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(license)}
                          data-testid={`edit-tenant-license-${license.license_code}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveLicense(license)}
                          className="text-red-600 hover:text-red-700"
                          disabled={license.seats_assigned > 0}
                          data-testid={`remove-tenant-license-${license.license_code}`}
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

      {/* Add License Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add License to Tenant</DialogTitle>
            <DialogDescription>
              Select a license type and configure the seat count
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>License Type *</Label>
              <Select
                value={formData.license_id}
                onValueChange={(v) => setFormData({ ...formData, license_id: v })}
              >
                <SelectTrigger data-testid="license-type-select">
                  <SelectValue placeholder="Select license..." />
                </SelectTrigger>
                <SelectContent>
                  {availableLicenses.map(license => (
                    <SelectItem key={license.id} value={license.id}>
                      {license.license_name} (${license.default_price}/seat)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Seats to Purchase *</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, seats_purchased: Math.max(1, prev.seats_purchased - 1) }))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min="1"
                  value={formData.seats_purchased}
                  onChange={(e) => setFormData({ ...formData, seats_purchased: parseInt(e.target.value) || 1 })}
                  className="w-20 text-center"
                  data-testid="seats-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, seats_purchased: prev.seats_purchased + 1 }))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Override Default Price</Label>
                <p className="text-xs text-slate-500">Set a custom price for this tenant</p>
              </div>
              <Switch
                checked={formData.use_override}
                onCheckedChange={(checked) => setFormData({ ...formData, use_override: checked })}
              />
            </div>

            {formData.use_override && (
              <div className="space-y-2">
                <Label>Price Per Seat</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.override_price || ''}
                    onChange={(e) => setFormData({ ...formData, override_price: parseFloat(e.target.value) || 0 })}
                    className="pl-9"
                    data-testid="override-price-input"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLicense}
              disabled={saving || !formData.license_id}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-add-license-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit License Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowEditDialog(false);
          setSelectedLicense(null);
          resetForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit License: {selectedLicense?.license_name}</DialogTitle>
            <DialogDescription>
              Update seat count or pricing. Cannot reduce below assigned seats ({selectedLicense?.seats_assigned || 0}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Seats Purchased *</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    seats_purchased: Math.max(selectedLicense?.seats_assigned || 1, prev.seats_purchased - 1) 
                  }))}
                  disabled={formData.seats_purchased <= (selectedLicense?.seats_assigned || 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={selectedLicense?.seats_assigned || 1}
                  value={formData.seats_purchased}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    seats_purchased: Math.max(selectedLicense?.seats_assigned || 1, parseInt(e.target.value) || 1) 
                  })}
                  className="w-20 text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, seats_purchased: prev.seats_purchased + 1 }))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedLicense?.seats_assigned > 0 && (
                <p className="text-xs text-amber-600">
                  Minimum seats: {selectedLicense.seats_assigned} (currently assigned)
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Override Default Price</Label>
                <p className="text-xs text-slate-500">
                  Default: ${selectedLicense?.default_price_snapshot?.toFixed(2) || '0.00'}
                </p>
              </div>
              <Switch
                checked={formData.use_override}
                onCheckedChange={(checked) => setFormData({ ...formData, use_override: checked })}
              />
            </div>

            {formData.use_override && (
              <div className="space-y-2">
                <Label>Price Per Seat</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.override_price || ''}
                    onChange={(e) => setFormData({ ...formData, override_price: parseFloat(e.target.value) || 0 })}
                    className="pl-9"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false);
              setSelectedLicense(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateLicense}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-edit-license-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Update License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantLicensesTab;
