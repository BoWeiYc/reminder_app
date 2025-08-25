const CACHE_NAME = 'reminder-notes-v3'; // 換版本以清掉舊快取
const CORE = [
  './reminder_app.html',
  './reminder_styles.css',
  './reminder_script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 安裝：預快取核心資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE))
  );
  self.skipWaiting();
});

// 啟用：清除舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// 只攔截 http/https 的同網域 GET 請求；其他（例如 chrome-extension、ws）一律放行
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只處理 GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const isSameOrigin = url.origin === self.location.origin;

  if (!isHttp || !isSameOrigin) {
    // 非 http/https 或跨網域（含 chrome-extension、ws 等）→ 不快取，直接走網路
    return;
  }

  // Cache-First：先找快取，沒有就抓網路並寫回快取
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // 只有成功回應才寫入快取
        if (resp && resp.ok) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
        }
        return resp;
      }).catch(() => caches.match('./reminder_app.html')); // 離線備援
    })
  );
});
