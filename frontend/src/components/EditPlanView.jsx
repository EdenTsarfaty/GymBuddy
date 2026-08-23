import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { API_BASE } from '../apiBase'
import DumbbellIcon from './icons/DumbbellIcon'
import MachineIcon from './icons/MachineIcon'
import PlankIcon from './icons/PlankIcon'
import TreadmillIcon from './icons/TreadmillIcon'
import StretchIcon from './icons/StretchIcon'
import UndoIcon from './icons/UndoIcon'
import RedoIcon from './icons/RedoIcon'
import GenerateIcon from './icons/GenerateIcon'
import MoveIcon from './icons/MoveIcon'
import CopyIcon from './icons/CopyIcon'
import TrashIcon from './icons/TrashIcon'
import GripIcon from './icons/GripIcon'
import CheckIcon from './icons/CheckIcon'
import EditFieldIcon from './icons/EditFieldIcon'
import PlusIcon from './icons/PlusIcon'
import ChevronUpIcon from './icons/ChevronUpIcon'
import CameraIcon from './icons/CameraIcon'
import UploadIcon from './icons/UploadIcon'
import WebIcon from './icons/WebIcon'
import PhotoIcon from './icons/PhotoIcon'
import SearchIcon from './icons/SearchIcon'
import YouTubeIcon from './icons/YouTubeIcon'
import NewTabIcon from './icons/NewTabIcon'
import PencilIcon from './icons/PencilIcon'
import AiSearchIcon from './icons/AiSearchIcon'
import AiPhotoIcon from './icons/AiPhotoIcon'
import CloudIcon from './icons/CloudIcon'
import KebabIcon from './icons/KebabIcon'
import PlanGeneratingOverlay from './PlanGeneratingOverlay'
import XIcon from './icons/XIcon'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CATEGORY_ICONS = {
  free_weight: DumbbellIcon,
  machine: MachineIcon,
  body_weight: PlankIcon,
  warm_up: TreadmillIcon,
  stretch: StretchIcon,
}

const CATEGORY_LABELS = {
  free_weight: 'Free Weight',
  machine: 'Machine',
  body_weight: 'Body Weight',
  warm_up: 'Warm Up',
  stretch: 'Stretch',
}

// The four possible stat fields, independently addable/removable (unlike
// the old hasDuration split, which forced an either/or between Duration
// and Sets/Reps/Weight) — the fixed order they render/offer-to-add in.
const STAT_ORDER = ['sets', 'reps', 'weight', 'duration']
const STAT_LABELS = { sets: 'Sets', reps: 'Reps', weight: 'Weight (kg)', duration: 'Duration (sec)' }
// Short names, no units — for the "add a stat" menu, where the unit is
// redundant clutter (the field itself still shows it once added).
const STAT_SHORT_LABELS = { sets: 'Sets', reps: 'Reps', weight: 'Weight', duration: 'Duration' }
const STAT_DEFAULTS = { sets: 3, reps: 10, weight: 0, duration: 30 }

// A day with no title in the DB isn't necessarily a rest day — it might
// just never have had a title set despite having real exercises (e.g. one
// added via Manual/Photo search before the day was ever named). Only fall
// back to "Rest day" when there's also nothing scheduled; otherwise show
// "undefined" rather than mislabeling a real workout day as a rest day.
// Display-only — never written back to the DB.
function dayLabel(title, hasExercises) {
  if (title) return title
  return hasExercises ? 'Undefined' : 'Rest day'
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

// Accepts whatever shape of YouTube link someone pastes — watch/embed/
// shorts/live URLs, youtu.be short links, mobile/music subdomains, extra
// query params (&t=, &list=, si=, ...) tagging along — plus a bare video id
// typed directly, and pulls out just the 11-char id or null if it can't.
function parseYouTubeId(input) {
  const trimmed = (input || '').trim()
  if (!trimmed) return null
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed

  let url
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return YOUTUBE_ID_RE.test(id) ? id : null
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v')
      return id && YOUTUBE_ID_RE.test(id) ? id : null
    }
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/)
    if (match) return match[1]
  }
  return null
}

// Distinguishes "this looks like a link that happens to not be a valid
// YouTube one" (worth an error) from plain search text like "romanian
// deadlift" (not an error — it's going to run as a search instead).
function looksLikeUrl(input) {
  const s = (input || '').trim()
  return /^(https?:\/\/|www\.)/i.test(s) || /^[a-z0-9-]+\.[a-z]{2,}(\/|$|\?)/i.test(s)
}

// Groups the flat exercise list into per-day arrays, each item tagged with a
// stable string _key — real exercises key off their id, and copies (created
// client-side, no id yet) get one assigned when they're created. Keying by
// day rather than keeping one flat array is what makes drag-reorder (splice
// within a day) and move/copy (splice between two days) both trivial.
function groupByDay(exercises) {
  const groups = {}
  for (const day of WEEKDAYS) groups[day] = []
  for (const ex of exercises) {
    if (groups[ex.day]) groups[ex.day].push({ ...ex, _key: String(ex.id) })
  }
  return groups
}

// Shown in the gap above and below whichever card is open for field editing
// (tapped body, not checkbox) — a vertical dashed line at the checkbox's
// x-position with a round + in the middle. Clicking it drops a placeholder
// card (see PendingAddCard) at that exact position.
// bleedTop/bleedBottom control whether the line extends past this divider's
// own box on that side to reach a neighboring card — false when there is no
// neighbor that direction (this is the first/last card), so the line just
// stops at the + button instead of trailing off into empty space.
function InsertDivider({ bleedTop = true, bleedBottom = true, onInsert }) {
  return (
    <div className="edit-plan-insert-divider">
      <span
        className="edit-plan-insert-line"
        style={{ top: bleedTop ? -8 : '50%', bottom: bleedBottom ? -8 : '50%' }}
        aria-hidden="true"
      />
      <button type="button" className="edit-plan-insert-plus" onClick={onInsert} aria-label="Insert exercise here">
        <PlusIcon size={14} />
      </button>
    </div>
  )
}

// Sits in the list in place of a real exercise card right after a + is
// tapped — offers the three ways to fill it in. Manual (Phase 4) opens the
// same field-edit panel every other card uses, blank. Title search (Phase
// 5) swaps this card into a search field with live autocomplete against
// the bundled wger name list — picking or typing a name doesn't populate
// the rest of the card yet, that's a later phase. Photo search is still
// visible but inert.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Splits a suggestion name into the part that literally echoes the typed
// query (kept at normal weight) and everything around it — prefix and
// suffix alike — that the query doesn't account for (bolded, like a
// search-engine autocomplete highlighting what's new). Bolding both sides
// means a mid-string match (e.g. "Deficit Push ups" for query "push ups")
// still shows something highlighted, not just a same-weight line when the
// match happens to run to the end of the name. Mirrors the backend's
// word-boundary matching so hyphen/space differences between the query and
// the name don't throw off where the split lands.
function splitSuggestionMatch(name, query) {
  const words = query.toLowerCase().replace(/[-\s]+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return { pre: '', match: '', post: name }
  const pattern = words.map(escapeRegex).join('[-\\s]+')
  const m = name.match(new RegExp(`\\b(${pattern})`, 'i'))
  if (!m) return { pre: '', match: '', post: name }
  const start = m.index
  const end = start + m[0].length
  return { pre: name.slice(0, start), match: name.slice(start, end), post: name.slice(end) }
}

// Tracks whether a file drag is in progress ANYWHERE on the page, not just
// over one specific drop zone — lets a drop target show an ambient "you can
// drop here" affordance for the whole drag, with a stronger visual only once
// actually hovered. dragenter/dragleave fire repeatedly as the cursor
// crosses child element boundaries while bubbling to window, so a counter
// (not a plain boolean) is needed to avoid flickering false on every child
// crossing. Also suppresses the browser's default "navigate to this file"
// behavior for a drop that lands outside any real drop zone.
function useIsDraggingFile() {
  const [isDragging, setIsDragging] = useState(false)
  const counterRef = useRef(0)

  useEffect(() => {
    function hasFiles(e) {
      return Array.from(e.dataTransfer?.types || []).includes('Files')
    }
    function onDragEnter(e) {
      if (!hasFiles(e)) return
      counterRef.current += 1
      setIsDragging(true)
    }
    function onDragLeave(e) {
      if (!hasFiles(e)) return
      counterRef.current = Math.max(0, counterRef.current - 1)
      if (counterRef.current === 0) setIsDragging(false)
    }
    function onDragOver(e) {
      if (hasFiles(e)) e.preventDefault()
    }
    function reset() {
      counterRef.current = 0
      setIsDragging(false)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', reset)
    window.addEventListener('dragend', reset)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', reset)
      window.removeEventListener('dragend', reset)
    }
  }, [])

  return isDragging
}

// A camera capture (and some gallery photos) can be tens of MB at full
// sensor resolution — shrinking it client-side, before it's ever put into a
// FormData and sent over fetch, avoids two problems at once: staying
// comfortably under the backend's multipart size limit, and avoiding the
// memory spike that building/uploading a huge in-memory Blob can cause on a
// phone (this was crashing mobile Chrome mid-upload, reloading the whole
// page). Falls back to the original file untouched if resizing fails for
// any reason (unsupported format, etc.) rather than blocking the upload.
async function resizeForUpload(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const maxDim = 1600
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob || file
  } catch {
    return file
  }
}

