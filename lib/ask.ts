'use client'
// In-app replacements for window.confirm / window.prompt. Themed, readable on the
// phone, and they don't show the site's web address the way native popups do in the PWA.
export type AskRequest = {
  title: string
  body?: string
  confirm?: string
  danger?: boolean
  input?: { value: string; label: string }
  resolve: (value: string | boolean | null) => void
}

let show: ((req: AskRequest | null) => void) | null = null
export const registerAsk = (fn: typeof show) => {
  show = fn
}

function open(req: Omit<AskRequest, 'resolve'>) {
  return new Promise<string | boolean | null>((resolve) => {
    if (!show) {
      // Host not mounted yet: fall back to the native popups.
      resolve(req.input ? window.prompt(req.title, req.input.value) : window.confirm(req.title))
      return
    }
    show({ ...req, resolve })
  })
}

/** Ask yes/no. Resolves true only on the confirm button. */
export async function askConfirm(
  title: string,
  opts: { body?: string; confirm?: string; danger?: boolean } = {},
) {
  return (await open({ title, ...opts })) === true
}

/** Ask for text. Resolves the trimmed text, or null if cancelled or empty. */
export async function askText(title: string, value = '', confirm = 'Save') {
  const answer = await open({ title, confirm, input: { value, label: title } })
  return typeof answer === 'string' && answer.trim() ? answer.trim() : null
}
