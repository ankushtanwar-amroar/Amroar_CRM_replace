/**
 * Role Node Component
 * Single node in role hierarchy tree
 */
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Users, MoreVertical } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';

const RoleNode = ({ role, level = 0, onAddChild, onEdit, onAssignUsers }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = role.children && role.children.length > 0;

  return (
    <div className="select-none">
      {/* Node */}
      <div
        className="flex items-center justify-between py-2 px-3 hover:bg-slate-50 rounded-lg group"
        style={{ marginLeft: `${level * 24}px` }}
      >
        <div className="flex items-center space-x-2 flex-1">
          {/* Expand/Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-100 rounded"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-600" />
              )
            ) : (
              <div className="w-4 h-4" />
            )}
          </button>

          {/* Role Info */}
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-slate-900">{role.name}</span>
              {role.is_system_role && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  System
                </Badge>
              )}
            </div>
            {role.description && (
              <p className="text-xs text-slate-500">{role.description}</p>
            )}
          </div>

          {/* User Count */}
          <div className="flex items-center space-x-1 text-sm text-slate-600">
            <Users className="h-4 w-4" />
            <span>{role.user_count || 0}</span>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAssignUsers && onAssignUsers(role)}>
                Assign Users
              </DropdownMenuItem>
              {!role.is_system_role && (
                <>
                  <DropdownMenuItem onClick={() => onEdit && onEdit(role)}>
                    Edit Role
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAddChild && onAddChild(role)}>
                    Add Child Role
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {role.children.map((child) => (
            <RoleNode
              key={child.id}
              role={child}
              level={level + 1}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onAssignUsers={onAssignUsers}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RoleNode;