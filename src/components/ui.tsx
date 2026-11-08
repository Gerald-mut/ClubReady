import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
export function SectionHeading({ title, href, action }: { title: string; href?: string; action?: string }) {
  return <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2>{href && <Link className="text-link inline-flex min-h-11 items-center" to={href}>{action || 'View all'}</Link>}</div>
}
export function StatCard({ value, label }: { value: ReactNode; label: string }) {
  return <div className="quiet-card"><p className="text-3xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs text-muted">{label}</p></div>
}
export function PageHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <div>{eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}<h1 className="page-title">{title}</h1>{children && <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div>}</div>
}
