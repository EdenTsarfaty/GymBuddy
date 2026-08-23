import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ChevronLeftIcon from './icons/ChevronLeftIcon'
import EyeIcon from './icons/EyeIcon'
import EyeOffIcon from './icons/EyeOffIcon'
import MonitorIcon from './icons/MonitorIcon'
import MoonIcon from './icons/MoonIcon'
import OfflineIcon from './icons/OfflineIcon'
import SunIcon from './icons/SunIcon'
import XIcon from './icons/XIcon'
import { API_BASE } from '../apiBase'

const THEME_MODES = ['light', 'dark', 'system']

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

// Requests notification permission and creates/reuses a push subscription for
// this device, then registers it with the backend. Returns false (without
// throwing) on anything that should stop the reminder toggle from turning on —
// unsupported browser, denied permission, or an unreachable backend.
async function subscribeToPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const { publicKey } = await fetch(`${API_BASE}/api/push/vapid-public-key`).then((r) => r.json())
    if (!publicKey) return false

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }

    await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, subscription }),
    })
    return true
  } catch {
    return false
  }
}

function UserPicker({ users, currentUser, onChangeUser, disabled }) {
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
      <span className={`settings-row-label ${disabled ? 'is-disabled' : ''}`}>User</span>
      <div className="user-picker" ref={ref}>
        <button
          className={`user-picker-pill ${open ? 'is-open' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
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

const MINUTE_OPTIONS = ['00', '15', '30', '45']
const PROTEIN_HOUR_OPTIONS = [0, 1, 2, 3]

function ReminderModal({ initialValues, onSave, onClose }) {
  const [values, setValues] = useState({
    workout_reminder: !!initialValues.workout_reminder,
    workout_reminder_time: initialValues.workout_reminder_time || '08:00',
    protein_reminder: !!initialValues.protein_reminder,
    protein_reminder_delay_minutes: initialValues.protein_reminder_delay_minutes || 60,
  })

  function toggle(id) {
    setValues((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleSave() {
    onSave(values)
    onClose()
  }

  const proteinHours = Math.floor(values.protein_reminder_delay_minutes / 60)
  const proteinMinutes = values.protein_reminder_delay_minutes % 60

  function setProteinDelay(hours, minutes) {
    setValues((prev) => ({ ...prev, protein_reminder_delay_minutes: hours * 60 + minutes }))
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-box goals-modal reminders-modal">
          <div className="goals-list">
            <div className="reminder-option">
              <label className={`goals-option ${values.workout_reminder ? 'is-checked' : ''}`}>
                <input
                  type="checkbox"
                  className="goals-checkbox"
                  checked={values.workout_reminder}
                  onChange={() => toggle('workout_reminder')}
                />
                <span className="goals-checkbox-box" aria-hidden="true" />
                <span className="goals-option-label">Workout day</span>
              </label>
              <span className="reminder-option-description">
                A reminder will be sent on a workout day, at the time set below.
              </span>
              {values.workout_reminder && (
                <input
                  type="time"
                  className="reminder-time-input"
                  value={values.workout_reminder_time}
                  onChange={(e) => setValues((prev) => ({ ...prev, workout_reminder_time: e.target.value }))}
                />
              )}
            </div>

            <div className="reminder-option">
              <label className={`goals-option ${values.protein_reminder ? 'is-checked' : ''}`}>
                <input
                  type="checkbox"
                  className="goals-checkbox"
                  checked={values.protein_reminder}
                  onChange={() => toggle('protein_reminder')}
                />
                <span className="goals-checkbox-box" aria-hidden="true" />
                <span className="goals-option-label">Drink protein</span>
              </label>
              <span className="reminder-option-description">
                A protein drinking reminder will be sent after a workout has been finished, using the delay set below.
              </span>
              {values.protein_reminder && (
                <div className="reminder-time-row">
                  <select
                    className="reminder-time-select"
                    value={proteinHours}
                    onChange={(e) => setProteinDelay(Number(e.target.value), proteinMinutes)}
                  >
                    {PROTEIN_HOUR_OPTIONS.map((h) => (
                      <option key={h} value={h}>{h}h</option>
                    ))}
                  </select>
                  <select
                    className="reminder-time-select"
                    value={String(proteinMinutes).padStart(2, '0')}
                    onChange={(e) => setProteinDelay(proteinHours, Number(e.target.value))}
                  >
                    {MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}m</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <button className="goals-save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function todayISODate() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatFreezeDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function StreakGuardianPasswordModal({ title, description, submitLabel = 'Accept', onSubmit, onSuccess, onClose }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit() {
    if (!password) {
      setError('A password is required.')
      return
    }
    setSubmitting(true)
    const result = await onSubmit(password)
    setSubmitting(false)
    if (!result?.ok) {
      setError(result?.error || 'Something went wrong.')
      return
    }
    onSuccess?.()
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-box goals-modal streak-freeze-modal">
          <h2 className="regen-title">{title}</h2>
          <div className="goals-list">
            {description && (
              <span className="reminder-option-description streak-freeze-description">{description}</span>
            )}
            <div className="streak-guardian-password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                className={`reminder-time-input streak-guardian-password-input ${error ? 'is-error' : ''}`}
                placeholder="Password"
                autoFocus
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              />
              <button
                type="button"
                className="streak-guardian-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
            {error && <span className="streak-freeze-error">{error}</span>}
          </div>
          <div className="streak-guardian-modal-actions">
            <button type="button" className="streak-freeze-suspend-btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="goals-save-btn" onClick={handleSubmit} disabled={submitting}>
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function StreakFreezeModal({ onActivate, onClose, guardianEnabled, userId, onGuardianChange }) {
  const [date, setDate] = useState('')
  const [showError, setShowError] = useState(false)
  const [guardianSetupOpen, setGuardianSetupOpen] = useState(false)
  const [guardianDisableOpen, setGuardianDisableOpen] = useState(false)
  const [guardianVerifyOpen, setGuardianVerifyOpen] = useState(false)

  function handleActivate() {
    if (!date) {
      setShowError(true)
      return
    }
    if (guardianEnabled) {
      setGuardianVerifyOpen(true)
      return
    }
    onActivate(date)
    onClose()
  }

  async function submitGuardianPassword(endpoint, password) {
    try {
      const res = await fetch(`${API_BASE}/api/streak-guardian/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error }
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not reach the server.' }
    }
  }

  return (
    <>
      {createPortal(
        <div className="modal-overlay" onMouseDown={onClose}>
          <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
            <div className="modal-box goals-modal streak-freeze-modal">
              <h2 className="regen-title">Streak Freeze</h2>
              <span className="reminder-option-description streak-freeze-description streak-freeze-intro">
                Freezes your streak from being lost during times you are unable to attend to the gym —
                exams, travel, work, etc.
              </span>
              <div className="goals-list">
                <div className="regen-row">
                  <span className="regen-label">Return date</span>
                  <input
                    type="date"
                    className={`reminder-time-input streak-freeze-date-input ${showError ? 'is-error' : ''}`}
                    min={todayISODate()}
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setShowError(false) }}
                  />
                </div>
                {showError && (
                  <span className="streak-freeze-error">
                    Choosing a date is required — knowing exactly when you're coming back makes it far more
                    likely that you actually will.
                  </span>
                )}

                <div className="regen-row">
                  <span className="regen-label">Streak Guardian</span>
                  <div className="streak-guardian-control">
                    {guardianEnabled ? (
                      <>
                        <button
                          type="button"
                          className="streak-guardian-remove-btn"
                          onClick={() => setGuardianDisableOpen(true)}
                          aria-label="Disable Streak Guardian"
                        >
                          <XIcon size={16} />
                        </button>
                        <button type="button" className="streak-guardian-status-btn" disabled>
                          Activated
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="bio-edit-btn streak-freeze-btn"
                        onClick={() => setGuardianSetupOpen(true)}
                      >
                        Set up
                      </button>
                    )}
                  </div>
                </div>
                <span className="reminder-option-description streak-freeze-description streak-guardian-caption">
                  Require a trusted person's password before streak freeze can be turned on.
                </span>
              </div>
              <button className="goals-save-btn" onClick={handleActivate}>Activate</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {guardianSetupOpen && (
        <StreakGuardianPasswordModal
          title="Set Up Streak Guardian"
          description="Choose a password only your guardian knows — it'll be required to turn streak freeze on."
          submitLabel="Accept"
          onSubmit={(password) => submitGuardianPassword('setup', password)}
          onSuccess={() => onGuardianChange(true)}
          onClose={() => setGuardianSetupOpen(false)}
        />
      )}

      {guardianDisableOpen && (
        <StreakGuardianPasswordModal
          title="Disable Streak Guardian"
          description="Enter the guardian password to remove this lock."
          submitLabel="Accept"
          onSubmit={(password) => submitGuardianPassword('disable', password)}
          onSuccess={() => onGuardianChange(false)}
          onClose={() => setGuardianDisableOpen(false)}
        />
      )}

      {guardianVerifyOpen && (
        <StreakGuardianPasswordModal
          title="Enter Streak Guardian Password"
          description="This streak freeze is locked. Enter the guardian password to activate it."
          submitLabel="Activate"
          onSubmit={(password) => submitGuardianPassword('verify', password)}
          onSuccess={() => { onActivate(date); onClose() }}
          onClose={() => setGuardianVerifyOpen(false)}
        />
      )}
    </>
  )
}

