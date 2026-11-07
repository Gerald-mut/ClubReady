import { useRef, useState, type FormEvent } from 'react'
import type { ClubInput } from '../../types/club'
import { message } from '../../services/supabase'
export default function ClubForm({ initial, onSave, label }: { initial?: ClubInput; onSave: (input: ClubInput) => Promise<void>; label: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) || '').trim()
    if (!value('name') || !value('county')) { setError('Club name and county are required.'); return }
    const input: ClubInput = { name: value('name'), county: value('county'), sub_county: value('sub_county') || null, year_established: value('year_established') ? Number(value('year_established')) : null, description: value('description') || null, contact_email: value('contact_email') || null }
    lock.current = true; setBusy(true); setError('')
    try { await onSave(input) } catch (failure) { setError(message(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <form onSubmit={event => void submit(event)} className="mt-6 space-y-4 max-w-2xl">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="field">Club name (required)<input name="name" required maxLength={150} defaultValue={initial?.name} /></label>
      <label className="field">County (required)<input name="county" required maxLength={80} defaultValue={initial?.county} /></label>
      <label className="field">Sub-county<input name="sub_county" maxLength={100} defaultValue={initial?.sub_county || ''} /></label>
      <label className="field">Year established<input name="year_established" type="number" min={1800} max={new Date().getFullYear()} step={1} defaultValue={initial?.year_established || ''} /></label>
    </div>
    <label className="field">Description<textarea name="description" rows={4} maxLength={5000} defaultValue={initial?.description || ''} /></label>
    <label className="field">Contact email<input name="contact_email" type="email" maxLength={254} defaultValue={initial?.contact_email || ''} /></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button className="button" disabled={busy}>{busy ? 'Saving…' : label}</button>
  </form>
}
