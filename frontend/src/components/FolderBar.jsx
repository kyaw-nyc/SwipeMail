import { useState, useEffect } from 'react'
import StreamSelector from './StreamSelector'

function FolderBar({ folders = [], currentFolder, onFolderChange, currentStream, onStreamChange }) {
  // Map Gmail system labels to user-friendly names
  const getFolderDisplayName = (folder) => {
    const nameMap = {
      'INBOX': 'Inbox',
      'STARRED': 'Starred',
      'SENT': 'Sent',
      'DRAFT': 'Drafts',
      'TRASH': 'Trash',
      'SPAM': 'Spam',
      'IMPORTANT': 'Important'
    }

    if (folder.name.startsWith('SwipeMail/')) {
      return folder.name.replace('SwipeMail/', '')
    }

    return nameMap[folder.name] || folder.name
  }

  const handleFolderClick = (folderId) => {
    onFolderChange(folderId)
  }

  // Only show SwipeMail AI folders
  const swipeMailFolders = folders.filter(f => f.isSwipeMail).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  return (
    <div className="folder-bar">
      {/* Stream Selector - always show since we removed system folders */}
      {onStreamChange && (
        <StreamSelector
          currentStream={currentStream}
          onStreamChange={onStreamChange}
        />
      )}

      <nav className="folder-nav">
        {/* SwipeMail AI Folders */}
        {swipeMailFolders.length > 0 && (
          <>
            <div className="folder-section-divider">
              <span className="folder-section-label">🧠 AI Sorted</span>
            </div>
            {swipeMailFolders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => handleFolderClick(folder.id)}
                className={`folder-item swipemail-folder ${currentFolder === folder.id ? 'active' : ''}`}
              >
                <div className="folder-content">
                  <span className="folder-name">{getFolderDisplayName(folder)}</span>
                  <span className="folder-badge">AI</span>
                </div>
                {folder.messagesUnread > 0 && (
                  <span className="folder-count">{folder.messagesUnread}</span>
                )}
              </button>
            ))}
          </>
        )}
      </nav>

      {/* TODO: Add custom labels/tags section */}
      {/* TODO: Add AI-generated smart folders (e.g., "Needs Response", "Bills", etc.) */}

      <div className="folder-bar-footer">
        {/* TODO: Add settings/preferences button */}
        {/* TODO: Add compose email button */}
      </div>
    </div>
  )
}

export default FolderBar