const fs = require('fs')
const path = require('path')
const { logInfo, logWarn } = require('./logger')

const DATA_DIR = path.join(__dirname, 'data')
const NAMES_PATH = path.join(DATA_DIR, 'exerciseNames.json')
const META_PATH = path.join(DATA_DIR, 'exerciseNames.meta.json')
const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const ENGLISH_LANGUAGE_ID = 2
const PAGE_LIMIT = 200
const WGER_TRANSLATIONS_URL = 'https://wger.de/api/v2/exercise-translation/'

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function writeMeta(meta) {
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2))
}

function readNames() {
  try {
    return JSON.parse(fs.readFileSync(NAMES_PATH, 'utf-8'))
  } catch {
    return []
  }
}

function namesEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// wger's own `language=` query param on this endpoint doesn't filter
// server-side (confirmed quirk during the initial Phase 5 bundling) — every
// page has to be filtered client-side by each result's `language` field.
async function fetchAllEnglishNames() {
  const names = new Set()
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const res = await fetch(`${WGER_TRANSLATIONS_URL}?limit=${PAGE_LIMIT}&offset=${offset}`)
    if (!res.ok) throw new Error(`wger API returned ${res.status}`)
    const data = await res.json()
    total = data.count
    for (const r of data.results) {
      if (r.language === ENGLISH_LANGUAGE_ID) names.add(r.name)
    }
    offset += PAGE_LIMIT
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// Runs once at server startup, throttled to once per SYNC_INTERVAL_MS via a
// meta timestamp file (mirrors the maybeBackupDatabase pattern in backup.js).
// Cheap path: if wger's total translation count hasn't moved since the last
// sync, skip the full paginated download entirely. Otherwise it downloads
// and filters the complete set exactly like the original Phase 5 bundling
// did, and only rewrites exerciseNames.json if the resulting name list
// actually differs. Returns true if the file on disk changed, so the caller
// can reload its in-memory copy.
async function maybeSyncExerciseNames() {
  const meta = readMeta()
  const now = Date.now()

  if (meta && now - meta.lastSyncAt < SYNC_INTERVAL_MS) {
    const remainingDays = ((SYNC_INTERVAL_MS - (now - meta.lastSyncAt)) / DAY_MS).toFixed(1)
    logInfo(`wger exercise name sync skipped — next check in ~${remainingDays}d`)
    return false
  }

  try {
    const probe = await fetch(`${WGER_TRANSLATIONS_URL}?limit=1`)
    if (!probe.ok) throw new Error(`wger API returned ${probe.status}`)
    const { count } = await probe.json()

    if (meta && meta.count === count) {
      logInfo(`wger exercise name sync — translation count unchanged (${count}), skipping full download`)
      writeMeta({ lastSyncAt: now, count })
      return false
    }

    const names = await fetchAllEnglishNames()
    const existing = readNames()
    const changed = !namesEqual(names, existing)

    if (changed) {
      fs.writeFileSync(NAMES_PATH, JSON.stringify(names))
      logInfo(`wger exercise names updated: ${existing.length} -> ${names.length} names`)
    } else {
      logInfo('wger exercise name sync — downloaded full set, no diff found')
    }

    writeMeta({ lastSyncAt: now, count })
    return changed
  } catch (err) {
    logWarn(`wger exercise name sync failed: ${err.message}`)
    return false
  }
}

module.exports = { maybeSyncExerciseNames }
