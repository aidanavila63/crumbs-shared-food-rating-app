'use client'
import { haptic } from '@/lib/motion'

/** iOS-style on/off switch with a sliding knob. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'switch-on' : ''}`}
      onClick={() => {
        haptic('tap')
        onChange(!checked)
      }}
    >
      <span className="switch-knob" aria-hidden="true" />
    </button>
  )
}
