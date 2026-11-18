// 遊戲群島 Playlands service worker：先用快取、背景更新，讓遊戲離線也能玩。
// 新增遊戲時把檔案加進 PRECACHE，並把 VERSION 加一。
const VERSION = 'v19';
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
  './games/wealth-road/index.html',
  './games/red-envelope/',
  './games/red-envelope/index.html',
  './games/office-mole/',
  './games/office-mole/index.html',
  './games/er-24/',
  './games/er-24/index.html',
  './games/cat-cafe/',
  './games/cat-cafe/index.html',
  './games/influencer/',
  './games/influencer/index.html',
  './games/pudu/',
  './games/pudu/index.html',
  './games/taipei-rent/',
  './games/taipei-rent/index.html',
  './games/magic-exam/',
  './games/magic-exam/index.html',
  './games/claw-master/',
  './games/claw-master/index.html',
  './games/time-pawn/',
  './games/time-pawn/index.html',
  './assets/table.js',
  './assets/net.js',
  './assets/intro.js',
  './assets/ui.css',
  './assets/avatars/avatar-1.webp',
  './assets/avatars/avatar-2.webp',
  './assets/avatars/avatar-3.webp',
  './assets/avatars/avatar-4.webp',
  './assets/avatars/avatar-5.webp',
  './assets/avatars/avatar-6.webp',
  './assets/avatars/avatar-7.webp',
  './assets/avatars/avatar-8.webp',
  './games/blank-agents/img/back.webp',
  './games/blank-agents/img/blue.webp',
  './games/blank-agents/img/double.webp',
  './games/blank-agents/img/red.webp',
  './games/cat-cafe/img/black.webp',
  './games/cat-cafe/img/blue.webp',
  './games/cat-cafe/img/british.webp',
  './games/cat-cafe/img/calico.webp',
  './games/cat-cafe/img/munchkin.webp',
  './games/cat-cafe/img/orange.webp',
  './games/cat-cafe/img/ragdoll.webp',
  './games/cat-cafe/img/siamese.webp',
  './games/cat-cafe/img/sphynx.webp',
  './games/cat-cafe/img/tabby.webp',
  './games/claw-master/img/bear.webp',
  './games/claw-master/img/bunny.webp',
  './games/claw-master/img/cat.webp',
  './games/claw-master/img/chick.webp',
  './games/claw-master/img/dino.webp',
  './games/claw-master/img/egg.webp',
  './games/er-24/img/doc.webp',
  './games/er-24/img/lab.webp',
  './games/er-24/img/nurse.webp',
  './games/er-24/img/sw.webp',
  './games/influencer/img/ad.webp',
  './games/influencer/img/chal.webp',
  './games/influencer/img/collab.webp',
  './games/influencer/img/flame.webp',
  './games/influencer/img/food.webp',
  './games/influencer/img/live.webp',
  './games/influencer/img/meme.webp',
  './games/influencer/img/pr.webp',
  './games/influencer/img/trip.webp',
  './games/influencer/img/unbox.webp',
  './games/magic-exam/img/astro.webp',
  './games/magic-exam/img/flying.webp',
  './games/magic-exam/img/potion.webp',
  './games/magic-exam/img/transf.webp',
  './games/office-mole/img/boss.webp',
  './games/office-mole/img/guard.webp',
  './games/office-mole/img/hr.webp',
  './games/office-mole/img/mole.webp',
  './games/office-mole/img/rookie.webp',
  './games/office-mole/img/staff.webp',
  './games/proxy-war/img/azur.webp',
  './games/proxy-war/img/gold.webp',
  './games/proxy-war/img/redr.webp',
  './games/proxy-war/img/sail.webp',
  './games/proxy-war/img/star.webp',
  './games/pudu/img/cake.webp',
  './games/pudu/img/can.webp',
  './games/pudu/img/ghost.webp',
  './games/pudu/img/guai.webp',
  './games/pudu/img/noodle.webp',
  './games/pudu/img/pine.webp',
  './games/pudu/img/soda.webp',
  './games/pudu/img/wine.webp',
  './games/red-envelope/img/bridesmaid.webp',
  './games/red-envelope/img/colleague.webp',
  './games/red-envelope/img/cousin.webp',
  './games/red-envelope/img/elder.webp',
  './games/red-envelope/img/ex.webp',
  './games/red-envelope/img/grandma.webp',
  './games/red-envelope/img/matchmaker.webp',
  './games/red-envelope/img/uncle.webp',
  './games/seven-days/img/duan.webp',
  './games/seven-days/img/emei.webp',
  './games/seven-days/img/fake.webp',
  './games/seven-days/img/gaibang.webp',
  './games/seven-days/img/kunlun.webp',
  './games/seven-days/img/qibu.webp',
  './games/seven-days/img/sangong.webp',
  './games/seven-days/img/tangmen.webp',
  './games/seven-days/img/wudang.webp',
  './games/taipei-rent/img/agent.webp',
  './games/taipei-rent/img/builder.webp',
  './games/taipei-rent/img/chief.webp',
  './games/taipei-rent/img/landlord.webp',
  './games/taipei-rent/img/sub.webp',
  './games/taipei-rent/img/tenant.webp',
  './games/time-pawn/img/ancient.webp',
  './games/time-pawn/img/cyber.webp',
  './games/time-pawn/img/dino.webp',
  './games/time-pawn/img/steam.webp',
  './games/time-pawn/img/voyage.webp',
  './games/unsigned/img/blank.webp',
  './games/unsigned/img/expose.webp',
  './games/unsigned/img/forge.webp',
  './games/unsigned/img/gift.webp',
  './games/unsigned/img/poach.webp',
  './games/wealth-road/img/chef.webp',
  './games/wealth-road/img/civil.webp',
  './games/wealth-road/img/creator.webp',
  './games/wealth-road/img/design.webp',
  './games/wealth-road/img/eng.webp',
  './games/wealth-road/img/nurse.webp',
  './games/wealth-road/img/sales.webp',
  './games/wealth-road/img/teach.webp',
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
