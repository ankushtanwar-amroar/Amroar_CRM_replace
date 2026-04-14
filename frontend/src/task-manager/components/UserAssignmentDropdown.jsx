/**
 * User Assignment Dropdown Component
 * Searchable dropdown to assign/unassign users to tasks
 */
import React, { useState, useEffect, useRef } from 'react';
import { User, X, Search, Loader2, Check, UserPlus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const UserAssignmentDropdown = ({ 
  currentAssignee, 
  onAssign, 
  taskId,
  compact = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [assigning, setAssigning] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      
      const response = await fetch(`${API_URL}/api/task-manager/users${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (userId) => {
    try {
      setAssigning(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ assignee_id: userId })
      });

      if (response.ok) {
        const updatedTask = await response.json();
        onAssign(updatedTask);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Error assigning task:', err);
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (e) => {
    e.stopPropagation();
    await handleAssign(null);
  };

  // Debounced search
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchUsers();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          data-testid="assignee-dropdown-trigger"
        >
          {currentAssignee ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                {currentAssignee.initials || currentAssignee.name?.charAt(0) || '?'}
              </div>
              <span className="text-sm">{currentAssignee.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-400 hover:text-slate-600">
              <UserPlus className="w-4 h-4" />
              <span className="text-sm">Assign</span>
            </div>
          )}
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-xl border z-50">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto p-1">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : filteredUsers.length > 0 ? (
                <>
                  {currentAssignee && (
                    <button
                      onClick={handleUnassign}
                      className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Unassign
                    </button>
                  )}
                  {filteredUsers.map(user => (
                    <button
                      key={user.id}
                      onClick={() => handleAssign(user.id)}
                      className={`w-full px-3 py-2 text-left hover:bg-slate-100 rounded flex items-center gap-2 ${
                        currentAssignee?.id === user.id ? 'bg-blue-50' : ''
                      }`}
                      disabled={assigning}
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                        {user.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                      {currentAssignee?.id === user.id && (
                        <Check className="w-4 h-4 text-blue-500" />
                      )}
                    </button>
                  ))}
                </>
              ) : (
                <div className="py-4 text-center text-sm text-slate-500">
                  No users found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full-size version for detail modal
  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-xs text-slate-500 mb-1 block">Assignee</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-2 border rounded-lg hover:bg-slate-50 transition-colors"
        data-testid="assignee-dropdown-full"
      >
        {currentAssignee ? (
          <>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
              {currentAssignee.initials || currentAssignee.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-slate-700">{currentAssignee.name}</p>
              {currentAssignee.email && (
                <p className="text-xs text-slate-500">{currentAssignee.email}</p>
              )}
            </div>
            <button
              onClick={handleUnassign}
              className="p-1 hover:bg-slate-200 rounded"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-sm text-slate-500">Unassigned</span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border z-50">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleAssign(user.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-slate-100 rounded-lg flex items-center gap-3 ${
                    currentAssignee?.id === user.id ? 'bg-blue-50' : ''
                  }`}
                  disabled={assigning}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                    {user.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  {currentAssignee?.id === user.id && (
                    <Check className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  )}
                </button>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-slate-500">
                No users found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAssignmentDropdown;
