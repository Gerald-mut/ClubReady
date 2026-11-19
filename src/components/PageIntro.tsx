interface Props { title: string; description: string; nextStep: string }

export default function PageIntro({ title, description, nextStep }: Props) {
  return <section className="panel mx-auto max-w-2xl">
    <p className="eyebrow">ClubReady 254</p>
    <h1 className="page-title mt-3">{title}</h1>
    <p className="mt-4 max-w-2xl text-muted">{description}</p>
    <div className="mt-8 rounded-xl bg-canvas p-5 text-ink">
      <h2 className="font-semibold">Ready for development</h2><p className="mt-1 text-sm">{nextStep}</p>
    </div>
  </section>
}
