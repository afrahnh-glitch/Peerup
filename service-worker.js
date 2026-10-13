/* ==================================================================
   PeerUp — Service Worker
   يخزّن فقط الملفات الثابتة (HTML/CSS/JS/أيقونات) لتشغيل أسرع وعمل
   محدود بدون إنترنت. لا يلمس أي طلب لـFirebase أو أي نطاق خارجي —
   هذي دائمًا تروح للشبكة مباشرة، بياناتها حيّة ولا تُخزَّن أبدًا هنا.

   التحديث التلقائي: الكود (HTML/JS/CSS) يُجلب من الشبكة أولًا دائمًا (مع
   التحقق من وجود نسخة أحدث)، والنسخة المخزّنة تُستخدم فقط لو ما فيه إنترنت.
   فأي تحديث ترفعينه على GitHub يوصل للطالبات تلقائيًا بدون مسح أي شي.
   وعند أول تفعيل لنسخة جديدة من هذا الملف تُحدَّث الصفحات المفتوحة مرة وحدة.
   (تغيير CACHE_VERSION مو شرط لكل تحديث بعد الآن؛ يكفي لو غيّرتِ هذا الملف.)
   ================================================================== */
const CACHE_VERSION = 'peerup-cache-v2';

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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOld = keys.some((k) => k !== CACHE_VERSION);
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
    // تحديث فعلي (مو أول تثبيت): نعيد تحميل الصفحات المفتوحة مرة وحدة لتلتقط الكود الجديد.
    if(hadOld){
      const wins = await self.clients.matchAll({type: 'window'});
      wins.forEach((c) => { try{ c.navigate(c.url); }catch(e){} });
    }
  })());
});

const CODE_RE = /\.(?:js|css|html|webmanifest)$/i;

// الكود: الشبكة أولًا (مع تجاوز كاش المتصفح)، والمخزّن للطوارئ بدون إنترنت.
async function networkFirst(req){
  const cache = await caches.open(CACHE_VERSION);
  try{
    const resp = await fetch(req, {cache: 'no-cache'});
    if(resp && resp.status === 200 && resp.type === 'basic') cache.put(req, resp.clone());
    return resp;
  }catch(err){
    const cached = await cache.match(req, {ignoreSearch: true});
    if(cached) return cached;
    if(req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  }
}

// الصور والأيقونات: نسخة المخزّن فورًا، وتتحدّث بالخلفية للمرة الجاية.
async function staleWhileRevalidate(req){
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const refresh = fetch(req).then((resp) => {
    if(resp && resp.status === 200 && resp.type === 'basic') cache.put(req, resp.clone());
    return resp;
  }).catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // أي طلب خارج نطاق موقعنا (Firebase Auth/Firestore/Storage، خطوط جوجل...)
  // يمشي عادي للشبكة مباشرة — صفر تدخّل، صفر تخزين.
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  if(req.mode === 'navigate' || CODE_RE.test(url.pathname) || url.pathname.endsWith('/')){
    event.respondWith(networkFirst(req));
  }else{
    event.respondWith(staleWhileRevalidate(req));
  }
});
