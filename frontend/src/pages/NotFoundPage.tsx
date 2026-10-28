import { Button } from '../components/Button'
import { useSeo } from '../utils/seo'
import './pages.css'

export function NotFoundPage() {
  useSeo('notFound', '/404')
  return (
    <div className="page">
      <div className="container">
        <header className="page__head">
          <h1 className="page__title">صفحه یافت نشد</h1>
          <p className="page__lead">نشانی واردشده در سایت دادنوین وجود ندارد.</p>
        </header>
        <div className="page__cta">
          <Button to="/">بازگشت به خانه</Button>
        </div>
      </div>
    </div>
  )
}
