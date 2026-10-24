// #110 Error log: sends a handful of browser errors per visit to the admin page.
// Small on purpose: max 5 per page load, no repeats, text trimmed to the table's limits.
let installed = false

export function installErrorReporter(supabase: any, userId: string) {
  if (installed || typeof window === 'undefined') return () => {}
  installed = true
  const seen = new Set<string>()
  const send = (message: string, stack?: string) => {
    const key = message.slice(0, 200)
    if (!message || seen.has(key) || seen.size >= 5) return
    // Browser-extension and network noise isn't ours to fix.
    if (/ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:/i.test(message))
      return
    seen.add(key)
    supabase
      .from('client_errors')
      .insert({
        user_id: userId,
        message: message.slice(0, 500),
        stack: stack?.slice(0, 2000) ?? null,
        url: location.pathname.slice(0, 300),
      })
      .then(() => {})
  }
  const onError = (event: ErrorEvent) => send(event.message, event.error?.stack)
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: any = event.reason
    send(String(reason?.message ?? reason ?? 'Unhandled promise rejection'), reason?.stack)
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    installed = false
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
