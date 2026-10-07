const CACHE_NAME = 'noteo-v3.3';
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js'
];

// Installation : Mise en cache des fichiers statiques
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Stratégie : Cache First, then Network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

// --- NOUVEAU : Nettoyage des anciens caches (Mise à jour) ---
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        // Si le cache trouvé est différent du CACHE_NAME actuel, on le supprime
        if (key !== CACHE_NAME) {
          console.log('Noteo PWA: Suppression de l\'ancien cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
});