/**
 * Field Permissions Table Component
 * Displays field permissions matrix
 */
import React from 'react';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import FieldPermissionRow from './FieldPermissionRow';
import { Loader2 } from 'lucide-react';

const FieldPermissionsTable = ({ fields, permissions, onUpdate, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!fields || fields.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        Select an object to view field permissions
      </div>
    );
  }

  return (
    <Table>
      <TableHeader className="bg-slate-50">
        <TableRow>
          <TableHead className="w-96">Field Name</TableHead>
          <TableHead className="w-32">Type</TableHead>
          <TableHead className="text-center w-24">Read</TableHead>
          <TableHead className="text-center w-24">Edit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.map((field) => {
          // Find permission for this field
          const perm = permissions.find(p => p.field_name === field.field_name) || {
            field_name: field.field_name,
            read: true,
            edit: true
          };
          
          return (
            <FieldPermissionRow
              key={field.field_name}
              field={field}
              permission={perm}
              onUpdate={onUpdate}
            />
          );
        })}
      </TableBody>
    </Table>
  );
};

export default FieldPermissionsTable;