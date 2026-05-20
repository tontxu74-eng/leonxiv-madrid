/* sw.js - Service Worker para soporte offline de la app táctica UAP León XIV */

const CACHE_NAME = 'uap-tactic-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  // Recursos externos críticos
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

// Instalar Service Worker y cachear recursos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cacheando recursos estáticos');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activar Service Worker y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar peticiones para servir desde caché si no hay red
self.addEventListener('fetch', (event) => {
  // Solo procesar peticiones HTTP/HTTPS (ignorar extensiones, chrome-extension, etc.)
  if (!event.request.url.startsWith('http')) return;

  // En desarrollo local (localhost / 127.0.0.1) siempre ir a la red primero
  // para que los cambios en app.js, style.css, etc. se reflejen sin hard reload
  const isLocalhost = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
  if (isLocalhost) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Devolver el recurso de la caché
          return cachedResponse;
        }

        // Si no está en caché, intentar descargar por red
        return fetch(event.request)
          .then((networkResponse) => {
            // No guardar en caché respuestas erróneas o peticiones que no sean GET
            if (!networkResponse || networkResponse.status !== 200 || event.request.method !== 'GET') {
              return networkResponse;
            }

            // Opcional: Cachear dinámicamente nuevas peticiones GET (como teselas del mapa)
            // Nota: Para no saturar el almacenamiento del dispositivo con mapas, cacheamos solo si son recursos del dominio o de leaflet
            const url = event.request.url;
            if (url.includes('tile.openstreetmap.org') || url.includes('unpkg.com') || url.includes('gstatic.com') || url.includes(self.location.origin)) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }

            return networkResponse;
          })
          .catch((error) => {
            console.log('[Service Worker] Error al descargar y sin caché disponible:', error);
            // Si falla la red y es una página, podríamos devolver un fallback offline
            // En este caso, la SPA ya se encuentra en index.html que está cacheada.
          });
      })
  );
});
