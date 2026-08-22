const TOKEN_KEY = 'versus-session-token'
const ADDRESS_KEY = 'versus-session-address'

export type Session = {
  token: string
  address: string
  label: string
}

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const address = localStorage.getItem(ADDRESS_KEY)
  if (!token || !address) return null
  return { token, address, label: maskLocal(address) }
}

export function setSession(session: Session) {
  localStorage.setItem(TOKEN_KEY, session.token)
  localStorage.setItem(ADDRESS_KEY, session.address)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADDRESS_KEY)
}

function maskLocal(address: string): string {
  const compact = address.replace(/\s+/g, '')
  return `${compact.slice(0, 6)}…${compact.slice(-4)}`
}
