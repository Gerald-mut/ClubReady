import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { inviteReturn } from '../../services/invite-return'
import { backend, message } from '../../services/supabase'
import { useAuth } from '../../hooks/useAuth'

type Mode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'
const titles = { 'sign-in': 'Sign in', 'sign-up': 'Create your account', 'forgot-password': 'Forgot password', 'reset-password': 'Set a new password' }
export default function AuthPage({ mode }: { mode: Mode }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = inviteReturn(location.search)
  const destination = returnTo || '/club-profile'
  const authQuery = returnTo ? `?next=${encodeURIComponent(returnTo)}` : ''
  const [error, setError] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('error_description') || new URLSearchParams(window.location.search).get('error_description') || '')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  if (auth.loading) return <p role="status">Restoring your session…</p>
  if (auth.recovery && mode !== 'reset-password') return <Navigate to="/reset-password" replace />
  if (auth.session && !auth.recovery && (mode === 'sign-in' || mode === 'sign-up')) return <Navigate to={destination} replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    if (mode === 'reset-password' && password !== form.get('confirm')) { setError('Passwords do not match.'); return }
    submitting.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const client = backend()
      if (mode === 'sign-in') {
        const result = await client.auth.signInWithPassword({ email, password })
        if (result.error) throw result.error
        navigate(destination, { replace: true })
      } else if (mode === 'sign-up') {
        const result = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/sign-in${authQuery}` } })
        if (result.error) throw result.error
        if (result.data.session) navigate(destination, { replace: true })
        else setNotice('Check your email to confirm your account, then sign in. If you already have an account, sign in or reset your password.')
      } else if (mode === 'forgot-password') {
        const result = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        if (result.error) throw result.error
        setNotice('If an account exists for this email, you will receive a password reset link.')
      } else {
        const result = await client.auth.updateUser({ password })
        if (result.error) throw result.error
        auth.finishRecovery(); setNotice('Your password has been updated. You can continue to your club.')
      }
    } catch (failure) { setError(message(failure)) }
    finally { submitting.current = false; setBusy(false) }
  }
  const reset = mode === 'reset-password'
  return <section className="mx-auto max-w-md bg-white p-6 sm:p-8 rounded-xl border border-slate-200">
    <h1 className="text-2xl font-bold">{titles[mode]}</h1>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    {auth.error && <p role="alert">{auth.error}</p>}
    {notice && <p role="status" className="mt-4 text-green-800">{notice}</p>}
    {reset && !auth.session ? <p className="mt-4">Open the password reset link from your email. If it has expired, request another below.</p> : <form className="mt-6 space-y-4" onSubmit={event => void submit(event)}>
      {!reset && <label className="field">Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
      {mode !== 'forgot-password' && <label className="field">Password<input name="password" type="password" required minLength={8} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} /></label>}
      {reset && <label className="field">Confirm password<input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label>}
      <button className="button" disabled={busy}>{busy ? 'Please wait…' : titles[mode]}</button>
    </form>}
    <div className="mt-6 flex flex-wrap gap-4 text-sm text-green-800 underline">
      <Link to={`/sign-in${authQuery}`}>Sign in</Link><Link to={`/sign-up${authQuery}`}>Create account</Link><Link to="/forgot-password">Forgot password</Link>
      {reset && notice && <Link to="/club-profile">Continue to club</Link>}
    </div>
  </section>
}
