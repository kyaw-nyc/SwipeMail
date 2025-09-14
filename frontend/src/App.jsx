import { useState, useEffect } from 'react'
import Cookies from 'js-cookie'
import AuthButton from './components/AuthButton'
import EmailStack from './components/EmailStack'
import FolderBar from './components/FolderBar'
import { useCerebrasAnalysis } from './hooks/useCerebrasAnalysis'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentFolder, setCurrentFolder] = useState('STREAM')
  const [availableFolders, setAvailableFolders] = useState([])
  const [currentStream, setCurrentStream] = useState({
    id: 'unread',
    name: 'Unread Emails',
    description: 'Only unread emails from inbox',
    icon: '📬',
    query: 'is:unread'
  })
  const [remainingCount, setRemainingCount] = useState(0)

  // Initialize Cerebras analysis hook
  const { analyzeEmail, isAnalyzing } = useCerebrasAnalysis()

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const storedToken = Cookies.get('swipemail_token')
      const storedUser = Cookies.get('swipemail_user')

      if (storedToken && storedUser) {
        try {
          const userData = JSON.parse(storedUser)

          // Validate token is still valid by making a test request
          const testResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: {
              'Authorization': `Bearer ${storedToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (testResponse.ok) {
            setAccessToken(storedToken)
            setUser(userData)
            console.log('✅ Restored valid session from cookies')
          } else {
            console.log('⚠️ Stored token is expired or invalid')
            // Clear invalid cookies
            Cookies.remove('swipemail_token')
            Cookies.remove('swipemail_user')
          }
        } catch (error) {
          console.error('Error restoring session:', error)
          // Clear invalid cookies
          Cookies.remove('swipemail_token')
          Cookies.remove('swipemail_user')
        }
      }
      setCheckingAuth(false)
    }

    checkExistingSession()
  }, [])


  // Prevent accidental back navigation (only needed when emails are loaded)
  useEffect(() => {
    if (!user) return // No need for navigation prevention on welcome page

    const preventBackNavigation = (e) => {
      // Block ANY horizontal scroll that's not on an email card
      if (Math.abs(e.deltaX) > 0) {
        // Check if we're not on an email card (which handles its own scroll events)
        const target = e.target.closest('.swipeable-email-card')
        if (!target) {
          e.preventDefault()
          e.stopPropagation()
          return false
        }
      }
    }

    // Also prevent touch gestures that could trigger back navigation
    const preventTouchNavigation = (e) => {
      // Only allow touch events on email cards
      const target = e.target.closest('.swipeable-email-card')
      if (!target && e.touches.length === 1) {
        const touch = e.touches[0]
        // Store initial touch position
        if (!window.touchStartX) {
          window.touchStartX = touch.clientX
        }
      }
    }

    const preventTouchMove = (e) => {
      const target = e.target.closest('.swipeable-email-card')
      if (!target && e.touches.length === 1 && window.touchStartX) {
        const touch = e.touches[0]
        const deltaX = touch.clientX - window.touchStartX
        // Prevent if horizontal swipe detected
        if (Math.abs(deltaX) > 10) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    const clearTouch = () => {
      window.touchStartX = null
    }

    // Also prevent history navigation via keyboard
    const preventKeyboardNav = (e) => {
      // Prevent Alt+Arrow keys and Backspace navigation
      if ((e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) ||
          (e.key === 'Backspace' && !['input', 'textarea'].includes(e.target.tagName.toLowerCase()))) {
        e.preventDefault()
      }
    }

    // Add event listeners to catch all scroll/swipe events
    window.addEventListener('wheel', preventBackNavigation, { passive: false, capture: true })
    window.addEventListener('touchstart', preventTouchNavigation, { passive: false })
    window.addEventListener('touchmove', preventTouchMove, { passive: false })
    window.addEventListener('touchend', clearTouch)
    window.addEventListener('keydown', preventKeyboardNav)

    return () => {
      window.removeEventListener('wheel', preventBackNavigation)
      window.removeEventListener('touchstart', preventTouchNavigation)
      window.removeEventListener('touchmove', preventTouchMove)
      window.removeEventListener('touchend', clearTouch)
      window.removeEventListener('keydown', preventKeyboardNav)
    }
  }, [user])

  const handleLoginSuccess = (credentialResponse) => {
    setUser(credentialResponse.user)
    setAccessToken(credentialResponse.access_token)

    // Save to cookies with 7-day expiry
    Cookies.set('swipemail_token', credentialResponse.access_token, {
      expires: 7,
      sameSite: 'strict',
      secure: window.location.protocol === 'https:'
    })
    Cookies.set('swipemail_user', JSON.stringify(credentialResponse.user), {
      expires: 7,
      sameSite: 'strict',
      secure: window.location.protocol === 'https:'
    })
    console.log('Session saved to cookies')
  }

  const handleLogout = () => {
    setUser(null)
    setAccessToken(null)
    setEmails([])

    // Clear cookies
    Cookies.remove('swipemail_token')
    Cookies.remove('swipemail_user')
    console.log('Session cleared from cookies')
  }

  const handleStreamChange = (stream) => {
    console.log('Stream changed to:', stream.name)
    setCurrentStream(stream)
    // Only refetch emails if we're currently viewing STREAM
    if (currentFolder === 'STREAM') {
      fetchEmails('STREAM')
    }
  }

  // Function to clean and sanitize text content
  const cleanTextContent = (text) => {
    if (!text) return text

    return text
      // Fix common encoding issues
      .replace(/â€™/g, "'") // Smart apostrophe
      .replace(/â€œ/g, '"') // Smart quote left
      .replace(/â€/g, '"') // Smart quote right
      .replace(/â€¦/g, '...') // Ellipsis
      .replace(/â€"/g, '—') // Em dash
      .replace(/â€"/g, '–') // En dash
      .replace(/Â/g, ' ') // Non-breaking space issues

      // Handle ballot box characters and other problematic Unicode
      .replace(/☑/g, '[✓]') // Ballot box with check
      .replace(/☒/g, '[✗]') // Ballot box with X
      .replace(/□/g, '[ ]') // Empty ballot box
      .replace(/■/g, '[■]') // Black square
      .replace(/▪/g, '•') // Black small square to bullet
      .replace(/▫/g, '○') // White small square to circle

      // Fix common problematic characters
      .replace(/'/g, "'") // Curly apostrophe
      .replace(/"/g, '"') // Curly quote left
      .replace(/"/g, '"') // Curly quote right
      .replace(/…/g, '...') // Horizontal ellipsis
      .replace(/—/g, '—') // Em dash
      .replace(/–/g, '–') // En dash
      .replace(/™/g, '™') // Trademark
      .replace(/®/g, '®') // Registered
      .replace(/©/g, '©') // Copyright

      // Remove or replace other problematic Unicode characters
      .replace(/[\u2000-\u200F\u2028-\u202F\u205F-\u206F]/g, ' ') // Various space characters
      .replace(/[\uFEFF]/g, '') // Byte order mark
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Control characters

      // Normalize whitespace
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .trim()
  }

  const fetchFolders = async () => {
    if (!accessToken) return

    try {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        const folders = data.labels
          .filter(label => {
            // Only include essential system labels and SwipeMail labels
            if (label.type === 'user' && label.name.startsWith('SwipeMail/')) {
              return true
            }
            if (label.type === 'system') {
              const essentialSystemLabels = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH']
              return essentialSystemLabels.includes(label.name)
            }
            return false
          })
          .map(label => ({
            id: label.id,
            name: label.name,
            type: label.type,
            messagesTotal: label.messagesTotal || 0,
            messagesUnread: label.messagesUnread || 0,
            isSwipeMail: label.name.startsWith('SwipeMail/')
          }))

        setAvailableFolders(folders)
        console.log('Loaded folders:', folders)
      }
    } catch (error) {
      console.error('Error fetching folders:', error)
    }
  }

  const fetchEmails = async (folderId = currentFolder) => {
    setLoading(true)
    // Fetch emails from Gmail API
    try {
        if (!accessToken) {
          console.log('No access token available. User needs to sign in with Gmail permissions.')
          setEmails([])
          return
        }


        console.log(`Fetching emails from Gmail API for folder: ${folderId}...`)

        // Build query based on folder and stream
        let query = 'maxResults=20'
        if (folderId === 'STREAM') {
          // Use current stream query
          query += `&q=${currentStream.query}`
        } else {
          // For SwipeMail AI folders (custom labels)
          query += `&labelIds=${folderId}`
        }

        // Fetch messages from Gmail API
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Gmail API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()

        if (!data.messages || data.messages.length === 0) {
          console.log('No unread messages found')
          setEmails([])
          return
        }

        console.log(`Found ${data.messages.length} unread messages, fetching details...`)

        // Fetch details for each message
        const emailPromises = data.messages.map(async (message) => {
          try {
            const emailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            })

            if (!emailResponse.ok) {
              console.error(`Failed to fetch message ${message.id}:`, emailResponse.status)
              return null
            }

            return emailResponse.json()
          } catch (error) {
            console.error(`Error fetching message ${message.id}:`, error)
            return null
          }
        })

        const emailsData = await Promise.all(emailPromises)

        // Filter out failed requests and format the emails
        // Helper functions for email processing
        const fetchAttachment = async (messageId, attachmentId) => {
          try {
            const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            })

            if (response.ok) {
              const attachmentData = await response.json()
              return attachmentData.data
            }
          } catch (error) {
            console.error('Error fetching attachment:', error)
          }
          return null
        }

        const processInlineImages = async (htmlContent, messageId, payload) => {
          const cidMap = new Map()

          // Collect all attachments with Content-ID headers
          const collectAttachments = (part) => {
            if (part.body && part.body.attachmentId && part.headers) {
              const contentId = part.headers.find(h => h.name.toLowerCase() === 'content-id')
              if (contentId) {
                const cid = contentId.value.replace(/[<>]/g, '') // Remove < > brackets
                cidMap.set(cid, {
                  attachmentId: part.body.attachmentId,
                  mimeType: part.mimeType
                })
              }
            }

            if (part.parts) {
              part.parts.forEach(collectAttachments)
            }
          }

          collectAttachments(payload)

          // Replace cid: references with data URLs
          let processedHtml = htmlContent
          for (const [cid, attachment] of cidMap) {
            const attachmentData = await fetchAttachment(messageId, attachment.attachmentId)
            if (attachmentData) {
              // Convert base64url to regular base64
              const base64Data = attachmentData.replace(/-/g, '+').replace(/_/g, '/')
              const dataUrl = `data:${attachment.mimeType};base64,${base64Data}`

              // Replace all cid: references
              const cidRegex = new RegExp(`cid:${cid}`, 'gi')
              processedHtml = processedHtml.replace(cidRegex, dataUrl)
            }
          }

          return processedHtml
        }

        const sanitizeHtml = (html) => {
          // Remove dangerous tags and attributes
          return html
            .replace(/<script[^>]*>.*?<\/script>/gis, '')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '')
            .replace(/<object[^>]*>.*?<\/object>/gis, '')
            .replace(/<embed[^>]*>/gi, '')
            .replace(/<applet[^>]*>.*?<\/applet>/gis, '')
            .replace(/<form[^>]*>.*?<\/form>/gis, '')
            .replace(/<input[^>]*>/gi, '')
            .replace(/<button[^>]*>.*?<\/button>/gis, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
            .replace(/javascript:/gi, '') // Remove javascript: URLs
            .replace(/vbscript:/gi, '') // Remove vbscript: URLs
            .replace(/data:(?!image)/gi, '') // Remove non-image data URLs
            // Add safe styling to images
            .replace(/<img([^>]*?)>/gi, '<img$1 style="max-width: 100%; height: auto; display: block; margin: 0.5rem 0;">')
        }

        const getEmailBody = async (payload, messageId) => {
          if (!payload) return 'No content available'

          let content = ''
          let mimeType = 'text/html'

          // Handle multipart messages - prefer HTML over plain text
          if (payload.parts && payload.parts.length > 0) {
            const htmlPart = payload.parts.find(part => part.mimeType === 'text/html')
            const plainTextPart = payload.parts.find(part => part.mimeType === 'text/plain')

            const selectedPart = htmlPart || plainTextPart
            if (selectedPart && selectedPart.body && selectedPart.body.data) {
              try {
                // Clean up base64 string before decoding
                const base64String = selectedPart.body.data
                  .replace(/-/g, '+')
                  .replace(/_/g, '/')
                  // Ensure proper padding
                  .padEnd(Math.ceil(selectedPart.body.data.length / 4) * 4, '=')

                content = atob(base64String)
                mimeType = selectedPart.mimeType
              } catch (e) {
                console.error('Error decoding email body:', e)
                // Fallback to using snippet
                content = email.snippet || ''
              }
            }
          }

          // Handle single part message
          if (!content && payload.body && payload.body.data) {
            try {
              // Clean up base64 string before decoding
              const base64String = payload.body.data
                .replace(/-/g, '+')
                .replace(/_/g, '/')
                // Ensure proper padding
                .padEnd(Math.ceil(payload.body.data.length / 4) * 4, '=')

              content = atob(base64String)
              mimeType = payload.mimeType || 'text/html'
            } catch (e) {
              console.error('Error decoding email body:', e)
              // Fallback to using snippet
              content = email.snippet || ''
            }
          }

          // Process the content
          if (content) {
            // First, handle encoding issues and problematic characters
            content = cleanTextContent(content)

            if (mimeType === 'text/html') {
              // Process inline images first
              content = await processInlineImages(content, messageId, payload)
              // Then sanitize the HTML
              content = sanitizeHtml(content)
            } else if (mimeType === 'text/plain') {
              // Convert plain text to HTML with line breaks
              content = content
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
            }
            return content
          }

          // Fallback to snippet
          return email.snippet || 'No content available'
        }

        // Process emails with async body processing
        const formattedEmails = await Promise.all(
          emailsData
            .filter(email => email !== null)
            .map(async email => {
              const headers = email.payload?.headers || []

              return {
                id: email.id,
                subject: cleanTextContent(headers.find(h => h.name === 'Subject')?.value || 'No Subject'),
                from: headers.find(h => h.name === 'From')?.value || 'Unknown Sender',
                snippet: cleanTextContent(email.snippet || 'No preview available'),
                body: await getEmailBody(email.payload, email.id),
                labelIds: email.labelIds || [],
                threadId: email.threadId,
                date: headers.find(h => h.name === 'Date')?.value
              }
            })
        )

        console.log(`Successfully loaded ${formattedEmails.length} emails`)
        setEmails(formattedEmails)

        // AI analysis will be triggered only when user expresses interest (swipes right)
    } catch (error) {
      console.error('Error fetching emails:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (emailId) => {
    if (!accessToken) {
      console.error('No access token available for Gmail API')
      return
    }

    try {
      console.log(`Marking email ${emailId} as read...`)

      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          removeLabelIds: ['UNREAD']
        })
      })

      if (response.ok) {
        console.log(`Successfully marked email ${emailId} as read`)
        // Don't remove from emails array - let the EmailStack handle display logic
      } else {
        const errorData = await response.json()
        console.error('Failed to mark email as read:', errorData)
      }
    } catch (error) {
      console.error('Error marking email as read:', error)
    }
  }

  const createLabelIfNotExists = async (labelName) => {
    if (!accessToken) return null

    try {
      // First, check if label exists
      const listResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (listResponse.ok) {
        const labels = await listResponse.json()
        const existingLabel = labels.labels.find(label => label.name === labelName)
        if (existingLabel) {
          return existingLabel.id
        }
      }

      // Create new label if it doesn't exist
      const createResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: labelName,
          messageListVisibility: 'show',
          labelListVisibility: 'labelShow',
          type: 'user'
        })
      })

      if (createResponse.ok) {
        const newLabel = await createResponse.json()
        console.log(`Created new label: ${labelName}`)
        return newLabel.id
      }
    } catch (error) {
      console.error('Error creating label:', error)
    }

    return null
  }

  const applyLabel = async (emailId, label = 'STARRED') => {
    if (!accessToken) {
      console.error('No access token available for Gmail API')
      return
    }

    try {
      console.log(`Applying label ${label} to email ${emailId}...`)

      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addLabelIds: [label]
        })
      })

      if (response.ok) {
        console.log(`Successfully applied label ${label} to email ${emailId}`)
        // Don't modify emails array - let the EmailStack handle display logic
      } else {
        const errorData = await response.json()
        console.error('Failed to apply label:', errorData)
      }
    } catch (error) {
      console.error('Error applying label:', error)
    }
  }

  const analyzeAndSortEmail = async (email) => {
    try {
      console.log('🧠 Analyzing email to determine if from individual or organization...')
      const analysis = await analyzeEmail(email)

      if (analysis && analysis.senderType) {
        // Create folder name based on sender type
        const folderName = analysis.senderType === 'individual'
          ? 'SwipeMail/Individual'
          : 'SwipeMail/Organization'

        // Create label if it doesn't exist and apply it
        const labelId = await createLabelIfNotExists(folderName)
        if (labelId) {
          await applyLabel(email.id, labelId)
          console.log(`✅ Sorted email to folder: ${folderName} (detected as ${analysis.senderType})`)
        }

        // Also star it as before
        await applyLabel(email.id, 'STARRED')
      } else {
        // Fallback to organization folder if analysis fails
        console.log('⚠️ Analysis failed, defaulting to Organization folder')
        const labelId = await createLabelIfNotExists('SwipeMail/Organization')
        if (labelId) {
          await applyLabel(email.id, labelId)
          console.log('✅ Sorted email to folder: SwipeMail/Organization (fallback)')
        }
        await applyLabel(email.id, 'STARRED')
      }
    } catch (error) {
      console.error('Error analyzing and sorting email:', error)
      // Fallback to organization folder on error
      const labelId = await createLabelIfNotExists('SwipeMail/Organization')
      if (labelId) {
        await applyLabel(email.id, labelId)
        console.log('✅ Sorted email to folder: SwipeMail/Organization (error fallback)')
      }
      await applyLabel(email.id, 'STARRED')
    }
  }

  const flagIncorrectSorting = async (email) => {
    if (!accessToken) return

    try {
      console.log(`🚩 Flagging email ${email.id} as incorrectly sorted`)

      // Create or get "SwipeMail/Review" label for incorrectly sorted emails
      const reviewLabelId = await createLabelIfNotExists('SwipeMail/Review')
      if (reviewLabelId) {
        await applyLabel(email.id, reviewLabelId)
        console.log(`✅ Email flagged for review and moved to SwipeMail/Review folder`)
      }
    } catch (error) {
      console.error('Error flagging email for review:', error)
    }
  }

  const handleFolderChange = (folderId) => {
    setCurrentFolder(folderId)
    setEmails([])

    fetchEmails(folderId)
  }

  useEffect(() => {
    if (user && accessToken) {
      fetchFolders()
      fetchEmails('STREAM') // Start with stream view
    }
  }, [user, accessToken])

  useEffect(() => {
    if (user && accessToken && currentFolder) {
      fetchEmails(currentFolder)
    }
  }, [currentFolder])

  // Show loading screen while checking for existing session
  if (checkingAuth) {
    return (
      <div className="app">
        <div className="auth-loading">
          <div className="loading-spinner"></div>
          <p>Checking authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>SwipeMail</h1>
        <div className="header-controls">
          <AuthButton
            user={user}
            onLoginSuccess={handleLoginSuccess}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <main className="app-main">
        {user ? (
          <div className="app-content">
            <FolderBar
              folders={availableFolders}
              currentFolder={currentFolder}
              onFolderChange={handleFolderChange}
              currentStream={currentStream}
              onStreamChange={handleStreamChange}
            />
            <div className="email-section">
              {loading ? (
                <div className="loading">Loading emails...</div>
              ) : (
                <>
                  {isAnalyzing && (
                    <div className="analysis-status">
                      <span>🧠 AI analyzing emails...</span>
                    </div>
                  )}
                  <div className="email-section-header">
                    <div className="remaining-count">
                      {remainingCount} remaining
                    </div>
                  </div>
                  <EmailStack
                    emails={emails}
                    currentFolder={currentFolder}
                    onMarkRead={markAsRead}
                    onApplyLabel={applyLabel}
                    onAnalyzeAndSort={analyzeAndSortEmail}
                    onFlagIncorrect={flagIncorrectSorting}
                    onRemainingCountChange={setRemainingCount}
                  />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="welcome-hero">
            <div className="welcome-content">
              <div className="welcome-visual">
                <div className="email-stack-preview">
                  <div className="preview-card card-1">
                    <div className="preview-header">
                      <div className="preview-dot"></div>
                      <div className="preview-dot"></div>
                    </div>
                    <div className="preview-lines">
                      <div className="preview-line long"></div>
                      <div className="preview-line medium"></div>
                      <div className="preview-line short"></div>
                    </div>
                  </div>
                  <div className="preview-card card-2">
                    <div className="preview-header">
                      <div className="preview-dot"></div>
                      <div className="preview-dot"></div>
                    </div>
                    <div className="preview-lines">
                      <div className="preview-line long"></div>
                      <div className="preview-line medium"></div>
                    </div>
                  </div>
                  <div className="preview-card card-3">
                    <div className="preview-header">
                      <div className="preview-dot"></div>
                      <div className="preview-dot"></div>
                    </div>
                    <div className="preview-lines">
                      <div className="preview-line medium"></div>
                    </div>
                  </div>
                </div>
                <div className="swipe-arrows">
                  <div className="arrow-left">←</div>
                  <div className="arrow-right">→</div>
                </div>
              </div>

              <div className="welcome-text">
                <h1 className="welcome-title">
                  Swipe Your Way to
                  <span className="gradient-text"> Inbox Zero</span>
                </h1>
                <p className="welcome-subtitle">
                  Swipe right on interesting emails. AI automatically organizes them.
                </p>

                <div className="feature-highlights">
                  <div className="feature">
                    <div className="feature-icon">🧠</div>
                    <div className="feature-text">
                      <strong>AI Analysis</strong>
                      <span>Smart categorization</span>
                    </div>
                  </div>
                  <div className="feature">
                    <div className="feature-icon">📂</div>
                    <div className="feature-text">
                      <strong>Auto-Sorted</strong>
                      <span>Perfect folders</span>
                    </div>
                  </div>
                  <div className="feature">
                    <div className="feature-icon">⚡</div>
                    <div className="feature-text">
                      <strong>Swipe Interface</strong>
                      <span>Tinder-style sorting</span>
                    </div>
                  </div>
                </div>

                <div className="cta-section">
                  <AuthButton
                    user={user}
                    onLoginSuccess={handleLoginSuccess}
                    onLogout={handleLogout}
                  />
                  <p className="privacy-note">
                    🔒 Private & secure
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
