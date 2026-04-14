/**
 * Object Permission Row Component
 * Single row in permission matrix with object visibility control
 */
import React from 'react';
import { TableCell, TableRow } from '../../../components/ui/table';
import { Check, X, Eye, EyeOff } from 'lucide-react';

const ObjectPermissionRow = ({ permission, readOnly, onPermissionChange }) => {
  const PermissionIcon = ({ granted }) => {
    if (granted) {
      return <Check className="h-4 w-4 text-green-600 mx-auto" />;
    }
    return <X className="h-4 w-4 text-slate-300 mx-auto" />;
  };

  const VisibilityIcon = ({ visible }) => {
    if (visible) {
      return <Eye className="h-4 w-4 text-blue-600 mx-auto" />;
    }
    return <EyeOff className="h-4 w-4 text-slate-300 mx-auto" />;
  };

  // Visible defaults to true for backward compatibility
  const isVisible = permission.visible !== false;

  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell className="font-medium capitalize">
        {permission.object_name}
      </TableCell>
      <TableCell className="text-center">
        <VisibilityIcon visible={isVisible} />
      </TableCell>
      <TableCell className="text-center">
        <PermissionIcon granted={permission.create} />
      </TableCell>
      <TableCell className="text-center">
        <PermissionIcon granted={permission.read} />
      </TableCell>
      <TableCell className="text-center">
        <PermissionIcon granted={permission.edit} />
      </TableCell>
      <TableCell className="text-center">
        <PermissionIcon granted={permission.delete} />
      </TableCell>
      <TableCell className="text-center">
        <PermissionIcon granted={permission.view_all} />
      </TableCell>
      <TableCell className="text-center">
        <PermissionIcon granted={permission.modify_all} />
      </TableCell>
    </TableRow>
  );
};

export default ObjectPermissionRow;