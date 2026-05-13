import React from 'react';
import { CheckCircle2, Lock, Clock } from 'lucide-react';

/**
 * ProviderCard Component
 * Displays a CRM/Integration provider option with support for multiple states
 * 
 * Props:
 * - provider: { icon, name, description, id, status }
 * - isSelected: boolean
 * - isDisabled: boolean
 * - isBeta: boolean
 * - onSelect: () => void
 * - badge: string ('connected', 'active', 'coming-soon', 'disabled')
 * - tooltip: string (shown on hover for disabled states)
 */
const ProviderCard = ({
  provider,
  isSelected = false,
  isDisabled = false,
  isBeta = false,
  onSelect,
  badge,
  tooltip,
  connectionStatus = null,
}) => {
  const { icon: Icon, name, description, id } = provider;

  // Determine badge display
  const getBadgeContent = () => {
    if (badge === 'connected' || badge === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">
          <CheckCircle2 className="h-3 w-3" />
          {badge === 'connected' ? 'Connected' : 'Active'}
        </span>
      );
    }
    if (badge === 'coming-soon') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full">
          <Clock className="h-3 w-3" />
          Coming Soon
        </span>
      );
    }
    if (badge === 'disabled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded-full">
          <Lock className="h-3 w-3" />
          Disabled
        </span>
      );
    }
    if (isBeta) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-full">
          Beta
        </span>
      );
    }
    return null;
  };

  const baseClasses = `
    relative w-full p-4 rounded-lg border-2 text-left transition-all duration-200
    ${isDisabled 
      ? 'cursor-not-allowed opacity-65 border-gray-200 bg-gray-50 hover:border-gray-200' 
      : 'cursor-pointer'
    }
    ${isSelected && !isDisabled
      ? 'border-indigo-500 bg-indigo-50/70 shadow-sm'
      : !isDisabled
        ? 'border-gray-200 hover:border-indigo-300 hover:shadow-sm hover:bg-indigo-50/30'
        : ''
    }
  `;

  const handleClick = () => {
    if (!isDisabled && onSelect) {
      onSelect(id);
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={baseClasses}
        title={tooltip || undefined}
        data-testid={`provider-card-${id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          {/* Icon */}
          <div className={`p-2.5 rounded-lg transition-colors ${
            isSelected && !isDisabled
              ? 'bg-indigo-100'
              : isDisabled
                ? 'bg-gray-100'
                : 'bg-gray-100 group-hover:bg-indigo-100'
          }`}>
            <Icon className={`h-5 w-5 transition-colors ${
              isSelected && !isDisabled
                ? 'text-indigo-600'
                : isDisabled
                  ? 'text-gray-400'
                  : 'text-gray-600 group-hover:text-indigo-600'
            }`} />
          </div>

          {/* Badge */}
          <div>
            {getBadgeContent()}
          </div>
        </div>

        {/* Provider Name */}
        <h4 className={`font-semibold text-sm mb-0.5 transition-colors ${
          isSelected && !isDisabled
            ? 'text-indigo-900'
            : isDisabled
              ? 'text-gray-500'
              : 'text-gray-900 group-hover:text-indigo-900'
        }`}>
          {name}
        </h4>

        {/* Description */}
        <p className={`text-xs mb-2 transition-colors ${
          isSelected && !isDisabled
            ? 'text-indigo-700'
            : isDisabled
              ? 'text-gray-400'
              : 'text-gray-600 group-hover:text-gray-700'
        }`}>
          {description}
        </p>

        {/* Selection Indicator */}
        {isSelected && !isDisabled && (
          <div className="absolute top-3 right-3 animate-in fade-in">
            <CheckCircle2 className="h-5 w-5 text-indigo-600" />
          </div>
        )}
      </button>

      {/* Tooltip for disabled states */}
      {isDisabled && tooltip && (
        <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-[10px] text-white bg-gray-900 px-2.5 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-md">
          {tooltip}
          {/* Tooltip arrow */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
        </div>
      )}
    </div>
  );
};

export default ProviderCard;
