import { AtSign, Globe, MessageCircle, Send, type LucideIcon } from 'lucide-react'

type Kind = 'instagram' | 'telegram' | 'whatsapp' | 'linkedin' | 'at' | 'lucide'

function kindFor(label: string): { kind: Kind; icon?: LucideIcon } {
  const k = label.trim().toLowerCase()
  if (/(instagram|insta|اینستاگرام|اینستا)/.test(k)) return { kind: 'instagram' }
  if (/(telegram|تلگرام)/.test(k)) return { kind: 'telegram', icon: Send }
  if (/(whatsapp|واتس)/.test(k)) return { kind: 'whatsapp', icon: MessageCircle }
  if (/(linkedin|لینکدین)/.test(k)) return { kind: 'linkedin' }
  if (/@/.test(k)) return { kind: 'at', icon: AtSign }
  return { kind: 'lucide', icon: Globe }
}

/**
 * Social network glyph — lucide dropped brand icons, so Instagram and
 * LinkedIn are drawn inline; the rest resolve to generic lucide icons.
 */
export function SocialIcon({ label, size = 16 }: { label: string; size?: number }) {
  const { kind, icon: Icon } = kindFor(label)
  if (kind === 'instagram') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    )
  }
  if (kind === 'linkedin') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4.98 3.5a2.49 2.49 0 1 1 0 4.98 2.49 2.49 0 0 1 0-4.98zM3 9h4v12H3zM9.5 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.2 1.4-2.2 3V21h-4z" />
      </svg>
    )
  }
  return Icon ? <Icon size={size} aria-hidden="true" /> : null
}
