import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
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
import SaveIcon from './icons/SaveIcon'
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
// (tapped body, not checkbox) — a vertical dotted line at the checkbox's
// x-position with a round + in the middle, hinting at inserting a new
// exercise at that exact spot. Purely visual for now: the actual
// add-exercise flow (title search / photo / manual entry) is a later phase,
// so the + button has no handler yet.
// bleedTop/bleedBottom control whether the line extends past this divider's
// own box on that side to reach a neighboring card — false when there is no
// neighbor that direction (this is the first/last card), so the line just
// stops at the + button instead of trailing off into empty space.
function InsertDivider({ bleedTop = true, bleedBottom = true }) {
  return (
    <div className="edit-plan-insert-divider">
      <span
        className="edit-plan-insert-line"
        style={{ top: bleedTop ? -8 : '50%', bottom: bleedBottom ? -8 : '50%' }}
        aria-hidden="true"
      />
      <button type="button" className="edit-plan-insert-plus" aria-label="Insert exercise here">
        <PlusIcon size={14} />
      </button>
    </div>
  )
}

function SortableCard({ item, selected, editing, onToggleSelect, onOpenEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  const Icon = CATEGORY_ICONS[item.category]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`edit-plan-card ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}
      onClick={() => onOpenEdit(item._key)}
    >
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
      <button
        type="button"
        className={`edit-plan-checkbox ${selected ? 'is-checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(item._key) }}
        aria-label={selected ? 'Deselect exercise' : 'Select exercise'}
      >
        {selected && <CheckIcon size={12} />}
      </button>
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

function DayPickerSheet({ title, currentDay, dayTitles, onPick, onCancel }) {
  return (
    <div className="edit-plan-sheet-backdrop" onClick={onCancel}>
      <div className="edit-plan-sheet" onClick={(e) => e.stopPropagation()}>
        <h3 className="edit-plan-sheet-title">{title}</h3>
        <div className="edit-plan-sheet-days">
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={`edit-plan-sheet-day ${day === currentDay ? 'is-current' : ''}`}
              onClick={() => onPick(day)}
            >
              <span>{day}</span>
              <span className="edit-plan-sheet-day-title">{dayTitles.get(day) || 'Rest day'}</span>
            </button>
          ))}
        </div>
        <button type="button" className="edit-plan-sheet-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
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
  item, expanded, onToggleExpanded, onClose, onCommitField,
  canUndo, canRedo, onUndo, onRedo, onPhotoChange,
}) {
  const [form, setForm] = useState(item)
  const [uploading, setUploading] = useState(false)
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
  const fileInputRef = useRef(null)
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
  }, [item])

  const hasDuration = item.duration != null
  const canUploadPhoto = !item.isNew
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

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${API_BASE}/api/exercises/${item.id}/photo`, { method: 'POST', body })
      if (!res.ok) throw new Error('Upload failed')
      const updated = await res.json()
      onPhotoChange(updated.photo)
    } catch {
      // Silently no-op on failure for now — the thumbnail just stays as it was.
    } finally {
      setUploading(false)
    }
  }

  async function applyPhotoUrl(url) {
    setUploading(true)
    try {
      const res = await fetch(`${API_BASE}/api/exercises/${item.id}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
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
      const res = await fetch(`${API_BASE}/api/exercises/${item.id}/photo`, { method: 'DELETE' })
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

          <label className="edit-plan-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onBlur={(e) => onCommitField('name', e.target.value)}
            />
          </label>

          {hasDuration ? (
            <label className="edit-plan-field edit-plan-field-narrow">
              <span>Duration (sec)</span>
              <input
                type="number"
                value={form.duration ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                onBlur={(e) => onCommitField('duration', Number(e.target.value) || 0)}
              />
            </label>
          ) : (
            <div className="edit-plan-field-row">
              <label className="edit-plan-field edit-plan-field-narrow">
                <span>Sets</span>
                <input
                  type="number"
                  value={form.sets ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, sets: e.target.value }))}
                  onBlur={(e) => onCommitField('sets', Number(e.target.value) || 0)}
                />
              </label>
              <label className="edit-plan-field edit-plan-field-narrow">
                <span>Reps</span>
                <input
                  type="number"
                  value={form.reps ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, reps: e.target.value }))}
                  onBlur={(e) => onCommitField('reps', Number(e.target.value) || 0)}
                />
              </label>
              <label className="edit-plan-field edit-plan-field-narrow">
                <span>Weight (kg)</span>
                <input
                  type="number"
                  value={form.weight ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                  onBlur={(e) => onCommitField('weight', Number(e.target.value) || 0)}
                />
              </label>
            </div>
          )}

          <span className="edit-plan-field-label">Photo</span>
          <div className="edit-plan-photo-row">
            <div className="edit-plan-photo-square">
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
                <PhotoIcon size={36} className="edit-plan-photo-placeholder" />
              )}
            </div>
            <div className="edit-plan-photo-actions">
              <button type="button" className="edit-plan-photo-btn" disabled aria-label="Take photo">
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

