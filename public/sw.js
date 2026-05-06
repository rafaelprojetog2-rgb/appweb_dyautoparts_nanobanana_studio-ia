const CACHE_NAME = 'dy-autoparts-v16';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/dataClient.js',
  '/supabaseClient.js',
  '/src/index.css',
  '/imagens/icon-512-black.png',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      self.skipWaiting();
      return cache.addAll(ASSETS_TO_CACHE);
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

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  if (url.includes('google.com') || url.includes('googleusercontent.com') || url.includes('supabase')) {
    return;
  }
  
  if (url.includes('/app.js') || url.includes('/dataClient.js') || url.includes('/supabaseClient.js') || url.includes('/index.css') || url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
