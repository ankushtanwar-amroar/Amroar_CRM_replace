/**
 * Field Permission Row Component
 * Single row in field permissions table
 */
import React from 'react';
import { TableCell, TableRow } from '../../../components/ui/table';
import PermissionToggle from './PermissionToggle';
import { Badge } from '../../../components/ui/badge';

const FieldPermissionRow = ({ field, permission, onUpdate }) => {
  const handleReadChange = (checked) => {
    onUpdate(field.field_name, 'read', checked);
  };

  const handleEditChange = (checked) => {
    onUpdate(field.field_name, 'edit', checked);
  };

  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell>
        <div>
          <div className="font-medium text-sm">{field.label || field.field_name}</div>
          <div className="text-xs text-slate-500">{field.field_name}</div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {field.type || 'text'}
        </Badge>
      </TableCell>
      <TableCell>
        <PermissionToggle
          checked={permission.read}
          onChange={handleReadChange}
        />
      </TableCell>
      <TableCell>
        <PermissionToggle
          checked={permission.edit}
          onChange={handleEditChange}
          disabled={!permission.read}
        />
      </TableCell>
    </TableRow>
  );
};

export default FieldPermissionRow;