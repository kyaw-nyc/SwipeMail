import { useEffect, useState } from 'react'

function toLocalInput(dtIso) {
  if (!dtIso) return ''
  const d = new Date(dtIso)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

export default function EventConfirmModal({ open, draft, onChange, onClose, onConfirm, submitting }) {
  const [localDraft, setLocalDraft] = useState(draft || {})

  useEffect(() => {
    setLocalDraft(draft || {})
  }, [draft])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Confirm Calendar Event</h3>
        </div>
        <div className="modal-body">
          <label className="modal-field">
            <span>Title</span>
            <input
              type="text"
              value={localDraft.summary || ''}
              onChange={(e) => {
                const v = { ...localDraft, summary: e.target.value }
                setLocalDraft(v)
                onChange?.(v)
              }}
            />
          </label>
          <div className="modal-row">
            <label className="modal-field">
              <span>Start</span>
              <input
                type="datetime-local"
                value={toLocalInput(localDraft.start?.dateTime) || ''}
                onChange={(e) => {
                  const dt = new Date(e.target.value)
                  const v = { ...localDraft, start: { dateTime: dt.toISOString() } }
                  setLocalDraft(v)
                  onChange?.(v)
                }}
              />
            </label>
            <label className="modal-field">
              <span>End</span>
              <input
                type="datetime-local"
                value={toLocalInput(localDraft.end?.dateTime) || ''}
                onChange={(e) => {
                  const dt = new Date(e.target.value)
                  const v = { ...localDraft, end: { dateTime: dt.toISOString() } }
                  setLocalDraft(v)
                  onChange?.(v)
                }}
              />
            </label>
          </div>
          <label className="modal-field">
            <span>Location</span>
            <input
              type="text"
              value={localDraft.location || ''}
              onChange={(e) => {
                const v = { ...localDraft, location: e.target.value }
                setLocalDraft(v)
                onChange?.(v)
              }}
            />
          </label>
          <label className="modal-field">
            <span>Description</span>
            <textarea
              rows={4}
              value={localDraft.description || ''}
              onChange={(e) => {
                const v = { ...localDraft, description: e.target.value }
                setLocalDraft(v)
                onChange?.(v)
              }}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm?.(localDraft)} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

