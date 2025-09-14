import { useState, useEffect, useRef } from 'react'
import Cookies from 'js-cookie'
import AuthButton from './components/AuthButton'
import EmailStack from './components/EmailStack'
import FolderBar from './components/FolderBar'
import CustomFolderModal from './components/CustomFolderModal'
import { useCerebrasAnalysis } from './hooks/useCerebrasAnalysis'
import cerebrasApi from './services/cerebrasApi'
import { createCalendarEvent } from './services/calendar'
import EventConfirmModal from './components/EventConfirmModal'
import mlService from './services/mlService'
import './App.css'

// Global cap for how many emails to fetch per load
const MAX_EMAILS_TO_FETCH = 30

function App() {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [emails, setEmails] = useState([])
  const [streamEmails, setStreamEmails] = useState({ unread: [] })
  const [loading, setLoading] = useState(false)
  const [mlLoading, setMlLoading] = useState(false)
  const [streamsLoaded, setStreamsLoaded] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentFolder, setCurrentFolder] = useState('STREAM')
  const [availableFolders, setAvailableFolders] = useState([])
  const [currentStream, setCurrentStream] = useState({
    id: 'unread',
    name: 'Unread Emails',
    description: 'Recent unread emails (chronological)',
    icon: '📬',
    query: 'is:unread'
  })
  // Time range settings per stream
  const [streamTimeRanges, setStreamTimeRanges] = useState({
    unread: {
      id: '1d',
      label: 'Last 24 hours',
      shortLabel: '24h',
      icon: '🕐',
      days: 1
    },
    smart: {
      id: '3d',
      label: 'Last 3 days',
      shortLabel: '3d',
      icon: '🕒',
      days: 3
    }
  })
  const [maxFetchedDays, setMaxFetchedDays] = useState(7) // Track the maximum time range we've fetched
  const [fetchedTimeRange, setFetchedTimeRange] = useState(null) // Track what time range we've actually fetched
  const [allFetchedEmails, setAllFetchedEmails] = useState([]) // Store all fetched emails
  const [atMaximumEmails, setAtMaximumEmails] = useState(false) // Track if we've reached the 10k limit
  const [remainingCount, setRemainingCount] = useState(0)
  const [loadTotal, setLoadTotal] = useState(0)
  const [loadProgress, setLoadProgress] = useState(0)
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [eventDraft, setEventDraft] = useState(null)
  // Master cache for all unread emails (detailed), used to derive time windows quickly
  const [masterUnreadEmails, setMasterUnreadEmails] = useState([])
  // Bump this whenever timeframe changes to force UI reset
  const [timeRangeVersion, setTimeRangeVersion] = useState(0)

  // Helper function to get current time range for the active stream
  const getCurrentTimeRange = () => {
    if (currentFolder === 'STREAM' && currentStream?.id) {
      return streamTimeRanges[currentStream.id] || streamTimeRanges.unread
    }
    // For AI folders, use a default time range
    return streamTimeRanges.unread
  }
  const [eventSubmitting, setEventSubmitting] = useState(false)

  // Custom folder state
  const [customFolders, setCustomFolders] = useState([])
  const [customFolderModalOpen, setCustomFolderModalOpen] = useState(false)

  // Initialize Cerebras analysis hook
  const { analyzeEmail, isAnalyzing } = useCerebrasAnalysis()
  const [eventAnalysis, setEventAnalysis] = useState({}) // id -> { loading, result, error }

  // Request cancellation for folder/stream switching
  const currentRequestRef = useRef(null)

  // Stream state preservation when switching to folders
  const [previousStreamState, setPreviousStreamState] = useState({
    streamId: null,
    emails: [],
    folder: null // which folder it was on when we saved the state
  })

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
    // Load custom folders from localStorage
    const storedFolders = localStorage.getItem('swipemail_custom_folders')
    if (storedFolders) {
      try {
        const parsedFolders = JSON.parse(storedFolders)
        setCustomFolders(parsedFolders)
        console.log('Loaded custom folders:', parsedFolders)
      } catch (e) {
        console.error('Failed to load custom folders:', e)
      }
    }

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
      // Only block strong horizontal gestures that dominate over vertical scroll
      const isHorizontalDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 30
      if (!isHorizontalDominant) return

      // Allow scroll inside email cards (they handle their own gestures)
      const onEmailCard = !!e.target.closest('.swipeable-email-card')
      if (onEmailCard) return

      e.preventDefault()
      e.stopPropagation()
      return false
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
      if (!target && e.touches.length === 1 && window.touchStartX != null) {
        const touch = e.touches[0]
        const deltaX = touch.clientX - window.touchStartX
        // Only block intentional horizontal swipes
        if (Math.abs(deltaX) > 30) {
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
    // Reset timeframe to default (past 24h) on new login
    setStreamTimeRanges((prev) => ({
      ...prev,
      unread: { id: '1d', label: 'Last 24 hours', shortLabel: '24h', icon: '🕐', days: 1 },
    }))

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

  // Handle custom folder creation
  const handleCreateCustomFolder = async (folderData) => {
    try {
      // Create the Gmail label
      const labelName = `SwipeMail/${folderData.name}`
      const labelId = await createLabelIfNotExists(labelName)

      if (labelId) {
        // Add to custom folders state
        const newFolder = {
          ...folderData,
          labelId,
          labelName
        }
        setCustomFolders(prev => [...prev, newFolder])

        // Store in localStorage for persistence
        const updatedFolders = [...customFolders, newFolder]
        localStorage.setItem('swipemail_custom_folders', JSON.stringify(updatedFolders))

        console.log(`✅ Created custom folder: ${labelName}`)

        // Refresh folders list to show the new folder
        fetchFolders()
      }
    } catch (error) {
      console.error('Error creating custom folder:', error)
      alert('Failed to create custom folder. Please try again.')
    }
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
      // Capture source text to detect if year was present in the email
      const rawBody = (email.body && typeof email.body === 'string' ? email.body.replace(/<[^>]+>/g, ' ') : email.snippet || '')
      const sourceHasYear = /\b\d{4}\b/.test(`${email.subject || ''} ${email.from || ''} ${rawBody}`)
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
        // Normalize common noise and ordinal suffixes
        str = str
          .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1') // 1st -> 1
          .replace(/\s+at\s+/i, ' ') // "Oct 1 at 3pm" -> "Oct 1 3pm"
          .replace(/,@?\s*/g, ', ') // normalize commas

        // If ISO date-only (yyyy-mm-dd), assume 9am local
        const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/
        if (isoDateOnly.test(str)) {
          return new Date(`${str}T09:00:00`)
        }

        // MM/DD[/(YYYY)] [time]
        let m = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(.+))?$/)
        if (m) {
          const mm = String(m[1]).padStart(2, '0')
          const dd = String(m[2]).padStart(2, '0')
          let yyyy = m[3]
          const tail = (m[4] || '').trim()
          if (!yyyy) yyyy = String(DEFAULT_YEAR)
          else if (yyyy.length === 2) yyyy = `20${yyyy}`
          const base = `${yyyy}-${mm}-${dd}`
          if (tail) {
            const d = new Date(`${base} ${tail}`)
            if (!isNaN(d.getTime())) return d
          }
          return new Date(`${base}T09:00:00`)
        }

        // MM-DD[[-]YYYY] [time]
        m = str.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?(?:\s+(.+))?$/)
        if (m) {
          const mm = String(m[1]).padStart(2, '0')
          const dd = String(m[2]).padStart(2, '0')
          let yyyy = m[3]
          const tail = (m[4] || '').trim()
          if (!yyyy) yyyy = String(DEFAULT_YEAR)
          else if (yyyy.length === 2) yyyy = `20${yyyy}`
          const base = `${yyyy}-${mm}-${dd}`
          if (tail) {
            const d = new Date(`${base} ${tail}`)
            if (!isNaN(d.getTime())) return d
          }
          return new Date(`${base}T09:00:00`)
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

        // If no 4-digit year present, append default year and try parse
        if (!/\b\d{4}\b/.test(str)) {
          const withDefaultYear = new Date(`${str} ${DEFAULT_YEAR}`)
          if (!isNaN(withDefaultYear.getTime())) return withDefaultYear
        }

        // Fallback: try native parse (for fully specified strings)
        const d = new Date(str)
        return isNaN(d.getTime()) ? null : d
      }
      let startDt = parseToDateTime(result?.start_time) || new Date()
      let endDt = parseToDateTime(result?.end_time) || new Date(startDt.getTime() + 60 * 60 * 1000)

      // If the source email text had no explicit year but the AI injected a different year (e.g., 2023), force default
      const DEFAULT_YEAR = 2025
      if (!sourceHasYear) {
        if (startDt && startDt.getFullYear() !== DEFAULT_YEAR) {
          startDt = new Date(DEFAULT_YEAR, startDt.getMonth(), startDt.getDate(), startDt.getHours(), startDt.getMinutes(), startDt.getSeconds(), startDt.getMilliseconds())
        }
        if (endDt && endDt.getFullYear() !== DEFAULT_YEAR) {
          endDt = new Date(DEFAULT_YEAR, endDt.getMonth(), endDt.getDate(), endDt.getHours(), endDt.getMinutes(), endDt.getSeconds(), endDt.getMilliseconds())
        }
      }
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

  const ensureCalendarToken = (hintEmail, forceConsent = false) => new Promise((resolve) => {
    try {
      if (!window.google?.accounts?.oauth2) return resolve(accessToken)

      const requestToken = (prompt) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/calendar.events',
          include_granted_scopes: true,
          prompt,
          hint: hintEmail || undefined,
          callback: (tokenResponse) => {
            if (tokenResponse?.access_token) return resolve(tokenResponse.access_token)
            // Fall back to app token if we didn't get one
            resolve(accessToken)
          },
          error_callback: () => {
            // On error, if we haven't prompted yet, try consent once
            if (!forceConsent && prompt !== 'consent') {
              requestToken('consent')
            } else {
              resolve(accessToken)
            }
          },
        })
        client.requestAccessToken()
      }

      // Try silent first, then consent if requested or if silent fails
      if (forceConsent) requestToken('consent')
      else requestToken('')
    } catch {
      resolve(accessToken)
    }
  })

  const handleConfirmCreateEvent = async (draft) => {
    try {
      setEventSubmitting(true)
      // Try with existing/silent token first
      let calToken = await ensureCalendarToken(user?.email)
      let created
      try {
        created = await createCalendarEvent(calToken, draft)
      } catch (err) {
        // If insufficient scope or auth error, force a consent prompt and retry once
        if (err?.status === 401 || err?.status === 403) {
          calToken = await ensureCalendarToken(user?.email, true)
          created = await createCalendarEvent(calToken, draft)
        } else {
          throw err
        }
      }
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

  const handleStreamChange = async (stream) => {
    console.log('Stream changed to:', stream.name)

    // Check if we have saved state for this stream and can restore it
    if (previousStreamState.streamId === stream.id && previousStreamState.emails.length > 0) {
      console.log(`🔄 Restoring saved stream state instead of reloading: ${stream.id} with ${previousStreamState.emails.length} emails`)
      setCurrentStream(stream)
      setCurrentFolder('STREAM')
      setEmails(previousStreamState.emails)
      setAllFetchedEmails(previousStreamState.emails)

      // Clear the saved state since we've restored it
      setPreviousStreamState({
        streamId: null,
        emails: [],
        folder: null
      })
      return // Don't reload, just restore
    }

    // Clear saved stream state if switching to a different stream
    if (previousStreamState.streamId && previousStreamState.streamId !== stream.id) {
      console.log(`🗑️ Clearing saved state for different stream (was: ${previousStreamState.streamId}, now: ${stream.id})`)
      setPreviousStreamState({
        streamId: null,
        emails: [],
        folder: null
      })
    }

    setCurrentStream(stream)
    setCurrentFolder('STREAM')
    // Load this stream individually with its timeframe
    const days = (streamTimeRanges[stream.id] || streamTimeRanges.unread).days
    setStreamsLoaded(false)
    await (async () => {
      try {
        if (stream.id === 'unread') {
          const master = masterUnreadEmails.length ? masterUnreadEmails : await loadMasterUnread()
          const next = filterEmailsByTimeRange(master, days)
          setStreamEmails((prev) => ({ ...prev, unread: next }))

          // Preserve current emails if we're switching back to the same stream
          const currentIsFromSameStream = currentFolder === 'STREAM' && currentStream?.id === stream.id
          if (!currentIsFromSameStream) {
            console.log('🔄 Loading fresh emails for stream switch')
            setEmails(next)
            setAllFetchedEmails(next)
          } else {
            console.log('📌 Preserving current swiped state for same stream')
            setAllFetchedEmails(next)
          }
        } else if (stream.id === 'smart') {
          const master = masterUnreadEmails.length ? masterUnreadEmails : await loadMasterUnread()
          // Use the same time range as unread emails for consistency
          const unreadDays = streamTimeRanges.unread.days
          console.log(`🧠 Smart stream: master has ${master.length} emails, using unread timeframe ${unreadDays} days instead of smart default ${days} days`)
          const timeFiltered = filterEmailsByTimeRange(master, unreadDays)
          console.log(`🧠 Smart stream: time filtering result: ${timeFiltered.length} emails`)
          const smartRanked = await applyMLRanking(timeFiltered, 'smart')
          console.log(`🧠 Smart stream: ranked emails with scores:`, smartRanked.map(e => ({ id: e.id, subject: e.subject?.substring(0,30), score: e._preferenceScorePercent })))
          setStreamEmails((prev) => ({ ...prev, smart: smartRanked }))

          // Preserve current emails if we're switching back to the same stream
          const currentIsFromSameStream = currentFolder === 'STREAM' && currentStream?.id === stream.id
          if (!currentIsFromSameStream) {
            console.log('🔄 Loading fresh emails for smart stream switch')
            setEmails(smartRanked)
            setAllFetchedEmails(smartRanked)
          } else {
            console.log('📌 Preserving current swiped state for same smart stream')
            setAllFetchedEmails(smartRanked)
          }
        } else if (stream.id === 'inbox-all') {
          const next = await fetchEmailsWithLabelId('INBOX', days)
          setStreamEmails((prev) => ({ ...prev, ['inbox-all']: next }))

          // Same preservation logic for inbox-all stream
          const currentIsFromSameStream = currentFolder === 'STREAM' && currentStream?.id === stream.id
          if (!currentIsFromSameStream) {
            console.log('🔄 Loading fresh emails for stream switch')
            setEmails(next)
            setAllFetchedEmails(next)
          } else {
            console.log('📌 Preserving current swiped state for same stream')
            setAllFetchedEmails(next)
          }
        }
      } catch (e) {
        console.error('Failed to switch stream', e)
        setEmails([])
      }
    })()
    setStreamsLoaded(true)
  }

  const handleTimeRangeChange = async (timeRange) => {
    console.log('Time range changed to:', timeRange.label)
    setTimeRangeVersion((v) => v + 1)

    // Update the time range for the current stream
    if (currentFolder === 'STREAM' && currentStream?.id) {
      setStreamTimeRanges(prev => ({
        ...prev,
        [currentStream.id]: timeRange
      }))
    }

    const newDays = timeRange.days
    const currentFetchedDays = fetchedTimeRange?.days

    // Determine if we need to fetch new data
    // Need to fetch if:
    // 1. Requesting "All time" and we haven't fetched all
    // 2. Requesting more days than we've fetched
    // 3. We haven't fetched anything yet
    const needsRefetch = !fetchedTimeRange ||
                         (!newDays && currentFetchedDays) || // All time requested but we have limited data
                         (newDays && currentFetchedDays && newDays > currentFetchedDays) // Expanding range

    if (needsRefetch) {
      console.log(`🔄 Fetching emails for ${timeRange.label} (expanding from ${fetchedTimeRange?.label || 'none'})`)

      // Only fetch for the specific time range requested
      setLoading(true)
      try {
        if (currentFolder === 'STREAM' && currentStream?.id === 'unread') {
          const emails = await fetchEmailsWithQuery('is:unread', newDays)
          const rankedEmails = await applyMLRanking(emails, 'unread')
          setMasterUnreadEmails(rankedEmails) // Update master cache
          setStreamEmails(prev => ({ ...prev, unread: rankedEmails }))
          setEmails(rankedEmails)
          setAllFetchedEmails(rankedEmails)
          setFetchedTimeRange(timeRange) // Update what we've fetched
          setMaxFetchedDays(newDays || Infinity)
        } else if (currentFolder === 'STREAM') {
          await loadAllStreams(newDays)
          setFetchedTimeRange(timeRange)
          setMaxFetchedDays(newDays || Infinity)
        } else {
          await fetchEmails(currentFolder, newDays)
          setFetchedTimeRange(timeRange)
          setMaxFetchedDays(newDays || Infinity)
        }
      } finally {
        setLoading(false)
        setStreamsLoaded(true)
      }
    } else {
      console.log(`📋 Filtering cached emails for ${timeRange.label} (using cached ${fetchedTimeRange?.label || 'data'})`)

      // Just filter existing emails since we have a wider range cached
      if (currentFolder === 'STREAM') {
        if (currentStream?.id === 'unread') {
          const source = masterUnreadEmails.length ? masterUnreadEmails : allFetchedEmails
          console.log(`🔍 Filtering ${source.length} cached emails to ${newDays || 'all'} days`)
          const filtered = filterEmailsByTimeRange(source, newDays)
          console.log(`📊 Filtered to ${filtered.length} emails within time range`)
          const rankedFiltered = await applyMLRanking(filtered, 'unread')
          setEmails(rankedFiltered)
          setStreamEmails(prev => ({ ...prev, unread: rankedFiltered }))
        } else if (currentStream?.id === 'smart') {
          const source = masterUnreadEmails.length ? masterUnreadEmails : allFetchedEmails
          const filtered = filterEmailsByTimeRange(source, newDays)
          const smartRanked = await applyMLRanking(filtered, 'smart')
          setEmails(smartRanked)
          setStreamEmails(prev => ({ ...prev, smart: smartRanked }))
        }
      } else {
        const filtered = filterEmailsByTimeRange(allFetchedEmails, newDays)
        setEmails(filtered)
      }
    }
  }

  // Helper function to build query with time range
  const buildQueryWithTimeRange = (baseQuery, daysOverride) => {
    const days = daysOverride ?? getCurrentTimeRange().days
    if (!days) {
      // "All time" - no date restriction
      return baseQuery
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    cutoffDate.setHours(0, 0, 0, 0) // Start of day for consistent filtering

    // Format date as YYYY/MM/DD for Gmail query
    const year = cutoffDate.getFullYear()
    const month = String(cutoffDate.getMonth() + 1).padStart(2, '0')
    const day = String(cutoffDate.getDate()).padStart(2, '0')
    const dateStr = `${year}/${month}/${day}`

    const query = `${baseQuery} after:${dateStr}`
    console.log(`🕒 Time filter: ${days} days ago (${cutoffDate.toISOString()}) = date ${dateStr}`)
    console.log(`📋 Final query: "${query}"`)
    return query
  }

  // Helper function to filter emails by time range
  const filterEmailsByTimeRange = (emails, days) => {
    if (!days) return emails // "All time"

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    return emails.filter(email => {
      // Prefer Gmail internalDate (ms since epoch)
      if (email.internalDate) {
        const emailDate = new Date(Number(email.internalDate))
        return emailDate >= cutoffDate
      }
      // Fallback to Date header if available
      if (email.date) {
        const d = new Date(email.date)
        if (!isNaN(d.getTime())) return d >= cutoffDate
      }
      // If no date info, exclude to avoid stale items lingering
      return false
    })
  }

  // Paginated fetch for Gmail message ids for a query
  const fetchAllMessageIdsByQuery = async (q, max = MAX_EMAILS_TO_FETCH) => {
    const results = []
    let pageToken = undefined
    while (results.length < max) {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
      if (q) url.searchParams.set('q', q)
      url.searchParams.set('maxResults', String(Math.min(100, max - results.length)))
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (!res.ok) throw new Error(`Gmail API error: ${res.status} ${res.statusText}`)
      const data = await res.json()
      if (Array.isArray(data.messages)) results.push(...data.messages)
      pageToken = data.nextPageToken
      if (!pageToken) break
    }
    return results
  }

  // Load or refresh master unread cache (all unread emails, not time-limited)
  const loadMasterUnread = async () => {
    if (!accessToken) return []
    setLoading(true)
    try {
      console.log('📥 Loading master unread cache (all unread emails)...')
      const ids = await fetchAllMessageIdsByQuery('in:inbox is:unread', MAX_EMAILS_TO_FETCH)
      if (!ids.length) {
        setMasterUnreadEmails([])
        return []
      }
      const detailed = await processEmailDetails(ids)
      setMasterUnreadEmails(detailed)
      console.log(`✅ Master unread cache loaded: ${detailed.length} emails`)
      return detailed
    } catch (e) {
      console.error('Failed to load master unread cache:', e)
      return []
    } finally {
      setLoading(false)
    }
  }

  // Load a single stream using its timeframe
  const loadStream = async (streamId, daysOverride) => {
    const days = daysOverride ?? (streamTimeRanges[streamId]?.days ?? getCurrentTimeRange()?.days)
    setStreamLoading(true)
    setLoading(true)
    try {
      if (streamId === 'unread') {
        // Prefer master cache; if empty, fall back to direct fetch by timeframe
        let base = masterUnreadEmails
        if (!base.length) {
          const loaded = await loadMasterUnread()
          base = loaded
        }
        let emailsForRange = filterEmailsByTimeRange(base, days)
        if (!emailsForRange.length) {
          console.log('ℹ️ Master unread cache returned no emails for this timeframe; falling back to direct fetch')
          emailsForRange = await fetchEmailsWithQuery('is:unread', days)
        }
        setStreamEmails((prev) => ({ ...prev, unread: emailsForRange }))
        setEmails(emailsForRange)
        setAllFetchedEmails(emailsForRange)
      } else if (streamId === 'smart') {
        let base = masterUnreadEmails
        if (!base.length) {
          const loaded = await loadMasterUnread()
          base = loaded
        }
        let emailsForRange = filterEmailsByTimeRange(base, days)
        if (!emailsForRange.length) {
          console.log('ℹ️ Master unread cache returned no emails for this timeframe; falling back to direct fetch')
          emailsForRange = await fetchEmailsWithQuery('is:unread', days)
        }
        // Apply ML ranking for smart stream
        const smartRanked = await applyMLRanking(emailsForRange, 'smart')
        setStreamEmails((prev) => ({ ...prev, smart: smartRanked }))
        setEmails(smartRanked)
        setAllFetchedEmails(smartRanked)
      } else if (streamId === 'inbox-all') {
        const emailsForRange = await fetchEmailsWithLabelId('INBOX', days)
        setStreamEmails((prev) => ({ ...prev, ['inbox-all']: emailsForRange }))
        setEmails(emailsForRange)
        setAllFetchedEmails(emailsForRange)
      }
    } catch (e) {
      console.error('Failed to load stream', streamId, e)
      setEmails([])
    } finally {
      setLoading(false)
      setStreamLoading(false)
    }
  }

  // Function to clean and sanitize text content
  const cleanTextContent = (text) => {
    if (!text) return text

    return text
      // First decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '...')
      // Decode numeric HTML entities
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))

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
              const essentialSystemLabels = ['INBOX']
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

  // Debug function to fetch without time filtering
  const fetchEmailsWithQueryNoTimeFilter = async (query) => {
    try {
      if (!accessToken) {
        console.log('No access token available. User needs to sign in with Gmail permissions.')
        return []
      }

      console.log(`📧 Fetching emails with query (NO TIME FILTER): "${query}"`)
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_EMAILS_TO_FETCH}&q=${encodeURIComponent(query)}`
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

      // Check if we've reached the maximum
      if (data.messages.length === 10000) {
        console.log(`🚨 MAXIMUM REACHED: Fetched 10,000 emails (the maximum allowed)`)
        setAtMaximumEmails(true)
      } else {
        setAtMaximumEmails(false)
      }

      // Fetch details for each message (reuse existing email processing logic)
      const result = await processEmailDetails(data.messages)
      console.log(`🎯 Processed ${result.length} emails for query "${query}"`)
      return result
    } catch (error) {
      console.error('Error fetching emails:', error)
      return []
    }
  }

  const fetchEmailsWithQuery = async (query, daysOverride) => {
    try {
      if (!accessToken) {
        console.log('No access token available. User needs to sign in with Gmail permissions.')
        return []
      }

      const queryWithTimeRange = buildQueryWithTimeRange(query, daysOverride)
      console.log(`📧 Fetching emails with query (paginated): "${queryWithTimeRange}"`)
      const ids = await fetchAllMessageIdsByQuery(queryWithTimeRange, MAX_EMAILS_TO_FETCH)
      if (!ids.length) return []
      const result = await processEmailDetails(ids)
      console.log(`🎯 Processed ${result.length} emails for query "${query}"`)
      return result
    } catch (error) {
      console.error(`❌ Error fetching emails for query "${query}":`, error)
      return []
    }
  }

  const fetchEmailsWithLabelId = async (labelId, daysOverride, abortSignal = null) => {
    try {
      if (!accessToken) {
        console.log('No access token available. User needs to sign in with Gmail permissions.')
        return []
      }

      console.log(`🏷️ Fetching emails with labelId: "${labelId}" and daysOverride: ${daysOverride}`)

      // Use Gmail API messages endpoint with labelIds parameter
      const results = []
      let pageToken = undefined
      const maxResults = MAX_EMAILS_TO_FETCH

      while (results.length < maxResults) {
        const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
        url.searchParams.set('labelIds', labelId)
        url.searchParams.set('maxResults', String(Math.min(100, maxResults - results.length)))
        if (pageToken) url.searchParams.set('pageToken', pageToken)

        console.log(`📧 Gmail API URL: ${url.toString()}`)
        const fetchOptions = {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
        if (abortSignal) {
          fetchOptions.signal = abortSignal
        }
        const res = await fetch(url.toString(), fetchOptions)
        if (!res.ok) throw new Error(`Gmail API error: ${res.status} ${res.statusText}`)
        const data = await res.json()
        if (Array.isArray(data.messages)) results.push(...data.messages)
        pageToken = data.nextPageToken
        if (!pageToken) break
      }

      if (!results.length) {
        console.log(`No messages found for labelId: ${labelId}`)
        return []
      }

      // Apply time range filtering on the results if needed
      // For folders, daysOverride should be null to get ALL emails
      const days = daysOverride
      let filteredIds = results

      if (days) {
        // For time filtering, we need to get message details and filter by date
        // This is less efficient but necessary for accurate time-based filtering
        console.log(`Applying ${days}-day time filter to ${results.length} messages...`)
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        cutoffDate.setHours(0, 0, 0, 0)

        // Get basic message info to check dates
        const timeFilteredIds = []
        for (const msg of results) {
          try {
            const msgFetchOptions = {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
            if (abortSignal) {
              msgFetchOptions.signal = abortSignal
            }
            const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=minimal`, msgFetchOptions)
            if (msgRes.ok) {
              const msgData = await msgRes.json()
              const messageDate = new Date(parseInt(msgData.internalDate))
              if (messageDate >= cutoffDate) {
                timeFilteredIds.push(msg)
              }
            }
          } catch (e) {
            console.warn(`Failed to check date for message ${msg.id}:`, e)
            // Include in results if we can't check date
            timeFilteredIds.push(msg)
          }
        }
        filteredIds = timeFilteredIds
        console.log(`Filtered to ${filteredIds.length} messages within ${days} days`)
      }

      if (!filteredIds.length) return []

      const result = await processEmailDetails(filteredIds)
      console.log(`🎯 Processed ${result.length} emails for labelId "${labelId}"`)
      return result
    } catch (error) {
      console.error(`❌ Error fetching emails for labelId "${labelId}":`, error)
      return []
    }
  }

  const processEmailDetails = async (messages) => {
    // Fetch details for each message with rate limiting
    setLoadTotal(messages.length || 0)
    setLoadProgress(0)

    // Process in smaller batches to avoid rate limits
    const BATCH_SIZE = 10
    const DELAY_BETWEEN_BATCHES = 1000 // 1 second delay between batches
    const emailsData = []

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)

      const batchPromises = batch.map(async (message) => {
        try {
          const emailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (!emailResponse.ok) {
            if (emailResponse.status === 429) {
              console.warn(`Rate limited for message ${message.id}, skipping...`)
              return null
            }
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

      const batchResults = await Promise.all(batchPromises)
      emailsData.push(...batchResults)

      // Add delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < messages.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
      }
    }

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
            internalDate: email.internalDate ? Number(email.internalDate) : undefined,
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

  const loadAllStreams = async (daysOverride) => {
    if (!accessToken) return

    setLoading(true)
    console.log('Loading all streams...')

    try {
      const streams = [
        { id: 'unread', query: 'is:unread' },
        { id: 'smart', query: 'is:unread', mlPowered: true }
      ]

      // Fetch all streams in parallel
      const streamPromises = streams.map(async (stream) => {
        try {
          if (stream.id === 'unread') {
            const master = masterUnreadEmails.length ? masterUnreadEmails : await loadMasterUnread()
            // Derive window from master for display
            const days = daysOverride ?? getCurrentTimeRange().days
            const emails = filterEmailsByTimeRange(master, days)
            return { id: stream.id, emails }
          } else if (stream.id === 'smart') {
            const master = masterUnreadEmails.length ? masterUnreadEmails : await loadMasterUnread()
            // Derive window from master for display
            const days = daysOverride ?? getCurrentTimeRange().days
            const timeFiltered = filterEmailsByTimeRange(master, days)
            // Apply ML ranking for smart stream
            const smartRanked = await applyMLRanking(timeFiltered, 'smart')
            return { id: stream.id, emails: smartRanked }
          } else if (stream.query) {
            console.log(`🔍 Fetching stream ${stream.id} with query: "${stream.query}"`)
            const emails = await fetchEmailsWithQuery(stream.query, daysOverride)
            console.log(`✅ Stream ${stream.id} returned ${emails.length} emails`)
            return { id: stream.id, emails }
          } else if (stream.labelId) {
            console.log(`🏷️ Fetching stream ${stream.id} with labelId: "${stream.labelId}"`)
            const emails = await fetchEmailsWithLabelId(stream.labelId, daysOverride)
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

      // Set current emails to the current stream with ML ranking
      const currentStreamEmails = newStreamEmails[currentStream.id] || []
      const rankedEmails = await applyMLRanking(currentStreamEmails, currentStream.id)
      setEmails(rankedEmails)
      setAllFetchedEmails(rankedEmails) // Store for filtering

      // Update maxFetchedDays if we fetched with current time range
      const curRange = getCurrentTimeRange()
      if (curRange.days && curRange.days > maxFetchedDays) {
        setMaxFetchedDays(curRange.days)
      }

      console.log('All streams loaded successfully:', {
        unread: newStreamEmails.unread?.length || 0
      })
    } catch (error) {
      console.error('Error loading streams:', error)
    } finally {
      setLoading(false)
    }
  }

  // ML-enhanced email action handlers
  const markAsReadWithML = async (emailId) => {
    // Find the email object to get its data for ML processing
    const email = [...streamEmails.unread, ...emails].find(e => e.id === emailId)

    if (email && currentFolder === 'STREAM') {
      // Process ML feedback for "not interested" action (left swipe in stream)
      try {
        // Extract and display tokens for this email
        if (!email._tokens) {
          email._tokens = await mlService.extractTokens(email)
        }
        console.log(`👎 Not interested in: "${email.subject}"`)
        console.log(`📍 Tags identified: ${email._tokens.join(', ')}`)
        console.log(`🧠 ML learning: These tags will be marked as less preferred`)

        await mlService.processEmailSwipe(email, 'not_interested')

        // If in Smart Recommendations stream, recompute scores after swipe (with delay)
        if (currentStream?.id === 'smart') {
          console.log('🧠 Scheduling Smart Recommendations recompute after left swipe...')
          // Delay the recomputation to avoid interfering with swipe animation
          setTimeout(() => {
            recomputeSmartRecommendations()
          }, 400) // Wait for swipe animation to complete
        }
      } catch (error) {
        console.warn('ML feedback failed but continuing with email action:', error)
      }
    }

    // Call the original function
    return await markAsRead(emailId)
  }

  const analyzeAndSortEmailWithML = async (email) => {
    if (currentFolder === 'STREAM') {
      // Process ML feedback for "interested" action (right swipe in stream)
      try {
        // Extract and display tokens for this email
        if (!email._tokens) {
          email._tokens = await mlService.extractTokens(email)
        }
        console.log(`👍 Interested in: "${email.subject}"`)
        console.log(`📍 Tags identified: ${email._tokens.join(', ')}`)
        console.log(`🧠 ML learning: These tags will be marked as more preferred`)

        await mlService.processEmailSwipe(email, 'interested')

        // If in Smart Recommendations stream, recompute scores after swipe (with delay)
        if (currentStream?.id === 'smart') {
          console.log('🧠 Scheduling Smart Recommendations recompute after right swipe...')
          // Delay the recomputation to avoid interfering with swipe animation
          setTimeout(() => {
            recomputeSmartRecommendations()
          }, 400) // Wait for swipe animation to complete
        }
      } catch (error) {
        console.warn('ML feedback failed but continuing with email action:', error)
      }
    }

    // Call the original function
    return await analyzeAndSortEmail(email)
  }

  // Recompute Smart Recommendations after user preference changes
  const recomputeSmartRecommendations = async () => {
    if (currentFolder === 'STREAM' && currentStream?.id === 'smart') {
      try {
        console.log('🧠 Learning from user preferences, but keeping normal swipe flow...')

        // Just update the ML model in the background - don't disrupt the current swipe flow
        // The updated preferences will be applied the next time the user refreshes Smart Recommendations
        // or switches streams and comes back

        console.log('🧠 ML feedback processed. Updated preferences will apply on next Smart Recommendations refresh.')
      } catch (error) {
        console.warn('Failed to process ML feedback:', error)
      }
    }
  }

  // Enhanced email ranking with ML (only for smart stream)
  const applyMLRanking = async (emailList, streamId = null) => {
    const targetStreamId = streamId || currentStream?.id
    console.log(`🔍 applyMLRanking called with ${emailList.length} emails, currentFolder: ${currentFolder}, targetStream: ${targetStreamId}`)
    try {
      if (currentFolder === 'STREAM') {
        // Set ML loading state for smart stream only
        if (targetStreamId === 'smart') {
          setMlLoading(true)
          console.log(`🧠 Starting ML ranking for ${emailList.length} emails...`)
        } else {
          console.log(`📅 Processing ${emailList.length} emails for ${targetStreamId} stream (recency-based)`)
        }

        // Apply ranking based on stream type
        const streamType = targetStreamId === 'smart' ? 'smart' : 'unread'
        const rankedEmails = await mlService.rankEmails(emailList, streamType)
        console.log(`🧠 Applied ${streamType} ranking - got ${rankedEmails.length} emails with scores:`, rankedEmails.map(e => ({id: e.id, score: e._preferenceScorePercent})))

        // Clear ML loading state
        setMlLoading(false)
        return rankedEmails
      }
      console.log(`🔍 Not applying ranking - not in stream mode`)
      return emailList
    } catch (error) {
      console.warn('ML ranking failed, using original order:', error)
      setMlLoading(false) // Clear loading state on error
      return emailList
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

  const applyLabel = async (emailId, label) => {
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
      console.log('🧠 Analyzing email for advanced AI-powered sorting into folders...')

      // First, check custom folders using Cerebras AI
      const customFoldersToApply = []
      if (customFolders && customFolders.length > 0) {
        console.log(`🔍 Checking against ${customFolders.length} custom folders...`)

        for (const folder of customFolders) {
          try {
            const match = await cerebrasApi.matchEmailToFolder(email, folder)
            if (match && match.matches && match.confidence > 0.7) {
              customFoldersToApply.push({
                folder,
                confidence: match.confidence,
                reason: match.reason
              })
              console.log(`✅ Email matches custom folder "${folder.name}" (confidence: ${match.confidence})`)
            }
          } catch (error) {
            console.warn(`Failed to check custom folder "${folder.name}":`, error)
          }
        }
      }

      // Apply labels for matching custom folders
      for (const match of customFoldersToApply) {
        try {
          const labelId = await createLabelIfNotExists(match.folder.labelName)
          if (labelId) {
            await applyLabel(email.id, labelId)
            console.log(`✅ Sorted email to custom folder: ${match.folder.name} (${match.reason})`)
          }
        } catch (error) {
          console.error(`Failed to apply custom folder label "${match.folder.name}":`, error)
        }
      }

      // Enhanced smart categorization with advanced Cerebras AI analysis
      console.log('🧠 Performing advanced Cerebras AI analysis for intelligent sorting...')
      const analysis = await analyzeEmail(email)

      if (analysis) {
        console.log(`🎯 Advanced AI Analysis Results:`)
        console.log(`   📂 Content Category: ${analysis.contentCategory}`)
        console.log(`   👤 Sender Type: ${analysis.senderType}`)
        console.log(`   🎯 Priority Level: ${analysis.priority}`)
        console.log(`   💬 Engagement Score: ${Math.round(analysis.engagement * 100)}%`)
        console.log(`   🏷️ Key Topics: ${analysis.topics.join(', ')}`)

        const foldersToApply = []

        // TIER 1: Primary categorization based on content type with enhanced naming
        const categoryFolderMap = {
          'work': 'SwipeMail/💼 Professional',
          'personal': 'SwipeMail/👥 Personal',
          'finance': 'SwipeMail/💰 Finance',
          'commerce': 'SwipeMail/🛒 Shopping',
          'education': 'SwipeMail/🎓 Learning',
          'travel': 'SwipeMail/✈️ Travel',
          'health': 'SwipeMail/🏥 Health',
          'news': 'SwipeMail/📰 News',
          'social': 'SwipeMail/🌐 Social',
          'entertainment': 'SwipeMail/🎬 Entertainment',
          'newsletters': 'SwipeMail/📧 Newsletters',
          'notifications': 'SwipeMail/🔔 Notifications',
          'spam': 'SwipeMail/🗑️ Likely Spam',
          'other': 'SwipeMail/📋 Miscellaneous'
        }

        const primaryCategory = analysis.contentCategory || 'other'
        const primaryFolderName = categoryFolderMap[primaryCategory] || `SwipeMail/📋 ${primaryCategory.charAt(0).toUpperCase() + primaryCategory.slice(1)}`
        foldersToApply.push(primaryFolderName)

        // TIER 2: Sender-based smart subfolder creation
        if (analysis.senderType === 'individual') {
          // For individual senders, create more specific subcategories
          if (primaryCategory === 'work') {
            foldersToApply.push('SwipeMail/💼 Professional/👨‍💼 Colleagues')
          } else if (primaryCategory === 'personal') {
            foldersToApply.push('SwipeMail/👥 Personal/👨‍👩‍👧‍👦 Family & Friends')
          } else if (!['personal', 'work'].includes(primaryCategory)) {
            foldersToApply.push('SwipeMail/👥 From People')
          }
        } else if (analysis.senderType === 'organization') {
          // For organizations, create business-focused subcategories
          if (primaryCategory === 'commerce') {
            foldersToApply.push('SwipeMail/🛒 Shopping/🏪 Store Communications')
          } else if (!['newsletters', 'notifications', 'commerce', 'news'].includes(primaryCategory)) {
            foldersToApply.push('SwipeMail/🏢 Organizations')
          }
        }

        // TIER 3: Priority-based smart tagging
        if (analysis.priority === 'high') {
          foldersToApply.push('SwipeMail/🚨 High Priority')
          // Also create priority subcategories
          if (primaryCategory === 'work') {
            foldersToApply.push('SwipeMail/🚨 High Priority/💼 Work Urgent')
          } else if (primaryCategory === 'personal') {
            foldersToApply.push('SwipeMail/🚨 High Priority/👥 Personal Urgent')
          } else if (primaryCategory === 'finance') {
            foldersToApply.push('SwipeMail/🚨 High Priority/💰 Financial Urgent')
          }
        } else if (analysis.priority === 'low') {
          foldersToApply.push('SwipeMail/📊 Low Priority')
        }

        // TIER 4: Engagement-based smart folders
        const engagementPercent = Math.round(analysis.engagement * 100)
        if (engagementPercent >= 80) {
          foldersToApply.push('SwipeMail/🌟 Highly Engaging')
        } else if (engagementPercent <= 20) {
          foldersToApply.push('SwipeMail/😴 Low Engagement')
        }

        // TIER 5: Topic-based smart tagging (for rich categorization)
        if (analysis.topics && analysis.topics.length > 0) {
          const significantTopics = analysis.topics.slice(0, 2) // Take top 2 topics
          for (const topic of significantTopics) {
            if (topic && topic.length > 2) { // Only meaningful topics
              const topicFolder = `SwipeMail/🔖 Topics/${topic.charAt(0).toUpperCase() + topic.slice(1)}`
              foldersToApply.push(topicFolder)
            }
          }
        }

        // TIER 6: ML Preference Integration - Advanced scoring
        if (email._preferenceScorePercent !== undefined) {
          const mlScore = email._preferenceScorePercent
          console.log(`   🧠 ML Preference Score: ${mlScore}%`)

          if (mlScore >= 85) {
            foldersToApply.push('SwipeMail/🎯 AI Favorites/⭐ Top Picks')
            console.log(`🌟 Exceptional ML score - adding to AI Top Picks`)
          } else if (mlScore >= 70) {
            foldersToApply.push('SwipeMail/🎯 AI Favorites')
            console.log(`✨ High ML score - adding to AI Favorites`)
          } else if (mlScore <= 15) {
            foldersToApply.push('SwipeMail/📉 AI Low Interest/🚫 Avoid Similar')
            console.log(`🚫 Very low ML score - flagging to avoid similar`)
          } else if (mlScore <= 30) {
            foldersToApply.push('SwipeMail/📉 AI Low Interest')
            console.log(`📉 Low ML score - adding to AI Low Interest`)
          }
        }

        // TIER 7: Time-sensitive and action-required detection
        const subject = (email.subject || '').toLowerCase()
        const body = (email.body || email.snippet || '').toLowerCase()

        // Look for urgent/time-sensitive keywords
        const urgentKeywords = ['urgent', 'asap', 'immediate', 'deadline', 'expires', 'limited time', 'act now', 'time sensitive']
        const hasUrgentKeywords = urgentKeywords.some(keyword =>
          subject.includes(keyword) || body.includes(keyword)
        )

        if (hasUrgentKeywords || analysis.priority === 'high') {
          foldersToApply.push('SwipeMail/⏰ Time Sensitive')
        }

        // Look for action-required keywords
        const actionKeywords = ['please confirm', 'action required', 'rsvp', 'respond by', 'approval needed', 'review required']
        const needsAction = actionKeywords.some(keyword =>
          subject.includes(keyword) || body.includes(keyword)
        )

        if (needsAction) {
          foldersToApply.push('SwipeMail/✅ Action Required')
        }

        // Apply all determined folders
        const appliedFolders = []
        for (const folderName of foldersToApply) {
          try {
            const labelId = await createLabelIfNotExists(folderName)
            if (labelId) {
              await applyLabel(email.id, labelId)
              appliedFolders.push(folderName)
              console.log(`✅ Sorted email to folder: ${folderName}`)
            }
          } catch (error) {
            console.error(`Failed to apply folder ${folderName}:`, error)
          }
        }

        console.log(`📁 Email intelligently sorted into ${appliedFolders.length} AI-powered folders:`)
        appliedFolders.forEach(folder => console.log(`   📂 ${folder}`))

      } else {
        // Enhanced intelligent fallback logic with better pattern recognition
        console.log('⚠️ AI analysis failed, using enhanced smart heuristic classification')

        const subject = (email.subject || '').toLowerCase()
        const from = (email.from || '').toLowerCase()
        const body = (email.body || email.snippet || '').toLowerCase()

        let primaryFolder = 'SwipeMail/📋 Miscellaneous'
        const fallbackFolders = []

        // Enhanced pattern recognition
        if (subject.includes('meeting') || subject.includes('calendar') || subject.includes('zoom') ||
            subject.includes('teams') || body.includes('join the meeting') || subject.includes('conference call')) {
          primaryFolder = 'SwipeMail/💼 Professional'
          fallbackFolders.push('SwipeMail/📅 Meetings & Events')
        } else if (subject.includes('order') || subject.includes('purchase') || subject.includes('shipping') ||
                   subject.includes('delivery') || from.includes('store') || subject.includes('receipt')) {
          primaryFolder = 'SwipeMail/🛒 Shopping'
          if (subject.includes('shipped') || subject.includes('delivered')) {
            fallbackFolders.push('SwipeMail/📦 Deliveries')
          }
        } else if (subject.includes('newsletter') || subject.includes('digest') || subject.includes('weekly') ||
                   subject.includes('monthly') || from.includes('newsletter') || from.includes('news')) {
          primaryFolder = 'SwipeMail/📧 Newsletters'
        } else if (from.includes('notification') || subject.includes('alert') || subject.includes('reminder') ||
                   subject.includes('update') || from.includes('noreply')) {
          primaryFolder = 'SwipeMail/🔔 Notifications'
        } else if (subject.includes('invoice') || subject.includes('bill') || subject.includes('payment') ||
                   subject.includes('bank') || from.includes('bank') || subject.includes('statement')) {
          primaryFolder = 'SwipeMail/💰 Finance'
        } else if (subject.includes('travel') || subject.includes('flight') || subject.includes('hotel') ||
                   subject.includes('booking') || subject.includes('reservation')) {
          primaryFolder = 'SwipeMail/✈️ Travel'
        } else if (from.includes('facebook') || from.includes('twitter') || from.includes('linkedin') ||
                   from.includes('instagram') || subject.includes('social')) {
          primaryFolder = 'SwipeMail/🌐 Social'
        }

        // Apply primary folder
        const primaryLabelId = await createLabelIfNotExists(primaryFolder)
        if (primaryLabelId) {
          await applyLabel(email.id, primaryLabelId)
          console.log(`✅ Sorted email to folder: ${primaryFolder} (enhanced heuristic)`)
        }

        // Apply any additional fallback folders
        for (const folder of fallbackFolders) {
          const labelId = await createLabelIfNotExists(folder)
          if (labelId) {
            await applyLabel(email.id, labelId)
            console.log(`✅ Additional folder: ${folder}`)
          }
        }
      }

      // Summary log with total count
      const totalCustomFolders = customFoldersToApply.length
      const totalAIFolders = analysis ? 4 : 1 // Estimate based on typical AI analysis
      console.log(`📊 Email sorting complete: ${totalCustomFolders} custom + ${totalAIFolders} AI folders = ${totalCustomFolders + totalAIFolders} total intelligent categorizations`)

    } catch (error) {
      console.error('Error analyzing and sorting email:', error)
      // Fallback to a general folder on error
      const labelId = await createLabelIfNotExists('SwipeMail/📋 Miscellaneous')
      if (labelId) {
        await applyLabel(email.id, labelId)
        console.log('✅ Error fallback: Sorted to SwipeMail/📋 Miscellaneous')
      }
      // Also star the email for manual review
      await applyLabel(email.id, 'STARRED')
      console.log('⭐ Starred email for manual review due to sorting error')
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

  const fetchEmails = async (folderId, daysOverride) => {
    // Cancel any existing request
    if (currentRequestRef.current) {
      console.log('🚫 Cancelling previous fetch request')
      currentRequestRef.current.abort()
    }

    // Create new abort controller for this request
    const abortController = new AbortController()
    currentRequestRef.current = abortController

    console.log('🔄 Setting loading to TRUE for folder:', folderId)
    setLoading(true)
    try {
      if (!accessToken) {
        console.log('No access token available. User needs to sign in with Gmail permissions.')
        setEmails([])
        return
      }

      console.log(`Fetching emails from Gmail API for folder: ${folderId}...`)

      if (folderId === 'STREAM') {
        // Always load the current stream explicitly
        setStreamsLoaded(false)
        await loadStream(currentStream.id, daysOverride)
        setStreamsLoaded(true)
        setLoading(false)
        return
      }

      // For SwipeMail AI folders (custom labels) - get ALL emails (no time filtering for folders)
      console.log(`📁 Fetching folder ${folderId} - calling fetchEmailsWithLabelId with null time filter`)
      const formattedEmails = await fetchEmailsWithLabelId(folderId, null, abortController.signal)
      console.log(`📁 Loaded ${formattedEmails.length} folder emails without time filtering (folders show all emails)`)

      console.log(`Successfully loaded ${formattedEmails.length} emails`)
      setEmails(formattedEmails)
      setAllFetchedEmails(formattedEmails) // Store all fetched emails for filtering

      // Update maxFetchedDays if we fetched with current time range
      const curRange2 = getCurrentTimeRange()
      if (curRange2.days && curRange2.days > maxFetchedDays) {
        setMaxFetchedDays(curRange2.days)
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('📦 Fetch request was cancelled')
        return // Don't update state or show error for cancelled requests
      }
      console.error('Error fetching emails:', error)
    } finally {
      // Clear the current request reference
      if (currentRequestRef.current === abortController) {
        currentRequestRef.current = null
      }
      console.log('✅ Setting loading to FALSE for folder:', folderId)
      setLoading(false)
    }
  }

  const handleFolderChange = (folderId, daysOverride) => {
    console.log(`🔄 handleFolderChange called with folderId: ${folderId}`)
    console.log(`📂 Available folders:`, availableFolders)
    console.log(`🏷️ Custom folders:`, customFolders)

    // Save current stream state when navigating away from stream
    if (currentFolder === 'STREAM' && folderId !== 'STREAM' && emails.length > 0) {
      console.log(`💾 Saving stream state: ${currentStream?.id} with ${emails.length} emails`)
      setPreviousStreamState({
        streamId: currentStream?.id,
        emails: [...emails], // Create a copy of current emails
        folder: 'STREAM'
      })
      // Clear current stream when navigating to a folder
      setCurrentStream(null)
    }

    // Note: Stream state restoration is now handled by handleStreamChange

    setCurrentFolder(folderId)
    setEmails([])

    // For folders, ignore time range - always fetch all emails
    // For streams, use the time range override
    const timeRangeToUse = folderId === 'STREAM' ? daysOverride : null
    fetchEmails(folderId, timeRangeToUse)
  }

  useEffect(() => {
    if (user && accessToken) {
      fetchFolders()
      setStreamsLoaded(false)
      ;(async () => {
        try {
          // Fast path on first load: fetch unread directly for current timeframe (defaults to 24h)
          const initialTimeRange = getCurrentTimeRange()
          const days = initialTimeRange?.days ?? 1
          const initialUnread = await fetchEmailsWithQuery('is:unread', days)
          setStreamEmails({ unread: initialUnread })
          setEmails(initialUnread)
          setAllFetchedEmails(initialUnread)
          setMasterUnreadEmails(initialUnread) // Set as master cache
          setFetchedTimeRange(initialTimeRange) // Track what we've fetched
          setMaxFetchedDays(days)
        } catch (e) {
          console.error('Initial unread load failed:', e)
          setEmails([])
        } finally {
          setStreamsLoaded(true)
        }
      })()
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
              currentTimeRange={getCurrentTimeRange()}
              onTimeRangeChange={handleTimeRangeChange}
              onAddFolder={() => setCustomFolderModalOpen(true)}
            />
            <div className="email-section">
              {loading || mlLoading ? (
                <div className="loading">
                  <p>{
                    mlLoading && currentFolder === 'STREAM' && currentStream?.id === 'smart'
                      ? '🧠 AI analyzing and ranking emails by your preferences...'
                      : currentFolder === 'STREAM'
                      ? `Loading ${currentStream?.name || 'stream'}...`
                      : (() => {
                          const folder = availableFolders.find(f => f.id === currentFolder)
                          const folderName = folder ? folder.name.replace('SwipeMail/', '') : 'folder'
                          return `📁 Loading ${folderName} emails...`
                        })()
                  }</p>
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
                      {currentFolder === 'STREAM'
                        ? `${remainingCount} remaining`
                        : `${remainingCount} of ${emails.length}`
                      }
                      {atMaximumEmails && (
                        <span className="maximum-indicator">
                          📊 Maximum (10,000 emails)
                        </span>
                      )}
                    </div>
                  </div>
                  <EmailStack
                    key={`stack-${currentFolder}-${currentStream?.id || 'none'}-${(getCurrentTimeRange()?.id) || 'all'}-v${timeRangeVersion}`}
                    emails={emails}
                    currentFolder={currentFolder}
                    onMarkRead={markAsReadWithML}
                    onApplyLabel={applyLabel}
                    onAnalyzeAndSort={analyzeAndSortEmailWithML}
                    onFlagIncorrect={flagIncorrectSorting}
                    onRemainingCountChange={setRemainingCount}
                    onAddToCalendar={handleAddToCalendar}
                    getEventInfo={(id) => eventAnalysis[id]}
                    showMLScores={currentFolder === 'STREAM' && currentStream?.id === 'smart'}
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
      <CustomFolderModal
        isOpen={customFolderModalOpen}
        onClose={() => setCustomFolderModalOpen(false)}
        onCreateFolder={handleCreateCustomFolder}
        existingFolders={availableFolders}
      />
    </div>
  )
}

export default App
