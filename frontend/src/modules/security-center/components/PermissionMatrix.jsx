/**
 * Permission Matrix Component
 * Displays object permissions in a Salesforce-style matrix
 * Now includes 'Visible' column for object visibility control
 */
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import ObjectPermissionRow from './ObjectPermissionRow';

const PermissionMatrix = ({ permissions, readOnly = true, onPermissionChange }) => {
  return (
    <Table>
      <TableHeader className="bg-slate-50">
        <TableRow>
          <TableHead className="font-semibold w-48">Object</TableHead>
          <TableHead className="text-center w-24">Visible</TableHead>
          <TableHead className="text-center w-24">Create</TableHead>
          <TableHead className="text-center w-24">Read</TableHead>
          <TableHead className="text-center w-24">Edit</TableHead>
          <TableHead className="text-center w-24">Delete</TableHead>
          <TableHead className="text-center w-24">View All</TableHead>
          <TableHead className="text-center w-24">Modify All</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {permissions && permissions.length > 0 ? (
          permissions.map((perm) => (
            <ObjectPermissionRow
              key={perm.object_name}
              permission={perm}
              readOnly={readOnly}
              onPermissionChange={onPermissionChange}
            />
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-8 text-slate-500">
              No permissions defined
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default PermissionMatrix;