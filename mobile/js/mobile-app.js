/**
 * Núcleo de la Aplicación Móvil - Manejo de Rutas y Módulos
 */

window.sysCajaAbierta = true; // Por defecto asumimos abierta para evitar alertas fantasmas en carga

document.addEventListener('DOMContentLoaded', () => {
    initMobileApp();
});

async function initMobileApp() {
    // Bloqueo total desde JS si se intenta cargar en PC/Pantalla Grande
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLargeScreen = window.innerWidth > 850;

    if (!isMobileUA && isLargeScreen) {
        console.log('[MOBILE-APP] Bloqueando carga de Móvil en PC...');
        window.location.replace('../');
        return;
    }

    console.log(`%c INKA CORP MOBILE - VERSION: ${window.APP_VERSION || 'v1.0'} `, 'background: #047857; color: #fff; font-weight: bold;');

    const appVersion = window.APP_VERSION || 'v1.0';
    document.querySelectorAll('[data-app-version]').forEach((el) => {
        el.textContent = appVersion;
    });

    // 1. Inicializar Supabase y SesiÃ³n
    initSupabase();
    const { isAuthenticated, user } = await checkSession();
    if (!isAuthenticated) {
        window.location.href = '../login.html';
        return;
    }

    // Exponer localmente y globalmente
    window.currentUser = user;

    // 1.1 Verificar estado de caja global
    await checkCajaStatusGlobal();

    // 2. Saludo de usuario
    try {
        if (user) {
            const greetingName = document.querySelector('.greeting-name');
            if (greetingName) {
                const displayName = user.nombre || user.user_metadata?.full_name || 'Usuario';
                greetingName.textContent = displayName.split(' ')[0];
            }
        }
    } catch (err) {
        console.warn('Error setting greeting:', err);
    }

    // 3. Manejar vista inicial
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const initialView = viewParam || 'desembolsos';

    await loadMobileView(initialView, false);

    // 4. Ocultar Splash Screen
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 500);
    }
}

// Mapa de módulos cargados para evitar duplicidad
const loadedModules = new Set();

// Navegación a versión de escritorio
function goToDesktopModule(module) {
    sessionStorage.setItem('forceDesktop', 'true');
    window.location.href = `../views/${module}.html`;
}

async function loadMobileView(view, pushState = true) {
    // Cerrar cualquier modal abierto al cambiar de vista
    closeAllLiteModals();

    // Si la vista es la base (index o vacÃ­a), redirigir a desembolsos
    if (!view || view === 'index') view = 'desembolsos';

    // Actualizar URL
    if (pushState) {
        const url = view === 'desembolsos' ? './' : `./?view=${view}`;
        history.pushState({ view: view }, '', url);
    }

    // Actualizar UI de NavegaciÃ³n
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.id === `nav-${view}`) item.classList.add('active');
    });

    // Controlar visibilidad del botón de reportes en el header
    const reportBtn = document.getElementById('report-btn-mobile');
    if (reportBtn) {
        if (view === 'creditos') {
            reportBtn.style.display = 'flex';
            reportBtn.onclick = () => {
                if (typeof window.openMobileExportModal === 'function') {
                    window.openMobileExportModal();
                }
            };
        } else if (view === 'bancos') {
            reportBtn.style.display = 'flex';
            reportBtn.onclick = () => {
                if (typeof window.generateMonthlyPaymentsReport === 'function') {
                    window.generateMonthlyPaymentsReport();
                } else {
                    console.error('generateMonthlyPaymentsReport function not found');
                    if (window.Swal) window.Swal.fire('Error', 'Función de reporte no disponible', 'error');
                }
            };
        } else {
            reportBtn.style.display = 'none';
        }
    }

    // 1. Cargar Template HTML
    try {
        const response = await fetch(`views/${view}.html`);
        if (response.ok) {
            const html = await response.text();

            // Validar que no sea el index.html principal (PC)
            if (html.includes('<title>INKA CORP - Dashboard</title>')) {
                throw new Error('Vista no encontrada (redirección detectada)');
            }

            document.querySelector('.main-content').innerHTML = html;
        } else {
            throw new Error('Error al cargar la vista');
        }
    } catch (e) {
        console.error(`Error en módulo ${view}:`, e);
        const title = view === 'socios' ? 'Módulo en Construcción' : 'Módulo en mantenimiento';
        const description = view === 'socios'
            ? 'El módulo de <strong>Socios</strong> está siendo desarrollado para la versión móvil.'
            : `El módulo <strong>${view}</strong> está siendo optimizado para dispositivos móviles.`;

        document.querySelector('.main-content').innerHTML = `
            <div style="padding: 2rem; text-align: center; margin-top: 2rem;">
                <i class="fas fa-tools" style="font-size: 4rem; color: #3b82f6; margin-bottom: 1.5rem; display: block;"></i>
                <h3 style="margin-bottom: 0.5rem; color: #1e293b;">${title}</h3>
                <p style="color: #64748b; font-size: 1rem; line-height: 1.5;">${description}</p>
                <button onclick="loadMobileView('desembolsos')" style="margin-top: 2rem; background: #047857; color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <i class="fas fa-home" style="margin-right: 0.5rem;"></i> Volver al Inicio
                </button>
            </div>
        `;
    }

    // 2. Cargar Recursos del Módulo (CSS/JS)
    await loadModuleResources(view);

    // 3. Ejecutar función de carga del módulo
    const loaderName = `init${view.charAt(0).toUpperCase() + view.slice(1)}Module`;
    if (typeof window[loaderName] === 'function') {
        window[loaderName]();
    } else {
        // Intentar fallback al nombre antiguo si existe
        const oldLoaderName = `load${view.charAt(0).toUpperCase() + view.slice(1)}View`;
        if (typeof window[oldLoaderName] === 'function') {
            window[oldLoaderName]();
        }
    }
}

