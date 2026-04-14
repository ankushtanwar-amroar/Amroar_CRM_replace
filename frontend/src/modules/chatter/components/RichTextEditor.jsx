/**
 * RichTextEditor - TipTap-based rich text editor with @mentions and emoji
 * 
 * FIXES APPLIED:
 * - Fixed @mention dropdown detection (cursor position issue)
 * - Fixed Post button validation (disabled when empty/only spaces)
 */
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, Italic, List, ListOrdered, Link as LinkIcon, 
  Smile, Image, Paperclip, Send, X, AtSign
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import chatterService from '../services/chatterService';

// Simple Emoji Picker Component
const EmojiPicker = ({ onSelect, onClose }) => {
  const emojis = [
    '😀', '😂', '😍', '🎉', '👍', '👏', '🔥', '💯', 
    '❤️', '🙌', '✨', '💪', '🚀', '💡', '✅', '⭐',
    '😊', '🤔', '😎', '🙏', '💼', '📈', '🎯', '✍️'
  ];
  
  return (
    <div className="absolute bottom-full left-0 mb-2 p-2 bg-white border rounded-lg shadow-lg z-50 w-64">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-600">Quick Emojis</span>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
          <X className="h-3 w-3 text-slate-400" />
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {emojis.map((emoji, idx) => (
          <button
            key={idx}
            onClick={() => { onSelect(emoji); onClose(); }}
            className="p-1.5 text-lg hover:bg-slate-100 rounded transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

// User Mention Dropdown Component
const MentionDropdown = ({ query, onSelect, onClose, isVisible }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef(null);

  // Search users when query changes
  useEffect(() => {
    if (!isVisible) {
      setUsers([]);
      return;
    }
    
    const searchUsers = async () => {
      // Show dropdown even for empty query to indicate it's active
      if (!query && query !== '') {
        setUsers([]);
        return;
      }
      
      setLoading(true);
      try {
        console.log('[MentionDropdown] Searching for:', query || '(empty - show all)');
        const result = await chatterService.searchUsers(query || 'a', 8); // Default search if empty
        console.log('[MentionDropdown] Results:', result.users?.length || 0);
        setUsers(result.users || []);
        setSelectedIndex(0);
      } catch (err) {
        console.error('[MentionDropdown] Search error:', err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchUsers, 150);
    return () => clearTimeout(debounce);
  }, [query, isVisible]);

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible || users.length === 0) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % users.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + users.length) % users.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (users[selectedIndex]) {
          onSelect(users[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [users, selectedIndex, onSelect, onClose, isVisible]);

  if (!isVisible) return null;

  return (
    <div 
      ref={dropdownRef}
      className="absolute left-0 bg-white border rounded-lg shadow-xl z-[100] max-h-64 overflow-y-auto w-72"
      style={{ 
        bottom: '100%',
        marginBottom: '8px'
      }}
      data-testid="mention-dropdown"
    >
      <div className="px-3 py-2 border-b bg-slate-50">
        <p className="text-xs font-medium text-slate-600">
          {query ? `Searching for "${query}"` : 'Type to search users...'}
        </p>
      </div>
      {loading ? (
        <div className="px-3 py-4 text-sm text-slate-500 text-center">
          <div className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
          Searching...
        </div>
      ) : users.length > 0 ? (
        <div className="py-1">
          {users.map((user, index) => (
            <button
              key={user.id}
              onClick={() => onSelect(user)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
              data-testid={`mention-user-${user.id}`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.name}</p>
                {user.email && <p className="text-xs text-slate-400 truncate">{user.email}</p>}
              </div>
            </button>
          ))}
        </div>
      ) : query ? (
        <div className="px-3 py-4 text-sm text-slate-400 text-center">
          No users found for "{query}"
        </div>
      ) : (
        <div className="px-3 py-4 text-sm text-slate-400 text-center">
          Start typing to search users
        </div>
      )}
    </div>
  );
};

// Main Rich Text Editor
const RichTextEditor = ({ 
  onSubmit, 
  placeholder = "Share an update...",
  submitLabel = "Post",
  initialContent = "",
  compact = false,
  onCancel,
  autoFocus = false
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mentions, setMentions] = useState([]);
  const [hasContent, setHasContent] = useState(false);
  
  // Mention state
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionStartPos, setMentionStartPos] = useState(null);
  const editorRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 hover:underline cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialContent,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none ${compact ? 'min-h-[40px]' : 'min-h-[80px]'} max-h-[200px] overflow-y-auto`,
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      
      // Check if content is valid (not just whitespace)
      const trimmedText = text.trim();
      setHasContent(trimmedText.length > 0);
      
      // Find @ mention trigger
      const { from } = editor.state.selection;
      
      // Get text content up to cursor
      let textBeforeCursor = '';
      editor.state.doc.nodesBetween(0, from, (node, pos) => {
        if (node.isText) {
          const start = Math.max(pos, 0);
          const end = Math.min(pos + node.text.length, from);
          if (end > start) {
            textBeforeCursor += node.text.substring(0, end - pos);
          }
        }
      });
      
      // Find the last @ that starts a mention
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      
      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        
        // Check if this is a valid mention context (no space after @)
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
          console.log('[RichTextEditor] Mention detected:', { lastAtIndex, query: textAfterAt });
          setMentionQuery(textAfterAt);
          setMentionStartPos(lastAtIndex);
          setShowMentionDropdown(true);
          return;
        }
      }
      
      // No valid mention context
      if (showMentionDropdown) {
        setShowMentionDropdown(false);
        setMentionQuery('');
        setMentionStartPos(null);
      }
    },
  });

  // Handle mention selection
  const handleMentionSelect = useCallback((user) => {
    if (!editor || mentionStartPos === null) return;
    
    console.log('[RichTextEditor] Mention selected:', user.name);
    
    // Get current text
    const text = editor.getText();
    
    // Calculate what to replace (from @ to current cursor)
    const beforeMention = text.substring(0, mentionStartPos);
    const afterMention = text.substring(mentionStartPos + 1 + mentionQuery.length);
    
    // Create mention HTML
    const mentionHtml = `<span class="mention bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium" data-user-id="${user.id}" data-mention="true">@${user.name}</span>`;
    
    // Build new content
    const newContent = `<p>${beforeMention}${mentionHtml}&nbsp;${afterMention}</p>`;
    
    // Set content
    editor.commands.setContent(newContent);
    
    // Move cursor to end
    editor.commands.focus('end');
    
    // Track mention
    setMentions(prev => [...prev, {
      id: `mention-${Date.now()}`,
      type: 'USER',
      user_id: user.id,
      display_name: user.name,
    }]);
    
    // Reset mention state
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartPos(null);
  }, [editor, mentionQuery, mentionStartPos]);

  // Close mention dropdown
  const closeMentionDropdown = useCallback(() => {
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartPos(null);
  }, []);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (!editor) return;
    
    const text = editor.getText().trim();
    
    // Validate: must have text content OR attachments
    if (text.length === 0 && attachments.length === 0) {
      return;
    }
    
    const content = editor.getHTML();
    const plainText = editor.getText();
    
    onSubmit({
      content,
      plain_text: plainText,
      mentions,
      attachments
    });
    
    // Reset editor
    editor.commands.clearContent();
    setAttachments([]);
    setMentions([]);
    setHasContent(false);
  }, [editor, mentions, attachments, onSubmit]);

  // File upload handler
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files?.length) return;
    
    setUploading(true);
    try {
      for (const file of files) {
        const uploaded = await chatterService.uploadFile(file);
        setAttachments(prev => [...prev, uploaded]);
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const insertEmoji = (emoji) => {
    editor?.commands.insertContent(emoji);
    editor?.commands.focus();
  };

  const insertMentionSymbol = () => {
    editor?.commands.insertContent('@');
    editor?.commands.focus();
  };

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  };

  // Check if submit should be enabled
  const isSubmitEnabled = (hasContent || attachments.length > 0) && !uploading;

  if (!editor) return null;

  return (
    <div className="border rounded-lg bg-white" ref={editorRef}>
      {/* Editor Content */}
      <div className="p-3 relative">
        <EditorContent editor={editor} />
        
        {/* Mention Dropdown */}
        <MentionDropdown
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={closeMentionDropdown}
          isVisible={showMentionDropdown}
        />
      </div>
      
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-2">
          {attachments.map((file) => (
            <div key={file.id} className="relative group">
              {file.file_type?.startsWith('image/') ? (
                <img 
                  src={file.url} 
                  alt={file.filename}
                  className="h-16 w-16 object-cover rounded border"
                />
              ) : (
                <div className="h-16 px-3 flex items-center gap-2 bg-slate-100 rounded border">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  <span className="text-xs text-slate-600 max-w-[100px] truncate">{file.filename}</span>
                </div>
              )}
              <button
                onClick={() => removeAttachment(file.id)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="h-16 w-16 flex items-center justify-center bg-slate-100 rounded border">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
      
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-t bg-slate-50">
        <div className="flex items-center gap-0.5">
          {/* Formatting buttons */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('bold') ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('italic') ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('bulletList') ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('orderedList') ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            onClick={addLink}
            className={`p-1.5 rounded hover:bg-slate-200 ${editor.isActive('link') ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
            title="Add Link"
          >
            <LinkIcon className="h-4 w-4" />
          </button>
          
          <div className="w-px h-5 bg-slate-300 mx-1" />
          
          {/* @Mention button */}
          <button
            onClick={insertMentionSymbol}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
            title="Mention someone (@)"
          >
            <AtSign className="h-4 w-4" />
          </button>
          
          {/* Emoji */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
              title="Add Emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            {showEmojiPicker && (
              <EmojiPicker 
                onSelect={insertEmoji} 
                onClose={() => setShowEmojiPicker(false)} 
              />
            )}
          </div>
          
          {/* File attachments */}
          <label className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer" title="Attach File">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
            <Paperclip className="h-4 w-4" />
          </label>
          
          <label className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer" title="Add Image">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*"
            />
            <Image className="h-4 w-4" />
          </label>
        </div>
        
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button 
            size="sm" 
            onClick={handleSubmit}
            disabled={!isSubmitEnabled}
            className="gap-1"
            data-testid="chatter-post-button"
          >
            <Send className="h-3.5 w-3.5" />
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RichTextEditor;
