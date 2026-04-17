const CACHE_NAME = 'dy-autoparts-v10';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/src/index.css?v=1.0.2',
  '/imagens/icon-192-black.png',
  '/imagens/icon-512-black.png',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Force immediate activation
      self.skipWaiting();
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Clear old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorar requisições para o Google Sheets (SCRIPT_URL) e Google Apps Script para não cachear dados dinâmicos de forma errada no SW
  if (event.request.url.includes('google.com') || event.request.url.includes('googleusercontent.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
