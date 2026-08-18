const crypto = require('node:crypto')
const db = require('./db')

const KEY_LENGTH = 64

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return { hash, salt }
}

function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false
  const candidate = crypto.scryptSync(password, salt, KEY_LENGTH)
  const stored = Buffer.from(hash, 'hex')
  if (candidate.length !== stored.length) return false
  return crypto.timingSafeEqual(candidate, stored)
}

function isEnabled(userId) {
  const row = db.prepare('SELECT streak_guardian_hash FROM user_profile WHERE id = ?').get(userId)
  return !!row?.streak_guardian_hash
}

function setup(userId, password) {
  const { hash, salt } = hashPassword(password)
  db.prepare(
    'UPDATE user_profile SET streak_guardian_hash = ?, streak_guardian_salt = ? WHERE id = ?',
  ).run(hash, salt, userId)
}

// Returns false without changing anything if the password doesn't match.
function disable(userId, password) {
  const row = db.prepare(
    'SELECT streak_guardian_hash, streak_guardian_salt FROM user_profile WHERE id = ?',
  ).get(userId)
  if (!verifyPassword(password, row?.streak_guardian_hash, row?.streak_guardian_salt)) return false
  db.prepare(
    'UPDATE user_profile SET streak_guardian_hash = NULL, streak_guardian_salt = NULL WHERE id = ?',
  ).run(userId)
  return true
}

function verify(userId, password) {
  const row = db.prepare(
    'SELECT streak_guardian_hash, streak_guardian_salt FROM user_profile WHERE id = ?',
  ).get(userId)
  return verifyPassword(password, row?.streak_guardian_hash, row?.streak_guardian_salt)
}

module.exports = { isEnabled, setup, disable, verify }
