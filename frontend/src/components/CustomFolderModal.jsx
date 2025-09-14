import { useState } from 'react'

function CustomFolderModal({ isOpen, onClose, onCreateFolder, existingFolders }) {
  const [folderName, setFolderName] = useState('')
  const [folderDescription, setFolderDescription] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!folderName.trim()) {
      setError('Please enter a folder name')
      return
    }

    // Check if folder already exists
    const exists = existingFolders?.some(
      folder => folder.name.toLowerCase() === `swipemail/${folderName.toLowerCase()}`
    )

    if (exists) {
      setError('A folder with this name already exists')
      return
    }

    onCreateFolder({
      name: folderName.trim(),
      description: folderDescription.trim() || `Emails related to ${folderName.trim()}`
    })

    // Reset form
    setFolderName('')
    setFolderDescription('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content custom-folder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Custom Folder</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="folder-name">
              Folder Name
              <span className="required">*</span>
            </label>
            <input
              id="folder-name"
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g., Work, Personal, Newsletters"
              maxLength={50}
              autoFocus
            />
            <div className="form-hint">
              This will create a Gmail label: SwipeMail/{folderName}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="folder-description">
              Description (optional)
            </label>
            <textarea
              id="folder-description"
              value={folderDescription}
              onChange={(e) => setFolderDescription(e.target.value)}
              placeholder="Describe what types of emails belong in this folder..."
              rows={3}
              maxLength={200}
            />
            <div className="form-hint">
              Help the AI understand what emails to sort here
            </div>
          </div>

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CustomFolderModal