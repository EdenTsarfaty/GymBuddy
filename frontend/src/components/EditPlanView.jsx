import { useMemo, useRef, useState } from 'react'
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

function SortableCard({ item, selected, onToggleSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  const Icon = CATEGORY_ICONS[item.category]

  return (
    <div ref={setNodeRef} style={style} className={`edit-plan-card ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="edit-plan-drag-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <GripIcon size={16} />
      </button>
      <button
        type="button"
        className={`edit-plan-checkbox ${selected ? 'is-checked' : ''}`}
        onClick={() => onToggleSelect(item._key)}
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
  const isDirty = useMemo(() => {
    for (const day of WEEKDAYS) {
      const draftIds = draft[day].map((item) => item._key)
      const originalDayIds = allExercises.filter((e) => e.day === day).map((e) => String(e.id))
      if (draftIds.length !== originalDayIds.length) return true
      if (draftIds.some((key, i) => key !== originalDayIds[i])) return true
    }
    return false
  }, [draft, allExercises])

  const dayExercises = draft[selectedDay]
  const isSelecting = selectedKeys.size > 0

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
          updates.push({ id: item.id, day, sort_order: index })
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
                  onToggleSelect={toggleSelect}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {isDirty && (
        <button type="button" className="edit-plan-save-fab" onClick={handleSave} disabled={saving} aria-label="Save changes">
          <SaveIcon size={30} />
        </button>
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
