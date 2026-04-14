/**
 * Groups Page
 * Manage public and private groups with member assignment
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  RefreshCw,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
  Lock,
  Globe,
  Search,
  User,
  Shield,
  X,
  ArrowLeft
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../lib/utils';
import CreateGroupDialog from '../components/CreateGroupDialog';
import AddMemberDialog from '../components/AddMemberDialog';
import groupService from '../services/groupService';
import { toast } from 'react-hot-toast';

const GroupsPage = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchGroupDetails(selectedGroup);
    } else {
      setGroupDetails(null);
    }
  }, [selectedGroup]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const data = await groupService.getAllGroups();
      setGroups(data || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupDetails = async (groupId) => {
    try {
      setLoadingDetails(true);
      const details = await groupService.getGroup(groupId);
      setGroupDetails(details);
    } catch (error) {
      console.error('Error fetching group details:', error);
      toast.error('Failed to load group details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setShowCreateDialog(true);
  };

  const handleDeleteGroup = async (groupId) => {
    try {
      await groupService.deleteGroup(groupId);
      toast.success('Group deleted successfully');
      if (selectedGroup === groupId) {
        setSelectedGroup(null);
        setGroupDetails(null);
      }
      fetchGroups();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete group');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!groupDetails) return;
    try {
      await groupService.removeMember(groupDetails.id, memberId);
      toast.success('Member removed');
      fetchGroupDetails(groupDetails.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove member');
    }
  };

  const handleSuccess = () => {
    setShowCreateDialog(false);
    setShowAddMemberDialog(false);
    setEditingGroup(null);
    fetchGroups();
    if (selectedGroup) {
      fetchGroupDetails(selectedGroup);
    }
  };

  const filteredGroups = groups.filter(group => {
    const matchesSearch = group.name.toLowerCase().includes(search.toLowerCase()) ||
      (group.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeFilter === 'all' || group.group_type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex-1 h-full flex flex-col" data-testid="groups-page">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        {/* Header with Back Button */}
        <div className="flex justify-between">
          <div className="flex items-center  gap-6">
            <button
              onClick={() => navigate('/setup')}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              data-testid="back-to-setup-btn"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back to Setup</span>
            </button>
            <div className="h-8 w-px bg-slate-300" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Public Groups</h1>
                <p className="text-sm text-slate-500">Create and manage groups to share records</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={fetchGroups} data-testid="refresh-groups-btn">
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button
              onClick={() => { setEditingGroup(null); setShowCreateDialog(true); }}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="add-group-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Group
            </Button>
          </div>
        </div>


      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Groups List */}
        <div className="w-1/2 border-r bg-white overflow-auto">
          {/* Search and Filter */}
          <div className="px-4 py-3 border-b bg-slate-50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups..."
                className="pl-9"
                data-testid="group-search"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant={activeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('all')}
                className={activeFilter === 'all' ? 'bg-emerald-600' : ''}
              >
                All ({groups.length})
              </Button>
              <Button
                variant={activeFilter === 'public' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('public')}
                className={activeFilter === 'public' ? 'bg-emerald-600' : ''}
              >
                <Globe className="h-3 w-3 mr-1" />
                Public
              </Button>
              <Button
                variant={activeFilter === 'private' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('private')}
                className={activeFilter === 'private' ? 'bg-emerald-600' : ''}
              >
                <Lock className="h-3 w-3 mr-1" />
                Private
              </Button>
            </div>
          </div>

          {/* Groups List */}
          <div className="p-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">No groups found</p>
                <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </Button>
              </div>
            ) : (
              filteredGroups.map(group => (
                <div
                  key={group.id}
                  className={cn(
                    "flex items-center p-3 rounded-lg cursor-pointer transition-colors group",
                    selectedGroup === group.id
                      ? "bg-emerald-100 border border-emerald-200"
                      : "hover:bg-slate-100 border border-transparent"
                  )}
                  onClick={() => setSelectedGroup(group.id)}
                  data-testid={`group-item-${group.id}`}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center mr-3",
                    selectedGroup === group.id ? "bg-emerald-500" : "bg-slate-200"
                  )}>
                    {group.group_type === 'private' ? (
                      <Lock className={cn(
                        "h-5 w-5",
                        selectedGroup === group.id ? "text-white" : "text-slate-600"
                      )} />
                    ) : (
                      <Globe className={cn(
                        "h-5 w-5",
                        selectedGroup === group.id ? "text-white" : "text-slate-600"
                      )} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <span className={cn(
                        "font-medium truncate",
                        selectedGroup === group.id ? "text-emerald-900" : "text-slate-900"
                      )}>
                        {group.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-2 text-xs",
                          group.group_type === 'private'
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        )}
                      >
                        {group.group_type}
                      </Badge>
                    </div>
                    <div className="flex items-center text-xs text-slate-500 mt-1">
                      <Users className="h-3 w-3 mr-1" />
                      {group.member_count || 0} members
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Group
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedGroup(group.id); setShowAddMemberDialog(true); }}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Members
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete group "${group.name}"?`)) {
                              handleDeleteGroup(group.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Group Details */}
        <div className="w-1/2 bg-slate-50 overflow-auto">
          {selectedGroup ? (
            loadingDetails ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            ) : groupDetails ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-12 h-12 rounded-lg flex items-center justify-center",
                        groupDetails.group_type === 'private'
                          ? "bg-gradient-to-br from-amber-500 to-amber-600"
                          : "bg-gradient-to-br from-emerald-500 to-emerald-600"
                      )}>
                        {groupDetails.group_type === 'private' ? (
                          <Lock className="h-6 w-6 text-white" />
                        ) : (
                          <Globe className="h-6 w-6 text-white" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h2 className="text-xl font-bold text-slate-900">{groupDetails.name}</h2>
                          <Badge
                            variant="outline"
                            className={cn(
                              groupDetails.group_type === 'private'
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            )}
                          >
                            {groupDetails.group_type}
                          </Badge>
                        </div>
                        {groupDetails.description && (
                          <p className="text-sm text-slate-500">{groupDetails.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditGroup(groupDetails)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Members Tab */}
                <Tabs defaultValue="members" className="flex-1 flex flex-col">
                  <TabsList className="px-6 py-2 bg-white border-b justify-start rounded-none">
                    <TabsTrigger value="members">Members ({groupDetails.members?.length || 0})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="members" className="flex-1 overflow-auto p-6 mt-0">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-slate-900">Group Members</h3>
                      <Button
                        size="sm"
                        onClick={() => setShowAddMemberDialog(true)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Members
                      </Button>
                    </div>

                    {groupDetails.members?.length > 0 ? (
                      <div className="space-y-2">
                        {groupDetails.members.map(member => (
                          <Card key={member.id} className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center",
                                  member.member_type === 'user' ? "bg-slate-200" : "bg-indigo-100"
                                )}>
                                  {member.member_type === 'user' ? (
                                    <span className="text-sm font-medium text-slate-600">
                                      {(member.name?.[0] || 'U').toUpperCase()}
                                    </span>
                                  ) : (
                                    <Shield className="h-5 w-5 text-indigo-600" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-slate-900">{member.name || 'Unknown'}</p>
                                  <p className="text-sm text-slate-500">
                                    {member.member_type === 'user' ? member.email : 'Role'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge className={member.member_type === 'user' ? 'bg-slate-100 text-slate-700' : 'bg-indigo-100 text-indigo-700'}>
                                  {member.member_type === 'user' ? <User className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
                                  {member.member_type}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                                  onClick={() => handleRemoveMember(member.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-white rounded-lg border">
                        <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-500 mb-4">No members in this group</p>
                        <Button variant="outline" onClick={() => setShowAddMemberDialog(true)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Members
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            ) : null
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Users className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 text-lg mb-2">Select a group</p>
                <p className="text-slate-400 text-sm">Click on a group to view details and members</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateGroupDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditingGroup(null);
        }}
        editingGroup={editingGroup}
        onSuccess={handleSuccess}
      />

      {selectedGroup && groupDetails && (
        <AddMemberDialog
          open={showAddMemberDialog}
          onOpenChange={setShowAddMemberDialog}
          group={groupDetails}
          existingMembers={groupDetails.members}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};

export default GroupsPage;
