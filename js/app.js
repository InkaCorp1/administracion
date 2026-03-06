/**
 * INKA CORP - Aplicación Principal
 * Maneja la navegación, carga de módulos y estado global
 */

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUser = null;
let currentViewName = null;
const viewCache = new Map();

// Referencias a elementos del DOM globales
let mainContent = null;
let sidebar = null;
let appLoader = null;
let appLoaderText = null;
let logoutBtn = null;
let userNameDisplay = null;
let userRoleDisplay = null;
let userAvatarDisplay = null;
let homeShortcut = null;
let loaderCount = 0;

/**
 * Obtiene el usuario actual de forma segura
 * @returns {object|null} Usuario actual o null si no hay sesión
 */
function getCurrentUser() {
    return currentUser || window.currentUser || null;
}

// Exponer globalmente
window.getCurrentUser = getCurrentUser;

/**
 * Obtiene los datos unificados del asesor/acreedor para todos los documentos del sistema
 * Centralizado para evitar inconsistencias entre módulos
 */
function getDatosAcreedor() {
    const user = getCurrentUser();
    
    if (!user) {
        return {
            nombre: '',
            institucion: 'INKA CORP',
            cedula: '',
            telefono: '',
            domicilio: '',
            ciudad: ''
        };
    }

    // Buscar WhatsApp en múltiples lugares con prioridad
    let numWhatsapp = user.whatsapp || user.user_metadata?.whatsapp || user.phone || '';
    
    // Limpieza final y validación de strings "falsos"
    let telefonoFinal = String(numWhatsapp || '').trim();
    const invalidValues = ['undefined', 'null', '[object object]', '0', 'none'];
    
    if (invalidValues.includes(telefonoFinal.toLowerCase())) {
        telefonoFinal = ''; 
    }
    
    return {
        nombre: (user.nombre || user.full_name || user.user_metadata?.full_name || '').toUpperCase(),
        institucion: 'INKA CORP',
        cedula: user.cedula || '',
        telefono: telefonoFinal,
        domicilio: user.direccion || user.domicilio || '',
        ciudad: user.lugar_asesor || user.ciudad || ''
    };
}

// Exponer globalmente
window.getDatosAcreedor = getDatosAcreedor;
window.sysCajaAbierta = false; // Estado inicial

/**
 * Validador global para acciones financieras
 * Retorna true si la caja está abierta, de lo contrario muestra alerta y retorna false
 */
