import { useEffect, useLayoutEffect, useState } from 'react'
import { API_BASE } from '../apiBase'
import CheckIcon from './icons/CheckIcon'
import PlusIcon from './icons/PlusIcon'
import XIcon from './icons/XIcon'

const COLUMNS = 2
const ROWS = 3

// Row 1 (2 cells) is always visible. Row 2 only appears once both of row
// 1's cells are filled, and row 3 only once row 2 is also fully filled —
// same "always exactly one step ahead, no gaps" idea as Edit Plan's day-
// reorder blueprint, just at row granularity instead of per-cell.
function visibleRowCount(slots) {
  let rows = 1
  for (let row = 0; row < ROWS - 1; row++) {
    const isRowFull = Array.from({ length: COLUMNS }, (_, col) => row * COLUMNS + col).every((i) => slots[i])
    if (!isRowFull) break
    rows = row + 2
  }
  return rows
}

// One cell of the 3x2 grid — three states: empty (+ button), editing (paste
// input), filled (artwork + title). "spotify" is hardcoded as the provider
// sent to the resolve endpoint since it's the only one that exists, but
// nothing about this component's own shape assumes Spotify specifically —
// swapping in a provider picker later wouldn't change this file's structure.
function MusicLinkSlot({ slotIndex, slot, userId, removeMode, onSaved, onCleared }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function startEditing() {
    setDraft('')
    setError('')
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError('')
  }

  async function handleSubmit() {
    const url = draft.trim()
    if (!url || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/music-links/${slotIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, provider: 'spotify', url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        return
      }
      onSaved(data)
      setEditing(false)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    try {
      await fetch(`${API_BASE}/api/music-links/${slotIndex}?user_id=${userId}`, { method: 'DELETE' })
    } catch {
      // Best-effort — if this fails the slot just reappears on next load.
    }
    onCleared(slotIndex)
  }

  if (slot) {
    return (
      <div className="music-link-cell is-filled">
        <div className="music-link-artwork-wrap">
          <a
            href={slot.url}
            target="_blank"
            rel="noopener noreferrer"
            className="music-link-artwork-link"
            aria-label={slot.title ? `Open ${slot.title}` : 'Open link'}
            onClick={(e) => { if (removeMode) e.preventDefault() }}
          >
            {slot.thumbnail_url ? (
              <img src={slot.thumbnail_url} alt="" className="music-link-artwork" />
            ) : (
              <div className="music-link-artwork music-link-artwork-placeholder" />
            )}
          </a>
          {/* Desktop: revealed on hover only (see the hover:hover media
              query in CSS — a touch device never matches it). */}
          <button
            type="button"
            className="music-link-remove-btn"
            onClick={handleClear}
            aria-label="Remove"
          >
            <XIcon size={12} />
          </button>
          {/* Mobile: no hover to reveal the small one, so a long-press on
              the header icon (see toggleMusicPanel in App.jsx) puts the
              whole panel into this bigger, always-visible, easier-to-hit
              version instead. */}
          {removeMode && (
            <button
              type="button"
              className="music-link-remove-btn-big"
              onClick={handleClear}
              aria-label="Remove"
            >
              <XIcon size={20} />
            </button>
          )}
        </div>
        <span className="music-link-title">{slot.title || 'Untitled'}</span>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="music-link-cell is-editing">
        <span className="music-link-input-label">Paste a Spotify link</span>
        <input
          type="text"
          className="music-link-input"
          value={draft}
          disabled={loading}
          autoFocus
          onChange={(e) => { setDraft(e.target.value); setError('') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') cancelEditing()
          }}
        />
        <div className="music-link-input-actions">
          <button
            type="button"
            className="music-link-input-btn"
            onClick={handleSubmit}
            disabled={loading || !draft.trim()}
            aria-label="Save link"
          >
            <CheckIcon size={13} />
          </button>
          <button
            type="button"
            className="music-link-input-btn"
            onClick={cancelEditing}
            disabled={loading}
            aria-label="Cancel"
          >
            <XIcon size={13} />
          </button>
        </div>
        {error && <span className="music-link-error">{error}</span>}
      </div>
    )
  }

  // Mirrors a filled cell's structure — an artwork-sized box plus a
  // title-sized spacer — so an empty cell takes roughly the same footprint
  // as a filled one instead of just a small floating circle.
  return (
    <div className="music-link-cell-empty">
      <div className="music-link-artwork-slot">
        <button type="button" className="music-provider-add-btn" onClick={startEditing} aria-label="Add link">
          <PlusIcon size={18} />
        </button>
      </div>
      <span className="music-link-title music-link-title-spacer" aria-hidden="true">{' '}</span>
    </div>
  )
}

// Sized to its own content, so it can't be positioned with a fixed CSS
// left/transform — a wide panel centered on an icon that sits near the
// screen's edge would spill off it (as it did before this). Instead it's
// measured and clamped in JS against `boundsRef` (the app's own column,
// not the full window — on desktop the app sits in a centered 480px strip
// with empty space either side, and the panel shouldn't wander into that).
// Starts hidden and re-measures whenever the content that determines its
// size changes (slot data loading in is the main one — the grid is a lot
// wider once real artwork/titles replace the plain "+" buttons).
function MusicProviderPanel({ userId, provider, panelRef, anchorRef, boundsRef, removeMode }) {
  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Music Provider'
  const [slots, setSlots] = useState({})
  const [positionStyle, setPositionStyle] = useState({ visibility: 'hidden' })
  const [coneLeft, setConeLeft] = useState(0)

  useEffect(() => {
    if (!userId) return
    fetch(`${API_BASE}/api/music-links?user_id=${userId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const map = {}
        for (const row of rows) map[row.slot_index] = row
        setSlots(map)
      })
      .catch(() => {})
  }, [userId])

  useLayoutEffect(() => {
    if (!panelRef.current || !anchorRef.current || !boundsRef.current) return
    const MARGIN = 16
    const anchorRect = anchorRef.current.getBoundingClientRect()
    const panelRect = panelRef.current.getBoundingClientRect()
    const boundsRect = boundsRef.current.getBoundingClientRect()

    const minLeft = boundsRect.left + MARGIN
    const maxLeft = Math.max(minLeft, boundsRect.right - MARGIN - panelRect.width)
    const idealLeft = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2
    const left = Math.min(Math.max(idealLeft, minLeft), maxLeft)

    setConeLeft(anchorRect.left + anchorRect.width / 2 - left)
    setPositionStyle({ position: 'fixed', top: anchorRect.bottom + 14, left, visibility: 'visible' })
  }, [slots, removeMode])

  return (
    <div
      className="music-provider-panel"
      ref={panelRef}
      style={{ ...positionStyle, '--cone-left': `${coneLeft}px` }}
    >
      <div className="music-provider-grid">
        {Array.from({ length: visibleRowCount(slots) * COLUMNS }).map((_, i) => (
          <MusicLinkSlot
            key={i}
            slotIndex={i}
            slot={slots[i] || null}
            userId={userId}
            removeMode={removeMode}
            onSaved={(data) => setSlots((prev) => ({ ...prev, [data.slot_index]: data }))}
            onCleared={(index) => setSlots((prev) => {
              const next = { ...prev }
              delete next[index]
              return next
            })}
          />
        ))}
      </div>
      {!removeMode && (
        <p className="music-provider-tip">Tip: hold the {providerLabel} button to remove a link.</p>
      )}
    </div>
  )
}

export default MusicProviderPanel
