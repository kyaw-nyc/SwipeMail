import { useState, useEffect, useRef } from 'react'
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
  const [streamEmails, setStreamEmails] = useState({
    unread: [],
    starred: [],
    'inbox-all': []
  })
  const [loading, setLoading] = useState(false)
  const [streamsLoaded, setStreamsLoaded] = useState(false)
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

  // Cursor-follow glow like SwipeMail package
  useEffect(() => {
    const setVars = (x, y) => {
      const r = document.documentElement
      r.style.setProperty('--mx', `${x}px`)
      r.style.setProperty('--my', `${y}px`)
    }
    const onMouse = (e) => setVars(e.clientX, e.clientY)
    const onTouch = (e) => {
      if (e.touches && e.touches[0]) setVars(e.touches[0].clientX, e.touches[0].clientY)
    }
    window.addEventListener('mousemove', onMouse)
    window.addEventListener('touchmove', onTouch, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('touchmove', onTouch)
    }
  }, [])

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

  const authRef = useRef(null)

  const handleLogout = () => {
    setUser(null)
    setAccessToken(null)
    setEmails([])

    // Clear cookies
    Cookies.remove('swipemail_token')
    Cookies.remove('swipemail_user')
    console.log('Session cleared from cookies')
  }

  // Trigger the Google sign-in button rendered by AuthButton
  const triggerGoogleSignIn = () => {
    if (authRef.current?.signIn) {
      authRef.current.signIn()
      return
    }
    // Fallback to DOM click if ref not ready
    const container = document.querySelector('.google-signin-button')
    const btn = container?.querySelector('div[role="button"], button, div')
    btn?.click?.()
  }

  const handleStreamChange = (stream) => {
    console.log('Stream changed to:', stream.name)
    setCurrentStream(stream)
    // Use cached emails if available, no need to refetch
    if (currentFolder === 'STREAM' && streamsLoaded) {
      setEmails(streamEmails[stream.id] || [])
    } else if (currentFolder === 'STREAM') {
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

  const fetchEmailsWithQuery = async (query) => {
    try {
      if (!accessToken) {
        console.log('No access token available. User needs to sign in with Gmail permissions.')
        return []
      }

      console.log(`📧 Fetching emails with query: "${query}"`)
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&q=${encodeURIComponent(query)}`
      console.log(`🌐 Request URL: ${url}`)

      // Fetch messages from Gmail API
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      console.log(`📡 API Response status: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Gmail API error: ${response.status} ${response.statusText}`, errorText)
        throw new Error(`Gmail API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log('📋 Raw API response:', data)

      if (!data.messages || data.messages.length === 0) {
        console.log(`❌ No messages found for query: "${query}"`)
        return []
      }

      console.log(`✅ Found ${data.messages.length} messages for query "${query}", fetching details...`)

      // Fetch details for each message (reuse existing email processing logic)
      const result = await processEmailDetails(data.messages)
      console.log(`🎯 Processed ${result.length} emails for query "${query}"`)
      return result
    } catch (error) {
      console.error(`❌ Error fetching emails for query "${query}":`, error)
      return []
    }
  }

  const fetchEmailsWithLabelId = async (labelId) => {
    try {
      if (!accessToken) {
        console.log('No access token available. User needs to sign in with Gmail permissions.')
        return []
      }

      console.log(`🏷️ Fetching emails with labelId: "${labelId}"`)
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&labelIds=${labelId}`
      console.log(`🌐 Request URL: ${url}`)

      // Fetch messages from Gmail API
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      console.log(`📡 API Response status: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Gmail API error: ${response.status} ${response.statusText}`, errorText)
        throw new Error(`Gmail API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log('📋 Raw API response:', data)

      if (!data.messages || data.messages.length === 0) {
        console.log(`❌ No messages found for labelId: "${labelId}"`)
        return []
      }

      console.log(`✅ Found ${data.messages.length} messages for labelId "${labelId}", fetching details...`)

      // Fetch details for each message (reuse existing email processing logic)
      const result = await processEmailDetails(data.messages)
      console.log(`🎯 Processed ${result.length} emails for labelId "${labelId}"`)
      return result
    } catch (error) {
      console.error(`❌ Error fetching emails for labelId "${labelId}":`, error)
      return []
    }
  }

  const processEmailDetails = async (messages) => {
    // Fetch details for each message
    const emailPromises = messages.map(async (message) => {
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

    return formattedEmails
  }

  const loadAllStreams = async () => {
    if (!accessToken) return

    setLoading(true)
    console.log('Loading all streams...')

    try {
      const streams = [
        { id: 'unread', query: 'is:unread' },
        { id: 'starred', query: 'is:starred' },
        { id: 'inbox-all', labelId: 'INBOX' }
      ]

      // Fetch all streams in parallel
      const streamPromises = streams.map(async (stream) => {
        if (stream.query) {
          console.log(`Fetching stream ${stream.id} with query: ${stream.query}`)
          const emails = await fetchEmailsWithQuery(stream.query)
          console.log(`Stream ${stream.id} returned ${emails.length} emails`)
          return { id: stream.id, emails }
        } else if (stream.labelId) {
          console.log(`Fetching stream ${stream.id} with labelId: ${stream.labelId}`)
          const emails = await fetchEmailsWithLabelId(stream.labelId)
          console.log(`Stream ${stream.id} returned ${emails.length} emails`)
          return { id: stream.id, emails }
        }
      })

      const streamResults = await Promise.all(streamPromises)

      // Update stream cache
      const newStreamEmails = {}
      streamResults.forEach(({ id, emails }) => {
        newStreamEmails[id] = emails
      })

      setStreamEmails(newStreamEmails)
      setStreamsLoaded(true)

      // Set current emails to the current stream
      setEmails(newStreamEmails[currentStream.id] || [])

      console.log('All streams loaded successfully:', {
        unread: newStreamEmails.unread.length,
        starred: newStreamEmails.starred.length,
        'inbox-all': newStreamEmails['inbox-all'].length
      })
    } catch (error) {
      console.error('Error loading streams:', error)
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

  const fetchEmails = async (folderId) => {
    setLoading(true)
    try {
      if (!accessToken) {
        console.log('No access token available. User needs to sign in with Gmail permissions.')
        setEmails([])
        return
      }

      console.log(`Fetching emails from Gmail API for folder: ${folderId}...`)

      if (folderId === 'STREAM') {
        // For streams, use cached data if available
        if (streamsLoaded) {
          setEmails(streamEmails[currentStream.id] || [])
          setLoading(false)
          return
        } else {
          // Load all streams if not loaded yet
          await loadAllStreams()
          return
        }
      }

      // For SwipeMail AI folders (custom labels) - fetch directly
      const query = `labelIds=${folderId}`
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&${query}`, {
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
        console.log('No messages found for folder:', folderId)
        setEmails([])
        return
      }

      console.log(`Found ${data.messages.length} messages, processing details...`)
      const formattedEmails = await processEmailDetails(data.messages)

      console.log(`Successfully loaded ${formattedEmails.length} emails`)
      setEmails(formattedEmails)

    } catch (error) {
      console.error('Error fetching emails:', error)
    } finally {
      setLoading(false)
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
      loadAllStreams() // Load all streams on app startup
    }
  }, [user, accessToken])

  useEffect(() => {
    if (user && accessToken && currentFolder && currentFolder !== 'STREAM') {
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
      {/* Fun loading screen for initial stream loading */}
      {user && !streamsLoaded && (
        <div className="stream-loading-overlay">
          <div className="stream-loading-content">
            <div className="loading-animation">
              <div className="email-icons">
                <div className="email-icon">📧</div>
                <div className="email-icon">📨</div>
                <div className="email-icon">📩</div>
                <div className="email-icon">✉️</div>
              </div>
              <div className="loading-text">
                <h2>🚀 Loading your emails...</h2>
                <p>Organizing your inbox with AI magic</p>
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {user && (
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
      )}

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
              {loading && streamsLoaded ? (
                <div className="loading">
                  <p>Loading emails...</p>
                  <div className="loading-spinner"></div>
                </div>
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
          <>
            <section className="swipemail-hero">
              <h1 className="hero-title">SwipeMail</h1>
              <div className="hero-tag">Turn inbox chaos into calm — one swipe at a time</div>
              <div className="hero-cta">
                <button className="btn btn-primary btn-lg hero-login-btn" onClick={triggerGoogleSignIn}>
                  Sign in with Google
                </button>
              </div>
              <button
                type="button"
                className="hero-arrow"
                onClick={() => {
                  const el = document.getElementById('hackmit-hero')
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                aria-label="Scroll to HackMIT hero"
                title="See more"
              >
                ↓
              </button>
            </section>

            <div id="hackmit-hero" className="welcome-hero">
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
                    ref={authRef}
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
          </>
        )}
      </main>
    </div>
  )
}

export default App
