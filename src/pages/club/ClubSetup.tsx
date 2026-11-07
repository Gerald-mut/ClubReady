import { useState } from 'react'
import ClubForm from '../../components/club/ClubForm'
import { createClub } from '../../services/clubs'
import { useClub } from '../../hooks/useClub'
export default function ClubSetup() {
  const { refresh } = useClub()
  const [created, setCreated] = useState(false)
  return <section className="panel"><h1 className="text-3xl font-bold">Set up your club</h1><p className="mt-3 text-slate-600">Start with your club details. Registration documents are optional and can be added later.</p>
    {created ? <p role="status">Club created. Loading your profile…</p> : <ClubForm label="Create club" onSave={async input => { await createClub(input); setCreated(true); await refresh() }} />}
  </section>
}
