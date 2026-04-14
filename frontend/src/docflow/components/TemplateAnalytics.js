import React, { useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, CheckCircle, Send, Clock, 
  FileText, Users, MousePointer2, AlertCircle
} from 'lucide-react';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
const STATUS_COLORS = {
  signed: '#10b981',
  viewed: '#f59e0b',
  sent: '#6366f1',
  draft: '#94a3b8',
  expired: '#ef4444'
};

const TemplateAnalytics = ({ templates = [], documents = [], emailHistory = [] }) => {
  
  // 1. Process Activity Data (Last 7 Days)
  const activityData = useMemo(() => {
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const dayDocs = documents.filter(doc => doc.created_at?.startsWith(date));
      const daySigned = dayDocs.filter(doc => doc.status === 'signed');
      
      return {
        date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        sent: dayDocs.length,
        signed: daySigned.length
      };
    });
  }, [documents]);

  // 2. Process Status Distribution
  const statusData = useMemo(() => {
    const distribution = documents.reduce((acc, doc) => {
      const status = doc.status || 'draft';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(distribution).map(([name, value]) => ({ 
      name: name.charAt(0).toUpperCase() + name.slice(1), 
      value 
    }));
  }, [documents]);

  // 3. Process Popular Templates
  const popularTemplates = useMemo(() => {
    const counts = documents.reduce((acc, doc) => {
      const name = doc.template_name || 'Legacy Doc';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [documents]);

  // 4. Calculate Critical KPIs
  const kpis = useMemo(() => {
    const totalDocs = documents.length;
    const signedDocs = documents.filter(d => d.status === 'signed').length;
    const sigRate = totalDocs > 0 ? Math.round((signedDocs / totalDocs) * 100) : 0;
    
    return [
      { 
        title: 'Completion Rate', 
        value: `${sigRate}%`, 
        trend: '+5%', 
        isUp: true, 
        icon: CheckCircle, 
        bg: 'bg-green-50', 
        text: 'text-green-600' 
      },
      { 
        title: 'Total Velocity', 
        value: documents.length, 
        trend: '+12%', 
        isUp: true, 
        icon: Activity, 
        bg: 'bg-indigo-50', 
        text: 'text-indigo-600' 
      },
      { 
        title: 'Engagement', 
        value: documents.filter(d => d.status === 'viewed' || d.status === 'signed').length, 
        trend: '+8%', 
        isUp: true, 
        icon: MousePointer2, 
        bg: 'bg-blue-50', 
        text: 'text-blue-600' 
      },
      { 
        title: 'Avg. Time to Sign', 
        value: '4.2h', 
        trend: '-15%', 
        isUp: true, // Down is good for time
        icon: Clock, 
        bg: 'bg-purple-50', 
        text: 'text-purple-600' 
      }
    ];
  }, [documents]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className={`p-2 rounded-xl ${kpi.bg}`}>
                <kpi.icon className={`h-6 w-6 ${kpi.text}`} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${kpi.isUp ? 'text-green-600' : 'text-red-500'}`}>
                {kpi.isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {kpi.trend}
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-gray-500 text-sm font-medium">{kpi.title}</h3>
              <div className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Area Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Document Activity</h3>
              <p className="text-sm text-gray-500">Sent vs Signed documents (Last 7 days)</p>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSigned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="sent" 
                  stroke="#6366f1" 
                  fillOpacity={1} 
                  fill="url(#colorSent)" 
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="signed" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorSigned)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown Pie Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900">Status Distribution</h3>
            <p className="text-sm text-gray-500">Current state of all active documents</p>
          </div>
          <div className="h-[300px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name.toLowerCase()] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Popular Templates Bar Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm col-span-1 lg:col-span-2">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900">Most Used Templates</h3>
            <p className="text-sm text-gray-500">Documents generated per template</p>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={popularTemplates} layout="vertical" margin={{ left: 40, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#4b5563', fontSize: 12}}
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Bar 
                  dataKey="value" 
                  fill="#6366f1" 
                  radius={[0, 4, 4, 0]} 
                  barSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateAnalytics;