function SettingsPage({ themeMode, onChangeThemeMode, onChangeBeginnerMode, onEditPlan, onEditProfile, version, isOffline, users, currentUser, onChangeUser, flashStreakFreeze, onStreakFreezeChange }) {
  const activeIndex = THEME_MODES.indexOf(themeMode)
  const [profile, setProfile] = useState({
    age: null, height: null, weight: null, goals: [],
    workout_reminder: 0, workout_reminder_time: '08:00',
    protein_reminder: 0, protein_reminder_delay_minutes: 60,
    streak_freeze_until: null,
    streak_guardian_enabled: false,
  })
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [streakFreezeOpen, setStreakFreezeOpen] = useState(false)
  const [streakFreezeFlashing, setStreakFreezeFlashing] = useState(false)

  useEffect(() => {
    if (!flashStreakFreeze) return
    setStreakFreezeFlashing(true)
    const timeout = setTimeout(() => setStreakFreezeFlashing(false), 1400)
    return () => clearTimeout(timeout)
  }, [flashStreakFreeze])

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

  async function saveReminders(values) {
    let nextValues = values
    if (values.workout_reminder || values.protein_reminder) {
      const subscribed = await subscribeToPush(currentUser?.id)
      if (!subscribed) nextValues = { ...values, workout_reminder: false, protein_reminder: false }
    }
    const updated = { ...profile, ...nextValues, user_id: currentUser?.id }
    setProfile(updated)
    fetch(`${API_BASE}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {})
  }

  function saveStreakFreeze(date) {
    const updated = { ...profile, streak_freeze_until: date, user_id: currentUser?.id }
    setProfile(updated)
    fetch(`${API_BASE}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
      .then(() => onStreakFreezeChange?.())
      .catch(() => {})
  }

  return (
    <div className="settings-list">
      {isOffline && (
        <>
          <div className="settings-offline-banner">
            <OfflineIcon size={32} />
            <span>
              Offline mode — showing a cached version of your workout. Edits will sync once the app is open again with the server reachable.
              <br />
              Check - are both nodes powered on Tailscale?
            </span>
          </div>
          <div className="settings-separator" />
        </>
      )}

      <UserPicker users={users} currentUser={currentUser} onChangeUser={onChangeUser} disabled={isOffline} />

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
        <span className={`settings-row-label ${isOffline ? 'is-disabled' : ''}`}>User workout profile</span>
        <button className="bio-edit-btn regen-settings-btn" disabled={isOffline} onClick={onEditProfile}>Edit profile</button>
      </div>

      <div className="settings-separator" />

      <div className="settings-row">
        <span className={`settings-row-label ${isOffline ? 'is-disabled' : ''}`}>Workout plan</span>
        <button className="bio-edit-btn regen-settings-btn" disabled={isOffline} onClick={onEditPlan}>Edit Plan</button>
      </div>

      <div className="settings-separator" />

      <div className="settings-row">
        <span className={`settings-row-label ${isOffline ? 'is-disabled' : ''}`}>Reminders</span>
        <button className="bio-edit-btn" disabled={isOffline} onClick={() => setRemindersOpen(true)}>Edit</button>
      </div>

      {remindersOpen && (
        <ReminderModal
          initialValues={profile}
          onSave={saveReminders}
          onClose={() => setRemindersOpen(false)}
        />
      )}

      <div className="settings-separator" />

      <div className={`settings-row ${streakFreezeFlashing ? 'is-flashing' : ''}`}>
        <span className={`settings-row-label ${isOffline ? 'is-disabled' : ''}`}>Streak Freeze</span>
        <div className="bio-row-right">
          {profile.streak_freeze_until && (
            <span className="streak-freeze-active-until">active until {formatFreezeDate(profile.streak_freeze_until)}</span>
          )}
          <button
            className="bio-edit-btn streak-freeze-btn"
            disabled={isOffline}
            onClick={() => (profile.streak_freeze_until ? saveStreakFreeze(null) : setStreakFreezeOpen(true))}
          >
            {profile.streak_freeze_until ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {streakFreezeOpen && (
        <StreakFreezeModal
          onActivate={saveStreakFreeze}
          onClose={() => setStreakFreezeOpen(false)}
          guardianEnabled={profile.streak_guardian_enabled}
          userId={currentUser?.id}
          onGuardianChange={(enabled) => setProfile((p) => ({ ...p, streak_guardian_enabled: enabled }))}
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
