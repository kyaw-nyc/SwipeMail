import { useState, useEffect } from 'react'
import StreamSelector from './StreamSelector'
import TimeRangeSelector from './TimeRangeSelector'

function FolderBar({ folders = [], currentFolder, onFolderChange, currentStream, onStreamChange, currentTimeRange, onTimeRangeChange, onAddFolder }) {
  // Check if we're currently viewing a stream (not a custom folder)
  const isViewingStream = currentFolder === 'STREAM'
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
    // Don't navigate if clicking on the currently active folder
    if (currentFolder === folderId) {
      console.log('Already on this folder, ignoring click')
      return
    }
    onFolderChange(folderId)
  }

  // Only show SwipeMail AI folders
  const swipeMailFolders = folders.filter(f => f.isSwipeMail).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  return (
    <div className="folder-bar">
      {/* Time Range Selector - only show for streams, not folders */}
      {onTimeRangeChange && isViewingStream && (
        <TimeRangeSelector
          currentRange={currentTimeRange}
          onRangeChange={onTimeRangeChange}
        />
      )}

      {/* Stream Selector - always show since we removed system folders */}
      {onStreamChange && (
        <StreamSelector
          currentStream={currentStream}
          onStreamChange={onStreamChange}
          isViewingStream={isViewingStream}
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

            {/* Add Custom Folder Button */}
            {onAddFolder && (
              <button
                onClick={onAddFolder}
                className="add-folder-btn"
                title="Create custom folder"
              >
                <span className="add-folder-icon">➕</span>
                <span>Add Custom Folder</span>
              </button>
            )}
          </>
        )}
      </nav>

      <div className="folder-bar-footer">
        {/* TODO: Add settings/preferences button */}
        {/* TODO: Add compose email button */}
      </div>
    </div>
  )
}

export default FolderBar