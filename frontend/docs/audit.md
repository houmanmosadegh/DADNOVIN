# Dadnovin frontend — quality-pass audit

Baseline: commit `0f525d7` (branch `refactor/quality-pass`). Build + 22/22 tests green before starting. No lint script exists — `tsc --noEmit` + vitest are the gates.

## ✅ مطمئن — حذف امن

| مورد | دلیل |
|---|---|
| `--color-graphite` token | 0 `var()` references anywhere |
| `--gradient-titanium` token | 0 uses — header is now solid dark glass, not titanium |
| `--shadow-gold` token | 0 uses |
| `.agents/skills/threejs-*` (3 skills) | Site has a strict no-WebGL/Three.js rule — removed in commit prior to this file |
| Old `main-*.jpg`/`picture-*.jpg` variants + `mainfor3d.png`/`picture.png` masters | Replaced by `main-update`/`picture-update` transparent art (already deleted) |
| `picture-update .jpg` filename space | Renamed to `src/assets/picture-update.jpg` |

## ⚠️ احتمالی — نیاز به تصمیم

| مورد | وضعیت |
|---|---|
| `src/assets/dadnovingroup.png` (2.1MB) | Master unreferenced by code/markup — kept as brand source per assets convention. Delete if you don't need the source |
| `src/assets/main-update.jpg`, `picture-update.jpg`, `lobby-bg.jpg` | Masters for generated `public/images/*` — kept (needed to regenerate variants) |
| PNG fallbacks for `main-*`/`picture-*` | Quantized 4.2MB→1.0MB. Only served to browsers without webp+alpha support (Safari <14). Could be dropped entirely if you accept webp-only |

## 🔒 نگه‌دار — استفاده‌شده

- **همهٔ وابستگی‌های package.json** استفاده می‌شوند (vazirmatn + eb-garamond در main.tsx، lenis در SmoothScroll، lucide-react در ~۱۰ فایل، react-router-dom، testing-library/jsdom/vitest برای تست‌ها)
- **همهٔ کامپوننت‌ها/sections/utils/hooks** حداقل یک importer دارند (Button, ChapterHead, ConsultationForm, CountUp, Footer, Header, IntroScene, LawyerCard, Reveal, ScrollManager, SectionDivider, SmoothScroll, Typewriter, pointerGlow, seo, useScrolled)
- **همهٔ ۲۶ فایل public/** ارجاع دارند (تصاویر، آیکون‌ها، favicon، robots/sitemap)
- `lenis-smooth`/`lenis-stopped` CSS classes — توسط خود کتابخانهٔ Lenis اضافه می‌شوند، نه کد ما
- `!important` فقط در: `scroll-behavior` برای lenis (ضروری طبق docs) و ریست reduced-motion (الگوی استاندارد)
- `console.log` فقط در `scripts/prerender.mjs` (ابزار build) — OK

## 🎨 تکثیر توکن‌ها (پیوست به فاز ۴)

۲۵ رنگ hex هاردکد و ۹۳ مقدار rgba در CSS پراکنده‌اند. تکرارهای مستقیم توکن: `#080b12`×3، `#1b202b`×3، `#101827`، `#0d1524`، `#f3f0e8`، `#a7afbd`، `#d7b56d`، `#ffcb65` — باید به توکن برگردند. رنگ‌های سفارشی باقی‌مانده (خطا `#d97a6c`/`#e8968a`، طلایی‌های میانی `#a6823a`/`#b18c41`/`#c7a052`/`#d1ab5d`/`#dfc084`/`#e7ca92`، خاکستری‌ها) باید توکن شوند.

## 🧭 چک‌لیست روت‌ها/لینک‌ها/فرم (تست پایانی)

- روت‌ها: `/` `/about` `/services` `/consultation` `/contact` + `*`
- انکرها: `/#about` `/#approach` `/#services` `/#team` `/#consult`، `/services#<slug>`×6
- لینک‌های کلیدی: header nav ×5 + CTA، منوی موبایل، footer links، tel:/mailto: در کارت‌های رزومه و تماس
- فرم مشاوره: اعتبارسنجی + تولید خلاصه (بدون backend — state «sent» جعلی نساز)
