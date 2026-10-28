import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Phone, X } from 'lucide-react'
import { brand, contact, nav } from '../content/lawyers.fa.js'
import { useScrolled } from '../utils/useScrolled'
import { getLenis } from './SmoothScroll'
import './Header.css'

export function Header() {
  const scrolled = useScrolled(20)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const progressRef = useRef<HTMLSpanElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const markerRef = useRef<HTMLLIElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const nav = navRef.current
    const toggle = toggleRef.current
    // freeze page scroll while the drawer is open — Lenis uses its own
    // stopped class; the inline overflow covers the reduced-motion fallback
    const lenis = getLenis()
    lenis?.stop()
    // move focus into the drawer, trap Tab inside nav links + toggle
    nav?.querySelector<HTMLElement>('a.site-nav__link')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggle?.focus()
        return
      }
      if (e.key !== 'Tab' || !nav || !toggle) return
      const els = [
        ...nav.querySelectorAll<HTMLElement>('a[href]'),
        toggle,
      ]
      const idx = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && idx <= 0) {
        els[els.length - 1].focus()
        e.preventDefault()
      } else if (!e.shiftKey && idx === els.length - 1) {
        els[0].focus()
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
      lenis?.start()
    }
  }, [open])

  /* خط پیشرفت اسکرول — بدون re-render؛ transform روی DOM مستقیم نوشته می‌شود */
  useEffect(() => {
    const el = progressRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0
      el.style.transform = `scaleX(${p})`
    }
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  /* نشانگر کشویی زیر لینک فعال — اندازه‌گیری بعد از mount/route change.
     opacity اولیهٔ صفر است پس فلش رندر نمی‌گیرد (useLayoutEffect نمی‌خواهد). */
  useEffect(() => {
    const list = listRef.current
    const marker = markerRef.current
    if (!list || !marker) return
    const place = () => {
      const active = list.querySelector<HTMLElement>('a.is-active')
      if (!active || getComputedStyle(marker).display === 'none') {
        marker.style.opacity = '0'
        return
      }
      const listBox = list.getBoundingClientRect()
      const box = active.getBoundingClientRect()
      marker.style.opacity = '1'
      marker.style.width = `${box.width}px`
      marker.style.transform = `translateX(${box.left - listBox.left}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(list)
    return () => ro.disconnect()
  }, [pathname])

  return (
    <header
      className={`site-header${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}
    >
      {/* backdrop-filter روی این لایه است تا فرزندان fixed هدر (کشو/بک‌دراپ) به viewport نسبت شوند */}
      <div className="site-header__bg" aria-hidden="true" />
      <div className="container site-header__inner">
        <Link to="/" className="brand" aria-label={`${brand.legalName} — صفحه اصلی`}>
          <span className="brand__seal">
            <img src={brand.logoMark} alt="" width="42" height="33" decoding="async" />
          </span>
          <span className="brand__text">
            <span className="brand__name">{brand.name}</span>
            <span className="brand__en" lang="en" translate="no">
              {brand.nameEn}
            </span>
          </span>
        </Link>

        <nav
          id="site-nav"
          className="site-nav"
          aria-label="ناوبری اصلی"
          data-open={open}
          ref={navRef}
        >
          <ul className="site-nav__list" role="list" ref={listRef}>
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `site-nav__link${isActive ? ' is-active' : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="site-nav__marker" ref={markerRef} aria-hidden="true" />
          </ul>

          {contact.phones.length > 0 ? (
            <ul className="site-nav__phones" role="list">
              {contact.phones.map((phone: string) => (
                <li key={phone}>
                  <a href={`tel:${phone}`} className="site-nav__phone">
                    <Phone size={17} aria-hidden="true" />
                    <span dir="ltr">{phone}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>

        <div className="site-header__actions">
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? 'بستن منو' : 'باز کردن منو'}
            onClick={() => setOpen((v) => !v)}
            ref={toggleRef}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* زمینهٔ پشت کشو — کلیک روی آن منو را می‌بندد */}
      <div
        className="nav-backdrop"
        data-open={open}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      {/* خط پیشرفت اسکرول */}
      <span className="site-header__progress" ref={progressRef} aria-hidden="true" />
    </header>
  )
}
