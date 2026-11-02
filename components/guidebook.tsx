'use client'
// #168 Walkthrough when you join (skippable) and the Guidebook (how everything works + tips).
import { useState } from 'react'
import { GUIDE, TIPS, TOUR, setTourDone } from '@/lib/guidebook'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'

export function Walkthrough({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const step = TOUR[i]
  const finish = () => {
    setTourDone()
    onDone()
  }
  return (
    <Overlay label="Welcome tour" onClose={finish}>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="tour-dots" aria-hidden="true">
          {TOUR.map((_, j) => (
            <span key={j} className={j === i ? 'tour-dot tour-dot-on' : 'tour-dot'} />
          ))}
        </div>
        <p key={`e${i}`} className="dice-reveal text-6xl" aria-hidden="true">
          {step.emoji}
        </p>
        <h2 key={`t${i}`} className="font-serif text-3xl font-bold">
          {step.title}
        </h2>
        <p className="max-w-sm text-muted-foreground">{step.text}</p>
        <div className="mt-2 flex w-full max-w-sm gap-2">
          {/* The round ✕ already skips, so this side goes back a card. */}
          <button
            className="secondary flex-1"
            disabled={i === 0}
            onClick={() => {
              haptic('tap')
              setI(i - 1)
            }}
          >
            Back
          </button>
          <button
            className="primary flex-1"
            onClick={() => {
              haptic('tap')
              if (i < TOUR.length - 1) setI(i + 1)
              else finish()
            }}
          >
            {i < TOUR.length - 1 ? 'Next' : 'Let’s eat'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          ✕ skips the tour. You can replay it from Settings → Guidebook.
        </p>
      </div>
    </Overlay>
  )
}

export function Guidebook({ onClose, onReplay }: { onClose: () => void; onReplay: () => void }) {
  return (
    <Overlay label="Guidebook" title="Guidebook" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {GUIDE.map((section) => (
          <details key={section.title} className="surface-soft">
            <summary className="cursor-pointer font-semibold">
              {section.emoji} {section.title}
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {section.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
        ))}
        <details className="surface-soft" open>
          <summary className="cursor-pointer font-semibold">💡 Tips & tricks</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
        <button className="secondary" onClick={onReplay}>
          Replay the welcome tour
        </button>
      </div>
    </Overlay>
  )
}
