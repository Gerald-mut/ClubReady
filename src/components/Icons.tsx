export type IconName = 'home' | 'ball' | 'explore' | 'club' | 'profile' | 'shield' | 'arrow'
export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7 5 4-2 6H9l-2-6ZM12 3v4M3 10l4 1m2 6-2 3m8-3 2 3m0-9 4-1" /></>,
    explore: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6Z" /></>,
    club: <><path d="M4 21V8l8-5 8 5v13ZM2 21h20M9 21v-6h6v6M8 9h.01M16 9h.01" /></>,
    profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
