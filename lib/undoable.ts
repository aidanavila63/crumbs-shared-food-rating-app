import { toast } from 'sonner'

/**
 * Hides something immediately, shows an Undo toast, and only performs the real
 * delete once the toast has expired. If the delete fails, the item is restored.
 */
export function undoableDelete({
  message,
  hide,
  restore,
  commit,
  delay = 6000,
}: {
  message: string
  hide: () => void
  restore: () => void
  commit: () => Promise<{ message: string } | null | void>
  delay?: number
}) {
  let undone = false
  hide()
  const timer = setTimeout(async () => {
    if (undone) return
    const error = await commit()
    if (error) {
      restore()
      toast.error(`Couldn't delete: ${error.message}`)
    }
  }, delay)
  toast(message, {
    duration: delay,
    action: {
      label: 'Undo',
      onClick: () => {
        undone = true
        clearTimeout(timer)
        restore()
      },
    },
  })
}
