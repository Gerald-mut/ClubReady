import { useEffect, useRef, useState, type FormEvent } from 'react'
import { deleteDocument, documentUrl, listDocuments, uploadDocument } from '../../services/documents'
import { message } from '../../services/supabase'
import { documentTypes, type Evidence } from '../../types/club'
export default function Documents({ clubId, userId, admin }: { clubId: string; userId: string; admin: boolean }) {
  const [documents, setDocuments] = useState<Evidence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; download: boolean; name: string } | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    let active = true
    void listDocuments(clubId).then(data => { if (active) setDocuments(data) })
      .catch(failure => { if (active) setError(message(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [clubId, version])
  useEffect(() => {
    if (!link) return
    const timer = setTimeout(() => setLink(null), 55_000)
    return () => clearTimeout(timer)
  }, [link])
  async function action(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice(''); setLink(null)
    try { await work() } catch (failure) { setError(message(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('file') as File
    void action(async () => {
      await uploadDocument(clubId, userId, data.get('document_type') as Evidence['document_type'], file)
      form.reset(); setNotice('Document supplied. It has not been independently verified. Readiness reassessment may take time.'); setLoading(true); setVersion(value => value + 1)
    })
  }
  return <section id="club-documents" className="scroll-mt-6 mt-10 border-t border-border pt-6" aria-label="Club documents" aria-busy={busy || loading}>
    <h2 className="text-xl font-semibold">Club documents</h2><p className="mt-2 text-sm text-muted">Private to club members. Supplied documents have not been independently verified.</p>
    {admin && <form className="mt-5 grid gap-4 max-w-xl" onSubmit={upload}>
      <label className="field">Document type<select name="document_type">{Object.entries(documentTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field">File (PDF, JPEG or PNG, up to 5 MB)<input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label>
      <button className="button justify-self-start" disabled={busy}>{busy ? 'Please wait…' : 'Upload document'}</button>
    </form>}
    {error && <div role="alert" className="mt-4 text-ink">{error} <button className="underline" onClick={() => { setError(''); setLoading(true); setVersion(value => value + 1) }}>Reload documents</button></div>}
    {notice && <p role="status" className="mt-4 text-sm text-ink">{notice}</p>}
    {link && <p className="mt-4"><a className="text-accent-readable underline" href={link.url} target="_blank" rel="noopener noreferrer">{link.download ? 'Download' : 'Open'} {link.name}</a><span className="block text-sm text-muted">This private link expires in one minute.</span></p>}
    {loading ? <p role="status" className="mt-4 text-sm text-ink">Loading documents…</p> : documents.length === 0 ? <p className="mt-4 text-muted">No documents supplied yet.</p> : <ul className="mt-4 divide-y divide-border">
      {documents.map(document => <li id={`document-${document.id}`} key={document.id} className="py-4">
        <p className="font-medium break-words">{document.file_name}</p><p className="text-sm text-muted">{documentTypes[document.document_type]} · {(document.file_size / 1024).toFixed(0)} KB · Supplied</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-accent-readable">
          {[false, true].map(download => <button className="underline" disabled={busy} key={String(download)} onClick={() => void action(async () => { const url = await documentUrl(document, download); setLink({ url, download, name: document.file_name }) })}>{download ? 'Download' : 'View'}</button>)}
          {admin && <button className="underline text-ink" disabled={busy} onClick={() => setPendingDelete(document.id)}>Delete</button>}
        </div>
        {pendingDelete === document.id && <div className="mt-3" role="group" aria-label="Confirm document deletion"><p>Delete {document.file_name}? This cannot be undone.</p><div className="mt-2 flex gap-4"><button disabled={busy} className="text-ink underline" onClick={() => void action(async () => { await deleteDocument(document); setPendingDelete(null); setNotice('Document deleted.'); setLoading(true); setVersion(value => value + 1) })}>Confirm delete</button><button disabled={busy} onClick={() => setPendingDelete(null)}>Cancel</button></div></div>}
      </li>)}
    </ul>}
  </section>
}
