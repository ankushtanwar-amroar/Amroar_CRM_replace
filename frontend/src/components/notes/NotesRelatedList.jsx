/**
 * NotesRelatedList - Salesforce-Style Enhanced Notes Related List
 * 
 * This component displays notes linked to a CRM record and allows
 * creating, editing, pinning, archiving notes with rich text.
 * 
 * Features:
 * - Rich text notes with WYSIWYG editor
 * - Pin important notes to top
 * - Archive notes (hide from default view)
 * - Link notes to multiple records
 * - Public sharing with token
 * - Full audit trail
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  StickyNote,
  Plus,
  Pin,
  Archive,
  MoreVertical,
  Trash2,
  Edit3,
  Share2,
  ExternalLink,
  Link2,
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  Search,
  Filter,
  Eye,
  Copy,
  Check,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import toast from 'react-hot-toast';
import NoteEditorModal from './NoteEditorModal';

const API = process.env.REACT_APP_BACKEND_URL;

// Get auth header
const getAuthHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

// Format relative time
const formatRelativeTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// Strip HTML for display
const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Single Note Card Component
 */
const NoteCard = ({ 
  note, 
  onEdit, 
  onPin, 
  onArchive, 
  onDelete, 
  onShare,
  onView,
  isExpanded,
  onToggleExpand
}) => {
  const [showActions, setShowActions] = useState(false);
  
  return (
    <div 
      className={`
        group relative p-4 rounded-lg border transition-all duration-200
        ${note.is_pinned ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}
        hover:shadow-md hover:border-slate-300
      `}
      data-testid={`note-card-${note.id}`}
    >
      {/* Pin indicator */}
      {note.is_pinned && (
        <div className="absolute -top-2 -right-2">
          <div className="bg-amber-500 text-white p-1 rounded-full shadow-sm">
            <Pin className="w-3 h-3" />
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 
            className="font-semibold text-slate-900 truncate cursor-pointer hover:text-blue-600"
            onClick={() => onView(note)}
          >
            {note.title}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
            <User className="w-3 h-3" />
            <span>{note.owner_name || 'Unknown'}</span>
            <span>•</span>
            <Clock className="w-3 h-3" />
            <span>{formatRelativeTime(note.updated_at)}</span>
          </div>
        </div>
        
        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onView(note)}>
              <Eye className="w-4 h-4 mr-2" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(note)}>
              <Edit3 className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onPin(note)}>
              <Pin className="w-4 h-4 mr-2" />
              {note.is_pinned ? 'Unpin' : 'Pin to Top'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive(note)}>
              <Archive className="w-4 h-4 mr-2" />
              {note.is_archived ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onShare(note)}>
              <Share2 className="w-4 h-4 mr-2" />
              Share Link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onDelete(note)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Preview text */}
      <p className="mt-2 text-sm text-slate-600 line-clamp-2">
        {note.preview_text || stripHtml(note.body_rich_text) || 'No content'}
      </p>
      
      {/* Badges */}
      <div className="flex items-center gap-2 mt-3">
        {note.is_archived && (
          <Badge variant="secondary" className="text-xs">
            <Archive className="w-3 h-3 mr-1" />
            Archived
          </Badge>
        )}
      </div>
    </div>
  );
};

/**
 * Note View Modal - Read-only view with rich content
 */
