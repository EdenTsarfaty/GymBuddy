const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')

const EXERCISE_PHOTOS_DIR = path.join(__dirname, '..', 'data', 'exercise-photos')
// The largest this ever displays at is the 110px expanded thumbnail
// (WorkoutCard.jsx) — 330px covers that at 3x for retina/high-DPI screens.
// Resizing at upload time (once, with sharp's resampling) instead of leaving
// a much larger source for the browser to downscale at render time is both
// smaller on disk and visibly crisper.
const MAX_DIMENSION = 330
const OUTPUT_FORMAT = 'webp'

// crypto.randomUUID() output — lowercase hex and hyphens, 36 chars — is the
// only shape we ever generate a filename in. Serving and deleting both check
// against this exact pattern, so a request can never walk outside this
// directory regardless of what a caller sends.
const FILENAME_PATTERN = /^[0-9a-f-]{36}\.webp$/

function isValidStoredFilename(filename) {
  return typeof filename === 'string' && FILENAME_PATTERN.test(filename)
}

// Only https:// links, nothing else — no data:/javascript:/http:. The
// backend never fetches this itself (an image URL the backend fetched on the
// user's behalf would be a straightforward SSRF vector against this app's own
// Tailscale network); the browser loads and renders it directly, so this is
// purely validating the string, not the image behind it.
function isValidPhotoUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

// The actual security boundary for uploads: decodes the bytes as a genuine
// image and re-encodes a fresh file. Anything that isn't a real, decodable
// image is rejected here — this is what neutralizes polyglot files and
// SVG-with-script payloads, since we choose the output format ourselves
// regardless of what was uploaded. Re-encoding from decoded pixels also drops
// EXIF/GPS metadata as a side effect, and the resize caps a decompression
// bomb's blowup. Returns the generated filename, or null if it wasn't a
// valid image.
async function saveUploadedPhoto(buffer) {
  const filename = `${crypto.randomUUID()}.${OUTPUT_FORMAT}`
  const filePath = path.join(EXERCISE_PHOTOS_DIR, filename)
  try {
    await sharp(buffer)
      .rotate() // apply EXIF orientation before rotation info gets dropped
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(filePath)
    return filename
  } catch {
    return null
  }
}

// Only ever called with a value that already passed isValidStoredFilename —
// used when replacing/clearing a photo so old uploads don't pile up unused.
async function deleteStoredPhoto(filename) {
  if (!isValidStoredFilename(filename)) return
  try {
    await fs.unlink(path.join(EXERCISE_PHOTOS_DIR, filename))
  } catch {}
}

// Used by the Undo/Redo photo-revert endpoint to confirm a previously-known
// filename hasn't actually been swept yet before pointing `photo` back at
// it — the grace period is short, and undoing something from days ago
// should fail cleanly rather than point at a file that's gone.
async function storedPhotoExists(filename) {
  if (!isValidStoredFilename(filename)) return false
  try {
    await fs.access(path.join(EXERCISE_PHOTOS_DIR, filename))
    return true
  } catch {
    return false
  }
}

// Same decode-then-reencode security boundary as saveUploadedPhoto (rejects
// anything that isn't a genuine, decodable image), but for a one-shot vision
// API call rather than the exercise's saved photo — nothing is written to
// disk. Sized for OpenAI's "high" detail mode (identifyExerciseFromPhoto),
// which tiles in 768px squares — 768 alone gives it exactly one tile to work
// with, not enough resolution to reliably read the fine equipment details
// (pin stacks, handle style, brand plates) that distinguish similar exercise
// variants. 1536 gives it a full 2x2 tile grid's worth of detail while
// staying well under what "high" detail mode scales down to anyway.
// Returns a JPEG buffer, or null if it wasn't a valid image.
async function reencodeForAnalysis(buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
  } catch {
    return null
  }
}

module.exports = {
  EXERCISE_PHOTOS_DIR,
  isValidStoredFilename,
  isValidPhotoUrl,
  saveUploadedPhoto,
  deleteStoredPhoto,
  storedPhotoExists,
  reencodeForAnalysis,
}
