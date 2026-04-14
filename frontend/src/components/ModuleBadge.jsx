/**
 * ModuleBadge Component
 * 
 * Displays the access status badge for a module based on its state.
 * 
 * States:
 * - ACTIVE: No badge shown (module is fully accessible)
 * - PLAN_LOCKED: Shows lock icon only (no text)
 * - ADMIN_DISABLED: Shows "Disabled" badge
 * - LICENSE_REQUIRED: Shows "License Required" badge
 * - LOADING: Shows loading spinner
 */
import React from 'react';
import { Badge } from './ui/badge';
import { 
  Lock, 
  AlertTriangle, 
  Ban, 
  Sparkles, 
  Loader2,
  ArrowUpRight
} from 'lucide-react';
import { MODULE_STATES } from '../hooks/useModuleEntitlements';

const ModuleBadge = ({ state, reason, compact = false, showTooltip = true }) => {
  if (!state || state === MODULE_STATES.ACTIVE) {
    return null;
  }

  const configs = {
    [MODULE_STATES.PLAN_LOCKED]: {
      icon: Lock,
      label: '', // No label, just icon
      className: 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200',
      tooltip: reason || 'Not included in your current plan'
    },
    [MODULE_STATES.ADMIN_DISABLED]: {
      icon: Ban,
      label: compact ? '' : 'Disabled',
      className: 'bg-slate-100 text-slate-500 border-slate-200',
      tooltip: reason || 'Disabled by administrator'
    },
    [MODULE_STATES.LICENSE_REQUIRED]: {
      icon: AlertTriangle,
      label: compact ? '' : 'License',
      className: 'bg-purple-100 text-purple-700 border-purple-200',
      tooltip: reason || 'Requires license'
    },
    [MODULE_STATES.LOADING]: {
      icon: Loader2,
      label: '',
      className: 'bg-slate-100 text-slate-400',
      tooltip: 'Loading...'
    }
  };

  const config = configs[state] || configs[MODULE_STATES.PLAN_LOCKED];
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`ml-2 text-xs py-0 px-1.5 gap-1 ${config.className}`}
      title={showTooltip ? config.tooltip : undefined}
    >
      <Icon className={`h-3 w-3 ${state === MODULE_STATES.LOADING ? 'animate-spin' : ''}`} />
      {config.label && <span>{config.label}</span>}
    </Badge>
  );
};

/**
 * ModuleMenuItem Component
 * 
 * A menu item that shows the module name with its access state badge.
 * Clicking a locked module could show an upgrade modal.
 */
const ModuleMenuItem = ({ 
  name, 
  icon: Icon, 
  state, 
  reason, 
  onClick, 
  isActive, 
  className = '',
  onUpgradeClick 
}) => {
  const isAccessible = !state || state === MODULE_STATES.ACTIVE;
  const isLocked = state === MODULE_STATES.PLAN_LOCKED;
  const isDisabled = state === MODULE_STATES.ADMIN_DISABLED;
  const needsLicense = state === MODULE_STATES.LICENSE_REQUIRED;

  const handleClick = (e) => {
    if (isAccessible) {
      onClick?.(e);
    } else if (isLocked && onUpgradeClick) {
      onUpgradeClick(e);
    }
    // Disabled and license-required items don't navigate
  };

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        w-full flex items-center justify-between px-3 py-2 rounded-md text-sm
        transition-colors
        ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : ''}
        ${isAccessible ? 'hover:bg-slate-50 cursor-pointer' : ''}
        ${isLocked ? 'hover:bg-amber-50/50 cursor-pointer opacity-75' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${needsLicense ? 'opacity-75 cursor-default' : ''}
        ${className}
      `}
      title={!isAccessible ? reason : undefined}
    >
      <div className="flex items-center">
        {Icon && <Icon className="h-4 w-4 mr-2 flex-shrink-0" />}
        <span>{name}</span>
      </div>
      <div className="flex items-center">
        <ModuleBadge state={state} reason={reason} compact />
        {isLocked && (
          <ArrowUpRight className="h-3 w-3 ml-1 text-amber-600" />
        )}
      </div>
    </button>
  );
};

/**
 * ModuleCard Component
 * 
 * A card displaying module info with its access state.
 * Useful for settings pages or module listings.
 */
const ModuleCard = ({ 
  name, 
  description, 
  icon: Icon, 
  state, 
  reason, 
  onClick,
  onUpgradeClick 
}) => {
  const isAccessible = !state || state === MODULE_STATES.ACTIVE;
  const isLocked = state === MODULE_STATES.PLAN_LOCKED;

  return (
    <div 
      className={`
        p-4 border rounded-lg transition-all
        ${isAccessible ? 'hover:shadow-md hover:border-indigo-300 cursor-pointer' : ''}
        ${isLocked ? 'hover:border-amber-300 cursor-pointer bg-amber-50/30' : ''}
        ${!isAccessible && !isLocked ? 'opacity-60' : ''}
      `}
      onClick={isAccessible ? onClick : (isLocked ? onUpgradeClick : undefined)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center">
          {Icon && (
            <div className={`
              h-10 w-10 rounded-lg flex items-center justify-center mr-3
              ${isAccessible ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}
            `}>
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div>
            <div className="flex items-center">
              <h3 className="font-medium text-slate-900">{name}</h3>
              <ModuleBadge state={state} reason={reason} />
            </div>
            {description && (
              <p className="text-sm text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Locked state message */}
      {!isAccessible && reason && (
        <div className={`
          mt-3 pt-3 border-t text-xs
          ${isLocked ? 'text-amber-600 border-amber-200' : 'text-slate-500 border-slate-200'}
        `}>
          {reason}
        </div>
      )}
    </div>
  );
};

/**
 * UpgradePrompt Component
 * 
 * Shows an upgrade message when user tries to access a locked module.
 */
const UpgradePrompt = ({ moduleName, planName, onUpgrade, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-center mb-4">
          <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center">
            <Lock className="h-6 w-6 text-amber-600" />
          </div>
        </div>
        
        <h3 className="text-lg font-semibold text-center text-slate-900">
          Upgrade to Access {moduleName}
        </h3>
        
        <p className="text-center text-slate-500 mt-2">
          {moduleName} is not included in your current {planName || 'plan'}. 
          Upgrade to unlock this feature and more.
        </p>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
          >
            Maybe Later
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            View Plans
          </button>
        </div>
      </div>
    </div>
  );
};

export { ModuleBadge, ModuleMenuItem, ModuleCard, UpgradePrompt };
export default ModuleBadge;
