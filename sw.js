/* Service worker — membuat aplikasi bisa dibuka tanpa internet.
   Setiap kali Anda mengubah file website, naikkan angka VERSI agar HP siswa ikut terbarui. */
const VERSI = 'ue2-v15-server-laptop';
const SHELL = [
  './', './index.html', './kuis.html', './guru.html', './Cetak_Kartu.html', './Cetak_Soal.html', './config.js', './manifest.json',
  './assets/style.css', './assets/guru.css', './assets/common.js', './assets/app.js', './assets/guru.js', './assets/laporan.js',
  './assets/rekap.js', './assets/ekspor.js', './assets/pengaturan.js',
  './assets/maskot.svg', './assets/icon-192.png', './assets/icon-512.png'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js',
  'https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;700;800&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSI);
    await c.addAll(SHELL);
    await Promise.all(CDN.map(async (u) => {
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); } catch (err) { /* diulang saat online */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSI && k !== 'ue-img').map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Jangan pernah menyimpan panggilan API. Gambar soal dari server laptop (lewat workers.dev) tetap disimpan agar bisa dibuka offline.
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('script.googleusercontent.com') || (url.hostname.endsWith('workers.dev') && req.destination !== 'image')) return;

  // Gambar soal: ambil dari cache dulu
  if (req.destination === 'image' && url.origin !== location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req.url, { ignoreVary: true });
      if (hit) return hit;
      try {
        const r = await fetch(req);
        const c = await caches.open('ue-img'); c.put(req.url, r.clone());
        return r;
      } catch (err) { return Response.error(); }
    })());
    return;
  }

  // Font & MathJax (CDN): cache dulu, lalu jaringan
  if (url.origin !== location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreVary: true }) || await caches.match(req.url, { ignoreVary: true });
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') { const c = await caches.open(VERSI); c.put(req, r.clone()); }
        return r;
      } catch (err) { return Response.error(); }
    })());
    return;
  }

  // File aplikasi: Network First (selalu ambil terbaru dari jaringan, kalau offline pakai cache)
  e.respondWith((async () => {
    const c = await caches.open(VERSI);
    try {
      const r = await fetch(req);
      if (r.ok) { c.put(req, r.clone()); return r; }
    } catch (err) { /* Offline, jatuh kembali ke cache */ }
    
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await c.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
