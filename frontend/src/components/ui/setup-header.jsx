/**
 * SetupHeader - Reusable header component for setup pages
 * Includes back button to CRM Setup
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from './button';

const SetupHeader = ({ 
  icon: Icon, 
  iconBgColor = 'bg-blue-100',
  iconColor = 'text-blue-600',
  title, 
  description,
  children // For additional header actions
}) => {
  const navigate = useNavigate();

  return (
    <div className="px-6 py-4 border-b bg-white">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/setup')}
        className="mb-3 -ml-2 text-slate-600 hover:text-slate-900"
        data-testid="back-to-setup-btn"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to CRM Setup
      </Button>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {Icon && (
            <div className={`w-10 h-10 ${iconBgColor} rounded-lg flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {description && (
              <p className="text-sm text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex items-center space-x-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupHeader;