async function loadModuleResources(moduleName) {
    if (loadedModules.has(moduleName)) return;

    // Intentar cargar CSS del módulo
    const cssPath = `css/modules/${moduleName}.css`;
    const cssPromise = new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssPath;
        link.onload = () => resolve();
        link.onerror = () => {
            console.warn(`No se pudo cargar CSS: ${cssPath}`);
            resolve();
        };
        document.head.appendChild(link);
    });

    // Intentar cargar JS del módulo
    const jsPath = `js/modules/${moduleName}.js`;
    const jsPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = jsPath;
        script.onload = () => resolve();
        script.onerror = () => {
            console.error(`Error al cargar el módulo JS: ${jsPath}`);
            resolve();
        };
        document.body.appendChild(script);
    });

    await Promise.all([cssPromise, jsPromise]);
    loadedModules.add(moduleName);
}

// Navegación mediante Historial (Botón Atrás)
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        loadMobileView(e.state.view, false);
    }
});

// Ayudante para volver a Escritorio (Desactivado por seguridad de UI)
function goToDesktopModule(module) {
    // Si es móvil, no permitimos ir a la versión de PC "fea"
    const isSmallScreen = window.innerWidth <= 850;
    if (isSmallScreen) {
        console.warn('Bloqueado acceso a vista PC desde móvil');
        loadMobileView('desembolsos');
        return;
    }
    window.location.href = `../views/${module}.html`;
}

/**
 * Muestra/Oculta el menú de acciones rápidas
 */
function toggleQuickMenu() {
    const overlay = document.getElementById('quick-menu-overlay');
    if (overlay) {
        overlay.classList.toggle('active');

        // Efecto haptics si está disponible
        if (overlay.classList.contains('active') && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
    }
}

/**
 * Control de Modales Inmersivos
 */
function openLiteModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Bloquear scroll del fondo

        // Haptics al abrir
        if (window.navigator.vibrate) window.navigator.vibrate(5);
    }
}

function closeLiteModal(modalId = 'credito-lite-modal') {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll
    }
}

/**
 * Cierra todos los modales lite abiertos de forma segura
 */
function closeAllLiteModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';
}

/** * Parsea una fecha asegurando que los strings YYYY-MM-DD se interpreten en la zona horaria de Ecuador
 */
function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;

    try {
        let dateStr = String(dateInput).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const parts = dateStr.split('-');
            // Medianoche local evita problemas de zona horaria con fechas "lógicas"
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }

        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) return d;
            
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
 * Formatea una fecha a la zona horaria de Ecuador
 */
