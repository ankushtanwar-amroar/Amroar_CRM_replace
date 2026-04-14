/**
 * Quick Actions Component - Command Bar Edition
 * 
 * Clean, modern command bar for creating records and navigating.
 * Minimal design with keyboard shortcuts and smooth animations.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UserPlus, User, Building, Target, CheckSquare, Calendar, 
  Phone, MoreHorizontal, Plus, Command, Zap
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { getQuickActionsData } from '../services/appManagerService';

// Icon mapping with modern color scheme
const iconConfig = {
  'user-plus': { icon: UserPlus, bg: 'bg-orange-500', hoverBg: 'hover:bg-orange-600' },
  'user': { icon: User, bg: 'bg-violet-500', hoverBg: 'hover:bg-violet-600' },
  'building': { icon: Building, bg: 'bg-blue-500', hoverBg: 'hover:bg-blue-600' },
  'target': { icon: Target, bg: 'bg-emerald-500', hoverBg: 'hover:bg-emerald-600' },
  'check-square': { icon: CheckSquare, bg: 'bg-indigo-500', hoverBg: 'hover:bg-indigo-600' },
  'calendar': { icon: Calendar, bg: 'bg-rose-500', hoverBg: 'hover:bg-rose-600' },
  'phone': { icon: Phone, bg: 'bg-teal-500', hoverBg: 'hover:bg-teal-600' },
  'plus': { icon: Plus, bg: 'bg-slate-500', hoverBg: 'hover:bg-slate-600' }
};

const QuickActionsComponent = ({ config = {} }) => {
  const navigate = useNavigate();
  
  // Normalize actions - handle both array and object formats from Page Builder
  const normalizeActions = (actionsInput) => {
    if (!actionsInput) return null;
    if (Array.isArray(actionsInput)) return actionsInput;
    // If it's an object (from Page Builder config), return null to fetch from API
    return null;
  };
  
  const initialActions = normalizeActions(config.actions);
  const [actions, setActions] = useState(initialActions || []);
  const [loading, setLoading] = useState(!initialActions);

  useEffect(() => {
    if (!initialActions) {
      fetchActions();
    }
  }, []);

  const fetchActions = async () => {
    setLoading(true);
    try {
      const data = await getQuickActionsData();
      setActions(data.actions || []);
    } catch (err) {
      console.error('Error fetching quick actions:', err);
      setActions([
        { id: 'new_lead', label: 'New Lead', icon: 'user-plus', action_type: 'create_record', object: 'lead' },
        { id: 'new_contact', label: 'New Contact', icon: 'user', action_type: 'create_record', object: 'contact' },
        { id: 'new_account', label: 'New Account', icon: 'building', action_type: 'create_record', object: 'account' },
        { id: 'new_opportunity', label: 'New Opportunity', icon: 'target', action_type: 'create_record', object: 'opportunity' },
        { id: 'new_task', label: 'New Task', icon: 'check-square', action_type: 'create_record', object: 'task' },
        { id: 'new_event', label: 'New Event', icon: 'calendar', action_type: 'create_record', object: 'event' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (action) => {
    if (action.action_type === 'create_record') {
      // Navigate to CRM with create action query param
      // The CRM platform will pick up the ?action=new param and open create dialog
      navigate(`/crm/${action.object}?action=new`);
    } else if (action.action_type === 'navigate') {
      navigate(action.route || `/crm/${action.object}`);
    }
  };

  const getIconConfig = (iconName) => {
    return iconConfig[iconName] || iconConfig['plus'];
  };

  const maxVisible = config.max_visible || 6;
  const safeActions = Array.isArray(actions) ? actions : [];
  const visibleActions = safeActions.slice(0, maxVisible);
  const overflowActions = safeActions.slice(maxVisible);

  if (loading) {
    return (
      <div 
        className="bg-slate-900/5 backdrop-blur-sm rounded-xl border border-slate-200/80 p-4"
        data-testid="quick-actions-component"
      >
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="animate-pulse h-10 w-24 bg-slate-200/60 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="bg-slate-900/[0.02] backdrop-blur-sm rounded-xl border border-slate-200/80 p-4 transition-all duration-300"
      data-testid="quick-actions-component"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-900/5">
            <Zap className="h-3.5 w-3.5 text-slate-600" />
          </div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Actions</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <Command className="h-3 w-3" />
          <span>K</span>
        </div>
      </div>
      
      {/* Actions Row */}
      <div className="flex flex-wrap items-center gap-2">
        {visibleActions.map((action, index) => {
          const iconCfg = getIconConfig(action.icon);
          const IconComponent = iconCfg.icon;
          
          return (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              className={`group relative flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200/80 
                shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5
                transition-all duration-200 ease-out active:scale-[0.97]`}
              style={{ animationDelay: `${index * 50}ms` }}
              data-testid={`quick-action-${action.id}`}
            >
              {/* Icon */}
              <div className={`flex items-center justify-center w-6 h-6 rounded-md ${iconCfg.bg} ${iconCfg.hoverBg} transition-colors shadow-sm`}>
                <IconComponent className="h-3.5 w-3.5 text-white" />
              </div>
              
              {/* Label */}
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors whitespace-nowrap">
                {action.label}
              </span>
            </button>
          );
        })}
        
        {overflowActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center w-10 h-10 bg-white rounded-lg border border-slate-200/80 
                  shadow-sm hover:shadow-md hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
                data-testid="quick-actions-overflow"
              >
                <MoreHorizontal className="h-4 w-4 text-slate-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1.5">
              {overflowActions.map((action) => {
                const iconCfg = getIconConfig(action.icon);
                const IconComponent = iconCfg.icon;
                return (
                  <DropdownMenuItem
                    key={action.id}
                    onClick={() => handleActionClick(action)}
                    className="flex items-center gap-2.5 px-2.5 py-2 cursor-pointer rounded-md hover:bg-slate-100"
                    data-testid={`quick-action-overflow-${action.id}`}
                  >
                    <div className={`flex items-center justify-center w-6 h-6 rounded-md ${iconCfg.bg}`}>
                      <IconComponent className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-sm font-medium text-slate-700">{action.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

export default QuickActionsComponent;
