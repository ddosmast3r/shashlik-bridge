// Встраивает стили в страницы перед выкладкой.
// Часть мобильных операторов обрывает лишние соединения, и отдельный style.css
// до телефона не доходит — сайт показывается без оформления. Стили внутри
// страницы приходят вместе с ней.
// Запуск: node scripts/inline-css.mjs (после копирования файлов из new-che/vers_2).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'privacy.html'];
const link = /<link rel="stylesheet" href="(\/assets\/[^"]+\.css)"\s*\/?>/g;

for (const page of pages) {
  const file = join(root, page);
  const html = readFileSync(file, 'utf8');
  let count = 0;
  const out = html.replace(link, (_, href) => {
    count++;
    const dir = posix.dirname(href);
    const css = readFileSync(join(root, href), 'utf8')
      // url(file.woff2) и url("../brand/x.png") → абсолютные пути от корня сайта
      .replace(/url\((['"]?)(?!data:|\/|https?:)([^'")]+)\1\)/g, (m, q, path) => `url(${q}${posix.join(dir, path)}${q})`)
      .trim();
    return `<style>\n${css}\n</style>`;
  });
  writeFileSync(file, out);
  console.log(`${page}: встроено стилей — ${count}`);
}
