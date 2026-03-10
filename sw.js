/**
 * INKA CORP - Service Worker
 * PWA Offline Support
 */

const SW_VERSION = '29.2.4';
const CACHE_NAME = `inkacorp-v${SW_VERSION}`;
const STATIC_CACHE = `inkacorp-static-v${SW_VERSION}`;

// Archivos esenciales para cachear (Shell de la app)
const ESSENTIAL_FILES = [
    './',
    'index.html',
    'login.html',
    'mobile/index.html',
    '404.html',
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
    'js/modules/administrativos.js',
    'js/modules/contratos.js',
    'css/contratos.css',
    'views/contratos.html',
    'mobile/css/mobile-styles.css'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log(`[SW] Installing v${SW_VERSION}...`);
    const allFiles = [...ESSENTIAL_FILES, ...MODULE_FILES];
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                const fetchOptions = { cache: 'no-store' }; // Forzar fetch desde red al cachear
                return Promise.all(
                    allFiles.map(url => {
                        return fetch(url, fetchOptions).then(response => {
                            if (!response.ok) throw new Error(`Falló carga de ${url}`);
                            return cache.put(url, response);
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

// Estrategia: Network First con Fallback SPA Robustecido

// Estrategia: Network First con Fallback SPA Robustecido
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Ignorar peticiones a APIs externas (Supabase, Google Drive, etc)
    if (url.hostname.includes('supabase') ||
        url.hostname.includes('flagcdn') ||
        url.hostname.includes('googleusercontent.com') ||
        url.hostname.includes('drive.google.com')) return;

    const isNavigation = event.request.mode === 'navigate' ||
        (event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html'));

    const isSameOrigin = url.origin === self.location.origin;
    const networkRequest = isSameOrigin ? new Request(event.request, { cache: 'reload' }) : event.request;

    event.respondWith(
        fetch(networkRequest)
            .then((response) => {
                // Manejo de 404 para soporte SPA (Virtual URLs como /bancos.html)
                if (response.status === 404 && isNavigation) {
                    console.log('[SW] SPA Navigation Fallback for:', url.pathname);
                    const isMobileRoute = url.pathname.includes('/mobile/') || url.pathname.includes('/m-');
                    const fallbackFile = isMobileRoute ? 'mobile/index.html' : 'index.html';

                    return caches.match(fallbackFile).then(cachedResponse => {
                        return cachedResponse || caches.match('index.html') || response;
                    });
                }

                // Cachear recursos estáticos exitosos del mismo origen
                // Solo para esquemas http/https (previene errores con chrome-extension)
                if (response.status === 200 && response.type === 'basic' && 
                    (event.request.url.startsWith('http') || event.request.url.startsWith('https'))) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch((err) => {
                // Fallback Offline
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;

                    if (isNavigation) {
                        const isMobileRoute = url.pathname.includes('/mobile/') || url.pathname.includes('/m-');
                        const fallbackFile = isMobileRoute ? 'mobile/index.html' : 'index.html';
                        return fetch(fallbackFile, { cache: 'no-store' })
                            .then((fallbackResponse) => fallbackResponse)
                            .catch(() => caches.match(fallbackFile));
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
