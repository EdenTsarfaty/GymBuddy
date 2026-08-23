import SpotifyIcon from './SpotifyIcon'

// Keyed by the same provider ids used in Settings' Music Provider picker.
// Only Spotify exists today — adding another provider later is just another
// entry here, nothing that reaches for this component needs to change.
const PROVIDER_ICONS = {
  spotify: SpotifyIcon,
}

function MusicProviderIcon({ provider, size }) {
  const Icon = PROVIDER_ICONS[provider]
  if (!Icon) return null
  return <Icon size={size} />
}

export default MusicProviderIcon
