/**
 * NoteEditorModal - Rich Text Editor for Notes
 * 
 * WYSIWYG editor with:
 * - Bold, Italic, Underline
 * - Lists (bullet, numbered)
 * - Links
 * - Headings
 * 
 * Uses contentEditable for simplicity (no external rich text library dependency)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Heading1,
  Heading2,
  Quote,
  Undo,
  Redo,
  Pin,
  Save,
  X,
  Loader2
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';

/**
 * Toolbar Button Component
 */
const ToolbarButton = ({ icon: Icon, label, onClick, active = false }) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={`
            p-2 rounded hover:bg-slate-100 transition-colors
            ${active ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}
          `}
          onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

/**
 * Link Dialog for inserting links
 */
const LinkDialog = ({ isOpen, onClose, onInsert }) => {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  
  const handleInsert = () => {
    if (url) {
      onInsert(url, text || url);
      setUrl('');
      setText('');
      onClose();
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Insert Link
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="link-text">Display Text (optional)</Label>
            <Input
              id="link-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Click here"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleInsert} disabled={!url}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Rich Text Editor Component
 */
const RichTextEditor = ({ value, onChange, placeholder }) => {
  const editorRef = useRef(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  
  // Initialize content
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || '';
    }
  }, []);
  
  // Handle content changes
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);
  
  // Execute formatting command
  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };
  
  // Insert link
  const insertLink = (url, text) => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.textContent = text;
      range.insertNode(link);
      
      // Move cursor after link
      range.setStartAfter(link);
      range.setEndAfter(link);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    editorRef.current?.focus();
    handleInput();
  };
  
  // Handle paste - clean HTML
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };
  
  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-slate-50 flex-wrap">
        <ToolbarButton 
          icon={Bold} 
          label="Bold (Ctrl+B)" 
          onClick={() => execCommand('bold')} 
        />
        <ToolbarButton 
          icon={Italic} 
          label="Italic (Ctrl+I)" 
          onClick={() => execCommand('italic')} 
        />
        <ToolbarButton 
          icon={Underline} 
          label="Underline (Ctrl+U)" 
          onClick={() => execCommand('underline')} 
        />
        
        <div className="w-px h-6 bg-slate-200 mx-1" />
        
        <ToolbarButton 
          icon={Heading1} 
          label="Heading 1" 
          onClick={() => execCommand('formatBlock', 'h1')} 
        />
        <ToolbarButton 
          icon={Heading2} 
          label="Heading 2" 
          onClick={() => execCommand('formatBlock', 'h2')} 
        />
        
        <div className="w-px h-6 bg-slate-200 mx-1" />
        
        <ToolbarButton 
          icon={List} 
          label="Bullet List" 
          onClick={() => execCommand('insertUnorderedList')} 
        />
        <ToolbarButton 
          icon={ListOrdered} 
          label="Numbered List" 
          onClick={() => execCommand('insertOrderedList')} 
        />
        <ToolbarButton 
          icon={Quote} 
          label="Quote" 
          onClick={() => execCommand('formatBlock', 'blockquote')} 
        />
        
        <div className="w-px h-6 bg-slate-200 mx-1" />
        
        <ToolbarButton 
          icon={Link2} 
          label="Insert Link" 
          onClick={() => setShowLinkDialog(true)} 
        />
        
        <div className="w-px h-6 bg-slate-200 mx-1" />
        
        <ToolbarButton 
          icon={Undo} 
          label="Undo (Ctrl+Z)" 
          onClick={() => execCommand('undo')} 
        />
        <ToolbarButton 
          icon={Redo} 
          label="Redo (Ctrl+Y)" 
          onClick={() => execCommand('redo')} 
        />
      </div>
      
      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        className="min-h-[200px] max-h-[400px] overflow-y-auto p-4 focus:outline-none prose prose-sm max-w-none"
        style={{ 
          lineHeight: '1.6',
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      
      {/* Link Dialog */}
      <LinkDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onInsert={insertLink}
      />
      
      {/* Placeholder style */}
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable] h1 { font-size: 1.5rem; font-weight: 700; margin: 0.5rem 0; }
        [contenteditable] h2 { font-size: 1.25rem; font-weight: 600; margin: 0.5rem 0; }
        [contenteditable] ul { list-style: disc; padding-left: 1.5rem; }
        [contenteditable] ol { list-style: decimal; padding-left: 1.5rem; }
        [contenteditable] blockquote { 
          border-left: 3px solid #e2e8f0; 
          padding-left: 1rem; 
          margin: 0.5rem 0;
          color: #64748b;
        }
        [contenteditable] a { color: #2563eb; text-decoration: underline; }
      `}</style>
    </div>
  );
};

/**
 * Main Note Editor Modal
 */
const NoteEditorModal = ({ 
  isOpen, 
  onClose, 
  note = null, 
  onSave,
  recordName 
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Initialize form when note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.body_rich_text || '');
      setIsPinned(note.is_pinned || false);
    } else {
      setTitle('');
      setContent('');
      setIsPinned(false);
    }
  }, [note, isOpen]);
  
  // Handle save
  const handleSave = async () => {
    if (!title.trim()) {
      return;
    }
    
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        body_rich_text: content,
        is_pinned: isPinned
      });
    } finally {
      setSaving(false);
    }
  };
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {note ? 'Edit Note' : 'New Note'}
            {recordName && (
              <span className="text-sm font-normal text-slate-500">
                for {recordName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Title */}
          <div>
            <Label htmlFor="note-title" className="text-sm font-medium">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter note title..."
              className="mt-1"
              autoFocus
            />
          </div>
          
          {/* Content Editor */}
          <div>
            <Label className="text-sm font-medium">Content</Label>
            <div className="mt-1">
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Start writing your note..."
              />
            </div>
          </div>
          
          {/* Options */}
          <div className="flex items-center gap-4 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="note-pinned"
                checked={isPinned}
                onCheckedChange={setIsPinned}
              />
              <label 
                htmlFor="note-pinned" 
                className="text-sm font-medium flex items-center gap-1 cursor-pointer"
              >
                <Pin className="w-4 h-4 text-amber-500" />
                Pin this note
              </label>
            </div>
          </div>
        </div>
        
        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-400">
              Ctrl+S to save
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={!title.trim() || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {note ? 'Update Note' : 'Create Note'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NoteEditorModal;
