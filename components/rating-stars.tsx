'use client'
import { Star } from 'lucide-react'
export function RatingStars({
  value,
  onChange,
  label = 'rating',
}: {
  value: number
  onChange?: (value: number) => void
  label?: string
}) {
  return (
    <span className="inline-flex items-center text-[#D9931C]">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${label}: ${n} stars`}
          className="min-h-11 min-w-8 transition-transform active:scale-90"
          onClick={() => onChange?.(n)}
        >
          <Star size={18} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </span>
  )
}
