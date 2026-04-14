/**
 * InlineOwnerField - Inline-editable Owner field component
 * 
 * Features:
 * - Displays current owner name with edit icon
 * - Clicking edit opens a dropdown of users
 * - Save/Cancel buttons for committing changes
 * - Supports keyboard navigation (Escape to cancel)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { User, Pencil, Check, X, Loader2, ChevronDown, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const InlineOwnerField = ({
  ownerId,
  ownerName: initialOwnerName,
  objectName,
  recordId,
  onOwnerChange,
  isEditable = true,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [ownerName, setOwnerName] = useState(initialOwnerName || '');
  const [selectedOwnerId, setSelectedOwnerId] = useState(ownerId);
  const [selectedOwnerName, setSelectedOwnerName] = useState(initialOwnerName || '');
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef(null);

  // Fetch owner name if not provided
  useEffect(() => {
    const fetchOwnerName = async () => {
      if (ownerName || !ownerId) return;
      
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/users/${ownerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const user = response.data;
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
        setOwnerName(name);
        setSelectedOwnerName(name);
      } catch (error) {
        console.error('Error fetching owner:', error);
        setOwnerName('Unknown');
      }
    };

    fetchOwnerName();
  }, [ownerId, ownerName]);

  // Fetch users list when editing
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const userList = Array.isArray(response.data) ? response.data : response.data?.users || [];
      setUsers(userList);
      setFilteredUsers(userList);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter users based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = users.filter(user => {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      const email = (user.email || '').toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  // Handle edit mode
  const handleStartEdit = () => {
    if (!isEditable) return;
    setIsEditing(true);
    setSelectedOwnerId(ownerId);
    setSelectedOwnerName(ownerName);
    fetchUsers();
  };

  // Handle user selection
  const handleSelectUser = (user) => {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
    setSelectedOwnerId(user.id);
    setSelectedOwnerName(name);
    setIsOpen(false);
  };

  // Handle save
  const handleSave = async () => {
    if (selectedOwnerId === ownerId) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/objects/${objectName}/records/${recordId}`,
        { owner_id: selectedOwnerId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setOwnerName(selectedOwnerName);
      setIsEditing(false);
      toast.success('Owner updated successfully');
      
      if (onOwnerChange) {
        onOwnerChange(selectedOwnerId, selectedOwnerName);
      }
    } catch (error) {
      console.error('Error updating owner:', error);
      toast.error(error.response?.data?.detail || 'Failed to update owner');
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setSelectedOwnerId(ownerId);
    setSelectedOwnerName(ownerName);
    setIsEditing(false);
    setSearchQuery('');
  };

  // Handle keyboard events
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Display mode
  if (!isEditing) {
    return (
      <div 
        className={cn(
          "flex items-center gap-2 group",
          isEditable && "cursor-pointer",
          className
        )}
        onClick={handleStartEdit}
        data-testid="owner-field-display"
      >
        <User className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-700">
          {ownerName || 'Unassigned'}
        </span>
        {isEditable && (
          <Pencil 
            className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" 
            data-testid="owner-edit-icon"
          />
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div 
      className={cn("flex items-center gap-2", className)}
      onKeyDown={handleKeyDown}
      data-testid="owner-field-edit"
    >
      <User className="h-4 w-4 text-slate-400" />
      
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 min-w-[180px] justify-between font-normal"
            disabled={saving}
            data-testid="owner-dropdown-trigger"
          >
            <span className="truncate">
              {selectedOwnerName || 'Select user...'}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          {/* Search Input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8"
                autoFocus
                data-testid="owner-search-input"
              />
            </div>
          </div>
          
          {/* User List */}
          <div className="max-h-[240px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-4 text-center text-sm text-slate-500">
                No users found
              </div>
            ) : (
              filteredUsers.map((user) => {
                const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
                const isSelected = user.id === selectedOwnerId;
                
                return (
                  <div
                    key={user.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors",
                      isSelected && "bg-indigo-50"
                    )}
                    onClick={() => handleSelectUser(user)}
                    data-testid={`owner-option-${user.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                      {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {name}
                      </div>
                      {user.email && name !== user.email && (
                        <div className="text-xs text-slate-500 truncate">
                          {user.email}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Save/Cancel Buttons */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
        title="Save"
        data-testid="owner-save-button"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCancel}
        disabled={saving}
        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        title="Cancel"
        data-testid="owner-cancel-button"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default InlineOwnerField;
