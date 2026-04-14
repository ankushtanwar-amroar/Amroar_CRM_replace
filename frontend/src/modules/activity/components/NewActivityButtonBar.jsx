/**
 * NewActivityButtonBar - Action buttons for creating new activities
 * Renders configurable buttons based on activity types configuration
 * Supports max visible buttons with "More" dropdown for overflow
 */
import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Calendar, CheckCircle, Mail, Phone, FileText, ChevronDown, MoreHorizontal
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';

// Icon mapping
const IconMap = {
  calendar: Calendar,
  'check-circle': CheckCircle,
  mail: Mail,
  phone: Phone,
  'file-text': FileText,
};

// Color mapping for buttons
const buttonColors = {
  event: 'bg-purple-500 hover:bg-purple-600 text-white shadow-sm',
  task: 'bg-green-500 hover:bg-green-600 text-white shadow-sm',
  email: 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm',
  call: 'bg-teal-500 hover:bg-teal-600 text-white shadow-sm',
  note: 'bg-slate-500 hover:bg-slate-600 text-white shadow-sm',
};

// Dropdown item colors (lighter version)
const dropdownColors = {
  event: 'text-purple-700 bg-purple-50 hover:bg-purple-100',
  task: 'text-green-700 bg-green-50 hover:bg-green-100',
  email: 'text-blue-700 bg-blue-50 hover:bg-blue-100',
  call: 'text-teal-700 bg-teal-50 hover:bg-teal-100',
  note: 'text-slate-700 bg-slate-50 hover:bg-slate-100',
};

/**
 * More Dropdown for overflow buttons
 */
const MoreDropdown = ({ overflowButtons, onNewActivity, disabled, compact }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (overflowButtons.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        size={compact ? 'sm' : 'default'}
        variant="outline"
        className={`${compact ? 'h-8 text-xs px-3' : ''} border-slate-300 hover:bg-slate-100`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        data-testid="more-activities-btn"
      >
        <MoreHorizontal className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} mr-1.5`} />
        More
        <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 h-4 bg-slate-200">
          {overflowButtons.length}
        </Badge>
        <ChevronDown className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-52 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-slate-100">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">More Actions</span>
          </div>
          {overflowButtons.map((activityType) => {
            const IconComponent = IconMap[activityType.icon] || Plus;
            const colorClass = dropdownColors[activityType.type] || dropdownColors.note;

            return (
              <button
                key={activityType.type}
                onClick={() => {
                  onNewActivity(activityType);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 ${colorClass} transition-colors`}
                data-testid={`more-${activityType.type}-btn`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${buttonColors[activityType.type]?.replace('shadow-sm', '') || 'bg-slate-500 text-white'}`}>
                  <IconComponent className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 text-left">
                  <span className="text-sm font-medium">
                    {activityType.newButtonLabel || `New ${activityType.label}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const NewActivityButtonBar = ({
  activityTypes = [],
  onNewActivity,
  disabled = false,
  compact = false,
  maxVisibleButtons = 3,
  className = '',
}) => {
  // Filter to only activity types with buttons enabled
  const buttonsToShow = activityTypes.filter(t => t.newButtonEnabled);
  
  if (buttonsToShow.length === 0) {
    return null;
  }

  // Split into visible and overflow buttons
  const visibleButtons = buttonsToShow.slice(0, maxVisibleButtons);
  const overflowButtons = buttonsToShow.slice(maxVisibleButtons);
  
  const handleClick = (type) => {
    if (onNewActivity) {
      onNewActivity(type);
    }
  };
  
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} data-testid="activity-button-bar">
      {/* Visible Buttons */}
      {visibleButtons.map((activityType) => {
        const IconComponent = IconMap[activityType.icon] || Plus;
        const colorClass = buttonColors[activityType.type] || buttonColors.note;
        
        return (
          <Button
            key={activityType.type}
            size={compact ? 'sm' : 'default'}
            className={`${colorClass} ${compact ? 'h-8 text-xs px-3' : ''} transition-all hover:scale-[1.02]`}
            onClick={() => handleClick(activityType)}
            disabled={disabled}
            data-testid={`new-${activityType.type}-btn`}
          >
            <IconComponent className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} mr-1.5`} />
            {activityType.newButtonLabel || `New ${activityType.label}`}
          </Button>
        );
      })}

      {/* More Dropdown for overflow buttons */}
      <MoreDropdown
        overflowButtons={overflowButtons}
        onNewActivity={handleClick}
        disabled={disabled}
        compact={compact}
      />
    </div>
  );
};

export default NewActivityButtonBar;
