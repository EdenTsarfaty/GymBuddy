const db = require('./db')
const exercisePhotos = require('./exercisePhotos')
const { logInfo } = require('./logger')

// Same grace period/reasoning as exerciseSweep.js — a short buffer for
// Undo/Redo to still work, not a user-facing recovery window.
const GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000

// Called wherever a photo endpoint would previously have called
// exercisePhotos.deleteStoredPhoto directly — the old file stays on disk,
// just no longer referenced by any exercise, until the sweep clears it.
function markOrphaned(filename) {
  db.prepare('INSERT OR REPLACE INTO orphaned_photos (filename, orphaned_at) VALUES (?, ?)').run(filename, Date.now())
}

// Called when Undo/Redo points `photo` back at a file that was orphaned —
// it's referenced again now, so it shouldn't be swept.
function unmarkOrphaned(filename) {
  db.prepare('DELETE FROM orphaned_photos WHERE filename = ?').run(filename)
}

// Permanently deletes orphaned photo files past their grace period. Same
// daily-tick cadence as the other scheduled jobs.
async function sweepOrphanedPhotos() {
  const cutoff = Date.now() - GRACE_PERIOD_MS
  const rows = db.prepare('SELECT filename FROM orphaned_photos WHERE orphaned_at < ?').all(cutoff)
  if (rows.length === 0) return

  for (const { filename } of rows) {
    await exercisePhotos.deleteStoredPhoto(filename)
    db.prepare('DELETE FROM orphaned_photos WHERE filename = ?').run(filename)
  }

  logInfo(`Photo sweep: permanently removed ${rows.length} orphaned photo${rows.length === 1 ? '' : 's'}`)
}

module.exports = { markOrphaned, unmarkOrphaned, sweepOrphanedPhotos }