// Phase 2: structural editing on top of Phase 1's skeleton — drag-handle
// reorder, checkbox multi-select, Delete, Move to/Copy to another day, and a
// real Save that commits the whole-plan draft in one request (Cancel just
// discards it, no server round-trip). No AI involved yet; this only
// restructures exercises that already exist. See the manual-edit-mode design
// notes in memory for the full spec this is being built toward.
function EditPlanView({ allExercises, dayTitles, userId, onSaved, onDayTitleSaved, onClose }) {
  const [selectedDay, setSelectedDay] = useState(WEEKDAYS[new Date().getDay()])
  const [editingDayTitle, setEditingDayTitle] = useState(false)
  const [dayTitleDraft, setDayTitleDraft] = useState('')
  const [savingDayTitle, setSavingDayTitle] = useState(false)
  const [draft, setDraft] = useState(() => groupByDay(allExercises))
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [sheet, setSheet] = useState(null) // 'move' | 'copy' | null
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  // Tapping a card body (not its checkbox or drag handle) opens this single
  // exercise for field-level editing — distinct from selectedKeys, which is
  // the checkbox multi-select the bulk toolbar (Delete/Copy to/Move to) acts
  // on. editingKey and selectedKeys can be active independently.
  const [editingKey, setEditingKey] = useState(null)
  const [editPanelExpanded, setEditPanelExpanded] = useState(false)
  // Snapshot-history stack: each mutating action pushes the draft as it was
  // just before that action, so Undo can pop straight back to it. A fresh
  // mutation after an Undo clears the redo tail (standard editor behavior —
  // once you diverge from the undone timeline, "redo" no longer means
  // anything). Draft updates are always immutable (new object/array
  // references, never mutated in place), so pushing the current `draft`
  // reference itself onto the stack is safe — no cloning needed.
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const newKeyCounter = useRef(0)

  function commitDraft(updater) {
    setUndoStack((stack) => [...stack, draft])
    setRedoStack([])
    setDraft(updater)
  }

  function handleUndo() {
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, draft])
    setDraft(previous)
    setSelectedKeys(new Set())
  }

  function handleRedo() {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack((stack) => stack.slice(0, -1))
    setUndoStack((stack) => [...stack, draft])
    setDraft(next)
    setSelectedKeys(new Set())
  }

  const originalIds = useMemo(() => new Set(allExercises.map((e) => e.id)), [allExercises])
  const originalById = useMemo(() => new Map(allExercises.map((e) => [e.id, e])), [allExercises])
  const isDirty = useMemo(() => {
    for (const day of WEEKDAYS) {
      const draftIds = draft[day].map((item) => item._key)
      const originalDayIds = allExercises.filter((e) => e.day === day).map((e) => String(e.id))
      if (draftIds.length !== originalDayIds.length) return true
      if (draftIds.some((key, i) => key !== originalDayIds[i])) return true
    }
    // Structural equality (same ids, same order, same days) isn't enough —
    // the field-edit panel changes name/sets/reps/weight/duration/
    // description/bullets in place without touching order, so those need
    // their own comparison against the original row.
    for (const day of WEEKDAYS) {
      for (const item of draft[day]) {
        if (item.isNew) return true
        const original = originalById.get(item.id)
        if (!original) return true
        if (
          item.name !== original.name ||
          item.sets !== original.sets ||
          item.reps !== original.reps ||
          item.weight !== original.weight ||
          item.duration !== original.duration ||
          item.description !== original.description ||
          item.video_id !== original.video_id ||
          JSON.stringify(item.bullets) !== JSON.stringify(original.bullets)
        ) {
          return true
        }
      }
    }
    return false
  }, [draft, allExercises, originalById])

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
    if (editingKey === key) {
      setEditingKey(null)
      setEditPanelExpanded(false)
    } else {
      setEditingKey(key)
      setEditPanelExpanded(false)
    }
  }

  function closeEditPanel() {
    setEditingKey(null)
    setEditPanelExpanded(false)
  }

  function commitEditField(field, value) {
    if (!editingEntry) return
    const { day, item } = editingEntry
    const unchanged = field === 'bullets'
      ? JSON.stringify(item.bullets) === JSON.stringify(value)
      : item[field] === value
    if (unchanged) return
    commitDraft((current) => ({
      ...current,
      [day]: current[day].map((it) => (it._key === editingKey ? { ...it, [field]: value } : it)),
    }))
  }

  // Photo changes are already persisted server-side the moment they happen
  // (upload/URL hit the backend directly, unlike every other field which
  // just edits the draft) — so this only needs to reflect the new value
  // locally for display, not go through commitDraft/undo for something
  // that's not actually undoable from here anyway.
  function handlePhotoChange(photo) {
    if (!editingEntry) return
    const { day } = editingEntry
    setDraft((current) => ({
      ...current,
      [day]: current[day].map((it) => (it._key === editingKey ? { ...it, photo } : it)),
    }))
  }

  function handleCancel() {
    if (isDirty) setConfirmingDiscard(true)
    else onClose()
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

  // Renaming a day's title is immediate/server-side, same as photo edits —
  // it's not an exercise field, so it doesn't belong in the whole-plan
  // draft/Undo/Save flow; onDayTitleSaved just updates App's dayTitles
  // state directly so the new title shows without a refetch.
  async function confirmEditDayTitle() {
    const trimmed = dayTitleDraft.trim()
    if (!trimmed) return
    setSavingDayTitle(true)
    try {
      const res = await fetch(`${API_BASE}/api/day-plans/${selectedDay}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title: trimmed }),
      })
      if (!res.ok) throw new Error('Save failed')
      onDayTitleSaved?.(selectedDay, trimmed)
      setEditingDayTitle(false)
    } catch {
      // Silently no-op on failure for now — the title just stays as it was.
    } finally {
      setSavingDayTitle(false)
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function toggleSelect(key) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    commitDraft((current) => {
      const list = current[selectedDay]
      const oldIndex = list.findIndex((item) => item._key === active.id)
      const newIndex = list.findIndex((item) => item._key === over.id)
      if (oldIndex === -1 || newIndex === -1) return current
      return { ...current, [selectedDay]: arrayMove(list, oldIndex, newIndex) }
    })
  }

  function handleDelete() {
    commitDraft((current) => {
      const next = {}
      for (const day of WEEKDAYS) {
        next[day] = current[day].filter((item) => !selectedKeys.has(item._key))
      }
      return next
    })
    setSelectedKeys(new Set())
  }

  function handleMoveOrCopy(targetDay) {
    commitDraft((current) => {
      const next = {}
      for (const day of WEEKDAYS) next[day] = [...current[day]]

      const moving = []
      for (const day of WEEKDAYS) {
        for (const item of current[day]) {
          if (selectedKeys.has(item._key)) moving.push(item)
        }
      }

      if (sheet === 'move') {
        for (const day of WEEKDAYS) {
          next[day] = next[day].filter((item) => !selectedKeys.has(item._key))
        }
        next[targetDay].push(...moving.map((item) => ({ ...item, day: targetDay })))
      } else {
        const copies = moving.map((item) => ({
          ...item,
          day: targetDay,
          isNew: true,
          sourceId: item.id ?? item.sourceId,
          id: undefined,
          _key: `new-${newKeyCounter.current++}`,
        }))
        next[targetDay].push(...copies)
      }
      return next
    })
    setSelectedKeys(new Set())
    setSheet(null)
    setSelectedDay(targetDay)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)

    const deletes = []
    const updates = []
    const copies = []
    const draftExistingIds = new Set()

    for (const day of WEEKDAYS) {
      draft[day].forEach((item, index) => {
        if (item.isNew) {
          copies.push({ sourceId: item.sourceId, day, sort_order: index })
        } else {
          draftExistingIds.add(item.id)
          updates.push({
            id: item.id,
            day,
            sort_order: index,
            name: item.name,
            sets: item.sets,
            reps: item.reps,
            weight: item.weight,
            duration: item.duration,
            description: item.description,
            bullets: item.bullets,
            video_id: item.video_id,
          })
        }
      })
    }
    for (const id of originalIds) {
      if (!draftExistingIds.has(id)) deletes.push(id)
    }

    try {
      const res = await fetch(`${API_BASE}/api/exercises/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, deletes, updates, copies }),
      })
      if (!res.ok) throw new Error('Save failed')
      onSaved?.()
      onClose()
    } catch {
      setSaveError("Couldn't save — check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="edit-plan-view">
      <div className="edit-plan-header">
        <div>
          <h2 className="edit-plan-title">Edit Plan</h2>
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
              <span className="edit-plan-day-subtitle">{dayTitles.get(selectedDay) || 'Rest day'}</span>
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
          {isSelecting ? (
            <>
              <button type="button" className="edit-plan-icon-btn" onClick={handleDelete} disabled={saving} aria-label="Delete">
                <TrashIcon size={17} />
              </button>
              <button type="button" className="edit-plan-pill-btn" onClick={() => setSheet('copy')} disabled={saving}>
                <CopyIcon size={14} />
                <span>Copy to</span>
              </button>
              <button type="button" className="edit-plan-pill-btn" onClick={() => setSheet('move')} disabled={saving}>
                <MoveIcon size={14} />
                <span>Move to</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="edit-plan-icon-btn"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || saving}
                aria-label="Undo"
              >
                <UndoIcon size={21} />
              </button>
              <button
                type="button"
                className="edit-plan-icon-btn"
                onClick={handleRedo}
                disabled={redoStack.length === 0 || saving}
                aria-label="Redo"
              >
                <RedoIcon size={21} />
              </button>
              <button type="button" className="edit-plan-pill-btn is-filled" disabled>
                <GenerateIcon size={14} />
                <span>Generate</span>
              </button>
            </>
          )}
          <button type="button" className="edit-plan-close-btn" onClick={handleCancel} aria-label="Cancel">
            <XIcon size={16} />
          </button>
        </div>
      </div>

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

      {saveError && <p className="edit-plan-save-error">{saveError}</p>}

      <div className={`edit-plan-list ${editingEntry ? 'has-edit-panel' : ''}`}>
        {dayExercises.length === 0 ? (
          <p className="edit-plan-empty">No exercises scheduled for {selectedDay}.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={dayExercises.map((item) => item._key)} strategy={verticalListSortingStrategy}>
              {dayExercises.map((item, i) => (
                <div key={item._key} style={{ display: 'contents' }}>
                  {editingKey === item._key && <InsertDivider bleedTop={i > 0} />}
                  <SortableCard
                    item={item}
                    selected={selectedKeys.has(item._key)}
                    editing={editingKey === item._key}
                    onToggleSelect={toggleSelect}
                    onOpenEdit={handleOpenEdit}
                  />
                  {editingKey === item._key && <InsertDivider bleedBottom={i < dayExercises.length - 1} />}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {isDirty && !editingEntry && (
        <button type="button" className="edit-plan-save-fab" onClick={handleSave} disabled={saving} aria-label="Save changes">
          <SaveIcon size={30} />
        </button>
      )}

      {editingEntry && (
        <ExerciseEditPanel
          item={editingEntry.item}
          expanded={editPanelExpanded}
          onToggleExpanded={() => setEditPanelExpanded((v) => !v)}
          onClose={closeEditPanel}
          onCommitField={commitEditField}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onPhotoChange={handlePhotoChange}
        />
      )}

      {sheet && (
        <DayPickerSheet
          title={sheet === 'move' ? 'Move to' : 'Copy to'}
          currentDay={selectedDay}
          dayTitles={dayTitles}
          onPick={handleMoveOrCopy}
          onCancel={() => setSheet(null)}
        />
      )}

      {confirmingDiscard && createPortal(
        <div className="modal-overlay regen-confirm-overlay" onMouseDown={() => setConfirmingDiscard(false)}>
          <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-box regen-confirm-box">
              <p className="regen-confirm-heading">Discard changes?</p>
              <p className="regen-confirm-body">
                Your edits to this plan haven't been saved. This cannot be undone.
              </p>
              <div className="regen-confirm-actions">
                <button className="regen-confirm-cancel" onClick={() => setConfirmingDiscard(false)}>
                  Keep editing
                </button>
                <button className="regen-confirm-ok" onClick={onClose}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default EditPlanView
