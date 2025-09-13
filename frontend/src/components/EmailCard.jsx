function EmailCard({ email, onMarkRead, onApplyLabel }) {
  const truncateText = (text, maxLength) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const extractEmail = (fromString) => {
    const match = fromString.match(/<(.+?)>/)
    if (match) return match[1]
    return fromString
  }

  const extractName = (fromString) => {
    const match = fromString.match(/^(.+?)\s*</)
    if (match) return match[1].replace(/"/g, '')
    return fromString
  }

  return (
    <div className="email-card">
      <div className="email-header">
        <div className="email-from">
          <strong>{extractName(email.from)}</strong>
          <span className="email-address">{extractEmail(email.from)}</span>
        </div>
      </div>

      <div className="email-subject">
        <h3>{truncateText(email.subject, 60)}</h3>
      </div>

      <div className="email-snippet">
        <p>{truncateText(email.snippet, 150)}</p>
      </div>

      <div className="email-actions">
        <button
          onClick={() => onMarkRead(email.id)}
          className="action-btn mark-read-btn"
        >
          Mark Read
        </button>
        <button
          onClick={() => onApplyLabel(email.id, 'STARRED')}
          className="action-btn star-btn"
        >
          ⭐ Star
        </button>
        {/* TODO: Add more action buttons for future AI/ML features */}
        {/* Future: Add swipe gestures for mobile */}
      </div>
    </div>
  )
}

export default EmailCard