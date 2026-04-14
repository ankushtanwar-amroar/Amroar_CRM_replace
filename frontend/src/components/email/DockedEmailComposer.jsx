/**
 * DockedEmailComposer - Salesforce-style docked bottom-right email composer
 * 
 * Features:
 * - Docked to bottom-right corner
 * - Can be minimized, expanded, closed
 * - Does NOT block page interaction
 * - Rich text editor with formatting toolbar
 * - Related To field with lookup support
 * - Email suggestions autocomplete in To field
 * - File attachments support
 * - Save as Draft functionality
 * - Template loading with proper HTML rendering
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Minus, Maximize2, Minimize2, Send, Paperclip, 
  ChevronDown, Bold, Italic, Underline, List, ListOrdered,
  Link, Image, AlignLeft, AlignCenter, AlignRight,
  Loader2, Search, ExternalLink, FileText, ChevronRight,
  Save, Trash2, User, Mail, Building2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Email Suggestions Component (Autocomplete for To/Cc/Bcc fields)
 */
const EmailSuggestions = ({ value, onChange, placeholder, fieldId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Parse multiple emails (comma-separated)
  const emails = value ? value.split(',').map(e => e.trim()).filter(Boolean) : [];

  // Debounced search
  const searchContacts = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const results = [];

      // Search leads, contacts, accounts
      const objectTypes = ['lead', 'contact', 'account'];
      await Promise.all(objectTypes.map(async (objType) => {
        try {
          const response = await fetch(
            `${API_URL}/api/objects/${objType}/records?search=${encodeURIComponent(searchQuery)}&limit=5`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (response.ok) {
            const data = await response.json();
            const records = data.records || data || [];
            records.forEach(rec => {
              const email = rec.data?.email || rec.data?.Email;
              if (email) {
                results.push({
                  email,
                  name: rec.data?.Name || rec.data?.name || 
                        `${rec.data?.first_name || ''} ${rec.data?.last_name || ''}`.trim() || 
                        email.split('@')[0],
                  type: objType,
                  id: rec.id
                });
              }
            });
          }
        } catch (e) {
          console.error(`Error searching ${objType}:`, e);
        }
      }));

      // Remove duplicates by email
      const uniqueResults = results.filter((item, index, self) => 
        index === self.findIndex(t => t.email === item.email)
      );

      setSuggestions(uniqueResults.slice(0, 8));
      setSelectedIndex(0);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setQuery(newValue);
    
    // Get the last email being typed (after the last comma)
    const parts = newValue.split(',');
    const currentPart = parts[parts.length - 1].trim();
    
    // Clear previous debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    // Debounce search
    debounceRef.current = setTimeout(() => {
      if (currentPart.length >= 2) {
        searchContacts(currentPart);
        setIsOpen(true);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 300);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion) => {
    const parts = query.split(',');
    parts[parts.length - 1] = suggestion.email;
    const newValue = parts.join(', ') + ', ';
    onChange(newValue.replace(/,\s*,/g, ',').replace(/^,\s*/, ''));
    setQuery(newValue);
    setIsOpen(false);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  // Sync query with external value changes
  useEffect(() => {
    if (value !== query) {
      setQuery(value || '');
    }
  }, [value]);

  // Blur with value update
  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      if (query !== value) {
        onChange(query);
      }
    }, 200);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'contact': return <User className="h-3.5 w-3.5 text-blue-500" />;
      case 'lead': return <User className="h-3.5 w-3.5 text-green-500" />;
      case 'account': return <Building2 className="h-3.5 w-3.5 text-purple-500" />;
      default: return <Mail className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="relative flex-1">
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="h-8 text-sm"
        data-testid={fieldId}
      />
      
      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-center">
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" />
            </div>
          ) : (
            suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.email}-${index}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectSuggestion(suggestion);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  index === selectedIndex ? "bg-blue-50" : "hover:bg-slate-50"
                )}
              >
                {getTypeIcon(suggestion.type)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-700 truncate">{suggestion.name}</p>
                  <p className="text-xs text-slate-500 truncate">{suggestion.email}</p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {suggestion.type}
                </Badge>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Related To Lookup Component
 */
const RelatedToLookup = ({ value, onChange, initialRecord }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(initialRecord);

  useEffect(() => {
    if (initialRecord && !selectedRecord) {
      setSelectedRecord(initialRecord);
      onChange?.(initialRecord);
    }
  }, [initialRecord, selectedRecord, onChange]);

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const token = localStorage.getItem('token');
      const objectTypes = ['contact', 'lead', 'account', 'opportunity'];
      const allResults = [];

      await Promise.all(objectTypes.map(async (objType) => {
        try {
          const response = await fetch(
            `${API_URL}/api/objects/${objType}/records?search=${encodeURIComponent(query)}&limit=5`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (response.ok) {
            const data = await response.json();
            const records = data.records || data || [];
            records.forEach(rec => {
              allResults.push({
                id: rec.id || rec.series_id,
                type: objType,
                name: rec.data?.Name || rec.data?.name || 
                      `${rec.data?.first_name || ''} ${rec.data?.last_name || ''}`.trim() ||
                      rec.id?.substring(0, 12)
              });
            });
          }
        } catch (e) {
          console.error(`Error searching ${objType}:`, e);
        }
      }));

      setSearchResults(allResults.slice(0, 10));
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (record) => {
    setSelectedRecord(record);
    onChange?.(record);
    setIsOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedRecord(null);
    onChange?.(null);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
            "border rounded bg-white hover:bg-slate-50 transition-colors cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-blue-500"
          )}
          role="button"
          tabIndex={0}
          data-testid="related-to-lookup"
        >
          {selectedRecord ? (
            <span className="flex items-center gap-2 text-slate-800">
              <span className="text-xs text-slate-500 uppercase">{selectedRecord.type}</span>
              <span className="font-medium">{selectedRecord.name}</span>
            </span>
          ) : (
            <span className="text-slate-400">Search records...</span>
          )}
          <div className="flex items-center gap-1">
            {selectedRecord && (
              <span 
                onClick={handleClear} 
                className="p-0.5 hover:bg-slate-100 rounded cursor-pointer"
              >
                <X className="h-3 w-3 text-slate-400" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search contacts, leads, accounts..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {isSearching ? (
            <div className="p-4 text-center text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
              <span className="text-xs">Searching...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="py-1">
              {searchResults.map((record, idx) => (
                <button
                  key={`${record.type}-${record.id}-${idx}`}
                  onClick={() => handleSelect(record)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100 flex items-center gap-2 text-sm"
                >
                  <span className="text-xs text-slate-500 uppercase w-16">{record.type}</span>
                  <span className="truncate">{record.name}</span>
                </button>
              ))}
            </div>
          ) : searchQuery.length >= 2 ? (
            <div className="p-4 text-center text-slate-500 text-sm">No records found</div>
          ) : (
            <div className="p-4 text-center text-slate-500 text-sm">Type to search records</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Simple Rich Text Editor with Toolbar
 * Fixed to properly update when template is loaded
 */
const RichTextEditor = ({ value, onChange, placeholder }) => {
  const editorRef = useRef(null);
  const [internalHtml, setInternalHtml] = useState(value || '');

  // Update editor content when value prop changes (e.g., template loaded)
  useEffect(() => {
    if (editorRef.current && value !== internalHtml) {
      editorRef.current.innerHTML = value || '';
      setInternalHtml(value || '');
    }
  }, [value]);

  const execCommand = (command, cmdValue = null) => {
    document.execCommand(command, false, cmdValue);
    editorRef.current?.focus();
    const newHtml = editorRef.current?.innerHTML || '';
    setInternalHtml(newHtml);
    onChange?.(newHtml);
  };

  const handleInput = () => {
    const newHtml = editorRef.current?.innerHTML || '';
    setInternalHtml(newHtml);
    onChange?.(newHtml);
  };

  return (
    <div className="border rounded-md overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-1.5 border-b bg-slate-50 flex-wrap">
        <button onClick={() => execCommand('bold')} className="p-1.5 hover:bg-slate-200 rounded" title="Bold" type="button">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCommand('italic')} className="p-1.5 hover:bg-slate-200 rounded" title="Italic" type="button">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCommand('underline')} className="p-1.5 hover:bg-slate-200 rounded" title="Underline" type="button">
          <Underline className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-slate-200 rounded" title="Bullet List" type="button">
          <List className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCommand('insertOrderedList')} className="p-1.5 hover:bg-slate-200 rounded" title="Numbered List" type="button">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button onClick={() => execCommand('justifyLeft')} className="p-1.5 hover:bg-slate-200 rounded" title="Align Left" type="button">
          <AlignLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCommand('justifyCenter')} className="p-1.5 hover:bg-slate-200 rounded" title="Align Center" type="button">
          <AlignCenter className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCommand('justifyRight')} className="p-1.5 hover:bg-slate-200 rounded" title="Align Right" type="button">
          <AlignRight className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button
          onClick={() => {
            const url = prompt('Enter URL:');
            if (url) execCommand('createLink', url);
          }}
          className="p-1.5 hover:bg-slate-200 rounded"
          title="Insert Link"
          type="button"
        >
          <Link className="h-3.5 w-3.5" />
        </button>
      </div>
      
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="min-h-[120px] max-h-[200px] overflow-y-auto p-3 text-sm focus:outline-none prose prose-sm max-w-none"
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
};

/**
 * File Attachment Component - handles both new files and server-stored attachments
 */
const AttachmentsList = ({ attachments, onRemove, draftAttachments, onRemoveDraftAttachment, isRemoving }) => {
  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasDraftAttachments = draftAttachments && draftAttachments.length > 0;
  const hasNewAttachments = attachments && attachments.length > 0;

  if (!hasDraftAttachments && !hasNewAttachments) return null;

  return (
    <div className="space-y-1">
      {/* Server-stored draft attachments */}
      {hasDraftAttachments && draftAttachments.map((att) => (
        <div 
          key={att.id}
          className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded border border-blue-200 text-sm"
        >
          <Paperclip className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
          <span className="truncate flex-1 text-slate-700">{att.name}</span>
          <span className="text-xs text-slate-500 flex-shrink-0">{formatSize(att.size)}</span>
          <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-300">
            Saved
          </Badge>
          <button
            onClick={() => onRemoveDraftAttachment(att.id)}
            disabled={isRemoving}
            className="p-0.5 hover:bg-blue-100 rounded text-slate-400 hover:text-red-500 disabled:opacity-50"
            type="button"
            title="Remove attachment"
          >
            {isRemoving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ))}
      
      {/* New attachments (not yet uploaded) */}
      {hasNewAttachments && attachments.map((file, index) => (
        <div 
          key={`new-${file.name}-${index}`}
          className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded border text-sm"
        >
          <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="truncate flex-1 text-slate-700">{file.name}</span>
          <span className="text-xs text-slate-500 flex-shrink-0">{formatSize(file.size)}</span>
          <Badge variant="outline" className="text-[10px]">
            New
          </Badge>
          <button
            onClick={() => onRemove(index)}
            className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-red-500"
            type="button"
            title="Remove attachment"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

/**
 * Main Docked Email Composer Component
 */
const DockedEmailComposer = ({
  isOpen,
  onClose,
  recipientEmail = '',
  recipientName = '',
  relatedRecordId = null,
  relatedRecordType = null,
  relatedRecordName = null,
  onEmailSent = null,
  draftData = null, // For loading existing draft
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  
  // Template state
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  
  // Attachments state
  const [attachments, setAttachments] = useState([]); // New files to upload
  const [draftAttachments, setDraftAttachments] = useState([]); // Server-stored draft attachments
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [removingAttachment, setRemovingAttachment] = useState(false);
  const fileInputRef = useRef(null);
  
  // Draft state
  const [draftId, setDraftId] = useState(null);
  
  const [formData, setFormData] = useState({
    from: 'me',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: ''
  });
  
  const [relatedTo, setRelatedTo] = useState(null);

  // Initialize form when popup opens
  useEffect(() => {
    if (isOpen) {
      if (draftData) {
        // Load from draft
        setFormData({
          from: 'me',
          to: draftData.to_email || '',
          cc: draftData.cc_email || '',
          bcc: draftData.bcc_email || '',
          subject: draftData.subject || '',
          body: draftData.body || ''
        });
        setDraftId(draftData.id);
        if (draftData.related_record_id && draftData.related_record_type) {
          setRelatedTo({
            id: draftData.related_record_id,
            type: draftData.related_record_type,
            name: draftData.related_record_name || draftData.related_record_id
          });
        }
        if (draftData.cc_email || draftData.bcc_email) {
          setShowCcBcc(true);
        }
        // Restore attachments from draft - these are now persisted on server
        if (draftData.attachments && draftData.attachments.length > 0) {
          // Set draft attachments for display (they're stored on server now)
          setDraftAttachments(draftData.attachments);
        } else {
          setDraftAttachments([]);
        }
        setAttachments([]); // Clear any new attachments
      } else {
        // Fresh email
        setFormData(prev => ({
          ...prev,
          to: recipientEmail || '',
        }));
        
        if (relatedRecordId && relatedRecordType) {
          setRelatedTo({
            id: relatedRecordId,
            type: relatedRecordType,
            name: relatedRecordName || relatedRecordId.substring(0, 12)
          });
        }
        setDraftAttachments([]);
        setAttachments([]);
      }
    }
  }, [isOpen, recipientEmail, relatedRecordId, relatedRecordType, relatedRecordName, draftData]);

  // Fetch email templates
  const fetchTemplates = async () => {
    if (templates.length > 0) return;
    
    setLoadingTemplates(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/email-templates/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Handle template selection - FIXED to properly load content
  const handleSelectTemplate = async (template) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/email-templates/templates/${template.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const fullTemplate = await response.json();
        
        // Get template content (HTML or plain text)
        let bodyContent = fullTemplate.html_content || fullTemplate.plain_text_content || '';
        
        // If template has blocks (design mode), render them to HTML
        if (fullTemplate.blocks && fullTemplate.blocks.length > 0) {
          bodyContent = renderBlocksToHtml(fullTemplate.blocks);
        }
        
        // Replace merge fields with actual data
        if (relatedTo) {
          bodyContent = replaceMergeFields(bodyContent, relatedTo);
        }
        
        // Update form data - this will trigger the RichTextEditor to update
        setFormData(prev => ({
          ...prev,
          subject: fullTemplate.subject || prev.subject,
          body: bodyContent
        }));
        
        setSelectedTemplateName(template.name);
        
        toast.success(`Template "${template.name}" applied`, {
          description: 'Subject and body updated'
        });
      } else {
        // Fallback
        if (template.subject) {
          setFormData(prev => ({ ...prev, subject: template.subject }));
        }
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template content');
    }
    setShowTemplates(false);
  };

  // Render template blocks to HTML
  const renderBlocksToHtml = (blocks) => {
    if (!blocks || blocks.length === 0) return '';
    
    return blocks.map(block => {
      const content = block.content || {};
      const styles = block.styles || {};
      
      switch (block.type) {
        case 'heading':
          const headingTag = block.level || 'h2';
          const headingText = content.html || content.text || '';
          return `<${headingTag} style="margin: 16px 0; color: #1e293b;">${headingText}</${headingTag}>`;
        case 'paragraph':
        case 'text':
          // Content can be {text: string, html: string} or just string
          const textContent = content.html || content.text || (typeof content === 'string' ? content : '');
          return `<div style="margin: 12px 0; line-height: 1.6;">${textContent}</div>`;
        case 'button':
          const btnText = content.text || 'Click Here';
          const btnUrl = content.url || '#';
          const bgColor = styles['background-color'] || '#3b82f6';
          const textColor = styles.color || '#ffffff';
          return `<div style="margin: 16px 0;"><a href="${btnUrl}" style="display: inline-block; padding: 10px 20px; background-color: ${bgColor}; color: ${textColor}; text-decoration: none; border-radius: 6px;">${btnText}</a></div>`;
        case 'image':
          const imgSrc = content.src || content.url || '';
          const imgAlt = content.alt || '';
          return imgSrc ? `<div style="margin: 16px 0;"><img src="${imgSrc}" alt="${imgAlt}" style="max-width: 100%; height: auto;" /></div>` : '';
        case 'divider':
          return `<hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;" />`;
        case 'spacer':
          const height = styles.height || '20px';
          return `<div style="height: ${height};"></div>`;
        case 'signature':
          const name = content.name || '';
          const title = content.title || '';
          const company = content.company || '';
          return `<div style="margin: 24px 0; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            ${name ? `<p style="margin: 4px 0; font-weight: 600;">${name}</p>` : ''}
            ${title ? `<p style="margin: 4px 0; color: #64748b; font-size: 14px;">${title}</p>` : ''}
            ${company ? `<p style="margin: 4px 0; color: #64748b; font-size: 14px;">${company}</p>` : ''}
          </div>`;
        default:
          return content.html || content.text || (typeof content === 'string' ? `<p>${content}</p>` : '');
      }
    }).join('\n');
  };

  // Replace merge fields
  const replaceMergeFields = (content, record) => {
    if (!content) return content;
    
    // Common merge field replacements
    const replacements = {
      '{{name}}': record.name || '',
      '{{Name}}': record.name || '',
      '{{first_name}}': record.name?.split(' ')[0] || '',
      '{{FirstName}}': record.name?.split(' ')[0] || '',
      '{{last_name}}': record.name?.split(' ').slice(1).join(' ') || '',
      '{{LastName}}': record.name?.split(' ').slice(1).join(' ') || '',
      '{{email}}': recipientEmail || '',
      '{{Email}}': recipientEmail || ''
    };

    let result = content;
    Object.entries(replacements).forEach(([key, value]) => {
      result = result.replace(new RegExp(key, 'g'), value);
    });

    return result;
  };

  // Filter templates by search
  const filteredTemplates = templates.filter(t => 
    t.name?.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.subject?.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle file attachment
  const handleAttachFiles = (e) => {
    const files = Array.from(e.target.files);
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    setAttachments(prev => [...prev, ...validFiles]);
    e.target.value = ''; // Reset input
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Remove server-stored draft attachment
  const handleRemoveDraftAttachment = async (attachmentId) => {
    if (!draftId) return;
    
    setRemovingAttachment(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/email/drafts/${draftId}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        setDraftAttachments(prev => prev.filter(a => a.id !== attachmentId));
        toast.success('Attachment removed');
      } else {
        toast.error('Failed to remove attachment');
      }
    } catch (error) {
      console.error('Error removing attachment:', error);
      toast.error('Failed to remove attachment');
    } finally {
      setRemovingAttachment(false);
    }
  };

  // Upload attachment to draft
  const uploadAttachmentToDraft = async (file, draftIdToUse) => {
    const token = localStorage.getItem('token');
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    
    const response = await fetch(`${API_URL}/api/email/drafts/${draftIdToUse}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formDataObj
    });
    
    if (response.ok) {
      return await response.json();
    }
    throw new Error('Failed to upload attachment');
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    if (!formData.to.trim() && !formData.subject.trim() && !formData.body.trim()) {
      toast.error('Cannot save empty draft');
      return;
    }

    setIsSavingDraft(true);
    try {
      const token = localStorage.getItem('token');
      
      const draftPayload = {
        to_email: formData.to,
        cc_email: formData.cc || null,
        bcc_email: formData.bcc || null,
        subject: formData.subject,
        body: formData.body,
        related_record_id: relatedTo?.id || null,
        related_record_type: relatedTo?.type || null,
        related_record_name: relatedTo?.name || null
      };

      let response;
      let currentDraftId = draftId;
      
      if (currentDraftId) {
        // Update existing draft
        response = await fetch(`${API_URL}/api/email/drafts/${currentDraftId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(draftPayload)
        });
      } else {
        // Create new draft
        response = await fetch(`${API_URL}/api/email/drafts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(draftPayload)
        });
      }

      if (response.ok) {
        const data = await response.json();
        currentDraftId = data.id || currentDraftId;
        setDraftId(currentDraftId);
        
        // Upload any new attachments
        if (attachments.length > 0 && currentDraftId) {
          setUploadingAttachment(true);
          const uploadedAttachments = [];
          
          for (const file of attachments) {
            try {
              const uploaded = await uploadAttachmentToDraft(file, currentDraftId);
              uploadedAttachments.push(uploaded);
            } catch (error) {
              console.error(`Failed to upload ${file.name}:`, error);
              toast.error(`Failed to upload ${file.name}`);
            }
          }
          
          // Add uploaded attachments to draft attachments and clear new files
          if (uploadedAttachments.length > 0) {
            setDraftAttachments(prev => [...prev, ...uploadedAttachments]);
            setAttachments([]);
          }
          setUploadingAttachment(false);
        }
        
        const totalAttachments = draftAttachments.length + attachments.length;
        toast.success('Draft saved successfully', {
          description: totalAttachments > 0 ? `with ${totalAttachments} attachment(s)` : undefined
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail || 'Failed to save draft');
      }
    } catch (error) {
      console.error('Save draft error:', error);
      toast.error('Failed to save draft');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Helper function to clean and parse email list
  const parseEmailList = (emailString) => {
    if (!emailString) return [];
    // Split by comma, trim whitespace, filter empty strings
    return emailString
      .split(',')
      .map(e => e.trim())
      .filter(e => e.length > 0);
  };

  // Helper function to validate email format
  const isValidEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  // Send email
  const handleSend = async () => {
    if (!formData.to.trim()) {
      toast.error('Recipient email is required');
      return;
    }
    if (!formData.subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!formData.body.trim()) {
      toast.error('Email body is required');
      return;
    }

    // Parse and validate email addresses (handles trailing commas, spaces)
    const toEmails = parseEmailList(formData.to);
    const ccEmails = parseEmailList(formData.cc);
    const bccEmails = parseEmailList(formData.bcc);
    
    // Check we have at least one To recipient
    if (toEmails.length === 0) {
      toast.error('At least one recipient email is required');
      return;
    }
    
    // Validate all emails
    const allEmails = [...toEmails, ...ccEmails, ...bccEmails];
    for (const email of allEmails) {
      if (!isValidEmail(email)) {
        toast.error(`Invalid email address: ${email}`);
        return;
      }
    }

    setIsSending(true);
    try {
      const token = localStorage.getItem('token');
      
      // Prepare form data for multipart (with attachments)
      const formDataObj = new FormData();
      // Send cleaned email lists (joined back, cleaned of trailing commas)
      formDataObj.append('to', toEmails.join(', '));
      if (ccEmails.length > 0) formDataObj.append('cc', ccEmails.join(', '));
      if (bccEmails.length > 0) formDataObj.append('bcc', bccEmails.join(', '));
      formDataObj.append('subject', formData.subject);
      formDataObj.append('body', formData.body);
      if (relatedTo?.id) formDataObj.append('related_record_id', relatedTo.id);
      if (relatedTo?.type) formDataObj.append('related_record_type', relatedTo.type);
      if (draftId) formDataObj.append('draft_id', draftId);
      
      // Add attachments
      attachments.forEach(file => {
        formDataObj.append('attachments', file);
      });

      const response = await fetch(`${API_URL}/api/email/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataObj
      });

      if (response.ok) {
        const result = await response.json();
        const recipientCount = toEmails.length + ccEmails.length + bccEmails.length;
        toast.success(`Email sent to ${recipientCount} recipient(s)!`, {
          description: attachments.length > 0 ? `with ${attachments.length} attachment(s)` : undefined
        });
        onEmailSent?.();
        onClose();
        resetForm();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail || 'Failed to send email');
      }
    } catch (error) {
      console.error('Send error:', error);
      toast.error('Failed to send email. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setFormData({
      from: 'me',
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: ''
    });
    setRelatedTo(null);
    setShowCcBcc(false);
    setAttachments([]);
    setDraftId(null);
    setSelectedTemplateName('');
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  if (!isOpen) return null;

  const baseWidth = isExpanded ? 650 : 480;
  const baseHeight = isMinimized ? 'auto' : (isExpanded ? 550 : 450);

  const composerContent = (
    <div
      className={cn(
        "fixed z-50 bg-white rounded-t-lg shadow-2xl border border-slate-200 flex flex-col",
        "transition-all duration-200 ease-in-out"
      )}
      style={{
        right: '24px',
        bottom: '0',
        width: `${baseWidth}px`,
        maxHeight: isMinimized ? 'auto' : `${baseHeight}px`,
      }}
      data-testid="docked-email-composer"
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg cursor-pointer"
        onClick={() => isMinimized && setIsMinimized(false)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {draftId ? 'Draft Email' : 'New Email'}
          </span>
          {selectedTemplateName && (
            <Badge variant="secondary" className="text-xs bg-blue-500 text-white border-0">
              {selectedTemplateName}
            </Badge>
          )}
          {formData.to && !selectedTemplateName && (
            <span className="text-xs text-blue-200 truncate max-w-[150px]">
              — {formData.to}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
            className="p-1 hover:bg-blue-500 rounded transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="p-1 hover:bg-blue-500 rounded transition-colors"
            title={isExpanded ? "Restore" : "Maximize"}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="p-1 hover:bg-blue-500 rounded transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* From */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 w-16 flex-shrink-0">From</Label>
            <Select value={formData.from} onValueChange={(val) => handleChange('from', val)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Me (Current User)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* To - With Email Suggestions */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 w-16 flex-shrink-0">
              To <span className="text-red-500">*</span>
            </Label>
            <div className="flex-1 flex items-center gap-1">
              <EmailSuggestions
                value={formData.to}
                onChange={(val) => handleChange('to', val)}
                placeholder="Search or type email..."
                fieldId="email-to-input"
              />
              {!showCcBcc && (
                <button
                  onClick={() => setShowCcBcc(true)}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  Cc/Bcc
                </button>
              )}
            </div>
          </div>

          {/* Cc/Bcc */}
          {showCcBcc && (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-500 w-16 flex-shrink-0">Cc</Label>
                <EmailSuggestions
                  value={formData.cc}
                  onChange={(val) => handleChange('cc', val)}
                  placeholder="cc@example.com"
                  fieldId="email-cc-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-500 w-16 flex-shrink-0">Bcc</Label>
                <EmailSuggestions
                  value={formData.bcc}
                  onChange={(val) => handleChange('bcc', val)}
                  placeholder="bcc@example.com"
                  fieldId="email-bcc-input"
                />
              </div>
            </>
          )}

          {/* Template Picker */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 w-16 flex-shrink-0">Template</Label>
            <Popover open={showTemplates} onOpenChange={(open) => {
              setShowTemplates(open);
              if (open) fetchTemplates();
            }}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-sm gap-2 text-slate-600 flex-1 justify-start"
                  data-testid="email-template-picker"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>{selectedTemplateName || 'Use Template'}</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      placeholder="Search templates..."
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="py-6 text-center">
                      <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">
                        {templates.length === 0 ? 'No templates available' : 'No matching templates'}
                      </p>
                    </div>
                  ) : (
                    filteredTemplates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className="w-full flex items-start gap-3 p-3 hover:bg-slate-50 transition-colors text-left border-b last:border-0"
                      >
                        <FileText className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{template.name}</p>
                          {template.subject && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{template.subject}</p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Subject */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 w-16 flex-shrink-0">
              Subject <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.subject}
              onChange={(e) => handleChange('subject', e.target.value)}
              placeholder="Enter subject"
              className="h-8 text-sm"
              data-testid="email-subject-input"
            />
          </div>

          {/* Related To */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 w-16 flex-shrink-0">Related To</Label>
            <div className="flex-1">
              <RelatedToLookup
                value={relatedTo}
                onChange={setRelatedTo}
                initialRecord={relatedTo}
              />
            </div>
          </div>

          {/* Rich Text Body */}
          <div>
            <RichTextEditor
              value={formData.body}
              onChange={(val) => handleChange('body', val)}
              placeholder="Write your message..."
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <AttachmentsList 
              attachments={attachments} 
              onRemove={handleRemoveAttachment}
              draftAttachments={draftAttachments}
              onRemoveDraftAttachment={handleRemoveDraftAttachment}
              isRemoving={removingAttachment}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleAttachFiles}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif"
            />
          </div>
        </div>
      )}

      {/* Footer */}
      {!isMinimized && (
        <div className="flex items-center justify-between px-3 py-2.5 border-t bg-slate-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 hover:bg-slate-200 rounded transition-colors text-slate-500"
              title="Attach file"
              type="button"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {(attachments.length > 0 || draftAttachments.length > 0) && (
              <span className="text-xs text-slate-500">
                {attachments.length + draftAttachments.length} file(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
            >
              {isSavingDraft ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isSending}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={isSending || !formData.to.trim() || !formData.subject.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="email-send-button"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(composerContent, document.body);
};

export default DockedEmailComposer;