window.validateCajaBeforeAction = function(modulo = 'esta operación') {
    if (window.sysCajaAbierta) return true;

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: '<h2 style="color: #ef4444; margin-top: 0.5rem;">¡CAJA CERRADA!</h2>',
            html: `
                <div style="text-align: center; padding: 1rem;">
                    <i class="fas fa-lock fa-4x" style="color: #ef4444; margin-bottom: 1.5rem; filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.4));"></i>
                    <p style="font-size: 1.15rem; line-height: 1.6; color: #fecaca; font-weight: 500;">
                        No puede registrar <strong>${modulo}</strong> sin una jornada de caja activa.
                    </p>
                    <p style="font-size: 0.95rem; margin-top: 1rem; color: #94a3b8;">
                        Es obligatorio abrir su caja para garantizar la auditoría de este movimiento.
                    </p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#F2BB3A',
            cancelButtonColor: '#334155',
            confirmButtonText: '<i class="fas fa-door-open"></i> IR AL MÓDULO DE CAJA',
            cancelButtonText: 'CANCELAR',
            background: '#0f172a',
            color: '#fff',
            showClass: {
                popup: 'animate__animated animate__shakeX'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                if (typeof loadView === 'function') loadView('caja');
            }
        });
    } else {
        alert(`¡ATENCIÓN! Su caja está cerrada. Debe abrirla para registrar ${modulo}.`);
    }
    return false;
};

// ==========================================
// SISTEMA DE CACHÉ PERSISTENTE (localStorage)
// ==========================================

/**
 * Muestra una advertencia persistente si la caja no está abierta
 * en los módulos que requieren movimientos financieros.
 */
async function checkCajaStatusGlobal() {
    const viewsWithCaja = [
        'creditos', 
        'precancelaciones', 
        'polizas', 
        'administrativos', 
        'bancos', 
        'creditos_preferenciales', 
        'solicitud_credito', 
        'ahorros',
        'resumen_general',
        'propuesta_caja'
    ];
    const isFinancialView = viewsWithCaja.includes(currentViewName);
    const isDashboard = currentViewName === 'dashboard';

    const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!sb) return;

    const user = getCurrentUser();
    if (!user) return;

    try {
        const { data: activeSessions, error } = await sb
            .from('ic_caja_aperturas')
            .select('id_apertura')
            .eq('id_usuario', user.id)
            .eq('estado', 'ABIERTA')
            .limit(1);

        if (error) throw error;

        const isCajaOpen = activeSessions && activeSessions.length > 0;
        window.sysCajaAbierta = isCajaOpen; // Estado global para módulos

        // 1. Manejo de Banner en Vistas Financieras
        if (isFinancialView) {
            if (!isCajaOpen) {
                injectCajaWarningBanner();
            } else {
                const existing = document.getElementById('global-caja-warning');
                if (existing) existing.remove();
            }
        }

        // 2. Manejo de Aviso Sutil en Dashboard
        if (isDashboard) {
            updateDashboardCajaStatus(isCajaOpen);
        }

    } catch (err) {
        console.warn("[APP] Error validando estado de caja global:", err);
    }
}

/**
 * Actualiza el indicador de caja en el dashboard
 */
function updateDashboardCajaStatus(isOpen) {
    const heroContent = document.querySelector('.hero-content');
    if (!heroContent) return;

    // Eliminar indicador previo si existe
    const existing = document.getElementById('dashboard-caja-status');
    if (existing) existing.remove();

    if (!isOpen) {
        const badge = document.createElement('div');
        badge.id = 'dashboard-caja-status';
        badge.className = 'dashboard-caja-badge-warning';
        badge.innerHTML = `
            <span><i class="fas fa-lock"></i> ATENCIÓN: CAJA PENDIENTE DE APERTURA</span>
            <button class="btn-caja-dashboard" onclick="loadView('caja')">
                <i class="fas fa-sign-in-alt"></i> IR A CAJA
            </button>
        `;
        heroContent.appendChild(badge);
    }
}

function injectCajaWarningBanner() {
    if (!mainContent) return;
    
    // Evitar duplicados
    if (document.getElementById('global-caja-warning')) return;

    const banner = document.createElement('div');
    banner.id = 'global-caja-warning';
    banner.className = 'caja-warning-banner';
    banner.innerHTML = `
        <div class="banner-content">
            <div class="banner-text">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Atención: Caja Cerrada</strong>
                    <p>No ha iniciado su turno de caja hoy. No podrá registrar pagos ni egresos en este módulo hasta que la abra.</p>
                </div>
            </div>
            <button class="banner-btn" onclick="loadView('caja')">
                <i class="fas fa-door-open"></i> IR A ABRIR CAJA
            </button>
        </div>
    `;

    // Insertar al inicio del contenido principal
    mainContent.prepend(banner);
}

const CACHE_KEY = 'inkacorp_cache_v2';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos para considerar "fresco"
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas máximo antes de forzar actualización

// Tipos de datos que se cachean
const CACHE_TYPES = [
    'socios',
    'creditos',
    'creditos_preferenciales',
    'solicitudes',
    'precancelaciones',
    'polizas',
    'ahorros',
    'pagos',
    'amortizaciones',
    'administrativos',
    'bancos',
    'contratos'
];

// Listeners para notificar a vistas cuando el caché se actualiza
const cacheUpdateListeners = new Map();

function ensureCacheShape(cache) {
    const safe = cache && typeof cache === 'object' ? cache : {};

    // Arrays de datos
    for (const type of CACHE_TYPES) {
        if (!Array.isArray(safe[type])) safe[type] = [];
    }

    // lastUpdate por tipo
    if (!safe.lastUpdate || typeof safe.lastUpdate !== 'object') safe.lastUpdate = {};
    for (const type of CACHE_TYPES) {
        if (typeof safe.lastUpdate[type] !== 'number') safe.lastUpdate[type] = 0;
    }

    // Metadata del caché
    if (typeof safe.createdAt !== 'number') safe.createdAt = Date.now();
    if (typeof safe.version !== 'number') safe.version = 2;

    return safe;
}

// Inicializar caché desde localStorage
function initCache() {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Verificar si el caché no es demasiado viejo
            if (parsed.createdAt && (Date.now() - parsed.createdAt) > CACHE_MAX_AGE) {
                window.dataCache = ensureCacheShape(null);
            } else {
                window.dataCache = ensureCacheShape(parsed);
            }
        } else {
            window.dataCache = ensureCacheShape(null);
        }
    } catch (e) {
        console.warn('Error cargando caché:', e);
        window.dataCache = ensureCacheShape(null);
    }
}

// Guardar caché en localStorage (persistente)
function saveCache() {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(window.dataCache));
    } catch (e) {
        console.warn('No se pudo guardar caché en localStorage:', e);
        // Si localStorage está lleno, limpiar datos antiguos
        if (e.name === 'QuotaExceededError') {
            clearOldCacheData();
        }
    }
}

// Limpiar datos antiguos si localStorage está lleno
function clearOldCacheData() {
    try {
        // Mantener solo los datos más recientes
        if (window.dataCache) {
            for (const type of CACHE_TYPES) {
                if (window.dataCache[type] && window.dataCache[type].length > 500) {
                    window.dataCache[type] = window.dataCache[type].slice(0, 500);
                }
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(window.dataCache));
        }
    } catch (e) {
        console.error('Error limpiando caché antiguo:', e);
    }
}

// Limpiar caché completamente (solo al cerrar sesión)
function clearCache() {
    window.dataCache = ensureCacheShape(null);
    localStorage.removeItem(CACHE_KEY);
    // Limpiar también sessionStorage por si acaso
    sessionStorage.removeItem('inkacorp_cache');
}

// Exponer globalmente
window.clearCache = clearCache;
window.saveCacheToDisk = saveCache;
window.saveCache = saveCache;

// Verificar si el caché es válido (fresco)
window.isCacheValid = function (type) {
    if (!window.dataCache) initCache();
    const lastUpdate = window.dataCache.lastUpdate[type] || 0;
    return Date.now() - lastUpdate < CACHE_DURATION;
};

// Verificar si hay datos en caché (aunque no estén frescos)
window.hasCacheData = function (type) {
    if (!window.dataCache) initCache();
    return window.dataCache[type] && window.dataCache[type].length > 0;
};

// Obtener datos del caché
window.getCacheData = function (type) {
    if (!window.dataCache) initCache();
    return window.dataCache[type] || [];
};

// Establecer datos en caché
window.setCacheData = function (type, data) {
    if (!window.dataCache) initCache();
    window.dataCache[type] = data;
    window.dataCache.lastUpdate[type] = Date.now();
    saveCache();
    // Notificar a listeners
    notifyCacheUpdate(type, data);
};

// Registrar listener para actualizaciones de caché
window.onCacheUpdate = function (type, callback) {
    if (!cacheUpdateListeners.has(type)) {
        cacheUpdateListeners.set(type, []);
    }
    cacheUpdateListeners.get(type).push(callback);
};

// Remover listener
window.offCacheUpdate = function (type, callback) {
    if (cacheUpdateListeners.has(type)) {
        const listeners = cacheUpdateListeners.get(type);
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }
};

// Notificar a listeners cuando el caché se actualiza
function notifyCacheUpdate(type, data) {
    if (cacheUpdateListeners.has(type)) {
        cacheUpdateListeners.get(type).forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error('Error en listener de caché:', e);
            }
        });
    }
}

// Forzar actualización del caché (botón sincronizar)
async function forceRefreshCache() {
    if (!window.dataCache) initCache();
    window.dataCache = ensureCacheShape(window.dataCache);
    for (const type of CACHE_TYPES) {
        window.dataCache.lastUpdate[type] = 0;
    }
    await refreshCacheInBackground();
    return true;
}
window.forceRefreshCache = forceRefreshCache;

// Cargar datos en segundo plano
async function refreshCacheInBackground() {
    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        if (!window.dataCache) initCache();
        window.dataCache = ensureCacheShape(window.dataCache);

        const [sociosRes, creditosRes, solicitudesRes, precancelacionesRes, polizasRes] = await Promise.all([
            supabase
                .from('ic_socios')
                .select(`
                    *,
                    creditos:ic_creditos (
                        id_credito,
                        estado_credito,
                        capital
                    )
                `)
                .order('nombre', { ascending: true }),
            supabase
                .from('ic_creditos')
                .select(`
                    *,
                    socio:ic_socios (
                        idsocio,
                        nombre,
                        cedula,
                        whatsapp,
                        paisresidencia
                    )
                `)
                .order('created_at', { ascending: false }),
            supabase
                .from('ic_solicitud_de_credito')
                .select('*')
                .order('solicitudid', { ascending: false }),
            supabase
                .from('ic_creditos_precancelacion')
                .select(`
                    *,
                    credito:ic_creditos (
                        id_credito,
                        codigo_credito,
                        capital,
                        socio:ic_socios (
                            idsocio,
                            nombre,
                            cedula
                        )
                    )
                `)
                .order('fecha_precancelacion', { ascending: false }),
            supabase
                .from('ic_polizas')
                .select(`
                    *,
                    socio:ic_socios (
                        idsocio,
                        nombre,
                        cedula,
                        whatsapp
                    )
                `)
                .order('created_at', { ascending: false })
        ]);

        if (!sociosRes.error && sociosRes.data) {
            window.dataCache.socios = sociosRes.data;
            window.dataCache.lastUpdate.socios = Date.now();
            notifyCacheUpdate('socios', sociosRes.data);
        } else if (sociosRes.error) {
            console.warn('No se pudo refrescar socios en caché:', sociosRes.error);
        }

        if (!creditosRes.error && creditosRes.data) {
            window.dataCache.creditos = creditosRes.data;
            window.dataCache.lastUpdate.creditos = Date.now();
            notifyCacheUpdate('creditos', creditosRes.data);
        } else if (creditosRes.error) {
            console.warn('No se pudo refrescar créditos en caché:', creditosRes.error);
        }

        if (!solicitudesRes.error && solicitudesRes.data) {
            window.dataCache.solicitudes = solicitudesRes.data;
            window.dataCache.lastUpdate.solicitudes = Date.now();
            notifyCacheUpdate('solicitudes', solicitudesRes.data);
        } else if (solicitudesRes.error) {
            console.warn('No se pudo refrescar solicitudes en caché:', solicitudesRes.error);
        }

        if (!precancelacionesRes.error && precancelacionesRes.data) {
            window.dataCache.precancelaciones = precancelacionesRes.data;
            window.dataCache.lastUpdate.precancelaciones = Date.now();
            notifyCacheUpdate('precancelaciones', precancelacionesRes.data);
        } else if (precancelacionesRes.error) {
            console.warn('No se pudo refrescar precancelaciones en caché:', precancelacionesRes.error);
        }

        if (!polizasRes.error && polizasRes.data) {
            window.dataCache.polizas = polizasRes.data;
            window.dataCache.lastUpdate.polizas = Date.now();
            notifyCacheUpdate('polizas', polizasRes.data);
        } else if (polizasRes.error) {
            console.warn('No se pudo refrescar pólizas en caché:', polizasRes.error);
        }

        // Guardar en localStorage (persistente)
        saveCache();

    } catch (error) {
        console.error('Error actualizando caché:', error);
    }
}

// Iniciar actualización periódica del caché
function startCacheRefresh() {
    // Inicializar caché desde localStorage
    initCache();

    window.dataCache = ensureCacheShape(window.dataCache);

    // Siempre refrescar en segundo plano al iniciar (pero los datos de caché ya están disponibles)
    refreshCacheInBackground();

    // Refrescar cada 5 minutos
    setInterval(refreshCacheInBackground, CACHE_DURATION);
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Bloqueo total desde JS si se intenta cargar en móvil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 850;
    const urlParams = new URLSearchParams(window.location.search);
    const allowDesktopFromMobile = sessionStorage.getItem('forceDesktop') === 'true' || urlParams.get('forceDesktop') === '1';

    if (sessionStorage.getItem('forceDesktop') === 'true') {
        sessionStorage.removeItem('forceDesktop');
        console.log('[APP] Bypass móvil->PC permitido para flujo puntual.');
    }

    if (isMobile && !allowDesktopFromMobile && !window.location.pathname.includes('/mobile/')) {
        console.log('[APP] Bloqueando carga de PC en móvil...');
        window.location.replace(window.location.origin + window.location.pathname.replace(/\/$/, '') + '/mobile/');
        return;
    }

    // No inicializar si estamos en la carpeta mobile o es la vista móvil
    if (window.location.pathname.includes('/mobile/') || window.location.pathname.includes('movil.html')) {
        return;
    }

    initSupabase();
    
    // Safety Timeout: Si pasan 15 segundos y no se ha ocultado el locker, forzarlo
    setTimeout(() => {
        const locker = document.getElementById('app-screen-locker');
        if (locker) {
            console.warn('Safety timeout: Forzando ocultación de screen locker');
            hideScreenLocker();
        }
    }, 15000);

    await initApp();
});

async function initApp() {
    console.log(`%c INKA CORP - APP VERSION: ${window.APP_VERSION || 'v1.0'} `, 'background: #1e40af; color: #fff; font-weight: bold;');
    syncAppVersionLabels(document);
    
    // Verificar sesión
    const { isAuthenticated, user } = await checkSession();

    if (!isAuthenticated) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    // Exponer currentUser globalmente para acceso desde otros módulos
    window.currentUser = user;

    // Cachear elementos del DOM
    sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        document.body.classList.add('sidebar-collapsed');
    }
    mainContent = document.getElementById('main-content');
    logoutBtn = document.getElementById('logout-btn');
    userNameDisplay = document.getElementById('user-name');
    userRoleDisplay = document.getElementById('user-role');
    userAvatarDisplay = document.getElementById('user-avatar');
    appLoader = document.getElementById('app-loader');
    appLoaderText = document.getElementById('app-loader-text');
    homeShortcut = document.getElementById('home-shortcut');

    // Actualizar UI con datos del usuario
    updateUI();

    // Iniciar caché en segundo plano
    startCacheRefresh();

    try {
        // Cargar vista inicial
        const initialView = getViewFromURL();
        
        // Determinar la URL correcta a mantener en la barra de direcciones
        const basePath = window.location.pathname.includes('index.html') ? 'index.html' : './';
        const stateUrl = initialView === 'dashboard' ? basePath : `${basePath}?view=${initialView}`;
        
        // Forzar sincronización de historial al cargar para evitar que el navegador defaultée a index.html
        if (history.replaceState) {
            history.replaceState({ view: initialView }, '', stateUrl);
        }

        await loadView(initialView, false);

        // Asegurar estado activo en la navegación
        const navItems = document.querySelectorAll('.nav-item[data-view]');
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === initialView);
        });
    } catch (error) {
        console.error("Error durate el inicio de la app:", error);
    } finally {
        // Configurar event listeners AL FINAL
        setupEventListeners();

        // Asegurar que el loader se oculte SIEMPRE
        setTimeout(() => {
            if (typeof hideScreenLocker === 'function') hideScreenLocker();
        }, 100);
    }
}

/**
 * Detecta la vista actual basándose en la URL (Pathname o Hash)
 */
function getViewFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const hash = window.location.hash.replace('#', '');
    const validViews = ['dashboard', 'socios', 'socios_edit', 'solicitud_credito', 'creditos', 'creditos_preferenciales', 'precancelaciones', 'resumen_general', 'ahorros', 'polizas', 'simulador', 'aportes', 'bancos', 'administrativos', 'caja', 'agenda', 'contratos'];

    // 1. Prioridad: Parámetro URL (?view=creditos) - SOPORTA HARD REFRESH
    if (viewParam && validViews.includes(viewParam)) return viewParam;

    // 2. Prioridad: Hash (compatibilidad legacy)
    if (hash && validViews.includes(hash)) return hash;

    // 3. Fallback: Detectar si viene de una URL antigua (.html)
    const path = window.location.pathname;
    const lastPart = path.split('/').pop().replace('.html', '');
    if (lastPart && validViews.includes(lastPart) && lastPart !== 'index') {
        return lastPart;
    }

    return 'dashboard';
}

function updateUI() {
    if (currentUser) {
        if (userNameDisplay) userNameDisplay.textContent = currentUser.nombre || 'Usuario';
        if (userRoleDisplay) userRoleDisplay.textContent = currentUser.rol || 'usuario';
        if (userAvatarDisplay) {
            // Mostrar iniciales del nombre
            const initials = (currentUser.nombre || 'U').split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);
            userAvatarDisplay.textContent = initials;
        }
    }

    // Aplicar visibilidad de módulos según rol
    applyModuleVisibility();
}

function applyModuleVisibility() {
    const navItems = document.querySelectorAll('.nav-item[data-module]');
    navItems.forEach(item => {
        const module = item.dataset.module;
        const requiresAdmin = item.dataset.requiresAdmin === 'true';

        // Si requiere admin y el usuario no es admin, ocultar
        if (requiresAdmin && !isAdmin()) {
            item.style.display = 'none';
        } else {
            item.style.display = '';
        }
    });
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Manejo de navegación atrás/adelante del navegador
    window.addEventListener('popstate', (e) => {
        const urlParams = new URLSearchParams(window.location.search);
        const viewParam = urlParams.get('view');
        
        const view = (e.state && e.state.view) ? e.state.view : 
                     (viewParam ? viewParam : 'dashboard');
        
        loadView(view, false);
        
        // Actualizar navegación activa
        const navItems = document.querySelectorAll('.nav-item[data-view]');
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    }



    // Navegación
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const view = item.dataset.view;

            // 1. Feedback inmediato: Cerrar sidebar y marcar activo
            closeSidebar();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 2. Cargar vista
            await loadView(view);
        });
    });

    // Toggle Sidebar
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Protege contra "scroll chaining" desde el sidebar hacia modales (fallback JS para navegadores antiguos)
    (function attachSidebarScrollGuard() {
        const nav = document.querySelector('.nav-menu');
        const sb = document.getElementById('sidebar');
        if (!nav || !sb) return;

        let touchStartY = 0;

        // Wheel (ratón/trackpad) - prevenir que el desplazamiento en el extremo burpee al modal
        nav.addEventListener('wheel', function (ev) {
            // Solo intervenir si el sidebar está abierto
            if (sb.classList.contains('collapsed')) return;

            const delta = ev.deltaY;
            const atTop = nav.scrollTop === 0 && delta < 0;
            const atBottom = Math.ceil(nav.scrollTop + nav.clientHeight) >= nav.scrollHeight && delta > 0;

            if (atTop || atBottom) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        }, { passive: false });

        // Touch (móviles) — bloqueo cuando se intenta hacer overscroll en los extremos
        nav.addEventListener('touchstart', function (ev) {
            touchStartY = ev.touches[0]?.clientY || 0;
        }, { passive: true });

        nav.addEventListener('touchmove', function (ev) {
            if (sb.classList.contains('collapsed')) return;
            const currentY = ev.touches[0]?.clientY || 0;
            const dy = touchStartY - currentY;
            const atTop = nav.scrollTop === 0 && dy < 0;
            const atBottom = Math.ceil(nav.scrollTop + nav.clientHeight) >= nav.scrollHeight && dy > 0;
            if (atTop || atBottom) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        }, { passive: false });
    })();

    // Home Shortcut
    const homeBtn = document.getElementById('home-shortcut');
    if (homeBtn) {
        homeBtn.addEventListener('click', async () => {
            // Actualizar navegación activa
            const navItems = document.querySelectorAll('.nav-item[data-view]');
            navItems.forEach(item => {
                item.classList.toggle('active', item.dataset.view === 'dashboard');
            });
            await loadView('dashboard');
        });
    }
}

// ==========================================
// SIDEBAR TOGGLE
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('sidebar-toggle');
    const homeBtn = document.getElementById('home-shortcut');

    if (sidebar.classList.contains('collapsed')) {
        // Abrir sidebar
        sidebar.classList.remove('collapsed');
        document.body.classList.remove('sidebar-collapsed');
        overlay?.classList.add('active');
        toggle?.classList.add('hidden');
        homeBtn?.classList.add('hidden');
    } else {
        closeSidebar();
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('sidebar-toggle');
    const homeBtn = document.getElementById('home-shortcut');

    sidebar?.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
    overlay?.classList.remove('active');
    toggle?.classList.remove('hidden');
    homeBtn?.classList.remove('hidden');
}

// Exponer funciones globalmente
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;



// ==========================================
// LOADER (Deshabilitado para carga instantánea con caché)
// ==========================================
let loaderDisabled = true; // Deshabilitar loader global por defecto

function showAppLoader(message = 'Cargando...') {
    if (loaderDisabled || !appLoader) return;
    if (appLoaderText) appLoaderText.textContent = message;
    appLoader.classList.remove('hidden');
}

function hideAppLoader() {
    if (!appLoader) return;
    appLoader.classList.add('hidden');
}

function beginLoading(message = 'Cargando...') {
    // No mostrar loader si está deshabilitado (carga instantánea)
    if (loaderDisabled) return;
    loaderCount += 1;
    showAppLoader(message);
}

function endLoading() {
    if (loaderDisabled) return;
    loaderCount = Math.max(0, loaderCount - 1);
    if (loaderCount === 0) hideAppLoader();
}

// Habilitar loader temporalmente para operaciones específicas
function enableLoader() {
    loaderDisabled = false;
}

function disableLoader() {
    loaderDisabled = true;
    hideAppLoader();
}

// ==========================================
// SCREEN LOCKER (Pantalla de carga inicial PWA)
// ==========================================
let screenLockerRemoved = false;

function hideScreenLocker() {
    if (screenLockerRemoved) return;

    const screenLocker = document.getElementById('app-screen-locker');
    const appLayout = document.getElementById('app-layout');

    if (screenLocker) {
        screenLocker.classList.add('hiding');
        setTimeout(() => {
            screenLocker.remove();
        }, 500);
    }

    if (appLayout) {
        appLayout.style.display = '';
    }

    screenLockerRemoved = true;
}

// Exponer globalmente
window.hideScreenLocker = hideScreenLocker;

async function withLoader(message, fn) {
    // Temporalmente habilitar loader para operaciones largas explícitas
    const wasDisabled = loaderDisabled;
    loaderDisabled = false;
    beginLoading(message);
    try {
        return await fn();
    } finally {
        endLoading();
        loaderDisabled = wasDisabled;
    }
}

// ==========================================
// SISTEMA DE ALERTAS PERSONALIZADAS
// ==========================================
function createAlertContainer() {
    let container = document.getElementById('custom-alert-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-alert-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; max-width: 400px;';
        document.body.appendChild(container);
    }
    return container;
}

function createModalContainer() {
    let container = document.getElementById('custom-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-modal-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Muestra una notificación toast
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duración en ms (default 4000)
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = createAlertContainer();

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    const colors = {
        success: { bg: '#10b981', border: '#059669' },
        error: { bg: '#ef4444', border: '#dc2626' },
        warning: { bg: '#f59e0b', border: '#d97706' },
        info: { bg: '#3b82f6', border: '#2563eb' }
    };

    const color = colors[type] || colors.info;
    const icon = icons[type] || icons.info;

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.cssText = 'background: ' + color.bg + '; border-left: 4px solid ' + color.border + '; color: white; padding: 1rem 1.25rem; border-radius: 0.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 0.75rem; animation: slideInRight 0.3s ease; font-size: 0.9rem;';

    toast.innerHTML = '<i class="' + icon + '" style="font-size: 1.25rem;"></i>' +
        '<span style="flex: 1;">' + message + '</span>' +
        '<button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; padding: 0; opacity: 0.7;"><i class="fas fa-times"></i></button>';

    container.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Muestra un alert modal personalizado (reemplazo de alert())
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Título opcional
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 */
function showAlert(message, title = '', type = 'info') {
    return new Promise(resolve => {
        const container = createModalContainer();

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const color = colors[type] || colors.info;
        const icon = icons[type] || icons.info;
        const displayTitle = title || (type === 'error' ? 'Error' : type === 'warning' ? 'Atención' : type === 'success' ? '¡Éxito!' : 'Información');
        const isHtmlMessage = typeof message === 'string' && /<[^>]+>/.test(message);
        const messageBlock = isHtmlMessage
            ? '<div style="color: #d5e0ee; font-size: 0.95rem; line-height: 1.55; margin-bottom: 1.5rem; text-align: left;">' + message + '</div>'
            : '<p style="color: #d5e0ee; font-size: 0.95rem; line-height: 1.55; margin-bottom: 1.5rem;">' + message + '</p>';

        const modal = document.createElement('div');
        modal.className = 'custom-alert-modal';
        modal.style.cssText = 'position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; background: rgba(3,7,18,0.68); backdrop-filter: blur(6px); animation: fadeIn 0.2s ease;';

        modal.innerHTML = '<div style="background: linear-gradient(145deg, #1b2633 0%, #202f40 100%); border: 1px solid rgba(148,163,184,0.28); border-radius: 1rem; padding: 2rem; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 25px 55px rgba(2,6,12,0.6); animation: scaleIn 0.2s ease;">' +
            '<div style="width: 60px; height: 60px; border-radius: 50%; background: ' + color + '20; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">' +
            '<i class="' + icon + '" style="font-size: 1.75rem; color: ' + color + ';"></i>' +
            '</div>' +
            '<h3 style="color: #f3f8ff; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">' + displayTitle + '</h3>' +
            messageBlock +
            '<button class="custom-alert-btn" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none; padding: 0.75rem 2rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.95rem; box-shadow: 0 4px 12px rgba(11, 78, 50, 0.3);">Aceptar</button>' +
            '</div>';

        const closeModal = () => {
            modal.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => {
                modal.remove();
                resolve();
            }, 200);
        };

        modal.querySelector('.custom-alert-btn').onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        container.appendChild(modal);
        modal.querySelector('.custom-alert-btn').focus();
    });
}

/**
 * Muestra un confirm modal personalizado (reemplazo de confirm())
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Título opcional
 * @param {object} options - Opciones adicionales
 */
function showConfirm(message, title = '¿Confirmar acción?', options = {}) {
    return new Promise(resolve => {
        const container = createModalContainer();

        const confirmText = options.confirmText || 'Confirmar';
        const cancelText = options.cancelText || 'Cancelar';
        const type = options.type || 'warning';

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-question-circle',
            danger: 'fas fa-exclamation-circle'
        };

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6',
            danger: '#ef4444'
        };

        const color = colors[type] || colors.warning;
        const icon = icons[type] || icons.warning;
        const isHtmlMessage = typeof message === 'string' && /<[^>]+>/.test(message);
        const messageBlock = isHtmlMessage
            ? '<div style="color: #d5e0ee; font-size: 0.95rem; line-height: 1.55; margin-bottom: 1.5rem; text-align: left;">' +
                message +
              '</div>'
            : '<p style="color: #d5e0ee; font-size: 0.95rem; line-height: 1.55; margin-bottom: 1.5rem;">' + message + '</p>';

        const modal = document.createElement('div');
        modal.className = 'custom-confirm-modal';
        modal.style.cssText = 'position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; background: rgba(3,7,18,0.68); backdrop-filter: blur(6px); animation: fadeIn 0.2s ease;';

        modal.innerHTML = '<div style="background: linear-gradient(145deg, #1b2633 0%, #202f40 100%); border: 1px solid rgba(148,163,184,0.28); border-radius: 1rem; padding: 2rem; max-width: 420px; width: 90%; text-align: center; box-shadow: 0 25px 55px rgba(2, 6, 12, 0.6); animation: scaleIn 0.2s ease;">' +
            '<div style="width: 60px; height: 60px; border-radius: 50%; background: ' + color + '20; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">' +
            '<i class="' + icon + '" style="font-size: 1.75rem; color: ' + color + ';"></i>' +
            '</div>' +
            '<h3 style="color: #f3f8ff; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">' + title + '</h3>' +
            messageBlock +
            '<div style="display: flex; gap: 0.75rem; justify-content: center;">' +
            '<button class="custom-cancel-btn" style="background: #2a3748; color: #e3ebf6; border: 1px solid rgba(148, 163, 184, 0.35); padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.95rem;">' + cancelText + '</button>' +
            '<button class="custom-confirm-btn" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.95rem; box-shadow: 0 4px 12px rgba(11, 78, 50, 0.3);">' + confirmText + '</button>' +
            '</div>' +
            '</div>';

        const closeModal = (result) => {
            // Deshabilitar botones para evitar clics extra durante la animación
            modal.querySelectorAll('button').forEach(btn => btn.disabled = true);
            
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            
            // También animar el contenido para que no se vea el "salto"
            const content = modal.querySelector('div');
            if (content) content.style.animation = 'scaleOut 0.2s ease forwards';

            setTimeout(() => {
                modal.remove();
                // Si el contenedor está vacío, lo quitamos
                if (container && container.childNodes.length === 0) {
                    container.remove();
                }
                resolve(result);
            }, 180); // Un pelín antes que la animación para suavidad
        };

        modal.querySelector('.custom-confirm-btn').onclick = () => closeModal(true);
        modal.querySelector('.custom-cancel-btn').onclick = () => closeModal(false);

        container.appendChild(modal);
        modal.querySelector('.custom-confirm-btn').focus();
    });
}

// Exponer globalmente
window.showToast = showToast;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.enableLoader = enableLoader;
window.disableLoader = disableLoader;
window.showLoader = showAppLoader; // Fix for external modules
window.hideLoader = hideAppLoader; // Fix for external modules

function syncAppVersionLabels(root = document) {
    const version = window.APP_VERSION || 'v1.0';
    if (!root) return;
    root.querySelectorAll('[data-app-version]').forEach((el) => {
        el.textContent = version;
    });
}

// ==========================================
// CARGA DE VISTAS
// ==========================================
let isViewLoading = false;
let pendingViewName = null;

async function loadView(viewName, shouldPushState = true) {
    if (!mainContent) mainContent = document.getElementById('main-content');
    if (!homeShortcut) homeShortcut = document.getElementById('home-shortcut');

    // 1. Actualizar URL y Título INMEDIATAMENTE para sensación de rapidez
    // Usamos la ruta base absoluta de la carpeta actual para evitar anidamientos extraños
    const basePath = window.location.pathname.includes('index.html') ? 'index.html' : './';
    const url = viewName === 'dashboard' ? basePath : `${basePath}?view=${viewName}`;
    const viewTitle = viewName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    document.title = `INKA CORP - ${viewTitle === 'Dashboard' ? 'Panel' : viewTitle}`;

    if (shouldPushState) {
        const currentSearch = window.location.search;
        const isCorrectUrl = currentSearch === `?view=${viewName}` || (viewName === 'dashboard' && !currentSearch);
        
        // Si la URL actual tiene algo como 'creditos.html', forzamos limpieza a la raíz
        if (!isCorrectUrl || window.location.pathname.endsWith('.html') && !window.location.pathname.endsWith('index.html')) {
            history.pushState({ view: viewName }, '', url);
        }
    } else {
        // En sincronización (shouldPushState = false), aseguramos que el estado y la URL coincidan
        history.replaceState({ view: viewName }, '', url);
    }

    // Togle mostrar shortcut de inicio (ocultar en dashboard)
    if (homeShortcut) {
        if (viewName === 'dashboard') {
            homeShortcut.classList.add('hidden');
        } else {
            homeShortcut.classList.remove('hidden');
        }
    }

    // Si ya estamos cargando ESTA misma vista, no hacer nada
    if (isViewLoading && pendingViewName === viewName) return;

    // Caso especial para la Agenda (es un modal)
    if (viewName === 'agenda') {
        // Si el contenido principal está vacío (ej. carga inicial), cargamos dashboard de fondo
        if (mainContent && (mainContent.innerHTML === '' || currentViewName === null)) {
            fetch('views/dashboard.html')
                .then(response => response.ok ? response.text() : '')
                .then(html => {
                    if (html && mainContent) {
                        mainContent.innerHTML = html;
                        syncAppVersionLabels(mainContent);
                        if (typeof initDashboardView === 'function') initDashboardView();
                    }
                })
                .catch(err => console.warn('No se pudo cargar el fondo para la agenda:', err));
        }

        if (typeof openAgendaModal === 'function') {
            openAgendaModal();
        }

        currentViewName = 'agenda';
        pendingViewName = null;
        isViewLoading = false;
        hideAppLoader();
        
        // Sincronizar URL si es necesario
        if (window.location.search !== `?view=agenda`) {
            history.replaceState({ view: 'agenda' }, '', url);
        }
        return;
    }

    // Para el resto de vistas, si ya es la actual, no re-cargar
    if (currentViewName === viewName) return;

    isViewLoading = true;
    pendingViewName = viewName;
    
    try {
        // Limpiar contenido inmediatamente para dar feedback de que algo está pasando
        if (mainContent) mainContent.innerHTML = '';

        // 1. Limpiar recursos de la vista anterior
        if (typeof cleanupStickyHeaders === 'function') cleanupStickyHeaders();
        if (typeof cleanupAhorrosStickyHeaders === 'function') cleanupAhorrosStickyHeaders();
        if (typeof cleanupPolizasModule === 'function') cleanupPolizasModule();
        
        // Cerrar modal de agenda si estuviéramos navegando a otra vista
        if (typeof closeAgendaModal === 'function') closeAgendaModal();

        // 2. Cargar HTML de la vista
        const response = await fetch(`views/${viewName}.html`);
        
        if (!response.ok) {
            console.warn(`Vista "${viewName}" no encontrada. Redirigiendo a dashboard.`);
            // Si la vista no existe, evitar bucle infinito y forzar dashboard
            if (viewName !== 'dashboard') {
                isViewLoading = false;
                loadView('dashboard', true);
            }
            return;
        }
        
        const html = await response.text();

        if (mainContent) {
            mainContent.innerHTML = html;
            syncAppVersionLabels(mainContent);
        }

        // 4. Inicializar módulo
        switch (viewName) {
            case 'dashboard':
                await initDashboardView();
                break;
            case 'socios':
                if (typeof initSociosModule === 'function') await initSociosModule();
                break;
            case 'socios_edit':
                if (typeof initSociosEditModule === 'function') await initSociosEditModule();
                break;
            case 'solicitud_credito':
                if (typeof initSolicitudCreditoModule === 'function') await initSolicitudCreditoModule();

                const mobileCreditId = sessionStorage.getItem('mobile_generate_docs_credit_id');
                if (mobileCreditId && typeof window.abrirModalDocumentosCredito === 'function') {
                    sessionStorage.removeItem('mobile_generate_docs_credit_id');
                    setTimeout(() => {
                        window.abrirModalDocumentosCredito(mobileCreditId);
                    }, 250);
                }
                break;
            case 'creditos':
                if (typeof initCreditosModule === 'function') await initCreditosModule();
                break;
            case 'creditos_preferenciales':
                if (typeof initCreditosPreferencialesModule === 'function') await initCreditosPreferencialesModule();
                break;
            case 'precancelaciones':
                if (typeof initPrecancelacionesModule === 'function') await initPrecancelacionesModule();
                break;
            case 'resumen_general':
                if (typeof initResumenGeneralModule === 'function') await initResumenGeneralModule();
                break;
            case 'ahorros':
                if (typeof initAhorrosModule === 'function') await initAhorrosModule();
                break;
            case 'polizas':
                if (typeof initPolizasModule === 'function') await initPolizasModule();
                break;
            case 'simulador':
                if (typeof initSimuladorModule === 'function') await initSimuladorModule();
                break;
            case 'aportes':
                if (typeof initAportesModule === 'function') await initAportesModule();
                break;
            case 'bancos':
                if (typeof initBancosModule === 'function') await initBancosModule();
                break;
            case 'administrativos':
                if (typeof initAdministrativosModule === 'function') await initAdministrativosModule();
                break;
            case 'contratos':
                if (typeof initContratosModule === 'function') await initContratosModule();
                break;
            case 'caja':
                if (typeof initCajaModule === 'function') await initCajaModule();
                break;
        }

        currentViewName = viewName;
        pendingViewName = null;
        isViewLoading = false;

        // Validaciones post-carga
        await checkCajaStatusGlobal();

        hideAppLoader();

        // Ocultar el Screen Locker de carga inicial si aún está visible
        if (typeof hideScreenLocker === 'function') {
            hideScreenLocker();
        }

    } catch (error) {
        hideAppLoader();
        isViewLoading = false;
        pendingViewName = null;
        console.error('Error loading view:', error);
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="content-wrapper">
                    <div class="error-container" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--error); margin-bottom: 1rem;"></i>
                        <h2 style="color: var(--white); margin-bottom: 0.5rem;">Error al cargar el módulo</h2>
                        <p style="color: var(--gray-400);">${error.message}</p>
                        <button class="btn btn-primary mt-4" onclick="loadView('dashboard')">
                            <i class="fas fa-home"></i> Volver al inicio
                        </button>
                    </div>
                </div>
            `;
        }
    }
}

