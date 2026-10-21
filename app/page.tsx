'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, Copy, ForkKnife, Heart, ListFilter, MapPin, Plus, Search, Sparkles, Star, Users, Utensils, X } from 'lucide-react'

const places = [
  { id: '1', name: 'Clover Club', type: 'Modern European · $$', address: '14 Bedford Ave, Brooklyn', score: 4.8, status: 'Been', pinned: true, color: 'bg-[#ead5c9]', image: '🍽️', ratings: [['M', 5], ['J', 4.5]] },
  { id: '2', name: 'Superiority Burger', type: 'Vegetarian · $', address: '119 Avenue A, New York', score: 4.4, status: 'Been', pinned: false, color: 'bg-[#dbe6d4]', image: '🥬', ratings: [['M', 4], ['J', 5]] },
  { id: '3', name: 'Rolo’s', type: 'Italian · $$$', address: '853 Onderdonk Ave, Queens', score: 4.7, status: 'Want to try', pinned: true, color: 'bg-[#e8d9c4]', image: '🍝', ratings: [['M', 0], ['J', 0]] },
  { id: '4', name: 'Ramen Danbo', type: 'Japanese · $$', address: '52 7th Ave, New York', score: 4.1, status: 'Been', pinned: false, color: 'bg-[#ddd8e6]', image: '🍜', ratings: [['M', 4], ['J', 4]] },
]

const navItems = [
  { id: 'places', label: 'Places', icon: Utensils },
  { id: 'map', label: 'Map', icon: MapPin },
  { id: 'lists', label: 'Lists', icon: ListFilter },
  { id: 'you', label: 'For you', icon: Sparkles },
  { id: 'group', label: 'Group', icon: Users },
]

