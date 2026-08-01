import MonitorIcon from './icons/MonitorIcon'
import MoonIcon from './icons/MoonIcon'
import SunIcon from './icons/SunIcon'

const THEME_MODES = ['light', 'dark', 'system']

function SettingsPage({ themeMode, onChangeThemeMode, version }) {
  const activeIndex = THEME_MODES.indexOf(themeMode)

  return (
    <div className="settings-list">
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
        <span className="settings-row-label">Current version</span>
        <a
          className="settings-row-value settings-row-link"
          href="https://github.com/EdenTsarfaty/GymBuddy"
          target="_blank"
          rel="noopener noreferrer"
        >v{version}</a>
      </div>
    </div>
  )
}

export default SettingsPage
