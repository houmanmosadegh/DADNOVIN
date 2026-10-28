# دادنوین — فرانت‌اند

وب‌سایت تک‌صفحه‌ای (SPA) «گروه حقوقی دادنوین» — فارسی، راست‌به‌چپ، ساخته‌شده با Vite + React 19 + TypeScript.

## شروع

```bash
npm install
npm run dev
```

سرور توسعه روی `http://localhost:5173` بالا می‌آید.

## دستورها

| دستور | کار |
|---|---|
| `npm run dev` | سرور توسعه Vite |
| `npm run build` | typecheck + بیلد کلاینت + باندل SSR + پرِرندر استاتیک همهٔ روت‌ها در `dist/` |
| `npm run preview` | پیش‌نمایش خروجی بیلد |
| `npm test` | تست‌های واحد vitest (jsdom) |
| `npm run typecheck` | فقط بررسی تایپ‌ها |

## ساختار

```
src/
  app.tsx            روت‌ها و چیدمان کلی (AppRoutes)
  main.tsx           entry کلاینت
  entry-server.tsx   entry سمت سرور برای پرِرندر
  content/           lawyers.fa.js — تمام متن‌های عمومی سایت همین‌جاست
  pages/             صفحات: Home / About / Services / Consultation / Contact / 404
  sections/          سکشن‌های صفحهٔ اصلی (Hero, Services, Lawyers, …)
  components/        کامپوننت‌های مشترک (Header, Footer, Reveal, StatueParticles, …)
  styles/            tokens.css (توکن‌های طراحی) + global.css
  utils/             pointerGlow, seo, useScrolled
scripts/
  prerender.mjs      تزریق HTML اپ + متای هر روت برای خروجی استاتیک
public/
  images/            فقط assetهای بهینه و ارجاع‌شده (webp/jpg/png)
  sitemap.xml, robots.txt
```

## روت‌ها

`/` · `/about` · `/services` (به‌همراه anchorهای `#<service-slug>`) · `/consultation` · `/contact`

## نکات مهم

- **متن‌ها:** همهٔ کپی‌های عمومی در `src/content/lawyers.fa.js` است؛ در کامپوننت‌ها هاردکد نکنید. فیلدهای `privateNotDisplayed` فقط داخلی‌اند و هرگز نباید رندر/سریالایز شوند.
- **SEO:** متاها با `useSeo` + نقشهٔ `seo` در فایل داده مدیریت می‌شود؛ بیلد، هر روت را پرِرندر می‌کند تا خزنده‌ها HTML کامل بگیرند. روت جدید را در `AppRoutes`، نقشهٔ `seo`، `sitemap.xml` و `scripts/prerender.mjs` ثبت کنید.
- **فرم مشاوره:** بک‌اند ندارد — فقط اعتبارسنجی می‌کند و خلاصهٔ قابل‌کپی می‌سازد.
- **افکت‌ها:** ذرات مجسمه با three.js (`StatueParticles`)؛ اسکرول نرم با Lenis (`SmoothScroll`)؛ همهٔ انیمیشن‌ها CSS-only و محترم به `prefers-reduced-motion`.
- **assetها:** فایل‌های master در `src/assets/` می‌مانند و هرگز به `public/` کپی نمی‌شوند؛ واریانت‌های بهینه با PIL تولید می‌شود.
- **فونت‌ها:** Vazirmatn (متن)، Markazi Text (تیترها — فقط وزن ۷۰۰)، Cormorant Garamond (لوگوی لاتین)، self-hosted.

قراردادهای کامل طراحی و معماری در [AGENTS.md](./AGENTS.md) مستند است.
