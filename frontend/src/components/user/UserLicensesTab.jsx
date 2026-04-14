/**
 * UserLicensesTab - CRM User License Management Tab
 * Manages license assignments for individual users
 * Shows tenant license pool with seat availability
 * Allows admins to assign/unassign licenses
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Key,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Package,
  Lock,
  Info,
  ArrowRight
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL;

const UserLicensesTab = ({ userId, userName, canManage = false }) => {
  const [userLicenses, setUserLicenses] = useState([]);
  const [availableLicenses, setAvailableLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [revokingLicense, setRevokingLicense] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  const fetchLicenseData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [userLicRes, availableRes] = await Promise.all([
        axios.get(`${API}/api/user-licenses/user/${userId}`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/user-licenses/available`, { headers: getAuthHeader() })
      ]);
      
      setUserLicenses(userLicRes.data || []);
      setAvailableLicenses(availableRes.data || []);
    } catch (err) {
      console.error('Error fetching license data:', err);
      setError(err.response?.data?.detail || 'Failed to load license information');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchLicenseData();
  }, [fetchLicenseData]);

  const handleAssignLicense = async () => {
    if (!selectedLicense) return;
    
    setAssigning(true);
    try {
      await axios.post(
        `${API}/api/user-licenses/user/${userId}/assign?license_id=${selectedLicense.license_id}`,
        {},
        { headers: getAuthHeader() }
      );
      toast.success(`${selectedLicense.license_name} assigned successfully`);
      setShowAssignDialog(false);
      setSelectedLicense(null);
      fetchLicenseData();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to assign license';
      toast.error(errorMsg);
      setError(errorMsg);
    } finally {
      setAssigning(false);
    }
  };

  const handleRevokeLicense = async () => {
    if (!revokingLicense) return;
    
    try {
      await axios.delete(
        `${API}/api/user-licenses/user/${userId}/revoke/${revokingLicense.id}`,
        { headers: getAuthHeader() }
      );
      toast.success(`${revokingLicense.license_name} revoked`);
      setRevokingLicense(null);
      fetchLicenseData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to revoke license');
    }
  };

  const openAssignDialog = (license) => {
    setSelectedLicense(license);
    setShowAssignDialog(true);
  };

  // Get licenses available for assignment (not already assigned to user and has seats)
  const getAssignableLicenses = () => {
    const userLicenseIds = new Set(userLicenses.map(l => l.license_id));
    return availableLicenses.filter(l => 
      !userLicenseIds.has(l.license_id) && l.seats_available > 0
    );
  };

  // Get licenses that user could have but no seats available
  const getUnavailableLicenses = () => {
    const userLicenseIds = new Set(userLicenses.map(l => l.license_id));
    return availableLicenses.filter(l => 
      !userLicenseIds.has(l.license_id) && l.seats_available <= 0
    );
  };

  // Check if a license has dependency issues
  const checkDependencyIssues = (license) => {
    if (!license.dependencies || license.dependencies.length === 0) return null;
    
    const userLicenseCodes = new Set(userLicenses.map(l => l.license_code));
    const missingDeps = license.dependencies.filter(dep => !userLicenseCodes.has(dep));
    
    if (missingDeps.length > 0) {
      return missingDeps;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="user-licenses-tab">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Info Note */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">License-Based Feature Access</p>
            <p className="text-sm text-blue-700 mt-1">
              Licenses control access to specific features. Users must have the appropriate license 
              assigned from the tenant's seat pool to access licensed features.
            </p>
          </div>
        </div>
      </div>

      {/* Current User Licenses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="h-5 w-5 text-indigo-500" />
                Assigned Licenses ({userLicenses.length})
              </CardTitle>
              <CardDescription>
                Licenses currently assigned to {userName}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {userLicenses.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Key className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="font-medium">No licenses assigned</p>
              <p className="text-sm mt-1">This user doesn't have any licenses yet.</p>
              {canManage && getAssignableLicenses().length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setShowAssignDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Assign First License
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {userLicenses.map((license) => (
                <div 
                  key={license.id} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  data-testid={`user-license-${license.license_code}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Key className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{license.license_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {license.license_code}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          Assigned {new Date(license.assigned_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-green-100 text-green-700">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setRevokingLicense(license)}
                        data-testid={`revoke-license-${license.license_code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Licenses from Tenant Pool */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-500" />
                Available from Tenant Pool
              </CardTitle>
              <CardDescription>
                Licenses available for assignment from the organization's seat pool
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {getAssignableLicenses().length === 0 && getUnavailableLicenses().length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Package className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p>No additional licenses available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Assignable licenses */}
              {getAssignableLicenses().map((license) => {
                const depIssues = checkDependencyIssues(license);
                return (
                  <div 
                    key={license.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                    data-testid={`available-license-${license.license_code}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Package className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{license.license_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {license.license_code}
                          </Badge>
                        </div>
                        {depIssues && (
                          <div className="flex items-center gap-1 mt-2 text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-xs">
                              Requires: {depIssues.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {license.seats_available} / {license.seats_purchased}
                        </div>
                        <div className="text-xs text-slate-500">seats available</div>
                        <Progress 
                          value={(license.seats_assigned / license.seats_purchased) * 100}
                          className="h-1.5 w-24 mt-1"
                        />
                      </div>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignDialog(license)}
                          disabled={!!depIssues}
                          className={depIssues ? 'opacity-50' : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'}
                          data-testid={`assign-license-${license.license_code}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Assign
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Unavailable licenses (no seats) */}
              {getUnavailableLicenses().map((license) => (
                <div 
                  key={license.id} 
                  className="flex items-center justify-between p-4 border rounded-lg bg-slate-50 opacity-75"
                  data-testid={`unavailable-license-${license.license_code}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-600">{license.license_name}</p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {license.license_code}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <Badge variant="destructive" className="text-xs">
                        No seats available
                      </Badge>
                      <div className="text-xs text-slate-500 mt-1">
                        {license.seats_assigned} / {license.seats_purchased} used
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign License Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={(open) => {
        if (!open) {
          setShowAssignDialog(false);
          setSelectedLicense(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign License</DialogTitle>
            <DialogDescription>
              Assign a license to {userName}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLicense ? (
            <div className="py-4 space-y-4">
              <div className="p-4 bg-indigo-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Key className="h-8 w-8 text-indigo-600" />
                  <div>
                    <p className="font-medium text-indigo-900">{selectedLicense.license_name}</p>
                    <p className="text-sm text-indigo-700">{selectedLicense.license_code}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Seats Available</span>
                <span className="font-medium">
                  {selectedLicense.seats_available} of {selectedLicense.seats_purchased}
                </span>
              </div>
              
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    This will consume one seat from the organization's license pool.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-slate-500">Select a license from the available pool:</p>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {getAssignableLicenses().map((license) => (
                  <button
                    key={license.id}
                    onClick={() => setSelectedLicense(license)}
                    className="w-full p-3 text-left border rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-indigo-500" />
                        <span className="font-medium">{license.license_name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {license.seats_available} available
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAssignDialog(false);
              setSelectedLicense(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignLicense}
              disabled={!selectedLicense || assigning}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="confirm-assign-license-btn"
            >
              {assigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Assign License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke License Confirmation */}
      <AlertDialog open={!!revokingLicense} onOpenChange={() => setRevokingLicense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke License</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the "{revokingLicense?.license_name}" license from {userName}?
              This will free up a seat in the organization's license pool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRevokeLicense}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-revoke-license-btn"
            >
              Revoke License
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserLicensesTab;
