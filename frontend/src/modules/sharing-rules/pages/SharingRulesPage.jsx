/**
 * Sharing Rules Page
 * Manage criteria-based and owner-based sharing rules
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Share2, 
  Plus, 
  RefreshCw, 
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Search,
  Filter,
  UserCheck,
  Shield,
  Users,
  Inbox,
  User,
  Power,
  PowerOff,
  Package,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Switch } from '../../../components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../../components/ui/select';
import { cn } from '../../../lib/utils';
import CreateSharingRuleDialog from '../components/CreateSharingRuleDialog';
import sharingRulesService from '../services/sharingRulesService';
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

const SharingRulesPage = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState(null);
  const [ruleDetails, setRuleDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [search, setSearch] = useState('');
  const [objectFilter, setObjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [availableObjects, setAvailableObjects] = useState([]);

  useEffect(() => {
    fetchAvailableObjects();
  }, []);

  useEffect(() => {
    fetchRules();
  }, [objectFilter, typeFilter]);

  useEffect(() => {
    if (selectedRule) {
      fetchRuleDetails(selectedRule);
    } else {
      setRuleDetails(null);
    }
  }, [selectedRule]);

  const fetchAvailableObjects = async () => {
    try {
      const data = await sharingRulesService.getAvailableObjects();
      setAvailableObjects(data || []);
    } catch (error) {
      console.error('Error fetching objects:', error);
    }
  };

  const fetchRules = async () => {
    try {
      setLoading(true);
      const filters = {};
      if (objectFilter !== 'all') filters.object_name = objectFilter;
      if (typeFilter !== 'all') filters.rule_type = typeFilter;
      
      const data = await sharingRulesService.getAllRules(filters);
      setRules(data || []);
    } catch (error) {
      console.error('Error fetching rules:', error);
      toast.error('Failed to load sharing rules');
    } finally {
      setLoading(false);
    }
  };

  const fetchRuleDetails = async (ruleId) => {
    try {
      setLoadingDetails(true);
      const details = await sharingRulesService.getRule(ruleId);
      setRuleDetails(details);
    } catch (error) {
      console.error('Error fetching rule details:', error);
      toast.error('Failed to load rule details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setShowCreateDialog(true);
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await sharingRulesService.deleteRule(ruleId);
      toast.success('Sharing rule deleted');
      if (selectedRule === ruleId) {
        setSelectedRule(null);
        setRuleDetails(null);
      }
      fetchRules();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete rule');
    }
  };

  const handleToggleRule = async (ruleId) => {
    try {
      const result = await sharingRulesService.toggleRule(ruleId);
      toast.success(result.message);
      fetchRules();
      if (selectedRule === ruleId) {
        fetchRuleDetails(ruleId);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to toggle rule');
    }
  };

  const handleSuccess = () => {
    setShowCreateDialog(false);
    setEditingRule(null);
    fetchRules();
    if (selectedRule) {
      fetchRuleDetails(selectedRule);
    }
  };

  const filteredRules = rules.filter(rule => {
    return rule.name.toLowerCase().includes(search.toLowerCase()) ||
           (rule.description || '').toLowerCase().includes(search.toLowerCase());
  });

  const getShareTargetIcon = (type) => {
    switch (type) {
      case 'user': return <User className="h-4 w-4" />;
      case 'role': return <Shield className="h-4 w-4" />;
      case 'group': return <Users className="h-4 w-4" />;
      case 'queue': return <Inbox className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const formatCriteria = (criteria) => {
    if (!criteria || criteria.length === 0) return 'No criteria';
    return criteria.map(c => `${c.field} ${c.operator} "${c.value}"`).join(' AND ');
  };

  return (
    <div className="flex-1 h-full flex flex-col" data-testid="sharing-rules-page">
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
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Share2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Sharing Rules</h1>
              <p className="text-sm text-slate-500">Define rules to share records with users, roles, and groups</p>
            </div>
          </div>
          </div>
        <div className="flex items-center justify-end space-x-2">
          <Button variant="outline" size="sm" onClick={fetchRules} data-testid="refresh-rules-btn">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            onClick={() => { setEditingRule(null); setShowCreateDialog(true); }}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="add-rule-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Rule
          </Button>
        </div>
        </div>
        
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Rules List */}
        <div className="w-1/2 border-r bg-white overflow-auto">
          {/* Filters */}
          <div className="px-4 py-3 border-b bg-slate-50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rules..."
                className="pl-9"
                data-testid="rule-search"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Select value={objectFilter} onValueChange={setObjectFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Object" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Objects</SelectItem>
                  {availableObjects.map((obj) => (
                    <SelectItem key={obj.name} value={obj.name}>
                      {obj.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Rule Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="criteria">Criteria-Based</SelectItem>
                  <SelectItem value="owner">Owner-Based</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rules List */}
          <div className="p-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="text-center py-12">
                <Share2 className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">No sharing rules found</p>
                <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </div>
            ) : (
              filteredRules.map(rule => (
                <div
                  key={rule.id}
                  className={cn(
                    "flex items-center p-3 rounded-lg cursor-pointer transition-colors group",
                    selectedRule === rule.id
                      ? "bg-blue-100 border border-blue-200"
                      : "hover:bg-slate-100 border border-transparent"
                  )}
                  onClick={() => setSelectedRule(rule.id)}
                  data-testid={`rule-item-${rule.id}`}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center mr-3",
                    selectedRule === rule.id ? "bg-blue-500" : "bg-slate-200"
                  )}>
                    {rule.rule_type === 'criteria' ? (
                      <Filter className={cn(
                        "h-5 w-5",
                        selectedRule === rule.id ? "text-white" : "text-slate-600"
                      )} />
                    ) : (
                      <UserCheck className={cn(
                        "h-5 w-5",
                        selectedRule === rule.id ? "text-white" : "text-slate-600"
                      )} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className={cn(
                        "font-medium truncate",
                        selectedRule === rule.id ? "text-blue-900" : "text-slate-900"
                      )}>
                        {rule.name}
                      </span>
                      {!rule.is_active && (
                        <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center text-xs text-slate-500 mt-1 space-x-2">
                      <Badge variant="outline" className={getObjectColor(rule.object_name)}>
                        {rule.object_name}
                      </Badge>
                      <span>→</span>
                      <span className="flex items-center">
                        {getShareTargetIcon(rule.share_with_type)}
                        <span className="ml-1">{rule.share_with_name || 'Unknown'}</span>
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
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditRule(rule); }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Rule
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleRule(rule.id); }}>
                          {rule.is_active ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-2" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete rule "${rule.name}"?`)) {
                              handleDeleteRule(rule.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Rule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Rule Details */}
        <div className="w-1/2 bg-slate-50 overflow-auto">
          {selectedRule ? (
            loadingDetails ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : ruleDetails ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-12 h-12 rounded-lg flex items-center justify-center",
                        ruleDetails.rule_type === 'criteria'
                          ? "bg-gradient-to-br from-blue-500 to-blue-600"
                          : "bg-gradient-to-br from-green-500 to-green-600"
                      )}>
                        {ruleDetails.rule_type === 'criteria' ? (
                          <Filter className="h-6 w-6 text-white" />
                        ) : (
                          <UserCheck className="h-6 w-6 text-white" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h2 className="text-xl font-bold text-slate-900">{ruleDetails.name}</h2>
                          <Switch
                            checked={ruleDetails.is_active}
                            onCheckedChange={() => handleToggleRule(ruleDetails.id)}
                          />
                        </div>
                        {ruleDetails.description && (
                          <p className="text-sm text-slate-500">{ruleDetails.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditRule(ruleDetails)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Details Content */}
                <div className="flex-1 overflow-auto p-6 space-y-4">
                  {/* Object & Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                          <Package className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Object</p>
                          <Badge className={getObjectColor(ruleDetails.object_name)}>
                            {ruleDetails.object_name}
                          </Badge>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          ruleDetails.rule_type === 'criteria' ? "bg-blue-100" : "bg-green-100"
                        )}>
                          {ruleDetails.rule_type === 'criteria' ? (
                            <Filter className="h-5 w-5 text-blue-600" />
                          ) : (
                            <UserCheck className="h-5 w-5 text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Rule Type</p>
                          <p className="font-medium text-slate-900 capitalize">{ruleDetails.rule_type}-Based</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Criteria / Owner Section */}
                  <Card className="p-4">
                    <h3 className="font-medium text-slate-900 mb-3 flex items-center">
                      {ruleDetails.rule_type === 'criteria' ? (
                        <>
                          <Filter className="h-4 w-4 mr-2 text-blue-600" />
                          Criteria
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-4 w-4 mr-2 text-green-600" />
                          Owner Criteria
                        </>
                      )}
                    </h3>
                    
                    {ruleDetails.rule_type === 'criteria' ? (
                      ruleDetails.criteria && ruleDetails.criteria.length > 0 ? (
                        <div className="space-y-2">
                          {ruleDetails.criteria.map((c, index) => (
                            <div key={index} className="flex items-center space-x-2 p-2 bg-slate-50 rounded">
                              {index > 0 && <span className="text-xs text-slate-500">AND</span>}
                              <Badge variant="outline">{c.field}</Badge>
                              <span className="text-sm text-slate-600">{c.operator}</span>
                              <Badge className="bg-blue-100 text-blue-700">"{c.value}"</Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No criteria defined</p>
                      )
                    ) : (
                      ruleDetails.owner_criteria ? (
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-sm text-slate-600">
                            Records owned by users with role:
                          </p>
                          <Badge className="mt-2 bg-indigo-100 text-indigo-700">
                            <Shield className="h-3 w-3 mr-1" />
                            {ruleDetails.owner_criteria.owner_role_name || 'Unknown Role'}
                          </Badge>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No owner criteria defined</p>
                      )
                    )}
                  </Card>

                  {/* Share With */}
                  <Card className="p-4">
                    <h3 className="font-medium text-slate-900 mb-3 flex items-center">
                      <ArrowRight className="h-4 w-4 mr-2 text-slate-400" />
                      Share With
                    </h3>
                    <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        ruleDetails.share_with_type === 'user' ? "bg-slate-200" :
                        ruleDetails.share_with_type === 'role' ? "bg-indigo-100" :
                        ruleDetails.share_with_type === 'group' ? "bg-emerald-100" :
                        "bg-violet-100"
                      )}>
                        {getShareTargetIcon(ruleDetails.share_with_type)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{ruleDetails.share_with_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-500 capitalize">{ruleDetails.share_with_type}</p>
                      </div>
                    </div>
                  </Card>

                  {/* Access Level */}
                  <Card className="p-4">
                    <h3 className="font-medium text-slate-900 mb-3">Access Level</h3>
                    <Badge className={cn(
                      "text-sm",
                      ruleDetails.access_level === 'read_write' 
                        ? "bg-green-100 text-green-700" 
                        : "bg-blue-100 text-blue-700"
                    )}>
                      {ruleDetails.access_level === 'read_write' ? 'Read/Write' : 'Read Only'}
                    </Badge>
                    <p className="text-xs text-slate-500 mt-2">
                      {ruleDetails.access_level === 'read_write' 
                        ? 'Users can view and edit matching records'
                        : 'Users can only view matching records'}
                    </p>
                  </Card>
                </div>
              </div>
            ) : null
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Share2 className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 text-lg mb-2">Select a rule</p>
                <p className="text-slate-400 text-sm">Click on a sharing rule to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateSharingRuleDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditingRule(null);
        }}
        editingRule={editingRule}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default SharingRulesPage;
