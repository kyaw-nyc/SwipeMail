import { useState, useEffect, useRef } from 'react'
import Cookies from 'js-cookie'
import AuthButton from './components/AuthButton'
import EmailStack from './components/EmailStack'
import FolderBar from './components/FolderBar'
import { useCerebrasAnalysis } from './hooks/useCerebrasAnalysis'
import cerebrasApi from './services/cerebrasApi'
import { createCalendarEvent } from './services/calendar'
import EventConfirmModal from './components/EventConfirmModal'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [emails, setEmails] = useState([])
  const [streamEmails, setStreamEmails] = useState({
    starred: [],
    'starred-duplicate': [],
    'inbox-all': []
  })
  const [loading, setLoading] = useState(false)
  const [streamsLoaded, setStreamsLoaded] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentFolder, setCurrentFolder] = useState('STREAM')
  const [availableFolders, setAvailableFolders] = useState([])
  const [currentStream, setCurrentStream] = useState({
    id: 'starred-duplicate',
    name: 'Unread Emails',
    description: 'Only unread emails from inbox',
    icon: '📬',
    query: 'is:unread'
  })
  const [remainingCount, setRemainingCount] = useState(0)
  const [loadTotal, setLoadTotal] = useState(0)
  const [loadProgress, setLoadProgress] = useState(0)
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [eventDraft, setEventDraft] = useState(null)
  const [eventSubmitting, setEventSubmitting] = useState(false)

  // Initialize Cerebras analysis hook
  const { analyzeEmail, isAnalyzing } = useCerebrasAnalysis()
  const [eventAnalysis, setEventAnalysis] = useState({}) // id -> { loading, result, error }

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

  // Ensure event extraction for first few emails (top of stack)
  useEffect(() => {
    const primeEventDetection = async () => {
      const toAnalyze = emails.slice(0, 3)
      for (const e of toAnalyze) {
        if (!e?.id) continue
        if (eventAnalysis[e.id]?.loading || eventAnalysis[e.id]?.result) continue
        try {
          setEventAnalysis((prev) => ({ ...prev, [e.id]: { ...(prev[e.id] || {}), loading: true } }))
          const res = await cerebrasApi.extractEventFromEmail({
            subject: e.subject || '',
            from: e.from || '',
            body: (e.body || '').toString().replace(/<[^>]+>/g, ' ').slice(0, 4000),
          })
          setEventAnalysis((prev) => ({ ...prev, [e.id]: { loading: false, result: res } }))
        } catch (err) {
          setEventAnalysis((prev) => ({ ...prev, [e.id]: { loading: false, error: err.message || 'Failed' } }))
        }
      }
    }
    if (emails?.length) primeEventDetection()
  }, [emails])


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

  // Add to Google Calendar via Cerebras event extraction
  const handleAddToCalendar = async (email) => {
    try {
      if (!accessToken) {
        alert('Please sign in first to access Calendar')
        return
      }
      // Use existing extraction result, or run once
      let result = eventAnalysis[email.id]?.result
      if (!result) {
        const forAi = {
          subject: email.subject || '',
          from: email.from || '',
          body: (email.body && typeof email.body === 'string' ? email.body.replace(/<[^>]+>/g, ' ') : email.snippet || ''),
        }
        try {
          setEventAnalysis((prev) => ({ ...prev, [email.id]: { ...(prev[email.id] || {}), loading: true } }))
          result = await cerebrasApi.extractEventFromEmail(forAi)
          setEventAnalysis((prev) => ({ ...prev, [email.id]: { loading: false, result } }))
        } catch (err) {
          setEventAnalysis((prev) => ({ ...prev, [email.id]: { loading: false, error: err.message || 'Failed' } }))
        }
      }
      const title = (result?.has_event && result.event_title) || email.subject || 'Event from email'
      const desc = `From: ${email.from}\n\n${(email.body || '').toString().replace(/<[^>]+>/g, ' ').slice(0, 800)}`
      const tz = result?.timezone || undefined
      const parseToDateTime = (s) => {
        if (!s) return null
        const DEFAULT_YEAR = 2025
        let str = String(s).trim()

        // If ISO date-only (yyyy-mm-dd), assume 9am local
        const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/
        if (isoDateOnly.test(str)) {
          return new Date(`${str}T09:00:00`)
        }

        // MM/DD or MM/DD/YYYY (default year -> 2025)
        let m = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
        if (m) {
          const mm = String(m[1]).padStart(2, '0')
          const dd = String(m[2]).padStart(2, '0')
          let yyyy = m[3]
          if (!yyyy) yyyy = String(DEFAULT_YEAR)
          else if (yyyy.length === 2) yyyy = `20${yyyy}`
          return new Date(`${yyyy}-${mm}-${dd}T09:00:00`)
        }

        // MM-DD or MM-DD-YYYY (default year -> 2025)
        m = str.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?$/)
        if (m) {
          const mm = String(m[1]).padStart(2, '0')
          const dd = String(m[2]).padStart(2, '0')
          let yyyy = m[3]
          if (!yyyy) yyyy = String(DEFAULT_YEAR)
          else if (yyyy.length === 2) yyyy = `20${yyyy}`
          return new Date(`${yyyy}-${mm}-${dd}T09:00:00`)
        }

        // Month Name D[, YYYY][ time]
        m = str.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?(.*)$/i)
        if (m) {
          const monthDay = `${m[1]} ${m[2]}`
          const year = m[3] || String(DEFAULT_YEAR)
          const tail = (m[4] || '').trim()
          const candidate = `${monthDay}, ${year}${tail ? ` ${tail}` : ''}`
          const d = new Date(candidate)
          if (!isNaN(d.getTime())) return d
        }

        // If string contains month name but no 4-digit year, append default year
        if (!/\b\d{4}\b/.test(str) && /[A-Za-z]{3,9}/.test(str)) {
          const d = new Date(`${str} ${DEFAULT_YEAR}`)
          if (!isNaN(d.getTime())) return d
        }

        // Fallback: try native parse
        const d = new Date(str)
        return isNaN(d.getTime()) ? null : d
      }
      let startDt = parseToDateTime(result?.start_time) || new Date()
      let endDt = parseToDateTime(result?.end_time) || new Date(startDt.getTime() + 60 * 60 * 1000)
      const draft = {
        summary: title,
        description: desc,
        location: result?.location || '',
        start: { dateTime: startDt.toISOString(), ...(tz ? { timeZone: tz } : {}) },
        end: { dateTime: endDt.toISOString(), ...(tz ? { timeZone: tz } : {}) },
      }
      setEventDraft(draft)
      setEventModalOpen(true)
    } catch (e) {
      console.error('Prepare Add to Calendar failed:', e)
      alert(e.message || 'Failed to prepare calendar event')
    }
  }

  const ensureCalendarToken = (hintEmail) => new Promise((resolve) => {
    try {
      if (!window.google?.accounts?.oauth2) return resolve(accessToken)
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        include_granted_scopes: true,
        prompt: '',
        hint: hintEmail || undefined,
        callback: (tokenResponse) => {
          if (tokenResponse?.access_token) return resolve(tokenResponse.access_token)
          resolve(accessToken)
        },
        error_callback: () => resolve(accessToken),
      })
      client.requestAccessToken()
    } catch {
      resolve(accessToken)
    }
  })

  const handleConfirmCreateEvent = async (draft) => {
    try {
      setEventSubmitting(true)
      const calToken = await ensureCalendarToken(user?.email)
      const created = await createCalendarEvent(calToken, draft)
      console.log('[Calendar] Event created:', created)
      setEventSubmitting(false)
      setEventModalOpen(false)
      alert('Calendar event created')
    } catch (e) {
      console.error('Create Calendar event failed:', e)
      setEventSubmitting(false)
      alert(e.message || 'Failed to create calendar event')
    }
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
        console.log(`⚠️ No messages found for query: "${query}"`)
        console.log(`📊 API response:`, data)
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
    setLoadTotal(messages.length || 0)
    setLoadProgress(0)
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

        const json = await emailResponse.json()
        setLoadProgress((p) => Math.min((p || 0) + 1, messages.length || 0))
        return json
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

        const getEmailBody = async (payload, messageId, fallbackSnippet = '') => {
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
                content = fallbackSnippet || ''
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
              content = fallbackSnippet || ''
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
          return fallbackSnippet || 'No content available'
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
            body: await getEmailBody(email.payload, email.id, email.snippet || ''),
            labelIds: email.labelIds || [],
            threadId: email.threadId,
            date: headers.find(h => h.name === 'Date')?.value
          }
        })
    )

    // Complete progress on finish
    setLoadProgress(messages.length || 0)
    return formattedEmails
  }

  const loadAllStreams = async () => {
    if (!accessToken) return

    setLoading(true)
    console.log('Loading all streams...')

    try {
      const streams = [
        { id: 'starred-duplicate', query: 'is:unread' },
        { id: 'starred', query: 'is:starred' },
        { id: 'inbox-all', labelId: 'INBOX' },
      ]

      // Fetch all streams in parallel
      const streamPromises = streams.map(async (stream) => {
        try {
          if (stream.query) {
            console.log(`🔍 Fetching stream ${stream.id} with query: "${stream.query}"`)
            const emails = await fetchEmailsWithQuery(stream.query)
            console.log(`✅ Stream ${stream.id} returned ${emails.length} emails`)
            return { id: stream.id, emails }
          } else if (stream.labelId) {
            console.log(`🏷️ Fetching stream ${stream.id} with labelId: "${stream.labelId}"`)
            const emails = await fetchEmailsWithLabelId(stream.labelId)
            console.log(`✅ Stream ${stream.id} returned ${emails.length} emails`)
            return { id: stream.id, emails }
          }
        } catch (error) {
          console.error(`❌ Error loading stream ${stream.id}:`, error)
          return { id: stream.id, emails: [] }
        }
        return { id: stream.id, emails: [] }
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
        'unread (starred-duplicate)': newStreamEmails['starred-duplicate']?.length || 0,
        starred: newStreamEmails.starred?.length || 0,
        'inbox-all': newStreamEmails['inbox-all']?.length || 0,
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
                  {loadTotal > 0 && (
                    <div className="loading-progress-container">
                      <div
                        className="loading-progress-bar"
                        style={{
                          width: `${Math.max(0, Math.min(100, (loadProgress / Math.max(1, loadTotal)) * 100))}%`
                        }}
                      />
                    </div>
                  )}
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
                    onAddToCalendar={handleAddToCalendar}
                    getEventInfo={(id) => eventAnalysis[id]}
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
                  <button className="btn btn-primary btn-lg" onClick={triggerGoogleSignIn}>
                    Sign in with Google
                  </button>
                  {/* Keep AuthButton mounted but hidden to manage GIS + token flow via ref */}
                  <div className="hidden">
                    <AuthButton
                      ref={authRef}
                      hideButton={true}
                      user={user}
                      onLoginSuccess={handleLoginSuccess}
                      onLogout={handleLogout}
                    />
                  </div>
                  <p className="privacy-note">🔒 Private & secure</p>
                </div>
              </div>
            </div>
          </div>
          </>
        )}
      </main>
      <EventConfirmModal
        open={eventModalOpen}
        draft={eventDraft}
        onChange={setEventDraft}
        onClose={() => setEventModalOpen(false)}
        onConfirm={handleConfirmCreateEvent}
        submitting={eventSubmitting}
      />
    </div>
  )
}

export default App
