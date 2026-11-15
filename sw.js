// Зберігає програму в телефоні, щоб вона відкривалася без інтернету.
// Нова версія: змінити V — телефон завантажить файли заново при наступному запуску з інтернетом.
var V = 'zarobitok-1.1';
var FILES = ['./', './index.html', './app.js?v=1', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) {
    return c.addAll(FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // курси НБУ — завжди з мережі
  var nav = req.mode === 'navigate';
  // Лише з кешу цієї версії; мережа — тільки якщо файлу в кеші немає, і без запису в кеш:
  // так старі й нові файли ніколи не змішаються — вони міняються всі разом, коли встановлюється нова версія (нове V).
  e.respondWith(caches.open(V).then(function (c) {
    return c.match(nav ? './index.html' : req).then(function (hit) {
      return hit || fetch(req).catch(function () { return c.match('./index.html'); });
    });
  }));
});
