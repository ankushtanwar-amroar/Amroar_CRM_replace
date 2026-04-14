import React from 'react';
import { Bell, AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

/**
 * Toast Placeholder Component
 * Shows a visual placeholder in Screen Builder (authoring mode)
 * Actual toast only renders at runtime/preview execution
 */
const ToastPlaceholder = ({ field, isSelected, onClick, onDelete }) => {
  console.log('[TOAST PLACEHOLDER] Rendered:', { fieldId: field.id, isSelected });
  
  const getToastIcon = () => {
    switch (field.variant || 'info') {
      case 'success': return CheckCircle;
      case 'error': return AlertCircle;
      case 'warning': return AlertTriangle;
      case 'info': return Info;
      default: return Bell;
    }
  };

  const getVariantColors = () => {
    switch (field.variant || 'info') {
      case 'success': return 'border-green-300 bg-green-50 text-green-700';
      case 'error': return 'border-red-300 bg-red-50 text-red-700';
      case 'warning': return 'border-yellow-300 bg-yellow-50 text-yellow-700';
      case 'info': return 'border-blue-300 bg-blue-50 text-blue-700';
      default: return 'border-gray-300 bg-gray-50 text-gray-700';
    }
  };

  const getBadgeColor = () => {
    switch (field.variant || 'info') {
      case 'success': return 'bg-green-600 text-white';
      case 'error': return 'bg-red-600 text-white';
      case 'warning': return 'bg-yellow-600 text-white';
      case 'info': return 'bg-blue-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  const Icon = getToastIcon();
  const variantColors = getVariantColors();
  const badgeColor = getBadgeColor();
  const variantLabel = (field.variant || 'info').toUpperCase();

  return (
    <div
      className={`relative border-2 rounded-lg p-4 transition-all ${
        isSelected ? 'ring-2 ring-blue-500 border-blue-500 shadow-lg' : variantColors
      }`}
      style={{ position: 'relative' }}
    >
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          console.log('[TOAST DELETE] Deleting toast:', field.id);
          onDelete();
        }}
        className="absolute top-2 right-2 p-1 hover:bg-red-100 rounded-full transition-colors z-10"
        title="Delete"
      >
        <X className="h-4 w-4 text-red-600" />
      </button>

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded-lg ${badgeColor}`}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase">Toast (Runtime Only)</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${badgeColor}`}>
              {variantLabel}
            </span>
            {field.variant === 'error' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-800 text-white">
                TERMINAL
              </span>
            )}
          </div>

          {field.title && (
            <div className="text-sm font-semibold text-gray-800 mb-1">
              {field.title}
            </div>
          )}

          {field.message && (
            <div className="text-sm text-gray-600 line-clamp-2">
              {field.message}
            </div>
          )}

          {!field.message && (
            <div className="text-sm text-gray-400 italic">
              No message configured
            </div>
          )}

          {/* Display condition indicator */}
          {field.displayCondition && field.displayCondition.enabled && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <Info className="h-3 w-3" />
              <span>Conditional: {field.displayCondition.formula || 'No formula'}</span>
            </div>
          )}

          {/* Trigger timing indicator */}
          <div className="mt-2 text-xs text-gray-500">
            <span className="font-medium">Trigger:</span>{' '}
            {field.triggerTiming === 'onNextClick' ? 'On Next Click' : 'On Screen Load'}
          </div>
        </div>
      </div>

      {/* Position indicator */}
      <div className="absolute bottom-2 right-2 text-xs text-gray-400">
        {(field.position || 'top-right').replace('-', ' ')}
      </div>
    </div>
  );
};

export default ToastPlaceholder;
