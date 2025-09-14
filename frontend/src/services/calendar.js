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
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Failed to create calendar event')
  }
  return res.json()
}
