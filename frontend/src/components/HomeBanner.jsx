import { useRef, useState } from 'react'
import ChevronDownIcon from './icons/ChevronDownIcon'

const SWIPE_CAPTURE_PX = 8
const SWIPE_DISMISS_PX = 70
const SWIPE_EXIT_PX = 400
const EDGE_FADE_MAX_PX = 40

// Homescreen-only sticky banner (see App.jsx — rendered only in the default
// home view). Collapsed by default: one full-opacity title line, one muted
// preview line beneath it hinting there's more to read on tap. `messages`
// is priority-ordered by the caller — only the first one ever shows; the
// rest wait behind it (nothing here ever removes a message from the array,
// so there's no "dismissed" set to track — see minimize() below for what
// actually happens instead).
//
// Both the "Dismiss" pill (once expanded) and a swipe end up in the same
// place — collapsed down to a thin, non-interactive icon+title trace
// rather than removed outright. There's no way back to the full banner
// short of the underlying condition itself resolving and re-appearing
// (e.g. going back online clears the offline message from `messages`
// entirely, regardless of minimized state) — deliberately not
// clickable-to-restore. Swipe mirrors WorkoutCard's own swipe-to-complete
// gesture (capture-on-horizontal-intent, threshold with a snap nudge).
//
// `minimized`/`onMinimize` are controlled by the caller, not local state —
// App.jsx needs to know when this happens so it can move this component to
// a different spot in the page (the full banner sits above the "View
// <date>" recorded-workout link; minimized, it moves below it instead).
// That reordering is only meaningful at the App.jsx level, since only the
// parent controls where among its other children this one renders.
function HomeBanner({ messages, minimized, onMinimize }) {
  const [expanded, setExpanded] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  // Set the instant a swipe crosses the threshold and is released — from
  // then on dragX is driven toward ±SWIPE_EXIT_PX by CSS transition rather
  // than by further pointer input, and calling onMinimize (which would
  // unmount this element mid-flight if done immediately) only happens once
  // that transition finishes, in onTransitionEnd.
  const [exiting, setExiting] = useState(false)
  const swipeDragRef = useRef(null)

  const active = messages[0]

  function minimize() {
    onMinimize()
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

  if (minimized) {
    return (
      <div className="home-banner-minimized">
        <span className="home-banner-icon" aria-hidden="true">{active.icon}</span>
        <span className="home-banner-minimized-title">{active.title}</span>
      </div>
    )
  }

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
        onTransitionEnd={(e) => { if (exiting && e.propertyName === 'transform') minimize() }}
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
              <button type="button" className="home-banner-action-btn is-secondary" onClick={minimize}>
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
