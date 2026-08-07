const fs = require('fs')
const path = require('path')
const { logInfo } = require('./logger')

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'gymbuddy.db')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const BACKUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000
const MAX_BACKUPS = 4
const DAY_MS = 24 * 60 * 60 * 1000

function formatTimestampForFilename(date) {
  return date.toISOString().slice(0, 19).replace(/:/g, '-')
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('gymbuddy-') && f.endsWith('.db'))
      .map((f) => {
        const filePath = path.join(BACKUP_DIR, f)
        return { file: f, path: filePath, mtime: fs.statSync(filePath).mtimeMs }
      })
      .sort((a, b) => a.mtime - b.mtime)
  } catch {
    return []
  }
}

function maybeBackupDatabase() {
  if (!fs.existsSync(DB_PATH)) return

  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const backups = listBackups()
  const latest = backups[backups.length - 1]
  const now = Date.now()

  if (latest && now - latest.mtime < BACKUP_INTERVAL_MS) {
    const sinceDays = ((now - latest.mtime) / DAY_MS).toFixed(1)
    const remainingDays = ((BACKUP_INTERVAL_MS - (now - latest.mtime)) / DAY_MS).toFixed(1)
    logInfo(`Database backup skipped — last backup ${sinceDays}d ago, next in ~${remainingDays}d`)
    return
  }

  const filename = `gymbuddy-${formatTimestampForFilename(new Date())}.db`
  fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, filename))
  logInfo(`Database backup created: backups/${filename}`)

  const updated = listBackups()
  const excess = updated.length - MAX_BACKUPS
  for (const old of updated.slice(0, Math.max(0, excess))) {
    fs.unlinkSync(old.path)
    logInfo(`Removed old backup: backups/${old.file}`)
  }
}

module.exports = { maybeBackupDatabase }
