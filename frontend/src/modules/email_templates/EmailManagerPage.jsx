/**
 * EmailManagerPage - Manage email history and drafts
 * Two tabs: Email History (sent emails) and Draft Emails
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Mail, Trash2, Send, Edit2, Clock, User, Search, 
  RefreshCw, Loader2, FileText, ChevronRight, MoreHorizontal,
  Inbox, Archive, Paperclip, Eye, ExternalLink, ArrowLeft
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { toast } from 'sonner';
import DockedEmailComposer from '../../components/email/DockedEmailComposer';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const EmailManagerPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('history');
  const [drafts, setDrafts] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState(null);
  const [emailDetailOpen, setEmailDetailOpen] = useState(false);
  const [emailDetail, setEmailDetail] = useState(null);

  // Fetch drafts
  const fetchDrafts = useCallback(async () => {
    setIsLoadingDrafts(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/email/drafts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDrafts(data || []);
      } else {
        toast.error('Failed to load drafts');
      }
    } catch (error) {
      console.error('Error fetching drafts:', error);
      toast.error('Failed to load drafts');
    } finally {
      setIsLoadingDrafts(false);
    }
  }, []);

  // Fetch email history
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/email/history?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHistory(data || []);
      } else {
        toast.error('Failed to load email history');
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Failed to load email history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
    fetchHistory();
  }, [fetchDrafts, fetchHistory]);

  // Filter items by search
  const filteredDrafts = drafts.filter(draft => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      draft.to_email?.toLowerCase().includes(query) ||
      draft.subject?.toLowerCase().includes(query) ||
      draft.body?.toLowerCase().includes(query)
    );
  });

  const filteredHistory = history.filter(email => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.to_email?.toLowerCase().includes(query) ||
      email.subject?.toLowerCase().includes(query) ||
      email.related_record_type?.toLowerCase().includes(query)
    );
  });

  // Handle edit draft
  const handleEditDraft = (draft) => {
    setSelectedDraft(draft);
    setIsComposerOpen(true);
  };

  // Handle delete draft
  const handleDeleteDraft = async () => {
    if (!draftToDelete) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/email/drafts/${draftToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Draft deleted');
        setDrafts(prev => prev.filter(d => d.id !== draftToDelete.id));
      } else {
        toast.error('Failed to delete draft');
      }
    } catch (error) {
      console.error('Error deleting draft:', error);
      toast.error('Failed to delete draft');
    } finally {
      setDeleteDialogOpen(false);
      setDraftToDelete(null);
    }
  };

  // View email detail
  const handleViewEmail = async (email) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/email/history/${email.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEmailDetail(data);
        setEmailDetailOpen(true);
      } else {
        toast.error('Failed to load email details');
      }
    } catch (error) {
      console.error('Error fetching email detail:', error);
      toast.error('Failed to load email details');
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = (now - date) / (1000 * 60 * 60);
    
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Strip HTML for preview
  const stripHtml = (html) => {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  // Handle composer close
  const handleComposerClose = () => {
    setIsComposerOpen(false);
    setSelectedDraft(null);
    fetchDrafts();
    fetchHistory();
  };

  const handleRefresh = () => {
    if (activeTab === 'history') {
      fetchHistory();
    } else {
      fetchDrafts();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/setup')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            data-testid="back-to-setup-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Setup</span>
          </button>
          <div className="h-8 w-px bg-slate-300" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Email Manager</h1>
              <p className="text-sm text-slate-500">View sent emails and manage drafts</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoadingDrafts || isLoadingHistory}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(isLoadingDrafts || isLoadingHistory) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelectedDraft(null);
              setIsComposerOpen(true);
            }}
          >
            <Mail className="h-4 w-4 mr-2" />
            New Email
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="grid w-80 grid-cols-2">
              <TabsTrigger value="history" className="flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Email History
                {history.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{history.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="drafts" className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Drafts
                {drafts.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{drafts.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            {/* Search */}
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={`Search ${activeTab === 'history' ? 'emails' : 'drafts'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="email-search-input"
              />
            </div>
          </div>

          {/* Email History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sent Emails</CardTitle>
                <CardDescription>
                  View your email history and sent messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700">No emails sent yet</h3>
                    <p className="text-slate-500 mt-1">
                      {searchQuery ? 'Try a different search term' : 'Your sent emails will appear here'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredHistory.map((email) => (
                      <div
                        key={email.id}
                        className="flex items-center gap-4 py-4 hover:bg-slate-50 px-3 -mx-3 rounded-lg transition-colors cursor-pointer group"
                        onClick={() => handleViewEmail(email)}
                        data-testid={`email-history-item-${email.id}`}
                      >
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Send className="h-5 w-5 text-green-600" />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 truncate">
                              {email.to_email || '(No recipient)'}
                            </span>
                            {email.related_record_type && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {email.related_record_type}
                              </Badge>
                            )}
                            {email.attachments && email.attachments.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                <Paperclip className="h-3 w-3 mr-1" />
                                {email.attachments.length}
                              </Badge>
                            )}
                            <Badge 
                              variant={email.status === 'sent' ? 'default' : 'secondary'} 
                              className={`text-xs ${email.status === 'sent' ? 'bg-green-100 text-green-700' : ''}`}
                            >
                              {email.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-700 truncate mt-0.5">
                            {email.subject || '(No subject)'}
                          </p>
                        </div>
                        
                        {/* Date */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <Clock className="h-3 w-3" />
                              {formatDate(email.sent_at)}
                            </div>
                          </div>
                          
                          <Eye className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drafts Tab */}
          <TabsContent value="drafts">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Draft Emails</CardTitle>
                <CardDescription>
                  Click on a draft to edit and send
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingDrafts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                ) : filteredDrafts.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700">No drafts found</h3>
                    <p className="text-slate-500 mt-1">
                      {searchQuery ? 'Try a different search term' : 'Start composing an email and save it as a draft'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredDrafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="flex items-center gap-4 py-4 hover:bg-slate-50 px-3 -mx-3 rounded-lg transition-colors cursor-pointer group"
                        onClick={() => handleEditDraft(draft)}
                        data-testid={`draft-item-${draft.id}`}
                      >
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Mail className="h-5 w-5 text-blue-600" />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 truncate">
                              {draft.to_email || '(No recipient)'}
                            </span>
                            {draft.related_record_type && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {draft.related_record_type}
                              </Badge>
                            )}
                            {draft.attachments && draft.attachments.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                <Paperclip className="h-3 w-3 mr-1" />
                                {draft.attachments.length}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-700 truncate mt-0.5">
                            {draft.subject || '(No subject)'}
                          </p>
                          <p className="text-sm text-slate-500 truncate mt-0.5">
                            {stripHtml(draft.body) || '(No content)'}
                          </p>
                        </div>
                        
                        {/* Date & Actions */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <Clock className="h-3 w-3" />
                              {formatDate(draft.updated_at)}
                            </div>
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleEditDraft(draft);
                              }}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDraftToDelete(draft);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <ChevronRight className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Email Composer */}
      <DockedEmailComposer
        isOpen={isComposerOpen}
        onClose={handleComposerClose}
        draftData={selectedDraft}
        onEmailSent={handleComposerClose}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the draft and any attachments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDraft}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Detail Dialog */}
      <Dialog open={emailDetailOpen} onOpenChange={setEmailDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-green-600" />
              Email Details
            </DialogTitle>
            <DialogDescription>
              Sent on {emailDetail?.sent_at ? formatDate(emailDetail.sent_at) : ''}
            </DialogDescription>
          </DialogHeader>
          
          {emailDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">To:</span>
                  <p className="font-medium">{emailDetail.to_email}</p>
                </div>
                {emailDetail.cc_email && (
                  <div>
                    <span className="text-slate-500">CC:</span>
                    <p className="font-medium">{emailDetail.cc_email}</p>
                  </div>
                )}
                {emailDetail.bcc_email && (
                  <div>
                    <span className="text-slate-500">BCC:</span>
                    <p className="font-medium">{emailDetail.bcc_email}</p>
                  </div>
                )}
                {emailDetail.related_record_type && (
                  <div>
                    <span className="text-slate-500">Related to:</span>
                    <p className="font-medium capitalize">{emailDetail.related_record_type}</p>
                  </div>
                )}
              </div>
              
              <div>
                <span className="text-slate-500 text-sm">Subject:</span>
                <p className="font-semibold text-lg">{emailDetail.subject || '(No subject)'}</p>
              </div>
              
              {emailDetail.attachments && emailDetail.attachments.length > 0 && (
                <div>
                  <span className="text-slate-500 text-sm">Attachments:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {emailDetail.attachments.map((att, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {att.filename}
                        <span className="text-xs text-slate-400">
                          ({Math.round(att.size / 1024)}KB)
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <span className="text-slate-500 text-sm">Body:</span>
                <div 
                  className="mt-2 p-4 bg-slate-50 rounded-lg prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: emailDetail.body || '<p>(No content)</p>' }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailManagerPage;
