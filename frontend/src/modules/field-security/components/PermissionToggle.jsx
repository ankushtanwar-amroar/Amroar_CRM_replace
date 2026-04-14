/**
 * Permission Toggle Component
 * Checkbox for field permissions
 */
import React from 'react';
import { Checkbox } from '../../../components/ui/checkbox';

const PermissionToggle = ({ checked, onChange, disabled = false }) => {
  return (
    <div className="flex items-center justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
};

export default PermissionToggle;