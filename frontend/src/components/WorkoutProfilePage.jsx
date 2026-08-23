import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import CheckIcon from './icons/CheckIcon'
import ChevronLeftIcon from './icons/ChevronLeftIcon'
import FemaleIcon from './icons/FemaleIcon'
import MaleIcon from './icons/MaleIcon'
import XIcon from './icons/XIcon'
import { API_BASE } from '../apiBase'

const GOALS = [
  { id: 'lose_weight',    label: 'I want to lose weight' },
  { id: 'stay_healthy',   label: 'I want to stay healthy' },
  { id: 'look_better',    label: 'I want a better looking body' },
  { id: 'get_stronger',   label: 'I want to get stronger' },
  { id: 'endurance',      label: 'I want better endurance' },
  { id: 'mental_health',  label: 'I want to improve my mental wellbeing' },
  { id: 'daily_energy',   label: 'I want to boost my daily energy levels' },
]

function GoalsModal({ initialGoals, onSave, onClose }) {
  const [checked, setChecked] = useState(new Set(initialGoals || []))

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleSave() {
    onSave([...checked])
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-box goals-modal">
          <div className="goals-list">
            {GOALS.map((goal) => (
              <label key={goal.id} className={`goals-option ${checked.has(goal.id) ? 'is-checked' : ''}`}>
                <input
                  type="checkbox"
                  className="goals-checkbox"
                  checked={checked.has(goal.id)}
                  onChange={() => toggle(goal.id)}
                />
                <span className="goals-checkbox-box" aria-hidden="true" />
                <span className="goals-option-label">{goal.label}</span>
              </label>
            ))}
          </div>
          <button className="goals-save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function BioRow({ label, value, onSave, placeholder, disabled }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  function handleEdit() {
    setDraft(value ?? '')
    setEditing(true)
  }

  function handleSave() {
    onSave(draft)
    setEditing(false)
  }

  function handleCancel() {
    setEditing(false)
  }

  return (
    <div className="settings-row">
      <span className={`settings-row-label ${disabled ? 'is-disabled' : ''}`}>{label}</span>
      <div className="bio-row-right">
        {editing && (
          <button className="bio-cancel-btn" onClick={handleCancel} aria-label="Cancel">
            <ChevronLeftIcon size={12} />
          </button>
        )}
        <input
          className="bio-input"
          type="text"
          inputMode="decimal"
          value={editing ? draft : (value ?? '')}
          disabled={!editing}
          placeholder={editing ? placeholder : '—'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
        />
        <button className="bio-edit-btn" disabled={disabled} onClick={editing ? handleSave : handleEdit}>
          {editing ? 'Save' : 'Edit'}
        </button>
      </div>
    </div>
  )
}

// Fetches and holds the FULL profile shape (not just the fields shown on
// this page) — PUT /api/profile is a full replace, so any field missing
// from the body (reminders, streak freeze) would get silently wiped if this
// page only tracked age/height/weight/goals/beginner_mode.
function WorkoutProfilePage({ beginnerMode, onChangeBeginnerMode, isOffline, currentUser }) {
  const [profile, setProfile] = useState({
    age: null, height: null, weight: null, sex: null, medical_notes: '', goals: [],
    workout_reminder: 0, workout_reminder_time: '08:00',
    protein_reminder: 0, protein_reminder_delay_minutes: 60,
    streak_freeze_until: null,
    streak_guardian_enabled: false,
  })
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  useEffect(() => {
    if (!currentUser) return
    fetch(`${API_BASE}/api/profile?user_id=${currentUser.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setProfile({ ...data, goals: data.goals || [] })
          setNotesDraft(data.medical_notes || '')
          onChangeBeginnerMode(!!data.beginner_mode)
        }
      })
      .catch(() => {})
  }, [currentUser])

  // Text fields (sex, medical_notes) shouldn't go through the numeric
  // coercion below — everything else on this page is a number/array.
  const TEXT_FIELDS = new Set(['sex', 'medical_notes'])

  function saveField(field, raw) {
    const value = Array.isArray(raw) || TEXT_FIELDS.has(field) ? raw : (raw === '' ? null : Number(raw))
    const updated = { ...profile, [field]: value, user_id: currentUser?.id }
    setProfile(updated)
    fetch(`${API_BASE}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {})
  }

  return (
    <div className="settings-list">
      <div className="settings-row">
        <div className="settings-row-label-group">
          <span className={`settings-row-label ${isOffline ? 'is-disabled' : ''}`}>Beginner mode</span>
          <span className={`settings-row-sublabel ${isOffline ? 'is-disabled' : ''}`}>Lets the AI know you're new to the gym</span>
        </div>
        <button
          type="button"
          className="theme-toggle-pill beginner-toggle-pill"
          role="switch"
          aria-checked={beginnerMode}
          aria-label="Beginner mode"
          data-on={String(beginnerMode)}
          disabled={isOffline}
          onClick={() => {
            const next = !beginnerMode
            onChangeBeginnerMode(next)
            saveField('beginner_mode', next ? 1 : 0)
          }}
        >
          <div
            className="theme-toggle-thumb"
            style={{ transform: `translateX(${beginnerMode ? 100 : 0}%)` }}
          />
          <span className={`theme-toggle-option ${!beginnerMode ? 'is-active' : ''}`}>
            <XIcon size={14} />
          </span>
          <span className={`theme-toggle-option ${beginnerMode ? 'is-active' : ''}`}>
            <CheckIcon size={14} />
          </span>
        </button>
      </div>

      <div className="settings-separator" />

      <div className="settings-row">
        <span className={`settings-row-label ${isOffline ? 'is-disabled' : ''}`}>Sex</span>
        <div className="sex-toggle">
          <button
            type="button"
            className={`sex-toggle-btn ${profile.sex === 'male' ? 'is-selected' : ''}`}
            aria-pressed={profile.sex === 'male'}
            aria-label="Male"
            disabled={isOffline}
            onClick={() => saveField('sex', 'male')}
          >
            <MaleIcon size={22} />
          </button>
          <button
            type="button"
            className={`sex-toggle-btn ${profile.sex === 'female' ? 'is-selected' : ''}`}
            aria-pressed={profile.sex === 'female'}
            aria-label="Female"
            disabled={isOffline}
            onClick={() => saveField('sex', 'female')}
          >
            <FemaleIcon size={22} />
          </button>
        </div>
      </div>

      <BioRow
        label="Age"
        value={profile.age != null ? String(profile.age) : ''}
        onSave={(v) => saveField('age', v)}
        placeholder="years"
        disabled={isOffline}
      />
      <BioRow
        label="Height"
        value={profile.height != null ? String(profile.height) : ''}
        onSave={(v) => saveField('height', v)}
        placeholder="cm"
        disabled={isOffline}
      />
      <BioRow
        label="Weight"
        value={profile.weight != null ? String(profile.weight) : ''}
        onSave={(v) => saveField('weight', v)}
        placeholder="kg"
        disabled={isOffline}
      />

      <div className="settings-separator" />

      <div className="settings-row">
        <span className={`settings-row-label ${isOffline ? 'is-disabled' : ''}`}>Goals</span>
        <button className="bio-edit-btn" disabled={isOffline} onClick={() => setGoalsOpen(true)}>Edit</button>
      </div>

      {goalsOpen && (
        <GoalsModal
          initialGoals={profile.goals}
          onSave={(goals) => saveField('goals', goals)}
          onClose={() => setGoalsOpen(false)}
        />
      )}

      <div className="settings-separator" />

      <div className="settings-notes-field">
        <div className="settings-notes-field-header">
          <span className="settings-row-label">Medical conditions / injuries</span>
          <button
            className="bio-edit-btn regen-settings-btn"
            disabled={isOffline || notesDraft === (profile.medical_notes || '')}
            onClick={() => saveField('medical_notes', notesDraft)}
          >
            Save
          </button>
        </div>
        <textarea
          className="settings-notes-textarea"
          rows={4}
          placeholder="e.g. rotator cuff strain, herniated disc L4-L5…"
          value={notesDraft}
          disabled={isOffline}
          onChange={(e) => setNotesDraft(e.target.value)}
        />
      </div>
    </div>
  )
}

export default WorkoutProfilePage
