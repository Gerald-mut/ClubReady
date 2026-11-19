// Only invite routes may be used as authentication return destinations.
export function inviteReturn(search: string) {
  const next = new URLSearchParams(search).get('next')
  return next && /^\/join(?:\/[a-f0-9]{64})?$/.test(next) ? next : null
}
export function inviteCode(input: string) {
  const value = input.trim()
  if (/^[a-f0-9]{64}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (url.origin !== window.location.origin) return null
    return /^\/join\/([a-f0-9]{64})$/.exec(url.pathname)?.[1] || null
  } catch { return null }
}
