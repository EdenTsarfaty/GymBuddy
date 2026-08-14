// Real production (Cloudflare) always sets VITE_API_BASE via its own dashboard, so
// the `||` below short-circuits before the fallback ever runs there — this fallback
// only matters for local `npm run dev` and `npm run preview`.
//
// Derive the backend URL from whatever origin the page itself was loaded from (same
// protocol + hostname, port 3001) rather than hardcoding one — this way it's correct
// for plain http://localhost:5173, http://<lan-ip>:5173, and for a tailscale-serve
// https://<tailnet-host> tunnel (which lands on the matching
// https://<tailnet-host>:3001 serve rule automatically — this is also what makes
// `npm run preview` work over Tailscale on a phone, same as before).
export const API_BASE = import.meta.env.VITE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3001`
