// Plain (server-safe) module: inlined into <head> by app/layout.tsx.
/**
 * Runs before the page paints (inlined in <head>) so a saved theme, accent or
 * "animations off" never flashes the default first.
 */
export const EARLY_PREFS_SCRIPT = `try{var t=JSON.parse(localStorage.getItem('crumbs-theme')||'{}'),r=document.documentElement;if(t.theme==='light'||t.theme==='dark')r.dataset.theme=t.theme;if(t.accent&&t.accent!=='plum')r.dataset.accent=t.accent;var m=JSON.parse(localStorage.getItem('crumbs-motion')||'{}');r.dataset.motion=m.animations===false?'off':'on'}catch(e){}`
