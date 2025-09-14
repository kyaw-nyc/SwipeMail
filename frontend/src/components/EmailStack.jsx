import { useState, useEffect } from 'react'
import SwipeableEmailCard from './SwipeableEmailCard'

function EmailStack({ emails, currentFolder, onMarkRead, onApplyLabel, onAnalyzeAndSort, onFlagIncorrect, onRemainingCountChange }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [processedEmails, setProcessedEmails] = useState([])
  const [swipingCards, setSwipingCards] = useState(new Set())

  useEffect(() => {
    setCurrentIndex(0)
    setProcessedEmails([])
    setSwipingCards(new Set())
  }, [emails])

  useEffect(() => {
    if (onRemainingCountChange) {
      onRemainingCountChange(getRemainingCount())
    }
  }, [currentIndex, emails.length, onRemainingCountChange])

  const handleSwipe = (email, direction) => {
    // Prevent multiple swipes on the same card
    if (swipingCards.has(email.id)) return

    const isStream = currentFolder === 'STREAM'
    const isSwipeMailFolder = typeof currentFolder === 'string' && currentFolder.includes('SwipeMail/')

    console.log(`${direction === 'left' ? 'Not interested' : 'Interested'} in email:`, email.subject)

    // Mark this card as swiping
    setSwipingCards(prev => new Set([...prev, email.id]))

    // Process email actions based on folder context
    if (direction === 'left') {
      if (isSwipeMailFolder) {
        // In SwipeMail folders, left swipe flags as incorrectly sorted
        onFlagIncorrect && onFlagIncorrect(email)
        setProcessedEmails(prev => [...prev, { ...email, action: 'flagged_incorrect' }])
      } else {
        // In stream view, left swipe marks as read
        onMarkRead(email.id)
        setProcessedEmails(prev => [...prev, { ...email, action: 'not_interested' }])
      }
    } else {
      if (isStream) {
        // In stream view, right swipe analyzes and sorts
        if (onAnalyzeAndSort) {
          onAnalyzeAndSort(email)
        } else {
          onApplyLabel(email.id, 'STARRED')
        }
        setProcessedEmails(prev => [...prev, { ...email, action: 'interested' }])
      } else {
        // In other folders, right swipe just removes from current view
        setProcessedEmails(prev => [...prev, { ...email, action: 'removed' }])
      }
    }

    // Update stack after animation completes
    setTimeout(() => {
      setCurrentIndex(prev => prev + 1)
      setSwipingCards(prev => {
        const newSet = new Set(prev)
        newSet.delete(email.id)
        return newSet
      })
    }, 350)
  }

  const handleSwipeLeft = (email) => handleSwipe(email, 'left')
  const handleSwipeRight = (email) => handleSwipe(email, 'right')

  const getVisibleEmails = () => {
    return emails.slice(currentIndex, currentIndex + 3)
  }

  const getRemainingCount = () => {
    return Math.max(0, emails.length - currentIndex)
  }

  const resetStack = () => {
    setCurrentIndex(0)
    setProcessedEmails([])
  }

  if (emails.length === 0) {
    return (
      <div className="email-stack-empty">
        <div className="empty-state">
          <div className="empty-icon">📬</div>
          <h3>No emails to review</h3>
          <p>You're all caught up! Check back later for new emails.</p>
        </div>
      </div>
    )
  }

  if (currentIndex >= emails.length) {
    return (
      <div className="email-stack-complete">
        <div className="complete-state">
          <div className="complete-icon">🎉</div>
          <h3>All done!</h3>
          <p>You've reviewed all {emails.length} emails.</p>

          <div className="summary">
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-number">
                  {processedEmails.filter(e => e.action === 'interested').length}
                </span>
                <span className="stat-label">Interested</span>
              </div>
              <div className="stat">
                <span className="stat-number">
                  {processedEmails.filter(e => e.action === 'not_interested').length}
                </span>
                <span className="stat-label">Not Interested</span>
              </div>
            </div>
          </div>

          <button onClick={resetStack} className="reset-btn">
            Review Again
          </button>
        </div>
      </div>
    )
  }

  const visibleEmails = getVisibleEmails()

  return (
    <div className="email-stack">
      <div className="stack-container">
        {visibleEmails.map((email, index) => (
          <SwipeableEmailCard
            key={`${email.id}-${currentIndex + index}`}
            email={email}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            isTopCard={index === 0}
            isSwiping={swipingCards.has(email.id)}
            stackIndex={index}
          />
        ))}
      </div>

      <div className="stack-instructions">
        {currentFolder === 'STREAM' ? (
          <>
            <p>Swipe right (→) for interested • Swipe left (←) for not interested</p>
            <p>Or use arrow keys</p>
          </>
        ) : typeof currentFolder === 'string' && currentFolder.includes('SwipeMail/') ? (
          <>
            <p>Swipe right (→) to keep • Swipe left (←) to flag as incorrectly sorted</p>
            <p>Or use arrow keys</p>
          </>
        ) : (
          <>
            <p>Swipe right (→) to remove • Swipe left (←) to archive</p>
            <p>Or use arrow keys</p>
          </>
        )}
      </div>
    </div>
  )
}

export default EmailStack