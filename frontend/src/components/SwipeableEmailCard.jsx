import { useState, useRef, useEffect } from 'react'
import EmailAnalysisDisplay from './EmailAnalysisDisplay'

function SwipeableEmailCard({ email, onSwipeLeft, onSwipeRight, onAddToCalendar, eventInfo, isTopCard = false, isSwiping = false, stackIndex = 0 }) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState(null) // 'left' or 'right'
  const [scrollLocked, setScrollLocked] = useState(false)
  const cardRef = useRef(null)
  const startPos = useRef({ x: 0, y: 0 })
  const touchStartTime = useRef(0)
  const scrollCooldown = useRef(false)
  const scrollTimeout = useRef(null)
  const scrollDirection = useRef(null)

  const SWIPE_THRESHOLD = 100
  const MAX_ROTATION = 15
  const SCROLL_COOLDOWN_MS = 500 // Cooldown between scroll swipes
  const SCROLL_DEBOUNCE_MS = 50 // Debounce multiple scroll events

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isTopCard) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleSwipeLeft()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleSwipeRight()
      }
    }

    const handleWheel = (e) => {
      if (!isTopCard || isSwiping || scrollCooldown.current) return

      // Check if the scroll is happening within the email snippet area
      const emailSnippet = e.target.closest('.email-snippet')
      if (emailSnippet) {
        // Allow vertical scrolling within email snippet
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          return // Let the browser handle vertical scrolling
        }
      }

      // Detect if this is a trackpad horizontal scroll with sufficient force
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 15) {
        e.preventDefault()

        // Determine scroll direction
        const currentDirection = e.deltaX > 0 ? 'left' : 'right'
        scrollDirection.current = currentDirection

        // Clear existing timeout
        if (scrollTimeout.current) {
          clearTimeout(scrollTimeout.current)
        }

        // Set new timeout - only execute swipe after scroll events stop coming
        scrollTimeout.current = setTimeout(() => {
          // Execute the swipe only once after scroll events have stopped
          scrollCooldown.current = true
          setScrollLocked(true)

          // Perform the swipe based on accumulated scroll direction
          if (scrollDirection.current === 'left') {
            handleSwipeLeft()
          } else {
            handleSwipeRight()
          }

          // Reset direction and set cooldown
          scrollDirection.current = null

          setTimeout(() => {
            scrollCooldown.current = false
            setScrollLocked(false)
          }, SCROLL_COOLDOWN_MS)
        }, SCROLL_DEBOUNCE_MS)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    if (cardRef.current) {
      cardRef.current.addEventListener('wheel', handleWheel, { passive: false })
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (cardRef.current) {
        cardRef.current.removeEventListener('wheel', handleWheel)
      }
      // Clear any pending scroll timeout
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current)
      }
    }
  }, [isTopCard, isSwiping])

  const handleSwipeLeft = () => {
    if (isSwiping) return
    setSwipeDirection('left')
    onSwipeLeft(email)
  }

  const handleSwipeRight = () => {
    if (isSwiping) return
    setSwipeDirection('right')
    onSwipeRight(email)
  }

  const handleMouseDown = (e) => {
    if (!isTopCard) return

    // Check if click is on Gmail button or its children
    const clickedElement = e.target
    if (clickedElement.closest('.gmail-button')) {
      return // Don't start dragging if clicking the Gmail button
    }

    setIsDragging(true)
    startPos.current = { x: e.clientX, y: e.clientY }
    touchStartTime.current = Date.now()
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !isTopCard) return

    const deltaX = e.clientX - startPos.current.x
    const deltaY = e.clientY - startPos.current.y

    setDragOffset({ x: deltaX, y: deltaY })

    const rotationAmount = (deltaX / window.innerWidth) * MAX_ROTATION * 2
    setRotation(Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, rotationAmount)))
  }

  const handleMouseUp = () => {
    if (!isDragging || !isTopCard) return

    setIsDragging(false)

    if (Math.abs(dragOffset.x) > SWIPE_THRESHOLD) {
      if (dragOffset.x > 0) {
        handleSwipeRight()
      } else {
        handleSwipeLeft()
      }
    } else {
      setDragOffset({ x: 0, y: 0 })
      setRotation(0)
    }
  }

  const handleTouchStart = (e) => {
    if (!isTopCard) return

    // Check if touch is on Gmail button or its children
    const touchedElement = e.target
    if (touchedElement.closest('.gmail-button')) {
      return // Don't start dragging if touching the Gmail button
    }

    const touch = e.touches[0]
    setIsDragging(true)
    startPos.current = { x: touch.clientX, y: touch.clientY }
    touchStartTime.current = Date.now()
  }

  const handleTouchMove = (e) => {
    if (!isDragging || !isTopCard) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - startPos.current.x
    const deltaY = touch.clientY - startPos.current.y

    setDragOffset({ x: deltaX, y: deltaY })

    const rotationAmount = (deltaX / window.innerWidth) * MAX_ROTATION * 2
    setRotation(Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, rotationAmount)))
  }

  const handleTouchEnd = () => {
    if (!isDragging || !isTopCard) return

    setIsDragging(false)

    if (Math.abs(dragOffset.x) > SWIPE_THRESHOLD) {
      if (dragOffset.x > 0) {
        handleSwipeRight()
      } else {
        handleSwipeLeft()
      }
    } else {
      setDragOffset({ x: 0, y: 0 })
      setRotation(0)
    }
  }

  const getSwipeIndicator = () => {
    // Show indicator if dragging or scrolling with significant offset
    if (Math.abs(dragOffset.x) < 30) return null

    return (
      <div className={`swipe-indicator ${dragOffset.x > 0 ? 'interested' : 'not-interested'}`}>
        {dragOffset.x > 0 ? '✓ INTERESTED' : '✗ NOT INTERESTED'}
      </div>
    )
  }

  const getCardClasses = () => {
    const classes = ['swipeable-email-card']

    if (isTopCard) classes.push('top-card')
    if (isSwiping && swipeDirection) classes.push(`swiping-${swipeDirection}`)
    if (isDragging) classes.push('dragging')

    return classes.join(' ')
  }

  const getCardStyle = () => {
    if (isSwiping && swipeDirection) {
      // Let CSS handle the swipe animation
      return {
        zIndex: isTopCard ? 10 : Math.max(1, 3 - stackIndex)
      }
    }

    if (isDragging || (dragOffset.x !== 0 && isTopCard)) {
      // Manual drag styling or scroll feedback
      return {
        transform: `translateX(-50%) translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotation}deg)`,
        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
        zIndex: isTopCard ? 10 : Math.max(1, 3 - stackIndex),
        cursor: isDragging ? 'grabbing' : (isTopCard ? 'grab' : 'default')
      }
    }

    // Default positioning
    return {
      transform: `translateX(-50%) translateY(${stackIndex * 4}px) scale(${1 - stackIndex * 0.02})`,
      transition: 'all 0.3s ease-out',
      zIndex: Math.max(1, 3 - stackIndex),
      cursor: isTopCard ? 'grab' : 'default'
    }
  }

  return (
    <div
      ref={cardRef}
      className={getCardClasses()}
      style={getCardStyle()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {getSwipeIndicator()}

      {/* AI Analysis Badges */}
      <EmailAnalysisDisplay email={email} />

      <div className="email-content">
        <div className="email-header">
          <div className="email-from">
            <strong>{email.from?.split('<')[0]?.trim() || 'Unknown Sender'}</strong>
            <span className="email-address">
              {email.from?.match(/<(.+)>/)?.[1] || email.from}
            </span>
          </div>
          <div className="email-subject-center">
            {email.subject}
          </div>
          <div className="email-actions">
            <div className="email-date">
              {email.date ? new Date(email.date).toLocaleDateString() : ''}
            </div>
          </div>
        </div>

        <div className="email-snippet">
          <div
            className="email-body"
            dangerouslySetInnerHTML={{
              __html: email.body || email.snippet || 'No content available'
            }}
          />
        </div>
      </div>

      {isTopCard && (
        <>
          <div className="swipe-hints">
            <button
              className="gmail-button swipe-button left"
              onClick={(e) => {
                e.stopPropagation()
                handleSwipeLeft()
              }}
            >
              <div className="gmail-button-content">
                <div className="gmail-button-icon">←</div>
                <div className="gmail-button-text">Not Interested</div>
              </div>
            </button>
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${email.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="gmail-button"
              onClick={(e) => {
                e.stopPropagation()
                console.log('Gmail link clicked:', {
                  threadId: email.threadId,
                  id: email.id,
                  url: `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`
                })
              }}
            >
              <div className="gmail-button-content">
                <div className="gmail-button-icon">📧</div>
                <div className="gmail-button-text">View Email</div>
              </div>
            </a>
            <button
              className={`gmail-button ${eventInfo?.result?.has_event ? '' : 'disabled'}`}
              onClick={(e) => {
                e.stopPropagation()
                if (eventInfo?.result?.has_event) onAddToCalendar?.(email)
              }}
              disabled={!eventInfo?.result?.has_event}
              title={eventInfo?.result?.has_event ? 'Add to Google Calendar' : (eventInfo?.loading ? 'Detecting event…' : 'No event detected')}
            >
              <div className="gmail-button-content">
                <div className="gmail-button-icon">📅</div>
                <div className="gmail-button-text">Add to Calendar</div>
              </div>
            </button>
            <button
              className="gmail-button swipe-button right"
              onClick={(e) => {
                e.stopPropagation()
                handleSwipeRight()
              }}
            >
              <div className="gmail-button-content">
                <div className="gmail-button-icon">→</div>
                <div className="gmail-button-text">Interested</div>
              </div>
            </button>
          </div>
          {null}
          {scrollLocked && (
            <div className="scroll-cooldown-indicator">
              <span>⏱️ Processing swipe...</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SwipeableEmailCard
