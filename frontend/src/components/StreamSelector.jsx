import { useState } from 'react'

function StreamSelector({ currentStream, onStreamChange }) {
  const streamOptions = [
    {
      id: 'unread',
      name: 'Unread Emails',
      description: 'Only unread emails from inbox',
      icon: '📬',
      query: 'is:unread'
    }
  ]

  return (
    <div className="stream-selector">
      <div className="stream-selector-header">
        <h4>Email Stream</h4>
      </div>
      <div className="stream-options">
        {streamOptions.map((stream) => (
          <button
            key={stream.id}
            onClick={() => onStreamChange(stream)}
            className={`stream-option ${currentStream?.id === stream.id ? 'active' : ''}`}
          >
            <div className="stream-icon">{stream.icon}</div>
            <div className="stream-info">
              <div className="stream-name">{stream.name}</div>
              <div className="stream-description">{stream.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default StreamSelector
