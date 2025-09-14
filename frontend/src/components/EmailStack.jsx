import { useState, useEffect } from 'react'
import SwipeableEmailCard from './SwipeableEmailCard'

function EmailStack({ emails, currentFolder, onMarkRead, onApplyLabel, onAnalyzeAndSort, onFlagIncorrect, onRemainingCountChange, onAddToCalendar, getEventInfo, showMLScores = false }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [processedEmails, setProcessedEmails] = useState([])
  const [swipingCards, setSwipingCards] = useState(new Set())

  const isStream = currentFolder === 'STREAM'

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

  const handleSwipe = (email, direction, isButtonClick = false) => {
    // Prevent multiple swipes on the same card
    if (swipingCards.has(email.id)) return

    // Mark this card as swiping
    setSwipingCards(prev => new Set([...prev, email.id]))

    if (isStream) {
      // Stream behavior - original functionality (one-way removal)
      console.log(`${direction === 'left' ? 'Not interested (marking as read)' : 'Interested (marking as read + sorting)'} in email:`, email.subject)

      if (direction === 'left') {
        // In stream view, left swipe marks as read
        onMarkRead(email.id)
        setProcessedEmails(prev => [...prev, { ...email, action: 'not_interested' }])
      } else {
        // Right swipe - mark as read and analyze/sort
        onMarkRead(email.id)
        if (onAnalyzeAndSort) {
          onAnalyzeAndSort(email)
        } else {
          onApplyLabel(email.id, 'STARRED')
        }
        setProcessedEmails(prev => [...prev, { ...email, action: 'interested' }])
      }

      // Stream: Remove card after animation (one-way)
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1)
        setSwipingCards(prev => {
          const newSet = new Set(prev)
          newSet.delete(email.id)
          return newSet
        })
      }, 350)
    } else {
      // Folder behavior - bidirectional navigation (slideshow mode)
      // All gestures use normal direction now (scroll inversion is handled in SwipeableEmailCard)
      const actualDirection = direction

      console.log(`Navigating ${actualDirection === 'left' ? 'previous' : 'next'} email in folder`)

      // Clear swiping state immediately for folders since there's no animation
      setSwipingCards(prev => {
        const newSet = new Set(prev)
        newSet.delete(email.id)
        return newSet
      })

      if (actualDirection === 'left') {
        // Previous email (backward)
        if (currentIndex > 0) {
          setCurrentIndex(prev => prev - 1)
          setProcessedEmails(prev => [...prev, { ...email, action: 'navigated_previous' }])
        } else {
          console.log('Already at first email')
        }
      } else {
        // Next email (forward)
        if (currentIndex < emails.length - 1) {
          setCurrentIndex(prev => prev + 1)
          setProcessedEmails(prev => [...prev, { ...email, action: 'navigated_next' }])
        } else {
          console.log('Already at last email')
        }
      }
    }
  }

  const handleSwipeLeft = (email, isButtonClick = false) => handleSwipe(email, 'left', isButtonClick)
  const handleSwipeRight = (email, isButtonClick = false) => handleSwipe(email, 'right', isButtonClick)

  const getVisibleEmails = () => {
    if (isStream) {
      // Stream: show stack of 3 cards (current + next 2)
      return emails.slice(currentIndex, currentIndex + 3)
    } else {
      // Folder: show only current email (slideshow mode)
      return emails.slice(currentIndex, currentIndex + 1)
    }
  }

  const getRemainingCount = () => {
    if (isStream) {
      return Math.max(0, emails.length - currentIndex)
    } else {
      // For folders, return current position
      return currentIndex + 1
    }
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

  if ((isStream && currentIndex >= emails.length) || (!isStream && emails.length === 0)) {
    return (
      <div className="email-stack-complete">
        <div className="complete-state">
          <div className="complete-icon">🎉</div>
          <h3>{isStream ? 'All done!' : 'End of slideshow!'}</h3>
          <p>{isStream ? `You've reviewed all ${emails.length} emails.` : `You've viewed all ${emails.length} emails.`}</p>

          <div className="summary">
            <div className="summary-stats">
              {currentFolder === 'STREAM' ? (
                <>
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
                </>
              ) : (
                <div className="stat">
                  <span className="stat-number">
                    {processedEmails.length}
                  </span>
                  <span className="stat-label">Emails Viewed</span>
                </div>
              )}
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
            onAddToCalendar={onAddToCalendar}
            eventInfo={getEventInfo ? getEventInfo(email.id) : null}
            isTopCard={index === 0}
            isSwiping={swipingCards.has(email.id)}
            stackIndex={index}
            currentFolder={currentFolder}
            showMLScore={showMLScores}
          />
        ))}
      </div>

    </div>
  )
}

export default EmailStack
