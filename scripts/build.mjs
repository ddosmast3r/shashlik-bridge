// Готовит страницы к выкладке. Запуск: node scripts/build.mjs
// (после копирования файлов из new-che/vers_2, перед scripts/check.mjs).
//
// 1. Встраивает стили в страницы. Часть мобильных операторов обрывает лишние
//    соединения, и отдельный style.css до телефона не доходит — сайт
//    показывается без оформления. Стили внутри страницы приходят вместе с ней.
// 2. Добавляет к скриптам метку версии (?v=…) по их содержимому. Сервер не
//    запрещает кэшировать скрипты, и без метки браузер может взять старый
//    app.js к новой странице — тогда новые кнопки и фото не работают.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'privacy.html', '404.html'];
const link = /<link rel="stylesheet" href="(\/assets\/[^"]+\.css)"\s*\/?>/g;
const script = /<script (defer )?src="(\/assets\/[^"?]+\.js)(?:\?v=[^"]*)?"><\/script>/g;

for (const page of pages) {
  const file = join(root, page);
  let css = 0;
  let js = 0;
  const out = readFileSync(file, 'utf8')
    .replace(link, (_, href) => {
      css++;
      const dir = posix.dirname(href);
      const body = readFileSync(join(root, href), 'utf8')
        // url(file.woff2) и url("../brand/x.png") → абсолютные пути от корня сайта
        .replace(/url\((['"]?)(?!data:|\/|https?:)([^'")]+)\1\)/g, (m, q, path) => `url(${q}${posix.join(dir, path)}${q})`)
        .trim();
      return `<style>\n${body}\n</style>`;
    })
    .replace(script, (_, defer = '', src) => {
      js++;
      const v = createHash('md5').update(readFileSync(join(root, src))).digest('hex').slice(0, 8);
      return `<script ${defer}src="${src}?v=${v}"></script>`;
    });
  writeFileSync(file, out);
  console.log(`${page}: встроено стилей — ${css}, скриптов с версией — ${js}`);
}
