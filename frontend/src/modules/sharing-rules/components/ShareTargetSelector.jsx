/**
 * Share Target Selector Component
 * Select users, roles, groups, or queues as share targets
 */
import React, { useState, useEffect } from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Loader2, Search, User, Shield, Users, Inbox } from 'lucide-react';
import sharingRulesService from '../services/sharingRulesService';

const ShareTargetSelector = ({ 
  shareWithType, 
  shareWithId, 
  onTypeChange, 
  onIdChange,
  disabled 
}) => {
  const [targets, setTargets] = useState({ users: [], roles: [], groups: [], queues: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(shareWithType || 'role');

  useEffect(() => {
    fetchTargets();
  }, []);

  useEffect(() => {
    if (shareWithType && shareWithType !== activeTab) {
      setActiveTab(shareWithType);
    }
  }, [shareWithType]);

  const fetchTargets = async () => {
    try {
      setLoading(true);
      const data = await sharingRulesService.getShareTargets();
      setTargets(data);
    } catch (error) {
      console.error('Error fetching targets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    onTypeChange(newTab);
    onIdChange(''); // Reset selection when changing type
  };

  const handleSelect = (id) => {
    onIdChange(id);
  };

  const filterItems = (items, searchTerm) => {
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item => {
      const name = item.name || `${item.first_name || ''} ${item.last_name || ''}`;
      return name.toLowerCase().includes(term) || 
             (item.email && item.email.toLowerCase().includes(term));
    });
  };

  const getItemName = (item) => {
    if (item.first_name || item.last_name) {
      return `${item.first_name || ''} ${item.last_name || ''}`.trim();
    }
    return item.name;
  };

  const renderList = (items, type) => {
    const filtered = filterItems(items, search);
    
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="text-center py-8 text-slate-500 text-sm">
          No {type} found
        </div>
      );
    }

    return (
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {filtered.map((item) => {
          const isSelected = shareWithId === item.id;
          const itemName = getItemName(item);
          
          return (
            <div
              key={item.id}
              className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
              onClick={() => !disabled && handleSelect(item.id)}
            >
              <input
                type="radio"
                checked={isSelected}
                onChange={() => {}}
                className="mr-3"
                disabled={disabled}
              />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                type === 'users' ? 'bg-slate-200' :
                type === 'roles' ? 'bg-indigo-100' :
                type === 'groups' ? 'bg-emerald-100' :
                'bg-violet-100'
              }`}>
                {type === 'users' && <User className="h-4 w-4 text-slate-600" />}
                {type === 'roles' && <Shield className="h-4 w-4 text-indigo-600" />}
                {type === 'groups' && <Users className="h-4 w-4 text-emerald-600" />}
                {type === 'queues' && <Inbox className="h-4 w-4 text-violet-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{itemName}</p>
                {item.email && (
                  <p className="text-xs text-slate-500 truncate">{item.email}</p>
                )}
                {item.group_type && (
                  <Badge variant="outline" className="text-xs mt-1">
                    {item.group_type}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Label>Share With</Label>
      
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="pl-9"
          disabled={disabled}
        />
      </div>

      {/* Target Type Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="role" disabled={disabled}>
            <Shield className="h-3 w-3 mr-1" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="group" disabled={disabled}>
            <Users className="h-3 w-3 mr-1" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="queue" disabled={disabled}>
            <Inbox className="h-3 w-3 mr-1" />
            Queues
          </TabsTrigger>
          <TabsTrigger value="user" disabled={disabled}>
            <User className="h-3 w-3 mr-1" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="role" className="mt-3 border rounded-lg p-2">
          {renderList(targets.roles, 'roles')}
        </TabsContent>
        
        <TabsContent value="group" className="mt-3 border rounded-lg p-2">
          {renderList(targets.groups, 'groups')}
        </TabsContent>
        
        <TabsContent value="queue" className="mt-3 border rounded-lg p-2">
          {renderList(targets.queues, 'queues')}
        </TabsContent>
        
        <TabsContent value="user" className="mt-3 border rounded-lg p-2">
          {renderList(targets.users, 'users')}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ShareTargetSelector;
