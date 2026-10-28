import type { MouseEvent } from 'react'

/** Sets --gx/--gy on the card so the gold glow follows the pointer. */
export function trackGlow(e: MouseEvent<HTMLElement>) {
  const box = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--gx', `${((e.clientX - box.left) / box.width) * 100}%`)
  e.currentTarget.style.setProperty('--gy', `${((e.clientY - box.top) / box.height) * 100}%`)
}
