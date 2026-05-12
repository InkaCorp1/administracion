/**
 * INKA CORP - Service Worker
 * PWA Offline Support
 * Version 31.0.0 - Network First y sincronizacion mayor
 */

const SW_VERSION = '31.0.0';
const CACHE_NAME = `inkacorp-v${SW_VERSION}`;
const STATIC_CACHE = `inkacorp-static-v${SW_VERSION}`;
const CHANGELOG_URL = `CHANGELOG.md?v=${encodeURIComponent(SW_VERSION)}`;

// Archivos esenciales para cachear (Shell de la app)
const ESSENTIAL_FILES = [
    './',
    'index.html',
    'login.html',
    'mobile/index.html',
    '404.html',
    CHANGELOG_URL,
    'css/styles.css',
    'js/config.js',
    'js/auth.js',
    'js/app.js',
    'mobile/js/mobile-app.js',
    'js/image-utils.js',
    'manifest.json'
];

// Módulo JS y CSS importantes
const MODULE_FILES = [
    'js/modules/socios.js',
    'js/modules/socios_edit.js',
    'js/modules/solicitud_credito.js',
    'js/modules/creditos.js',
    'views/creditos.html',
    'css/creditos.css',
    'mobile/js/modules/creditos.js',
    'js/modules/creditos_preferenciales.js',
    'js/modules/polizas.js',
    'js/modules/precancelaciones.js',
    'js/modules/ahorros.js',
    'js/modules/simulador.js',
    'js/modules/aportes.js',
    'js/modules/bancos.js',
    'views/bancos.html',
    'css/bancos.css',
    'js/modules/administrativos.js',
    'js/modules/contratos.js',
    'css/contratos.css',
    'views/contratos.html',
    'mobile/css/mobile-styles.css',
    'mobile/views/precancelaciones.html',
    'mobile/css/modules/precancelaciones.css',
    'mobile/js/modules/precancelaciones.js'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log(`[SW] Installing v${SW_VERSION}...`);
    const allFiles = [...ESSENTIAL_FILES, ...MODULE_FILES];
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                const fetchOptions = { cache: 'no-store' };
                return Promise.all(
                    allFiles.map(url => {
                        return fetch(url, fetchOptions)
                            .then(response => {
                                if (!response.ok) throw new Error('Falló carga de ' + url);
                                return cache.put(url, response);
                            })
                            .catch(err => {
                                console.warn('[SW] No se pudo cachear recurso durante install: ', err);
                                return Promise.resolve();
                            });
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

function broadcastServiceWorkerVersion() {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => Promise.all(
            clients.map((client) => client.postMessage({ type: 'SW_VERSION', version: SW_VERSION }))
        ));
}

// Activación - limpiar caches antiguos
self.addEventListener('activate', (event) => {
    console.log(`[SW] Activating v${SW_VERSION}...`);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('inkacorp-') && name !== STATIC_CACHE)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
            .then(() => broadcastServiceWorkerVersion())
    );
});

// Estrategia: Network First con fallback offline limpio
self.addEventListener('fetch', (event) => {
    // Solo manejar peticiones GET
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;

    // REGLA DE ORO: Si no es del mismo origen o es una extensión, NO TOCAR.
    if (!isSameOrigin || url.protocol.startsWith('chrome-extension')) {
        return;
    }

    const isNavigation = event.request.mode === 'navigate' ||
        (event.request.headers.get('accept')?.includes('text/html'));

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Manejo de errores de navegación (SPA)
                if (response.status === 404 && isNavigation) {
                    const isMobileRoute = url.pathname.includes('/mobile/') || url.pathname.includes('/m-');
                    const fallbackFile = isMobileRoute ? 'mobile/index.html' : 'index.html';
                    return caches.match(fallbackFile).then(cached => cached || response);
                }

                // Cachear solo recursos estáticos exitosos de la propia app
                if (response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                }
                
                return response;
            })
            .catch(() => {
                // Fallback offline
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    
                    if (isNavigation) {
                        const isMobileRoute = url.pathname.includes('/mobile/') || url.pathname.includes('/m-');
                        const fallbackFile = isMobileRoute ? 'mobile/index.html' : 'index.html';
                        return caches.match(fallbackFile);
                    }
                });
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
        self.skipWaiting();
        return;
    }

    if (event.data && event.data.type === 'GET_VERSION') {
        if (event.source && typeof event.source.postMessage === 'function') {
            event.source.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
        } else {
            event.waitUntil(broadcastServiceWorkerVersion());
        }
    }
});
