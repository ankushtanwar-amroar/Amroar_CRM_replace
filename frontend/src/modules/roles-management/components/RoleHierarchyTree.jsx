/**
 * Role Hierarchy Tree Component
 * Visual tree representation of role hierarchy
 */
import React from 'react';
import { ChevronDown, ChevronRight, Users, MoreVertical, Pencil, Trash2, Shield } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../../components/ui/dropdown-menu';
import { Badge } from '../../../components/ui/badge';
import { cn } from '../../../lib/utils';

const RoleHierarchyTree = ({
  nodes,
  expandedNodes,
  selectedRole,
  onToggleExpand,
  onSelectRole,
  onEditRole,
  onDeleteRole,
  level = 0
}) => {
  const renderNode = (node, depth) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedRole === node.id;

    return (
      <div key={node.id} data-testid={`role-node-${node.id}`}>
        <div
          className={cn(
            "flex items-center py-2 px-3 rounded-lg cursor-pointer transition-colors group",
            isSelected 
              ? "bg-indigo-100 border border-indigo-200" 
              : "hover:bg-slate-100",
            depth > 0 && "ml-6"
          )}
          style={{ marginLeft: depth * 24 }}
          onClick={() => onSelectRole(node.id)}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              className="p-1 mr-2 hover:bg-slate-200 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              data-testid={`toggle-${node.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
            </button>
          ) : (
            <div className="w-6 mr-2" />
          )}

          {/* Role Icon */}
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center mr-3",
            isSelected ? "bg-indigo-500" : "bg-slate-200"
          )}>
            <Users className={cn(
              "h-4 w-4",
              isSelected ? "text-white" : "text-slate-600"
            )} />
          </div>

          {/* Role Name */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center">
              <span className={cn(
                "font-medium truncate",
                isSelected ? "text-indigo-900" : "text-slate-900"
              )}>
                {node.name}
              </span>
              {node.is_system_role && (
                <Badge variant="outline" className="ml-2 text-xs bg-purple-50 text-purple-700 border-purple-200">
                  <Shield className="h-3 w-3 mr-1" />
                  System
                </Badge>
              )}
            </div>
            <div className="flex items-center text-xs text-slate-500">
              <Users className="h-3 w-3 mr-1" />
              {node.assigned_users_count || 0} user{node.assigned_users_count !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Actions Dropdown */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onEditRole(node);
                }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Role
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Are you sure you want to delete "${node.name}"?`)) {
                      onDeleteRole(node.id);
                    }
                  }}
                  disabled={node.is_system_role}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Role
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1" data-testid="role-hierarchy-tree">
      {nodes.map(node => renderNode(node, 0))}
    </div>
  );
};

export default RoleHierarchyTree;
