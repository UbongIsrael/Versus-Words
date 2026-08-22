const KEY = 'versus-player-id'

export function getPlayerId(): string {
  const existing = localStorage.getItem(KEY)
  if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(KEY, id)
  return id
}
