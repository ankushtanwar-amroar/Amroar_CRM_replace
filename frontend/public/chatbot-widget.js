(function() {
  // Get bot ID from script tag
  const scriptTag = document.currentScript;
  const botId = scriptTag.getAttribute('data-bot-id');
  
  if (!botId) {
    console.error('Chatbot Widget: data-bot-id attribute is required');
    return;
  }

  // API base URL - allow override via data attribute or use the backend URL
  // For production, use the same domain; for development, allow custom URL
  let API_BASE = scriptTag.getAttribute('data-api-url');
  
  if (!API_BASE) {
    // Auto-detect based on script source
    if (scriptTag.src.includes('localhost')) {
      // Development mode - need to get backend URL from environment
      // Since we can't access React env vars, use a predictable pattern
      API_BASE = 'http://localhost:8001';
    } else if (scriptTag.src.includes('emergentagent.com')) {
      // Production Emergent environment
      API_BASE = 'https://sign-flow-fix-1.preview.emergentagent.com';
    } else {
      // Default: same origin
      API_BASE = window.location.origin;
    }
  }
  
  // State
  let conversationId = null;
  let botConfig = null;
  let isOpen = false;
  let isLoading = false;
  
  // Slack integration state
  let slackSyncEnabled = false;
  let slackConnected = false;
  let slackConnecting = false;
  let chatHistory = []; // Store all messages for Slack sync

  // Styles
  const styles = `
    .chatbot-widget-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    
    .chatbot-toggle-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      color: white;
    }
    
    .chatbot-toggle-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }
    
    .chatbot-window {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 600px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }
    
    .chatbot-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }
    
    .chatbot-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .chatbot-header-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .chatbot-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      color: #667eea;
    }
    
    .chatbot-avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    
    .chatbot-info h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    
    .chatbot-info p {
      margin: 0;
      font-size: 12px;
      opacity: 0.9;
    }
    
    .chatbot-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    .chatbot-close:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #f7f7f8;
    }
    
    .chatbot-message {
      margin-bottom: 12px;
      display: flex;
      gap: 8px;
      animation: messageSlide 0.3s ease-out;
    }
    
    @keyframes messageSlide {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .chatbot-message.user {
      flex-direction: row-reverse;
    }
    
    .chatbot-message-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
    }
    
    .chatbot-message.bot .chatbot-message-avatar {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .chatbot-message.user .chatbot-message-avatar {
      background: #e0e0e0;
      color: #333;
    }
    
    .chatbot-message-content {
      max-width: 70%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .chatbot-message.bot .chatbot-message-content {
      background: white;
      color: #333;
      border-bottom-left-radius: 4px;
    }
    
    .chatbot-message.user .chatbot-message-content {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-bottom-right-radius: 4px;
    }
    
    .chatbot-input-area {
      padding: 16px;
      background: white;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 8px;
    }
    
    .chatbot-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #e0e0e0;
      border-radius: 20px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    
    .chatbot-input:focus {
      border-color: #667eea;
    }
    
    .chatbot-send-button {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    }
    
    .chatbot-send-button:hover:not(:disabled) {
      transform: scale(1.05);
    }
    
    .chatbot-send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .chatbot-typing {
      display: flex;
      gap: 4px;
      padding: 10px 14px;
    }
    
    .chatbot-typing span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #667eea;
      animation: typing 1.4s infinite;
    }
    
    .chatbot-typing span:nth-child(2) {
      animation-delay: 0.2s;
    }
    
    .chatbot-typing span:nth-child(3) {
      animation-delay: 0.4s;
    }
    
    @keyframes typing {
      0%, 60%, 100% {
        transform: translateY(0);
      }
      30% {
        transform: translateY(-10px);
      }
    }
    
    /* Slack Integration Styles */
    .chatbot-slack-container {
      padding: 12px 16px;
      background: #f7f7f8;
      border-top: 1px solid #e0e0e0;
      display: none;
    }
    
    .chatbot-slack-container.visible {
      display: block;
    }
    
    .chatbot-slack-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .chatbot-slack-label {
      font-size: 13px;
      color: #555;
      font-weight: 500;
    }
    
    .chatbot-toggle-switch {
      position: relative;
      width: 44px;
      height: 24px;
      background: #ccc;
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.3s;
    }
    
    .chatbot-toggle-switch.active {
      background: #667eea;
    }
    
    .chatbot-toggle-slider {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      transition: transform 0.3s;
    }
    
    .chatbot-toggle-switch.active .chatbot-toggle-slider {
      transform: translateX(20px);
    }
    
    .chatbot-slack-connect-btn {
      width: 100%;
      padding: 8px 12px;
      background: #4A154B;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.2s;
      margin-top: 8px;
    }
    
    .chatbot-slack-connect-btn:hover:not(:disabled) {
      background: #611f69;
    }
    
    .chatbot-slack-connect-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .chatbot-slack-connect-btn.connected {
      background: #2eb67d;
    }
    
    .chatbot-slack-connect-btn.connected:hover:not(:disabled) {
      background: #26915f;
    }
    
    .chatbot-slack-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .chatbot-toast {
      position: fixed;
      bottom: 100px;
      right: 20px;
      background: #323232;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      animation: slideInUp 0.3s ease-out;
      max-width: 350px;
    }
    
    .chatbot-toast.success {
      background: #2eb67d;
    }
    
    .chatbot-toast.error {
      background: #e01e5a;
    }
    
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  // Create style element
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create widget container
  const container = document.createElement('div');
  container.className = 'chatbot-widget-container';
  
  // Create toggle button
  const toggleButton = document.createElement('button');
  toggleButton.className = 'chatbot-toggle-button';
  toggleButton.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `;
  
  // Create chat window
  const chatWindow = document.createElement('div');
  chatWindow.className = 'chatbot-window';
  chatWindow.innerHTML = `
    <div class="chatbot-header">
      <div class="chatbot-header-content">
        <div class="chatbot-avatar">
          <span id="chatbot-avatar-text"></span>
        </div>
        <div class="chatbot-info">
          <h3 id="chatbot-name">Loading...</h3>
          <p>Online</p>
        </div>
      </div>
      <button class="chatbot-close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="chatbot-messages" id="chatbot-messages"></div>
    <div class="chatbot-slack-container" id="chatbot-slack-container">
      <div class="chatbot-slack-toggle">
        <span class="chatbot-slack-label">Send messages to Slack</span>
        <div class="chatbot-toggle-switch" id="chatbot-slack-toggle">
          <div class="chatbot-toggle-slider"></div>
        </div>
      </div>
      <button class="chatbot-slack-connect-btn" id="chatbot-slack-connect" style="display: none;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
        <span id="chatbot-slack-btn-text">Connect to Slack</span>
      </button>
    </div>
    <div class="chatbot-input-area">
      <input type="text" class="chatbot-input" id="chatbot-input" placeholder="Type your message..." />
      <button class="chatbot-send-button" id="chatbot-send">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  `;
  
  container.appendChild(toggleButton);
  container.appendChild(chatWindow);
  document.body.appendChild(container);
  
  // Get elements
  const messagesContainer = document.getElementById('chatbot-messages');
  const input = document.getElementById('chatbot-input');
  const sendButton = document.getElementById('chatbot-send');
  const closeButton = chatWindow.querySelector('.chatbot-close');
  const slackContainer = document.getElementById('chatbot-slack-container');
  const slackToggle = document.getElementById('chatbot-slack-toggle');
  const slackConnectBtn = document.getElementById('chatbot-slack-connect');
  const slackBtnText = document.getElementById('chatbot-slack-btn-text');
  
  // Toggle chat
  toggleButton.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      chatWindow.classList.add('open');
      input.focus();
      if (!botConfig) {
        loadBotConfig();
      }
    } else {
      chatWindow.classList.remove('open');
    }
  });
  
  closeButton.addEventListener('click', () => {
    isOpen = false;
    chatWindow.classList.remove('open');
  });
  
  // Load bot configuration
  async function loadBotConfig() {
    try {
      const response = await fetch(`${API_BASE}/api/chatbot-manager/bots/${botId}/public`);
      if (!response.ok) throw new Error('Bot not found');
      
      botConfig = await response.json();
      
      // Update UI
      document.getElementById('chatbot-name').textContent = botConfig.name;
      const avatarText = document.getElementById('chatbot-avatar-text');
      
      if (botConfig.avatar_url) {
        avatarText.innerHTML = `<img src="${botConfig.avatar_url}" alt="${botConfig.name}" />`;
      } else {
        avatarText.textContent = botConfig.name.charAt(0).toUpperCase();
      }
      
      // Add welcome message
      addMessage('bot', botConfig.welcome_message);
      
    } catch (error) {
      console.error('Error loading bot config:', error);
      addMessage('bot', 'Sorry, this chatbot is currently unavailable.');
    }
  }
  
  // Add message to chat
  function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chatbot-message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'chatbot-message-avatar';
    
    if (role === 'bot') {
      if (botConfig && botConfig.avatar_url) {
        avatar.innerHTML = `<img src="${botConfig.avatar_url}" alt="Bot" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      } else {
        avatar.textContent = botConfig ? botConfig.name.charAt(0).toUpperCase() : 'B';
      }
    } else {
      avatar.textContent = 'U';
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chatbot-message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store in chat history for Slack sync
    chatHistory.push({
      sender: role === 'user' ? 'user' : 'bot',
      message: content
    });
    
    // Update Slack UI visibility
    updateSlackUIVisibility();
    
    // If Slack sync is enabled and connected, send to Slack
    if (slackSyncEnabled && slackConnected && role !== 'system') {
      sendMessageToSlack(role === 'user' ? 'user' : 'bot', content);
    }
  }
  
  // Update Slack UI visibility based on chat history
  function updateSlackUIVisibility() {
    if (chatHistory.length > 0) {
      slackContainer.classList.add('visible');
    } else {
      slackContainer.classList.remove('visible');
    }
  }
  
  // Show toast notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `chatbot-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }
  
  // Show typing indicator
  function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chatbot-message bot';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `
      <div class="chatbot-message-avatar">${botConfig ? botConfig.name.charAt(0).toUpperCase() : 'B'}</div>
      <div class="chatbot-message-content chatbot-typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Remove typing indicator
  function removeTyping() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
  }
  
  // Connect to Slack - Send full chat history
  async function connectToSlack() {
    if (slackConnecting || chatHistory.length === 0) return;
    
    slackConnecting = true;
    slackConnectBtn.disabled = true;
    slackBtnText.innerHTML = '<div class="chatbot-slack-spinner"></div> Connecting...';
    
    try {
      // Get user info (try to extract from any stored data)
      const userName = localStorage.getItem('chatbot-user-name') || 
                      localStorage.getItem('user-name') || 
                      'Website Visitor';
      
      // Prepare payload
      const payload = {
        body: {
          user: userName,
          chat: chatHistory
        }
      };
      
      // Send to n8n webhook to create Slack channel
      const n8nResponse = await fetch('https://n8n6280.app.n8n.cloud/webhook/slack-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!n8nResponse.ok) {
        throw new Error('Slack connection failed');
      }
      
      // Get Slack channel ID from response (if n8n returns it)
      let slackChannelId = null;
      try {
        const n8nData = await n8nResponse.json();
        slackChannelId = n8nData.channel_id || n8nData.slack_channel_id;
      } catch (e) {
        console.log('n8n response does not contain channel_id');
      }
      
      // Create mapping in backend if we have conversation_id and slack_channel_id
      if (conversationId && slackChannelId) {
        try {
          const mappingResponse = await fetch(`${API_BASE}/api/slack/create-mapping`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              conversation_id: conversationId,
              bot_id: botId,
              slack_channel_id: slackChannelId
            })
          });
          
          if (mappingResponse.ok) {
            console.log('Successfully created Slack-Chatbot mapping');
          } else {
            console.warn('Failed to create Slack-Chatbot mapping');
          }
        } catch (mappingError) {
          console.error('Error creating mapping:', mappingError);
          // Don't fail the whole flow if mapping fails
        }
      }
      
      // Success
      slackConnected = true;
      slackConnectBtn.classList.add('connected');
      slackBtnText.textContent = '✓ Connected to Slack';
      showToast('Your chat has been transferred to Slack. Two-way sync is now active!', 'success');
      
    } catch (error) {
      console.error('Error connecting to Slack:', error);
      showToast('Slack connection failed. Please try again.', 'error');
      slackBtnText.textContent = 'Connect to Slack';
    } finally {
      slackConnecting = false;
      slackConnectBtn.disabled = false;
    }
  }
  
  // Send individual message to Slack (after connected)
  async function sendMessageToSlack(sender, message) {
    if (!slackConnected) return;
    
    try {
      const userName = localStorage.getItem('chatbot-user-name') || 
                      localStorage.getItem('user-name') || 
                      'Website Visitor';
      
      const payload = {
        body: {
          user: userName,
          chat: [{ sender, message }]
        }
      };
      
      // Send to webhook (no await to not block UI)
      fetch('https://n8n6280.app.n8n.cloud/webhook/slack-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }).catch(err => {
        console.error('Error syncing message to Slack:', err);
      });
      
    } catch (error) {
      console.error('Error sending message to Slack:', error);
    }
  }
  
  // Send message
  async function sendMessage() {
    const message = input.value.trim();
    if (!message || isLoading) return;
    
    // Add user message
    addMessage('user', message);
    input.value = '';
    
    // Show typing
    isLoading = true;
    sendButton.disabled = true;
    showTyping();
    
    try {
      const response = await fetch(`${API_BASE}/api/chatbot-manager/bots/${botId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: message,
          conversation_id: conversationId
        })
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
      const data = await response.json();
      conversationId = data.conversation_id;
      
      // Remove typing and add bot response
      removeTyping();
      addMessage('bot', data.message);
      
    } catch (error) {
      console.error('Error sending message:', error);
      removeTyping();
      addMessage('bot', botConfig ? botConfig.fallback_message : "I'm having trouble responding right now.");
    } finally {
      isLoading = false;
      sendButton.disabled = false;
      input.focus();
    }
  }
  
  // Send on button click
  sendButton.addEventListener('click', sendMessage);
  
  // Send on Enter key
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Slack toggle event
  slackToggle.addEventListener('click', () => {
    slackSyncEnabled = !slackSyncEnabled;
    
    if (slackSyncEnabled) {
      slackToggle.classList.add('active');
      slackConnectBtn.style.display = 'flex';
    } else {
      slackToggle.classList.remove('active');
      slackConnectBtn.style.display = 'none';
    }
  });
  
  // Slack connect button event
  slackConnectBtn.addEventListener('click', connectToSlack);
  
})();