const NoteViewModal = ({ note, isOpen, onClose, onEdit }) => {
  if (!note) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold">
                {note.title}
              </DialogTitle>
              <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {note.owner_name}
                </div>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatRelativeTime(note.updated_at)}
                </div>
                {note.is_pinned && (
                  <>
                    <span>•</span>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      <Pin className="w-3 h-3 mr-1" />
                      Pinned
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto mt-4 pr-2">
          <div 
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: note.body_rich_text || '<p class="text-slate-400">No content</p>' }}
          />
        </div>
        
        {/* Footer with metadata */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div>
              Created by {note.created_by_name} • {new Date(note.created_at).toLocaleString()}
            </div>
            <Button variant="outline" size="sm" onClick={() => onEdit(note)}>
              <Edit3 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Share Link Modal
 */
const ShareLinkModal = ({ note, isOpen, onClose }) => {
  const [shareLink, setShareLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const createShareLink = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/api/notes/${note.id}/share`,
        {},
        { headers: getAuthHeader() }
      );
      setShareLink(response.data);
      toast.success('Share link created!');
    } catch (error) {
      console.error('Error creating share link:', error);
      toast.error('Failed to create share link');
    } finally {
      setLoading(false);
    }
  };
  
  const copyToClipboard = async () => {
    if (shareLink?.public_url) {
      await navigator.clipboard.writeText(shareLink.public_url);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  useEffect(() => {
    if (isOpen && !shareLink) {
      createShareLink();
    }
  }, [isOpen]);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Note
          </DialogTitle>
          <DialogDescription>
            Anyone with this link can view the note without logging in.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : shareLink ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input 
                  value={shareLink.public_url} 
                  readOnly 
                  className="flex-1 text-sm"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={copyToClipboard}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              
              <div className="text-xs text-slate-500 space-y-1">
                <div className="flex items-center gap-2">
                  <Eye className="w-3 h-3" />
                  <span>View in browser: {shareLink.allow_view_in_browser ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Copy className="w-3 h-3" />
                  <span>Allow copy: {shareLink.allow_copy ? 'Yes' : 'No'}</span>
                </div>
                {shareLink.expires_at && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span>Expires: {new Date(shareLink.expires_at).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Main NotesRelatedList Component
 */
const NotesRelatedList = ({ 
  recordId, 
  recordType,
  recordName,
  showHeader = true,
  maxHeight = '400px',
  collapsible = true,
  defaultExpanded = true
}) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [viewingNote, setViewingNote] = useState(null);
  const [sharingNote, setSharingNote] = useState(null);
  
  // Fetch notes for this record
  const fetchNotes = useCallback(async () => {
    if (!recordId || !recordType) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(
        `${API}/api/notes/for-record/${recordType.toLowerCase()}/${recordId}`,
        { 
          headers: getAuthHeader(),
          params: { include_archived: showArchived }
        }
      );
      
      setNotes(response.data.notes || []);
    } catch (err) {
      console.error('Error fetching notes:', err);
      setError('Failed to load notes');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [recordId, recordType, showArchived]);
  
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);
  
  // Create new note
  const handleCreateNote = () => {
    setEditingNote(null);
    setEditorOpen(true);
  };
  
  // Edit existing note
  const handleEditNote = (note) => {
    setEditingNote(note);
    setEditorOpen(true);
  };
  
  // Save note (create or update)
  const handleSaveNote = async (noteData) => {
    try {
      if (editingNote) {
        // Update existing note
        await axios.put(
          `${API}/api/notes/${editingNote.id}`,
          noteData,
          { headers: getAuthHeader() }
        );
        toast.success('Note updated');
      } else {
        // Create new note and link to record
        const createResponse = await axios.post(
          `${API}/api/notes`,
          {
            ...noteData,
            linked_entity_type: recordType.toLowerCase(),
            linked_entity_id: recordId
          },
          { headers: getAuthHeader() }
        );
        toast.success('Note created');
      }
      
      setEditorOpen(false);
      setEditingNote(null);
      fetchNotes();
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Failed to save note');
    }
  };
  
  // Toggle pin
  const handleTogglePin = async (note) => {
    try {
      await axios.put(
        `${API}/api/notes/${note.id}`,
        { is_pinned: !note.is_pinned },
        { headers: getAuthHeader() }
      );
      toast.success(note.is_pinned ? 'Note unpinned' : 'Note pinned');
      fetchNotes();
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error('Failed to update note');
    }
  };
  
  // Toggle archive
  const handleToggleArchive = async (note) => {
    try {
      await axios.put(
        `${API}/api/notes/${note.id}`,
        { is_archived: !note.is_archived },
        { headers: getAuthHeader() }
      );
      toast.success(note.is_archived ? 'Note unarchived' : 'Note archived');
      fetchNotes();
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error('Failed to update note');
    }
  };
  
  // Delete note
  const handleDeleteNote = async (note) => {
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }
    
    try {
      await axios.delete(
        `${API}/api/notes/${note.id}`,
        { headers: getAuthHeader() }
      );
      toast.success('Note deleted');
      fetchNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Failed to delete note');
    }
  };
  
  // Filter notes
  const filteredNotes = notes.filter(note => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      note.title?.toLowerCase().includes(query) ||
      note.preview_text?.toLowerCase().includes(query) ||
      note.owner_name?.toLowerCase().includes(query)
    );
  });
  
  // Count for header
  const notesCount = notes.length;
  const pinnedCount = notes.filter(n => n.is_pinned).length;
  
  return (
    <Card 
      className="overflow-visible"
      data-testid="notes-related-list"
      data-related-list="notes"
    >
      {/* Header */}
      {showHeader && (
        <CardHeader className="py-3 px-4 bg-slate-50 border-b">
          <div className="flex items-center justify-between gap-4">
            <div 
              className="flex items-center gap-2 cursor-pointer min-w-0 flex-shrink"
              onClick={() => collapsible && setIsExpanded(!isExpanded)}
            >
              <StickyNote className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <CardTitle className="text-base font-semibold whitespace-nowrap">
                Notes
              </CardTitle>
              <Badge variant="secondary" className="flex-shrink-0">
                {notesCount}
              </Badge>
              {pinnedCount > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 flex-shrink-0">
                  <Pin className="w-3 h-3 mr-1" />
                  {pinnedCount}
                </Badge>
              )}
              {collapsible && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showArchived ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setShowArchived(!showArchived)}
                      className="h-8 w-8 p-0"
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {showArchived ? 'Hide Archived' : 'Show Archived'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <Button 
                size="sm" 
                onClick={handleCreateNote}
                className="h-8 whitespace-nowrap"
                data-testid="new-note-button"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Note
              </Button>
            </div>
          </div>
          
          {/* Search bar (when expanded) */}
          {isExpanded && notes.length > 3 && (
            <div className="mt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          )}
        </CardHeader>
      )}
      
      {/* Content */}
      {(isExpanded || !collapsible) && (
        <CardContent 
          className="p-4"
          style={{ maxHeight, overflowY: 'auto' }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-slate-500">Loading notes...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              {error}
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-center py-8">
              <StickyNote className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 mb-3">
                {searchQuery ? 'No notes match your search' : 'No notes yet'}
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCreateNote}
              >
                <Plus className="w-4 h-4 mr-1" />
                Create First Note
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onEdit={handleEditNote}
                  onPin={handleTogglePin}
                  onArchive={handleToggleArchive}
                  onDelete={handleDeleteNote}
                  onShare={(n) => setSharingNote(n)}
                  onView={(n) => setViewingNote(n)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
      
      {/* Editor Modal */}
      <NoteEditorModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingNote(null);
        }}
        note={editingNote}
        onSave={handleSaveNote}
        recordName={recordName}
      />
      
      {/* View Modal */}
      <NoteViewModal
        note={viewingNote}
        isOpen={!!viewingNote}
        onClose={() => setViewingNote(null)}
        onEdit={(n) => {
          setViewingNote(null);
          handleEditNote(n);
        }}
      />
      
      {/* Share Modal */}
      <ShareLinkModal
        note={sharingNote}
        isOpen={!!sharingNote}
        onClose={() => setSharingNote(null)}
      />
    </Card>
  );
};

export default NotesRelatedList;
