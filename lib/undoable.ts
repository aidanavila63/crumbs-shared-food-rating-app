import { toast } from 'sonner'

/** Ids hidden while their Undo toast is showing. Data reloads must skip these. */
export const pendingDeletes = new Set<string>()

/**
 * Hides something immediately, shows an Undo toast, and only performs the real
 * delete once the toast has expired. If the delete fails, the item is restored.
 */
export function undoableDelete({
  id,
  message,
  hide,
  restore,
  commit,
  delay = 6000,
}: {
  id: string
  message: string
  hide: () => void
  restore: () => void
  commit: () => Promise<{ message: string } | null | void>
  delay?: number
}) {
  let undone = false
  pendingDeletes.add(id)
  hide()
  const timer = setTimeout(async () => {
    if (undone) return
    const error = await commit()
    pendingDeletes.delete(id)
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
        pendingDeletes.delete(id)
        restore()
      },
    },
  })
}
