import { useState } from 'react'

function StreamSelector({ currentStream, onStreamChange, isViewingStream }) {
  const streamOptions = [
    {
      id: 'unread',
      name: 'Unread Emails',
      description: 'Recent unread emails (chronological)',
      icon: '📬',
      query: 'is:unread'
    },
    {
      id: 'smart',
      name: 'Smart Recommendations',
      description: 'Emails ranked by your predicted interest',
      icon: '🧠',
      query: 'is:unread',
      mlPowered: true
    }
  ]

  const handleStreamClick = (stream) => {
    // Always allow navigation - let the parent component handle state
    console.log('Stream clicked:', stream.name)
    onStreamChange(stream)
  }

  return (
    <div className="stream-selector">
      <div className="stream-selector-header">
        <h4>Email Stream</h4>
      </div>
      <div className="stream-options">
        {streamOptions.map((stream) => (
          <button
            key={stream.id}
            onClick={() => handleStreamClick(stream)}
            className={`stream-option ${isViewingStream && currentStream?.id === stream.id ? 'active' : ''} ${!isViewingStream ? 'inactive' : ''}`}
          >
            <div className="stream-icon">{stream.icon}</div>
            <div className="stream-info">
              <div className="stream-name">
                {stream.name}
                {stream.mlPowered && <span className="ml-badge">AI</span>}
              </div>
              <div className="stream-description">{stream.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default StreamSelector