// ==========================================
// DASHBOARD VIEW
// ==========================================
async function initDashboardView() {
    // Ocultar screen locker y mostrar app-layout (solo en la primera carga)
    hideScreenLocker();
    // Event listeners para las cards de módulos
    const moduleCards = document.querySelectorAll('.module-card[data-view]');
    moduleCards.forEach(card => {
        card.addEventListener('click', async () => {
            const view = card.dataset.view;

            // Actualizar navegación activa
            const navItems = document.querySelectorAll('.nav-item[data-view]');
            navItems.forEach(item => {
                item.classList.toggle('active', item.dataset.view === view);
            });

            await loadView(view);
        });
    });

    // Actualizar saludo
    updateDashboardGreeting();

    // Cargar estadísticas con un timeout para no bloquear indefinidamente
    try {
        await Promise.race([
            loadDashboardStats(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout cargando stats')), 10000))
        ]);
    } catch (err) {
        console.warn('Dashboard stats tardaron demasiado o fallaron:', err);
    }
}

// Actualizar saludo del dashboard
function updateDashboardGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Buenos días';

    if (hour >= 12 && hour < 18) {
        greeting = 'Buenas tardes';
    } else if (hour >= 18 || hour < 6) {
        greeting = 'Buenas noches';
    }

    const userName = currentUser?.nombre?.split(' ')[0] || 'Usuario';
    const greetingEl = document.getElementById('dashboard-greeting');
    if (greetingEl) {
        greetingEl.innerHTML = `${greeting}, <span class="text-gold">${userName}</span>`;
    }
}

