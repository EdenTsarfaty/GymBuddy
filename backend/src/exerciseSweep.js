const db = require('./db')
const exercisePhotos = require('./exercisePhotos')
const { logInfo } = require('./logger')

// How long a soft-deleted exercise sticks around before it's gone for good.
// Purely a safety margin for the soft-delete/undo mechanism itself (giving a
// bug a beat to surface) — there's no user-facing "restore from trash" UI
// reading from this window, so it doesn't need to be generous.
const GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000

// Permanently removes exercises soft-deleted more than GRACE_PERIOD_MS ago —
// past that point nothing (Edit Plan's Undo, a stale open tab) can restore
// them any more, so it's safe to free the photo file and chat history too.
// Runs on the same daily tick as the backup/wger-sync jobs; cheap to call
// more often than that since it's a no-op query in the common case where
// nothing is due yet.
async function sweepDeletedExercises() {
  const cutoff = Date.now() - GRACE_PERIOD_MS
  const rows = db.prepare('SELECT id, photo FROM exercises WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff)
  if (rows.length === 0) return

  for (const row of rows) {
    if (exercisePhotos.isValidStoredFilename(row.photo)) {
      await exercisePhotos.deleteStoredPhoto(row.photo)
    }
    db.prepare('DELETE FROM chat_messages WHERE exercise_id = ?').run(row.id)
    db.prepare('DELETE FROM exercises WHERE id = ?').run(row.id)
  }

  logInfo(`Exercise sweep: permanently removed ${rows.length} soft-deleted exercise${rows.length === 1 ? '' : 's'}`)
}

module.exports = { sweepDeletedExercises }
