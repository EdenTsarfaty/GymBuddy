import { useRef, useState } from 'react'
import ChevronDownIcon from './icons/ChevronDownIcon'

const SWIPE_CAPTURE_PX = 8
const SWIPE_DISMISS_PX = 70
const SWIPE_EXIT_PX = 400
const EDGE_FADE_MAX_PX = 40

// Homescreen-only sticky banner (see App.jsx — rendered only in the default
// home view). Collapsed by default: one full-opacity title line, one muted
// preview line beneath it hinting there's more to read on tap. `messages`
// is priority-ordered by the caller — only the first non-dismissed one
// shows; the rest wait behind it. Dismissal is session-only (component
// state, not persisted) for this first pass — both current message kinds
// (offline, update-available) are fine reappearing on a fresh load, since
// neither is a one-time announcement that should stay gone forever.
//
// Dismiss has two paths that both end up calling the same dismiss(): swipe
// left/right (the pointer handlers below, mirroring WorkoutCard's own
// swipe-to-complete gesture — capture-on-horizontal-intent, threshold with
// a snap nudge), and an always-present "Dismiss" pill once expanded, for
// anyone who wouldn't discover or can't perform the swipe.
function HomeBanner({ messages }) {
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const [expanded, setExpanded] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  // Set the instant a swipe crosses the threshold and is released — from
  // then on dragX is driven toward ±SWIPE_EXIT_PX by CSS transition rather
  // than by further pointer input, and the actual dismiss (removing the
  // message from `messages`, which would unmount this element mid-flight)
  // only happens once that transition finishes, in onTransitionEnd.
  const [exiting, setExiting] = useState(false)
  const swipeDragRef = useRef(null)

  const active = messages.find((m) => !dismissedIds.has(m.id))

  function dismiss() {
    if (!active) return
    setDismissedIds((prev) => new Set(prev).add(active.id))
    setExpanded(false)
    setDragX(0)
    setExiting(false)
  }

  function handlePointerDown(e) {
    swipeDragRef.current = { startX: e.clientX, captured: false, pointerId: e.pointerId }
  }

  function handlePointerMove(e) {
    const drag = swipeDragRef.current
    if (!drag) return
    const delta = e.clientX - drag.startX

    if (!drag.captured) {
      if (Math.abs(delta) < SWIPE_CAPTURE_PX) return
      drag.captured = true
      setIsSwiping(true)
      e.currentTarget.setPointerCapture(drag.pointerId)
    }

    // Unclamped — the card follows the pointer for as far as it's dragged,
    // matching the release animation (which already travels to
    // ±SWIPE_EXIT_PX regardless of where the live drag stopped). Clamping
    // this to a smaller cap meant dragging further than that just stalled
    // under your finger instead of continuing to follow it.
    const pastThreshold = Math.abs(delta) >= SWIPE_DISMISS_PX
    if (pastThreshold !== drag.committed) {
      drag.committed = pastThreshold
      navigator.vibrate?.(15)
    }
    setDragX(delta)
  }

  function handlePointerUp(e) {
    const drag = swipeDragRef.current
    if (!drag) return
    swipeDragRef.current = null
    setIsSwiping(false)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (drag.captured && drag.committed) {
      setDragX(dragX < 0 ? -SWIPE_EXIT_PX : SWIPE_EXIT_PX)
      setExiting(true)
    } else {
      setDragX(0)
    }
  }

  if (!active) return null

  // Zero at rest (dragX === 0) so the mask on .home-banner-wrap is a no-op
  // until an actual drag is in progress — a static/always-on fade was the
  // bug last time: it faded the card's own edges even sitting still, not
  // just while approaching the page's clip boundary mid-swipe.
  const edgeFade = Math.min(Math.abs(dragX), EDGE_FADE_MAX_PX)

  return (
    <div className="home-banner-wrap" style={{ '--edge-fade': `${edgeFade}px` }}>
      <div
        className={`home-banner ${expanded ? 'is-expanded' : ''} ${isSwiping ? 'is-swiping' : ''} ${exiting ? 'is-exiting' : ''}`}
        style={{ '--drag-x': `${dragX}px`, '--drag-fade': 1 - Math.min(Math.abs(dragX) / SWIPE_EXIT_PX, 1) }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTransitionEnd={(e) => { if (exiting && e.propertyName === 'transform') dismiss() }}
      >
        <div
          className="home-banner-main"
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v) }}
          aria-expanded={expanded}
        >
          <div className="home-banner-header-row">
            <span className="home-banner-icon" aria-hidden="true">{active.icon}</span>
            <span className="home-banner-title">{active.title}</span>
            <ChevronDownIcon size={14} className="home-banner-chevron" />
          </div>
          {active.body && <div className="home-banner-preview">{active.body}</div>}
        </div>
        {expanded && (
          <div className="home-banner-actions">
            {active.dismissible !== false && (
              <button type="button" className="home-banner-action-btn is-secondary" onClick={dismiss}>
                Dismiss
              </button>
            )}
            {active.actions?.map((action) => (
              <button
                key={action.label}
                type="button"
                className="home-banner-action-btn"
                onClick={(e) => { e.stopPropagation(); action.onClick() }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default HomeBanner
