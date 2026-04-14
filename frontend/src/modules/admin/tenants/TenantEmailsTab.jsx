/**
 * Tenant Emails Tab - Admin Portal
 * View email logs for a tenant (welcome emails, password resets, etc.)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import {
  Mail,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const EMAIL_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'tenant_admin_welcome', label: 'Welcome Email' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'user_invitation', label: 'User Invitation' },
  { value: 'test_email', label: 'Test Email' }
];

const TenantEmailsTab = ({ tenantId, getAdminToken }) => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedEmail, setSelectedEmail] = useState(null);

  const headers = { Authorization: `Bearer ${getAdminToken()}` };

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? `?email_type=${filter}` : '';
      const response = await axios.get(`${API}/tenants/${tenantId}/email-logs${params}`, { headers });
      setEmails(response.data.email_logs || []);
      setError(null);
    } catch (err) {
      if (err.response?.status !== 404) {
        setError('Failed to load email logs');
      }
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, filter, getAdminToken]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" /> Sent</Badge>;
      case 'mocked':
        return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" /> Mocked</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type) => {
    const colors = {
      'tenant_admin_welcome': 'bg-purple-100 text-purple-700',
      'password_reset': 'bg-orange-100 text-orange-700',
      'user_invitation': 'bg-indigo-100 text-indigo-700',
      'test_email': 'bg-slate-100 text-slate-700'
    };
    return <Badge className={colors[type] || 'bg-slate-100'}>{type?.replace(/_/g, ' ')}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tenant-emails-tab">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Logs
              </CardTitle>
              <CardDescription>
                View emails sent to users in this tenant (welcome, password reset, etc.)
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48" data-testid="email-type-filter">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchEmails}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {emails.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent At</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell className="text-sm text-slate-500">
                      {email.sent_at ? new Date(email.sent_at).toLocaleString() : 
                       email.created_at ? new Date(email.created_at).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="font-medium">{email.to}</TableCell>
                    <TableCell>{getTypeBadge(email.type)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={email.subject}>
                      {email.subject}
                    </TableCell>
                    <TableCell>{getStatusBadge(email.status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {email.provider || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedEmail(email)}
                        title="Preview email content"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No emails found</p>
              <p className="text-sm">Emails sent to users in this tenant will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Preview Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEmail(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-auto m-4" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="font-semibold">Email Preview</h3>
                <p className="text-sm text-slate-500">{selectedEmail.subject}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)}>
                &times;
              </Button>
            </div>
            <div className="p-4">
              <div className="mb-4 text-sm space-y-1 bg-slate-50 p-3 rounded-lg">
                <p><strong>To:</strong> {selectedEmail.to}</p>
                <p><strong>Type:</strong> {selectedEmail.type?.replace(/_/g, ' ')}</p>
                <p><strong>Status:</strong> {selectedEmail.status}</p>
                <p><strong>Provider:</strong> {selectedEmail.provider || 'N/A'}</p>
                {selectedEmail.metadata?.password_reset_token && (
                  <p><strong>Reset Token:</strong> {selectedEmail.metadata.password_reset_token}</p>
                )}
              </div>
              
              {selectedEmail.html_content ? (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Email Content:</p>
                  <div 
                    className="border rounded p-4 bg-white"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.html_content }}
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Mail className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p>Email content not stored</p>
                  <p className="text-sm">Email was sent successfully via {selectedEmail.provider}</p>
                  {selectedEmail.metadata?.password_reset_token && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg text-left">
                      <p className="text-sm text-blue-700 font-medium">Password Reset Link:</p>
                      <code className="text-xs text-blue-600 break-all">
                        {window.location.origin}/reset-password?token={selectedEmail.metadata.password_reset_token.replace('...', '')}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantEmailsTab;
