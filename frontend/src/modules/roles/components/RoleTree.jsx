/**
 * Role Tree Component
 * Displays full role hierarchy
 */
import React from 'react';
import RoleNode from './RoleNode';
import { Loader2 } from 'lucide-react';

const RoleTree = ({ hierarchyTree, loading, onAddChild, onEdit, onAssignUsers }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!hierarchyTree || hierarchyTree.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>No roles found</p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      {hierarchyTree.map((role) => (
        <RoleNode
          key={role.id}
          role={role}
          level={0}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onAssignUsers={onAssignUsers}
        />
      ))}
    </div>
  );
};

export default RoleTree;