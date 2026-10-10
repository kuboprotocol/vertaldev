import React, { useState } from 'react';
import { useCreativeChat } from '@/hooks/useCreativeChat';
import { useAuth } from '@/hooks/useAuth';
import { ConversationSidebar } from './ConversationSidebar';
import { ConversationHeader } from './ConversationHeader';
import './CreativeChat.css';

export function CreativeChat() {
  const { user } = useAuth();
  const {
    messages,
    loading,
    error,
    quotaStatus,
    sendMessage,
    clearMessages,
    resetError,
    canSendMessage,
    conversationId,
    conversationTitle,
    conversations,
    loadingConversations,
    createNewConversation,
    loadConversation,
    updateConversationTitle,
    deleteConversation,
    archiveConversation,
    pinConversation,
    loadConversations,
  } = useCreativeChat();

  const [input, setInput] = useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !canSendMessage) return;

    const userInput = input;
    setInput('');
    await sendMessage(userInput, quotaStatus.creditsAvailable);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getQuotaMessage = () => {
    if (quotaStatus.freeConversationsRemaining > 0) {
      return `${quotaStatus.freeConversationsRemaining} free conversations remaining today`;
    }
    if (quotaStatus.creditsAvailable > 0) {
      return `${quotaStatus.creditsAvailable} credits available (1 per conversation)`;
    }
    return 'No free conversations left. Purchase credits to continue.';
  };

  const canProceed = canSendMessage && (quotaStatus.canUseFree || quotaStatus.creditsAvailable > 0);

  return (
    <div className="creative-chat-container">
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={conversationId}
        loading={loadingConversations}
        onCreateNew={async () => {
          const convId = await createNewConversation('New Conversation');
          await loadConversation(convId);
        }}
        onSelectConversation={loadConversation}
        onDeleteConversation={deleteConversation}
        onArchiveConversation={archiveConversation}
        onPinConversation={pinConversation}
      />

      {/* Main Chat Area */}
      <div className="creative-chat-main">
        {/* Conversation Header */}
        <ConversationHeader
          conversationId={conversationId}
          conversationTitle={conversationTitle}
          messageCount={messages.length}
          loading={loading}
          onUpdateTitle={updateConversationTitle}
          onArchive={() => archiveConversation(true)}
          onDelete={async () => {
            await deleteConversation(conversationId!);
          }}
        />

        {/* Quota Badge for Mobile */}
        <div className="quota-badge-mobile">
          <div className="quota-info">
            <span className="quota-label">Quota:</span>
            <span className="quota-value">{getQuotaMessage()}</span>
          </div>
        </div>

        <div className="creative-chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <h3>Start a Creative Conversation</h3>
            <p>Ask me anything about creative ideas, brainstorming, or content creation.</p>
            <div className="empty-features">
              <div className="feature">
                <span className="feature-icon">✨</span>
                <span className="feature-text">5 free conversations daily</span>
              </div>
              <div className="feature">
                <span className="feature-icon">⚡</span>
                <span className="feature-text">Fast AI responses</span>
              </div>
              <div className="feature">
                <span className="feature-icon">🎯</span>
                <span className="feature-text">Multiple models available</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message message-${message.role}`}
              >
                <div className="message-avatar">
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-content">
                  <div className="message-text">{message.content}</div>
                  <div className="message-meta">
                    {message.isFree && (
                      <span className="free-badge">Free</span>
                    )}
                    <span className="message-time">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="message message-assistant loading">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <div className="error-content">
            <p className="error-message">{error}</p>
            <button
              className="error-dismiss"
              onClick={resetError}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="creative-chat-input">
        {!canProceed ? (
          <div className="quota-limit-message">
            <span className="limit-icon">🚫</span>
            <p>
              {quotaStatus.freeConversationsRemaining === 0 && quotaStatus.creditsAvailable === 0
                ? 'No conversations available. Purchase credits to continue.'
                : 'Check quota to proceed'}
            </p>
          </div>
        ) : (
          <>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Share your creative thoughts or ask a question..."
              disabled={loading}
              className="input-field"
              rows={3}
            />
            <div className="input-footer">
              <div className="input-hints">
                <span className="hint">
                  {quotaStatus.canUseFree ? '✨ Using free conversation' : '⭐ Using 1 credit'}
                </span>
                <span className="hint-separator">•</span>
                <span className="hint">
                  Shift+Enter for new line
                </span>
              </div>
              <div className="input-actions">
                {messages.length > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={clearMessages}
                    disabled={loading}
                  >
                    Clear
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                >
                  {loading ? 'Thinking...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
