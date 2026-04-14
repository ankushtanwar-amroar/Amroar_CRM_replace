/**
 * Work Queue Component - Premium Edition
 * 
 * Shows records needing attention based on inactivity.
 * Modern, clean design with enhanced visual hierarchy.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Inbox, Clock, AlertTriangle, ChevronRight, RefreshCw,
  User, Building, Target, UserPlus, TrendingDown
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { getWorkQueueData } from '../services/appManagerService';

const objectIcons = {
  lead: { icon: UserPlus, gradient: 'from-orange-500 to-amber-500' },
  account: { icon: Building, gradient: 'from-blue-500 to-cyan-500' },
  contact: { icon: User, gradient: 'from-purple-500 to-violet-500' },
  opportunity: { icon: Target, gradient: 'from-emerald-500 to-teal-500' }
};

const WorkQueueComponent = ({ config = {} }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [objectType, setObjectType] = useState(config.object_type || 'lead');

  const fetchWorkQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWorkQueueData({
        object_type: objectType,
        inactivity_days: config.inactivity_days || 7,
        max_rows: config.max_rows || 10,
        sort_order: config.sort_order || 'oldest_first'
      });
      setItems(data.items || []);
    } catch (err) {
      setError('Failed to load work queue');
      console.error('Error fetching work queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkQueue();
  }, [objectType]);

  const handleItemClick = (item) => {
    navigate(`/crm/${item.object_type}/${item.id}`);
  };

  const getInactivityStyle = (days) => {
    if (days >= 30) return { 
      bg: 'bg-rose-50', 
      border: 'border-rose-200',
      text: 'text-rose-700',
      icon: 'text-rose-500'
    };
    if (days >= 14) return { 
      bg: 'bg-amber-50', 
      border: 'border-amber-200',
      text: 'text-amber-700',
      icon: 'text-amber-500'
    };
    return { 
      bg: 'bg-slate-50', 
      border: 'border-slate-200',
      text: 'text-slate-600',
      icon: 'text-slate-400'
    };
  };

  const objectTypeOptions = [
    { value: 'lead', label: 'Leads' },
    { value: 'account', label: 'Accounts' },
    { value: 'contact', label: 'Contacts' },
    { value: 'opportunity', label: 'Opportunities' }
  ];

  const objectConfig = objectIcons[objectType] || objectIcons.lead;

  return (
    <div 
      className="bg-white rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-200/50 overflow-hidden flex flex-col"
      style={{ height: '380px', minHeight: '380px', maxHeight: '380px' }}
      data-testid="work-queue-component"
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
              <Inbox className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                {config.title || 'Work Queue'}
              </h3>
              <p className="text-sm text-slate-500">
                {items.length > 0 ? `${items.length} items need attention` : 'Records needing follow-up'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={objectType} onValueChange={setObjectType}>
              <SelectTrigger className="w-[120px] h-9 text-sm bg-slate-50 border-slate-200 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {objectTypeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={fetchWorkQueue}
              className="h-9 w-9 rounded-lg hover:bg-slate-100"
              data-testid="refresh-work-queue-btn"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {/* Inactivity Info */}
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          <span>Records with no activity in {config.inactivity_days || 7}+ days</span>
        </div>
      </div>

      {/* Content - Scrollable area */}
      <div className="px-6 py-4 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-4 py-3">
                <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-3">
              <AlertTriangle className="h-6 w-6 text-rose-500" />
            </div>
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-base font-medium text-slate-800 mb-1">All caught up!</p>
            <p className="text-sm text-slate-500">No {objectType}s need attention</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const ItemConfig = objectIcons[item.object_type] || objectIcons.lead;
              const ItemIcon = ItemConfig.icon;
              const inactivityStyle = getInactivityStyle(item.days_inactive);

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`group relative flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200 
                    hover:shadow-sm ${inactivityStyle.bg} border ${inactivityStyle.border} hover:border-slate-300`}
                  data-testid={`work-queue-item-${item.id}`}
                >
                  {/* Icon */}
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${ItemConfig.gradient} shadow-sm`}>
                    <ItemIcon className="h-5 w-5 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last activity: {item.last_activity_date 
                          ? new Date(item.last_activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'Never'
                        }
                      </span>
                    </div>
                  </div>

                  {/* Inactivity Badge */}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${inactivityStyle.bg} border ${inactivityStyle.border}`}>
                    <TrendingDown className={`h-3.5 w-3.5 ${inactivityStyle.icon}`} />
                    <span className={`text-xs font-semibold ${inactivityStyle.text}`}>
                      {item.days_inactive}d
                    </span>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={() => navigate(`/crm/${objectType}`)}
            className="w-full text-center text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
            data-testid="view-all-work-queue-btn"
          >
            View All {objectTypeOptions.find(o => o.value === objectType)?.label} →
          </button>
        </div>
      )}
    </div>
  );
};

export default WorkQueueComponent;
