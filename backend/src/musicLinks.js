// Resolves a pasted music link into {type, title, thumbnail_url} for display
// in the home header's music-provider grid. Only Spotify exists today, but
// this is written as a provider dispatch (resolveMusicLink keyed by
// provider id) rather than a single Spotify-only function, so a future
// provider is just another case here — nothing upstream needs to change.

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'spotify.link'])
const SPOTIFY_TYPES = new Set(['track', 'album', 'artist', 'playlist', 'show', 'episode'])

class MusicLinkError extends Error {}

async function resolveSpotifyLink(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new MusicLinkError('That doesn\'t look like a valid link.')
  }
  if (!SPOTIFY_HOSTS.has(parsed.hostname)) {
    throw new MusicLinkError('That doesn\'t look like a Spotify link.')
  }

  // spotify.link URLs are short redirects to the real open.spotify.com URL —
  // fetch() follows redirects by default, so response.url is the resolved
  // one. Also covers open.spotify.com URLs carrying a redirect (e.g. after
  // a login wall) themselves.
  let resolvedUrl
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new MusicLinkError('Could not read that link from Spotify.')
    resolvedUrl = res.url
  } catch (err) {
    if (err instanceof MusicLinkError) throw err
    throw new MusicLinkError('Could not reach Spotify.')
  }

  const pathParts = new URL(resolvedUrl).pathname.split('/').filter(Boolean)
  const type = pathParts.find((part) => SPOTIFY_TYPES.has(part))
  if (!type) {
    throw new MusicLinkError('That link isn\'t a track, album, playlist, artist, or show.')
  }

  const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(resolvedUrl)}`)
  if (!oembedRes.ok) {
    throw new MusicLinkError('Spotify couldn\'t find anything at that link.')
  }
  const oembed = await oembedRes.json()

  return {
    type,
    title: oembed.title || null,
    thumbnail_url: oembed.thumbnail_url || null,
    resolvedUrl,
  }
}

const RESOLVERS = {
  spotify: resolveSpotifyLink,
}

async function resolveMusicLink(provider, url) {
  const resolver = RESOLVERS[provider]
  if (!resolver) throw new MusicLinkError(`Unsupported music provider: ${provider}`)
  return resolver(url)
}

module.exports = { resolveMusicLink, MusicLinkError }
