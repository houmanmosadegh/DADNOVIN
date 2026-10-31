import { test, expect, type Page } from '@playwright/test'

/** سناریوی کامل spec §7 — سایت عمومی + فرم مشاوره + پنل کاربر.
 *  پیش‌نیاز: استک کامل بالا باشد (docker compose up -d + seed).
 *  متغیرها: E2E_BASE_URL (پیش‌فرض http://localhost:8080) */

const consoleErrors = (page: Page) => {
  const errs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text())
  })
  page.on('pageerror', (e) => errs.push(String(e)))
  return errs
}

test.describe('سایت عمومی', () => {
  test('صفحه اصلی بدون خطای کنسول رندر می‌شود', async ({ page }) => {
    const errs = consoleErrors(page)
    await page.goto('/')
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('.site-header')).toBeVisible()
    expect(errs.filter((e) => !e.includes('favicon'))).toEqual([])
  })

  test('ناوبری به صفحات داخلی کار می‌کند', async ({ page }) => {
    await page.goto('/about')
    await expect(page).toHaveURL(/about/)
    await expect(page.locator('main')).toBeVisible()
    await page.goto('/services')
    await expect(page.locator('main')).toBeVisible()
  })

  test('فرم مشاوره ارسال می‌شود و کد پیگیری می‌دهد', async ({ page }) => {
    await page.goto('/consultation')
    await page.locator('input[name="name"], input[name="full_name"]').first().fill('مراجعه تست E2E')
    await page.locator('input[name="phone"]').first().fill('09120000000')
    const msg = page.locator('textarea').first()
    await msg.fill('توضیح تست برای سناریوی E2E — مشاوره خانواده.')
    // رضایت ارجاع اختیاری است — بدون کد معرف معنی ندارد
    await page.locator('button[type="submit"]').first().click()
    await expect(page.locator('text=/کد پیگیری|پیگیری/')).toBeVisible({ timeout: 15000 })
  })

  test('صفحهٔ پیگیری فرم دارد', async ({ page }) => {
    await page.goto('/track')
    await expect(page.locator('form').first()).toBeVisible()
  })
})

test.describe('پنل کاربر', () => {
  test('صفحهٔ ورود رندر می‌شود', async ({ page }) => {
    await page.goto('/panel')
    await expect(page.locator('form').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="tel"], input[name="phone"]').first()).toBeVisible()
  })

  test('ثبت‌نام ← ورود ← داشبورد', async ({ page }) => {
    const phone = `0912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    await page.goto('/panel')
    // به حالت ثبت‌نام برو
    const regToggle = page.locator('text=/ثبت‌نام|حساب ندارید/')
    if (await regToggle.count()) await regToggle.first().click()
    await page.locator('input[name="name"]').first().fill('کاربر تست E2E')
    await page.locator('input[name="phone"], input[type="tel"]').first().fill(phone)
    await page.locator('input[type="password"]').first().fill('E2e-pass-1234!')
    await page.locator('button[type="submit"]').first().click()
    await expect(page.locator('text=/داشبورد|درخواست/')).toBeVisible({ timeout: 20000 })
  })

  test('سایدبار موبایل drawer می‌شود', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'فقط روی viewport موبایل')
    await page.goto('/panel')
    const menuBtn = page.locator('button[aria-label*="منو"], button[aria-label*="menu"]').first()
    if (await menuBtn.count()) {
      await menuBtn.click()
      await expect(page.locator('nav').first()).toBeVisible()
    }
  })
})

test.describe('ارجاع', () => {
  test('کد نامعتبر به سایت ریدایرکت می‌کند (بدون خطای ۵۰۰)', async ({ page }) => {
    const resp = await page.goto('/r/INVALID-CODE99', { waitUntil: 'domcontentloaded' })
    expect(resp?.status()).toBeLessThan(500)
  })
})
