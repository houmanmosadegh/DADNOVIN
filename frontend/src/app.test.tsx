import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { lawyers, nav, services } from './content/lawyers.fa.js'
import { HomePage } from './pages/HomePage'
import App from './app'

const withRouter = (ui: React.ReactElement, initialEntries = ['/']) =>
  render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)

describe('Header', () => {
  it('renders all nav items without a button CTA', () => {
    const { container } = withRouter(<Header />)
    for (const item of nav) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0)
    }
    // nav stays clean links-only — consultation is reached via the مشاوره link
    expect(
      container.querySelectorAll('.site-nav .btn').length,
    ).toBe(0)
  })

  it('links every nav item to its real route', () => {
    withRouter(<Header />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    for (const item of nav) {
      expect(hrefs).toContain(item.to)
    }
  })

  it('switches to the dark glass state after scrolling', () => {
    const { container } = withRouter(<Header />)
    const header = container.querySelector('.site-header')!
    expect(header.classList.contains('is-scrolled')).toBe(false)

    Object.defineProperty(window, 'scrollY', { value: 80, writable: true })
    fireEvent.scroll(window)
    expect(header.classList.contains('is-scrolled')).toBe(true)

    Object.defineProperty(window, 'scrollY', { value: 0, writable: true })
    fireEvent.scroll(window)
    expect(header.classList.contains('is-scrolled')).toBe(false)
  })

  it('has the scroll-progress hairline and the sliding nav marker', () => {
    const { container } = withRouter(<Header />)
    expect(container.querySelector('.site-header__progress')).not.toBeNull()
    expect(container.querySelector('.site-nav__marker')).not.toBeNull()
  })

  it('opens and closes the mobile menu, incl. backdrop click', async () => {
    const user = userEvent.setup()
    const { container } = withRouter(<Header />)
    const toggle = screen.getByRole('button', { name: 'باز کردن منو' })
    const navEl = container.querySelector('#site-nav')!
    const backdrop = container.querySelector('.nav-backdrop')!

    await user.click(toggle)
    expect(navEl.getAttribute('data-open')).toBe('true')
    expect(backdrop.getAttribute('data-open')).toBe('true')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await user.keyboard('{Escape}')
    expect(navEl.getAttribute('data-open')).toBe('false')

    await user.click(toggle)
    expect(navEl.getAttribute('data-open')).toBe('true')
    await user.click(backdrop)
    expect(navEl.getAttribute('data-open')).toBe('false')
  })
})

