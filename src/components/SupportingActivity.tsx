import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { backend, message } from '../services/supabase'
import type { SupportingActivity as Activity } from '../services/readiness'
export default function SupportingActivity({ clubId }: { clubId: string }) {
  const [params] = useSearchParams()
  const id = params.get('activity')
  return id ? <Detail key={`${clubId}:${id}`} id={id} clubId={clubId} /> : null
}
function Detail({ id, clubId }: { id: string; clubId: string }) {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error } = await backend().from('activities').select('id,club_id,title,date,activity_type').eq('id', id).eq('club_id', clubId).maybeSingle()
        if (error) throw error
        if (data && data.club_id !== clubId) throw new Error('Activity club scope mismatch.')
        if (active) setActivity(data)
      } catch (failure) { if (active) setError(message(failure)) }
      finally { if (active) setDone(true) }
    })()
    return () => { active = false }
  }, [clubId, id])
  return <section className="border-y border-border py-4" aria-label="Supporting cloud activity"><h2 className="font-semibold">Supporting cloud activity</h2>{error ? <p role="alert">{error}</p> : !done ? <p role="status">Loading supporting activity…</p> : activity ? <><h3 className="mt-2 break-words">{activity.title}</h3><p>{activity.date} · {activity.activity_type}</p></> : <p>Activity unavailable or access has changed.</p>}</section>
}
