import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { FileText, Loader2, Shield, Database, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const AuditLogsView = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('');
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetchAuditLogs();
    fetchStats();
  }, [eventTypeFilter, actionFilter, limit]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      let url = `${API}/api/audit-logs?limit=${limit}`;
      if (eventTypeFilter !== 'all') {
        url += `&event_type=${eventTypeFilter}`;
      }
      if (actionFilter) {
        url += `&action=${actionFilter}`;
      }
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAuditLogs(response.data.events || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/audit-logs/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching audit stats:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getEventTypeBadge = (type) => {
    if (type === 'security') {
      return <Badge className="bg-purple-100 text-purple-700"><Shield className="h-3 w-3 mr-1 inline" />Security</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-700"><Database className="h-3 w-3 mr-1 inline" />Data</Badge>;
  };

  const getActionBadge = (action) => {
    const colorMap = {
      'login_success': 'bg-green-100 text-green-700',
      'login_failed': 'bg-red-100 text-red-700',
      'user_invited': 'bg-blue-100 text-blue-700',
      'user_deactivated': 'bg-orange-100 text-orange-700',
      'record_created': 'bg-emerald-100 text-emerald-700',
      'record_updated': 'bg-amber-100 text-amber-700',
      'record_deleted': 'bg-red-100 text-red-700'
    };
    
    return <Badge className={colorMap[action] || 'bg-slate-100 text-slate-700'}>{action.replace('_', ' ')}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
              <p className="text-sm text-slate-500">View security and data access history</p>
            </div>
          </div>
          <Button onClick={fetchAuditLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase mb-1">Total Events</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total_events}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase mb-1">Security</p>
              <p className="text-2xl font-bold text-purple-600">{stats.security_events}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase mb-1">Data</p>
              <p className="text-2xl font-bold text-blue-600">{stats.data_events}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase mb-1">Last 24h</p>
              <p className="text-2xl font-bold text-slate-900">{stats.last_24h}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Event Type</label>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="security">Security Events</SelectItem>
                <SelectItem value="data">Data Events</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Action</label>
            <Input
              placeholder="Filter by action..."
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Show</label>
            <Select value={limit.toString()} onValueChange={(val) => setLimit(parseInt(val))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 entries</SelectItem>
                <SelectItem value="50">50 entries</SelectItem>
                <SelectItem value="100">100 entries</SelectItem>
                <SelectItem value="200">200 entries</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white border rounded-lg shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date/Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>Record ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No audit logs found
                  </TableCell>
                </TableRow>
              ) : (
                auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {formatDate(log.timestamp)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {log.actor_email || '-'}
                    </TableCell>
                    <TableCell>
                      {getEventTypeBadge(log.event_type)}
                    </TableCell>
                    <TableCell>
                      {getActionBadge(log.action)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {log.object_name || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {log.record_id ? `${log.record_id.substring(0, 16)}...` : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Info Footer */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">ℹ️ About Audit Logs</p>
        <p>Audit logs track all security events (logins, user changes) and data events (record create/update/delete). Logs are retained for compliance and cannot be edited or deleted.</p>
      </div>
    </div>
  );
};

export default AuditLogsView;