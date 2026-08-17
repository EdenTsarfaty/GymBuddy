const fs = require('fs')
const path = require('path')
const readline = require('node:readline')

// Owns terminal echo/redraw so log lines never garble in-progress CLI input.
const cli = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '',
})
cli.prompt()

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

const SERVER_LOG_PATH = path.join(__dirname, '..', 'data', 'server.log')
const SERVER_LOG_MAX_LINES = 5000

const COLOR = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function trimServerLog() {
  try {
    const content = fs.readFileSync(SERVER_LOG_PATH, 'utf8')
    const lines = content.split('\n')
    if (lines.length <= SERVER_LOG_MAX_LINES) return
    fs.writeFileSync(SERVER_LOG_PATH, lines.slice(lines.length - SERVER_LOG_MAX_LINES).join('\n'), 'utf8')
  } catch {}
}

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function methodColor(method) {
  switch (method) {
    case 'GET': return COLOR.blue
    case 'POST': return COLOR.cyan
    case 'PATCH': return COLOR.yellow
    case 'PUT': return COLOR.magenta
    case 'DELETE': return COLOR.red
    default: return COLOR.reset
  }
}

function statusColor(status) {
  if (status >= 500) return COLOR.red
  if (status >= 400) return COLOR.yellow
  if (status >= 300) return COLOR.cyan
  return COLOR.green
}

function appendServerLog(line) {
  try { fs.appendFileSync(SERVER_LOG_PATH, line + '\n', 'utf8') } catch {}
  trimServerLog()
}

// Clears any in-progress CLI input, prints the given lines, then redraws
// whatever the user had typed so far — so log output never garbles it.
function writeLines(lines) {
  readline.clearLine(process.stdout, 0)
  readline.cursorTo(process.stdout, 0)
  for (const line of lines) console.log(line)
  cli.prompt(true)
}

function levelForStatus(status) {
  if (status >= 500) return 'ERROR'
  if (status >= 400) return 'WARN'
  return 'INFO'
}

function logRequest({ method, url, statusCode, responseTime }) {
  const ts = timestamp()
  const ms = Math.round(responseTime)
  const level = levelForStatus(statusCode)

  appendServerLog(`[${ts}] [${level}] ${method.padEnd(7)} ${url}  ${statusCode}  ${ms}ms`)

  writeLines([
    `${COLOR.dim}[${ts}]${COLOR.reset} ` +
    `${statusColor(statusCode)}[${level}]${COLOR.reset} ` +
    `${methodColor(method)}${COLOR.bold}${method.padEnd(7)}${COLOR.reset}` +
    `${url}  ` +
    `${statusColor(statusCode)}${statusCode}${COLOR.reset}  ` +
    `${COLOR.dim}${ms}ms${COLOR.reset}`,
  ])
}

function logError(context, err) {
  const ts = timestamp()
  const message = err?.stack || err?.message || String(err)

  appendServerLog(`[${ts}] [ERROR] ${context}\n${message}`)

  writeLines([
    `${COLOR.dim}[${ts}]${COLOR.reset} ${COLOR.red}${COLOR.bold}[ERROR]${COLOR.reset} ${COLOR.red}${context}${COLOR.reset}`,
    `${COLOR.dim}${message}${COLOR.reset}`,
  ])
}

function logInfo(message) {
  const ts = timestamp()
  appendServerLog(`[${ts}] [INFO] ${message}`)
  writeLines([`${COLOR.dim}[${ts}]${COLOR.reset} ${COLOR.green}${COLOR.bold}[INFO]${COLOR.reset} ${message}`])
}

function logWarn(message) {
  const ts = timestamp()
  appendServerLog(`[${ts}] [WARN] ${message}`)
  writeLines([`${COLOR.dim}[${ts}]${COLOR.reset} ${COLOR.yellow}${COLOR.bold}[WARN]${COLOR.reset} ${message}`])
}

function logCli(message) {
  const ts = timestamp()
  appendServerLog(`[${ts}] [CLI] ${message}`)
  writeLines([`${COLOR.dim}[${ts}]${COLOR.reset} ${COLOR.magenta}${COLOR.bold}[CLI]${COLOR.reset} ${message}`])
}

function logCliBlock(title, items) {
  const ts = timestamp()
  appendServerLog(`[${ts}] [CLI] ${title}\n${items.map((i) => `  ${i}`).join('\n')}`)
  writeLines([
    `${COLOR.dim}[${ts}]${COLOR.reset} ${COLOR.magenta}${COLOR.bold}[CLI]${COLOR.reset} ${title}`,
    ...items.map((i) => `  ${COLOR.dim}${i}${COLOR.reset}`),
  ])
}

function logStartup(port) {
  writeLines([
    '',
    `  ${COLOR.cyan}${COLOR.bold}GymBuddy${COLOR.reset}${COLOR.dim} backend${COLOR.reset}`,
    `  ${COLOR.green}${COLOR.bold}➜${COLOR.reset}  http://localhost:${port}`,
    `  ${COLOR.dim}Logs: backend/data/server.log${COLOR.reset}`,
    '',
  ])
}

module.exports = { writeLLMLog, logRequest, logError, logInfo, logWarn, logCli, logCliBlock, logStartup, cli }
