import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AiFab } from './components/AiFab'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { ScrollManager } from './components/ScrollManager'
import { SmoothScroll } from './components/SmoothScroll'
import { AboutPage } from './pages/AboutPage'
import { ConsultationPage } from './pages/ConsultationPage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ServicesPage } from './pages/ServicesPage'
import { TrackPage } from './pages/TrackPage'
import { loadRemoteContent } from './content/remote'

/**
 * Pulls CMS content from the backend after mount; when the API is
 * unreachable the static content stays exactly as shipped.
 */
function RemoteSync({ children }: { children: ReactNode }) {
  const [, bump] = useState(0)
  useEffect(() => {
    let alive = true
    void loadRemoteContent().then((changed) => {
      if (changed && alive) bump((v) => v + 1)
    })
    return () => {
      alive = false
    }
  }, [])
  return children
}

/** Shell + routes — shared between BrowserRouter (client) and StaticRouter (prerender). */
export function AppRoutes() {
  return (
    <>
      <SmoothScroll />
      <ScrollManager />
      <a className="skip-link" href="#main">
        پرش به محتوای اصلی
      </a>
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/consultation" element={<ConsultationPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/track" element={<TrackPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
      <AiFab />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <RemoteSync>
        <AppRoutes />
      </RemoteSync>
    </BrowserRouter>
  )
}
