'use client'
// Open sheets and full-screen pages, newest last. Escape closes only the one on top,
// and the page scroll stays locked until the last one closes.
const stack: object[] = []
let savedOverflow = ''

export function pushLayer(me: object) {
  if (!stack.length) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  stack.push(me)
  return () => {
    const at = stack.indexOf(me)
    if (at >= 0) stack.splice(at, 1)
    if (!stack.length) document.body.style.overflow = savedOverflow
  }
}

export const isTopLayer = (me: object) => stack.at(-1) === me