// Cargar estadísticas del dashboard
async function loadDashboardStats() {
    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        // 1. Cargar Stats Básicas en Paralelo (Socios y Créditos)
        const [resSocios, resCreditos] = await Promise.all([
            supabase.from('ic_socios').select('idsocio', { count: 'exact' }).limit(1),
            supabase.from('ic_creditos').select('id_credito, capital, estado_credito')
        ]);

        // Procesar Socios
        if (!resSocios.error) {
            const totalSocios = resSocios.count || 0;
            const elSocios = document.getElementById('dash-total-socios');
            if (elSocios) elSocios.textContent = totalSocios;
        }

        // Procesar Créditos
        if (!resCreditos.error && resCreditos.data) {
            const creditos = resCreditos.data;
            // Excluir créditos PAUSADOS - no cuentan como morosos ni activos
            const creditosSinPausados = creditos.filter(c => c.estado_credito !== 'PAUSADO');
            const activos = creditosSinPausados.filter(c => c.estado_credito === 'ACTIVO');
            const morosos = creditosSinPausados.filter(c => c.estado_credito === 'MOROSO');
            const totalActivos = activos.length + morosos.length;

            const elActivos = document.getElementById('dash-creditos-activos');
            if (elActivos) elActivos.textContent = totalActivos;

            const porcentajeMora = totalActivos > 0 ? Math.round((morosos.length / totalActivos) * 100) : 0;
            const elMora = document.getElementById('dash-porcentaje-mora');
            if (elMora) elMora.textContent = `${porcentajeMora}%`;

            const cartera = creditosSinPausados
                .filter(c => c.estado_credito === 'ACTIVO' || c.estado_credito === 'MOROSO')
                .reduce((sum, c) => sum + parseFloat(c.capital || 0), 0);

            const elCartera = document.getElementById('dash-cartera-total');
            if (elCartera) elCartera.textContent = '$' + cartera.toLocaleString('es-EC', { minimumFractionDigits: 2 });
        }

        // 2. Cargar socios morosos (Prioridad alta, usa caché)
        await loadSociosMorosos();

        // 3. Cargar alertas dinámicas
        await loadDashboardPriorityAlerts();

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

/**
 * Función encargada de coordinar las alertas dinámicas (Desembolsos y Pólizas)
 * Muestra un skeleton mientras ambas terminan de cargar para evitar saltos visuales.
 */
async function loadDashboardPriorityAlerts() {
    const skeleton = document.getElementById('priority-alerts-skeleton');

    try {
        // Ejecutar las dos peticiones en paralelo para mayor velocidad
        await Promise.all([
            loadDesembolsosPendientes(),
            loadPolizasVencimientoDashboard()
        ]);
    } catch (err) {
        console.error('Error en alertas prioritarias:', err);
    } finally {
        // Al terminar (con éxito o error), ocultamos el skeleton
        if (skeleton) {
            skeleton.style.display = 'none';
        }
    }
}

// Cargar socios morosos para el dashboard (con caché)
async function loadSociosMorosos() {
    const container = document.getElementById('socios-morosos-list');
    const countBadge = document.getElementById('morosos-count');
    if (!container) return;

    // Verificar si hay caché válido de morosos
    const CACHE_KEY = 'morosos';
    const cacheIsValid = window.isCacheValid && window.isCacheValid(CACHE_KEY) && window.dataCache?.morosos?.length;

    // Si hay caché válido, renderizar inmediatamente
    if (cacheIsValid) {
        renderMorososDashboard(window.dataCache.morosos, container, countBadge);

        // Actualizar en segundo plano
        setTimeout(() => {
            fetchMorososFromDB(container, countBadge, true);
        }, 100);
        return;
    }

    // Si no hay caché, cargar desde DB
    await fetchMorososFromDB(container, countBadge, false);
}

// Función para obtener morosos desde la base de datos
async function fetchMorososFromDB(container, countBadge, isBackgroundUpdate) {
    try {
        const supabase = window.getSupabaseClient();

        // Obtener cuotas vencidas con información del crédito y socio
        const { data: cuotasVencidas, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select(`
                numero_cuota,
                fecha_vencimiento,
                cuota_total,
                estado_cuota,
                credito:ic_creditos (
                    id_credito,
                    capital,
                    estado_credito,
                    socio:ic_socios (
                        idsocio,
                        nombre,
                        cedula,
                        paisresidencia
                    )
                )
            `)
            .eq('estado_cuota', 'VENCIDO')
            .order('fecha_vencimiento', { ascending: true });

        if (error) {
            console.error('Error en query morosos:', error);
            throw error;
        }

        if (!cuotasVencidas || cuotasVencidas.length === 0) {
            // Guardar en caché que no hay morosos
            if (window.dataCache) {
                window.dataCache.morosos = [];
                if (!window.dataCache.lastUpdate) window.dataCache.lastUpdate = {};
                window.dataCache.lastUpdate.morosos = Date.now();
                if (window.saveCacheToDisk) window.saveCacheToDisk();
            }

            if (!isBackgroundUpdate) {
                container.innerHTML = `
                    <div class="activity-empty">
                        <i class="fas fa-check-circle" style="color: #34d399;"></i>
                        <p>No hay socios en mora</p>
                    </div>
                `;
                if (countBadge) countBadge.textContent = '0';
            }
            return;
        }

        // Agrupar por socio y calcular el total vencido y días de mora
        const morososMap = new Map();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        cuotasVencidas.forEach(cuota => {
            if (!cuota.credito || !cuota.credito.socio) return;

            // Solo considerar créditos ACTIVOS o que ya están marcados como MOROSO
            // Excluir PAUSADOS, CANCELADOS o PRECANCELADOS del dashboard de mora
            const estadosPermitidos = ['ACTIVO', 'MOROSO'];
            if (!estadosPermitidos.includes(cuota.credito.estado_credito)) return;

            const socioId = cuota.credito.socio.idsocio;
            const fechaVencimiento = parseDate(cuota.fecha_vencimiento);
            const diasVencido = Math.floor((hoy - fechaVencimiento) / (1000 * 60 * 60 * 24));

            if (morososMap.has(socioId)) {
                const moroso = morososMap.get(socioId);
                moroso.montoVencido += parseFloat(cuota.cuota_total);
                moroso.cuotasVencidas++;
                if (diasVencido > moroso.diasMora) {
                    moroso.diasMora = diasVencido;
                }
            } else {
                morososMap.set(socioId, {
                    socioId: socioId,
                    nombre: cuota.credito.socio.nombre,
                    cedula: cuota.credito.socio.cedula,
                    pais: cuota.credito.socio.paisresidencia || 'desconocido',
                    montoVencido: parseFloat(cuota.cuota_total),
                    cuotasVencidas: 1,
                    diasMora: diasVencido > 0 ? diasVencido : 0,
                    creditoId: cuota.credito.id_credito
                });
            }
        });

        // Convertir a array y ordenar por días de mora (más antiguo primero)
        const morosos = Array.from(morososMap.values())
            .sort((a, b) => b.diasMora - a.diasMora);

        // Guardar en caché
        if (window.dataCache) {
            window.dataCache.morosos = morosos;
            if (!window.dataCache.lastUpdate) window.dataCache.lastUpdate = {};
            window.dataCache.lastUpdate.morosos = Date.now();
            if (window.saveCacheToDisk) window.saveCacheToDisk();
        }

        // Renderizar
        renderMorososDashboard(morosos, container, countBadge);

    } catch (error) {
        console.error('Error cargando socios morosos:', error);
        if (!isBackgroundUpdate) {
            container.innerHTML = `
                <div class="activity-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar datos</p>
                </div>
            `;
        }
    }
}

// Actualizar layout de alertas prioritarias (Dashboard)
function updatePriorityAlertsLayout() {
    const layout = document.querySelector('.priority-alerts-layout');
    if (!layout) return;

    // Obtener las secciones de alerta (Desembolsos y Pólizas)
    const sections = layout.querySelectorAll('.desembolsos-section');

    sections.forEach(section => {
        if (section.classList.contains('hidden')) return;

        // Contamos cuántas cards hay dentro
        const list = section.querySelector('.desembolsos-list');
        const cards = list ? list.querySelectorAll('.desembolso-card') : [];
        const count = cards.length;

        // Limpiar clases previas
        section.classList.remove('width-50', 'width-100');

        // Aplicar ancho según cantidad de elementos de SU categoría
        if (count === 1) {
            section.classList.add('width-50');
        } else if (count >= 2) {
            section.classList.add('width-100');
        }
    });
}

// Cargar pólizas por vencer para el dashboard
async function loadPolizasVencimientoDashboard() {
    const section = document.getElementById('polizas-vencimiento-section');
    const container = document.getElementById('polizas-vencimiento-list');
    const countBadge = document.getElementById('polizas-vencimiento-count');

    if (!container || !section) return;

    try {
        const supabase = window.getSupabaseClient();

        // Obtener la fecha de hoy, y el rango de +-3 días solicitado por el usuario
        const today = new Date();

        const startDate = new Date();
        startDate.setDate(today.getDate() - 3);

        const endDate = new Date();
        endDate.setDate(today.getDate() + 3);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        // NOTA: Columnas según schemas.txt (ic_polizas)
        const { data: polizas, error } = await supabase
            .from('ic_polizas')
            .select(`
                id_poliza,
                valor,
                valor_final,
                interes,
                fecha_vencimiento,
                estado,
                id_socio
            `)
            .eq('estado', 'ACTIVO')
            .gte('fecha_vencimiento', startStr)
            .lte('fecha_vencimiento', endStr)
            .order('fecha_vencimiento', { ascending: true });

        if (error) {
            console.error('Error cargando pólizas por vencer:', error);
            updatePriorityAlertsLayout();
            return;
        }

        if (!polizas || polizas.length === 0) {
            section.classList.add('hidden');
            updatePriorityAlertsLayout();
            return;
        }

        // Cargar datos de socios relacionados
        const socioIds = [...new Set(polizas.map(p => p.id_socio))];
        const { data: socios } = await supabase
            .from('ic_socios')
            .select('idsocio, nombre, cedula')
            .in('idsocio', socioIds);

        // Mapear socios
        polizas.forEach(poliza => {
            poliza.socio = socios?.find(s => s.idsocio === poliza.id_socio) || {};
        });

        section.classList.remove('hidden');
        if (countBadge) countBadge.textContent = polizas.length;

        // Renderizar
        container.innerHTML = polizas.map(poliza => {
            const socio = poliza.socio || {};
            const montoFormatted = parseFloat(poliza.valor).toLocaleString('es-EC', { minimumFractionDigits: 2 });
            const interesCalculado = parseFloat(poliza.valor_final || 0) - parseFloat(poliza.valor || 0);
            const interesFormatted = (interesCalculado > 0 ? interesCalculado : 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });

            // Calcular días restantes (normalizado a medianoche para evitar problemas de horas)
            const hoyMedianoche = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const vencParts = poliza.fecha_vencimiento.split('-');
            const fechaVenc = new Date(parseInt(vencParts[0]), parseInt(vencParts[1]) - 1, parseInt(vencParts[2]));
            const diffTime = fechaVenc - hoyMedianoche;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            let colorStyle = 'color: #ef4444; background: rgba(239, 68, 68, 0.1); font-weight: bold;'; // Danger por defecto
            let labelVence = 'Vence en';
            let textoDias = '';

            if (diffDays === 0) {
                textoDias = 'HOY';
            } else if (diffDays > 0) {
                textoDias = `${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
            } else {
                labelVence = 'Vencida hace';
                textoDias = `${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'día' : 'días'}`;
                colorStyle = 'color: white; background: #ef4444; font-weight: bold;'; // Fondo sólido para vencidas
            }

            const codigoCorto = poliza.id_poliza.substring(0, 8).toUpperCase();

            return `
                <div class="desembolso-card" onclick="loadView('polizas')" style="cursor: pointer;">
                    <div class="desembolso-header">
                        <div class="desembolso-socio">
                            <div class="desembolso-nombre">${socio.nombre || 'Desconocido'}</div>
                            <div class="desembolso-cedula">${socio.cedula || ''} | POL-${codigoCorto}</div>
                        </div>
                        <div class="desembolso-monto">
                            <div class="desembolso-monto-valor">$${montoFormatted}</div>
                            <div class="desembolso-monto-label">Inversión</div>
                        </div>
                    </div>
                    <div class="desembolso-info">
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">${labelVence}</span>
                            <span class="desembolso-info-value" style="padding: 2px 8px; border-radius: 6px; ${colorStyle}">
                                ${textoDias} (${poliza.fecha_vencimiento})
                            </span>
                        </div>
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Ganancia Est.</span>
                            <span class="desembolso-info-value">$${interesFormatted}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        updatePriorityAlertsLayout();

    } catch (error) {
        console.error('Error en loadPolizasVencimientoDashboard:', error);
    }
}

// Cargar desembolsos pendientes para el dashboard
async function loadDesembolsosPendientes() {
    const section = document.getElementById('desembolsos-pendientes-section');
    const container = document.getElementById('desembolsos-pendientes-list');
    const countBadge = document.getElementById('desembolsos-count');

    if (!container || !section) return;

    try {
        const supabase = window.getSupabaseClient();

        // Obtener créditos en estado PENDIENTE (colocados pero no desembolsados)
        const { data: creditosPendientes, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito,
                codigo_credito,
                capital,
                plazo,
                cuota_con_ahorro,
                tasa_interes_mensual,
                fecha_desembolso,
                garante,
                created_at,
                id_socio
            `)
            .eq('estado_credito', 'PENDIENTE')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error cargando desembolsos pendientes:', error);
            return;
        }

        // Mostrar u ocultar sección según haya datos
        if (!creditosPendientes || creditosPendientes.length === 0) {
            section.classList.add('hidden');
            updatePriorityAlertsLayout();
            return;
        }

        // Cargar datos de socios relacionados
        const socioIds = [...new Set(creditosPendientes.map(c => c.id_socio))];
        const { data: socios } = await supabase
            .from('ic_socios')
            .select('idsocio, nombre, cedula, whatsapp')
            .in('idsocio', socioIds);

        // Mapear socios a créditos
        creditosPendientes.forEach(credito => {
            credito.socio = socios?.find(s => s.idsocio === credito.id_socio) || {};
        });

        section.classList.remove('hidden');
        if (countBadge) countBadge.textContent = creditosPendientes.length;

        // Renderizar cards de desembolsos
        container.innerHTML = creditosPendientes.map(credito => {
            const socio = credito.socio || {};
            const nombreCompleto = socio.nombre || 'Sin nombre';
            const capitalFormatted = parseFloat(credito.capital).toLocaleString('es-EC', { minimumFractionDigits: 2 });
            const cuotaFormatted = parseFloat(credito.cuota_con_ahorro).toLocaleString('es-EC', { minimumFractionDigits: 2 });

            return `
                <div class="desembolso-card" data-id="${credito.id_credito}">
                    <div class="desembolso-header">
                        <div class="desembolso-socio">
                            <div class="desembolso-nombre">${nombreCompleto}</div>
                            <div class="desembolso-cedula">${socio.cedula || '-'} | ${credito.codigo_credito}</div>
                        </div>
                        <div class="desembolso-monto">
                            <div class="desembolso-monto-valor">$${capitalFormatted}</div>
                            <div class="desembolso-monto-label">Capital</div>
                        </div>
                    </div>
                    <div class="desembolso-info">
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Plazo</span>
                            <span class="desembolso-info-value">${credito.plazo} meses</span>
                        </div>
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Cuota</span>
                            <span class="desembolso-info-value">$${cuotaFormatted}</span>
                        </div>
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Tasa</span>
                            <span class="desembolso-info-value">${credito.tasa_interes_mensual}%</span>
                        </div>
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Garante</span>
                            <span class="desembolso-info-value">${credito.garante ? 'Sí' : 'No'}</span>
                        </div>
                    </div>
                    <div class="desembolso-actions">
                        <button class="desembolso-btn desembolso-btn-docs" onclick="event.stopPropagation(); abrirModalDocumentosCredito('${credito.id_credito}')">
                            <i class="fas fa-file-pdf"></i> Documentos
                        </button>
                        <button class="desembolso-btn desembolso-btn-desembolsar" onclick="event.stopPropagation(); desembolsarCredito('${credito.id_credito}')">
                            <i class="fas fa-money-bill-wave"></i> Desembolsar
                        </button>
                        <button class="desembolso-btn-anular" onclick="event.stopPropagation(); anularCreditoColocado('${credito.id_credito}', '${credito.codigo_credito}')" title="Anular Crédito">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        updatePriorityAlertsLayout();

    } catch (error) {
        console.error('Error loading desembolsos pendientes:', error);
    }
}

// Función para renderizar morosos en el dashboard
function renderMorososDashboard(morosos, container, countBadge) {
    if (!morosos || morosos.length === 0) {
        container.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-check-circle" style="color: #34d399;"></i>
                <p>No hay socios en mora</p>
            </div>
        `;
        if (countBadge) countBadge.textContent = '0';
        return;
    }

    if (countBadge) countBadge.textContent = morosos.length;

    // Actualizar el indicador de cantidad en mora en las stats
    const cantidadMoraEl = document.getElementById('dash-cantidad-mora');
    if (cantidadMoraEl) {
        cantidadMoraEl.textContent = morosos.length;
    }

    // Función para obtener iniciales
    const getInitials = (nombre) => {
        if (!nombre) return '??';
        const parts = nombre.trim().split(' ').filter(p => p.length > 0);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return parts[0] ? parts[0].substring(0, 2).toUpperCase() : '??';
    };

    // Función para obtener color dinámico basado en días de mora
    const getMoraColor = (dias) => {
        const maxDias = 90;
        const porcentaje = Math.min(dias / maxDias, 1);
        const r = Math.round(255 - (porcentaje * 55));
        const g = Math.round(180 - (porcentaje * 150));
        const b = Math.round(100 - (porcentaje * 70));
        return `rgb(${r}, ${g}, ${b})`;
    };

    // Función para obtener bandera de país
    const getPaisFlag = (pais) => {
        if (!pais) return '';
        const paisLower = pais.toLowerCase();
        const flags = {
            'ecuador': 'https://flagcdn.com/w20/ec.png',
            'colombia': 'https://flagcdn.com/w20/co.png',
            'peru': 'https://flagcdn.com/w20/pe.png',
            'perú': 'https://flagcdn.com/w20/pe.png',
            'venezuela': 'https://flagcdn.com/w20/ve.png',
            'estados unidos': 'https://flagcdn.com/w20/us.png',
            'usa': 'https://flagcdn.com/w20/us.png',
            'españa': 'https://flagcdn.com/w20/es.png',
            'mexico': 'https://flagcdn.com/w20/mx.png',
            'méxico': 'https://flagcdn.com/w20/mx.png'
        };
        return flags[paisLower] || '';
    };

    // Agrupar morosos por país
    const morososPorPais = {};
    morosos.forEach(moroso => {
        const pais = (moroso.pais || 'Sin país').toUpperCase();
        if (!morososPorPais[pais]) {
            morososPorPais[pais] = [];
        }
        morososPorPais[pais].push(moroso);
    });

    // Ordenar países por el socio con más días de mora
    const paisesOrdenados = Object.keys(morososPorPais).sort((a, b) => {
        const maxDiasA = Math.max(...morososPorPais[a].map(m => m.diasMora));
        const maxDiasB = Math.max(...morososPorPais[b].map(m => m.diasMora));
        return maxDiasB - maxDiasA;
    });

    // Renderizar lista de morosos agrupados por país
    let html = '';
    paisesOrdenados.forEach(pais => {
        const morosDelPais = morososPorPais[pais];
        const flagUrl = getPaisFlag(pais);
        const flagImg = flagUrl ? `<img src="${flagUrl}" alt="" class="pais-flag-mini">` : '';

        html += `
            <div class="morosos-pais-group">
                <div class="morosos-pais-header">
                    ${flagImg}
                    <span class="pais-nombre">${pais}</span>
                    <span class="pais-count">${morosDelPais.length}</span>
                </div>
                ${morosDelPais.slice(0, 5).map(moroso => {
            const moraColor = getMoraColor(moroso.diasMora);

            return `
                        <div class="moroso-item" data-socio-id="${moroso.socioId}" onclick="navigateToCredito('${moroso.creditoId}')" style="border-left: 3px solid ${moraColor};">
                            <div class="moroso-avatar" style="background: linear-gradient(135deg, ${moraColor} 0%, rgba(220,38,38,0.8) 100%);">${getInitials(moroso.nombre)}</div>
                            <div class="moroso-info">
                                <div class="moroso-nombre">${moroso.nombre}</div>
                                <div class="moroso-credito">${moroso.cuotasVencidas} cuota${moroso.cuotasVencidas > 1 ? 's' : ''} vencida${moroso.cuotasVencidas > 1 ? 's' : ''}</div>
                            </div>
                            <div class="moroso-stats">
                                <div class="moroso-monto">$${moroso.montoVencido.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</div>
                                <div class="moroso-dias" style="background: ${moraColor}; color: white;">
                                    ${moroso.diasMora} día${moroso.diasMora !== 1 ? 's' : ''}
                                </div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    });

    container.innerHTML = html;
}

// Navegar a un socio específico desde el dashboard
function navigateToSocio(socioId) {
    loadView('socios');
    sessionStorage.setItem('showSocioDetails', socioId);
}
window.navigateToSocio = navigateToSocio;

// Navegar a un crédito específico desde el dashboard
function navigateToCredito(creditoId) {
    loadView('creditos');
    sessionStorage.setItem('showCreditoDetails', creditoId);
}
window.navigateToCredito = navigateToCredito;

// Cargar próximos vencimientos (legacy - mantenido por compatibilidad)
async function loadProximosVencimientos() {
    const container = document.getElementById('proximos-vencimientos');
    if (!container) return;

    try {
        const supabase = window.getSupabaseClient();
        const en7dias = toISODate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

        const { data: cuotas } = await supabase
            .from('ic_creditos_amortizacion')
            .select(`
                *,
                credito:ic_creditos!id_credito (
                    codigo_credito,
                    socio:ic_socios!id_socio (nombre)
                )
            `)
            .in('estado_cuota', ['PENDIENTE', 'VENCIDO'])
            .lte('fecha_vencimiento', en7dias)
            .order('fecha_vencimiento', { ascending: true })
            .limit(5);

        if (!cuotas || cuotas.length === 0) {
            container.innerHTML = `
                <div class="activity-empty">
                    <i class="fas fa-calendar-check"></i>
                    <p>No hay vencimientos próximos</p>
                </div>
            `;
            return;
        }

        container.innerHTML = cuotas.map(cuota => {
            const fechaVenc = parseDate(cuota.fecha_vencimiento);
            const hoyDate = new Date();
            const diasDiff = Math.ceil((fechaVenc - hoyDate) / (1000 * 60 * 60 * 24));
            let iconClass = 'warning';
            let fechaText = '';

            if (diasDiff < 0) {
                iconClass = 'danger';
                fechaText = `Vencido hace ${Math.abs(diasDiff)} días`;
            } else if (diasDiff === 0) {
                iconClass = 'danger';
                fechaText = 'Vence hoy';
            } else if (diasDiff <= 3) {
                iconClass = 'warning';
                fechaText = `Vence en ${diasDiff} días`;
            } else {
                iconClass = 'success';
                fechaText = fechaVenc.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
            }

            return `
                <div class="activity-item">
                    <div class="activity-icon ${iconClass}">
                        <i class="fas fa-calendar-day"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">${cuota.credito?.codigo_credito || 'N/A'} - Cuota #${cuota.numero_cuota}</div>
                        <div class="activity-subtitle">${cuota.credito?.socio?.nombre || 'Sin nombre'}</div>
                    </div>
                    <div class="activity-date">
                        <div style="font-weight: 600; color: var(--${iconClass === 'danger' ? 'error-light' : iconClass === 'warning' ? 'warning-light' : 'success-light'});">
                            $${parseFloat(cuota.cuota_total).toFixed(2)}
                        </div>
                        <div>${fechaText}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading vencimientos:', error);
        container.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error al cargar vencimientos</p>
            </div>
        `;
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(value) {
    const num = Number(value || 0);
    return num.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parsea una fecha asegurando que los strings YYYY-MM-DD se interpreten en la zona horaria de Ecuador
 * @param {string|Date} dateInput 
 * @returns {Date|null}
 */
function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;

    try {
        let dateStr = String(dateInput).trim();

        // Formato de fecha de base de datos (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const parts = dateStr.split('-');
            // Medianoche local evita problemas de zona horaria con fechas "lógicas"
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }

        // Formato ISO extendido de base de datos o con hora (YYYY-MM-DD ...)
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            // Si tiene hora, intentamos parsear como ISO para preservar la precisión
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) return d;
            
            // Si falla, caemos a medianoche local de la parte de la fecha
            const parts = dateStr.substring(0, 10).split('-');
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }

        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) {
        console.error('Error parsing date:', e);
        return null;
    }
}

/**
 * Formatea una fecha a la zona horaria de Ecuador (America/Guayaquil)
 * @param {string|Date} dateString Fecha a formatear
 * @param {object} options Opciones adicionales de Intl.DateTimeFormat
 * @returns {string} Fecha formateada
 */
function formatDate(dateString, options = {}) {
    if (!dateString) return '-';
    try {
        const date = parseDate(dateString);
        if (!date) return '-';

        // Si es una fecha lógica (solo YYYY-MM-DD), no forzamos zona horaria 
        // para evitar que se mueva de día dependiendo de la ubicación del usuario.
        // Si es un timestamp completo, sí forzamos Ecuador.
        const isOnlyDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateString).trim());

        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };

        if (!isOnlyDate) {
            defaultOptions.timeZone = 'America/Guayaquil';
        }

        return date.toLocaleDateString('es-EC', { ...defaultOptions, ...options });
    } catch (e) {
        console.error('Error formatting date:', e);
        return '-';
    }
}

/**
 * Formatea una fecha a formato corto DD/MM/YY
 */
function formatDateShort(dateString) {
    return formatDate(dateString, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
}

/**
 * Formatea fecha y hora a la zona horaria de Ecuador
 */
function formatDateTime(dateString, options = {}) {
    if (!dateString) return '-';
    try {
        const date = parseDate(dateString);
        if (!date) return '-';

        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Guayaquil'
        };
        return date.toLocaleString('es-EC', { ...defaultOptions, ...options });
    } catch (e) {
        return '-';
    }
}

/**
 * Convierte un objeto Date o string a formato ISO (YYYY-MM-DD) ajustado a Ecuador
 */
function toISODate(dateInput) {
    try {
        const date = dateInput ? new Date(dateInput) : new Date();
        if (isNaN(date.getTime())) return null;
        // en-CA devuelve formato YYYY-MM-DD
        return date.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
    } catch (e) {
        console.error('Error in toISODate:', e);
        return null;
    }
}

/**
 * Obtiene la fecha actual en formato ISO (YYYY-MM-DD) ajustada a Ecuador
 */
function todayISODate() {
    return toISODate(new Date());
}

function showInlineMessage(element, message, type = 'info') {
    if (!element) return;
    if (!message) {
        element.style.display = 'none';
        element.textContent = '';
        element.className = 'inline-message';
        return;
    }
    element.textContent = message;
    element.className = `inline-message ${type}`;
    element.style.display = 'block';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Exponer funciones globalmente
window.loadDesembolsosPendientes = loadDesembolsosPendientes;

/**
 * Muestra el changelog de la versión actual si es la primera vez que se carga
 */
function checkAndShowChangelog() {
    const lastVersion = localStorage.getItem('last_seen_version');
    const currentVersion = window.APP_VERSION || '27.0.0';

    if (lastVersion !== currentVersion) {
        showChangelog(currentVersion);
        localStorage.setItem('last_seen_version', currentVersion);
    }
}

function showChangelog(version) {
    if (!window.Swal) return;

    Swal.fire({
        title: `¡Bienvenido a INKA CORP v${version}!`,
        html: `
            <div style="text-align: left; font-size: 14px; line-height: 1.6;">
                <p>Hemos actualizado el sistema a la versión <b>v${version}</b>. Se han integrado herramientas de auditoría crítica:</p>
                
                <h4 style="color: #10b981; margin-top: 15px;">💰 Control de Caja Centralizado</h4>
                <ul style="padding-left: 20px;">
                    <li><b>Auditoría Obligatoria:</b> Los módulos financieros ahora requieren una sesión de caja abierta.</li>
                    <li><b>Banners de Estado:</b> Indicadores visuales en tiempo real sobre el estado de la caja.</li>
                    <li><b>Dashborad:</b> Nuevo acceso directo para apertura de caja desde el panel principal.</li>
                </ul>

                <h4 style="color: #10b981; margin-top: 15px;">⚙️ Actualizaciones de Seguridad</h4>
                <ul style="padding-left: 20px;">
                    <li><b>Triggers de Base de Datos:</b> Protección a nivel de servidor contra registros sin sesión.</li>
                    <li><b>Versión Mayor:</b> Nuevo sistema de gestión de caché (PWA) optimizado.</li>
                </ul>
                <p style="margin-top: 15px; font-style: italic; color: #888;">Gracias por confiar en INKA CORP y LP Solutions.</p>
            </div>
        `,
        icon: 'success',
        confirmButtonText: '¡AHORA TODO ESTÁ CLARO!',
        confirmButtonColor: '#10b981',
        width: '500px'
    });
}

// Llamar al cargar la app para verificar versión
document.addEventListener('DOMContentLoaded', () => {
    // Pequeño retardo para no interferir con la carga inicial
    setTimeout(checkAndShowChangelog, 3000);
});
