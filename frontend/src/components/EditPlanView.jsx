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
import ChevronUpIcon from './icons/ChevronUpIcon'
import CameraIcon from './icons/CameraIcon'
import UploadIcon from './icons/UploadIcon'
import WebIcon from './icons/WebIcon'
import PhotoIcon from './icons/PhotoIcon'
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
  const fileInputRef = useRef(null)

  useEffect(() => {
    setForm(item)
    setShowUrlInput(false)
    setUrlValue('')
  }, [item])

  const hasDuration = item.duration != null
  const canUploadPhoto = !item.isNew

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

  async function confirmUrl() {
    const url = urlValue.trim()
    if (!url) return
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
    } catch {
      // Silently no-op on failure for now — the thumbnail just stays as it was.
    } finally {
      setUploading(false)
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
  function autoGrowBullet(e) {
    const el = e.target
    el.style.height = 'auto'
    const maxHeight = 3 * 20 + 16 // ~3 lines at this font-size/line-height, plus padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }

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

          <div className="edit-plan-photo-row">
            <div className="edit-plan-photo-square">
              {photoUrl ? (
                <img src={photoUrl} alt="" />
              ) : (
                <PhotoIcon size={36} className="edit-plan-photo-placeholder" />
              )}
            </div>
            <div className="edit-plan-photo-actions">
              <button type="button" className="edit-plan-photo-btn" disabled aria-label="Take photo">
                <CameraIcon size={16} />
                <span>Camera</span>
              </button>
              <button
                type="button"
                className="edit-plan-photo-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canUploadPhoto || uploading}
                aria-label="Upload photo"
              >
                <UploadIcon size={16} />
                <span>Upload</span>
              </button>
              <button
                type="button"
                className={`edit-plan-photo-btn ${showUrlInput ? 'is-active' : ''}`}
                onClick={() => setShowUrlInput((v) => !v)}
                disabled={!canUploadPhoto || uploading}
                aria-label="Photo from web address"
              >
                <WebIcon size={16} />
                <span>Web URL</span>
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
function EditPlanView({ allExercises, dayTitles, userId, onSaved, onClose }) {
  const [selectedDay, setSelectedDay] = useState(WEEKDAYS[new Date().getDay()])
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
          <span className="edit-plan-day-subtitle">{dayTitles.get(selectedDay) || 'Rest day'}</span>
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

      <div className="edit-plan-list">
        {dayExercises.length === 0 ? (
          <p className="edit-plan-empty">No exercises scheduled for {selectedDay}.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={dayExercises.map((item) => item._key)} strategy={verticalListSortingStrategy}>
              {dayExercises.map((item) => (
                <SortableCard
                  key={item._key}
                  item={item}
                  selected={selectedKeys.has(item._key)}
                  editing={editingKey === item._key}
                  onToggleSelect={toggleSelect}
                  onOpenEdit={handleOpenEdit}
                />
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