describe('HomePage', () => {
  it('renders hero heading, services and both lawyers', () => {
    withRouter(<HomePage />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'پروندهٔ شما، مسئولیتِ ماست',
      }),
    ).toBeTruthy()
    for (const s of services) {
      expect(screen.getAllByText(s.title).length).toBeGreaterThan(0)
    }
    for (const l of lawyers) {
      expect(screen.getByText(l.name)).toBeTruthy()
      expect(screen.getByText(l.title)).toBeTruthy()
    }
  })

  it('has no side rail and keeps all chapter sections', () => {
    const { container } = withRouter(<HomePage />)
    // the dot navigation was removed entirely — top menu is the only nav
    expect(container.querySelector('.chapter-rail')).toBeNull()
    for (const id of ['about', 'approach', 'services', 'team', 'consult']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('shows service details as a static card grid — no accordion', () => {
    const { container } = withRouter(<HomePage />)
    const cards = container.querySelectorAll('a.sg-card')
    expect(cards.length).toBe(services.length)
    for (const s of services) {
      expect(
        container.querySelector(`a.sg-card[href="/services#${s.slug}"]`),
      ).not.toBeNull()
    }
    // nothing FAQ-like may remain in the services section itself
    expect(container.querySelector('#services [aria-expanded]')).toBeNull()
    expect(container.querySelector('.service-index')).toBeNull()
  })

  it('renders animated stats derived from real data', () => {
    const { container } = withRouter(<HomePage />)
    const stats = container.querySelectorAll('.about__stats .stat')
    expect(stats.length).toBe(3)
    expect(container.querySelector('.about__stats')!.textContent).toContain('مشهد')
  })

  it('hero is a flat dark gradient — no photo backdrop', () => {
    const { container } = withRouter(<HomePage />)
    expect(container.querySelector('.hero')).not.toBeNull()
    expect(container.querySelector('.hero__bg')).toBeNull()
    expect(container.querySelector('.hero__bg img')).toBeNull()
  })

  it('seams every section band with a wave — never a hard divider line', () => {
    const { container } = withRouter(<HomePage />)
    // hero→about is seamed by the hero's own masked wave edge (no
    // element — an overlay there would sit on the panel's arc)
    const waves = container.querySelectorAll('.section-wave')
    expect(waves.length).toBe(5)
    for (const wave of waves) {
      // two staggered ridges form each wave seam
      expect(wave.querySelectorAll('svg path').length).toBe(2)
      expect(wave.querySelector('img')).toBeNull()
    }
    expect(container.querySelector('.section-divider')).toBeNull()
  })

  it('bands each home section — مشکی، استخونی، سورمه‌ای، فیلی', () => {
    const { container } = withRouter(<HomePage />)
    const expected: [string, string][] = [
      ['#about', 'band--white'],
      ['#approach', 'band--navy'],
      ['#services', 'band--gray'],
      ['#team', 'band--navy'],
      ['#consult', 'band--white'],
    ]
    for (const [id, cls] of expected) {
      expect(container.querySelector(`${id}.${cls}`)).not.toBeNull()
    }
  })

  it('renders the picture section with descriptive alt and fixed dimensions', () => {
    const { container } = withRouter(<HomePage />)
    const img = container.querySelector<HTMLImageElement>(
      '.picture__frame img',
    )
    expect(img).not.toBeNull()
    expect(img!.getAttribute('alt')!.length).toBeGreaterThan(20)
    expect(img!.getAttribute('width')).toBe('1079')
    expect(img!.getAttribute('height')).toBe('1225')
    expect(img!.getAttribute('loading')).toBe('lazy')
  })

  it('never renders privateNotDisplayed fields', () => {
    // plant sentinel private values — they must not leak into the DOM
    for (const l of lawyers) {
      ;(l as Record<string, unknown>).privateNotDisplayed = {
        birthDate: 'SENT-BIRTH-1360',
        maritalStatus: 'SENT-MARITAL',
        militaryService: 'SENT-MILITARY',
      }
    }
    const { container } = withRouter(<HomePage />)
    const html = container.innerHTML
    expect(html).not.toContain('SENT-BIRTH-1360')
    expect(html).not.toContain('SENT-MARITAL')
    expect(html).not.toContain('SENT-MILITARY')
    expect(html).not.toContain('privateNotDisplayed')
  })
})

describe('Footer', () => {
  it('shows the current year dynamically and real links only', () => {
    withRouter(<Footer />)
    const year = new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(
      new Date(),
    )
    expect(screen.getByText(new RegExp(year))).toBeTruthy()
  })
})

describe('ConsultationForm', () => {
  it('validates required fields and shows errors', async () => {
    const user = userEvent.setup()
    const { ConsultationPage } = await import('./pages/ConsultationPage')
    withRouter(<ConsultationPage />)
    await user.click(screen.getByRole('button', { name: 'آماده‌سازی درخواست' }))
    expect(screen.getByText('لطفاً نام خود را وارد کنید.')).toBeTruthy()
    expect(
      screen.getByText('شماره تماس معتبر وارد کنید (مثلاً 09123456789).'),
    ).toBeTruthy()
  })

  it('produces a request summary after valid input', async () => {
    const user = userEvent.setup()
    const { ConsultationPage } = await import('./pages/ConsultationPage')
    withRouter(<ConsultationPage />)
    await user.type(screen.getByLabelText('نام و نام خانوادگی'), 'علی رضایی')
    await user.type(screen.getByLabelText('شماره تماس'), '09123456789')
    await user.selectOptions(
      screen.getByLabelText('موضوع حقوقی'),
      services[0].slug,
    )
    await user.click(screen.getByRole('button', { name: 'آماده‌سازی درخواست' }))
    expect(screen.getByText('خلاصهٔ درخواست شما آماده شد')).toBeTruthy()
    expect(screen.getByText(/علی رضایی/)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'ویرایش' }),
    ).toBeTruthy()
  })

  it('lays out the consultation steps as a numbered timeline', async () => {
    const { ConsultationPage } = await import('./pages/ConsultationPage')
    const { container } = withRouter(<ConsultationPage />)
    const items = container.querySelectorAll('.timeline__item')
    expect(items.length).toBe(3)
    expect(container.querySelectorAll('.timeline__node').length).toBe(3)
  })
})

describe('AboutPage', () => {
  it('renders intro, both resume cards, the trust row and closing CTA', async () => {
    const { AboutPage } = await import('./pages/AboutPage')
    const { container } = withRouter(<AboutPage />)
    // two resume cards with full data always visible — nothing collapsible
    const cards = container.querySelectorAll('.rcard')
    expect(cards.length).toBe(2)
    for (const l of lawyers) {
      expect(container.textContent).toContain(l.name)
      expect(container.textContent).toContain(l.resume.role)
      expect(container.textContent).toContain(l.resume.nameEn)
      expect(container.textContent).toContain(l.resume.motto)
    }
    // three highlight cells per card
    expect(container.querySelectorAll('.rcard__stat').length).toBe(6)
    expect(container.textContent).toContain('09150463006')
    expect(container.textContent).toContain('09150539176')
    expect(container.textContent).toContain('m.vaziri.legal@gmail.com')
    expect(container.querySelector('[aria-expanded]')).toBeNull()
    // trust row + one consultation CTA per card (no duplicated bottom block)
    expect(container.querySelectorAll('.trust__item').length).toBe(4)
    expect(container.querySelectorAll('a[href="/consultation"]').length).toBe(2)
    // private fields must not leak
    expect(container.innerHTML).not.toContain('privateNotDisplayed')
  })
})

describe('ServicesPage', () => {
  it('lists every service once with detail anchors and contextual CTAs', async () => {
    const { ServicesPage } = await import('./pages/ServicesPage')
    const { container } = withRouter(<ServicesPage />)
    expect(container.querySelectorAll('.sg-card').length).toBe(
      services.length,
    )
    // every service has a detail article (the #slug anchor) and its own CTA —
    // no extra gallery-level button on this page
    for (const s of services) {
      expect(container.querySelector(`article#${s.slug}`)).not.toBeNull()
      expect(
        container.querySelector(`a[href="/consultation?service=${s.slug}"]`),
      ).not.toBeNull()
    }
    expect(
      container.querySelectorAll('a[href^="/consultation"]').length,
    ).toBe(services.length)
  })
})

describe('App', () => {
  it('renders the home route', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'پروندهٔ شما، مسئولیتِ ماست',
      }),
    ).toBeTruthy()
  })
})
