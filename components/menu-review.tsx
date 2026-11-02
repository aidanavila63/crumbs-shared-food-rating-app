'use client'
// #19 Menu photo → dish list. Shows what was read; you tick and fix before anything is saved.
import { useState } from 'react'
import type { MenuLine } from '@/lib/ocr-parse'

export function MenuReview({
  lines,
  existing,
  onCancel,
  onSave,
}: {
  lines: MenuLine[]
  existing: string[]
  onCancel: () => void
  onSave: (dishes: MenuLine[]) => void
}) {
  const have = new Set(existing.map((n) => n.trim().toLowerCase()))
  const [rows, setRows] = useState(
    lines.map((line) => ({ ...line, on: !have.has(line.name.toLowerCase()) })),
  )
  const chosen = rows.filter((r) => r.on && r.name.trim())
  return (
    <div className="surface rise-panel flex flex-col gap-2">
      <p className="font-semibold">
        Found {rows.length} dish{rows.length === 1 ? '' : 'es'} — tick the right ones and fix any
        typos
      </p>
      {rows.map((row, i) => (
        <div key={i} className={`flex items-center gap-2 ${row.on ? '' : 'opacity-50'}`}>
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-[var(--primary)]"
            aria-label={`Add ${row.name}`}
            checked={row.on}
            onChange={(event) =>
              setRows(rows.map((r, j) => (j === i ? { ...r, on: event.target.checked } : r)))
            }
          />
          <input
            className="field !min-h-10 !py-1 text-sm"
            aria-label="Dish name"
            value={row.name}
            maxLength={80}
            onChange={(event) =>
              setRows(rows.map((r, j) => (j === i ? { ...r, name: event.target.value } : r)))
            }
          />
          <input
            className="field !min-h-10 !w-20 !py-1 text-sm"
            aria-label="Price"
            inputMode="decimal"
            value={row.price ?? ''}
            onChange={(event) => {
              const n = Number(event.target.value.replace(/[^0-9.]/g, ''))
              setRows(
                rows.map((r, j) =>
                  j === i
                    ? { ...r, price: event.target.value && Number.isFinite(n) ? n : null }
                    : r,
                ),
              )
            }}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary flex-1"
          disabled={!chosen.length}
          onClick={() =>
            onSave(
              chosen.map((d) => ({ name: d.name, price: d.price, description: d.description })),
            )
          }
        >
          Add {chosen.length} dish{chosen.length === 1 ? '' : 'es'}
        </button>
      </div>
    </div>
  )
}
