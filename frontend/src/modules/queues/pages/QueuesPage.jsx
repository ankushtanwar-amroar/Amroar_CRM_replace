/**
 * Queues Page
 * Manage record queues with member assignment and supported objects
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox,
  Plus,
  RefreshCw,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
  Search,
  User,
  Shield,
  Users,
  X,
  Package,
  Mail,
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
import CreateQueueDialog from '../components/CreateQueueDialog';
import AddQueueMemberDialog from '../components/AddQueueMemberDialog';
import queueService from '../services/queueService';
import { toast } from 'react-hot-toast';

const OBJECT_COLORS = {
  lead: 'bg-orange-100 text-orange-700 border-orange-200',
  contact: 'bg-purple-100 text-purple-700 border-purple-200',
  account: 'bg-blue-100 text-blue-700 border-blue-200',
  opportunity: 'bg-green-100 text-green-700 border-green-200',
  case: 'bg-red-100 text-red-700 border-red-200',
  task: 'bg-slate-100 text-slate-700 border-slate-200',
  // Default for custom objects
  default: 'bg-indigo-100 text-indigo-700 border-indigo-200'
};

const getObjectColor = (objectName) => {
  return OBJECT_COLORS[objectName] || OBJECT_COLORS.default;
};

const QueuesPage = () => {
  const navigate = useNavigate();
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [queueDetails, setQueueDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [editingQueue, setEditingQueue] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchQueues();
  }, []);

  useEffect(() => {
    if (selectedQueue) {
      fetchQueueDetails(selectedQueue);
    } else {
      setQueueDetails(null);
    }
  }, [selectedQueue]);

  const fetchQueues = async () => {
    try {
      setLoading(true);
      const data = await queueService.getAllQueues();
      setQueues(data || []);
    } catch (error) {
      console.error('Error fetching queues:', error);
      toast.error('Failed to load queues');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueDetails = async (queueId) => {
    try {
      setLoadingDetails(true);
      const details = await queueService.getQueue(queueId);
      setQueueDetails(details);
    } catch (error) {
      console.error('Error fetching queue details:', error);
      toast.error('Failed to load queue details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEditQueue = (queue) => {
    setEditingQueue(queue);
    setShowCreateDialog(true);
  };

  const handleDeleteQueue = async (queueId) => {
    try {
      await queueService.deleteQueue(queueId);
      toast.success('Queue deleted successfully');
      if (selectedQueue === queueId) {
        setSelectedQueue(null);
        setQueueDetails(null);
      }
      fetchQueues();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete queue');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!queueDetails) return;
    try {
      await queueService.removeMember(queueDetails.id, memberId);
      toast.success('Member removed');
      fetchQueueDetails(queueDetails.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove member');
    }
  };

  const handleSuccess = () => {
    setShowCreateDialog(false);
    setShowAddMemberDialog(false);
    setEditingQueue(null);
    fetchQueues();
    if (selectedQueue) {
      fetchQueueDetails(selectedQueue);
    }
  };

  const filteredQueues = queues.filter(queue => {
    return queue.name.toLowerCase().includes(search.toLowerCase()) ||
      (queue.description || '').toLowerCase().includes(search.toLowerCase());
  });

  const getMemberIcon = (memberType) => {
    switch (memberType) {
      case 'user': return <User className="h-4 w-4 text-slate-600" />;
      case 'role': return <Shield className="h-4 w-4 text-indigo-600" />;
      case 'group': return <Users className="h-4 w-4 text-emerald-600" />;
      default: return <User className="h-4 w-4 text-slate-400" />;
    }
  };

  const getMemberBgColor = (memberType) => {
    switch (memberType) {
      case 'user': return 'bg-slate-200';
      case 'role': return 'bg-indigo-100';
      case 'group': return 'bg-emerald-100';
      default: return 'bg-slate-200';
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col" data-testid="queues-page">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        {/* Header with Back Button */}
        <div className="flex justify-between">
          <div className="flex items-center gap-4 mb-4">
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
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                <Inbox className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Queues</h1>
                <p className="text-sm text-slate-500">Manage record ownership queues</p>
              </div>
            </div>
          </div>
        <div className="flex items-center justify-end space-x-2">
          <Button variant="outline" size="sm" onClick={fetchQueues} data-testid="refresh-queues-btn">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            onClick={() => { setEditingQueue(null); setShowCreateDialog(true); }}
            className="bg-violet-600 hover:bg-violet-700"
            data-testid="add-queue-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Queue
          </Button>
        </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Queues List */}
        <div className="w-1/2 border-r bg-white overflow-auto">
          {/* Search */}
          <div className="px-4 py-3 border-b bg-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search queues..."
                className="pl-9"
                data-testid="queue-search"
              />
            </div>
          </div>

          {/* Queues List */}
          <div className="p-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
              </div>
            ) : filteredQueues.length === 0 ? (
              <div className="text-center py-12">
                <Inbox className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">No queues found</p>
                <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Queue
                </Button>
              </div>
            ) : (
              filteredQueues.map(queue => (
                <div
                  key={queue.id}
                  className={cn(
                    "flex items-center p-3 rounded-lg cursor-pointer transition-colors group",
                    selectedQueue === queue.id
                      ? "bg-violet-100 border border-violet-200"
                      : "hover:bg-slate-100 border border-transparent"
                  )}
                  onClick={() => setSelectedQueue(queue.id)}
                  data-testid={`queue-item-${queue.id}`}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center mr-3",
                    selectedQueue === queue.id ? "bg-violet-500" : "bg-slate-200"
                  )}>
                    <Inbox className={cn(
                      "h-5 w-5",
                      selectedQueue === queue.id ? "text-white" : "text-slate-600"
                    )} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <span className={cn(
                        "font-medium truncate",
                        selectedQueue === queue.id ? "text-violet-900" : "text-slate-900"
                      )}>
                        {queue.name}
                      </span>
                    </div>
                    <div className="flex items-center text-xs text-slate-500 mt-1 space-x-3">
                      <span className="flex items-center">
                        <Users className="h-3 w-3 mr-1" />
                        {queue.member_count || 0} members
                      </span>
                      <span className="flex items-center">
                        <Package className="h-3 w-3 mr-1" />
                        {queue.supported_objects?.length || 0} objects
                      </span>
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
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditQueue(queue); }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Queue
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedQueue(queue.id); setShowAddMemberDialog(true); }}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Members
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete queue "${queue.name}"?`)) {
                              handleDeleteQueue(queue.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Queue
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Queue Details */}
        <div className="w-1/2 bg-slate-50 overflow-auto">
          {selectedQueue ? (
            loadingDetails ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
              </div>
            ) : queueDetails ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-violet-600 rounded-lg flex items-center justify-center">
                        <Inbox className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{queueDetails.name}</h2>
                        {queueDetails.description && (
                          <p className="text-sm text-slate-500">{queueDetails.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditQueue(queueDetails)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="details" className="flex-1 flex flex-col">
                  <TabsList className="px-6 py-2 bg-white border-b justify-start rounded-none">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="members">Members ({queueDetails.members?.length || 0})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="flex-1 overflow-auto p-6 mt-0">
                    <div className="space-y-4">
                      {/* Queue Email */}
                      {queueDetails.email && (
                        <Card className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <Mail className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase">Queue Email</p>
                              <p className="font-medium text-slate-900">{queueDetails.email}</p>
                            </div>
                          </div>
                        </Card>
                      )}

                      {/* Supported Objects */}
                      <Card className="p-4">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Package className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-slate-500 uppercase mb-2">Supported Objects</p>
                            {queueDetails.supported_objects?.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {queueDetails.supported_objects.map(obj => (
                                  <Badge
                                    key={obj}
                                    variant="outline"
                                    className={getObjectColor(obj)}
                                  >
                                    {obj.charAt(0).toUpperCase() + obj.slice(1)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500 italic">No objects configured</p>
                            )}
                          </div>
                        </div>
                      </Card>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <Card className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                              <Users className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase">Total Members</p>
                              <p className="font-medium text-slate-900">{queueDetails.members?.length || 0}</p>
                            </div>
                          </div>
                        </Card>
                        <Card className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                              <Package className="h-5 w-5 text-violet-600" />
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase">Object Types</p>
                              <p className="font-medium text-slate-900">{queueDetails.supported_objects?.length || 0}</p>
                            </div>
                          </div>
                        </Card>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="members" className="flex-1 overflow-auto p-6 mt-0">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-slate-900">Queue Members</h3>
                      <Button
                        size="sm"
                        onClick={() => setShowAddMemberDialog(true)}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Members
                      </Button>
                    </div>

                    {queueDetails.members?.length > 0 ? (
                      <div className="space-y-2">
                        {queueDetails.members.map(member => (
                          <Card key={member.id} className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center",
                                  getMemberBgColor(member.member_type)
                                )}>
                                  {getMemberIcon(member.member_type)}
                                </div>
                                <div>
                                  <p className="font-medium text-slate-900">{member.name || 'Unknown'}</p>
                                  <p className="text-sm text-slate-500">
                                    {member.member_type === 'user' && member.email}
                                    {member.member_type === 'role' && 'Role'}
                                    {member.member_type === 'group' && `Group · ${member.group_type || 'public'}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge className={cn(
                                  member.member_type === 'user' && 'bg-slate-100 text-slate-700',
                                  member.member_type === 'role' && 'bg-indigo-100 text-indigo-700',
                                  member.member_type === 'group' && 'bg-emerald-100 text-emerald-700'
                                )}>
                                  {member.member_type === 'user' && <User className="h-3 w-3 mr-1" />}
                                  {member.member_type === 'role' && <Shield className="h-3 w-3 mr-1" />}
                                  {member.member_type === 'group' && <Users className="h-3 w-3 mr-1" />}
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
                        <p className="text-slate-500 mb-4">No members in this queue</p>
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
                <Inbox className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 text-lg mb-2">Select a queue</p>
                <p className="text-slate-400 text-sm">Click on a queue to view details and members</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateQueueDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditingQueue(null);
        }}
        editingQueue={editingQueue}
        onSuccess={handleSuccess}
      />

      {selectedQueue && queueDetails && (
        <AddQueueMemberDialog
          open={showAddMemberDialog}
          onOpenChange={setShowAddMemberDialog}
          queue={queueDetails}
          existingMembers={queueDetails.members}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};

export default QueuesPage;
