import React, { useState } from 'react';
import './ConversationHeader.css';

interface ConversationHeaderProps {
  conversationId: string | null;
  conversationTitle: string;
  messageCount: number;
  loading: boolean;
  onUpdateTitle: (newTitle: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ConversationHeader({
  conversationId,
  conversationTitle,
  messageCount,
  loading,
  onUpdateTitle,
  onArchive,
  onDelete,
}: ConversationHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(conversationTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const handleEditStart = () => {
    setIsEditing(true);
    setEditValue(conversationTitle);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditValue(conversationTitle);
  };

  const handleEditSave = async () => {
    if (!editValue.trim()) {
      handleEditCancel();
      return;
    }

    if (editValue === conversationTitle) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      await onUpdateTitle(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      setEditValue(conversationTitle);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      try {
        await onDelete();
      } catch (error) {
        console.error('Failed to delete conversation:', error);
      }
    }
  };

  // Only show header if there's an active conversation
  if (!conversationId) {
    return (
      <div className="conversation-header empty">
        <div className="header-placeholder">
          <p>Select or create a conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation-header">
      <div className="header-left">
        {isEditing ? (
          <div className="title-edit-form">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
              disabled={isSaving}
              className="title-edit-input"
            />
            <button
              onClick={handleEditSave}
              disabled={isSaving}
              className="edit-action-btn save-btn"
              title="Save"
            >
              ✓
            </button>
            <button
              onClick={handleEditCancel}
              disabled={isSaving}
              className="edit-action-btn cancel-btn"
              title="Cancel"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="title-display">
            <h3 className="conversation-title">{conversationTitle}</h3>
            <button
              onClick={handleEditStart}
              className="edit-btn"
              title="Edit title"
              disabled={loading}
            >
              ✏️
            </button>
          </div>
        )}
        <div className="conversation-meta">
          <span className="meta-item">
            💬 {messageCount} {messageCount === 1 ? 'message' : 'messages'}
          </span>
        </div>
      </div>

      <div className="header-right">
        <div className="action-menu">
          <button
            onClick={() => setShowActions(!showActions)}
            className="action-menu-btn"
            title="More options"
            disabled={loading}
          >
            ⋮
          </button>

          {showActions && (
            <div className="action-dropdown">
              <button
                onClick={async () => {
                  setShowActions(false);
                  await handleArchive();
                }}
                className="dropdown-action archive-action"
                disabled={loading}
              >
                📦 Archive
              </button>
              <button
                onClick={() => {
                  setShowActions(false);
                  handleDelete();
                }}
                className="dropdown-action delete-action"
                disabled={loading}
              >
                🗑️ Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
