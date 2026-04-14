/**
 * Tenant Version Control Tab Component - Admin Portal
 * Manages tenant platform version and upgrades
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
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
import { Alert, AlertDescription } from '../../../components/ui/alert';
import {
  Rocket,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowUpCircle,
  Calendar,
  User,
  AlertTriangle,
  RotateCcw,
  Play,
  Info
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const TenantVersionTab = ({ tenantId, getAdminToken }) => {
  const [versionInfo, setVersionInfo] = useState(null);
  const [upgradeOptions, setUpgradeOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [precheckResult, setPrecheckResult] = useState(null);
  const [precheckLoading, setPrecheckLoading] = useState(false);

  const headers = { Authorization: `Bearer ${getAdminToken()}` };

  const fetchVersionData = useCallback(async () => {
    try {
      setLoading(true);
      const [versionRes, optionsRes] = await Promise.all([
        axios.get(`${API}/tenants/${tenantId}/version`, { headers }),
        axios.get(`${API}/tenants/${tenantId}/version/upgrade-options`, { headers })
      ]);
      
      setVersionInfo(versionRes.data);
      setUpgradeOptions(optionsRes.data.available_upgrades || []);
      setError(null);
    } catch (err) {
      setError('Failed to load version data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, getAdminToken]);

  useEffect(() => {
    fetchVersionData();
  }, [fetchVersionData]);

  const handleRunPrecheck = async (releaseId) => {
    try {
      setPrecheckLoading(true);
      setPrecheckResult(null);
      const res = await axios.post(
        `${API}/tenants/${tenantId}/version/precheck?target_release_id=${releaseId}`,
        {},
        { headers }
      );
      setPrecheckResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to run precheck');
    } finally {
      setPrecheckLoading(false);
    }
  };

  const handleUpgrade = async (force = false) => {
    try {
      setUpgrading(true);
      setError(null);
      
      await axios.post(
        `${API}/tenants/${tenantId}/version/upgrade`,
        { target_version_id: selectedVersion.id, force },
        { headers }
      );
      
      setSuccess(`Successfully upgraded to ${selectedVersion.version_number}`);
      setShowUpgradeDialog(false);
      setSelectedVersion(null);
      setPrecheckResult(null);
      fetchVersionData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upgrade tenant');
    } finally {
      setUpgrading(false);
    }
  };

  const openUpgradeDialog = (release) => {
    setSelectedVersion(release);
    setPrecheckResult(null);
    setShowUpgradeDialog(true);
    handleRunPrecheck(release.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tenant-version-tab">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Current Version Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            Current Platform Version
          </CardTitle>
          <CardDescription>
            The platform version currently assigned to this tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versionInfo?.version_assigned === false || !versionInfo?.current_version_number ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
              <p className="text-slate-600 font-medium">No version assigned</p>
              <p className="text-sm text-slate-500 mt-1">
                Select a version from the upgrade options below
              </p>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-slate-500">Version</span>
                  <p className="text-2xl font-bold font-mono text-indigo-600">
                    {versionInfo.current_version_number}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-4">
                  {versionInfo.upgrade_eligible ? (
                    <Badge className="bg-green-100 text-green-700">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Upgrade Eligible
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      Not Upgrade Eligible
                    </Badge>
                  )}
                  
                  {versionInfo.rollback_allowed && (
                    <Badge variant="outline">
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Rollback Supported
                    </Badge>
                  )}
                  
                  {versionInfo.migration_required && (
                    <Badge className="bg-amber-100 text-amber-700">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Migration Required
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="text-right text-sm text-slate-500 space-y-1">
                {versionInfo.last_upgraded_at && (
                  <div className="flex items-center gap-1 justify-end">
                    <Calendar className="h-3 w-3" />
                    Last upgraded: {new Date(versionInfo.last_upgraded_at).toLocaleDateString()}
                  </div>
                )}
                {versionInfo.upgraded_by && (
                  <div className="flex items-center gap-1 justify-end">
                    <User className="h-3 w-3" />
                    By: {versionInfo.upgraded_by}
                  </div>
                )}
              </div>
            </div>
          )}

          {versionInfo?.upgrade_notes && (
            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">{versionInfo.upgrade_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4" />
            Available Upgrades
          </CardTitle>
          <CardDescription>
            Platform versions available for this tenant to upgrade to
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upgradeOptions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Info className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              No upgrade options available at this time
            </div>
          ) : (
            <div className="space-y-3">
              {upgradeOptions.map((release) => (
                <div
                  key={release.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  data-testid={`upgrade-option-${release.version_number}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Rocket className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{release.version_number}</span>
                        <span className="text-slate-500">-</span>
                        <span className="text-slate-700">{release.release_name}</span>
                      </div>
                      <div className="flex gap-2 mt-1">
                        {release.breaking_changes && (
                          <Badge variant="destructive" className="text-xs">
                            Breaking Changes
                          </Badge>
                        )}
                        {release.rollback_supported && (
                          <Badge variant="outline" className="text-xs">
                            Rollback OK
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => openUpgradeDialog(release)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    data-testid={`upgrade-btn-${release.version_number}`}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Upgrade
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={(open) => {
        if (!open) {
          setShowUpgradeDialog(false);
          setSelectedVersion(null);
          setPrecheckResult(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upgrade to {selectedVersion?.version_number}</DialogTitle>
            <DialogDescription>
              Review the precheck results before proceeding with the upgrade
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Release Info */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="font-medium">{selectedVersion?.release_name}</p>
              {selectedVersion?.release_notes && (
                <p className="text-sm text-slate-600 mt-1">{selectedVersion.release_notes}</p>
              )}
            </div>

            {/* Precheck Results */}
            {precheckLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mr-2" />
                <span>Running prechecks...</span>
              </div>
            ) : precheckResult ? (
              <div className="space-y-3">
                {/* Eligibility */}
                <div className={`p-3 rounded-lg ${precheckResult.eligible ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    {precheckResult.eligible ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className={`font-medium ${precheckResult.eligible ? 'text-green-800' : 'text-red-800'}`}>
                      {precheckResult.eligible ? 'Upgrade Eligible' : 'Upgrade Blocked'}
                    </span>
                  </div>
                </div>

                {/* Blockers */}
                {precheckResult.blockers?.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="font-medium text-red-800 mb-2">Blockers</p>
                    <ul className="text-sm text-red-700 space-y-1">
                      {precheckResult.blockers.map((blocker, i) => (
                        <li key={i}>• {blocker}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {precheckResult.warnings?.length > 0 && (
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="font-medium text-amber-800 mb-2">Warnings</p>
                    <ul className="text-sm text-amber-700 space-y-1">
                      {precheckResult.warnings.map((warning, i) => (
                        <li key={i}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Migrations */}
                {precheckResult.required_migrations?.length > 0 && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-blue-800 mb-2">Required Migrations</p>
                    <ul className="text-sm text-blue-700 space-y-1">
                      {precheckResult.required_migrations.map((migration, i) => (
                        <li key={i}>• {migration}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Estimated Downtime */}
                {precheckResult.estimated_downtime_minutes > 0 && (
                  <p className="text-sm text-slate-600">
                    Estimated downtime: ~{precheckResult.estimated_downtime_minutes} minutes
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUpgradeDialog(false);
                setSelectedVersion(null);
                setPrecheckResult(null);
              }}
            >
              Cancel
            </Button>
            {precheckResult?.eligible ? (
              <Button
                onClick={() => handleUpgrade(false)}
                disabled={upgrading}
                className="bg-indigo-600 hover:bg-indigo-700"
                data-testid="confirm-upgrade-btn"
              >
                {upgrading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirm Upgrade
              </Button>
            ) : precheckResult && precheckResult.warnings?.length > 0 && precheckResult.blockers?.length === 0 ? (
              <Button
                onClick={() => handleUpgrade(true)}
                disabled={upgrading}
                variant="destructive"
                data-testid="force-upgrade-btn"
              >
                {upgrading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Force Upgrade
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantVersionTab;
