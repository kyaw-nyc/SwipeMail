import EmailCard from './EmailCard'

function EmailList({ emails, onMarkRead, onApplyLabel }) {
  if (emails.length === 0) {
    return (
      <div className="empty-state">
        <h3>No unread emails</h3>
        <p>You're all caught up! 🎉</p>
        {/* TODO: Add refresh button or auto-refresh functionality */}
      </div>
    )
  }

  return (
    <div className="email-list">
      <div className="email-list-header">
        <h2>Unread Emails ({emails.length})</h2>
        {/* TODO: Add sorting/filtering options */}
        {/* TODO: Add bulk actions for multiple emails */}
      </div>

      <div className="email-cards">
        {/* TODO: Replace with swipe deck component for mobile */}
        {/* TODO: Add virtualization for large email lists */}
        {emails.map((email) => (
          <EmailCard
            key={email.id}
            email={email}
            onMarkRead={onMarkRead}
            onApplyLabel={onApplyLabel}
          />
        ))}
      </div>

      {/* TODO: Add pagination or infinite scroll */}
      {/* TODO: Add AI-powered email classification results here */}
    </div>
  )
}

export default EmailList