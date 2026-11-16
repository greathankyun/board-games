// 桌遊大廳 service worker：先用快取、背景更新，讓遊戲離線也能玩。
// 新增遊戲時把檔案加進 PRECACHE，並把 VERSION 加一。
const VERSION = 'v9';
const CACHE = 'board-games-' + VERSION;
const FONT_CACHE = 'board-games-fonts';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './games/proxy-war/',
  './games/proxy-war/index.html',
  './games/blank-agents/',
  './games/blank-agents/index.html',
  './games/unsigned/',
  './games/unsigned/index.html',
  './games/seven-days/',
  './games/seven-days/index.html',
  './games/wealth-road/',
  './games/wealth-road/index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts：快取優先
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); c.put(req, res.clone()); return res; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 頁面：網路優先，拿不到才用快取，確保一更新就看得到新版
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(async c => {
      try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
      catch (err) { return (await c.match(req, {ignoreSearch: true})) || (await c.match('./index.html')) || Response.error(); }
    }));
    return;
  }

  // 其他同站資源：先回快取，同時到網路抓新版（stale-while-revalidate）
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, {ignoreSearch: true});
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await c.match('./index.html')) || Response.error();
    return Response.error();
  }));
});
