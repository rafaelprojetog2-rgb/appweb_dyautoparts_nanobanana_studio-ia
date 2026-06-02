const CACHE_NAME = 'dy-autoparts-v103';

// Pre-cache SEM query strings — o match usa ignoreSearch para funcionar
// independentemente da versao usada pelo index.html
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/dataClient.js',
  '/supabaseClient.js',
  '/timeUtils.js',
  '/src/index.css',
  '/assets/images/login-bg-desktop-claro.png',
  '/assets/images/login-bg-desktop-escuro.png',
  '/assets/images/login-bg-mobile-claro.png',
  '/assets/images/login-bg-mobile-escuro.png',
  '/assets/images/logo/logo_dybranco_app.png',
  '/assets/images/logo/logo_dypreto_app.png',
  '/assets/images/logo/maskable_icon_preto_x192.png',
  '/assets/images/logo/maskable_icon_preto_x512.png',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      self.skipWaiting();
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => cache.add(asset))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const requestUrl = new URL(url);

  // Bypass total para desenvolvimento local
  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Bypass total para APIs externas (Google Sheets, Supabase)
  if (url.includes('google.com') || url.includes('googleusercontent.com') || url.includes('supabase')) {
    return;
  }

  // Network-first para navegacao (HTML)
  if (event.request.mode === 'navigate' || requestUrl.pathname === '/') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Network-first para arquivos principais da aplicacao
  if (url.includes('/app.js') || url.includes('/dataClient.js') || url.includes('/supabaseClient.js') || url.includes('/timeUtils.js') || url.includes('/index.css') || url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Cache-first para demais recursos (imagens, fontes, libs)
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => response || fetch(event.request))
  );
});
