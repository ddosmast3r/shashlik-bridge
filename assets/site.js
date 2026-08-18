/* ============================================================
   Аналитика: Яндекс Метрика + цели по кликам.
   Ссылки (tel:, WhatsApp, Telegram, MAX, карты) прописаны прямо
   в HTML — они работают и без JS, и видны поисковым роботам.
   ============================================================ */
var METRIKA_ID = 110450622;     // основной счётчик (наш, с именными целями)
var METRIKA_ID_BIZ = 105239781; // счётчик Яндекс.Бизнеса (общая статистика с Картами)

(function (m, e, t, r, i, k, a) {
  m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) };
  m[i].l = 1 * new Date();
  for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
  k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a)
})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

ym(METRIKA_ID, "init", {
  webvisor: true,
  clickmap: true,
  accurateTrackBounce: true,
  trackLinks: true
});
ym(METRIKA_ID_BIZ, "init", {
  clickmap: true,
  trackLinks: true,
  accurateTrackBounce: true,
  webvisor: false
});

// Цели: именные — в основной счётчик, make-call/make-route — дополнительно в бизнесовый
document.addEventListener("click", function (event) {
  var btn = event.target.closest("[data-goal]");
  if (!btn || typeof ym !== "function") return;
  ym(METRIKA_ID, "reachGoal", btn.dataset.goal);
  if (btn.dataset.goalBiz) {
    ym(METRIKA_ID_BIZ, "reachGoal", btn.dataset.goalBiz);
  }
});
