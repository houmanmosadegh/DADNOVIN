/**
 * Static prerender: renders every route to HTML inside dist/index.html so
 * crawlers (and no-JS visitors) get the full Persian content, not an empty
 * SPA shell. Runs after `vite build` and `vite build --ssr`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const { render } = await import(join(root, 'dist-ssr/entry-server.js'))
const { seo, siteUrl } = await import(join(root, 'src/content/lawyers.fa.js'))

const template = readFileSync(join(root, 'dist/index.html'), 'utf8')

const routes = [
  ['/', 'home'],
  ['/about', 'about'],
  ['/services', 'services'],
  ['/consultation', 'consultation'],
  ['/contact', 'contact'],
]

// meta values land inside HTML/attributes — escape so a stray & < > " in
// the copy can't corrupt the markup
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function applyMeta(html, meta, url) {
  const title = esc(meta.title)
  const desc = esc(meta.description)
  const link = esc(url)
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
      `$1${desc}$2`,
    )
    .replace(
      /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
      `$1${link}$2`,
    )
    .replace(/(property="og:title"\s+content=")[^"]*(")/g, `$1${title}$2`)
    .replace(
      /(property="og:description"\s+content=")[^"]*(")/g,
      `$1${desc}$2`,
    )
    .replace(/(property="og:url"\s+content=")[^"]*(")/, `$1${link}$2`)
    .replace(/(name="twitter:title"\s+content=")[^"]*(")/, `$1${title}$2`)
    .replace(
      /(name="twitter:description"\s+content=")[^"]*(")/,
      `$1${desc}$2`,
    )
}

const ROOT_MARKER = '<div id="root">'
if (!template.includes(ROOT_MARKER)) {
  throw new Error('dist/index.html is missing <div id="root"> — prerender target changed?')
}

for (const [path, key] of routes) {
  const meta = seo[key]
  if (!meta) throw new Error(`seo map has no entry for "${key}"`)
  const url = `${siteUrl}${path === '/' ? '/' : path}`
  const appHtml = render(path)
  const html = applyMeta(
    template.replace(ROOT_MARKER, `${ROOT_MARKER}${appHtml}`),
    meta,
    url,
  )

  const outFile =
    path === '/'
      ? join(root, 'dist/index.html')
      : join(root, 'dist', path.slice(1), 'index.html')
  mkdirSync(join(outFile, '..'), { recursive: true })
  writeFileSync(outFile, html)
  console.log(`prerendered ${path} → ${outFile}`)
}
