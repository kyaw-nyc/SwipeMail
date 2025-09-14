export async function createCalendarEvent(accessToken, { summary, description, start, end, location }) {
  if (!accessToken) throw new Error('No access token for Calendar API')
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ summary, description, start, end, location }),
  })
  if (!res.ok) {
    let msg = 'Failed to create calendar event'
    try {
      const data = await res.json()
      // Common helpful messages from Google APIs
      const apiMsg = data?.error?.message || data?.message || ''
      if (apiMsg) msg = apiMsg
      if (res.status === 403 && /insufficient.*scope/i.test(apiMsg || '')) {
        msg = 'Missing Calendar permission. Please grant access and try again.'
      }
      if (res.status === 401) {
        msg = 'Calendar authorization expired. Please re-authorize and try again.'
      }
    } catch {
      const text = await res.text().catch(() => '')
      if (text) msg = text
    }
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return res.json()
}
