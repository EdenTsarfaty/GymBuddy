import IceIcon from './icons/IceIcon'

function formatFreezeDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function StreakFreezeNotice({ untilDate, onSuspend, onDeactivate }) {
  return (
    <div className="empty-day">
      <IceIcon className="empty-day-zzz streak-freeze-icon" size={130} />
      <p className="empty-day-message streak-freeze-message">
        Streak freeze is on until {formatFreezeDate(untilDate)}.<br />Don't sweat it (seriously, don't).
      </p>
      <div className="streak-freeze-notice-actions">
        <button type="button" className="streak-freeze-suspend-btn" onClick={onSuspend}>
          Temporarily suspend
        </button>
        <button type="button" className="streak-freeze-deactivate-btn" onClick={onDeactivate}>
          Deactivate
        </button>
      </div>
    </div>
  )
}

export default StreakFreezeNotice
