/**
 * Проверка статики перед деплоем: битые внутренние ссылки, JSON-LD,
 * обязательные SEO-теги, атрибуты картинок, соответствие sitemap.xml.
 * Без зависимостей — только Node.
 *
 * Запуск: npm run check
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://cheshashlik.ru'
const IGNORED_DIRS = new Set(['node_modules', '.git', '.github', 'dist', 'scripts'])
// Файл подтверждения прав в Яндекс Вебмастере — не страница сайта, требования к нему не применяем.
const IGNORED_FILES = new Set(['yandex_c905b937071eea3f.html'])

const errors = []
const warnings = []
const fail = (file, msg) => errors.push(`${file}: ${msg}`)
const warn = (file, msg) => warnings.push(`${file}: ${msg}`)

function findHtml(dir = ROOT) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return IGNORED_DIRS.has(entry.name) ? [] : findHtml(join(dir, entry.name))
    }
    return entry.name.endsWith('.html') ? [join(dir, entry.name)] : []
  })
}

/** Резолвит внутреннюю ссылку в путь на диске. Возвращает null, если ссылка внешняя. */
function resolveLocal(url) {
  if (/^(https?:|tel:|mailto:|#|data:)/.test(url)) return null
  const path = url.split(/[?#]/)[0]
  if (!path) return null
  const abs = path.startsWith('/') ? join(ROOT, path) : null
  if (!abs) return { abs: null, relative: true }
  if (existsSync(abs) && statSync(abs).isDirectory()) return { abs: join(abs, 'index.html') }
  return { abs }
}

const htmlFiles = findHtml().filter((f) => !IGNORED_FILES.has(relative(ROOT, f)))
if (htmlFiles.length === 0) fail('.', 'HTML-файлы не найдены')

const canonicals = new Map()
/** NAP (name/address/phone) со всех страниц — должен совпадать до символа. */
const napSeen = new Map()

/** Рекурсивно собирает узлы нужного @type из JSON-LD (учитывая @graph и массивы). */
function collectNodes(node, type, out = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectNodes(n, type, out))
  } else if (node && typeof node === 'object') {
    if (node['@type'] === type) out.push(node)
    for (const value of Object.values(node)) collectNodes(value, type, out)
  }
  return out
}

function checkRestaurant(name, node) {
  for (const field of ['name', 'url', 'telephone', 'address']) {
    if (!node[field]) fail(name, `JSON-LD Restaurant: нет обязательного поля "${field}"`)
  }
  const addr = node.address ?? {}
  for (const field of ['streetAddress', 'addressLocality', 'addressCountry']) {
    if (!addr[field]) fail(name, `JSON-LD PostalAddress: нет "${field}"`)
  }
  if (node.geo) {
    const { latitude: lat, longitude: lon } = node.geo
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      fail(name, 'JSON-LD geo: latitude/longitude должны быть числами')
    } else if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      fail(name, `JSON-LD geo: координаты вне диапазона (${lat}, ${lon})`)
    }
  }
  for (const hours of node.openingHoursSpecification ?? []) {
    if (!/^\d{2}:\d{2}$/.test(hours.opens ?? '') || !/^\d{2}:\d{2}$/.test(hours.closes ?? '')) {
      fail(name, 'JSON-LD openingHoursSpecification: opens/closes должны быть в формате ЧЧ:ММ')
    }
  }
  // Рейтинги и отзывы не размечаем — их нельзя подтвердить на самом сайте.
  for (const field of ['aggregateRating', 'review', 'reviewCount', 'ratingValue']) {
    if (node[field]) fail(name, `JSON-LD: поле "${field}" размечать нельзя — нет своих подтверждённых отзывов`)
  }
  // NAP должен быть одинаковым на всех страницах — иначе Google/Яндекс не склеят организацию.
  const nap = `${node.name} | ${addr.streetAddress}, ${addr.addressLocality} | ${node.telephone}`
  if (!napSeen.has(nap)) napSeen.set(nap, [])
  napSeen.get(nap).push(name)
}