function Logo() {
  return <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-[#7B2D5B] text-[#fff8f4]"><ForkKnife size={18} strokeWidth={2.3} /></div><span className="font-serif text-[22px] font-bold tracking-[-0.04em]">crumbs</span></div>
}

function Stars({ score = 0, small = false }: { score?: number, small?: boolean }) {
  return <div className="flex items-center gap-0.5 text-[#D9931C]" aria-label={`${score} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={small ? 12 : 14} fill={star <= Math.round(score) ? 'currentColor' : 'none'} strokeWidth={1.8} />)}</div>
}

function PlaceCard({ place, onSelect }: { place: typeof places[number], onSelect: () => void }) {
  return <button onClick={onSelect} className="group flex w-full gap-3 rounded-[22px] bg-card p-3 text-left shadow-[0_3px_18px_rgba(28,42,35,0.06)] transition-transform hover:-translate-y-0.5">
    <div className={`grid size-[76px] shrink-0 place-items-center rounded-[17px] ${place.color} text-3xl`}>{place.image}</div>
    <div className="min-w-0 flex-1 py-0.5">
      <div className="flex items-start justify-between gap-2"><div><h3 className="truncate font-serif text-[18px] font-bold leading-tight text-foreground">{place.name}</h3><p className="mt-1 truncate text-[11px] text-muted-foreground">{place.type}</p></div>{place.pinned && <Heart size={15} fill="currentColor" className="shrink-0 text-[#7B2D5B]" />}</div>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{place.address}</p>
      <div className="mt-2 flex items-center gap-2"><span className="font-serif text-[22px] font-bold leading-none text-foreground">{place.score.toFixed(1)}</span><Stars score={place.score} small /><div className="ml-auto flex -space-x-1.5">{place.ratings.map(([initial], i) => <span key={i} className="grid size-5 place-items-center rounded-full border-2 border-card bg-[#b9c8b4] text-[8px] font-bold text-[#1C2A23]">{initial}</span>)}</div></div>
    </div>
  </button>
}

function MapPreview({ onPlace }: { onPlace: (place: typeof places[number]) => void }) {
  const hasKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
  return <div className="relative h-[calc(100vh-154px)] min-h-[500px] overflow-hidden rounded-[28px] bg-[#dfe9dc] dark:bg-[#24352c]">
    {!hasKey ? <div className="absolute inset-0 grid place-items-center p-8 text-center"><div className="max-w-xs rounded-3xl bg-card/95 p-6 shadow-xl backdrop-blur"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[#e1ebdd] text-[#7B2D5B]"><MapPin size={23} /></div><h2 className="font-serif text-xl font-bold">Your map is ready to bloom</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Add <code className="rounded bg-muted px-1.5 py-0.5 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to connect Google Maps and search real places.</p></div></div> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,#fff9_0_2px,transparent_3px),linear-gradient(135deg,#dfe9dc,#cbdcc8)]" />}
    <div className="absolute left-1/2 top-1/3 h-20 w-20 -translate-x-1/2 rounded-full border-[16px] border-[#7B2D5B]/20" />
    {places.map((place, i) => <button key={place.id} onClick={() => onPlace(place)} aria-label={`Open ${place.name}`} className={`absolute grid size-11 place-items-center rounded-full border-4 border-card shadow-lg transition-transform hover:scale-110 ${place.status === 'Want to try' ? 'bg-[#D9931C]' : 'bg-[#7B2D5B]'} ${i === 0 ? 'left-[35%] top-[24%]' : i === 1 ? 'left-[64%] top-[38%]' : i === 2 ? 'left-[27%] top-[61%]' : 'left-[70%] top-[70%]'}`}><span className="font-serif text-sm font-bold text-white">{place.score.toFixed(1)}</span></button>)}
    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl bg-card/90 p-3 shadow-lg backdrop-blur"><span className="text-xs font-medium text-muted-foreground">{places.length} spots in your group</span><button className="rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background">Re-center</button></div>
  </div>
}

function PlaceSheet({ place, onClose }: { place: typeof places[number], onClose: () => void }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/20 p-0 backdrop-blur-[2px] sm:p-5" onClick={onClose}><div className="w-full max-w-lg rounded-t-[28px] bg-card p-5 shadow-2xl sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" /><div className="flex items-start justify-between"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#7B2D5B]">{place.status}</p><h2 className="font-serif text-3xl font-bold tracking-[-0.04em]">{place.name}</h2><p className="mt-1 text-sm text-muted-foreground">{place.address}</p></div><button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-muted" aria-label="Close"><X size={17} /></button></div><div className="mt-5 flex items-center gap-3 rounded-2xl bg-muted p-3"><span className="font-serif text-4xl font-bold">{place.score.toFixed(1)}</span><div><Stars score={place.score} /><p className="mt-1 text-xs text-muted-foreground">Group average from 2 ratings</p></div></div><div className="mt-4 flex gap-2"><button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#1C2A23] py-3 text-sm font-semibold text-white"><ArrowUpRight size={16} /> Open in Google Maps</button><button className="rounded-2xl border border-border px-4 py-3 text-sm font-semibold">Directions</button></div><div className="mt-5 border-t border-border pt-4"><div className="flex items-center justify-between"><h3 className="font-serif text-lg font-bold">Your rating</h3><Stars score={4} /></div><p className="mt-1 text-sm text-muted-foreground">Leave a note to help your group remember.</p><div className="mt-3 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">Tap to add a note…</div></div></div></div>
}

export default function Page() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }, [])
  const [tab, setTab] = useState('places')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<typeof places[number] | null>(null)
  const filtered = useMemo(() => places.filter((p) => (filter === 'All' || (filter === 'Pinned' ? p.pinned : p.status === filter)) && `${p.name} ${p.type}`.toLowerCase().includes(query.toLowerCase())), [filter, query])
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-6xl px-4 pb-28 sm:px-8 lg:px-12">
    <header className="flex items-center justify-between py-5"><Logo /><div className="flex items-center gap-2"><button className="grid size-10 place-items-center rounded-full bg-card shadow-sm" aria-label="Group members"><Users size={17} /></button><button className="grid size-10 place-items-center rounded-full bg-[#c5d6bf] text-xs font-bold text-[#1C2A23]" aria-label="Your profile">MK</button></div></header>
    <div className="mb-6 flex items-end justify-between"><div><p className="text-sm font-medium text-muted-foreground">Saturday, October 18</p><h1 className="mt-1 font-serif text-[34px] font-bold leading-none tracking-[-0.05em]">Our little food map</h1></div><button className="flex items-center gap-1 text-sm font-semibold text-[#7B2D5B]">Brooklyn <ChevronDown size={16} /></button></div>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1"><div className="relative min-w-[170px] flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places" className="h-11 w-full rounded-2xl bg-card pl-10 pr-3 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-[#7B2D5B]" /></div>{['All', 'Been', 'Want to try', 'Pinned'].map((item) => <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-2xl px-4 text-sm font-semibold transition-colors ${filter === item ? 'bg-[#1C2A23] text-white dark:bg-[#d9e8d4] dark:text-[#1C2A23]' : 'bg-card text-muted-foreground ring-1 ring-border'}`}>{item}</button>)}</div>
    {tab === 'places' && <section className="grid gap-3 sm:grid-cols-2">{filtered.map((place) => <PlaceCard key={place.id} place={place} onSelect={() => setSelected(place)} />)}</section>}
    {tab === 'map' && <MapPreview onPlace={setSelected} />}
    {tab === 'you' && <section className="grid gap-4 sm:grid-cols-2"><div className="rounded-[24px] bg-[#e9dce5] p-5 dark:bg-[#43283a]"><div className="flex items-center gap-2 text-[#7B2D5B]"><Sparkles size={17} /><span className="text-xs font-bold uppercase tracking-[0.12em]">AI picks for your group</span></div><h2 className="mt-3 font-serif text-2xl font-bold">A perfect next bite</h2><p className="mt-2 text-sm leading-6 text-foreground/70">Try the cacio e pepe at Rolo’s next. It matches the dishes you both rate highest.</p><button className="mt-4 rounded-xl bg-[#7B2D5B] px-4 py-2.5 text-sm font-semibold text-white">See recommendations</button></div><div className="rounded-[24px] bg-card p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Group favourites</h2><div className="mt-4 flex items-center gap-3"><span className="text-3xl">1</span><div><p className="font-semibold">Clover Club</p><div className="mt-1 flex items-center gap-2"><Stars score={4.8} small /><span className="text-xs text-muted-foreground">4.8 average</span></div></div></div><div className="mt-4 flex items-center gap-3 border-t border-border pt-4"><span className="text-3xl">2</span><div><p className="font-semibold">Superiority Burger</p><div className="mt-1 flex items-center gap-2"><Stars score={4.4} small /><span className="text-xs text-muted-foreground">4.4 average</span></div></div></div></div></section>}
    {tab === 'lists' && <section className="grid gap-3 sm:grid-cols-2">{[['Date night', '♡', '3 places', 'bg-[#ead5c9]'], ['Cheap eats', '$', '5 places', 'bg-[#dbe6d4]'], ['Sunday strolls', '☼', '2 places', 'bg-[#e8d9c4]']].map(([name, icon, count, color]) => <button key={name} className="flex items-center gap-4 rounded-[24px] bg-card p-4 text-left shadow-sm"><span className={`grid size-14 place-items-center rounded-2xl text-2xl ${color}`}>{icon}</span><span><strong className="block font-serif text-xl">{name}</strong><small className="text-sm text-muted-foreground">{count}</small></span><ArrowUpRight className="ml-auto text-muted-foreground" size={18} /></button>)}</section>}
    {tab === 'group' && <section className="rounded-[26px] bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Your group</p><h2 className="mt-1 font-serif text-3xl font-bold">Maya & Jordan</h2></div><button className="rounded-xl bg-muted p-2.5" aria-label="Copy join code"><Copy size={17} /></button></div><div className="mt-5 rounded-2xl bg-[#e9dce5] p-4 dark:bg-[#43283a]"><p className="text-xs font-semibold text-[#7B2D5B]">Join code</p><p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em]">CRUMBS</p><p className="mt-1 text-xs text-muted-foreground">Share this with your favourite people.</p></div><h3 className="mt-6 font-serif text-lg font-bold">Members · 2</h3><div className="mt-3 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#c5d6bf] text-sm font-bold">MK</span><span><strong className="block text-sm">Maya Kim</strong><small className="text-xs text-muted-foreground">You</small></span></div><div className="mt-3 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#ead5c9] text-sm font-bold">JR</span><span><strong className="block text-sm">Jordan Reed</strong><small className="text-xs text-muted-foreground">Member</small></span></div><button className="mt-6 w-full rounded-2xl border border-destructive/30 py-3 text-sm font-semibold text-destructive">Leave group</button></section>}
    <button className="fixed bottom-[82px] right-5 z-20 flex items-center gap-2 rounded-full bg-[#7B2D5B] px-5 py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(123,45,91,.3)] sm:bottom-8 sm:right-8"><Plus size={18} /> Add a place</button>
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-lg"><div className="mx-auto flex max-w-lg items-center justify-around">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex min-w-14 flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[10px] font-semibold ${tab === id ? 'text-[#7B2D5B]' : 'text-muted-foreground'}`}><Icon size={19} strokeWidth={tab === id ? 2.5 : 1.8} /><span>{label}</span></button>)}</div></nav>
    {selected && <PlaceSheet place={selected} onClose={() => setSelected(null)} />}
  </div></main>
}
