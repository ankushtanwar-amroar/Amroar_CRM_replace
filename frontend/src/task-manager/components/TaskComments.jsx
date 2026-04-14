/**
 * Task Comments Component with @Mentions
 * Allows commenting on tasks with user mentions
 */
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, User, AtSign, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TaskComments = ({ taskId, onCommentAdded }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const textareaRef = useRef(null);
  const [selectedMentions, setSelectedMentions] = useState([]);

  useEffect(() => {
    fetchComments();
  }, [taskId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/comments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (search) => {
    try {
      const token = localStorage.getItem('token');
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`${API_URL}/api/task-manager/users${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMentionUsers(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setNewComment(value);
    
    // Check for @ mentions
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Only show dropdown if there's no space after @
      if (!textAfterAt.includes(' ')) {
        setMentionSearch(textAfterAt);
        setShowMentionDropdown(true);
        fetchUsers(textAfterAt);
        
        // Calculate dropdown position
        if (textareaRef.current) {
          const rect = textareaRef.current.getBoundingClientRect();
          setMentionPosition({
            top: rect.height + 5,
            left: 0
          });
        }
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  const insertMention = (user) => {
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = newComment.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    const newText = 
      newComment.substring(0, lastAtIndex) + 
      `@${user.name.split(' ')[0]} ` + 
      newComment.substring(cursorPos);
    
    setNewComment(newText);
    setShowMentionDropdown(false);
    setSelectedMentions(prev => [...prev, user.id]);
    
    // Focus back on textarea
    textareaRef.current.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: newComment,
          mentions: selectedMentions
        })
      });

      if (response.ok) {
        const newCommentData = await response.json();
        setComments(prev => [newCommentData, ...prev]);
        setNewComment('');
        setSelectedMentions([]);
        onCommentAdded?.();
      }
    } catch (err) {
      console.error('Error creating comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setComments(prev => prev.filter(c => c.id !== commentId));
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
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

  // Highlight @mentions in content
  const renderContent = (content) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-blue-600 font-medium hover:underline cursor-pointer">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-4" data-testid="task-comments">
      {/* Comment Input */}
      <div className="relative">
        <form onSubmit={handleSubmit}>
          <Textarea
            ref={textareaRef}
            placeholder="Add a comment... Use @ to mention someone"
            value={newComment}
            onChange={handleInputChange}
            rows={3}
            className="pr-12 resize-none"
            data-testid="comment-input"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute bottom-2 right-2"
            disabled={submitting || !newComment.trim()}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>

        {/* Mention Dropdown */}
        {showMentionDropdown && mentionUsers.length > 0 && (
          <div 
            className="absolute z-50 bg-white border rounded-lg shadow-xl max-h-48 overflow-y-auto w-64"
            style={{ top: mentionPosition.top, left: mentionPosition.left }}
          >
            <div className="p-2 border-b text-xs text-slate-500 flex items-center gap-1">
              <AtSign className="w-3 h-3" />
              Mention a user
            </div>
            {mentionUsers.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
                className="w-full px-3 py-2 text-left hover:bg-slate-100 flex items-center gap-2"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                  {user.initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comments List */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {comments.map(comment => (
            <div 
              key={comment.id} 
              className="flex gap-3 p-3 bg-slate-50 rounded-lg group"
              data-testid={`comment-${comment.id}`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                {comment.author?.initials || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-700">
                    {comment.author?.name || 'Unknown'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatTime(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {renderContent(comment.content)}
                </p>
              </div>
              <button
                onClick={() => handleDeleteComment(comment.id)}
                className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-400 py-4">
          No comments yet. Be the first to comment!
        </p>
      )}
    </div>
  );
};

export default TaskComments;