for (const file of htmlFiles) {
  const name = relative(ROOT, file)
  const html = readFileSync(file, 'utf8')
  const noindex = /<meta\s+name="robots"[^>]*content="[^"]*noindex/i.test(html)

  // --- JSON-LD ---
  const ldBlocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const [, body] of ldBlocks) {
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (e) {
      fail(name, `JSON-LD не парсится: ${e.message}`)
      continue
    }
    collectNodes(parsed, 'Restaurant').forEach((node) => checkRestaurant(name, node))
  }

  // --- Обязательные SEO-теги ---
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim()
  if (!title) fail(name, 'нет <title>')
  else if (title.length > 70) warn(name, `<title> ${title.length} символов — Google обрежет (~60–65)`)

  const desc = html.match(/<meta\s+name="description"[^>]*content="([^"]*)"/i)?.[1]
  if (!desc && !noindex) fail(name, 'нет meta description')
  else if (desc && desc.length > 180) warn(name, `description ${desc.length} символов — длинновато`)

  const h1s = [...html.matchAll(/<h1[\s>]/gi)]
  if (!noindex && h1s.length !== 1) fail(name, `должен быть ровно один <h1>, найдено ${h1s.length}`)

  const canonical = html.match(/<link\s+rel="canonical"[^>]*href="([^"]*)"/i)?.[1]
  if (!noindex) {
    if (!canonical) fail(name, 'нет canonical')
    else {
      if (!canonical.startsWith(SITE)) fail(name, `canonical должен быть абсолютным на ${SITE}: ${canonical}`)
      if (canonicals.has(canonical)) fail(name, `canonical дублирует ${canonicals.get(canonical)}: ${canonical}`)
      canonicals.set(canonical, name)
    }
  }
  if (ldBlocks.length === 0 && !noindex) warn(name, 'нет JSON-LD')

  // --- Картинки ---
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = tag.match(/\bsrc="([^"]*)"/)?.[1] ?? '(без src)'
    if (!/\balt="/.test(tag)) fail(name, `<img> без alt: ${src}`)
    // Размеры требуем только у своих картинок: для внешних (пиксель Метрики) их знать неоткуда.
    const local = !/^https?:/.test(src)
    if (local && (!/\bwidth="/.test(tag) || !/\bheight="/.test(tag))) {
      fail(name, `<img> без width/height (риск CLS): ${src}`)
    }
  }

  // --- Внутренние ссылки и ресурсы ---
  for (const [, attr, raw] of html.matchAll(/\b(href|src|srcset)="([^"]+)"/gi)) {
    // Запятая разделяет варианты только в srcset; в обычном URL она может быть частью адреса.
    const urls = attr.toLowerCase() === 'srcset'
      ? raw.split(',').map((s) => s.trim().split(/\s+/)[0])
      : [raw.trim()]
    for (const url of urls) {
      const target = resolveLocal(url.replace(/&amp;/g, '&'))
      if (!target) continue
      if (target.relative) {
        fail(name, `относительный путь — сломается на вложенных страницах: ${url}`)
        continue
      }
      if (!existsSync(target.abs)) fail(name, `битая ссылка: ${url}`)
    }
  }
}

// --- NAP одинаковый на всех страницах ---
if (napSeen.size > 1) {
  const variants = [...napSeen.entries()].map(([nap, pages]) => `\n    «${nap}» — ${pages.join(', ')}`)
  fail('JSON-LD', `NAP различается между страницами:${variants.join('')}`)
}

// --- sitemap.xml ---
const sitemapPath = join(ROOT, 'sitemap.xml')
if (!existsSync(sitemapPath)) {
  fail('sitemap.xml', 'файла нет')
} else {
  const xml = readFileSync(sitemapPath, 'utf8')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  if (locs.length === 0) fail('sitemap.xml', 'нет ни одного <loc>')
  for (const loc of locs) {
    if (!loc.startsWith(SITE)) {
      fail('sitemap.xml', `URL не с ${SITE}: ${loc}`)
      continue
    }
    const target = resolveLocal(loc.slice(SITE.length) || '/')
    if (target?.abs && !existsSync(target.abs)) fail('sitemap.xml', `URL без страницы на диске: ${loc}`)
    if (!canonicals.has(loc)) fail('sitemap.xml', `нет страницы с таким canonical: ${loc}`)
  }
  for (const [canonical, page] of canonicals) {
    if (!locs.includes(canonical)) warn('sitemap.xml', `${page} не попал в sitemap (canonical ${canonical})`)
  }
}

// --- robots.txt ---
const robotsPath = join(ROOT, 'robots.txt')
if (!existsSync(robotsPath)) {
  fail('robots.txt', 'файла нет')
} else {
  const robots = readFileSync(robotsPath, 'utf8')
  if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('robots.txt', 'нет строки Sitemap:')
  const blocks = robots.split(/\n(?=User-agent:)/i)
  for (const block of blocks) {
    for (const [, path] of block.matchAll(/^\s*Disallow:\s*(\S+)/gim)) {
      if (['/', '/assets/', '/public/'].includes(path)) {
        fail('robots.txt', `Disallow ${path} заблокирует рендеринг для поисковиков`)
      }
    }
  }
}

for (const w of warnings) console.log(`⚠  ${w}`)
for (const e of errors) console.log(`✖  ${e}`)

console.log(
  errors.length
    ? `\n${errors.length} ошибок, ${warnings.length} предупреждений`
    : `\n✓ Проверено ${htmlFiles.length} страниц — ошибок нет (${warnings.length} предупреждений)`
)
process.exit(errors.length ? 1 : 0)
