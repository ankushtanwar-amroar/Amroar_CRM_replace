import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, X, Check, Undo2, MessageSquare, Trash2, ChevronDown, Paperclip, FileText, Globe } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ScrollArea } from '../../components/ui/scroll-area';
import { cn } from '../../lib/utils';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'csv', 'xlsx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const CluBotChat = ({ isOpen, onClose, context = null }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [pendingPreview, setPendingPreview] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.rsplit?.('.', 1)?.[1]?.toLowerCase() || file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: `File type '.${ext}' is not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
        timestamp: new Date(),
        isError: true
      }]);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 10MB.`,
        timestamp: new Date(),
        isError: true
      }]);
      return;
    }

    setIsUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `${API_URL}/api/clu-bot/upload`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const data = response.data;
      setAttachedFile({
        id: data.file_id,
        name: data.file_name,
        type: data.file_type,
        size: data.size_bytes
      });

      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        isFileUpload: true
      }]);

    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to upload file.';
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: errorMsg,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendMessage = useCallback(async (message) => {
    if (!message.trim()) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date(),
      attachedFile: attachedFile ? { ...attachedFile } : null
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Build chat context with attached file info
      const chatContext = { ...context };
      if (attachedFile) {
        chatContext.attached_file_id = attachedFile.id;
        chatContext.attached_file_name = attachedFile.name;
      }

      const response = await axios.post(
        `${API_URL}/api/clu-bot/chat`,
        {
          message,
          conversation_id: conversationId,
          context: chatContext
        },
        { headers: getAuthHeaders() }
      );

      const data = response.data;
      setConversationId(data.conversation_id);

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        actionType: data.action_type,
        requiresConfirmation: data.requires_confirmation,
        previewData: data.preview_data,
        resultData: data.result_data,
        suggestions: data.suggestions
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (data.requires_confirmation && data.preview_data) {
        setPendingPreview(data.preview_data);
      }

    } catch (error) {
      console.error('CLU-BOT error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, context]);

  const handleConfirm = async (confirmed) => {
    if (!pendingPreview) return;

    setIsLoading(true);
    setPendingPreview(null);

    try {
      const response = await axios.post(
        `${API_URL}/api/clu-bot/chat/confirm`,
        {
          conversation_id: conversationId,
          action_id: pendingPreview.action_id,
          confirmed
        },
        { headers: getAuthHeaders() }
      );

      const data = response.data;
      
      const confirmMessage = {
        id: Date.now(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        actionType: data.action_type,
        resultData: data.result_data,
        suggestions: data.suggestions,
        wasConfirmed: confirmed
      };

      setMessages(prev => [...prev, confirmMessage]);

    } catch (error) {
      console.error('Confirm error:', error);
      const errorMessage = {
        id: Date.now(),
        role: 'assistant',
        content: 'Failed to process your confirmation. Please try again.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = async (journalEntryId) => {
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_URL}/api/clu-bot/undo/${journalEntryId}`,
        {},
        { headers: getAuthHeaders() }
      );

      const undoMessage = {
        id: Date.now(),
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date(),
        isUndo: true
      };

      setMessages(prev => [...prev, undoMessage]);

    } catch (error) {
      console.error('Undo error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion);
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setPendingPreview(null);
    setAttachedFile(null);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed bottom-4 right-4 w-96 h-[600px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col z-50 overflow-hidden"
      data-testid="clu-bot-chat-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">CLU-BOT</h3>
            <p className="text-xs text-white/70">CRM Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={startNewConversation}
            title="New conversation"
            data-testid="clu-bot-new-conversation-btn"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={onClose}
            data-testid="clu-bot-close-btn"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center py-8" data-testid="clu-bot-welcome">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Bot className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
              Hi! I'm CLU-BOT
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Your CRM assistant. I can help you:
            </p>
            <div className="space-y-2 text-sm text-left max-w-[280px] mx-auto">
              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-blue-500">•</span>
                <span>Search for records (leads, contacts, accounts)</span>
              </div>
              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-blue-500">•</span>
                <span>Get record summaries</span>
              </div>
              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-blue-500">•</span>
                <span>Create leads, notes, and tasks</span>
              </div>
              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-blue-500">•</span>
                <span>Analytics, trends & forecasting</span>
              </div>
              <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-blue-500">•</span>
                <span>Analyze files & URLs</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onUndo={handleUndo}
              onSuggestionClick={handleSuggestionClick}
            />
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 mt-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}
      </ScrollArea>

      {/* Confirmation Buttons */}
      {pendingPreview && !isLoading && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => handleConfirm(true)}
              data-testid="clu-bot-confirm-btn"
            >
              <Check className="w-4 h-4 mr-2" />
              Yes, proceed
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleConfirm(false)}
              data-testid="clu-bot-cancel-btn"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        {/* Attached file indicator */}
        {attachedFile && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs" data-testid="clu-bot-attached-file">
            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span className="text-blue-700 dark:text-blue-300 truncate flex-1">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="text-blue-400 hover:text-blue-600 flex-shrink-0"
              data-testid="clu-bot-remove-file-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="clu-bot-file-input"
          />

          {/* Attach file button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading || pendingPreview}
            className="h-10 w-10 flex-shrink-0 text-gray-500 hover:text-blue-600"
            title="Attach file (PDF, DOCX, TXT, CSV, XLSX)"
            data-testid="clu-bot-attach-btn"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </Button>

          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedFile ? "Ask about the attached file..." : "Ask me anything..."}
            disabled={isLoading || pendingPreview || isUploading}
            className="flex-1"
            data-testid="clu-bot-input"
          />
          <Button
            onClick={() => sendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim() || pendingPreview || isUploading}
            size="icon"
            data-testid="clu-bot-send-btn"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const MessageBubble = ({ message, onUndo, onSuggestionClick }) => {
  const isUser = message.role === 'user';
  const journalEntryId = message.resultData?.journal_entry_id;

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
      )}
      
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-2",
        isUser 
          ? "bg-blue-600 text-white" 
          : message.isError 
            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"
            : message.isUndo
              ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800"
              : message.isFileUpload
                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      )}>
        {/* File attachment indicator on user messages */}
        {isUser && message.attachedFile && (
          <div className="flex items-center gap-1.5 mb-1 text-blue-200 text-xs">
            <FileText className="w-3 h-3" />
            <span className="truncate">{message.attachedFile.name}</span>
          </div>
        )}
        
        <div className="text-sm whitespace-pre-wrap">
          {formatMessage(message.content)}
        </div>
        
        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick(suggestion)}
                className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                data-testid={`clu-bot-suggestion-${idx}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Undo Button for executed actions */}
        {journalEntryId && message.wasConfirmed !== false && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => onUndo(journalEntryId)}
              className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              data-testid="clu-bot-undo-btn"
            >
              <Undo2 className="w-3 h-3" />
              Undo this action
            </button>
          </div>
        )}

        {/* Record Results */}
        {message.resultData?.records && message.resultData.records.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.resultData.records.slice(0, 3).map((record, idx) => (
              <RecordCard key={idx} record={record} />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </div>
      )}
    </div>
  );
};

const RecordCard = ({ record }) => {
  return (
    <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
      <div className="font-medium text-gray-900 dark:text-gray-100">
        {record.name}
      </div>
      <div className="text-gray-500 dark:text-gray-400">
        {record.series_id} • {record.object_type}
      </div>
      {record.data?.email && (
        <div className="text-gray-600 dark:text-gray-300 mt-1">
          {record.data.email}
        </div>
      )}
    </div>
  );
};

const formatMessage = (content) => {
  if (!content) return '';
  
  // Convert **text** to bold
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

export default CluBotChat;
