/**
 * RecordSharingPanel - Manual Record Sharing UI
 * 
 * A comprehensive panel/modal for managing record-level sharing.
 * Allows sharing records with users, groups, and roles.
 * 
 * Features:
 * - View current shares
 * - Add new shares (user/group/role)
 * - Set access level (read/edit)
 * - Optional expiration date
 * - Revoke existing shares
 */
import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';

// Icons
import {
  Share2,
  Users,
  User,
  Shield,
  X,
  Trash2,
  Loader2,
  Plus,
  Clock,
  Eye,
  Edit,
  AlertCircle,
  Check,
  UserPlus,
} from 'lucide-react';

// Services
import {
  getRecordShares,
  shareRecord,
  revokeShare,
  getShareableUsers,
  getShareableGroups,
  getShareableRoles,
} from '../../services/recordSharing';

/**
 * Share type icons
 */
const ShareTypeIcon = ({ type, className = "h-4 w-4" }) => {
  switch (type) {
    case 'user':
      return <User className={className} />;
    case 'group':
      return <Users className={className} />;
    case 'role':
      return <Shield className={className} />;
    default:
      return <User className={className} />;
  }
};

/**
 * Access level badge
 */
const AccessLevelBadge = ({ level }) => {
  if (level === 'edit') {
    return (
      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
        <Edit className="h-3 w-3 mr-1" />
        Edit
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
      <Eye className="h-3 w-3 mr-1" />
      Read
    </Badge>
  );
};

/**
 * Share list item component
 */
const ShareListItem = ({ share, onRevoke, isRevoking }) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return null;
    }
  };

  return (
    <div 
      className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
      data-testid={`share-item-${share.id}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
          share.shared_with_type === 'user' ? 'bg-indigo-100 text-indigo-600' :
          share.shared_with_type === 'group' ? 'bg-green-100 text-green-600' :
          'bg-purple-100 text-purple-600'
        }`}>
          <ShareTypeIcon type={share.shared_with_type} className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-slate-900 truncate">
            {share.shared_with_name || share.shared_with_id}
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <span className="capitalize">{share.shared_with_type}</span>
            <span className="text-slate-300">•</span>
            <span>Shared by {share.shared_by_name || 'Unknown'}</span>
            {share.expires_at && (
              <>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-amber-600">
                  <Clock className="h-3 w-3" />
                  Expires {formatDate(share.expires_at)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <AccessLevelBadge level={share.access_level} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(share.id)}
          disabled={isRevoking}
          className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
          data-testid={`revoke-share-${share.id}`}
        >
          {isRevoking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
};

/**
 * Empty state component
 */
const EmptySharesState = () => (
  <div className="text-center py-8" data-testid="no-shares-message">
    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
      <Share2 className="h-6 w-6 text-slate-400" />
    </div>
    <p className="text-slate-600 font-medium">No manual shares</p>
    <p className="text-sm text-slate-500 mt-1">
      This record hasn't been shared with anyone yet.
    </p>
  </div>
);

/**
 * Main RecordSharingPanel Component
 */
const RecordSharingPanel = ({
  isOpen,
  onClose,
  objectName,
  recordId,
  recordName = 'this record',
}) => {
  // State
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  
  // Share targets state
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  
  // New share form state
  const [shareType, setShareType] = useState('user');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [accessLevel, setAccessLevel] = useState('read');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  
  // Active tab
  const [activeTab, setActiveTab] = useState('current');

  /**
   * Fetch current shares
   */
  const fetchShares = useCallback(async () => {
    if (!objectName || !recordId) return;
    
    try {
      setLoading(true);
      const data = await getRecordShares(objectName, recordId);
      setShares(data.shares || []);
    } catch (error) {
      console.error('Error fetching shares:', error);
      toast.error('Failed to load sharing information');
    } finally {
      setLoading(false);
    }
  }, [objectName, recordId]);

  /**
   * Fetch share targets (users, groups, roles)
   */
  const fetchTargets = useCallback(async () => {
    try {
      setLoadingTargets(true);
      const [usersData, groupsData, rolesData] = await Promise.all([
        getShareableUsers().catch(() => []),
        getShareableGroups().catch(() => []),
        getShareableRoles().catch(() => []),
      ]);
      
      setUsers(Array.isArray(usersData) ? usersData : usersData?.users || []);
      setGroups(Array.isArray(groupsData) ? groupsData : groupsData?.groups || []);
      setRoles(Array.isArray(rolesData) ? rolesData : rolesData?.roles || []);
    } catch (error) {
      console.error('Error fetching share targets:', error);
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (isOpen) {
      fetchShares();
      fetchTargets();
    }
  }, [isOpen, fetchShares, fetchTargets]);

  /**
   * Handle adding a new share
   */
  const handleAddShare = async () => {
    if (!selectedTarget) {
      toast.error('Please select who to share with');
      return;
    }

    try {
      setSaving(true);
      await shareRecord(objectName, recordId, {
        shared_with_type: shareType,
        shared_with_id: selectedTarget,
        access_level: accessLevel,
        reason: reason || null,
        expires_at: expiresAt || null,
      });
      
      toast.success('Record shared successfully');
      
      // Reset form
      setSelectedTarget('');
      setAccessLevel('read');
      setExpiresAt('');
      setReason('');
      
      // Refresh shares
      await fetchShares();
      setActiveTab('current');
    } catch (error) {
      console.error('Error sharing record:', error);
      const message = error.response?.data?.detail || 'Failed to share record';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle revoking a share
   */
  const handleRevokeShare = async (shareId) => {
    try {
      setRevokingId(shareId);
      await revokeShare(objectName, recordId, shareId);
      toast.success('Share revoked');
      await fetchShares();
    } catch (error) {
      console.error('Error revoking share:', error);
      toast.error('Failed to revoke share');
    } finally {
      setRevokingId(null);
    }
  };

  /**
   * Get target options based on share type
   */
  const getTargetOptions = () => {
    switch (shareType) {
      case 'user':
        return users.map(u => ({
          value: u.id,
          label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          sublabel: u.email,
        }));
      case 'group':
        return groups.map(g => ({
          value: g.id,
          label: g.name,
          sublabel: `${g.member_count || 0} members`,
        }));
      case 'role':
        return roles.map(r => ({
          value: r.id,
          label: r.name,
          sublabel: r.description || '',
        }));
      default:
        return [];
    }
  };

  const targetOptions = getTargetOptions();

  // Categorize shares
  const sharesByType = {
    user: shares.filter(s => s.shared_with_type === 'user'),
    group: shares.filter(s => s.shared_with_type === 'group'),
    role: shares.filter(s => s.shared_with_type === 'role'),
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col" data-testid="record-sharing-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-indigo-600" />
            Sharing Settings
          </DialogTitle>
          <DialogDescription>
            Manage who has access to {recordName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current" className="flex items-center gap-2" data-testid="current-shares-tab">
              <Users className="h-4 w-4" />
              Current Shares ({shares.length})
            </TabsTrigger>
            <TabsTrigger value="add" className="flex items-center gap-2" data-testid="add-share-tab">
              <UserPlus className="h-4 w-4" />
              Add Share
            </TabsTrigger>
          </TabsList>

          {/* Current Shares Tab */}
          <TabsContent value="current" className="flex-1 overflow-auto mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : shares.length === 0 ? (
              <EmptySharesState />
            ) : (
              <div className="space-y-4">
                {/* Users */}
                {sharesByType.user.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">
                        Users ({sharesByType.user.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {sharesByType.user.map(share => (
                        <ShareListItem
                          key={share.id}
                          share={share}
                          onRevoke={handleRevokeShare}
                          isRevoking={revokingId === share.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Groups */}
                {sharesByType.group.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">
                        Groups ({sharesByType.group.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {sharesByType.group.map(share => (
                        <ShareListItem
                          key={share.id}
                          share={share}
                          onRevoke={handleRevokeShare}
                          isRevoking={revokingId === share.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Roles */}
                {sharesByType.role.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">
                        Roles ({sharesByType.role.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {sharesByType.role.map(share => (
                        <ShareListItem
                          key={share.id}
                          share={share}
                          onRevoke={handleRevokeShare}
                          isRevoking={revokingId === share.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Add Share Tab */}
          <TabsContent value="add" className="flex-1 overflow-auto mt-4">
            <div className="space-y-4">
              {/* Share Type Selection */}
              <div className="space-y-2">
                <Label>Share With</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'user', label: 'User', icon: User },
                    { value: 'group', label: 'Group', icon: Users },
                    { value: 'role', label: 'Role', icon: Shield },
                  ].map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      type="button"
                      variant={shareType === value ? 'default' : 'outline'}
                      className={`flex items-center justify-center gap-2 ${
                        shareType === value ? 'bg-indigo-600 hover:bg-indigo-700' : ''
                      }`}
                      onClick={() => {
                        setShareType(value);
                        setSelectedTarget('');
                      }}
                      data-testid={`share-type-${value}`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Target Selection */}
              <div className="space-y-2">
                <Label>Select {shareType.charAt(0).toUpperCase() + shareType.slice(1)}</Label>
                {loadingTargets ? (
                  <div className="flex items-center gap-2 py-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : targetOptions.length === 0 ? (
                  <div className="py-2 text-slate-500 text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    No {shareType}s available
                  </div>
                ) : (
                  <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                    <SelectTrigger data-testid="target-select">
                      <SelectValue placeholder={`Select a ${shareType}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {targetOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex flex-col">
                            <span>{option.label}</span>
                            {option.sublabel && (
                              <span className="text-xs text-slate-500">{option.sublabel}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Access Level */}
              <div className="space-y-2">
                <Label>Access Level</Label>
                <Select value={accessLevel} onValueChange={setAccessLevel}>
                  <SelectTrigger data-testid="access-level-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-slate-500" />
                        <span>Read Only</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="edit">
                      <div className="flex items-center gap-2">
                        <Edit className="h-4 w-4 text-blue-500" />
                        <span>Read & Edit</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Expiration Date (Optional) */}
              <div className="space-y-2">
                <Label>Expiration Date (Optional)</Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  data-testid="expiration-date-input"
                />
                <p className="text-xs text-slate-500">
                  Leave empty for permanent access
                </p>
              </div>

              {/* Reason (Optional) */}
              <div className="space-y-2">
                <Label>Reason (Optional)</Label>
                <Input
                  type="text"
                  placeholder="Why are you sharing this record?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="share-reason-input"
                />
              </div>

              <Separator />

              {/* Submit Button */}
              <Button
                onClick={handleAddShare}
                disabled={saving || !selectedTarget}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                data-testid="add-share-button"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Share Record
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default RecordSharingPanel;
