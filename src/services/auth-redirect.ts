/** Use the origin serving this build for local, staging and production callbacks. */
export function authRedirect(path: '/sign-in' | '/reset-password', query = '', origin = window.location.origin): string {
  const base = new URL(origin)
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Authentication requires an HTTP or HTTPS origin.')
  const url = new URL(path, base.origin)
  url.search = query
  return url.href
}
