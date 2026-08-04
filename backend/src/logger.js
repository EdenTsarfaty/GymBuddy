const fs = require('fs')
const path = require('path')

const LOG_PATH = path.join(__dirname, '..', 'data', 'llm.log')
const LOG_MAX_LINES = 2000

function trimLLMLog() {
  try {
    const content = fs.readFileSync(LOG_PATH, 'utf8')
    const lines = content.split('\n')
    if (lines.length <= LOG_MAX_LINES) return
    fs.writeFileSync(LOG_PATH, lines.slice(lines.length - LOG_MAX_LINES).join('\n'), 'utf8')
  } catch {}
}

function writeLLMLog(userId, type, content) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const entry = `[${ts}] ${type} | user:${userId}\n${content}\n---\n\n`
  fs.appendFileSync(LOG_PATH, entry, 'utf8')
  trimLLMLog()
}

module.exports = { writeLLMLog }
