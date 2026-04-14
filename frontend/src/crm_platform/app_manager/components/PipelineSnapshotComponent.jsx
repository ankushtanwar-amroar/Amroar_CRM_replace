/**
 * Pipeline Snapshot Component - Premium Edition
 * 
 * Visual snapshot of pipeline stages with counts and amounts.
 * Modern, clean design with enhanced chart visualization.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, DollarSign, RefreshCw, AlertCircle, 
  BarChart3, ArrowUpRight, Layers
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { getPipelineSnapshotData } from '../services/appManagerService';

const PipelineSnapshotComponent = ({ config = {} }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [objectType, setObjectType] = useState(config.object_type || 'opportunity');
  const [dateRange, setDateRange] = useState(config.date_range || 'this_quarter');

  const fetchPipelineData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPipelineSnapshotData({
        object_type: objectType,
        group_by: config.group_by || 'stage',
        display_mode: config.display_mode || 'both',
        date_range: dateRange
      });
      setData(result);
    } catch (err) {
      setError('Failed to load pipeline data');
      console.error('Error fetching pipeline:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipelineData();
  }, [objectType, dateRange]);

  const formatAmount = (amount) => {
    if (!amount) return '$0';
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const getStageColor = (index, total) => {
    // Beautiful gradient colors that flow naturally
    const colors = [
      { bar: 'from-violet-500 to-violet-400', bg: 'bg-violet-50', text: 'text-violet-700' },
      { bar: 'from-blue-500 to-blue-400', bg: 'bg-blue-50', text: 'text-blue-700' },
      { bar: 'from-cyan-500 to-cyan-400', bg: 'bg-cyan-50', text: 'text-cyan-700' },
      { bar: 'from-teal-500 to-teal-400', bg: 'bg-teal-50', text: 'text-teal-700' },
      { bar: 'from-emerald-500 to-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
      { bar: 'from-amber-500 to-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
    ];
    return colors[index % colors.length];
  };

  const handleStageClick = (stage) => {
    navigate(`/sales/${objectType}?stage=${encodeURIComponent(stage.stage)}`);
  };

  const dateRangeOptions = [
    { value: 'this_month', label: 'This Month' },
    { value: 'this_quarter', label: 'This Quarter' },
    { value: 'this_year', label: 'This Year' },
    { value: 'all', label: 'All Time' }
  ];

  const objectTypeOptions = [
    { value: 'opportunity', label: 'Opportunities' },
    { value: 'lead', label: 'Leads' }
  ];

  const maxCount = data?.stages?.length > 0 
    ? Math.max(...data.stages.map(s => s.count)) 
    : 0;

  return (
    <div 
      className="bg-white rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-200/50 overflow-hidden flex flex-col"
      style={{ height: '380px', minHeight: '380px', maxHeight: '380px' }}
      data-testid="pipeline-snapshot-component"
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/25">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                {config.title || 'Pipeline Snapshot'}
              </h3>
              <p className="text-sm text-slate-500">
                {objectType === 'opportunity' ? 'Sales pipeline overview' : 'Lead pipeline overview'}
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
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[120px] h-9 text-sm bg-slate-50 border-slate-200 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateRangeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={fetchPipelineData}
              className="h-9 w-9 rounded-lg hover:bg-slate-100"
              data-testid="refresh-pipeline-btn"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Content - Scrollable area */}
      <div className="px-6 py-5 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-6">
            {/* Stats Skeleton */}
            <div className="grid grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="animate-pulse p-4 bg-slate-50 rounded-xl">
                  <div className="h-3 bg-slate-200 rounded w-1/2 mb-2" />
                  <div className="h-6 bg-slate-200 rounded w-2/3" />
                </div>
              ))}
            </div>
            {/* Bars Skeleton */}
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 bg-slate-200 rounded w-1/4 mb-2" />
                  <div className="h-10 bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-3">
              <AlertCircle className="h-6 w-6 text-rose-500" />
            </div>
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        ) : !data?.stages?.length ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-base font-medium text-slate-800 mb-1">No pipeline data</p>
            <p className="text-sm text-slate-500">Create {objectType === 'opportunity' ? 'opportunities' : 'leads'} to see your pipeline</p>
          </div>
        ) : (
          <>
            {/* Summary Stats - Enhanced Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100/50">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-100/50 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Total Count</span>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{data.total_count}</p>
                  <p className="text-xs text-slate-500 mt-1">{objectType === 'opportunity' ? 'Opportunities' : 'Leads'}</p>
                </div>
              </div>
              
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100/50">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-100/50 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Total Value</span>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{formatAmount(data.total_amount)}</p>
                  <p className="text-xs text-slate-500 mt-1">Pipeline value</p>
                </div>
              </div>
            </div>

            {/* Stage Bars - Enhanced */}
            <div className="space-y-4">
              {data.stages.map((stage, index) => {
                const colors = getStageColor(index, data.stages.length);
                const widthPercentage = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 8) : 8;
                
                return (
                  <div
                    key={stage.stage}
                    onClick={() => handleStageClick(stage)}
                    className="group cursor-pointer"
                    data-testid={`pipeline-stage-${stage.stage}`}
                  >
                    {/* Stage Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                        {stage.stage || 'Unknown'}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${colors.bg} ${colors.text}`}>
                          {stage.count}
                        </span>
                        {(config.display_mode === 'both' || config.display_mode === 'amount') && stage.amount > 0 && (
                          <span className="text-sm font-medium text-slate-600">
                            {formatAmount(stage.amount)}
                          </span>
                        )}
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="relative h-11 bg-slate-100 rounded-xl overflow-hidden group-hover:bg-slate-50 transition-colors">
                      <div
                        className={`absolute h-full bg-gradient-to-r ${colors.bar} rounded-xl transition-all duration-500 ease-out group-hover:shadow-lg`}
                        style={{ width: `${widthPercentage}%` }}
                      >
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 group-hover:animate-shimmer" />
                      </div>
                      <div className="absolute inset-0 flex items-center px-4">
                        <span className="text-sm font-semibold text-white drop-shadow-sm">
                          {stage.percentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {data?.stages?.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={() => navigate(`/sales/${objectType}`)}
            className="w-full text-center text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
            data-testid="view-all-pipeline-btn"
          >
            View All {objectType === 'opportunity' ? 'Opportunities' : 'Leads'} →
          </button>
        </div>
      )}
    </div>
  );
};

export default PipelineSnapshotComponent;
