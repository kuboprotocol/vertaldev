import React, { useState, useMemo } from 'react';
import { ConversationListItem } from '@/types/conversation';
import './ConversationSidebar.css';

interface ConversationSidebarProps {
  conversations: ConversationListItem[];
  currentConversationId: string | null;
  loading: boolean;
  onCreateNew: () => Promise<void>;
  onSelectConversation: (id: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  onArchiveConversation: (id: string, archived: boolean) => Promise<void>;
  onPinConversation: (id: string, pinned: boolean) => Promise<void>;
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  loading,
  onCreateNew,
  onSelectConversation,
  onDeleteConversation,
  onArchiveConversation,
  onPinConversation,
}: ConversationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);

  // Filter conversations based on search and archive status
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const matchesSearch = conv.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesArchive = showArchived ? conv.archived : !conv.archived;
      return matchesSearch && matchesArchive;
    });
  }, [conversations, searchQuery, showArchived]);

  // Sort: pinned first, then by newest
  const sortedConversations = useMemo(() => {
    return [...filteredConversations].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [filteredConversations]);

  const handleCreateNew = async () => {
    setCreatingNew(true);
    try {
      await onCreateNew();
      setSearchQuery('');
      setShowArchived(false);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setCreatingNew(false);
    }
  };

  const handleSelectConversation = async (id: string) => {
    try {
      await onSelectConversation(id);
      setExpandedMenuId(null);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this conversation?')) {
      try {
        await onDeleteConversation(id);
      } catch (error) {
        console.error('Failed to delete conversation:', error);
      }
    }
  };

  const handleArchiveConversation = async (e: React.MouseEvent, id: string, archived: boolean) => {
    e.stopPropagation();
    try {
      await onArchiveConversation(id, !archived);
    } catch (error) {
      console.error('Failed to archive conversation:', error);
    }
  };

  const handlePinConversation = async (e: React.MouseEvent, id: string, pinned: boolean) => {
    e.stopPropagation();
    try {
      await onPinConversation(id, !pinned);
    } catch (error) {
      console.error('Failed to pin conversation:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="conversation-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <h3>Conversations</h3>
        <button
          className="new-conversation-btn"
          onClick={handleCreateNew}
          disabled={creatingNew}
          title="Create new conversation"
        >
          {creatingNew ? '⟳' : '✨'}
        </button>
      </div>

      {/* Search Bar */}
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button
            className="search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="sidebar-filters">
        <button
          className={`filter-tab ${!showArchived ? 'active' : ''}`}
          onClick={() => {
            setShowArchived(false);
            setSearchQuery('');
          }}
        >
          Active
        </button>
        <button
          className={`filter-tab ${showArchived ? 'active' : ''}`}
          onClick={() => {
            setShowArchived(true);
            setSearchQuery('');
          }}
        >
          Archived
        </button>
      </div>

      {/* Conversations List */}
      <div className="sidebar-content">
        {loading ? (
          <div className="sidebar-loading">
            <div className="spinner"></div>
            <p>Loading conversations...</p>
          </div>
        ) : sortedConversations.length === 0 ? (
          <div className="sidebar-empty">
            <div className="empty-icon">💬</div>
            <p>{showArchived ? 'No archived conversations' : 'No conversations yet'}</p>
            {!showArchived && (
              <button className="empty-action-btn" onClick={handleCreateNew}>
                Create first conversation
              </button>
            )}
          </div>
        ) : (
          <div className="conversations-list">
            {sortedConversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`conversation-item ${
                  currentConversationId === conversation.id ? 'active' : ''
                } ${conversation.archived ? 'archived' : ''}`}
                onClick={() => handleSelectConversation(conversation.id)}
              >
                {/* Pin Indicator */}
                {conversation.pinned && <span className="pin-badge">📌</span>}

                {/* Conversation Content */}
                <div className="conversation-content">
                  <h4 className="conversation-title">{conversation.title}</h4>
                  <p className="conversation-meta">
                    {conversation.total_messages} messages • {formatDate(conversation.updated_at)}
                  </p>
                </div>

                {/* Action Menu */}
                <div className="conversation-actions">
                  <button
                    className="action-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedMenuId(
                        expandedMenuId === conversation.id ? null : conversation.id
                      );
                    }}
                    title="More actions"
                  >
                    ⋮
                  </button>

                  {/* Dropdown Menu */}
                  {expandedMenuId === conversation.id && (
                    <div className="action-dropdown">
                      <button
                        className="dropdown-item pin-item"
                        onClick={(e) => handlePinConversation(e, conversation.id, conversation.pinned)}
                      >
                        {conversation.pinned ? '📌 Unpin' : '📍 Pin'}
                      </button>
                      <button
                        className="dropdown-item archive-item"
                        onClick={(e) =>
                          handleArchiveConversation(e, conversation.id, conversation.archived)
                        }
                      >
                        {conversation.archived ? '📂 Restore' : '📦 Archive'}
                      </button>
                      <button
                        className="dropdown-item delete-item"
                        onClick={(e) => handleDeleteConversation(e, conversation.id)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="sidebar-footer">
        <div className="stats">
          <span className="stat-item">
            {conversations.filter((c) => !c.archived).length} Active
          </span>
          <span className="stat-separator">•</span>
          <span className="stat-item">
            {conversations.filter((c) => c.archived).length} Archived
          </span>
        </div>
      </div>
    </div>
  );
}
