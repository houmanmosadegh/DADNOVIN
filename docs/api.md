# API

مرجع زنده‌ی API: `GET /api/v1/openapi.json` و Swagger در `/docs`
(در production غیرفعال می‌شود — `EXPOSE_DOCS=false`).

پیشوند همه‌ی مسیرها: `/api/v1`. احراز هویت با کوکی نشست HttpOnly؛ برای
درخواست‌های mutating هدر `X-Requested-With: fetch` (CSRF) لازم است مگر
اینکه Origin مجاز باشد.

## سطح‌ها

| گروه | پیشوند | دسترسی |
|---|---|---|
| احراز هویت و حساب | `/auth/*`, `/account/*` | عمومی / نشست |
| فرم‌های عمومی | `/consultations`, `/tickets`, `/contacts` | عمومی + rate-limit |
| محتوای عمومی | `/public/*` | فقط‌خواندنی |
| ارجاع | `/referrals/r/{code}` | عمومی (ریدایرکت ۳۰۲) |
| مدیا | `/media/*` | عمومی برای `purpose=public` |
| ادمین | `/admin/*` | نقش admin/super_admin/editor/support |
| AI | `/ai/*` | عمومی + rate-limit |

## مسیرهای کلیدی

### احراز هویت
| روش | مسیر | توضیح |
|---|---|---|
| POST | `/auth/register` | ثبت‌نام با موبایل + رمز |
| POST | `/auth/login` | ورود — همه‌ی نقش‌ها از همین فرم |
| POST | `/auth/logout` | پایان نشست |
| POST | `/auth/otp/request` `/auth/otp/verify` | ورود با کد یک‌بارمصرف |
| GET | `/account/me` | پروفایل + نقش‌ها |

### درخواست‌ها
| روش | مسیر | توضیح |
|---|---|---|
| POST | `/consultations` | ثبت مشاوره (honeypot `website`، خروجی tracking+access code) |
| POST | `/tickets` | تیکت تماس عمومی |
| POST | `/public/track` | پیگیری با کد رهگیری + کد دسترسی |
| GET | `/account/requests` | درخواست‌های کاربر واردشده |

### بازاریابی
| روش | مسیر | توضیح |
|---|---|---|
| GET | `/referrals/r/{code}?s=instagram` | ثبت کلیک + کوکی + ۳۰۲ به سایت |
| POST | `/account/marketer/apply` | درخواست عضویت بازاریاب + پذیرش قوانین |
| GET | `/account/marketer/links` | لینک‌های کانالی + آمار |
| GET | `/account/marketer/referrals` | ارجاع‌ها (privacy-safe) |
| GET/PUT | `/account/marketer/bank` | اطلاعات بانکی — رمزنگاری‌شده، هولد ۲۴h تسویه |
| GET | `/account/marketer/commissions` | دفتر کمیسیون |
| GET | `/account/marketer/card.png` `.pdf` | کارت بازاریابی قابل دانلود + QR |

### ادمین (نمونه)
| روش | مسیر | توضیح |
|---|---|---|
| GET | `/admin/requests` | لیست یکپارچه‌ی درخواست‌ها + صفحه‌بندی |
| GET | `/admin/marketers` | بازاریاب‌ها + مانده‌ی قابل پرداخت |
| POST | `/admin/marketers/{id}/payouts` | ثبت تسویه + فیش (کمیسیون‌ها allocated می‌شوند) |
| POST | `/admin/marketers/{id}/rotate-code` | چرخش کد ارجاع (قدیمی در retired می‌ماند) |
| CRUD | `/admin/articles` | مقالات + sanitize سمت سرور + نسخه‌ها |
| GET/PUT | `/admin/settings` | برند/لوگو/سئو/شبکه‌های اجتماعی/کمیسیون |
| GET | `/admin/audit` | لاگ حسابرسی |

### محتوای عمومی
| روش | مسیر | توضیح |
|---|---|---|
| GET | `/public/settings` | برند، تماس، سئو، شبکه‌ها، فوتر، AI |
| GET | `/public/pages/{slug}` | صفحات CMS + سکشن‌ها |
| GET | `/public/lawyers` | وکلای قابل‌نمایش (بدون داده‌ی خصوصی) |
| GET | `/public/articles` `…/{slug}` | فقط منتشرشده‌ها |
| GET | `/public/sitemap.xml` | sitemap داینامیک شامل مقالات |

## قواعد خروجی
- مبالغ همیشه عدد صحیح **تومان**.
- `privateNotDisplayed` و داده‌ی خصوصی وکیل هرگز در API عمومی نمی‌آید.
- نام ارجاع‌دهنده فقط با `consent_at` پر شده برمی‌گردد؛ بدون رضایت
  «مراجعه‌کننده» نشان داده می‌شود و کمیسیون ساخته نمی‌شود.
- خطاها: `{ "detail": "…" }` فارسی؛ بدون stack trace.
