/**
 * OWD Table Component
 * Displays organization-wide defaults per object
 */
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import { Loader2 } from 'lucide-react';

const ACCESS_OPTIONS = {
  'private': { label: 'Private', description: 'Only owner can access' },
  'public_read_only': { label: 'Public Read Only', description: 'All users can view' },
  'public_read_write': { label: 'Public Read/Write', description: 'All users can view and edit' }
};

const OWDTable = ({ settings, onUpdate, loading }) => {
  const getAccessLabel = (access) => {
    return ACCESS_OPTIONS[access]?.label || 'Private';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader className="bg-slate-50">
        <TableRow>
          <TableHead className="w-48">Object</TableHead>
          <TableHead>Default Access</TableHead>
          <TableHead className="text-center w-64">Grant Access Using Hierarchies</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {settings.map((setting) => {
          // Use default_internal_access which is the correct field from backend
          const currentAccess = setting.default_internal_access || setting.default_access || 'private';
          
          return (
            <TableRow key={setting.object_name}>
              <TableCell className="font-medium">
                {setting.label || setting.object_name}
              </TableCell>
              <TableCell>
                <Select
                  value={currentAccess}
                  onValueChange={(value) => onUpdate(setting.object_name, { 
                    default_internal_access: value, 
                    grant_access_using_hierarchies: setting.grant_access_using_hierarchies 
                  })}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select access level">
                      {getAccessLabel(currentAccess)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">
                      <div>
                        <div className="font-medium">Private</div>
                        <div className="text-xs text-slate-500">Only owner can access</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="public_read_only">
                      <div>
                        <div className="font-medium">Public Read Only</div>
                        <div className="text-xs text-slate-500">All users can view</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="public_read_write">
                      <div>
                        <div className="font-medium">Public Read/Write</div>
                        <div className="text-xs text-slate-500">All users can view and edit</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center space-x-2">
                  <Switch
                    checked={setting.grant_access_using_hierarchies}
                    onCheckedChange={(checked) => onUpdate(setting.object_name, { 
                      default_internal_access: currentAccess, 
                      grant_access_using_hierarchies: checked 
                    })}
                  />
                  <span className="text-sm text-slate-600">
                    {setting.grant_access_using_hierarchies ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default OWDTable;