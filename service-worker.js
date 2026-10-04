/* ==================================================================
   PeerUp — Service Worker
   يخزّن فقط الملفات الثابتة (HTML/CSS/JS/أيقونات) لتشغيل أسرع وعمل
   محدود بدون إنترنت. لا يلمس أي طلب لـFirebase أو أي نطاق خارجي —
   هذي دائمًا تروح للشبكة مباشرة، بياناتها حيّة ولا تُخزَّن أبدًا هنا.

   عند كل تحديث حقيقي لملفات المشروع، غيّري CACHE_VERSION (أي رقم أو
   تاريخ جديد) حتى تُستبدل النسخة القديمة تلقائيًا عند الزوار.
   ================================================================== */
const CACHE_VERSION = 'peerup-cache-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './auth.js',
  './content.js',
  './mindmap.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './images/logo.png',
  './images/logo-white.png',
  './images/book.svg',
  './images/lightbulb.svg',
  './images/planet.svg',
  './images/rocket.svg',
  './images/stars.svg',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/icon-maskable-512.png',
  './images/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // أي طلب خارج نطاق موقعنا (Firebase Auth/Firestore/Storage، خطوط جوجل...)
  // يمشي عادي للشبكة مباشرة — صفر تدخّل، صفر تخزين.
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => {
          // ولا إنترنت ولا نسخة مخزّنة: لطلبات التصفّح نرجّع الصفحة
          // الرئيسية المخزّنة على الأقل بدل خطأ متصفح فاضي.
          if (req.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});
