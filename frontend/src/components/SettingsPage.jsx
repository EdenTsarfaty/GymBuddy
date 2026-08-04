import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CheckIcon from './icons/CheckIcon'
import ChevronLeftIcon from './icons/ChevronLeftIcon'
import MonitorIcon from './icons/MonitorIcon'
import MoonIcon from './icons/MoonIcon'
import SunIcon from './icons/SunIcon'
import XIcon from './icons/XIcon'

const THEME_MODES = ['light', 'dark', 'system']
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

function UserPicker({ users, currentUser, onChangeUser }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!currentUser) return null

  return (
    <div className="settings-row">
      <span className="settings-row-label">User</span>
      <div className="user-picker" ref={ref}>
        <button
          className={`user-picker-pill ${open ? 'is-open' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{currentUser.name}</span>
          <span className={`user-picker-chevron ${open ? 'is-open' : ''}`}>
            <ChevronLeftIcon size={12} />
          </span>
        </button>

        {open && (
          <div className="user-picker-menu" role="listbox">
            {users.filter(u => u.id !== currentUser.id).map((user, i) => (
              <div key={user.id}>
                {i > 0 && <div className="user-picker-separator" />}
                <button
                  className="user-picker-option"
                  role="option"
                  aria-selected={false}
                  onClick={() => { onChangeUser(user); setOpen(false) }}
                >
                  {user.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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

function BioRow({ label, value, onSave, placeholder }) {
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
      <span className="settings-row-label">{label}</span>
      <div className="bio-row-right">
        {editing && (
          <button className="bio-cancel-btn" onClick={handleCancel} aria-label="Cancel">
            <ChevronLeftIcon size={12} />
          </button>
        )}
        <input
          className="bio-input"
          type="text"
          value={editing ? draft : (value ?? '')}
          disabled={!editing}
          placeholder={editing ? placeholder : '—'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
        />
        <button className="bio-edit-btn" onClick={editing ? handleSave : handleEdit}>
          {editing ? 'Save' : 'Edit'}
        </button>
      </div>
    </div>
  )
}

function SettingsPage({ themeMode, onChangeThemeMode, beginnerMode, onChangeBeginnerMode, onRegenerate, version, users, currentUser, onChangeUser }) {
  const activeIndex = THEME_MODES.indexOf(themeMode)
  const [profile, setProfile] = useState({ age: null, height: null, weight: null, goals: [] })
  const [goalsOpen, setGoalsOpen] = useState(false)

  useEffect(() => {
    if (!currentUser) return
    fetch(`${API_BASE}/api/profile?user_id=${currentUser.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
      if (data) {
        setProfile({ ...data, goals: data.goals || [] })
        onChangeBeginnerMode(!!data.beginner_mode)
      }
    })
      .catch(() => {})
  }, [currentUser])

  function saveField(field, raw) {
    const value = Array.isArray(raw) ? raw : (raw === '' ? null : Number(raw))
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
      <UserPicker users={users} currentUser={currentUser} onChangeUser={onChangeUser} />

      <div className="settings-separator" />

      <div className="settings-row">
        <span className="settings-row-label">Theme</span>
        <div className="theme-toggle-pill" role="radiogroup" aria-label="Theme">
          <div
            className="theme-toggle-thumb"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
          <button
            type="button"
            role="radio"
            aria-checked={themeMode === 'light'}
            className={`theme-toggle-option ${themeMode === 'light' ? 'is-active' : ''}`}
            onClick={() => onChangeThemeMode('light')}
          >
            <SunIcon size={14} />
            Light
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={themeMode === 'dark'}
            className={`theme-toggle-option ${themeMode === 'dark' ? 'is-active' : ''}`}
            onClick={() => onChangeThemeMode('dark')}
          >
            <MoonIcon size={14} />
            Dark
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={themeMode === 'system'}
            className={`theme-toggle-option ${themeMode === 'system' ? 'is-active' : ''}`}
            onClick={() => onChangeThemeMode('system')}
          >
            <MonitorIcon size={14} />
            System
          </button>
        </div>
      </div>

      <div className="settings-separator" />

      <div className="settings-row">
        <div className="settings-row-label-group">
          <span className="settings-row-label">Beginner mode</span>
          <span className="settings-row-sublabel">Lets the AI know you're new to the gym</span>
        </div>
        <button
          type="button"
          className="theme-toggle-pill beginner-toggle-pill"
          role="switch"
          aria-checked={beginnerMode}
          aria-label="Beginner mode"
          data-on={String(beginnerMode)}
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
        <span className="settings-row-label">Workout plan</span>
        <button className="bio-edit-btn regen-settings-btn" onClick={onRegenerate}>Regenerate Plan</button>
      </div>

      <div className="settings-separator" />

      <BioRow
        label="Age"
        value={profile.age != null ? String(profile.age) : ''}
        onSave={(v) => saveField('age', v)}
        placeholder="years"
      />
      <BioRow
        label="Height"
        value={profile.height != null ? String(profile.height) : ''}
        onSave={(v) => saveField('height', v)}
        placeholder="cm"
      />
      <BioRow
        label="Weight"
        value={profile.weight != null ? String(profile.weight) : ''}
        onSave={(v) => saveField('weight', v)}
        placeholder="kg"
      />

      <div className="settings-separator" />

      <div className="settings-row">
        <span className="settings-row-label">Goals</span>
        <button className="bio-edit-btn" onClick={() => setGoalsOpen(true)}>Edit</button>
      </div>

      {goalsOpen && (
        <GoalsModal
          initialGoals={profile.goals}
          onSave={(goals) => saveField('goals', goals)}
          onClose={() => setGoalsOpen(false)}
        />
      )}

      <div className="settings-separator" />

      <div className="settings-row">
        <span className="settings-row-label">Current version</span>
        <a
          className="settings-row-value settings-row-link"
          href="https://github.com/EdenTsarfaty/GymBuddy"
          target="_blank"
          rel="noopener noreferrer"
        >{version}</a>
      </div>
    </div>
  )
}

export default SettingsPage