function PendingAddCard({ onManual, onPhotoConfirmed, day, userId }) {
  const [mode, setMode] = useState(null) // null | 'title-search' | 'photo-search'
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  // 'pick' (upload/camera buttons) -> 'uploading' (identify-photo in
  // flight) -> 'confirm' (editable guessed name, mandatory before it's used
  // for anything) -> 'generating' (generate-preview in flight).
  const [photoStep, setPhotoStep] = useState('pick')
  const [photoName, setPhotoName] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false)
  const isDraggingFileAnywhere = useIsDraggingFile()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  function runQuery(value) {
    clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSuggestions([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/exercise-name-search?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setSuggestions(data.results || [])
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 200)
  }

  function handleQueryChange(value) {
    setQuery(value)
    runQuery(value)
  }

  function closeTitleSearch() {
    clearTimeout(debounceRef.current)
    setMode(null)
    setQuery('')
    setSuggestions([])
    setSearching(false)
  }

  function closePhotoSearch() {
    setMode(null)
    setPhotoStep('pick')
    setPhotoName('')
    setPhotoError('')
    setPhotoFile(null)
  }

  async function processPhotoFile(file) {
    setPhotoError('')
    setPhotoStep('uploading')
    try {
      const resized = await resizeForUpload(file)
      const body = new FormData()
      body.append('file', resized, 'photo.jpg')
      const res = await fetch(`${API_BASE}/api/exercises/identify-photo`, { method: 'POST', body })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPhotoName(data.name || '')
      // Kept so the exact photo used to identify this exercise becomes its
      // saved photo too once confirmed (see onPhotoConfirmed) — no reason to
      // make the user upload the same picture twice.
      setPhotoFile(resized)
      setPhotoStep('confirm')
    } catch {
      setPhotoError("Couldn't identify that photo — try another one.")
      setPhotoStep('pick')
    }
  }

  async function handlePhotoFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await processPhotoFile(file)
  }

  // Desktop-only in practice — dragging a file onto a touch device isn't
  // really a thing, and the "Upload or drag" label only shows on
  // pointer:fine devices anyway (see App.css). Only live during the
  // Upload/Camera picker step; there's no obvious action for a drop once
  // you're already past it (naming/generating).
  function handlePhotoDragOver(e) {
    if (photoStep !== 'pick') return
    e.preventDefault()
    setIsDraggingPhoto(true)
  }
  function handlePhotoDragLeave() {
    setIsDraggingPhoto(false)
  }
  function handlePhotoDrop(e) {
    e.preventDefault()
    setIsDraggingPhoto(false)
    if (photoStep !== 'pick') return
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) processPhotoFile(file)
  }

  async function confirmPhotoName() {
    if (!photoName.trim()) return
    setPhotoError('')
    setPhotoStep('generating')
    try {
      const res = await fetch(`${API_BASE}/api/exercises/generate-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: photoName.trim(), day, user_id: userId }),
      })
      if (!res.ok) throw new Error()
      const generated = await res.json()
      onPhotoConfirmed(generated, photoFile)
    } catch {
      setPhotoError("Couldn't generate exercise data — try again.")
      setPhotoStep('confirm')
    }
  }

  if (mode === 'title-search') {
    return (
      <div className="edit-plan-card edit-plan-pending-add edit-plan-pending-search">
        <button type="button" className="edit-plan-pending-back" onClick={closeTitleSearch} aria-label="Back">
          <XIcon size={11} />
        </button>
        <div className="edit-plan-pending-search-wrap">
          <input
            type="text"
            className="edit-plan-pending-search-input"
            placeholder="Search exercise name…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoFocus
          />
          {query.trim() && (
            <div className="edit-plan-pending-suggestions">
              <button
                type="button"
                className="edit-plan-pending-suggestion"
                onClick={() => setSuggestions([])}
              >
                {query.trim()}
              </button>
              {searching ? (
                <div className="edit-plan-pending-suggestion-status">Searching…</div>
              ) : (
                suggestions
                  .filter((name) => name.trim().toLowerCase() !== query.trim().toLowerCase())
                  .map((name) => {
                    const { pre, match, post } = splitSuggestionMatch(name, query)
                    return (
                      <button
                        key={name}
                        type="button"
                        className="edit-plan-pending-suggestion"
                        onClick={() => { setQuery(name); setSuggestions([]) }}
                      >
                        <strong>{pre}</strong>{match}<strong>{post}</strong>
                      </button>
                    )
                  })
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'photo-search') {
    const busy = photoStep === 'uploading' || photoStep === 'generating'
    return (
      <div
        className={`edit-plan-card edit-plan-pending-add edit-plan-pending-search ${isDraggingFileAnywhere ? 'is-drag-active' : ''} ${isDraggingPhoto ? 'is-drag-over' : ''}`}
        onDragOver={handlePhotoDragOver}
        onDragLeave={handlePhotoDragLeave}
        onDrop={handlePhotoDrop}
      >
        <button type="button" className="edit-plan-pending-back" onClick={closePhotoSearch} aria-label="Back">
          <XIcon size={11} />
        </button>
        {photoStep === 'confirm' || photoStep === 'generating' ? (
          <div className="edit-plan-pending-photo-confirm-row">
            <input
              type="text"
              className="edit-plan-pending-search-input"
              value={photoName}
              onChange={(e) => setPhotoName(e.target.value)}
              disabled={photoStep === 'generating'}
              autoFocus
            />
            <button
              type="button"
              className="edit-plan-pending-add-btn edit-plan-pending-photo-confirm"
              onClick={confirmPhotoName}
              disabled={photoStep === 'generating' || !photoName.trim()}
            >
              <span>{photoStep === 'generating' ? 'Generating…' : 'Use this exercise'}</span>
            </button>
          </div>
        ) : isDraggingFileAnywhere ? (
          <div className="edit-plan-pending-drop-hint">
            <UploadIcon size={20} />
            <span>Drop photo here</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="edit-plan-pending-add-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <UploadIcon size={14} />
              <span>
                {photoStep === 'uploading' ? 'Identifying…' : (
                  <>
                    <span className="edit-plan-mobile-only-text">Upload</span>
                    <span className="edit-plan-desktop-only-text">Upload or drag</span>
                  </>
                )}
              </span>
            </button>
            <button
              type="button"
              className="edit-plan-pending-add-btn edit-plan-pending-camera-btn"
              onClick={() => cameraInputRef.current?.click()}
              disabled={busy}
            >
              <CameraIcon size={14} />
              <span>Camera</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="edit-plan-pending-file-input"
              onChange={handlePhotoFile}
            />
            {/* capture="environment" hands off to the OS camera app on
                mobile instead of a file/photo picker — desktop browsers
                ignore it, which is why this button only shows on
                coarse-pointer (touch) devices, see .edit-plan-pending-
                camera-btn in App.css. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="edit-plan-pending-file-input"
              onChange={handlePhotoFile}
            />
          </>
        )}
        {photoError && <div className="edit-plan-pending-suggestion-status">{photoError}</div>}
      </div>
    )
  }

  return (
    <div className="edit-plan-card edit-plan-pending-add">
      <button type="button" className="edit-plan-pending-add-btn" onClick={onManual}>
        <PencilIcon size={14} />
        <span>Manual</span>
      </button>
      <button type="button" className="edit-plan-pending-add-btn" onClick={() => setMode('title-search')}>
        <AiSearchIcon size={14} />
        <span>Title search</span>
      </button>
      <button type="button" className="edit-plan-pending-add-btn" onClick={() => setMode('photo-search')}>
        <AiPhotoIcon size={14} />
        <span>Photo search</span>
      </button>
    </div>
  )
}

function SortableCard({ item, selected, editing, onToggleSelect, onOpenEdit, onManualAdd, onPhotoAdd, userId, readOnly }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._key,
    disabled: item.isPendingAdd || readOnly,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  if (item.isPendingAdd) {
    return (
      <div ref={setNodeRef} style={style}>
        <PendingAddCard
          onManual={() => onManualAdd(item._key)}
          onPhotoConfirmed={(generated, photoFile) => onPhotoAdd(item._key, generated, photoFile)}
          day={item.day}
          userId={userId}
        />
      </div>
    )
  }

  const Icon = CATEGORY_ICONS[item.category]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`edit-plan-card ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''} ${readOnly ? 'is-readonly' : ''}`}
      onClick={readOnly ? undefined : () => onOpenEdit(item._key)}
    >
      {!readOnly && (
        <button
          type="button"
          className="edit-plan-drag-handle"
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripIcon size={16} />
        </button>
      )}
      {!readOnly && (
        <button
          type="button"
          className={`edit-plan-checkbox ${selected ? 'is-checked' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(item._key) }}
          aria-label={selected ? 'Deselect exercise' : 'Select exercise'}
        >
          {selected && <CheckIcon size={12} />}
        </button>
      )}
      {Icon && <Icon size={20} className="edit-plan-card-icon" />}
      <h3 className="edit-plan-card-title">{item.name}</h3>
      <div className="edit-plan-card-stats">
        {item.sets > 0 && item.reps > 0 && (
          <span className="edit-plan-stat">{item.sets}×{item.reps}</span>
        )}
        {item.duration != null ? (
          <span className="edit-plan-stat">{formatDuration(item.duration)}</span>
        ) : item.weight != null ? (
          <span className="edit-plan-stat">{Math.round(item.weight)} kg</span>
        ) : null}
      </div>
    </div>
  )
}

// Extracted so useDraggable can be called per-pill (hooks can't run inside
// the existing .map() callback). Stays clickable for day preview even while
// draggable — dnd-kit's shared PointerSensor activationConstraint (distance:
// 4) already disambiguates a tap from a drag.
function DraggableDayPill({ day, label, active, draggable, onClick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `day-source-${day}`,
    data: { source: 'day-collection', day },
    disabled: !draggable,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`edit-plan-day-pill ${active ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''} ${draggable ? 'is-draggable' : ''}`}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {label}
    </button>
  )
}

// One blueprint slot in the day-reorder chain. Only the single leftmost
// unfilled slot (`activeTarget`) is a real droppable target — every other
// empty slot is a muted, non-interactive placeholder that just communicates
// "more room here" and enforces strict left-to-right fill order. A filled
// slot is itself draggable — pulling it back out to the day row removes it
// from the chain, leaving a hole that must be refilled before the chain can
// grow further.
function ReorderBlueprintSlot({ index, day, activeTarget, colored, invalid, canDrop, active, onSelect }) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `reorder-slot-${index}`,
    disabled: !canDrop,
  })
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `reorder-chain-${index}`,
    data: { source: 'reorder-chain', chainIndex: index },
    disabled: !day,
  })
  const setRefs = (node) => { setDropRef(node); setDragRef(node) }
  // A truly empty element collapses its line box in most browsers, making
  // unfilled slots shorter than filled ones — a non-breaking space keeps the
  // same font metrics (and therefore height) as a real day label.
  const label = day ? WEEKDAYS_SHORT[WEEKDAYS.indexOf(day)] : ' '
  return (
    <div
      ref={setRefs}
      className={`edit-plan-reorder-slot ${day ? 'is-filled' : ''} ${activeTarget ? 'is-target' : ''} ${colored ? 'is-colored' : ''} ${isOver ? 'is-over' : ''} ${invalid && day ? 'is-invalid' : ''} ${isDragging ? 'is-dragging' : ''} ${active ? 'is-selected' : ''}`}
      onClick={day ? () => onSelect?.(day) : undefined}
      {...(day ? attributes : {})}
      {...(day ? listeners : {})}
    >
      {label}
    </div>
  )
}

// Droppable wrapper around the day-pills row — dropping a filled blueprint
// slot here (dragging it back "to the collection of days") removes it from
// the chain.
function DayCollectionZone({ children, isEmpty }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'day-collection' })
  return (
    <div
      ref={setNodeRef}
      className={`edit-plan-day-pills ${isEmpty ? 'is-empty' : ''} ${isOver ? 'is-drop-target' : ''}`}
    >
      {isEmpty ? (
        // Invisible — reserves exactly a pill's box height (same padding,
        // border, font metrics) via a real nbsp text node so the row never
        // collapses when there's nothing left to show.
        <span className="edit-plan-day-pill edit-plan-day-pills-hint" aria-hidden="true">
          Drop here to remove a day
        </span>
      ) : (
        children
      )}
    </div>
  )
}

