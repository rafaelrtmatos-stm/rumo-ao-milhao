/**
 * Service Worker — Rumo ao Milhão
 * Estratégia:
 * - App shell: Cache First
 * - Supabase Storage (mapas): Cache First com revalidação em background
 * - Tiles de mapa (Esri/CartoDB): Cache First
 * - API: Network First com fallback
 */

const CACHE_VERSION = 'v3';
const CACHE_SHELL = `ra1m-shell-${CACHE_VERSION}`;
const CACHE_MAPAS = `ra1m-mapas-${CACHE_VERSION}`;
const CACHE_TILES = `ra1m-tiles-${CACHE_VERSION}`;

const APP_SHELL = ['/', '/index.html', '/offline.html', '/manifest.json'];

// Padrões de URL para cada estratégia
const isSupabaseStorage = (url) =>
  url.includes('/storage/v1/object/public/mapas/') ||
  url.includes('supabase.co/storage');

const isMapTile = (url) =>
  url.includes('arcgisonline.com') ||
  url.includes('cartocdn.com') ||
  url.includes('openstreetmap.org');

const isAPI = (url) => url.includes('/api/');

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const CACHES_VÁLIDOS = [CACHE_SHELL, CACHE_MAPAS, CACHE_TILES];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !CACHES_VÁLIDOS.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // 1. Imagens do Supabase Storage — Cache First + revalidação background
  if (isSupabaseStorage(url)) {
    event.respondWith(cacheFirstWithRevalidate(event.request, CACHE_MAPAS));
    return;
  }

  // 2. Tiles de mapa — Cache First (tiles não mudam)
  if (isMapTile(url)) {
    event.respondWith(cacheFirst(event.request, CACHE_TILES));
    return;
  }

  // 3. API — Network First com fallback offline
  if (isAPI(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 4. App shell — Cache First
  event.respondWith(cacheFirst(event.request, CACHE_SHELL));
});

// ── ESTRATÉGIAS ───────────────────────────────────────────────────────────────

/** Cache First: serve do cache, se não tiver busca na rede e armazena. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/offline.html') || new Response('Offline', { status: 503 });
  }
}

/** Cache First + revalidação em background (Stale While Revalidate). */
async function cacheFirstWithRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  // Revalidar em background independente
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(cacheName).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);

  if (cached) return cached;
  // Se não tem cache, aguarda a rede
  const response = await fetchPromise;
  return response || new Response('', { status: 503 });
}

/** Network First: tenta rede, se falhar usa cache. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/offline.html') || new Response('Offline', { status: 503 });
  }
}

// ── MENSAGENS ─────────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  // Limpar cache de mapas (quando imagem é atualizada)
  if (event.data?.type === 'CLEAR_MAPA_CACHE') {
    caches.delete(CACHE_MAPAS).then(() => {
      event.ports?.[0]?.postMessage({ ok: true });
    });
  }
  // Pré-cachear uma URL específica
  if (event.data?.type === 'PRECACHE_URL' && event.data.url) {
    caches.open(CACHE_MAPAS).then(cache => {
      fetch(event.data.url).then(r => { if (r.ok) cache.put(event.data.url, r); });
    });
  }
});
