import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, X, Sparkles, ShieldCheck, Loader2, Mic, MicOff, Shield, AlertTriangle, Check, Eye } from 'lucide-react';
import { docflowService } from '../services/docflowService';

const MODES = [
  { id: 'assistant', label: 'Template Assistant', icon: Sparkles, color: 'indigo' },
  { id: 'validation', label: 'AI Validation', icon: ShieldCheck, color: 'amber' }
];

const VALIDATION_INTENT_PATTERNS = [
  /\bvalidate\b/i,
  /\bvalidation\b/i,
  /\brun ai validation\b/i,
  /\bdo validation\b/i,
  /\bcheck (whether|if).*(complete|looks complete|completeness)\b/i,
  /\blegally weak\b/i,
  /\bmissing (important )?clauses?\b/i,
  /\bmissing clauses?\b/i,
  /\bcheck.*contract.*missing\b/i,
];

const ClueBotPanel = ({ isOpen, onClose, templateData, fieldPlacements, contentBlocks, selectedText, selectedBlockId, onFieldsUpdate, onContentBlocksUpdate, onContentUpdate }) => {
  const [mode, setMode] = useState('assistant');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const messagesEndRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Policy state
  const [policy, setPolicy] = useState(null);
  const [policyLoading, setPolicyLoading] = useState(true);

  // Pending action state (for confirmation / preview)
  const [pendingAction, setPendingAction] = useState(null);

  const hasSpeechRecognition = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggleMic = useCallback(() => {
    if (!hasSpeechRecognition) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, hasSpeechRecognition]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch policy status when panel opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const fetchPolicy = async () => {
      setPolicyLoading(true);
      try {
        const data = await docflowService.cluebotPolicyStatus();
        if (!cancelled) setPolicy(data);
      } catch {
        if (!cancelled) setPolicy({ enabled: false, _error: true });
      } finally {
        if (!cancelled) setPolicyLoading(false);
      }
    };
    fetchPolicy();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Set welcome message when policy loads
  useEffect(() => {
    if (policyLoading || !policy) return;
    if (messages.length > 0) return;
    if (policy.enabled) {
      setMessages([{ role: 'bot', text: "Hi! I'm CluBot — your DocFlow AI assistant. I can help you build templates, validate content, and more. What would you like to do?" }]);
    }
  }, [policy, policyLoading, messages.length]);

  /* ─── Apply a pending action (after user confirms) ─── */
  const applyAction = useCallback((result) => {
    const action = result.action;
    if (action && action !== 'ANSWER' && action !== 'EDIT_CONTENT') {
      if (result.field_updates && Array.isArray(result.field_updates)) {
        onFieldsUpdate?.(result.field_updates);
      } else if (action === 'ADD_FIELD' && result.new_field) {
        const updatedFields = [...(fieldPlacements || []), result.new_field];
        onFieldsUpdate?.(updatedFields);
      }
    }
    if (action === 'EDIT_CONTENT' && result.block_edits?.length > 0 && onContentBlocksUpdate) {
      onContentBlocksUpdate(result.block_edits);
    } else if (action === 'EDIT_CONTENT' && result.content_edit && onContentUpdate) {
      onContentUpdate(result.content_edit);
    }
  }, [fieldPlacements, onFieldsUpdate, onContentBlocksUpdate, onContentUpdate]);

  /* ─── Handle confirmation ─── */
  const handleConfirm = () => {
    if (!pendingAction) return;
    applyAction(pendingAction);
    setMessages(prev => [...prev, { role: 'bot', text: `Action "${pendingAction.action}" applied successfully.`, isAction: true, action: pendingAction.action }]);
    setPendingAction(null);
  };

  const handleReject = () => {
    setMessages(prev => [...prev, { role: 'bot', text: 'Action cancelled.', isCancelled: true }]);
    setPendingAction(null);
  };

  /* ─── Send message ─── */
  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    try {
      if (mode === 'validation') {
        await handleValidationMode();
      } else {
        await handleAssistantMode(msg);
      }
      setRetryCount(0);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message || 'Something went wrong';
      setMessages(prev => [...prev, {
        role: 'bot',
        text: `Error: ${errorMessage}${retryCount < 2 ? ' Try again.' : ''}`,
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssistantMode = async (msg) => {
    if (VALIDATION_INTENT_PATTERNS.some((pattern) => pattern.test(msg || ''))) {
      await handleValidationMode(true);
      return;
    }

    const context = {
      fields: fieldPlacements || [],
      content_blocks: contentBlocks || [],
      selected_text: selectedText || '',
      selected_block_id: selectedBlockId || '',
      page_count: templateData?.page_count || 1,
      template_name: templateData?.name || 'Untitled',
      recipients: templateData?.recipients || [],
    };

    const result = await docflowService.cluebotChat(msg, context);

    if (!result.success) {
      throw new Error(result.error || 'Failed to process request');
    }

    const action = result.action;
    const isBlocked = result.policy_blocked;
    const safety = result.safety || {};
    const isWriteAction = action && action !== 'ANSWER';
    const needsConfirmation = isWriteAction && safety.require_confirmation;
    const needsPreview = isWriteAction && safety.preview_before_execution;

    // Blocked by policy
    if (isBlocked) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: result.response || result.policy_reason || 'Action blocked by policy.',
        isBlocked: true,
      }]);
      return;
    }

    // Write action with safety controls → show confirmation/preview
    if (needsConfirmation || needsPreview) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: result.response || `Ready to execute: ${action}`,
        isPending: true,
        action,
        safety,
      }]);
      setPendingAction(result);
      return;
    }

    // Direct execution (read-only or no safety controls)
    setMessages(prev => [...prev, {
      role: 'bot',
      text: result.response || 'Done!',
      action,
      isAction: isWriteAction,
    }]);

    if (isWriteAction) {
      applyAction(result);
    }
  };

  const handleValidationMode = async () => {
    const data = {
      ...templateData,
      field_placements: fieldPlacements || []
    };
    const result = await docflowService.cluebotValidate(data);
    if (result.success) {
      setValidationResult(result);
      const suggestions = (result.suggestions || []).map(s =>
        `${s.severity === 'critical' ? '[Critical]' : s.severity === 'warning' ? '[Warning]' : '[Info]'} [${s.category}] ${s.message}`
      ).join('\n');
      setMessages(prev => [...prev, {
        role: 'bot',
        text: `🛡️ **AI Validation Score: ${result.score}/100**\n\n${result.summary}\n\n${suggestions || 'No issues found!'}`,
        isValidation: true
      }]);
    } else {
      throw new Error(result.error || 'AI validation failed');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mode === 'validation') {
        setMessages(prev => [...prev, { role: 'user', text: 'Run AI Validation' }]);
        setLoading(true);
        handleValidationMode().catch(err => {
          setMessages(prev => [...prev, { role: 'bot', text: `Error: ${err.message}`, isError: true }]);
        }).finally(() => setLoading(false));
      } else {
        sendMessage();
      }
    }
  };

  if (!isOpen) return null;

  /* ─── Disabled / Loading states ─── */
  if (policyLoading) {
    return (
      <div className="fixed right-4 bottom-4 w-96 h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden" data-testid="cluebot-panel">
        <PanelHeader onClose={onClose} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Loading CluBot...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!policy?.enabled) {
    return (
      <div className="fixed right-4 bottom-4 w-96 h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden" data-testid="cluebot-panel-disabled">
        <PanelHeader onClose={onClose} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Shield className="h-7 w-7 text-gray-300" />
            </div>
            <h4 className="text-base font-semibold text-gray-700 mb-1">CluBot is Disabled</h4>
            <p className="text-xs text-gray-400 max-w-[240px] mx-auto">
              An admin can enable CluBot in Setup &rarr; AI & Automation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Active panel ─── */
  return (
    <div className="fixed right-4 bottom-4 w-96 h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden" data-testid="cluebot-panel">
      <PanelHeader onClose={onClose} />

      {/* Mode Selector */}
      <div className="px-3 py-2 border-b border-gray-100 flex gap-1 flex-shrink-0 bg-gray-50">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === m.id
                ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            data-testid={`cluebot-mode-${m.id}`}
          >
            <m.icon className="h-3 w-3" />
            {m.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-md'
                : msg.isError
                  ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-md'
                  : msg.isBlocked
                    ? 'bg-amber-50 text-amber-800 border border-amber-200 rounded-bl-md'
                    : msg.isValidation
                      ? 'bg-amber-50 text-amber-900 border border-amber-200 rounded-bl-md'
                      : msg.isPending
                        ? 'bg-blue-50 text-blue-800 border border-blue-200 rounded-bl-md'
                        : msg.isCancelled
                          ? 'bg-gray-50 text-gray-500 border border-gray-200 rounded-bl-md'
                          : msg.isAction
                            ? 'bg-green-50 text-green-800 border border-green-200 rounded-bl-md shadow-sm'
                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md shadow-sm'
            }`}
              data-testid={`cluebot-msg-${idx}`}
            >
              {/* Blocked badge */}
              {msg.isBlocked && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 mb-1.5">
                  <Shield className="h-3 w-3" />
                  Blocked by Policy
                </div>
              )}
              {/* Pending badge */}
              {msg.isPending && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 mb-1.5">
                  <Eye className="h-3 w-3" />
                  Review Required — {msg.action}
                </div>
              )}
              {msg.text}
              {/* Action badge */}
              {msg.action && msg.isAction && (
                <div className="mt-1.5 pt-1.5 border-t border-green-200 text-xs flex items-center gap-1 text-green-600">
                  Action: {msg.action} <Check className="h-3 w-3 ml-1" /> Applied
                </div>
              )}
              {/* Safety info on pending */}
              {msg.isPending && msg.safety && (
                <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                  {msg.safety.require_confirmation && (
                    <div className="flex items-center gap-1.5 text-[11px] text-blue-500">
                      <AlertTriangle className="h-3 w-3" /> Confirmation required before applying
                    </div>
                  )}
                  {msg.safety.preview_before_execution && (
                    <div className="flex items-center gap-1.5 text-[11px] text-blue-500">
                      <Eye className="h-3 w-3" /> Preview before execution enabled
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-500 px-3 py-2 rounded-xl border border-gray-200 flex items-center gap-2 text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              CluBot is processing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Confirmation Bar */}
      {pendingAction && (
        <div className="px-3 py-3 border-t border-blue-200 bg-blue-50 flex-shrink-0" data-testid="cluebot-confirmation-bar">
          <p className="text-xs text-blue-600 font-medium mb-2">Confirm this action?</p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
              data-testid="cluebot-confirm-btn"
            >
              <Check className="h-3.5 w-3.5" />
              Apply
            </button>
            <button
              onClick={handleReject}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-gray-600 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
              data-testid="cluebot-reject-btn"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {mode === 'assistant' && messages.length <= 2 && !pendingAction && (
        <div className="px-3 py-2 border-t border-gray-100 flex flex-wrap gap-1.5 flex-shrink-0">
          {['Add signature field', 'Add date field', 'Add label', 'Check layout'].map(cmd => (
            <button
              key={cmd}
              onClick={() => setInput(cmd)}
              className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full hover:bg-indigo-100 transition-colors border border-indigo-100"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {mode === 'validation' && !pendingAction && (
        <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => {
              setMessages(prev => [...prev, { role: 'user', text: 'Run AI Validation' }]);
              setLoading(true);
              handleValidationMode().catch(err => {
                setMessages(prev => [...prev, { role: 'bot', text: `Error: ${err.message}`, isError: true }]);
              }).finally(() => setLoading(false));
            }}
            disabled={loading}
            className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="cluebot-run-validation"
          >
            <ShieldCheck className="h-4 w-4" />
            {loading ? 'Analyzing...' : 'Run AI Validation'}
          </button>
        </div>
      )}

      {/* Input */}
      {mode !== 'validation' && !pendingAction && (
        <div className="px-3 py-2.5 border-t border-gray-200 flex gap-2 flex-shrink-0 bg-white">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening...' : mode === 'email' ? 'Describe the email tone/style...' : 'Type a command or question...'}
            className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-colors ${
              isListening ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
            disabled={loading}
            data-testid="cluebot-input"
          />
          {hasSpeechRecognition && (
            <button
              onClick={toggleMic}
              className={`p-2 rounded-lg transition-colors ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={isListening ? 'Stop listening' : 'Voice input'}
              data-testid="cluebot-mic-btn"
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            data-testid="cluebot-send-btn"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── Shared header ─── */
const PanelHeader = ({ onClose }) => (
  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
    <div className="flex items-center gap-2">
      <Bot className="h-5 w-5 text-white" />
      <span className="text-white font-semibold text-sm">CluBot AI</span>
      <span className="px-1.5 py-0.5 bg-white/20 text-white text-xs rounded-full">DocFlow</span>
    </div>
    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors" data-testid="cluebot-close-btn">
      <X className="h-4 w-4" />
    </button>
  </div>
);

export default ClueBotPanel;
