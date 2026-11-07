interface Props { title: string; description: string; nextStep: string }

export default function PageIntro({ title, description, nextStep }: Props) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
    <p className="text-sm font-semibold uppercase tracking-widest text-green-700">ClubReady 254</p>
    <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
    <p className="mt-4 max-w-2xl text-slate-600">{description}</p>
    <div className="mt-8 rounded-xl bg-green-50 p-5 text-green-950">
      <h2 className="font-semibold">Ready for development</h2><p className="mt-1 text-sm">{nextStep}</p>
    </div>
  </section>
}