function DayPickerSheet({ title, currentDay, dayTitles, draft, onPick, onCancel }) {
  return (
    <div className="edit-plan-sheet-backdrop" onClick={onCancel}>
      <div className="edit-plan-sheet" onClick={(e) => e.stopPropagation()}>
        <h3 className="edit-plan-sheet-title">{title}</h3>
        <div className="edit-plan-sheet-days">
          {WEEKDAYS.map((day) => {
            const hasExercises = draft[day].some((it) => !it.isPendingAdd)
            return (
              <button
                key={day}
                type="button"
                className={`edit-plan-sheet-day ${day === currentDay ? 'is-current' : ''}`}
                onClick={() => onPick(day)}
              >
                <span>{day}</span>
                <span className="edit-plan-sheet-day-title">{dayLabel(dayTitles.get(day), hasExercises)}</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="edit-plan-sheet-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// Deliberately minimal — a checkbox and an optional textarea, reusing
// RegeneratePlanModal's visual language (modal-box/regen-* classes) rather
// than introducing new styling for what's a much smaller ask than the
// whole-plan version. includeCurrent defaults on: comments like "swap the
// leg press" mean nothing to the model without seeing what's currently
// there, and even without comments, showing the current list steers the
// regeneration away from landing on a near-identical plan by accident.
function RegenerateDayModal({ dayTitle, onClose, onConfirm }) {
  const [title, setTitle] = useState(dayTitle)
  const [includeCurrent, setIncludeCurrent] = useState(true)
  const [comments, setComments] = useState('')
  const [generating, setGenerating] = useState(false)

  async function handleConfirm() {
    setGenerating(true)
    try {
      await onConfirm({ title: title.trim(), includeCurrent, comments: comments.trim() })
    } finally {
      setGenerating(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-box regen-modal">
          <h2 className="regen-title">Regenerate day</h2>
          <div className="regen-rows">
            <div className="regen-row">
              <span className="regen-label">Day title</span>
              <input
                type="text"
                className="regen-day-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Back and Biceps"
              />
            </div>
            <div className="regen-row">
              <span className="regen-label">Include current day plan</span>
              <button
                type="button"
                className="theme-toggle-pill beginner-toggle-pill"
                role="switch"
                aria-checked={includeCurrent}
                data-on={String(includeCurrent)}
                onClick={() => setIncludeCurrent((v) => !v)}
              >
                <div className="theme-toggle-thumb" style={{ transform: `translateX(${includeCurrent ? 100 : 0}%)` }} />
                <span className={`theme-toggle-option ${!includeCurrent ? 'is-active' : ''}`}>
                  <XIcon size={14} />
                </span>
                <span className={`theme-toggle-option ${includeCurrent ? 'is-active' : ''}`}>
                  <CheckIcon size={14} />
                </span>
              </button>
            </div>
            <label className="edit-plan-field">
              <span>Comments (optional)</span>
              <textarea
                rows={3}
                placeholder="e.g. swap the leg press, add more back volume…"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </label>
          </div>
          <button className="goals-save-btn" onClick={handleConfirm} disabled={generating}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Collapsed: just a grab bar with a wide chevron, tucked at the bottom of the
// screen. Expanded: the same bar (chevron now pointing down) sits atop a
// scrollable form with every field the tapped card carries. Field edits go
// straight into the draft on blur (so they ride the same Undo/Redo stack and
// Save as every other Phase 2/3 action) rather than needing their own
// confirm step — typing doesn't spam the undo stack since each field commits
// once, on blur, not per keystroke.
function ExerciseEditPanel({
  item, expanded, onToggleExpanded, onClose, onCommitField, onDelete, onPhotoChange,
  canUndo, canRedo, onUndo, onRedo, track,
}) {
  const [form, setForm] = useState(item)
  const [uploading, setUploading] = useState(false)
  const [isPhotoDragOver, setIsPhotoDragOver] = useState(false)
  const isDraggingFileAnywhere = useIsDraggingFile()
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState(item.name)
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [youtubeInput, setYoutubeInput] = useState(item.video_id ? `https://www.youtube.com/watch?v=${item.video_id}` : '')
  const [showYoutubeSearch, setShowYoutubeSearch] = useState(false)
  const [youtubeResults, setYoutubeResults] = useState(null)
  const [youtubeSearching, setYoutubeSearching] = useState(false)
  const [youtubeSearchError, setYoutubeSearchError] = useState(null)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)
  const [showStatMenu, setShowStatMenu] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const bulletRefs = useRef([])

  useEffect(() => {
    setForm(item)
    setShowUrlInput(false)
    setUrlValue('')
    setShowSearch(false)
    setSearchQuery(item.name)
    setSearchResults(null)
    setSearchError(null)
    setYoutubeInput(item.video_id ? `https://www.youtube.com/watch?v=${item.video_id}` : '')
    setShowYoutubeSearch(false)
    setYoutubeResults(null)
    setYoutubeSearchError(null)
    setShowCategoryMenu(false)
    setShowStatMenu(false)
  }, [item])

  // The photo endpoints are keyed by a real exercise id — an item still
  // staged locally (no name committed yet) doesn't have one.
  const canUploadPhoto = item.id != null
  const CategoryIcon = CATEGORY_ICONS[form.category]
  const presentStats = STAT_ORDER.filter((key) => form[key] != null)
  const missingStats = STAT_ORDER.filter((key) => form[key] == null)

  function selectCategory(category) {
    onCommitField('category', category)
    setShowCategoryMenu(false)
  }

  function removeStat(key) {
    setForm((f) => ({ ...f, [key]: null }))
    onCommitField(key, null)
  }

  function addStat(key) {
    const value = STAT_DEFAULTS[key]
    setForm((f) => ({ ...f, [key]: value }))
    onCommitField(key, value)
    setShowStatMenu(false)
  }
  const parsedVideoId = parseYouTubeId(youtubeInput)
  // Only flag as an error when the text actually resembles a URL but failed
  // to parse as a YouTube one — plain search text (no protocol/domain shape)
  // isn't "invalid", it's just going to be treated as a search query instead.
  const youtubeInvalid = youtubeInput.trim() !== '' && !parsedVideoId && looksLikeUrl(youtubeInput)

  function pickYoutubeResult(videoId) {
    setYoutubeInput(`https://www.youtube.com/watch?v=${videoId}`)
    onCommitField('video_id', videoId)
    setShowYoutubeSearch(false)
  }

  async function runYoutubeSearch(query) {
    const q = (query || '').trim()
    if (!q) return
    setYoutubeSearching(true)
    setYoutubeSearchError(null)
    try {
      const res = await fetch(`${API_BASE}/api/youtube-search?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setYoutubeResults(data.results || [])
    } catch {
      setYoutubeSearchError('Search failed — check your connection and try again.')
      setYoutubeResults([])
    } finally {
      setYoutubeSearching(false)
    }
  }

  // The single field doubles as both a paste-a-link box and a search box:
  // a recognizable YouTube URL commits directly, plain text runs a search
  // (opening the results list) instead of being treated as a bad link.
  function handleYoutubeFieldCommit() {
    const trimmed = youtubeInput.trim()
    if (!trimmed) {
      onCommitField('video_id', null)
      return
    }
    if (parsedVideoId) {
      onCommitField('video_id', parsedVideoId)
      return
    }
    if (!looksLikeUrl(trimmed)) {
      setShowYoutubeSearch(true)
      runYoutubeSearch(trimmed)
    }
  }

  function toggleYoutubeSearch() {
    const opening = !showYoutubeSearch
    setShowYoutubeSearch(opening)
    if (opening) {
      const trimmed = youtubeInput.trim()
      runYoutubeSearch(trimmed && !looksLikeUrl(trimmed) ? trimmed : item.name)
    }
  }

  const photoUrl = item.photo
    ? (item.photo.startsWith('https://') ? item.photo : `${API_BASE}/api/exercise-photos/${item.photo}`)
    : null

  async function processPhotoUpload(file) {
    setUploading(true)
    try {
      const resized = await resizeForUpload(file)
      const body = new FormData()
      body.append('file', resized, 'photo.jpg')
      const res = await track(fetch(`${API_BASE}/api/exercises/${item.id}/photo`, { method: 'POST', body }))
      if (!res.ok) throw new Error('Upload failed')
      const updated = await res.json()
      onPhotoChange(updated.photo)
    } catch {
      // Silently no-op on failure for now — the thumbnail just stays as it was.
    } finally {
      setUploading(false)
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await processPhotoUpload(file)
  }

  // Desktop-only in practice (dragging onto a touch screen isn't really a
  // thing) — works whether or not a photo is already set, since dropping a
  // new one onto an existing photo is just as natural as onto the empty
  // placeholder.
  function handlePhotoDragOver(e) {
    if (!canUploadPhoto || uploading) return
    e.preventDefault()
    setIsPhotoDragOver(true)
  }
  function handlePhotoDragLeave() {
    setIsPhotoDragOver(false)
  }
  function handlePhotoDrop(e) {
    e.preventDefault()
    setIsPhotoDragOver(false)
    if (!canUploadPhoto || uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) processPhotoUpload(file)
  }

  async function applyPhotoUrl(url) {
    setUploading(true)
    try {
      const res = await track(fetch(`${API_BASE}/api/exercises/${item.id}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }))
      if (!res.ok) throw new Error('Save failed')
      const updated = await res.json()
      onPhotoChange(updated.photo)
      setShowUrlInput(false)
      setUrlValue('')
      setShowSearch(false)
    } catch {
      // Silently no-op on failure for now — the thumbnail just stays as it was.
    } finally {
      setUploading(false)
    }
  }

  function confirmUrl() {
    const url = urlValue.trim()
    if (url) applyPhotoUrl(url)
  }

  async function removePhoto() {
    setUploading(true)
    try {
      const res = await track(fetch(`${API_BASE}/api/exercises/${item.id}/photo`, { method: 'DELETE' }))
      if (!res.ok) throw new Error('Remove failed')
      onPhotoChange(null)
    } catch {
      // Silently no-op on failure for now — the thumbnail just stays as it was.
    } finally {
      setUploading(false)
    }
  }

  async function runSearch() {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(`${API_BASE}/api/image-search?q=${encodeURIComponent(q)}`)
      if (res.status === 503) {
        setSearchError("Image search isn't set up yet.")
        setSearchResults([])
        return
      }
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch {
      setSearchError('Search failed — check your connection and try again.')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  function updateBullet(index, value) {
    setForm((f) => ({ ...f, bullets: f.bullets.map((b, i) => (i === index ? value : b)) }))
  }

  function commitBullets(bullets) {
    onCommitField('bullets', bullets)
  }

  function removeBullet(index) {
    const next = form.bullets.filter((_, i) => i !== index)
    setForm((f) => ({ ...f, bullets: next }))
    commitBullets(next)
  }

  function addBullet() {
    const next = [...form.bullets, '']
    setForm((f) => ({ ...f, bullets: next }))
  }

  // Grows the textarea with its content up to 3 lines' worth of height, then
  // lets it scroll internally instead of pushing the rest of the panel down —
  // avoids the single-line input's uncomfortable horizontal scroll on long
  // bullets without the panel's height jumping around unboundedly either.
  function resizeBulletEl(el) {
    el.style.height = 'auto'
    const maxHeight = 3 * 20 + 16 // ~3 lines at this font-size/line-height, plus padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }

  function autoGrowBullet(e) {
    resizeBulletEl(e.target)
  }

  // Sizing on user input alone (autoGrowBullet's onChange) never runs for
  // bullets that arrive already long — the panel's initial open, switching
  // to a different exercise, or an Undo/Redo that changes this item's
  // bullets — so re-measure every bullet whenever the expanded panel's
  // content could have changed out from under it.
  useEffect(() => {
    if (!expanded) return
    bulletRefs.current.forEach((el) => el && resizeBulletEl(el))
  }, [expanded, form.bullets])

  return (
    <div className="edit-plan-edit-panel">
      <button type="button" className="edit-plan-edit-bar" onClick={onToggleExpanded}>
        <ChevronUpIcon size={18} className={`edit-plan-edit-chevron ${expanded ? 'is-flipped' : ''}`} />
      </button>

      {expanded && (
        <div className="edit-plan-edit-form">
          <div className="edit-plan-edit-form-header">
            <h3>Edit exercise</h3>
            <div className="edit-plan-edit-form-header-actions">
              <button type="button" className="edit-plan-icon-btn" onClick={onDelete} aria-label="Delete exercise">
                <TrashIcon size={17} />
              </button>
              <button type="button" className="edit-plan-icon-btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
                <UndoIcon size={21} />
              </button>
              <button type="button" className="edit-plan-icon-btn" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
                <RedoIcon size={21} />
              </button>
              <button type="button" className="edit-plan-edit-close" onClick={onClose} aria-label="Close">
                <XIcon size={14} />
              </button>
            </div>
          </div>

          <div className="edit-plan-name-row">
            <label className="edit-plan-field edit-plan-name-field">
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={(e) => onCommitField('name', e.target.value)}
              />
            </label>
            <div className="edit-plan-category-picker">
              <button
                type="button"
                className="edit-plan-category-pill"
                onClick={() => setShowCategoryMenu((v) => !v)}
              >
                {CategoryIcon && <CategoryIcon size={14} />}
                <span>{CATEGORY_LABELS[form.category] || 'Category'}</span>
              </button>
              {showCategoryMenu && (
                <div className="edit-plan-category-menu">
                  {Object.keys(CATEGORY_ICONS).filter((key) => key !== form.category).map((key) => {
                    const OptionIcon = CATEGORY_ICONS[key]
                    return (
                      <button key={key} type="button" className="edit-plan-category-option" onClick={() => selectCategory(key)}>
                        <OptionIcon size={16} />
                        <span>{CATEGORY_LABELS[key]}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="edit-plan-field-row edit-plan-stats-row">
            {presentStats.map((key) => (
              <label key={key} className="edit-plan-field edit-plan-field-narrow">
                <span className="edit-plan-stat-field-label">
                  {STAT_LABELS[key]}
                  <button
                    type="button"
                    className="edit-plan-stat-remove"
                    onClick={() => removeStat(key)}
                    aria-label={`Remove ${STAT_LABELS[key]}`}
                  >
                    <XIcon size={9} />
                  </button>
                </span>
                <input
                  type="number"
                  value={form[key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  onBlur={(e) => onCommitField(key, Number(e.target.value) || 0)}
                />
              </label>
            ))}
            {missingStats.length > 0 && (
              <div className="edit-plan-stat-add-wrap">
                <button
                  type="button"
                  className="edit-plan-stat-add-btn"
                  onClick={() => setShowStatMenu((v) => !v)}
                  aria-label="Add a stat"
                >
                  <PlusIcon size={14} />
                </button>
                {showStatMenu && (
                  <div className="edit-plan-stat-menu">
                    {missingStats.map((key) => (
                      <button key={key} type="button" onClick={() => addStat(key)}>{STAT_SHORT_LABELS[key]}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <span className="edit-plan-field-label">Photo</span>
          <div className="edit-plan-photo-row">
            <div
              className={`edit-plan-photo-square ${isDraggingFileAnywhere ? 'is-drag-active' : ''} ${isPhotoDragOver ? 'is-drag-over' : ''}`}
              onDragOver={handlePhotoDragOver}
              onDragLeave={handlePhotoDragLeave}
              onDrop={handlePhotoDrop}
            >
              {photoUrl ? (
                <>
                  <img src={photoUrl} alt="" />
                  <button
                    type="button"
                    className="edit-plan-photo-remove"
                    onClick={removePhoto}
                    disabled={!canUploadPhoto || uploading}
                    aria-label="Remove photo"
                  >
                    <XIcon size={12} />
                  </button>
                </>
              ) : (
                <div className="edit-plan-photo-placeholder-wrap">
                  <PhotoIcon size={36} className="edit-plan-photo-placeholder" />
                  <span className="edit-plan-photo-drag-hint edit-plan-desktop-only-text">You can also drag & drop!</span>
                </div>
              )}
            </div>
            <div className="edit-plan-photo-actions">
              <button
                type="button"
                className="edit-plan-photo-btn edit-plan-pending-camera-btn"
                onClick={() => cameraInputRef.current?.click()}
                disabled={!canUploadPhoto || uploading}
                aria-label="Take photo"
              >
                <span className="edit-plan-photo-btn-icon"><CameraIcon size={19} /></span>
                <span>Camera</span>
              </button>
              <button
                type="button"
                className="edit-plan-photo-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canUploadPhoto || uploading}
                aria-label="Upload photo"
              >
                <span className="edit-plan-photo-btn-icon"><UploadIcon size={16} /></span>
                <span>Upload</span>
              </button>
              <button
                type="button"
                className={`edit-plan-photo-btn ${showUrlInput ? 'is-active' : ''}`}
                onClick={() => setShowUrlInput((v) => !v)}
                disabled={!canUploadPhoto || uploading}
                aria-label="Photo from web address"
              >
                <span className="edit-plan-photo-btn-icon"><WebIcon size={16} /></span>
                <span>Web URL</span>
              </button>
              <button
                type="button"
                className={`edit-plan-photo-btn ${showSearch ? 'is-active' : ''}`}
                onClick={() => setShowSearch((v) => !v)}
                disabled={!canUploadPhoto || uploading}
                aria-label="Search the web for a photo"
              >
                <span className="edit-plan-photo-btn-icon"><SearchIcon size={18} /></span>
                <span>Search</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="edit-plan-photo-file-input"
                onChange={handleFileSelected}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="edit-plan-photo-file-input"
                onChange={handleFileSelected}
              />
            </div>
          </div>

          {showUrlInput && (
            <div className="edit-plan-photo-url-row">
              <input
                type="text"
                className="edit-plan-photo-url-input"
                placeholder="https://…"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmUrl() }}
              />
              <button type="button" className="edit-plan-photo-url-confirm" onClick={confirmUrl} disabled={uploading}>Use</button>
            </div>
          )}

          {showSearch && (
            <div className="edit-plan-photo-search">
              <div className="edit-plan-photo-url-row">
                <input
                  type="text"
                  className="edit-plan-photo-url-input"
                  placeholder="Search query"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
                />
                <button type="button" className="edit-plan-photo-url-confirm" onClick={runSearch} disabled={searching}>
                  {searching ? '…' : 'Search'}
                </button>
              </div>
              <p className="edit-plan-photo-search-tip">Tip: add "gif" to your search for an animated result.</p>
              {searchError && <p className="edit-plan-save-error">{searchError}</p>}
              {searchResults && searchResults.length > 0 && (
                <div className="edit-plan-photo-results">
                  {searchResults.map((result) => (
                    <button
                      key={result.url}
                      type="button"
                      className="edit-plan-photo-result"
                      onClick={() => applyPhotoUrl(result.url)}
                      disabled={uploading}
                    >
                      <img src={result.thumbnailUrl} alt="" loading="lazy" />
                      {result.isGif && <span className="edit-plan-photo-result-gif">GIF</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="edit-plan-field">
            <span>Description</span>
            <textarea
              rows={3}
              value={form.description || ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              onBlur={(e) => onCommitField('description', e.target.value)}
            />
          </label>

          <div className="edit-plan-field">
            <span>Bullets</span>
            {form.bullets.map((bullet, i) => (
              <div key={i} className="edit-plan-bullet-row">
                <textarea
                  ref={(el) => { bulletRefs.current[i] = el }}
                  rows={1}
                  value={bullet}
                  onChange={(e) => { updateBullet(i, e.target.value); autoGrowBullet(e) }}
                  onBlur={() => commitBullets(form.bullets)}
                />
                <button type="button" className="edit-plan-bullet-remove" onClick={() => removeBullet(i)} aria-label="Remove bullet">
                  <XIcon size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="edit-plan-bullet-add" onClick={addBullet}>+ Add bullet</button>
          </div>

          <span className="edit-plan-field-label">
            <YouTubeIcon size={13} />
            <span>YouTube</span>
          </span>
          <div className="edit-plan-youtube-row">
            <input
              type="text"
              className={`edit-plan-photo-url-input ${youtubeInvalid ? 'is-error' : ''}`}
              placeholder="Paste a link or search…"
              value={youtubeInput}
              onChange={(e) => setYoutubeInput(e.target.value)}
              onBlur={handleYoutubeFieldCommit}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            />
            {!parsedVideoId && (
              <button
                type="button"
                className={`edit-plan-photo-btn edit-plan-youtube-search-btn ${showYoutubeSearch ? 'is-active' : ''}`}
                onClick={toggleYoutubeSearch}
                disabled={youtubeSearching}
                aria-label="Search YouTube"
              >
                <span className="edit-plan-photo-btn-icon"><SearchIcon size={16} /></span>
              </button>
            )}
            {parsedVideoId && (
              <a
                href={`https://www.youtube.com/watch?v=${parsedVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open on YouTube"
              >
                <img
                  className="edit-plan-youtube-thumb"
                  src={`https://img.youtube.com/vi/${parsedVideoId}/mqdefault.jpg`}
                  alt=""
                />
              </a>
            )}
          </div>
          {youtubeInvalid && <p className="edit-plan-save-error">Doesn't look like a YouTube link.</p>}

          {showYoutubeSearch && (
            <div className="edit-plan-photo-search">
              {youtubeSearching && <p className="edit-plan-save-error">Searching…</p>}
              {youtubeSearchError && <p className="edit-plan-save-error">{youtubeSearchError}</p>}
              {youtubeResults && youtubeResults.length === 0 && !youtubeSearchError && (
                <p className="edit-plan-save-error">No short-form results found.</p>
              )}
              {youtubeResults && youtubeResults.length > 0 && (
                <div className="edit-plan-youtube-result-list">
                  {youtubeResults.map((result) => (
                    <div key={result.video_id} className="edit-plan-youtube-result">
                      <button
                        type="button"
                        className="edit-plan-youtube-result-main"
                        onClick={() => pickYoutubeResult(result.video_id)}
                      >
                        <img src={`https://img.youtube.com/vi/${result.video_id}/mqdefault.jpg`} alt="" loading="lazy" />
                        <div className="edit-plan-youtube-result-info">
                          <span className="edit-plan-youtube-result-title">{result.title}</span>
                          <span className="edit-plan-youtube-result-meta">{result.channel} · {result.duration}</span>
                        </div>
                      </button>
                      <a
                        href={`https://www.youtube.com/watch?v=${result.video_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="edit-plan-youtube-result-open"
                        aria-label="Open on YouTube in a new tab"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <NewTabIcon size={14} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Live-sync model: every structural/field action (reorder, checkbox
// multi-select Delete/Copy to/Move to, field edits, add) persists to the
// server the moment it happens — no local draft, no Save button, no discard-
// on-Cancel. `draft` is just the local mirror of server state, kept in sync
// via optimistic updates that roll back if the request fails. Undo/Redo are
// reverse network calls (see undoStack below), not a client-side snapshot
// revert — Deletes are soft (see exerciseSweep.js) specifically so undoing
// one can restore the exact same row (id, chat history, photo) instead of
// recreating a lookalike. No AI involved in the structural actions
// themselves. See the manual-edit-mode design notes in memory for the full
// spec this is being built toward.
function EditPlanView({ allExercises, dayTitles, userId, onSaved, onDayTitleSaved, onClose, onRegeneratePlan }) {
  const [selectedDay, setSelectedDay] = useState(WEEKDAYS[new Date().getDay()])
  const [editingDayTitle, setEditingDayTitle] = useState(false)
  const [dayTitleDraft, setDayTitleDraft] = useState('')
  const [savingDayTitle, setSavingDayTitle] = useState(false)
  const [draft, setDraft] = useState(() => groupByDay(allExercises))
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [sheet, setSheet] = useState(null) // 'move' | 'copy' | null
  const [actionError, setActionError] = useState(null)
  const [showGenerateMenu, setShowGenerateMenu] = useState(false)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [regenerateDayOpen, setRegenerateDayOpen] = useState(false)
  const [dayGenerating, setDayGenerating] = useState(false)
  const [dayGenPhase, setDayGenPhase] = useState('thinking')
  const [dayGenStructure, setDayGenStructure] = useState(null)
  // Day reordering: reorderChain is an ordered list of day names describing
  // a flow — chain[i]'s exercises move to chain[i+1]. A closed loop
  // (chain[0] === chain[last]) is a safe swap/rotation; an open chain empties
  // chain[0] and requires chain[last] to have been empty beforehand.
  const [dayReorderMode, setDayReorderMode] = useState(false)
  const [reorderChain, setReorderChain] = useState([])
  const [applyingReorder, setApplyingReorder] = useState(false)
  const [activeDragDay, setActiveDragDay] = useState(null)
  const [activeDragSource, setActiveDragSource] = useState(null)
  const [activeDragIndex, setActiveDragIndex] = useState(null)
  // Tapping a card body (not its checkbox or drag handle) opens this single
  // exercise for field-level editing — distinct from selectedKeys, which is
  // the checkbox multi-select the bulk toolbar (Delete/Copy to/Move to) acts
  // on. editingKey and selectedKeys can be active independently.
  const [editingKey, setEditingKey] = useState(null)
  const [editPanelExpanded, setEditPanelExpanded] = useState(false)
  const newKeyCounter = useRef(0)

  // Count of in-flight persist requests, driving the header's cloud sync
  // indicator (muted while >0, accent once every request has settled) —
  // Google Docs-style confirmation that a change actually reached the
  // server. A counter rather than a boolean since actions can overlap (e.g.
  // committing a field while a previous one is still in flight).
  const [pendingCount, setPendingCount] = useState(0)
  // Local requests routinely resolve in a handful of ms — faster than the
  // eye can register a color change at all, let alone one animated over a
  // transition. Enforcing a minimum visible "pending" duration (independent
  // of how fast the request actually was) is what makes the indicator mean
  // anything; the request itself is never slowed down, only the bookkeeping
  // that clears the muted state is.
  const MIN_PENDING_MS = 350
  function track(promise) {
    const startedAt = Date.now()
    setPendingCount((c) => c + 1)
    promise.finally(() => {
      const remaining = Math.max(0, MIN_PENDING_MS - (Date.now() - startedAt))
      setTimeout(() => setPendingCount((c) => c - 1), remaining)
    })
    return promise
  }

  // "Saved" label next to the cloud icon — animates in the moment pending
  // first drops to 0 (a real completed round trip, not idle-at-rest before
  // anything's happened), stays put, then animates back out the instant the
  // next action starts. hasSyncedOnce flips true on the first completion and
  // never resets, so showSaved is just "idle, and at least one save has
  // actually landed" — no timers needed, it's driven entirely by pendingCount.
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false)
  const wasPendingRef = useRef(false)
  useEffect(() => {
    if (wasPendingRef.current && pendingCount === 0) setHasSyncedOnce(true)
    wasPendingRef.current = pendingCount > 0
  }, [pendingCount])
  const showSaved = hasSyncedOnce && pendingCount === 0

  // Undo/Redo stack of small, typed entries describing how to reverse each
  // action — not draft snapshots. Two shapes:
  //  - { kind: 'toggle', action: 'create' | 'delete', items: [...fullRows] }
  //    covers create/copy (undo = soft-delete) and delete (undo = restore) —
  //    both are really just opposite ends of the same deleted_at flip.
  //  - { kind: 'fields', days: { [day]: { before: [...items], after: [...items] } } }
  //    covers field edits, reorder, and move — any action that only changes
  //    existing rows' fields/day/position, never their existence.
  // A fresh action after an Undo clears the redo tail, same as any editor.
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])

  function pushUndo(entry) {
    setUndoStack((stack) => [...stack, entry])
    setRedoStack([])
  }

  // Every mutation below goes through this — small, single-action payloads
  // (one item's `updates`, one `deletes` id, etc.) rather than the whole-plan
  // batch this endpoint originally served. Throws on failure so callers can
  // roll back their optimistic local update.
  async function persistPlan(payload) {
    const res = await track(fetch(`${API_BASE}/api/exercises/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...payload }),
    }))
    if (!res.ok) throw new Error('Request failed')
    return res.json()
  }

  // The two ends of a deleted_at flip, shared by toggle-undo/redo and by
  // handleDelete/handleDeleteEditing's own rollback-on-failure path.
  async function setActive(items, active) {
    if (items.length === 0) return
    if (active) {
      setDraft((current) => {
        const next = { ...current }
        for (const item of items) {
          const key = String(item.id)
          if (next[item.day].some((it) => it._key === key)) continue
          next[item.day] = [...next[item.day], { ...item, _key: key }].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        }
        return next
      })
      await track(Promise.all(items.map((item) =>
        fetch(`${API_BASE}/api/exercises/${item.id}/restore`, { method: 'POST' }),
      )))
    } else {
      const ids = new Set(items.map((it) => it.id))
      setDraft((current) => {
        const next = {}
        for (const day of WEEKDAYS) next[day] = current[day].filter((it) => !ids.has(it.id))
        return next
      })
      await persistPlan({ deletes: [...ids] })
    }
  }

  async function applyFieldsSnapshot(days, useAfter, titles) {
    setDraft((current) => {
      const next = { ...current }
      for (const day of Object.keys(days)) next[day] = useAfter ? days[day].after : days[day].before
      return next
    })
    const updates = []
    for (const day of Object.keys(days)) {
      const snapshot = useAfter ? days[day].after : days[day].before
      snapshot.forEach((item, index) => {
        if (item.id != null) updates.push(toUpdatePayload(item, day, index))
      })
    }
    if (updates.length > 0) await persistPlan({ updates })
    if (titles) {
      await Promise.all(
        Object.keys(titles).map((day) => setDayTitle(day, useAfter ? titles[day].after : titles[day].before)),
      )
    }
  }

  // Re-points `photo` at a previously-known value (a filename, a URL, or
  // null) via the dedicated revert endpoint, which doesn't destroy the file
  // it's moving away from — that's marked orphaned server-side (see
  // photoSweep.js), not deleted, so undo and redo can freely swap between
  // "before" and "after" as many times as the user likes within the grace
  // period.
  async function applyPhotoRevert(id, day, key, photo) {
    const res = await track(fetch(`${API_BASE}/api/exercises/${id}/photo/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo }),
    }))
    if (!res.ok) throw new Error('Revert failed')
    setDraft((current) => ({
      ...current,
      [day]: current[day].map((it) => (it._key === key ? { ...it, photo } : it)),
    }))
  }

  // The PUT endpoint rejects a blank title outright (it's meant for the
  // header's rename field, which never submits empty) — clearing a title
  // back to the "rest day"/"undefined" default goes through DELETE instead.
  // Anywhere a title is being set from data rather than typed by the user
  // (e.g. day reordering) needs to route through this, not applyDayTitle
  // directly, since the new value might legitimately be ''.
  async function setDayTitle(day, title) {
    if (!title) {
      const res = await track(fetch(`${API_BASE}/api/day-plans/${day}?user_id=${userId}`, { method: 'DELETE' }))
      if (!res.ok) throw new Error('Clear failed')
      onDayTitleSaved?.(day, '')
      return
    }
    await applyDayTitle(day, title)
  }

  async function applyDayTitle(day, title) {
    const res = await track(fetch(`${API_BASE}/api/day-plans/${day}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, title }),
    }))
    if (!res.ok) throw new Error('Save failed')
    onDayTitleSaved?.(day, title)
  }

  // Mirrors handleGenerate in App.jsx (used by whole-plan regenerate) step
  // for step, just scoped to one day: get the exercise names first (no DB
  // writes yet), show the same thinking → per-exercise-progress overlay,
  // wipe the day's current exercises, then create each new one in parallel
  // via the same /api/exercises/generate every other add-exercise flow uses
  // — so the loading experience is the real thing, not a lookalike.
  async function handleRegenerateDayConfirm({ title, includeCurrent, comments }) {
    setRegenerateDayOpen(false)
    const day = selectedDay
    const previousTitle = dayTitles.get(day) || ''
    const removedItems = draft[day].filter((it) => it.id != null)

    setDayGenPhase('thinking')
    setDayGenStructure(null)
    setDayGenerating(true)

    try {
      // Saved (and pushed as its own undo entry, same as editing it from the
      // header) before requesting names, so the day-regen prompt reads the
      // new title straight from the DB rather than needing it threaded
      // through as a separate parameter. Skipped entirely if left blank or
      // unchanged — this field is optional, not "rename this day."
      if (title && title !== previousTitle) {
        await applyDayTitle(day, title)
        pushUndo({ kind: 'dayTitle', day, before: previousTitle, after: title })
      }
      const dayTitle = title || previousTitle || day

      const namesRes = await track(fetch(`${API_BASE}/api/plan/day/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, day, include_current: includeCurrent, comments }),
      }))
      if (!namesRes.ok) throw new Error('Failed to generate day')
      const { names } = await namesRes.json()

      setDayGenStructure([{ day, title: dayTitle, exercises: names, completed: 0, done: names.length === 0 }])
      setDayGenPhase('generating')

      if (removedItems.length > 0) {
        await persistPlan({ deletes: removedItems.map((it) => it.id) })
      }

      const createdRows = []
      await Promise.all(
        names.map(async (name) => {
          const res = await track(fetch(`${API_BASE}/api/exercises/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: name, day, user_id: userId }),
          }))
          if (res.ok) createdRows.push(await res.json())
          setDayGenStructure((prev) => prev.map((d) => {
            const completed = d.completed + 1
            return { ...d, completed, done: completed >= d.exercises.length }
          }))
        }),
      )

      const createdWithKeys = createdRows
        .map((row) => ({ ...row, _key: String(row.id) }))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      setDraft((current) => ({ ...current, [day]: createdWithKeys }))
      pushUndo({ kind: 'regenerateDay', day, removed: removedItems, created: createdRows })
    } catch {
      setActionError("Couldn't regenerate this day — check your connection and try again.")
    } finally {
      setDayGenerating(false)
    }
  }

  // A day regenerate is really two toggles bundled as one user action (wipe
  // the old exercises, create the new ones) — reuses setActive for both
  // halves rather than inventing separate machinery. toRegenerated selects
  // which side is "active": true = the regenerated state (created live,
  // removed gone), false = back to what was there before.
  async function applyRegenerateDay(entry, toRegenerated) {
    if (toRegenerated) {
      await Promise.all([setActive(entry.removed, false), setActive(entry.created, true)])
    } else {
      await Promise.all([setActive(entry.created, false), setActive(entry.removed, true)])
    }
  }

  async function handleUndo() {
    if (undoStack.length === 0) return
    const entry = undoStack[undoStack.length - 1]
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, entry])
    setSelectedKeys(new Set())
    try {
      if (entry.kind === 'toggle') await setActive(entry.items, entry.action === 'delete')
      else if (entry.kind === 'fields') await applyFieldsSnapshot(entry.days, false, entry.titles)
      else if (entry.kind === 'dayTitle') await applyDayTitle(entry.day, entry.before)
      else if (entry.kind === 'photo') await applyPhotoRevert(entry.id, entry.day, entry.key, entry.before)
      else if (entry.kind === 'regenerateDay') await applyRegenerateDay(entry, false)
    } catch {
      setActionError("Couldn't undo — check your connection and try again.")
    }
  }

  async function handleRedo() {
    if (redoStack.length === 0) return
    const entry = redoStack[redoStack.length - 1]
    setRedoStack((stack) => stack.slice(0, -1))
    setUndoStack((stack) => [...stack, entry])
    setSelectedKeys(new Set())
    try {
      if (entry.kind === 'toggle') await setActive(entry.items, entry.action === 'create')
      else if (entry.kind === 'fields') await applyFieldsSnapshot(entry.days, true, entry.titles)
      else if (entry.kind === 'dayTitle') await applyDayTitle(entry.day, entry.after)
      else if (entry.kind === 'photo') await applyPhotoRevert(entry.id, entry.day, entry.key, entry.after)
      else if (entry.kind === 'regenerateDay') await applyRegenerateDay(entry, true)
    } catch {
      setActionError("Couldn't redo — check your connection and try again.")
    }
  }

  // Creates a locally-staged item (no id yet — a blank manual entry, or one
  // pre-filled from a photo/title guess) for real, and reconciles its temp
  // `_key` with the server-assigned id — every later action on this item
  // (edit/delete/move/copy) keys off `id != null` to know it's real.
  async function createExercise(day, stagedItem) {
    const index = draft[day].findIndex((it) => it._key === stagedItem._key)
    const result = await persistPlan({
      creates: [{
        day,
        sort_order: index === -1 ? draft[day].length : index,
        name: stagedItem.name,
        sets: stagedItem.sets,
        reps: stagedItem.reps,
        weight: stagedItem.weight,
        duration: stagedItem.duration,
        description: stagedItem.description,
        bullets: stagedItem.bullets,
        video_id: stagedItem.video_id,
        category: stagedItem.category,
      }],
    })
    const createdRow = result.created?.[0]
    if (!createdRow) throw new Error('Create failed')
    const newKey = String(createdRow.id)
    setDraft((current) => ({
      ...current,
      [day]: current[day].map((it) => (it._key === stagedItem._key ? { ...createdRow, _key: newKey } : it)),
    }))
    pushUndo({ kind: 'toggle', action: 'create', items: [createdRow] })
    return { ...createdRow, _key: newKey }
  }

  const dayExercises = draft[selectedDay]
  const isSelecting = selectedKeys.size > 0

  function findItem(key) {
    for (const day of WEEKDAYS) {
      const item = draft[day].find((it) => it._key === key)
      if (item) return { day, item }
    }
    return null
  }

  const editingEntry = editingKey ? findItem(editingKey) : null

  function handleOpenEdit(key) {
    // The temporary add-exercise card is scaffolding for the add flow, not a
    // real draft item — if one's left sitting open (mode picker, title
    // search, etc.) and the user taps a different card instead, drop it
    // rather than leaving it in the list unresolved.
    setDraft((current) => {
      let changed = false
      const next = {}
      for (const day of Object.keys(current)) {
        const filtered = current[day].filter((it) => !it.isPendingAdd)
        if (filtered.length !== current[day].length) changed = true
        next[day] = filtered
      }
      return changed ? next : current
    })
    if (editingKey === key) {
      setEditingKey(null)
      setEditPanelExpanded(false)
    } else {
      setEditingKey(key)
      setEditPanelExpanded(false)
    }
  }

  function closeEditPanel() {
    // A manual add left with no name typed in was never created server-side
    // (see commitEditField below) — drop it locally rather than leaving an
    // empty-titled card sitting in the list.
    if (editingEntry && editingEntry.item.id == null && !editingEntry.item.name.trim()) {
      const { day } = editingEntry
      setDraft((current) => ({
        ...current,
        [day]: current[day].filter((it) => it._key !== editingKey),
      }))
    }
    setEditingKey(null)
    setEditPanelExpanded(false)
  }

  // Deletes the exercise currently open in the field-edit panel — same
  // effect as the bulk checkbox-select Delete, just for the one card that's
  // already "open" instead of requiring a separate checkbox tap first.
  async function handleDeleteEditing() {
    if (!editingEntry) return
    const { day, item } = editingEntry
    setEditingKey(null)
    setEditPanelExpanded(false)

    if (item.id == null) {
      // Never created server-side — just drop the local stage.
      setDraft((current) => ({ ...current, [day]: current[day].filter((it) => it._key !== item._key) }))
      return
    }

    const previous = draft[day]
    setDraft((current) => ({ ...current, [day]: current[day].filter((it) => it._key !== item._key) }))
    try {
      await persistPlan({ deletes: [item.id] })
      pushUndo({ kind: 'toggle', action: 'delete', items: [item] })
    } catch {
      setDraft((current) => ({ ...current, [day]: previous }))
      setActionError("Couldn't delete that exercise — check your connection and try again.")
    }
  }

  // Drops a blank placeholder card into the draft at the exact position the
  // tapped + sits at — day/index are resolved by the caller from that +'s
  // position in the currently-viewed day's list. Purely local — nothing
  // worth persisting until a mode (Manual/Title search/Photo search) turns
  // it into an actual exercise.
  function handleInsertPlaceholder(day, index) {
    const key = `pending-${newKeyCounter.current++}`
    setDraft((current) => {
      const list = [...current[day]]
      list.splice(index, 0, { _key: key, day, isPendingAdd: true })
      return { ...current, [day]: list }
    })
    // The dividers/panel belong to whichever card is "open" — once a
    // placeholder is inserted, that's no longer the previously-editing
    // card, so close it out rather than leaving its dividers showing too.
    setEditingKey(null)
    setEditPanelExpanded(false)
  }

  // Turns a placeholder into a blank, still-local (no id yet) draft item and
  // opens it straight in the field-edit panel. Nothing is created server-side
  // until a name is actually typed (see commitEditField) — an exercise with
  // no name isn't a real thing worth persisting yet.
  function handleManualAdd(key) {
    const found = findItem(key)
    if (!found) return
    const { day } = found
    setDraft((current) => ({
      ...current,
      [day]: current[day].map((it) => (it._key === key ? {
        _key: it._key,
        day,
        id: undefined,
        name: '',
        sets: 3,
        reps: 10,
        weight: 0,
        duration: null,
        description: '',
        bullets: [],
        category: 'free_weight',
        video_id: null,
        photo: null,
      } : it)),
    }))
    setEditingKey(key)
    setEditPanelExpanded(true)
  }

  // Creates the exercise for real, pre-filled with AI-generated data, once
  // the user has confirmed a name guessed from a photo (see PendingAddCard's
  // photo-search mode) — same generateExerciseData pipeline used when a
  // whole plan is first generated, just triggered per-exercise here instead.
  // Also attaches photoFile (the same photo that was used to identify it) as
  // the new exercise's saved photo. Opens straight in the field-edit panel
  // so the user can keep refining it, same as manual/title-search adds.
  async function handlePhotoAdd(key, generated, photoFile) {
    const found = findItem(key)
    if (!found) return
    const { day, item } = found
    const stagedItem = { ...item, ...generated, isPendingAdd: false, id: undefined }
    setDraft((current) => ({
      ...current,
      [day]: current[day].map((it) => (it._key === key ? stagedItem : it)),
    }))
    try {
      const created = await createExercise(day, stagedItem)
      setEditingKey(created._key)
      setEditPanelExpanded(true)

      // The same photo used to identify this exercise becomes its saved
      // photo too — no reason to make the user upload it again from the
      // edit panel. Best-effort: the exercise itself is already created and
      // real by this point, so a failure here just leaves it photo-less,
      // not undone.
      if (photoFile) {
        try {
          const body = new FormData()
          body.append('file', photoFile)
          const res = await track(fetch(`${API_BASE}/api/exercises/${created.id}/photo`, { method: 'POST', body }))
          if (res.ok) {
            const updated = await res.json()
            setDraft((current) => ({
              ...current,
              [day]: current[day].map((it) => (it._key === created._key ? { ...it, photo: updated.photo } : it)),
            }))
          }
        } catch {
          // Silently no-op — the exercise stays photo-less, addable manually.
        }
      }
    } catch {
      setActionError("Couldn't add that exercise — check your connection and try again.")
      setDraft((current) => ({ ...current, [day]: current[day].filter((it) => it._key !== key) }))
    }
  }

  // Not-yet-created items (id == null — a blank manual entry, or one that
  // failed to create) only stage locally until they have a name; the first
  // non-empty name commit is what actually creates the exercise. Every other
  // field on an already-real item persists immediately.
  async function commitEditField(field, value) {
    if (!editingEntry) return
    const { day, item } = editingEntry
    const unchanged = field === 'bullets'
      ? JSON.stringify(item.bullets) === JSON.stringify(value)
      : item[field] === value
    if (unchanged) return

    const nextItem = { ...item, [field]: value }

    if (item.id == null) {
      setDraft((current) => ({
        ...current,
        [day]: current[day].map((it) => (it._key === editingKey ? nextItem : it)),
      }))
      if (field === 'name' && value.trim()) {
        try {
          const created = await createExercise(day, nextItem)
          setEditingKey(created._key)
        } catch {
          setActionError("Couldn't create that exercise — check your connection and try again.")
        }
      }
      return
    }

    const before = draft[day]
    const after = before.map((it) => (it._key === editingKey ? nextItem : it))
    setDraft((current) => ({ ...current, [day]: after }))
    try {
      await persistPlan({ updates: [toUpdatePayload(nextItem, day, before.findIndex((it) => it._key === editingKey))] })
      pushUndo({ kind: 'fields', days: { [day]: { before, after } } })
    } catch {
      setDraft((current) => ({ ...current, [day]: before }))
      setActionError("Couldn't save that change — check your connection and try again.")
    }
  }

  // Photo changes are already persisted server-side the moment they happen
  // (upload/URL hit the backend directly, unlike every other field) — so
  // this only needs to reflect the new value locally for display.
  // The upload/URL/remove itself already happened server-side by the time
  // this fires (see ExerciseEditPanel's own photo handlers) — the old file
  // is marked orphaned rather than deleted (photoSweep.js), so this is
  // fully undoable via the 'photo' entry below, same as everything else.
  function handlePhotoChange(photo) {
    if (!editingEntry) return
    const { day, item } = editingEntry
    const before = item.photo
    setDraft((current) => ({
      ...current,
      [day]: current[day].map((it) => (it._key === editingKey ? { ...it, photo } : it)),
    }))
    if (before !== photo) {
      pushUndo({ kind: 'photo', id: item.id, day, key: editingKey, before, after: photo })
    }
  }

  // Every change already persisted the moment it happened — closing just
  // tells the parent to refetch (it's holding a snapshot from before this
  // session's edits) and dismisses the view. No discard-confirmation needed;
  // there's nothing left unsaved to lose.
  function handleCancel() {
    onSaved?.()
    onClose()
  }

  useEffect(() => {
    setEditingDayTitle(false)
  }, [selectedDay])

  function startEditDayTitle() {
    setDayTitleDraft(dayTitles.get(selectedDay) || '')
    setEditingDayTitle(true)
  }

  function cancelEditDayTitle() {
    setEditingDayTitle(false)
  }

  // Renaming a day's title persists immediately, same as everything else —
  // still fully undoable (it's just text, nothing gets destroyed by
  // changing it) via its own 'dayTitle' undo-stack entry below.
  // onDayTitleSaved updates App's dayTitles state directly so the new title
  // shows without a refetch.
  async function confirmEditDayTitle() {
    const trimmed = dayTitleDraft.trim()
    if (!trimmed) return
    const before = dayTitles.get(selectedDay) || ''
    if (before === trimmed) {
      setEditingDayTitle(false)
      return
    }
    setSavingDayTitle(true)
    try {
      await applyDayTitle(selectedDay, trimmed)
      pushUndo({ kind: 'dayTitle', day: selectedDay, before, after: trimmed })
      setEditingDayTitle(false)
    } catch {
      // Silently no-op on failure for now — the title just stays as it was.
    } finally {
      setSavingDayTitle(false)
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const chainValidity = computeChainValidity(reorderChain)
  const reorderActiveIndex = activeSlotIndex(reorderChain)
  const reorderHoleSpan = firstHoleSpan(reorderChain)
  const reorderSlotCount = Math.min(8, Math.max(3, lastFilledIndex(reorderChain) + 2))

  function toggleSelect(key) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Builds an `updates` entry with the full field set persistPlan expects —
  // used wherever an already-real item's position/day changes without its
  // own fields changing (reorder, move).
  function toUpdatePayload(item, day, sort_order) {
    return {
      id: item.id, day, sort_order,
      name: item.name, sets: item.sets, reps: item.reps, weight: item.weight, duration: item.duration,
      description: item.description, bullets: item.bullets, video_id: item.video_id, category: item.category,
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const list = draft[selectedDay]
    const oldIndex = list.findIndex((item) => item._key === active.id)
    const newIndex = list.findIndex((item) => item._key === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(list, oldIndex, newIndex)
    setDraft((current) => ({ ...current, [selectedDay]: reordered }))

    const updates = reordered
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.id != null)
      .map(({ item, index }) => toUpdatePayload(item, selectedDay, index))
    if (updates.length === 0) return
    try {
      await persistPlan({ updates })
      pushUndo({ kind: 'fields', days: { [selectedDay]: { before: list, after: reordered } } })
    } catch {
      setDraft((current) => ({ ...current, [selectedDay]: list }))
      setActionError("Couldn't save the new order — check your connection and try again.")
    }
  }

  // Index of the last filled (non-null) slot, or -1 if the chain is empty.
  // Trailing nulls beyond this point are just unallocated buffer — never a
  // "hole".
  function lastFilledIndex(chain) {
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i] != null) return i
    return -1
  }

  // The one real interactive target: the leftmost unfilled index before the
  // end of the chain (a hole) if one exists, otherwise the next new slot
  // right after the end. Enforces "fill holes first, then grow at the end"
  // with no extra bookkeeping.
  function activeSlotIndex(chain) {
    const last = lastFilledIndex(chain)
    for (let i = 0; i < last; i++) if (chain[i] == null) return i
    return last + 1
  }

  // The contiguous run of empty cells starting at the first hole, or null if
  // there's no hole (the active slot is just the next-to-grow position at
  // the end). Only this first hole gets the colored highlight — any further
  // hole stays muted until this one is filled.
  function firstHoleSpan(chain) {
    const last = lastFilledIndex(chain)
    const start = activeSlotIndex(chain)
    if (start >= last) return null
    let end = start
    while (end + 1 < last && chain[end + 1] == null) end++
    return { start, end }
  }

  // A day can be dragged again as long as it hasn't already appeared as many
  // times as it's allowed to: the chain's first day is allowed to reappear
  // once more (to close a loop and become the final element), every other
  // day only once. Pulling a day back out of the chain (leaving it null)
  // naturally frees it up again here.
  function isDayAvailableToDrag(day) {
    const isFirst = reorderChain[0] === day
    const usedCount = reorderChain.filter((d) => d === day).length
    return usedCount < (isFirst ? 2 : 1)
  }

  // null = incomplete (fewer than 2 days picked yet, or a hole still needs
  // filling), false = illegal, true = safe to apply. A closed loop
  // (chain[0] === last) never destroys data since everything just rotates.
  // An open chain empties chain[0] and only stays legal if the final day was
  // already empty.
  function computeChainValidity(chain) {
    const last = lastFilledIndex(chain)
    if (last < 1) return null
    if (firstHoleSpan(chain)) return null
    const filled = chain.slice(0, last + 1)
    if (new Set(filled).size < 2) return false
    const isLoop = filled[0] === filled[filled.length - 1]
    if (!isLoop) {
      const lastDay = filled[filled.length - 1]
      if (draft[lastDay].some((it) => !it.isPendingAdd)) return false
    }
    return true
  }

  // Mirrors computeChainValidity's false-branches with a human-readable
  // explanation — only ever shown once the chain is actually illegal, never
  // while it's just incomplete.
  function getChainInvalidReason(chain) {
    const last = lastFilledIndex(chain)
    if (last < 1 || firstHoleSpan(chain)) return null
    const filled = chain.slice(0, last + 1)
    if (new Set(filled).size < 2) return 'Self day move is not possible'
    const isLoop = filled[0] === filled[filled.length - 1]
    if (!isLoop) {
      const lastDay = filled[filled.length - 1]
      if (draft[lastDay].some((it) => !it.isPendingAdd)) {
        return `${lastDay} is not empty`
      }
    }
    return null
  }

  // While a drag is in progress, which blueprint slots are legal drop
  // targets depends on where the drag started: a day pulled fresh from the
  // day row must still land on the one strict "next gap" slot (fill holes
  // before growing the end), but a day already placed in the chain can move
  // to any other slot — into a hole, past the end, or onto another filled
  // day to swap with it.
  function isSlotDroppable(i) {
    if (activeDragSource === 'reorder-chain') return i !== activeDragIndex
    if (activeDragSource === 'day-collection') return i === reorderActiveIndex
    return false
  }

  function handleReorderDragStart(event) {
    const data = event.active.data.current
    if (!data) { setActiveDragDay(null); setActiveDragSource(null); setActiveDragIndex(null); return }
    const day = data.source === 'day-collection' ? data.day : reorderChain[data.chainIndex]
    setActiveDragDay(day ?? null)
    setActiveDragSource(data.source)
    setActiveDragIndex(data.source === 'reorder-chain' ? data.chainIndex : null)
  }

  function handleReorderDragEnd(event) {
    setActiveDragDay(null)
    setActiveDragSource(null)
    setActiveDragIndex(null)
    const { active, over } = event
    if (!over) return
    const data = active.data.current
    if (!data) return
    if (data.source === 'day-collection') {
      const day = data.day
      const idx = activeSlotIndex(reorderChain)
      if (over.id !== `reorder-slot-${idx}`) return
      if (!isDayAvailableToDrag(day)) return
      setReorderChain((chain) => {
        const next = [...chain]
        while (next.length <= idx) next.push(null)
        next[idx] = day
        return next
      })
    } else if (data.source === 'reorder-chain') {
      const fromIdx = data.chainIndex
      if (over.id === 'day-collection') {
        setReorderChain((chain) => {
          const next = [...chain]
          next[fromIdx] = null
          return next
        })
        return
      }
      const match = /^reorder-slot-(\d+)$/.exec(over.id)
      if (!match) return
      const toIdx = Number(match[1])
      if (toIdx === fromIdx) return
      setReorderChain((chain) => {
        const next = [...chain]
        while (next.length <= toIdx) next.push(null)
        const displaced = next[toIdx] ?? null
        next[toIdx] = next[fromIdx]
        next[fromIdx] = displaced
        return next
      })
    }
  }

  function toggleReorderMode() {
    setDayReorderMode((v) => !v)
    setReorderChain([])
  }

  function cancelReorder() {
    setDayReorderMode(false)
    setReorderChain([])
    setShowMoreOptions(false)
  }

  // Reuses the existing 'fields' undo entry shape — this is just a multi-day
  // field/position change, the same primitive reorder and move already use
  // — extended with a parallel `titles` snapshot so each day's title flows
  // along the chain exactly like its exercises do.
  async function applyReorderChain() {
    if (computeChainValidity(reorderChain) !== true) return
    const chain = reorderChain.slice(0, lastFilledIndex(reorderChain) + 1)
    setApplyingReorder(true)
    const uniqueDays = [...new Set(chain)]
    const before = {}
    const titleBefore = {}
    for (const day of uniqueDays) {
      before[day] = draft[day]
      titleBefore[day] = dayTitles.get(day) || ''
    }
    const after = {}
    const titleAfter = {}
    for (let i = 0; i < chain.length - 1; i++) { after[chain[i]] = []; titleAfter[chain[i]] = '' }
    for (let i = 0; i < chain.length - 1; i++) {
      const sourceDay = chain[i]
      const destDay = chain[i + 1]
      after[destDay] = before[sourceDay].map((item) => ({ ...item, day: destDay }))
      titleAfter[destDay] = titleBefore[sourceDay]
    }
    // Exiting reorder mode has to land in the very same render as the
    // optimistic draft update below — otherwise there's a brief window
    // where computeChainValidity re-reads the now-already-swapped draft
    // against the still-unset reorderChain and misfires "day is not empty"
    // on a perfectly legal chain.
    setDraft((current) => ({ ...current, ...after }))
    setDayReorderMode(false)
    setReorderChain([])
    setShowMoreOptions(false)
    const updates = []
    for (const day of Object.keys(after)) {
      after[day].forEach((item, index) => {
        if (item.id != null) updates.push(toUpdatePayload(item, day, index))
      })
    }
    try {
      if (updates.length > 0) await persistPlan({ updates })
      const changedTitleDays = uniqueDays.filter((day) => titleAfter[day] !== titleBefore[day])
      if (changedTitleDays.length > 0) {
        await Promise.all(changedTitleDays.map((day) => setDayTitle(day, titleAfter[day])))
      }
      pushUndo({
        kind: 'fields',
        days: Object.fromEntries(uniqueDays.map((day) => [day, { before: before[day], after: after[day] ?? before[day] }])),
        titles: Object.fromEntries(
          changedTitleDays.map((day) => [day, { before: titleBefore[day], after: titleAfter[day] }]),
        ),
      })
    } catch {
      setDraft((current) => ({ ...current, ...before }))
      setActionError("Couldn't reorder days — check your connection and try again.")
    } finally {
      setApplyingReorder(false)
    }
  }

  async function handleDelete() {
    const deletedItems = []
    const previous = draft
    const next = {}
    for (const day of WEEKDAYS) {
      next[day] = draft[day].filter((item) => {
        if (!selectedKeys.has(item._key)) return true
        if (item.id != null) deletedItems.push(item)
        return false
      })
    }
    setDraft(next)
    setSelectedKeys(new Set())
    if (deletedItems.length === 0) return
    try {
      await persistPlan({ deletes: deletedItems.map((it) => it.id) })
      pushUndo({ kind: 'toggle', action: 'delete', items: deletedItems })
    } catch {
      setDraft(previous)
      setActionError("Couldn't delete — check your connection and try again.")
    }
  }

  async function handleMoveOrCopy(targetDay) {
    const isMove = sheet === 'move'
    const moving = []
    for (const day of WEEKDAYS) {
      for (const item of draft[day]) {
        if (selectedKeys.has(item._key) && item.id != null) moving.push(item)
      }
    }
    setSelectedKeys(new Set())
    setSheet(null)
    setSelectedDay(targetDay)
    if (moving.length === 0) return

    if (isMove) {
      const previous = draft
      const next = {}
      for (const day of WEEKDAYS) next[day] = draft[day].filter((item) => !selectedKeys.has(item._key))
      next[targetDay] = [...next[targetDay], ...moving.map((item) => ({ ...item, day: targetDay }))]
      setDraft(next)

      const touchedDays = new Set([...moving.map((m) => m.day), targetDay])
      const updates = []
      const daysSnapshot = {}
      for (const day of touchedDays) {
        daysSnapshot[day] = { before: previous[day], after: next[day] }
        next[day].forEach((item, index) => {
          if (item.id != null) updates.push(toUpdatePayload(item, day, index))
        })
      }
      try {
        await persistPlan({ updates })
        pushUndo({ kind: 'fields', days: daysSnapshot })
      } catch {
        setDraft(previous)
        setActionError("Couldn't move — check your connection and try again.")
      }
    } else {
      const baseIndex = draft[targetDay].length
      const copies = moving.map((item, i) => ({ sourceId: item.id, day: targetDay, sort_order: baseIndex + i }))
      try {
        const result = await persistPlan({ copies })
        const createdRows = result.copied || []
        setDraft((current) => ({
          ...current,
          [targetDay]: [...current[targetDay], ...createdRows.map((row) => ({ ...row, _key: String(row.id) }))],
        }))
        if (createdRows.length > 0) pushUndo({ kind: 'toggle', action: 'create', items: createdRows })
      } catch {
        setActionError("Couldn't copy — check your connection and try again.")
      }
    }
  }

  return (
    <div className="edit-plan-view">
      <div className="edit-plan-header">
        <div>
          <div className="edit-plan-title-row">
            <h2 className="edit-plan-title">Edit Plan</h2>
            <span
              className={`edit-plan-sync-status ${pendingCount > 0 ? 'is-pending' : 'is-synced'}`}
              role="status"
              aria-label={pendingCount > 0 ? 'Saving…' : 'Saved'}
            >
              <CloudIcon size={16} />
              <span className={`edit-plan-sync-label ${showSaved ? 'is-visible' : ''}`}>Saved</span>
            </span>
          </div>
          {editingDayTitle ? (
            <div className="edit-plan-day-title-edit">
              <input
                type="text"
                className="edit-plan-day-title-input"
                value={dayTitleDraft}
                onChange={(e) => setDayTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmEditDayTitle()
                  if (e.key === 'Escape') cancelEditDayTitle()
                }}
                autoFocus
              />
              <button
                type="button"
                className="edit-plan-day-title-confirm"
                onClick={confirmEditDayTitle}
                disabled={savingDayTitle || !dayTitleDraft.trim()}
                aria-label="Save day title"
              >
                <CheckIcon size={13} />
              </button>
              <button
                type="button"
                className="edit-plan-day-title-cancel"
                onClick={cancelEditDayTitle}
                aria-label="Cancel"
              >
                <XIcon size={12} />
              </button>
            </div>
          ) : (
            <div className="edit-plan-day-title-row">
              <span className="edit-plan-day-subtitle">
                {dayLabel(dayTitles.get(selectedDay), dayExercises.some((it) => !it.isPendingAdd))}
              </span>
              <button
                type="button"
                className="edit-plan-day-title-edit-btn"
                onClick={startEditDayTitle}
                aria-label="Edit day title"
              >
                <EditFieldIcon size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="edit-plan-header-right">
          <button
            type="button"
            className={`edit-plan-icon-btn ${showMoreOptions ? 'is-active' : ''}`}
            onClick={() => { if (!dayReorderMode) setShowMoreOptions((v) => !v) }}
            aria-label="More options"
          >
            <KebabIcon size={17} />
          </button>
          {showMoreOptions ? (
            <>
              {/* Import/Export is still a placeholder. Day reordering is
                  live — while active, Apply/Cancel appear to its left. */}
              {dayReorderMode && (
                <>
                  <button
                    type="button"
                    className="edit-plan-icon-btn"
                    onClick={applyReorderChain}
                    disabled={chainValidity !== true || applyingReorder}
                    aria-label="Apply day reorder"
                  >
                    <CheckIcon size={17} />
                  </button>
                  <button
                    type="button"
                    className="edit-plan-icon-btn"
                    onClick={cancelReorder}
                    aria-label="Cancel day reorder"
                  >
                    <XIcon size={16} />
                  </button>
                </>
              )}
              <button
                type="button"
                className={`edit-plan-pill-btn ${dayReorderMode ? 'is-filled' : ''}`}
                onClick={toggleReorderMode}
              >
                <span>Reorder days</span>
              </button>
              {!dayReorderMode && (
                <button type="button" className="edit-plan-pill-btn" disabled>
                  <span>Import/Export</span>
                </button>
              )}
            </>
          ) : isSelecting ? (
            <>
              <button type="button" className="edit-plan-icon-btn" onClick={handleDelete} aria-label="Delete">
                <TrashIcon size={17} />
              </button>
              <button type="button" className="edit-plan-pill-btn" onClick={() => setSheet('copy')}>
                <CopyIcon size={14} />
                <span>Copy to</span>
              </button>
              <button type="button" className="edit-plan-pill-btn" onClick={() => setSheet('move')}>
                <MoveIcon size={14} />
                <span>Move to</span>
              </button>
            </>
          ) : (
            <>
              {editingEntry && (
                <button
                  type="button"
                  className="edit-plan-icon-btn"
                  onClick={handleDeleteEditing}
                  aria-label="Delete exercise"
                >
                  <TrashIcon size={17} />
                </button>
              )}
              <button type="button" className="edit-plan-icon-btn" onClick={handleUndo} disabled={undoStack.length === 0} aria-label="Undo">
                <UndoIcon size={21} />
              </button>
              <button type="button" className="edit-plan-icon-btn" onClick={handleRedo} disabled={redoStack.length === 0} aria-label="Redo">
                <RedoIcon size={21} />
              </button>
              <div className="edit-plan-category-picker">
                <button
                  type="button"
                  className="edit-plan-pill-btn is-filled"
                  onClick={() => setShowGenerateMenu((v) => !v)}
                >
                  <GenerateIcon size={14} />
                  <span>Generate</span>
                </button>
                {showGenerateMenu && (
                  <div className="edit-plan-generate-menu">
                    <button
                      type="button"
                      className="edit-plan-generate-option"
                      onClick={() => { setShowGenerateMenu(false); onRegeneratePlan?.() }}
                    >
                      <span>Regenerate plan</span>
                    </button>
                    <div className="edit-plan-generate-divider" />
                    <button
                      type="button"
                      className="edit-plan-generate-option"
                      onClick={() => { setShowGenerateMenu(false); setRegenerateDayOpen(true) }}
                    >
                      <span>Regenerate day</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <button type="button" className="edit-plan-close-btn" onClick={handleCancel} aria-label="Close">
            <XIcon size={16} />
          </button>
        </div>
      </div>

      {dayReorderMode ? (
        <DndContext sensors={sensors} onDragStart={handleReorderDragStart} onDragEnd={handleReorderDragEnd}>
          <div className={`edit-plan-reorder-blueprint ${chainValidity === false ? 'is-invalid' : ''}`}>
            {Array.from({ length: reorderSlotCount }).map((_, i) => (
              <div key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className="edit-plan-reorder-arrow">→</span>}
                <ReorderBlueprintSlot
                  index={i}
                  day={reorderChain[i] ?? null}
                  activeTarget={i === reorderActiveIndex}
                  colored={!!reorderHoleSpan && i >= reorderHoleSpan.start && i <= reorderHoleSpan.end}
                  invalid={chainValidity === false}
                  canDrop={isSlotDroppable(i)}
                  active={!!reorderChain[i] && selectedDay === reorderChain[i]}
                  onSelect={setSelectedDay}
                />
              </div>
            ))}
          </div>
          {chainValidity === false && (
            <p className="edit-plan-reorder-error">{getChainInvalidReason(reorderChain)}</p>
          )}
          <DayCollectionZone isEmpty={WEEKDAYS.every((day) => !isDayAvailableToDrag(day))}>
            {WEEKDAYS.map((day, i) => (
              isDayAvailableToDrag(day) && (
                <DraggableDayPill
                  key={day}
                  day={day}
                  label={WEEKDAYS_SHORT[i]}
                  active={selectedDay === day}
                  draggable
                  onClick={() => setSelectedDay(day)}
                />
              )
            ))}
          </DayCollectionZone>
          <DragOverlay dropAnimation={null} zIndex={2000}>
            {activeDragDay ? (
              <div className="edit-plan-day-pill is-drag-overlay">
                {WEEKDAYS_SHORT[WEEKDAYS.indexOf(activeDragDay)]}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="edit-plan-day-pills">
          {WEEKDAYS.map((day, i) => (
            <button
              key={day}
              type="button"
              className={`edit-plan-day-pill ${selectedDay === day ? 'is-active' : ''}`}
              onClick={() => setSelectedDay(day)}
            >
              {WEEKDAYS_SHORT[i]}
            </button>
          ))}
        </div>
      )}

      {actionError && <p className="edit-plan-save-error">{actionError}</p>}

      <div className={`edit-plan-list ${editingEntry ? 'has-edit-panel' : ''}`}>
        {dayExercises.length === 0 ? (
          <div className="edit-plan-empty-day">
            <p className="edit-plan-empty">No exercises scheduled for {selectedDay}.</p>
            {!dayReorderMode && (
              <div className="edit-plan-empty-day-actions">
                <button
                  type="button"
                  className="edit-plan-pill-btn is-filled"
                  onClick={() => handleInsertPlaceholder(selectedDay, 0)}
                >
                  <PlusIcon size={16} />
                  <span>Add exercise</span>
                </button>
                <button type="button" className="edit-plan-pill-btn" disabled>
                  <TreadmillIcon size={16} />
                  <span>Set cardio day</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={dayExercises.map((item) => item._key)} strategy={verticalListSortingStrategy}>
              {dayExercises.map((item, i) => (
                <div key={item._key} style={{ display: 'contents' }}>
                  {!dayReorderMode && editingKey === item._key && (
                    <InsertDivider bleedTop={i > 0} onInsert={() => handleInsertPlaceholder(selectedDay, i)} />
                  )}
                  <SortableCard
                    item={item}
                    selected={selectedKeys.has(item._key)}
                    editing={editingKey === item._key}
                    onToggleSelect={toggleSelect}
                    onOpenEdit={handleOpenEdit}
                    onManualAdd={handleManualAdd}
                    onPhotoAdd={handlePhotoAdd}
                    userId={userId}
                    readOnly={dayReorderMode}
                  />
                  {!dayReorderMode && editingKey === item._key && (
                    <InsertDivider
                      bleedBottom={i < dayExercises.length - 1}
                      onInsert={() => handleInsertPlaceholder(selectedDay, i + 1)}
                    />
                  )}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {editingEntry && (
        <ExerciseEditPanel
          item={editingEntry.item}
          expanded={editPanelExpanded}
          onToggleExpanded={() => setEditPanelExpanded((v) => !v)}
          onClose={closeEditPanel}
          onCommitField={commitEditField}
          onDelete={handleDeleteEditing}
          onPhotoChange={handlePhotoChange}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          track={track}
        />
      )}

      {sheet && (
        <DayPickerSheet
          title={sheet === 'move' ? 'Move to' : 'Copy to'}
          currentDay={selectedDay}
          dayTitles={dayTitles}
          draft={draft}
          onPick={handleMoveOrCopy}
          onCancel={() => setSheet(null)}
        />
      )}

      {regenerateDayOpen && (
        <RegenerateDayModal
          dayTitle={dayTitles.get(selectedDay) || ''}
          onClose={() => setRegenerateDayOpen(false)}
          onConfirm={handleRegenerateDayConfirm}
        />
      )}

      {dayGenerating && (
        <PlanGeneratingOverlay phase={dayGenPhase} planStructure={dayGenStructure} />
      )}
    </div>
  )
}

export default EditPlanView
