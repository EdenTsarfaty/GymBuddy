const os = require('node:os')

// Tailscale assigns every node an IP in its CGNAT range (100.64.0.0/10, i.e.
// 100.64.0.0-100.127.255.255). Checking for that is enough to tell whether
// this machine currently has an active tailnet connection, without needing
// the `tailscale` CLI installed/in PATH or shelling out to a subprocess.
function isTailscaleAddress(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127
}

function isTailscaleConnected() {
  const interfaces = os.networkInterfaces()
  for (const ifaceList of Object.values(interfaces)) {
    for (const iface of ifaceList || []) {
      if (iface.family === 'IPv4' && !iface.internal && isTailscaleAddress(iface.address)) return true
    }
  }
  return false
}

module.exports = { isTailscaleConnected }
