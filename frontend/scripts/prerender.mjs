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

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function applyMeta(html, meta, url) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${meta.title}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
      `$1${meta.description}$2`,
    )
    .replace(
      /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
      `$1${url}$2`,
    )
    .replace(/(property="og:title"\s+content=")[^"]*(")/g, `$1${meta.title}$2`)
    .replace(
      /(property="og:description"\s+content=")[^"]*(")/g,
      `$1${meta.description}$2`,
    )
    .replace(/(property="og:url"\s+content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(name="twitter:title"\s+content=")[^"]*(")/, `$1${meta.title}$2`)
    .replace(
      /(name="twitter:description"\s+content=")[^"]*(")/,
      `$1${meta.description}$2`,
    )
}

for (const [path, key] of routes) {
  const url = `${siteUrl}${path === '/' ? '/' : path}`
  const appHtml = render(path)
  const html = applyMeta(
    template.replace('<div id="root">', `<div id="root">${appHtml}`),
    seo[key],
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