function formatDate(dateString, options = {}) {
    if (!dateString) return '-';
    try {
        const date = parseDate(dateString);
        if (!date) return '-';

        // Lógica de mantenimiento de día: Para fechas literales (YYYY-MM-DD),
        // no forzamos zona horaria para que el día local sea el correcto.
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

// Exponer globalmente
window.parseDate = parseDate;
window.formatDate = formatDate;

/** * LÃ³gica del botÃ³n "Volver Arriba"
 */
function scrollToTop() {
    const container = document.querySelector('.main-content');
    if (container) {
        container.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

// Inicializar listener de scroll para el botón flotante
document.addEventListener('DOMContentLoaded', () => {
    const scrollBtn = document.getElementById('scroll-to-top');
    const scrollContainer = document.querySelector('.main-content');

    if (scrollContainer && scrollBtn) {
        scrollContainer.addEventListener('scroll', () => {
            if (scrollContainer.scrollTop > 300) {
                scrollBtn.classList.add('visible');
            } else {
                scrollBtn.classList.remove('visible');
            }
        });
    }
});

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
        title: `¡Bienvenido a INKA CORP Mobile v${version}!`,
        html: `
            <div style="text-align: left; font-size: 14px; line-height: 1.6;">
                <p>Hemos actualizado el sistema a la versión <b>v${version}</b>. Estos son los cambios principales:</p>
                
                <h4 style="color: #10b981; margin-top: 15px;">💰 Control de Caja</h4>
                <ul style="padding-left: 20px;">
                    <li><b>Sistema de Auditoría:</b> Se requiere una caja abierta para realizar operaciones financieras.</li>
                    <li><b>Banners de Alerta:</b> Mantente informado sobre el estado de la caja desde cualquier módulo.</li>
                </ul>

                <h4 style="color: #10b981; margin-top: 15px;">⚙️ Mejoras de Sistema</h4>
                <ul style="padding-left: 20px;">
                    <li><b>Versión Mayor:</b> Optimizaciones globales de rendimiento y seguridad.</li>
                    <li><b>Botón Dashboard:</b> Nuevo acceso rápido para apertura de caja desde el panel principal.</li>
                </ul>
                <p style="margin-top: 15px; font-style: italic; color: #888;">Gracias por confiar en INKA CORP y LP Solutions.</p>
            </div>
        `,
        icon: 'success',
        confirmButtonText: '¡AHORA TODO ESTÁ CLARO!',
        confirmButtonColor: '#10b981',
        width: '90%'
    });
}

// Llamar al cargar la app para verificar versión
if (typeof initMobileApp !== 'undefined') {
    const originalInit = initMobileApp;
    initMobileApp = async function() {
        await originalInit();
        setTimeout(checkAndShowChangelog, 3000);
    };
}

/**
 * Validador global para acciones financieras en Móvil
 */
window.validateCajaBeforeAction = function(modulo = 'esta operación') {
    if (window.sysCajaAbierta) return true;

    if (window.Swal) {
        Swal.fire({
            icon: 'error',
            title: '<h3 style="color: #ef4444;">¡CAJA CERRADA!</h3>',
            html: `
                <div style="text-align: center; padding: 0.5rem;">
                    <i class="fas fa-lock fa-3x" style="color: #ef4444; margin-bottom: 1rem;"></i>
                    <p style="font-size: 1rem; color: #e8edf5;">
                        No puede <strong>${modulo}</strong> sin una jornada de caja abierta.
                    </p>
                    <p style="font-size: 0.85rem; margin-top: 0.75rem; color: #aab6c7;">
                        Diríjase al módulo de Caja para iniciar su turno.
                    </p>
                </div>
            `,
            confirmButtonColor: '#F2BB3A',
            confirmButtonText: '<i class="fas fa-cash-register"></i> ABRIR CAJA',
            background: '#131820',
            color: '#fff'
        }).then((result) => {
            if (result.isConfirmed) {
                loadMobileView('caja');
            }
        });
    } else {
        alert('CAJA CERRADA: Debe abrir su caja para continuar.');
    }
    return false;
};

/**
 * Verifica el estado de la caja del usuario en Supabase (Versión Móvil)
 * Ahora expuesta globalmente para activación dinámica.
 */
window.checkCajaStatusGlobal = async function() {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    
    if (!session || !session.user) return;

    try {
        const { data, error } = await sb
            .from('ic_caja_aperturas')
            .select('id_apertura')
            .eq('id_usuario', session.user.id)
            .eq('estado', 'ABIERTA')
            .limit(1);

        if (error) throw error;
        
        const isCajaOpen = (data && data.length > 0);
        window.sysCajaAbierta = isCajaOpen;
        
        console.log(`[MOBILE-AUTH] Estado de caja global: ${isCajaOpen ? 'ABIERTA' : 'CERRADA'}`);

        // Actualizar alertas en UI de forma dinámica si el elemento existe en el DOM
        const alertCaja = document.getElementById('caja-cerrada-alert-mobile');
        if (alertCaja) {
            if (isCajaOpen) {
                alertCaja.classList.add('hidden');
                alertCaja.style.display = 'none'; // Refuerzo
            } else {
                alertCaja.classList.remove('hidden');
                alertCaja.style.display = 'block'; // Refuerzo
            }
        }
        
        // Disparar evento para que otros módulos reaccionen si lo necesitan
        window.dispatchEvent(new CustomEvent('cajaStatusChanged', { detail: { open: isCajaOpen } }));
        
        return isCajaOpen;
    } catch (err) {
        console.warn('Error verificando caja global:', err);
        return window.sysCajaAbierta;
    }
};

