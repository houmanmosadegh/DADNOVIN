import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
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
import { AuthProvider } from './services/auth'
import { captureReferral } from './services/referral'

/** پنل کاربر — اپ مستقل با سایدبار و صفحات جداگانه؛ code-split تا لندینگ سنگین نشود */
const AccountApp = lazy(() => import('./pages/account/AccountApp'))

/**
 * Bumps whenever CMS content was applied so subscribed subtrees
 * re-render. Returning `children` alone would not work — React
 * bails out on the identical element reference.
 */
const ContentVersion = createContext(0)

function RemoteSync({ children }: { children: ReactNode }) {
  const [version, bump] = useState(0)
  useEffect(() => {
    let alive = true
    void loadRemoteContent().then((changed) => {
      if (changed && alive) bump((v) => v + 1)
    })
    return () => {
      alive = false
    }
  }, [])
  return <ContentVersion.Provider value={version}>{children}</ContentVersion.Provider>
}

/** Shell + routes — shared between BrowserRouter (client) and StaticRouter (prerender). */
export function AppRoutes() {
  useContext(ContentVersion) // re-render shell once remote CMS content lands
  const { pathname } = useLocation()
  // پنل کاربر اپ مستقلی است — بدون Header/Footer و انیمیشن‌های سایت
  if (pathname.startsWith('/panel')) {
    return (
      <Suspense fallback={null}>
        <AccountApp />
      </Suspense>
    )
  }
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
  useEffect(captureReferral, [])
  return (
    <BrowserRouter>
      <AuthProvider>
        <RemoteSync>
          <AppRoutes />
        </RemoteSync>
      </AuthProvider>
    </BrowserRouter>
  )
}
