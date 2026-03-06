/**
 * INKA CORP - Módulo de Solicitudes de Crédito
 * Gestión de solicitudes de crédito
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allSolicitudes = [];
let filteredSolicitudes = [];
let currentFilterSolicitud = 'PENDIENTE'; // Por defecto muestra pendientes
let searchTermSolicitud = '';
let sociosForSelector = [];

function getSolicitudDarkSwalClass() {
    return {
        popup: 'solicitud-dark-swal',
        title: 'solicitud-dark-swal-title',
        htmlContainer: 'solicitud-dark-swal-html',
        confirmButton: 'solicitud-dark-swal-confirm'
    };
}

// ==========================================
// SCREEN BLOCKER (Pantalla de bloqueo con progreso)
// ==========================================
function mostrarScreenBlocker(mensaje) {
    // Remover si ya existe
    ocultarScreenBlocker();

    const blocker = document.createElement('div');
    blocker.id = 'screen-blocker';
    blocker.innerHTML = `
        <div class="blocker-content">
            <div class="blocker-spinner">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div class="blocker-message">${mensaje}</div>
            <div class="blocker-progress">
                <div class="blocker-progress-bar"></div>
            </div>
        </div>
    `;
    document.body.appendChild(blocker);
}

function actualizarScreenBlocker(mensaje, progreso = null) {
    const blocker = document.getElementById('screen-blocker');
    if (!blocker) return;

    const msgEl = blocker.querySelector('.blocker-message');
    if (msgEl) msgEl.textContent = mensaje;

    if (progreso !== null) {
        const progressBar = blocker.querySelector('.blocker-progress-bar');
        if (progressBar) progressBar.style.width = `${progreso}%`;
    }
}

function ocultarScreenBlocker() {
    const blocker = document.getElementById('screen-blocker');
    if (blocker) blocker.remove();
}

// Estilos del screen blocker (se agregan dinámicamente)
(function () {
    if (document.getElementById('screen-blocker-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'screen-blocker-styles';
    styles.textContent = `
        #screen-blocker {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            backdrop-filter: blur(5px);
        }
        
        .blocker-content {
            text-align: center;
            padding: 2.5rem 3rem;
            background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 1.25rem;
            border: 1px solid rgba(242, 187, 58, 0.3);
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
            min-width: 320px;
        }
        
        .blocker-spinner {
            font-size: 3rem;
            color: #f2bb3a;
            margin-bottom: 1.5rem;
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        .blocker-message {
            font-size: 1.1rem;
            color: #ffffff;
            font-weight: 600;
            margin-bottom: 1.5rem;
        }
        
        .blocker-progress {
            height: 6px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            overflow: hidden;
        }
        
        .blocker-progress-bar {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #f2bb3a 0%, #e6a52e 100%);
            border-radius: 3px;
            transition: width 0.3s ease;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.05); }
        }
    `;
    document.head.appendChild(styles);
})();

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function initSolicitudCreditoModule() {
    setupSolicitudesEventListeners();
    await loadSolicitudes();

    // Aplicar filtro por defecto (PENDIENTE)
    filterSolicitudesByEstado('PENDIENTE');
}

function setupSolicitudesEventListeners() {
    // Cerrar modales al hacer clic en backdrop o botón close
    setupModalCloseHandlersSolicitud('modal-nueva-solicitud');
    setupModalCloseHandlersSolicitud('modal-ver-solicitud');
    setupModalCloseHandlersSolicitud('modal-visor-imagen');
    setupModalCloseHandlersSolicitud('modal-colocar-credito');

    // Select de socio - mostrar info al seleccionar
    const selectSocio = document.getElementById('select-socio');
    if (selectSocio) {
        selectSocio.addEventListener('change', mostrarInfoSocioSeleccionado);
    }

    setupCustomSocioSelector();
    setupCustomPlazoSelector();

    // Exponer funciones globalmente
    window.viewSolicitud = viewSolicitud;
    window.aprobarSolicitud = aprobarSolicitud;
    window.anularSolicitud = anularSolicitud;
    window.colocarCredito = colocarCredito;
    window.abrirVisorImagen = abrirVisorImagen;
    window.cerrarVisorImagen = cerrarVisorImagen;
    window.zoomImagen = zoomImagen;
}

function setupModalCloseHandlersSolicitud(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Backdrop click
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => closeSolicitudModal(modalId));
    }

    // Botones close
    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closeSolicitudModal(modalId));
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeSolicitudModal(modalId);
        }
    });
}

// ==========================================
// CARGAR DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadSolicitudes(forceRefresh = false) {
    try {
        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('solicitudes')) {
            allSolicitudes = window.getCacheData('solicitudes');
            filteredSolicitudes = [...allSolicitudes];
            updateSolicitudesStats();
            updateSolicitudesCounts();
            applyFiltersSolicitud(); // Aplicar filtro por defecto (PENDIENTE)

            // Cargar sección de pendientes de desembolso
            await loadPendientesDesembolso();

            // Si el caché es reciente, no recargar
            if (window.isCacheValid && window.isCacheValid('solicitudes')) {
                return;
            }

            // Actualizar en segundo plano
            syncSolicitudesBackground();
            return;
        }

        // Si no hay caché, mostrar loading y cargar
        showSolicitudesLoading();
        await loadSolicitudesFromDB();

    } catch (error) {
        console.error('Error loading solicitudes:', error);
        if (!window.hasCacheData || !window.hasCacheData('solicitudes')) {
            showSolicitudesError('Error al cargar solicitudes: ' + error.message);
        }
    }
}

// Cargar desde base de datos
async function loadSolicitudesFromDB() {
    const supabase = window.getSupabaseClient();

    const { data: solicitudes, error } = await supabase
        .from('ic_solicitud_de_credito')
        .select('*')
        .order('solicitudid', { ascending: false });

    if (error) throw error;

    allSolicitudes = solicitudes || [];
    filteredSolicitudes = [...allSolicitudes];

    // Guardar en caché usando la nueva función
    if (window.setCacheData) {
        window.setCacheData('solicitudes', allSolicitudes);
    }

    updateSolicitudesStats();
    updateSolicitudesCounts();
    applyFiltersSolicitud();

    // Cargar sección de pendientes de desembolso
    await loadPendientesDesembolso();
}

// Sincronizar en segundo plano sin bloquear UI
async function syncSolicitudesBackground() {
    try {
        const supabase = window.getSupabaseClient();

        const { data: solicitudes, error } = await supabase
            .from('ic_solicitud_de_credito')
            .select('*')
            .order('solicitudid', { ascending: false });

        if (error) {
            console.warn('Error sincronizando solicitudes:', error);
            return;
        }

        allSolicitudes = solicitudes || [];
        filteredSolicitudes = [...allSolicitudes];

        // Actualizar caché
        if (window.dataCache) {
            window.dataCache.solicitudes = allSolicitudes;
            if (!window.dataCache.lastUpdate) window.dataCache.lastUpdate = {};
            window.dataCache.lastUpdate.solicitudes = Date.now();
            if (window.saveCache) window.saveCache();
        }

        // Re-renderizar con datos actualizados
        updateSolicitudesStats();
        updateSolicitudesCounts();
        renderSolicitudesGrid(filteredSolicitudes);
    } catch (error) {
        console.error('Error en sincronización de solicitudes:', error);
    }
}

// Refrescar solicitudes (botón sync)
async function refreshSolicitudes() {
    const btnSync = document.getElementById('btn-sync-solicitudes');
    if (btnSync) {
        btnSync.classList.add('spinning');
    }

    try {
        await loadSolicitudesFromDB();
        showToast('Solicitudes actualizadas', 'success');
    } catch (error) {
        console.error('Error al actualizar solicitudes:', error);
        showToast('Error al actualizar', 'error');
    } finally {
        if (btnSync) {
            setTimeout(() => btnSync.classList.remove('spinning'), 500);
        }
    }
}

// ==========================================
// PENDIENTES DE DESEMBOLSO
// ==========================================
async function loadPendientesDesembolso() {
    const section = document.getElementById('seccion-pendiente-desembolso');
    const container = document.getElementById('lista-pendiente-desembolso');
    const countBadge = document.getElementById('count-pendiente-desembolso');

    if (!section || !container) return;

    try {
        const supabase = window.getSupabaseClient();

        // Obtener créditos en estado PENDIENTE (colocados pero no desembolsados)
        const { data: creditosPendientes, error } = await supabase
            .from('ic_creditos')
            .select('*')
            .eq('estado_credito', 'PENDIENTE')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error cargando pendientes de desembolso:', error);
            section.classList.add('hidden');
            return;
        }

        // Si hay créditos pendientes, cargar datos relacionados
        if (creditosPendientes && creditosPendientes.length > 0) {
            // Cargar socios - primero intentar desde caché
            const cachedSocios = window.dataCache?.socios || [];
            let socios = [];

            // Obtener IDs únicos de socios
            const socioIds = [...new Set(creditosPendientes.map(c => c.id_socio).filter(Boolean))];

            if (socioIds.length > 0) {
                const { data: sociosDB, error: errorSocios } = await supabase
                    .from('ic_socios')
                    .select('idsocio, nombre, cedula, whatsapp, estadocivil')
                    .in('idsocio', socioIds);

                if (!errorSocios && sociosDB) {
                    socios = sociosDB;
                }
            }

            // Cargar documentos
            const creditoIds = creditosPendientes.map(c => c.id_credito);
            const { data: documentos } = await supabase
                .from('ic_creditos_documentos')
                .select('id_credito, contrato_generado, pagare_generado, tabla_amortizacion_generada, documento_garante_firmado')
                .in('id_credito', creditoIds);

            // Cargar garantes
            const { data: garantes } = await supabase
                .from('ic_creditos_garantes')
                .select('id_credito, nombre_garante, cedula_garante')
                .in('id_credito', creditoIds);

            // Mapear datos a los créditos
            creditosPendientes.forEach(credito => {
                // Buscar socio primero en DB, luego en caché
                let socioEncontrado = socios?.find(s => s.idsocio === credito.id_socio);
                if (!socioEncontrado) {
                    // Buscar en caché por id_socio o por cédula (el id_socio podría ser la cédula)
                    socioEncontrado = cachedSocios.find(s =>
                        s.idsocio === credito.id_socio || s.cedula === credito.id_socio
                    );
                }
                credito.socio = socioEncontrado || {};
                credito.documentos = [documentos?.find(d => d.id_credito === credito.id_credito) || {}];
                credito.garante_info = [garantes?.find(g => g.id_credito === credito.id_credito)];
            });
        }

        // Mostrar u ocultar sección según haya datos
        if (!creditosPendientes || creditosPendientes.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        if (countBadge) countBadge.textContent = creditosPendientes.length;

        // Renderizar cards
        container.innerHTML = creditosPendientes.map(credito => {
            const socio = credito.socio || {};
            const docs = credito.documentos?.[0] || {};
            const garanteInfo = credito.garante_info?.[0] || null;

            const nombreCompleto = socio.nombre || 'Sin nombre';
            const capitalFormatted = parseFloat(credito.capital).toLocaleString('es-EC', { minimumFractionDigits: 2 });
            const cuotaFormatted = parseFloat(credito.cuota_con_ahorro).toLocaleString('es-EC', { minimumFractionDigits: 2 });

            // Estado de documentos
            const contratoOk = docs.contrato_generado;
            const pagareOk = docs.pagare_generado;
            const tablaOk = docs.tabla_amortizacion_generada;
            const garanteOk = !credito.garante || docs.documento_garante_firmado;
            const todosDocsOk = contratoOk && pagareOk && tablaOk && garanteOk;

            return `
                <div class="card-desembolso-pendiente" data-id="${credito.id_credito}">
                    <div class="card-desembolso-header">
                        <div class="card-desembolso-socio">
                            <h4>${nombreCompleto}</h4>
                            <span>${socio.cedula || '-'} | ${credito.codigo_credito}</span>
                        </div>
                        <div class="card-desembolso-monto">
                            <span class="monto-valor">$${capitalFormatted}</span>
                            <span class="monto-label">Capital</span>
                        </div>
                    </div>
                    <div class="card-desembolso-info">
                        <div class="info-item">
                            <span class="label">Plazo</span>
                            <span class="value">${credito.plazo} meses</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Cuota</span>
                            <span class="value">$${cuotaFormatted}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Tasa</span>
                            <span class="value">${credito.tasa_interes_mensual}%</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Día Pago</span>
                            <span class="value">${credito.dia_pago}</span>
                        </div>
                    </div>
                    <div class="card-desembolso-docs">
                        <span class="doc-status ${contratoOk ? 'ready' : 'pending'}">
                            <i class="fas fa-${contratoOk ? 'check' : 'clock'}"></i> Contrato
                        </span>
                        <span class="doc-status ${pagareOk ? 'ready' : 'pending'}">
                            <i class="fas fa-${pagareOk ? 'check' : 'clock'}"></i> Pagaré
                        </span>
                        <span class="doc-status ${tablaOk ? 'ready' : 'pending'}">
                            <i class="fas fa-${tablaOk ? 'check' : 'clock'}"></i> Tabla
                        </span>
                        ${credito.garante ? `
                            <span class="doc-status ${garanteOk ? 'ready' : 'pending'}">
                                <i class="fas fa-${garanteOk ? 'check' : 'clock'}"></i> Garantía
                            </span>
                        ` : ''}
                    </div>
                    <div class="card-desembolso-actions">
                        <button class="btn-generar-docs" onclick="event.stopPropagation(); abrirModalDocumentosCredito('${credito.id_credito}')">
                            <i class="fas fa-file-pdf"></i> Generar Documentos
                        </button>
                        <button class="btn-completar-desembolso" onclick="event.stopPropagation(); desembolsarCredito('${credito.id_credito}')" ${!todosDocsOk ? 'disabled title="Genere todos los documentos primero"' : ''}>
                            <i class="fas fa-money-bill-wave"></i> Desembolsar
                        </button>
                        <button class="btn-anular-credito" onclick="event.stopPropagation(); anularCreditoColocado('${credito.id_credito}', '${credito.codigo_credito}')" title="Anular Préstamo">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading pendientes desembolso:', error);
        section.classList.add('hidden');
    }
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateSolicitudesStats() {
    const total = allSolicitudes.length;
    const pendientes = allSolicitudes.filter(s => s.estado === 'PENDIENTE').length;
    const aprobadas = allSolicitudes.filter(s => s.estado === 'APROBADA').length;
    const colocadas = allSolicitudes.filter(s => s.estado === 'COLOCADA').length;
    const desembolsadas = allSolicitudes.filter(s => s.estado === 'DESEMBOLSADA').length;

    const totalEl = document.getElementById('stat-solicitudes-total');
    const pendientesEl = document.getElementById('stat-solicitudes-pendientes');
    const aprobadasEl = document.getElementById('stat-solicitudes-aprobadas');
    const colocadasEl = document.getElementById('stat-solicitudes-colocadas');
    const desembolsadasEl = document.getElementById('stat-solicitudes-desembolsadas');

    if (totalEl) totalEl.textContent = total;
    if (pendientesEl) pendientesEl.textContent = pendientes;
    if (aprobadasEl) aprobadasEl.textContent = aprobadas;
    if (colocadasEl) colocadasEl.textContent = colocadas;
    if (desembolsadasEl) desembolsadasEl.textContent = desembolsadas;
}

function updateSolicitudesCounts() {
    const counts = {
        all: allSolicitudes.length,
        pendiente: allSolicitudes.filter(s => s.estado === 'PENDIENTE').length,
        aprobada: allSolicitudes.filter(s => s.estado === 'APROBADA').length,
        colocada: allSolicitudes.filter(s => s.estado === 'COLOCADA').length,
        desembolsada: allSolicitudes.filter(s => s.estado === 'DESEMBOLSADA').length,
        anulada: allSolicitudes.filter(s => s.estado === 'ANULADA').length
    };

    Object.entries(counts).forEach(([key, value]) => {
        const el = document.getElementById('count-solicitudes-' + key);
        if (el) el.textContent = value;
    });
}

// ==========================================
// FILTRAR SOLICITUDES
// ==========================================
function filterSolicitudesByEstado(estado) {
    // Actualizar botón activo
    document.querySelectorAll('.solicitud-toolbar .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.estado === estado) {
            btn.classList.add('active');
        }
    });

    currentFilterSolicitud = estado;
    applyFiltersSolicitud();
}

function searchSolicitudes(term) {
    searchTermSolicitud = term.toLowerCase().trim();
    applyFiltersSolicitud();
}

function applyFiltersSolicitud() {
    filteredSolicitudes = allSolicitudes.filter(solicitud => {
        // Estado filter
        if (currentFilterSolicitud && solicitud.estado !== currentFilterSolicitud) {
            return false;
        }

        // Search filter
        if (searchTermSolicitud) {
            const nombre = (solicitud.nombresocio || '').toLowerCase();
            const cedula = (solicitud.cedulasocio || '').toLowerCase();
            const matchesSearch = nombre.includes(searchTermSolicitud) || cedula.includes(searchTermSolicitud);
            if (!matchesSearch) return false;
        }

        return true;
    });

    renderSolicitudesGrid(filteredSolicitudes);
}

// ==========================================
// RENDERIZAR GRID DE SOLICITUDES
// ==========================================
function renderSolicitudesGrid(solicitudes) {
    const container = document.getElementById('solicitudes-grid');
    if (!container) return;

    if (solicitudes.length === 0) {
        container.innerHTML = '<div class="empty-state">' +
            '<i class="fas fa-folder-open"></i>' +
            '<p>No se encontraron solicitudes</p>' +
            '</div>';
        return;
    }

    // Agrupar por estado y tipo (Socio/No Socio) para pendientes
    const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE');
    const pendientesSocios = pendientes.filter(s => s.solicitudid.length === 14);
    const pendientesNoSocios = pendientes.filter(s => s.solicitudid.length === 17);

    const grupos = {
        'PENDIENTE_SOCIO': pendientesSocios,
        'PENDIENTE_NO_SOCIO': pendientesNoSocios,
        'APROBADA': solicitudes.filter(s => s.estado === 'APROBADA'),
        'COLOCADA': solicitudes.filter(s => s.estado === 'COLOCADA'),
        'DESEMBOLSADA': solicitudes.filter(s => s.estado === 'DESEMBOLSADA'),
        'ANULADA': solicitudes.filter(s => s.estado === 'ANULADA')
    };

    let html = '';

    Object.entries(grupos).forEach(([estado, items]) => {
        if (items.length === 0) return;

        const estadoInfo = getEstadoInfo(estado);

        html += '<div class="solicitud-section">' +
            '<div class="section-header ' + estadoInfo.class + '">' +
            '<div class="section-title">' +
            '<i class="' + estadoInfo.icon + '"></i>' +
            '<span>' + estadoInfo.label + '</span>' +
            '<span class="section-count">' + items.length + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="solicitudes-cards">' +
            items.map(s => renderSolicitudCard(s, estadoInfo)).join('') +
            '</div>' +
            '</div>';
    });

    container.innerHTML = html;
}

function renderSolicitudCard(solicitud, estadoInfo) {
    // Parsear fecha y hora del ID
    const { fecha, hora } = parseSolicitudId(solicitud.solicitudid);

    const montoFormatted = '$' + parseFloat(solicitud.monto || 0).toLocaleString('es-EC', {
        minimumFractionDigits: 2
    });

    var whatsappHtml = '';
    if (solicitud.whatsappsocio) {
        whatsappHtml = '<span class="extra-item">' +
            '<i class="fab fa-whatsapp"></i>' +
            solicitud.whatsappsocio +
            '</span>';
    }

    return '<div class="solicitud-card ' + estadoInfo.class + '" onclick="viewSolicitud(\'' + solicitud.solicitudid + '\')">' +
        '<div class="solicitud-card-header">' +
        '<div class="solicitud-fecha">' +
        '<i class="fas fa-calendar-alt"></i>' +
        '<span>' + fecha + '</span>' +
        '<span class="solicitud-hora"><i class="fas fa-clock"></i> ' + hora + '</span>' +
        '</div>' +
        '<span class="badge badge-' + estadoInfo.badgeClass + '">' + estadoInfo.label + '</span>' +
        '</div>' +
        '<div class="solicitud-card-body">' +
        '<div class="solicitud-socio">' +
        '<i class="fas fa-user"></i>' +
        '<div class="socio-info">' +
        '<span class="socio-nombre">' + (solicitud.nombresocio || 'N/A') + '</span>' +
        '<span class="socio-cedula">' + (solicitud.cedulasocio || '') + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="solicitud-monto">' +
        '<span class="monto-label">Monto Solicitado</span>' +
        '<span class="monto-value">' + montoFormatted + '</span>' +
        '</div>' +
        '<div class="solicitud-extra">' +
        '<span class="extra-item">' +
        '<i class="fas fa-map-marker-alt"></i>' +
        (solicitud.paisresidencia || '-') +
        '</span>' +
        whatsappHtml +
        '</div>' +
        '</div>' +
        '<div class="solicitud-card-footer">' +
        '<button class="btn btn-ver-detalles" onclick="event.stopPropagation(); viewSolicitud(\'' + solicitud.solicitudid + '\')">' +
        '<i class="fas fa-eye"></i>' +
        '<span>Ver Detalles</span>' +
        '</button>' +
        '</div>' +
        '</div>';
}

function getEstadoInfo(estado) {
    const info = {
        'PENDIENTE_SOCIO': { label: 'Pendientes (Socios)', icon: 'fas fa-user-clock', class: 'estado-pendiente', badgeClass: 'pendiente' },
        'PENDIENTE_NO_SOCIO': { label: 'Pendientes (No Socios)', icon: 'fas fa-user-tag', class: 'estado-pendiente-no-socio', badgeClass: 'pendiente-no-socio' },
        'PENDIENTE': { label: 'Pendientes', icon: 'fas fa-clock', class: 'estado-pendiente', badgeClass: 'pendiente' },
        'APROBADA': { label: 'Aprobadas', icon: 'fas fa-check-circle', class: 'estado-aprobada', badgeClass: 'aprobada' },
        'COLOCADA': { label: 'Colocadas', icon: 'fas fa-check-double', class: 'estado-colocada', badgeClass: 'colocada' },
        'DESEMBOLSADA': { label: 'Desembolsadas', icon: 'fas fa-money-bill-wave', class: 'estado-desembolsada', badgeClass: 'desembolsada' },
        'ANULADA': { label: 'Anuladas', icon: 'fas fa-times-circle', class: 'estado-anulada', badgeClass: 'anulada' }
    };
    return info[estado] || { label: estado, icon: 'fas fa-circle', class: '', badgeClass: '' };
}

// ==========================================
// MODAL: NUEVA SOLICITUD
// ==========================================
function abrirModalNuevaSolicitud() {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('NUEVA SOLICITUD')) {
            return;
        }
    }

    // Poblar select de socios desde caché
    poblarSelectSocios();

    // Limpiar formulario
    const selectSocio = document.getElementById('select-socio');
    const inputMonto = document.getElementById('input-monto');
    const inputPlazo = document.getElementById('input-plazo');
    const infoSocio = document.getElementById('info-socio-seleccionado');

    if (selectSocio) selectSocio.value = '';
    if (inputMonto) inputMonto.value = '';
    if (inputPlazo) inputPlazo.value = '';
    if (infoSocio) infoSocio.classList.add('hidden');

    const label = document.getElementById('select-socio-label');
    if (label) label.textContent = '-- Seleccione un socio --';

    const plazoLabel = document.getElementById('select-plazo-label');
    if (plazoLabel) plazoLabel.textContent = 'Seleccione';

    const customSearch = document.getElementById('select-socio-search');
    if (customSearch) customSearch.value = '';

    renderCustomSocioOptions('');
    closeCustomSocioDropdown();
    renderCustomPlazoOptions();
    closeCustomPlazoDropdown();

    openSolicitudModal('modal-nueva-solicitud');
}

function cerrarModalNuevaSolicitud() {
    closeSolicitudModal('modal-nueva-solicitud');
}

function poblarSelectSocios() {
    const select = document.getElementById('select-socio');
    if (!select) return;

    // Obtener socios del caché
    const socios = window.dataCache?.socios || [];
    sociosForSelector = [...socios];

    select.innerHTML = '<option value="">-- Seleccione un socio --</option>';

    socios.forEach(socio => {
        const option = document.createElement('option');
        option.value = socio.cedula;
        option.textContent = socio.nombre + ' - ' + socio.cedula;
        option.dataset.socioData = JSON.stringify(socio);
        select.appendChild(option);
    });

    renderCustomSocioOptions('');
}

function setupCustomSocioSelector() {
    const root = document.getElementById('select-socio-custom');
    const trigger = document.getElementById('select-socio-trigger');
    const dropdown = document.getElementById('select-socio-dropdown');
    const searchInput = document.getElementById('select-socio-search');
    const optionsContainer = document.getElementById('select-socio-options');

    if (!root || !trigger || !dropdown || !searchInput || !optionsContainer) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = !dropdown.classList.contains('hidden');
        if (isOpen) {
            closeCustomSocioDropdown();
        } else {
            openCustomSocioDropdown();
        }
    });

    searchInput.addEventListener('input', (event) => {
        renderCustomSocioOptions(event.target.value || '');
    });

    optionsContainer.addEventListener('click', (event) => {
        const optionBtn = event.target.closest('[data-socio-cedula]');
        if (!optionBtn) return;
        selectSocioFromCustom(optionBtn.dataset.socioCedula || '');
    });

    document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) {
            closeCustomSocioDropdown();
        }
    });
}

function openCustomSocioDropdown() {
    const trigger = document.getElementById('select-socio-trigger');
    const dropdown = document.getElementById('select-socio-dropdown');
    const searchInput = document.getElementById('select-socio-search');
    if (!trigger || !dropdown) return;

    dropdown.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 10);
}

function closeCustomSocioDropdown() {
    const trigger = document.getElementById('select-socio-trigger');
    const dropdown = document.getElementById('select-socio-dropdown');
    if (!trigger || !dropdown) return;

    dropdown.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
}

function renderCustomSocioOptions(term) {
    const optionsContainer = document.getElementById('select-socio-options');
    if (!optionsContainer) return;

    const normalizedTerm = String(term || '').toLowerCase().trim();
    const filtered = sociosForSelector.filter((socio) => {
        if (!normalizedTerm) return true;
        const nombre = String(socio.nombre || '').toLowerCase();
        const cedula = String(socio.cedula || '').toLowerCase();
        return nombre.includes(normalizedTerm) || cedula.includes(normalizedTerm);
    });

    if (!filtered.length) {
        optionsContainer.innerHTML = '<div class="select-socio-empty">No se encontraron socios</div>';
        return;
    }

    optionsContainer.innerHTML = filtered.map((socio) => {
        return (
            '<button type="button" class="select-socio-option" data-socio-cedula="' + (socio.cedula || '') + '">' +
                '<span class="option-name">' + escapeHtml(String(socio.nombre || 'Sin nombre')) + '</span>' +
                '<span class="option-id">' + escapeHtml(String(socio.cedula || '')) + '</span>' +
            '</button>'
        );
    }).join('');
}

function setupCustomPlazoSelector() {
    const root = document.getElementById('select-plazo-custom');
    const trigger = document.getElementById('select-plazo-trigger');
    const dropdown = document.getElementById('select-plazo-dropdown');
    const optionsContainer = document.getElementById('select-plazo-options');
    const nativeSelect = document.getElementById('input-plazo');

    if (!root || !trigger || !dropdown || !optionsContainer || !nativeSelect) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = !dropdown.classList.contains('hidden');
        if (isOpen) {
            closeCustomPlazoDropdown();
        } else {
            openCustomPlazoDropdown();
        }
    });

    optionsContainer.addEventListener('click', (event) => {
        const optionBtn = event.target.closest('[data-plazo-value]');
        if (!optionBtn) return;
        selectPlazoFromCustom(optionBtn.dataset.plazoValue || '');
    });

    nativeSelect.addEventListener('change', () => {
        const label = document.getElementById('select-plazo-label');
        const selectedOption = nativeSelect.options[nativeSelect.selectedIndex];
        if (label) label.textContent = selectedOption ? selectedOption.textContent : 'Seleccione';
    });

    document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) {
            closeCustomPlazoDropdown();
        }
    });

    renderCustomPlazoOptions();
}

function renderCustomPlazoOptions() {
    const nativeSelect = document.getElementById('input-plazo');
    const optionsContainer = document.getElementById('select-plazo-options');
    if (!nativeSelect || !optionsContainer) return;

    const options = Array.from(nativeSelect.options);
    optionsContainer.innerHTML = options.map((option) => {
        const isActive = nativeSelect.value === option.value;
        return (
            '<button type="button" class="select-socio-option' + (isActive ? ' is-active' : '') + '" data-plazo-value="' + escapeHtml(option.value) + '">' +
                '<span class="option-name">' + escapeHtml(option.textContent || 'Seleccione') + '</span>' +
            '</button>'
        );
    }).join('');
}

function openCustomPlazoDropdown() {
    const trigger = document.getElementById('select-plazo-trigger');
    const dropdown = document.getElementById('select-plazo-dropdown');
    if (!trigger || !dropdown) return;

    dropdown.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    renderCustomPlazoOptions();
}

function closeCustomPlazoDropdown() {
    const trigger = document.getElementById('select-plazo-trigger');
    const dropdown = document.getElementById('select-plazo-dropdown');
    if (!trigger || !dropdown) return;

    dropdown.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
}

function selectPlazoFromCustom(value) {
    const nativeSelect = document.getElementById('input-plazo');
    const label = document.getElementById('select-plazo-label');
    if (!nativeSelect) return;

    nativeSelect.value = value;
    const selectedOption = Array.from(nativeSelect.options).find((option) => option.value === value);
    if (label) label.textContent = selectedOption ? selectedOption.textContent : 'Seleccione';

    nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    renderCustomPlazoOptions();
    closeCustomPlazoDropdown();
}

function selectSocioFromCustom(cedula) {
    const select = document.getElementById('select-socio');
    const label = document.getElementById('select-socio-label');
    const searchInput = document.getElementById('select-socio-search');
    if (!select) return;

    select.value = cedula;

    const selectedOption = Array.from(select.options).find((option) => option.value === cedula);
    if (label) {
        label.textContent = selectedOption ? selectedOption.textContent : '-- Seleccione un socio --';
    }

    if (searchInput) searchInput.value = '';
    renderCustomSocioOptions('');
    closeCustomSocioDropdown();

    select.dispatchEvent(new Event('change', { bubbles: true }));
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function mostrarInfoSocioSeleccionado() {
    const select = document.getElementById('select-socio');
    const infoCard = document.getElementById('info-socio-seleccionado');
    const customLabel = document.getElementById('select-socio-label');

    if (!select.value) {
        if (customLabel) customLabel.textContent = '-- Seleccione un socio --';
        infoCard.classList.add('hidden');
        return;
    }

    const option = select.options[select.selectedIndex];
    const socio = JSON.parse(option.dataset.socioData || '{}');
    if (customLabel && option) customLabel.textContent = option.textContent;

    document.getElementById('display-nombre-socio').textContent = socio.nombre || '-';
    document.getElementById('display-cedula-socio').textContent = socio.cedula || '-';
    document.getElementById('display-pais-socio').textContent = socio.pais || '-';
    document.getElementById('display-whatsapp-socio').textContent = socio.whatsapp || '-';
    document.getElementById('display-estadocivil-socio').textContent = socio.estadocivil || '-';

    // Mostrar/Ocultar cédula del cónyuge según estado civil
    const containerCedulaConyuge = document.getElementById('container-cedula-conyuge');
    const displayCedulaConyuge = document.getElementById('display-cedula-conyuge');

    const estadoCivil = (socio.estadocivil || '').toUpperCase();
    if (estadoCivil === 'CASADO/A' || estadoCivil === 'UNIÓN LIBRE') {
        containerCedulaConyuge.classList.remove('hidden');
        displayCedulaConyuge.textContent = socio.cedulaconyuge || '-';
    } else {
        containerCedulaConyuge.classList.add('hidden');
        displayCedulaConyuge.textContent = '-';
    }

    infoCard.classList.remove('hidden');
}

// ==========================================
// UTILIDADES DE FECHA
// ==========================================
/**
 * Genera un ID de solicitud con formato ddmmyyyyhhmmss
 * Ejemplo: "31122025143025" para 31/12/2025 14:30:25
 */
function generarSolicitudId() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const dd = parts.find(p => p.type === 'day').value;
    const mm = parts.find(p => p.type === 'month').value;
    const yyyy = parts.find(p => p.type === 'year').value;
    const hh = parts.find(p => p.type === 'hour').value;
    const min = parts.find(p => p.type === 'minute').value;
    const ss = parts.find(p => p.type === 'second').value;
    return dd + mm + yyyy + hh + min + ss;
}

/**
 * Parsea el ID de solicitud para extraer fecha y hora
 * @param {string} solicitudId - ID en formato ddmmyyyyhhmmss
 * @returns {Object} { fecha: "31/12/2025", hora: "14:30", fechaObj: Date }
 */
function parseSolicitudId(solicitudId) {
    if (!solicitudId || solicitudId.length < 14) {
        return { fecha: 'N/A', hora: 'N/A', fechaObj: null };
    }

    try {
        const dd = solicitudId.substring(0, 2);
        const mm = solicitudId.substring(2, 4);
        const yyyy = solicitudId.substring(4, 8);
        const hh = solicitudId.substring(8, 10);
        const min = solicitudId.substring(10, 12);
        const ss = solicitudId.substring(12, 14);

        const fechaObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min), parseInt(ss));

        const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const fechaLarga = `${dd} de ${meses[parseInt(mm) - 1]} del ${yyyy}`;

        return {
            fecha: dd + '/' + mm + '/' + yyyy,
            fechaLarga: fechaLarga,
            hora: hh + ':' + min,
            fechaObj: fechaObj
        };
    } catch (e) {
        return { fecha: 'N/A', fechaLarga: 'N/A', hora: 'N/A', fechaObj: null };
    }
}

// ==========================================
// CREAR NUEVA SOLICITUD
// ==========================================
async function crearNuevaSolicitud() {
    const select = document.getElementById('select-socio');
    const montoInput = document.getElementById('input-monto');
    const plazoInput = document.getElementById('input-plazo');

    // Validaciones
    if (!select.value) {
        showToast('Por favor seleccione un socio', 'warning');
        return;
    }

    const monto = parseFloat(montoInput.value);
    if (!monto || monto <= 0) {
        showToast('Por favor ingrese un monto válido', 'warning');
        return;
    }

    const plazo = plazoInput.value;
    if (!plazo) {
        showToast('Por favor seleccione un plazo', 'warning');
        return;
    }

    // Obtener datos del socio seleccionado
    const option = select.options[select.selectedIndex];
    const socio = JSON.parse(option.dataset.socioData || '{}');

    // Generar ID de solicitud con formato ddmmyyyyhhmmss
    const solicitudId = generarSolicitudId();

    // Verificar que el usuario esté autenticado (usar variable global establecida en app.js)
    const user = window.currentUser;
    if (!user || !user.id) {
        console.error('Usuario no disponible. window.currentUser:', window.currentUser);
        showAlert('No se pudo obtener la información del usuario. Por favor, vuelva a iniciar sesión.', 'Sesión expirada', 'error');
        return;
    }

    // Preparar datos de la solicitud con TODA la info del socio disponible
    const nuevaSolicitud = {
        solicitudid: solicitudId,
        // Datos básicos del socio
        nombresocio: socio.nombre || '',
        cedulasocio: socio.cedula || '',
        direccionsocio: socio.domicilio || '',
        whatsappsocio: socio.whatsapp ? String(socio.whatsapp) : '',
        paisresidencia: socio.paisresidencia || '',
        estadocivil: socio.estadocivil || '',
        // Fotos del socio
        fotoidentidad: socio.fotoidentidad || null,
        fotodireccion: socio.fotodomicilio || null,
        fotoconid: socio.fotoidentidad || null,
        fotobien: socio.fotobien || null,
        fotofirma: socio.fotofirma || null,
        // Datos del cónyuge
        nombreconyuge: socio.nombreconyuge || '',
        cedulaconyuge: socio.cedulaconyuge || '',
        whatsappconyuge: socio.whatsappconyuge || '',
        fotoidentidadconyuge: socio.fotodocumentoconyuge || null,
        fotofirmaconyuge: socio.firmaconyuge || null,
        // Datos de referencia
        nombrereferencia: socio.nombrereferencia || '',
        whatsappreferencia: socio.whatsappreferencia ? String(socio.whatsappreferencia) : '',
        // Bien
        bien: socio.bien || '',
        // Monto, plazo y estado
        monto: monto,
        plazo: parseInt(plazo),
        estado: 'PENDIENTE',
        created_by: user.id
    };

    const btnCrear = document.getElementById('btn-crear-solicitud');
    btnCrear.disabled = true;
    btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

    try {
        const supabase = window.getSupabaseClient();

        const { data, error } = await supabase
            .from('ic_solicitud_de_credito')
            .insert([nuevaSolicitud])
            .select();

        if (error) throw error;

        console.log('✓ Solicitud creada:', data);

        // Agregar a la lista local
        if (data && data[0]) {
            allSolicitudes.unshift(data[0]);
            filteredSolicitudes = [...allSolicitudes];

            // Actualizar caché
            if (window.dataCache) {
                window.dataCache.solicitudes = allSolicitudes;
                if (!window.dataCache.lastUpdate) window.dataCache.lastUpdate = {};
                window.dataCache.lastUpdate.solicitudes = Date.now();
                if (window.saveCache) window.saveCache();
            }

            updateSolicitudesStats();
            updateSolicitudesCounts();
            renderSolicitudesGrid(filteredSolicitudes);
        }

        // Cerrar modal
        cerrarModalNuevaSolicitud();

        // Mostrar notificación de éxito
        showToast('Solicitud creada exitosamente', 'success');

    } catch (error) {
        console.error('Error al crear solicitud:', error);
        showAlert('Error al crear la solicitud: ' + error.message, 'Error', 'error');
    } finally {
        btnCrear.disabled = false;
        btnCrear.innerHTML = '<i class="fas fa-check"></i> Crear Solicitud';
    }
}

// ==========================================
// VER SOLICITUD
// ==========================================
let currentSolicitud = null;

function viewSolicitud(solicitudId) {
    const solicitud = allSolicitudes.find(s => s.solicitudid === solicitudId);
    if (!solicitud) {
        console.error('Solicitud no encontrada:', solicitudId);
        return;
    }

    currentSolicitud = solicitud;

    // Parsear fecha y hora del ID
    const { fechaLarga, hora } = parseSolicitudId(solicitud.solicitudid);

    // Formatear monto
    const montoFormatted = '$' + parseFloat(solicitud.monto || 0).toLocaleString('es-EC', {
        minimumFractionDigits: 2
    });

    // Llenar datos del modal
    document.getElementById('modal-solicitud-fecha').textContent = fechaLarga + ' a las ' + hora;
    document.getElementById('modal-solicitud-monto').textContent = montoFormatted;
    document.getElementById('modal-solicitud-plazo').textContent = (solicitud.plazo || '-') + ' meses';
    document.getElementById('modal-solicitud-nombre').textContent = solicitud.nombresocio || '-';
    document.getElementById('modal-solicitud-cedula').textContent = solicitud.cedulasocio || '-';
    document.getElementById('modal-solicitud-pais').textContent = solicitud.paisresidencia || '-';
    document.getElementById('modal-solicitud-whatsapp').textContent = solicitud.whatsappsocio || '-';
    document.getElementById('modal-solicitud-estadocivil').textContent = solicitud.estadocivil || '-';
    document.getElementById('modal-solicitud-direccion').textContent = solicitud.direccionsocio || '-';

    // Datos del cónyuge
    const conyugeEl = document.getElementById('modal-solicitud-conyuge');
    const cedulaConyugeEl = document.getElementById('modal-solicitud-cedula-conyuge');
    const containerCedulaConyuge = document.getElementById('container-modal-cedula-conyuge');

    if (conyugeEl) {
        conyugeEl.textContent = solicitud.nombreconyuge || '-';
    }

    if (cedulaConyugeEl && containerCedulaConyuge) {
        const estadoCivil = (solicitud.estadocivil || '').toUpperCase();
        if (estadoCivil === 'CASADO/A' || estadoCivil === 'UNIÓN LIBRE') {
            containerCedulaConyuge.classList.remove('hidden');
            cedulaConyugeEl.textContent = solicitud.cedulaconyuge || '-';
        } else {
            containerCedulaConyuge.classList.add('hidden');
            cedulaConyugeEl.textContent = '-';
        }
    }

    // Bien
    const bienEl = document.getElementById('modal-solicitud-bien');
    if (bienEl) {
        bienEl.textContent = solicitud.bien || '-';
    }

    // Referencia
    const refEl = document.getElementById('modal-solicitud-referencia');
    if (refEl) {
        refEl.textContent = solicitud.nombrereferencia ?
            solicitud.nombrereferencia + ' - ' + (solicitud.whatsappreferencia || '') : '-';
    }

    // Renderizar galería de fotos
    renderFotosGaleria(solicitud);

    // Estado badge
    const estadoBadge = document.getElementById('modal-solicitud-estado');
    estadoBadge.textContent = solicitud.estado || 'PENDIENTE';
    estadoBadge.className = 'badge badge-' + (solicitud.estado || 'PENDIENTE').toLowerCase();

    // Mostrar/ocultar botones según estado
    const accionesPendiente = document.getElementById('acciones-pendiente');
    const accionesAprobada = document.getElementById('acciones-aprobada');

    if (accionesPendiente) accionesPendiente.classList.add('hidden');
    if (accionesAprobada) accionesAprobada.classList.add('hidden');

    if (solicitud.estado === 'PENDIENTE') {
        if (accionesPendiente) accionesPendiente.classList.remove('hidden');
    } else if (solicitud.estado === 'APROBADA') {
        if (accionesAprobada) accionesAprobada.classList.remove('hidden');
    }

    // Abrir modal
    openSolicitudModal('modal-ver-solicitud');
}

/**
 * Renderiza la galería de fotos del modal
 */
function renderFotosGaleria(solicitud) {
    const container = document.getElementById('modal-solicitud-fotos');
    if (!container) return;

    const fotos = [
        { url: solicitud.fotoidentidad, label: 'Cédula' },
        { url: solicitud.fotodireccion, label: 'Domicilio' },
        { url: solicitud.fotoconid, label: 'Foto con ID' },
        { url: solicitud.fotobien, label: 'Bien' },
        { url: solicitud.fotofirma, label: 'Firma' },
        { url: solicitud.fotoidentidadconyuge, label: 'ID Cónyuge' },
        { url: solicitud.fotofirmaconyuge, label: 'Firma Cónyuge' },
        { url: solicitud.fotoidentidadreferencia, label: 'ID Referencia' }
    ].filter(f => f.url);

    if (fotos.length === 0) {
        container.innerHTML = '<p class="no-fotos">No hay fotos adjuntas</p>';
        return;
    }

    container.innerHTML = fotos.map(function (foto) {
        return '<div class="foto-thumb" onclick="abrirVisorImagen(\'' + foto.url + '\', \'' + foto.label + '\')">' +
            '<img src="' + foto.url + '" alt="' + foto.label + '" loading="lazy">' +
            '<span class="foto-label">' + foto.label + '</span>' +
            '</div>';
    }).join('');
}

/**
 * Abre el visor de imagen a pantalla completa
 */
function abrirVisorImagen(url, label) {
    const modal = document.getElementById('modal-visor-imagen');
    if (!modal) return;

    const img = document.getElementById('visor-imagen-src');
    const titulo = document.getElementById('visor-imagen-titulo');

    if (img) img.src = url;
    if (titulo) titulo.textContent = label;

    // Reset zoom
    if (img) {
        img.style.transform = 'scale(1)';
        img.dataset.zoom = '1';
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Cierra el visor de imagen
 */
function cerrarVisorImagen() {
    const modal = document.getElementById('modal-visor-imagen');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

/**
 * Zoom en la imagen del visor
 */
function zoomImagen(direction) {
    const img = document.getElementById('visor-imagen-src');
    if (!img) return;

    let currentZoom = parseFloat(img.dataset.zoom || '1');

    if (direction === 'in') {
        currentZoom = Math.min(currentZoom + 0.25, 3);
    } else {
        currentZoom = Math.max(currentZoom - 0.25, 0.5);
    }

    img.style.transform = 'scale(' + currentZoom + ')';
    img.dataset.zoom = currentZoom;
}

function openSolicitudModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeSolicitudModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Acciones de solicitud
async function aprobarSolicitud() {
    if (!currentSolicitud) return;

    // En lugar de aprobar directamente, abrimos el modal de ajuste de monto/plazo
    abrirModalAprobacion();
}

function abrirModalAprobacion() {
    const existingModal = document.getElementById('modal-ajuste-aprobacion');
    if (existingModal) existingModal.remove();

    const montoActual = parseFloat(currentSolicitud.monto || 0);
    const plazoActual = parseInt(currentSolicitud.plazo || 12);

    const modalHTML = `
        <div id="modal-ajuste-aprobacion" class="modal">
            <div class="modal-backdrop" onclick="cerrarModalAprobacion()"></div>
            <div class="modal-card modal-nueva-solicitud" style="max-width: 450px;">
                <div class="modal-header">
                    <h3><i class="fas fa-check-circle"></i> Confirmar Aprobación</h3>
                    <button class="modal-close" onclick="cerrarModalAprobacion()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="solicitud-info-resumen" style="background: rgba(14, 89, 54, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 20px; border: 1px dashed var(--primary);">
                        <p style="margin: 0; color: var(--text-dark); font-size: 0.95rem;">
                            Ajuste las condiciones finales para: <br>
                            <strong style="color: var(--primary); font-size: 1.1rem;">${currentSolicitud.nombresocio}</strong>
                        </p>
                    </div>
                    
                    <div class="form-group">
                        <label><i class="fas fa-dollar-sign"></i> Monto a Aprobar ($):</label>
                        <input type="number" id="aprobacion-monto" class="form-control" value="${montoActual.toFixed(2)}" step="0.01">
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-calendar-alt"></i> Plazo (Meses):</label>
                        <input type="number" id="aprobacion-plazo" class="form-control" value="${plazoActual}" step="1">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="cerrarModalAprobacion()">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn btn-primary" onclick="ejecutarAprobacion()">
                        <i class="fas fa-check"></i> Confirmar y Aprobar
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function cerrarModalAprobacion() {
    const modal = document.getElementById('modal-ajuste-aprobacion');
    if (modal) modal.remove();
}

async function ejecutarAprobacion() {
    if (!currentSolicitud) return;

    const nuevoMonto = parseFloat(document.getElementById('aprobacion-monto').value);
    const nuevoPlazo = parseInt(document.getElementById('aprobacion-plazo').value);

    if (isNaN(nuevoMonto) || nuevoMonto <= 0) {
        showToast('Por favor ingrese un monto válido', 'error');
        return;
    }

    if (isNaN(nuevoPlazo) || nuevoPlazo <= 0) {
        showToast('Por favor ingrese un plazo válido', 'error');
        return;
    }

    cerrarModalAprobacion();

    try {
        const supabase = window.getSupabaseClient();

        // SI ES NO SOCIO (ID de 17 caracteres), AGREGAR A LA TABLA DE SOCIOS
        if (currentSolicitud.solicitudid.length === 17) {
            showToast('Registrando nuevo socio...', 'info');

            const nuevoSocio = {
                idsocio: currentSolicitud.cedulasocio,
                nombre: currentSolicitud.nombresocio,
                cedula: currentSolicitud.cedulasocio,
                domicilio: currentSolicitud.direccionsocio,
                fotoidentidad: currentSolicitud.fotoidentidad,
                fotodomicilio: currentSolicitud.fotodireccion,
                whatsapp: currentSolicitud.whatsappsocio ? parseInt(currentSolicitud.whatsappsocio.replace(/\D/g, '')) : null,
                paisresidencia: currentSolicitud.paisresidencia,
                estadocivil: currentSolicitud.estadocivil,
                nombrereferencia: currentSolicitud.nombrereferencia,
                whatsappreferencia: currentSolicitud.whatsappreferencia ? parseInt(currentSolicitud.whatsappreferencia.replace(/\D/g, '')) : null,
                whatsappconyuge: currentSolicitud.whatsappconyuge,
                nombreconyuge: currentSolicitud.nombreconyuge,
                cedulaconyuge: currentSolicitud.cedulaconyuge ? parseInt(currentSolicitud.cedulaconyuge.toString().replace(/\D/g, '')) : null,
                fotodocumentoconyuge: currentSolicitud.fotoidentidadconyuge,
                bien: currentSolicitud.bien,
                fotobien: currentSolicitud.fotobien,
                firmaconyuge: currentSolicitud.fotofirmaconyuge,
                fotofirma: currentSolicitud.fotofirma,
                tipo: 'SOCIO'
            };

            const { error: errorSocio } = await supabase
                .from('ic_socios')
                .upsert(nuevoSocio, { onConflict: 'idsocio' });

            if (errorSocio) {
                console.error('Error al registrar socio:', errorSocio);
                throw new Error('No se pudo registrar al socio: ' + errorSocio.message);
            }

            showToast('Socio registrado exitosamente', 'success');
        }

        // Actualizar estado, monto y plazo
        const { error } = await supabase
            .from('ic_solicitud_de_credito')
            .update({
                estado: 'APROBADA',
                monto: nuevoMonto,
                plazo: nuevoPlazo
            })
            .eq('solicitudid', currentSolicitud.solicitudid);

        if (error) throw error;

        showToast('Solicitud aprobada correctamente', 'success');
        closeSolicitudModal('modal-ver-solicitud');
        await loadSolicitudesFromDB();
    } catch (error) {
        console.error('Error al aprobar:', error);
        showToast('Error al aprobar la solicitud: ' + error.message, 'error');
    }
}

async function anularSolicitud() {
    if (!currentSolicitud) return;

    const confirmed = await showConfirm(
        '¿Está seguro de anular esta solicitud?',
        'Anular Solicitud',
        { confirmText: 'Sí, Anular', cancelText: 'Cancelar', type: 'danger' }
    );
    if (!confirmed) return;

    try {
        const supabase = window.getSupabaseClient();
        const { error } = await supabase
            .from('ic_solicitud_de_credito')
            .update({ estado: 'ANULADA' })
            .eq('solicitudid', currentSolicitud.solicitudid);

        if (error) throw error;

        showToast('Solicitud anulada', 'info');
        closeSolicitudModal('modal-ver-solicitud');
        await loadSolicitudesFromDB();
    } catch (error) {
        console.error('Error al anular:', error);
        showToast('Error al anular la solicitud', 'error');
    }
}

async function colocarCredito() {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('DESEMBOLSO DE CRÉDITO')) {
            return;
        }
    }

    if (!currentSolicitud) return;

    // Llenar datos básicos en el modal
    document.getElementById('colocar-nombre-socio').textContent = currentSolicitud.nombresocio || '-';
    document.getElementById('colocar-monto-solicitado').textContent = '$' + parseFloat(currentSolicitud.monto || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('colocar-plazo-solicitado').textContent = (currentSolicitud.plazo || '-') + ' meses';

    const today = new Date();
    document.getElementById('colocar-fecha-desembolso').textContent = formatDate(today).toUpperCase();

    // Resetear selector de día de pago (radio buttons)
    const radio15 = document.getElementById('dia-15');
    if (radio15) radio15.checked = true;

    // Resetear tasa de interés
    const tasaInput = document.getElementById('input-tasa-interes');
    if (tasaInput) tasaInput.value = '2.00';

    // Resetear sección de garante
    resetGaranteSection();

    // Calcular inicialmente
    actualizarCalculosColocacion();

    // Abrir modal
    openSolicitudModal('modal-colocar-credito');
}

/**
 * Toggle para mostrar/ocultar la sección de garante
 */
function toggleGaranteSection() {
    const checkbox = document.getElementById('switch-requiere-garante');
    const formContainer = document.getElementById('garante-form-container');
    const statusText = document.getElementById('garante-status');

    if (checkbox && checkbox.checked) {
        formContainer?.classList.remove('hidden');
        if (statusText) {
            statusText.textContent = 'Sí';
            statusText.classList.add('active');
        }
    } else {
        formContainer?.classList.add('hidden');
        if (statusText) {
            statusText.textContent = 'No';
            statusText.classList.remove('active');
        }
    }
}

/**
 * Resetea la sección de garante a su estado inicial
 */
function resetGaranteSection() {
    const checkbox = document.getElementById('switch-requiere-garante');
    const formContainer = document.getElementById('garante-form-container');
    const statusText = document.getElementById('garante-status');

    // Desactivar switch
    if (checkbox) checkbox.checked = false;

    // Ocultar formulario
    formContainer?.classList.add('hidden');

    // Resetear status text
    if (statusText) {
        statusText.textContent = 'No';
        statusText.classList.remove('active');
    }

    // Limpiar campos del formulario
    const campos = ['garante-nombre', 'garante-cedula', 'garante-domicilio', 'garante-telefono', 'garante-whatsapp'];
    campos.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

/**
 * Obtiene los datos del garante del formulario
 * @returns {object|null} Datos del garante o null si no requiere
 */
function obtenerDatosGarante() {
    const checkbox = document.getElementById('switch-requiere-garante');

    if (!checkbox || !checkbox.checked) {
        return null;
    }

    const nombre = document.getElementById('garante-nombre')?.value?.trim() || '';
    const cedula = document.getElementById('garante-cedula')?.value?.trim() || '';

    // Validar campos obligatorios
    if (!nombre || !cedula) {
        return { error: true, message: 'El nombre y cédula del garante son obligatorios' };
    }

    return {
        nombre_garante: nombre,
        cedula_garante: cedula,
        domicilio_garante: document.getElementById('garante-domicilio')?.value?.trim() || null,
        telefono_garante: document.getElementById('garante-telefono')?.value?.trim() || null,
        whatsapp_garante: document.getElementById('garante-whatsapp')?.value?.trim() || null
    };
}

// Función para ajustar la tasa de interés con botones +/-
function ajustarTasa(delta) {
    const input = document.getElementById('input-tasa-interes');
    if (!input) return;

    let valor = parseFloat(input.value) || 2;
    valor = Math.round((valor + delta) * 100) / 100; // Redondear a 2 decimales

    // Limitar entre 0.25 y 15
    valor = Math.max(0.25, Math.min(15, valor));

    input.value = valor.toFixed(2);
    actualizarCalculosColocacion();
}

// Exponer funciones globalmente
window.toggleGaranteSection = toggleGaranteSection;
window.ajustarTasa = ajustarTasa;

function actualizarCalculosColocacion() {
    if (!currentSolicitud) return;

    const capital = parseFloat(currentSolicitud.monto || 0);
    const plazo = parseInt(currentSolicitud.plazo || 12);

    // Obtener día de pago de los radio buttons
    let diaPago = 15;
    const radios = document.getElementsByName('dia-pago');
    for (const r of radios) {
        if (r.checked) {
            diaPago = parseInt(r.value);
            break;
        }
    }

    // Obtener tasa de interés del input
    const tasaInput = document.getElementById('input-tasa-interes');
    const tasaMensual = tasaInput ? parseFloat(tasaInput.value) / 100 : 0.02;

    const todayStr = todayISODate();
    const today = parseDate(todayStr);

    // 1. Calcular Fecha de Primer Pago (Regla de los 25 días)
    // Buscamos la primera ocurrencia del día de pago que esté a más de 25 días
    let fechaPrimerPago = new Date(today.getFullYear(), today.getMonth(), diaPago);

    // Si el día ya pasó este mes, vamos al siguiente
    if (fechaPrimerPago <= today) {
        fechaPrimerPago.setMonth(fechaPrimerPago.getMonth() + 1);
    }

    // Calculamos diferencia en días
    let diffMs = fechaPrimerPago.getTime() - today.getTime();
    let diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Si hay 25 días o menos, saltamos un mes más
    if (diffDays <= 25) {
        fechaPrimerPago.setMonth(fechaPrimerPago.getMonth() + 1);
    }

    // 2. Calcular Fecha de Fin de Crédito
    // La fecha base es un mes antes del primer pago
    let fechaBase = new Date(fechaPrimerPago.getTime());
    fechaBase.setMonth(fechaBase.getMonth() - 1);

    let fechaFinCredito = new Date(fechaBase.getTime());
    fechaFinCredito.setMonth(fechaFinCredito.getMonth() + plazo);

    // 3. Calcular Días Totales para Interés
    let diasTotales = Math.round((fechaFinCredito.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // 4. Calcular Gastos Administrativos (según calculadora.html)
    let gastosAdmin = 0;
    if (capital < 5000) {
        gastosAdmin = capital * 0.038;
    } else if (capital < 20000) {
        gastosAdmin = capital * 0.023;
    } else {
        gastosAdmin = capital * 0.018;
    }

    // 5. Calcular Interés Total (usando la tasa mensual del input)
    const tasaAnual = tasaMensual * 12;
    const tasaDiaria = tasaAnual / 365;

    // Redondeamos cada componente a 2 decimales para evitar errores de precisión
    const interesTotal = Math.round(capital * tasaDiaria * diasTotales * 100) / 100;
    const gastosAdminRedondeado = Math.round(gastosAdmin * 100) / 100;
    const totalPagar = capital + interesTotal + gastosAdminRedondeado;

    // 6. Calcular Cuotas Estimadas (según calculadora.html)
    // Cuota Base = Total a Pagar / Plazo (redondeado hacia arriba)
    const cuotaBase = Math.ceil(totalPagar / plazo);

    // Ahorro Programado = 10% del (Capital + Intereses) / Plazo (redondeado hacia arriba)
    const ahorroTotal = (capital + interesTotal) * 0.10;
    const ahorroPorCuota = Math.ceil(ahorroTotal / plazo);
    const cuotaTotal = cuotaBase + ahorroPorCuota;

    // 7. Actualizar UI
    document.getElementById('colocar-fecha-primer-pago').textContent = formatDate(fechaPrimerPago).toUpperCase();

    // Usamos en-US para asegurar el formato $X,XXX.XX (punto para decimales)
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    // Actualizar tasa en la vista
    const tasaDisplay = document.getElementById('colocar-tasa-interes');
    if (tasaDisplay) {
        tasaDisplay.textContent = (tasaMensual * 100).toFixed(2) + '%';
    }

    document.getElementById('colocar-gastos-admin').textContent = formatter.format(gastosAdminRedondeado);
    document.getElementById('colocar-interes-total').textContent = formatter.format(interesTotal);
    document.getElementById('colocar-total-pagar').textContent = formatter.format(totalPagar);

    document.getElementById('colocar-cuota-base').textContent = formatter.format(cuotaBase);
    document.getElementById('colocar-cuota-total').textContent = formatter.format(cuotaTotal);

    // Guardar datos calculados temporalmente para la confirmación
    window.currentColocacionData = {
        fechaPrimerPago,
        fechaFinCredito,
        fechaBase,
        diasTotales,
        gastosAdmin,
        interesTotal,
        totalPagar,
        cuotaBase,
        ahorroPorCuota,
        ahorroTotal,
        cuotaTotal,
        diaPago,
        tasaMensual
    };
}

/**
 * Prepara los datos para la simulación técnica en PDF
 */
async function prepararSimulacionPDF() {
    if (!currentSolicitud || !window.currentColocacionData) {
        showToast('No hay datos de colocación para simular', 'error');
        return;
    }

    const btn = document.getElementById('btn-simular-pdf');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    }

    try {
        const {
            fechaPrimerPago,
            fechaFinCredito,
            fechaBase,
            diasTotales,
            gastosAdmin,
            interesTotal,
            totalPagar,
            cuotaBase,
            ahorroPorCuota,
            ahorroTotal,
            cuotaTotal,
            diaPago,
            tasaMensual
        } = window.currentColocacionData;

        const capital = parseFloat(currentSolicitud.monto);
        const plazo = parseInt(currentSolicitud.plazo);
        const idSolicitud = currentSolicitud.solicitudid;
        const codigoCredito = `SIM-${Date.now().toString(36).toUpperCase()}`;
        const idCredito = 'UUID-SIMULADO-' + Math.random().toString(36).substring(2, 10);
        const idSocio = currentSolicitud.cedulasocio;
        const todayStr = todayISODate();

        // 1. Simular ic_creditos
        const creditoSim = {
            id_credito: idCredito,
            id_socio: idSocio,
            id_solicitud: idSolicitud,
            codigo_credito: codigoCredito,
            capital: capital,
            gastos_administrativos: gastosAdmin,
            tasa_interes_mensual: tasaMensual * 100,
            total_interes: interesTotal,
            total_dias: diasTotales,
            plazo: plazo,
            dia_pago: diaPago,
            cuota_base: cuotaBase,
            ahorro_programado_cuota: ahorroPorCuota,
            cuota_con_ahorro: cuotaTotal,
            fecha_desembolso: todayStr,
            fecha_base: toISODate(fechaBase),
            fecha_primer_pago: toISODate(fechaPrimerPago),
            fecha_fin_credito: toISODate(fechaFinCredito),
            estado_credito: 'SIMULADO'
        };

        // 2. Simular ic_creditos_amortizacion
        const amortizacion = [];
        let saldoCapital = capital;
        let fechaAnterior = parseDate(todayStr);
        const unDiaEnMs = 1000 * 60 * 60 * 24;
        const sumOfDigits = plazo * (plazo + 1) / 2;
        const gastosPorCuota = parseFloat((gastosAdmin / plazo).toFixed(2));
        let interesAcumulado = 0;
        let capitalAcumulado = 0;
        let gastosAcumulados = 0;

        for (let i = 1; i <= plazo; i++) {
            const fechaVenc = new Date(fechaPrimerPago.getTime());
            fechaVenc.setMonth(fechaPrimerPago.getMonth() + (i - 1));
            const diasPeriodo = Math.ceil((fechaVenc - fechaAnterior) / unDiaEnMs);

            // 1. Interés preliminar (Rule of 78s)
            let interesDelMes = parseFloat((interesTotal * ((plazo - i + 1) / sumOfDigits)).toFixed(2));

            // 2. Capital de la cuota
            let capitalPeriodo = parseFloat((cuotaBase - interesDelMes - gastosPorCuota).toFixed(2));
            let cuotaBaseReal = cuotaBase;

            // 3. Ajustar última cuota para saldar capital
            if (i === plazo) {
                capitalPeriodo = parseFloat(saldoCapital.toFixed(2));
                const interesRestante = parseFloat((interesTotal - interesAcumulado).toFixed(2));
                const gastosRestante = parseFloat((gastosAdmin - gastosAcumulados).toFixed(2));
                cuotaBaseReal = parseFloat((capitalPeriodo + interesRestante + gastosRestante).toFixed(2));
            }

            // 4. REGLA SOLICITADA: El interés es el remanente de la cuota base
            // Esto asegura que: capital + interés + gastos = cuotaBaseReal
            const pagoGastos = i === plazo ? parseFloat((gastosAdmin - gastosAcumulados).toFixed(2)) : gastosPorCuota;
            interesDelMes = parseFloat((cuotaBaseReal - capitalPeriodo - pagoGastos).toFixed(2));

            saldoCapital -= capitalPeriodo;
            if (saldoCapital < 0.01) saldoCapital = 0;

            amortizacion.push({
                numero_cuota: i,
                fecha_vencimiento: toISODate(fechaVenc),
                dias_periodo: diasPeriodo,
                pago_capital: capitalPeriodo,
                pago_interes: interesDelMes,
                pago_gastos_admin: pagoGastos,
                ahorro_programado: ahorroPorCuota,
                cuota_base: cuotaBaseReal,
                cuota_total: cuotaBaseReal + ahorroPorCuota,
                saldo_capital: saldoCapital,
                estado_cuota: 'SIMULADO'
            });

            interesAcumulado += interesDelMes;
            capitalAcumulado += capitalPeriodo;
            gastosAcumulados += pagoGastos;
            fechaAnterior = fechaVenc;
        }

        // 3. Simular ic_creditos_ahorro
        const ahorros = amortizacion.map(a => ({
            id_ahorro: 'AHORRO-SIM-' + a.numero_cuota,
            id_credito: idCredito,
            id_detalle: 'DET-SIM-' + a.numero_cuota,
            numero_cuota: a.numero_cuota,
            monto: a.ahorro_programado,
            estado: 'SIMULADO',
            created_at: todayStr
        }));

        // 4. Simular ic_creditos_documentos
        const documentos = {
            id_documento: 'DOC-SIM',
            id_credito: idCredito,
            contrato_generado: false,
            contrato_firmado: false,
            pagare_generado: false,
            pagare_firmado: false,
            tabla_amortizacion_generada: true,
            tabla_amortizacion_firmada: false,
            documento_garante_firmado: false,
            created_at: todayStr
        };

        // 5. Simular ic_creditos_historial
        const historial = {
            id_historial: 'HIST-SIM',
            id_credito: idCredito,
            estado_anterior: 'PENDIENTE',
            estado_nuevo: 'SIMULADO',
            fecha_cambio: todayStr,
            usuario: 'SIMULADOR',
            motivo: 'Simulación técnica de colocación',
            created_at: todayStr
        };

        const datosSimulacion = {
            fechaGeneracion: formatDateTime(new Date()),
            credito: creditoSim,
            amortizacion: amortizacion,
            ahorros: ahorros,
            documentos: documentos,
            historial: historial,
            solicitud: currentSolicitud,
            garante: document.getElementById('switch-requiere-garante')?.checked ? {
                id_garante: 'GAR-SIM',
                id_credito: idCredito,
                nombre_garante: document.getElementById('garante-nombre')?.value || 'GARANTE SIMULADO',
                cedula_garante: document.getElementById('garante-cedula')?.value || '0000000000',
                documentos_completos: false,
                created_at: todayStr
            } : null
        };

        await generarPDFColocacion(datosSimulacion);
        showToast('Simulación generada exitosamente', 'success');

    } catch (error) {
        console.error('Error en simulación:', error);
        showToast('Error al generar simulación: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-file-pdf"></i> Simular PDF';
        }
    }
}

/**
 * Genera un PDF con la simulación REALISTA de inserción en todas las tablas
 * Muestra exactamente cómo se insertarían los datos en cada tabla de la base de datos
 */
async function generarPDFColocacion(datosSimulacion) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    let y = 15;

    // Colores corporativos
    const colors = {
        primary: [14, 89, 54],      // #0E5936
        secondary: [22, 115, 54],   // #167336
        tertiary: [17, 76, 89],     // #114C59
        contrast1: [191, 75, 33],   // #BF4B21
        contrast2: [242, 177, 56],  // #F2B138
        textDark: [51, 51, 51],     // #333
        lightGray: [240, 240, 240], // #f0f0f0
        white: [255, 255, 255],
        slate800: [30, 41, 59],
        slate600: [71, 85, 105],
        slate400: [148, 163, 184],
        slate200: [226, 232, 240],
        slate100: [241, 245, 249]
    };

    const formatCurr = (val) => '$' + parseFloat(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Función para cargar imagen
    const loadImage = (url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    };

    // Cargar logo
    const logoUrl = 'https://lh3.googleusercontent.com/d/15J6Aj6ZwkVrmDfs6uyVk-oG0Mqr-i9Jn=w2048?name=inka%20corp%20normal.png';
    const logoImg = await loadImage(logoUrl);

    // --- HEADER CORPORATIVO ---
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Línea decorativa superior
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, pageWidth, 2, 'F');

    // Logo
    if (logoImg) {
        doc.addImage(logoImg, 'PNG', 15, 6, 28, 28);
    }

    // Título principal
    doc.setTextColor(...colors.primary);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SIMULACIÓN DE COLOCACIÓN', 55, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('REPORTE TÉCNICO DE ESTRUCTURA DE DATOS', 55, 26);

    // Fecha y Código
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Generado: ${datosSimulacion.fechaGeneracion}`, pageWidth - margin, 18, { align: 'right' });
    doc.text(`Código: ${datosSimulacion.credito.codigo_credito}`, pageWidth - margin, 24, { align: 'right' });

    // Línea divisoria
    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    // Línea de acento dorada
    doc.setDrawColor(...colors.contrast2);
    doc.setLineWidth(1.5);
    doc.line(margin, 42, pageWidth - margin, 42);

    y = 50;

    // ========== SECCIÓN 1: TABLA ic_creditos ==========
    doc.setTextColor(...colors.primary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('1. ESTRUCTURA: ic_creditos', margin, y);
    y += 6;

    // Tabla con datos del crédito
    doc.setFillColor(...colors.slate100);
    doc.rect(margin, y, pageWidth - (margin * 2), 6, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...colors.slate800);
    doc.setFont('helvetica', 'bold');
    doc.text('CAMPO / COLUMNA', margin + 2, y + 4);
    doc.text('VALOR SIMULADO', pageWidth / 2 - 10, y + 4);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.slate600);
    const creditoData = datosSimulacion.credito;
    const creditoFields = [
        ['id_credito (UUID)', creditoData.id_credito],
        ['id_socio', creditoData.id_socio],
        ['id_solicitud', creditoData.id_solicitud],
        ['codigo_credito', creditoData.codigo_credito],
        ['capital', formatCurr(creditoData.capital)],
        ['gastos_administrativos', formatCurr(creditoData.gastos_administrativos)],
        ['tasa_interes_mensual', creditoData.tasa_interes_mensual + '%'],
        ['total_interes', formatCurr(creditoData.total_interes)],
        ['total_dias', creditoData.total_dias + ' días'],
        ['plazo', creditoData.plazo + ' meses'],
        ['dia_pago', creditoData.dia_pago],
        ['cuota_base', formatCurr(creditoData.cuota_base)],
        ['ahorro_programado_cuota', formatCurr(creditoData.ahorro_programado_cuota)],
        ['cuota_con_ahorro', formatCurr(creditoData.cuota_con_ahorro)],
        ['fecha_desembolso', creditoData.fecha_desembolso],
        ['fecha_primer_pago', creditoData.fecha_primer_pago],
        ['fecha_fin_credito', creditoData.fecha_fin_credito],
        ['estado_credito', creditoData.estado_credito]
    ];

    creditoFields.forEach((row, idx) => {
        if (idx % 2 === 0) {
            doc.setFillColor(...colors.white);
        } else {
            doc.setFillColor(250, 250, 252);
        }
        doc.rect(margin, y, pageWidth - (margin * 2), 5, 'F');
        doc.setFontSize(6.5);
        doc.text(row[0], margin + 2, y + 3.5);
        doc.text(String(row[1]), pageWidth / 2 - 10, y + 3.5);
        y += 5;
    });

    // ========== NUEVA PÁGINA - SECCIÓN 2: ic_creditos_amortizacion ==========
    doc.addPage();
    y = 20;

    doc.setTextColor(...colors.primary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('2. ESTRUCTURA: ic_creditos_amortizacion', margin, y);
    doc.setFontSize(8);
    doc.setTextColor(...colors.slate600);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${datosSimulacion.amortizacion.length} registros)`, margin + 80, y);
    y += 6;

    // Encabezados de tabla de amortización
    const amortHeaders = ['#', 'Vencimiento', 'Días', 'Capital', 'Interés', 'Gastos', 'Ahorro', 'Cuota Base', 'Cuota Total', 'Saldo'];
    const amortWidths = [8, 22, 12, 20, 18, 18, 18, 22, 22, 20];

    doc.setFillColor(...colors.primary);
    doc.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
    doc.setFontSize(6);
    doc.setTextColor(...colors.white);
    doc.setFont('helvetica', 'bold');

    let xPos = margin;
    amortHeaders.forEach((h, i) => {
        doc.text(h, xPos + 1, y + 5);
        xPos += amortWidths[i];
    });
    y += 8;

    // Filas de amortización
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.slate600);

    let totales = { capital: 0, interes: 0, gastos: 0, ahorro: 0, cuotaBase: 0, cuotaTotal: 0 };

    datosSimulacion.amortizacion.forEach((row, index) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
            // Re-dibujar encabezados
            doc.setFillColor(...colors.primary);
            doc.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
            doc.setFontSize(6);
            doc.setTextColor(...colors.white);
            doc.setFont('helvetica', 'bold');
            let tempX = margin;
            amortHeaders.forEach((h, i) => {
                doc.text(h, tempX + 1, y + 5);
                tempX += amortWidths[i];
            });
            y += 8;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colors.slate600);
        }

        // Alternar colores de fila
        if (index % 2 === 0) {
            doc.setFillColor(...colors.white);
        } else {
            doc.setFillColor(...colors.slate100);
        }
        doc.rect(margin, y, pageWidth - (margin * 2), 6, 'F');

        totales.capital += row.pago_capital;
        totales.interes += row.pago_interes;
        totales.gastos += row.pago_gastos_admin;
        totales.ahorro += row.ahorro_programado;
        totales.cuotaBase += row.cuota_base;
        totales.cuotaTotal += row.cuota_total;

        const rowData = [
            row.numero_cuota.toString(),
            row.fecha_vencimiento,
            row.dias_periodo.toString(),
            formatCurr(row.pago_capital),
            formatCurr(row.pago_interes),
            formatCurr(row.pago_gastos_admin),
            formatCurr(row.ahorro_programado),
            formatCurr(row.cuota_base),
            formatCurr(row.cuota_total),
            formatCurr(row.saldo_capital)
        ];

        doc.setFontSize(6);
        xPos = margin;
        rowData.forEach((data, i) => {
            doc.text(data, xPos + 1, y + 4);
            xPos += amortWidths[i];
        });
        y += 6;
    });

    // Fila de totales
    doc.setFillColor(...colors.contrast2);
    doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(...colors.textDark);
    doc.setFont('helvetica', 'bold');
    xPos = margin;
    const totalesRow = [
        'TOTAL',
        '',
        '',
        formatCurr(totales.capital),
        formatCurr(totales.interes),
        formatCurr(totales.gastos),
        formatCurr(totales.ahorro),
        formatCurr(totales.cuotaBase),
        formatCurr(totales.cuotaTotal),
        '$0.00'
    ];
    totalesRow.forEach((data, i) => {
        doc.text(data, xPos + 1, y + 4.5);
        xPos += amortWidths[i];
    });
    y += 12;

    // ========== SECCIÓN 3: ic_creditos_ahorro ==========
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setTextColor(...colors.primary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('3. ESTRUCTURA: ic_creditos_ahorro', margin, y);
    y += 6;

    // Encabezados de ahorro
    const ahorroHeaders = ['id_ahorro', 'id_credito', 'cuota', 'monto', 'estado', 'created_at'];
    const ahorroWidths = [40, 40, 20, 30, 25, 25];

    doc.setFillColor(...colors.primary);
    doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
    doc.setFontSize(6);
    doc.setTextColor(...colors.white);
    doc.setFont('helvetica', 'bold');
    xPos = margin;
    ahorroHeaders.forEach((h, i) => {
        doc.text(h, xPos + 1, y + 4.5);
        xPos += ahorroWidths[i];
    });
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.slate600);
    const ahorrosToShow = datosSimulacion.ahorros.length <= 10
        ? datosSimulacion.ahorros
        : [...datosSimulacion.ahorros.slice(0, 7), null, ...datosSimulacion.ahorros.slice(-3)];

    ahorrosToShow.forEach((row, index) => {
        if (row === null) {
            doc.setFillColor(...colors.slate200);
            doc.rect(margin, y, pageWidth - (margin * 2), 5, 'F');
            doc.setFontSize(6);
            doc.text('... (registros intermedios omitidos) ...', pageWidth / 2, y + 3.5, { align: 'center' });
            y += 5;
            return;
        }

        if (index % 2 === 0) {
            doc.setFillColor(...colors.white);
        } else {
            doc.setFillColor(...colors.slate100);
        }
        doc.rect(margin, y, pageWidth - (margin * 2), 5, 'F');

        const rowData = [
            row.id_ahorro.substring(0, 18) + '...',
            row.id_credito.substring(0, 18) + '...',
            row.numero_cuota.toString(),
            formatCurr(row.monto),
            row.estado,
            row.created_at.substring(0, 10)
        ];

        doc.setFontSize(6);
        xPos = margin;
        rowData.forEach((data, i) => {
            doc.text(data, xPos + 1, y + 3.5);
            xPos += ahorroWidths[i];
        });
        y += 5;
    });

    // ========== FOOTER ==========
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(...colors.slate400);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, 287, { align: 'center' });
        doc.text('INKA CORP - Reporte de Simulación Técnica', margin, 287);
        doc.text(datosSimulacion.fechaGeneracion, pageWidth - margin, 287, { align: 'right' });
    }

    const fileName = `Simulacion_Colocacion_${datosSimulacion.credito.codigo_credito}.pdf`;
    doc.save(fileName);
}

async function confirmarColocacionCredito() {
    if (!currentSolicitud || !window.currentColocacionData) {
        showToast('No hay datos de colocación para confirmar', 'error');
        return;
    }

    const {
        fechaPrimerPago,
        fechaFinCredito,
        fechaBase,
        diasTotales,
        gastosAdmin,
        interesTotal,
        totalPagar,
        cuotaBase,
        ahorroPorCuota,
        ahorroTotal,
        cuotaTotal,
        diaPago,
        tasaMensual
    } = window.currentColocacionData;

    const capital = parseFloat(currentSolicitud.monto);
    const plazo = parseInt(currentSolicitud.plazo);
    const idSolicitud = currentSolicitud.solicitudid;

    // Verificar si requiere garante y validar datos
    const requiereGarante = document.getElementById('switch-requiere-garante')?.checked || false;
    const datosGaranteForm = obtenerDatosGarante();

    if (requiereGarante && datosGaranteForm?.error) {
        showToast(datosGaranteForm.message, 'error');
        return;
    }

    // Función local para formatear números
    const fmtNum = (n) => parseFloat(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Mostrar confirmación antes de proceder
    const confirmacion = await showConfirm(
        `<div style="text-align:left;">
            <p><strong>Capital:</strong> $${fmtNum(capital)}</p>
            <p><strong>Plazo:</strong> ${plazo} meses</p>
            <p><strong>Cuota Total:</strong> $${fmtNum(cuotaTotal)}</p>
            <p><strong>Tasa:</strong> ${(tasaMensual * 100).toFixed(2)}% mensual</p>
            <p style="margin-top:12px;"><em>Esta acción creará el préstamo en la base de datos.</em></p>
        </div>`,
        '¿Colocar este Préstamo?',
        { confirmText: 'Sí, Colocar', cancelText: 'Cancelar', type: 'warning' }
    );

    if (!confirmacion) return;

    try {
        // Mostrar screen blocker
        mostrarScreenBlocker('Iniciando colocación de préstamo...');

        // Obtener cliente Supabase
        const supabase = window.getSupabaseClient();

        // Obtener usuario actual
        const currentUser = window.getCurrentUser();
        const userId = currentUser?.id || null;
        const userName = currentUser?.nombre || 'Sistema';

        // Generar código de préstamo único
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const codigoCredito = `PRE-${timestamp}-${random}`;

        const now = new Date();
        const nowISO = now.toISOString();
        const todayStr = todayISODate();

        // Obtener datos del socio desde caché
        const socios = window.dataCache?.socios || [];
        const socioData = socios.find(s => s.cedula === currentSolicitud.cedulasocio) || {};
        const idSocio = socioData.idsocio || currentSolicitud.cedulasocio;

        // ========== 1. INSERTAR EN ic_creditos ==========
        actualizarScreenBlocker('Paso 1/7: Creando registro de préstamo...', 10);

        const creditoData = {
            id_socio: idSocio,
            id_solicitud: idSolicitud,
            codigo_credito: codigoCredito,
            capital: capital,
            gastos_administrativos: parseFloat(gastosAdmin.toFixed(2)),
            // capital_financiado es GENERATED ALWAYS, no se incluye
            tasa_interes_mensual: parseFloat((tasaMensual * 100).toFixed(2)),
            total_interes: parseFloat(interesTotal.toFixed(2)),
            total_dias: diasTotales,
            plazo: plazo,
            dia_pago: diaPago,
            cuota_base: parseFloat(cuotaBase.toFixed(2)),
            ahorro_programado_cuota: parseFloat(ahorroPorCuota.toFixed(2)),
            ahorro_programado_total: parseFloat((ahorroPorCuota * plazo).toFixed(2)),
            cuota_con_ahorro: parseFloat(cuotaTotal.toFixed(2)),
            fecha_desembolso: todayStr,
            fecha_base: toISODate(fechaBase),
            fecha_primer_pago: toISODate(fechaPrimerPago),
            fecha_fin_credito: toISODate(fechaFinCredito),
            estado_credito: 'PENDIENTE',
            cuotas_pagadas: 0,
            cuotas_en_mora: 0,
            documentos_generados: false,
            garante: requiereGarante,
            creado_por: userId,
            observaciones: `Préstamo colocado desde solicitud ${idSolicitud} por ${userName}`
        };

        const { data: creditoInsertado, error: errorCredito } = await supabase
            .from('ic_creditos')
            .insert(creditoData)
            .select('id_credito, codigo_credito')
            .single();

        if (errorCredito) {
            throw new Error(`Error al crear préstamo: ${errorCredito.message}`);
        }

        const idCredito = creditoInsertado.id_credito;

        // ========== 2. INSERTAR EN ic_creditos_amortizacion ==========
        actualizarScreenBlocker('Paso 2/7: Generando tabla de amortización...', 25);

        const amortizacion = [];
        let saldoCapital = capital;
        let fechaAnterior = parseDate(todayStr);
        const unDiaEnMs = 1000 * 60 * 60 * 24;

        // Suma de dígitos para distribución de interés (Rule of 78s)
        const sumOfDigits = plazo * (plazo + 1) / 2;
        const gastosPorCuota = parseFloat((gastosAdmin / plazo).toFixed(2));
        let interesAcumulado = 0;
        let capitalAcumulado = 0;
        let gastosAcumulados = 0;

        for (let i = 1; i <= plazo; i++) {
            const fechaVenc = new Date(fechaPrimerPago.getTime());
            fechaVenc.setMonth(fechaPrimerPago.getMonth() + (i - 1));
            const diasPeriodo = Math.ceil((fechaVenc - fechaAnterior) / unDiaEnMs);

            // 1. Interés preliminar (Rule of 78s)
            let interesDelMes = parseFloat((interesTotal * ((plazo - i + 1) / sumOfDigits)).toFixed(2));

            // 2. Capital de la cuota
            let capitalPeriodo = parseFloat((cuotaBase - interesDelMes - gastosPorCuota).toFixed(2));
            let cuotaBaseReal = cuotaBase;

            // 3. Ajustar última cuota para saldar capital
            if (i === plazo) {
                capitalPeriodo = parseFloat(saldoCapital.toFixed(2));
                const interesRestante = parseFloat((interesTotal - interesAcumulado).toFixed(2));
                const gastosRestante = parseFloat((gastosAdmin - gastosAcumulados).toFixed(2));
                cuotaBaseReal = parseFloat((capitalPeriodo + interesRestante + gastosRestante).toFixed(2));
            }

            // 4. REGLA SOLICITADA: El interés es el remanente de la cuota base
            // Esto asegura que: capital + interés + gastos = cuotaBaseReal
            const pagoGastos = i === plazo ? parseFloat((gastosAdmin - (gastosAcumulados)).toFixed(2)) : gastosPorCuota;
            interesDelMes = parseFloat((cuotaBaseReal - capitalPeriodo - pagoGastos).toFixed(2));

            saldoCapital -= capitalPeriodo;
            if (saldoCapital < 0.01) saldoCapital = 0;

            interesAcumulado += interesDelMes;
            capitalAcumulado += capitalPeriodo;
            gastosAcumulados += pagoGastos;

            amortizacion.push({
                id_credito: idCredito,
                numero_cuota: i,
                fecha_vencimiento: toISODate(fechaVenc),
                dias_periodo: diasPeriodo,
                pago_capital: capitalPeriodo,
                pago_interes: interesDelMes,
                pago_gastos_admin: pagoGastos,
                cuota_base: parseFloat(cuotaBaseReal.toFixed(2)),
                ahorro_programado: parseFloat(ahorroPorCuota.toFixed(2)),
                cuota_total: parseFloat((cuotaBaseReal + ahorroPorCuota).toFixed(2)),
                saldo_capital: parseFloat(Math.max(0, saldoCapital).toFixed(2)),
                estado_cuota: 'PENDIENTE',
                requiere_cobro: true,
                recordatorio_enviado: false,
                intentos_cobro: 0
            });

            fechaAnterior = fechaVenc;
        }

        const { data: amortizacionInsertada, error: errorAmortizacion } = await supabase
            .from('ic_creditos_amortizacion')
            .insert(amortizacion)
            .select('id_detalle, numero_cuota');

        if (errorAmortizacion) {
            throw new Error(`Error al crear amortización: ${errorAmortizacion.message}`);
        }


        // ========== 3. INSERTAR EN ic_creditos_ahorro ==========
        actualizarScreenBlocker('Paso 3/7: Configurando ahorros programados...', 40);

        const ahorros = amortizacionInsertada.map(cuota => ({
            id_credito: idCredito,
            id_detalle: cuota.id_detalle,
            numero_cuota: cuota.numero_cuota,
            monto: parseFloat(ahorroPorCuota.toFixed(2)),
            estado: 'PENDIENTE',
            fecha_devolucion: null,
            monto_devuelto: null,
            observacion: null
        }));

        const { error: errorAhorros } = await supabase
            .from('ic_creditos_ahorro')
            .insert(ahorros);

        if (errorAhorros) {
            throw new Error(`Error al crear ahorros: ${errorAhorros.message}`);
        }


        // ========== 4. INSERTAR EN ic_creditos_documentos ==========
        actualizarScreenBlocker('Paso 4/7: Preparando registro de documentos...', 55);

        const documentosData = {
            id_credito: idCredito,
            contrato_generado: false,
            contrato_firmado: false,
            contrato_url: null,
            pagare_generado: false,
            pagare_firmado: false,
            pagare_url: null,
            tabla_amortizacion_generada: false,
            tabla_amortizacion_firmada: false,
            tabla_amortizacion_url: null,
            documento_garante_firmado: false,
            documento_garante_url: null,
            fecha_firma_contrato: null,
            fecha_firma_pagare: null
        };

        const { error: errorDocumentos } = await supabase
            .from('ic_creditos_documentos')
            .insert(documentosData);

        if (errorDocumentos) {
            throw new Error(`Error al crear documentos: ${errorDocumentos.message}`);
        }


        // ========== 5. INSERTAR EN ic_creditos_garantes (si aplica) ==========
        if (requiereGarante && datosGaranteForm) {
            actualizarScreenBlocker('Paso 5/7: Registrando datos del garante...', 65);

            const garanteData = {
                id_credito: idCredito,
                nombre_garante: datosGaranteForm.nombre_garante,
                cedula_garante: datosGaranteForm.cedula_garante,
                domicilio_garante: datosGaranteForm.domicilio_garante,
                telefono_garante: datosGaranteForm.telefono_garante,
                whatsapp_garante: datosGaranteForm.whatsapp_garante,
                foto_cedula_url: null,
                foto_domicilio_url: null,
                firma_url: null,
                documentos_completos: false
            };

            const { error: errorGarante } = await supabase
                .from('ic_creditos_garantes')
                .insert(garanteData);

            if (errorGarante) {
                throw new Error(`Error al crear garante: ${errorGarante.message}`);
            }
        }

        // ========== 6. INSERTAR EN ic_creditos_historial ==========
        actualizarScreenBlocker('Paso 6/7: Registrando historial de cambios...', 75);

        const historialData = {
            id_credito: idCredito,
            estado_anterior: 'SOLICITUD',
            estado_nuevo: 'PENDIENTE',
            fecha_cambio: nowISO,
            usuario: userId,
            motivo: `Crédito colocado, pendiente de desembolso. Solicitud: ${idSolicitud}. Procesado por: ${userName}`
        };

        const { error: errorHistorial } = await supabase
            .from('ic_creditos_historial')
            .insert(historialData);

        if (errorHistorial) {
            throw new Error(`Error al crear historial: ${errorHistorial.message}`);
        }


        // ========== 7. ACTUALIZAR ic_solicitud_de_credito ==========
        actualizarScreenBlocker('Paso 7/7: Actualizando estado de solicitud...', 90);

        const { error: errorSolicitud } = await supabase
            .from('ic_solicitud_de_credito')
            .update({ estado: 'COLOCADA' })
            .eq('solicitudid', idSolicitud);

        if (errorSolicitud) {
            console.warn('⚠️ No se pudo actualizar la solicitud:', errorSolicitud.message);
        }

        // Finalizar screen blocker
        actualizarScreenBlocker('¡Préstamo colocado exitosamente!', 100);

        // Esperar un momento para mostrar el éxito
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Ocultar screen blocker
        ocultarScreenBlocker();

        // Cerrar modales
        closeSolicitudModal('modal-colocar-credito');
        closeSolicitudModal('modal-ver-solicitud');

        // Actualizar caché de créditos y refrescar
        if (window.dataCache) {
            window.dataCache.creditos = null; // Invalidar caché de créditos
        }

        // Cambiar filtro a pendientes de desembolso y recargar
        currentFilterSolicitud = 'COLOCADA';
        await loadSolicitudes();

        // Cargar sección de pendientes de desembolso
        await loadPendientesDesembolso();

        showToast(`✅ Préstamo ${codigoCredito} colocado exitosamente. Proceda con la generación de documentos y desembolso.`, 'success');

    } catch (error) {
        console.error('❌ Error al colocar préstamo:', error);
        ocultarScreenBlocker();
        showToast('Error al colocar préstamo: ' + (error.message || error), 'error');
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function showSolicitudesLoading() {
    const container = document.getElementById('solicitudes-grid');
    if (container) {
        container.innerHTML = '<div class="loading-placeholder">' +
            '<i class="fas fa-spinner fa-spin"></i>' +
            '<span>Cargando solicitudes...</span>' +
            '</div>';
    }
}

function showSolicitudesError(message) {
    const container = document.getElementById('solicitudes-grid');
    if (container) {
        container.innerHTML = '<div class="error-state">' +
            '<i class="fas fa-exclamation-triangle"></i>' +
            '<p>' + message + '</p>' +
            '<button class="btn btn-secondary" onclick="loadSolicitudes()">' +
            '<i class="fas fa-redo"></i> Reintentar' +
            '</button>' +
            '</div>';
    }
}

// Debounce helper (si no existe globalmente)
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

// ==========================================
// GENERAR PDF DE SOLICITUD
// ==========================================

/**
 * Genera un PDF profesional de la solicitud de crédito
 */
async function generarPDFSolicitud(solicitudData = null, buttonId = 'btn-generar-pdf', fechaFirmaManual = null) {
    const solicitud = solicitudData || currentSolicitud;

    if (!solicitud) {
        showToast('No hay datos de solicitud para generar el PDF', 'error');
        return;
    }

    const btnPdf = document.getElementById(buttonId);
    if (btnPdf) {
        btnPdf.disabled = true;
        btnPdf.dataset.originalHtml = btnPdf.innerHTML;
        btnPdf.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // Colores corporativos
        const colors = {
            primary: [14, 89, 54],      // #0E5936
            secondary: [22, 115, 54],   // #167336
            tertiary: [17, 76, 89],     // #114C59
            contrast1: [191, 75, 33],   // #BF4B21
            contrast2: [242, 177, 56],  // #F2B138
            textDark: [51, 51, 51],     // #333
            lightGray: [240, 240, 240]  // #f0f0f0
        };

        const nombreSocio = solicitud.nombresocio || '[NOMBRE NO ESPECIFICADO]';

        // Configuración de página
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        // Función para cargar imagen como base64
        const loadImageAsBase64 = (url) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    // Usar PNG para preservar transparencia si es necesario
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        // Función para cargar imagen directamente (mejor para el logo)
        const loadImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        // Cargar logo
        showToast('Generando PDF, cargando imágenes...', 'info');
        const logoUrl = 'https://lh3.googleusercontent.com/d/15J6Aj6ZwkVrmDfs6uyVk-oG0Mqr-i9Jn=w2048?name=inka%20corp%20normal.png';
        const logoImg = await loadImage(logoUrl);

        // Header Limpio y Corporativo (Fondo Blanco para contraste)
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, 40, 'F');

        // Línea decorativa superior (Acento institucional)
        doc.setFillColor(...colors.primary);
        doc.rect(0, 0, pageWidth, 2, 'F');

        // Logo
        if (logoImg) {
            try {
                // Tamaño optimizado para fondo blanco
                doc.addImage(logoImg, 'PNG', 15, 6, 28, 28);
            } catch (e) {
                console.error('Error adding logo:', e);
                doc.setTextColor(...colors.primary);
                doc.setFontSize(10);
                doc.text('INKA CORP', 16, 20);
            }
        }

        // Título principal (Verde corporativo sobre blanco)
        doc.setTextColor(...colors.primary);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('SOLICITUD DE PRÉSTAMO', 55, 22);

        // Número de solicitud (Gris elegante)
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Referencia: #${solicitud.solicitudid}`, 55, 31);

        // Línea divisoria inferior del header
        doc.setDrawColor(...colors.lightGray);
        doc.setLineWidth(0.5);
        doc.line(margin, 38, pageWidth - margin, 38);

        // Línea decorativa de acento (dorada)
        doc.setDrawColor(...colors.contrast2);
        doc.setLineWidth(1.5);
        doc.line(margin, 45, pageWidth - margin, 45);

        let yPosition = 55;

        // Extraer tiempo y fecha del ID para el descargo (formato ddmmyyyyhhmmss)
        const sid = solicitud.solicitudid || "";
        let tiempoTexto = "";

        if (sid.length >= 14) {
            const dd = sid.substring(0, 2);
            const mm_num = parseInt(sid.substring(2, 4));
            const yyyy = sid.substring(4, 8);
            const hh = parseInt(sid.substring(8, 10));
            const mm = parseInt(sid.substring(10, 12));
            const ss = parseInt(sid.substring(12, 14));

            const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
            const mesNombre = meses[mm_num - 1] || "mes desconocido";

            let periodo = "mañana";
            let hora12 = hh;

            if (hh >= 19) {
                periodo = "noche";
                hora12 = hh > 12 ? hh - 12 : hh;
            } else if (hh >= 12) {
                periodo = "tarde";
                hora12 = hh > 12 ? hh - 12 : hh;
            } else {
                periodo = "mañana";
                hora12 = hh === 0 ? 12 : hh;
            }

            tiempoTexto = `siendo las ${hora12} de la ${periodo} con ${mm} minutos y ${ss} segundos del día ${parseInt(dd)} de ${mesNombre} del ${yyyy}`;
        }

        // DESCARGO DE RESPONSABILIDAD
        const descargoTexto = [
            `Yo, ${nombreSocio.toUpperCase()}, ${tiempoTexto ? tiempoTexto + ", " : ""}por medio del presente documento autorizo expresamente a INKA CORP a:`,
            '',
            '• Tomar esta solicitud como una autorización formal para la revisión y verificación de mis datos personales.',
            '• Realizar consultas en centrales de riesgo, buró de crédito y demás entidades financieras para evaluar mi historial crediticio.',
            '• Verificar la información laboral, referencias personales y familiares proporcionadas en esta solicitud.',
            '• Procesar y almacenar mis datos personales conforme a las políticas de privacidad vigentes.',
            '',
            'DECLARO BAJO LA GRAVEDAD DEL JURAMENTO que toda la información proporcionada en esta solicitud es',
            'VERAZ, COMPLETA Y ACTUALIZADA. Asumo total responsabilidad por cualquier inexactitud u omisión en los',
            'datos suministrados.',
            '',
            'Entiendo que cualquier falsedad en la información puede ser causal de rechazo inmediato de mi solicitud',
            'o terminación del contrato de crédito si ya ha sido aprobado.',
            '',
            'NOTA: Todos los términos y condiciones fueron compartidos con el solicitante al momento de llenar',
            'la solicitud en https://solicitud.inkacorp.net',
            '',
            'Esta autorización se otorga de manera libre, voluntaria e informada.'
        ];

        // Calcular altura del descargo
        let descargoHeight = 12;
        descargoTexto.forEach(linea => {
            if (linea === '') {
                descargoHeight += 3;
            } else {
                const lines = doc.splitTextToSize(linea, contentWidth - 4);
                descargoHeight += lines.length * 4;
            }
        });
        descargoHeight += 10;

        // Renderizar descargo
        doc.setFillColor(...colors.tertiary);
        doc.rect(margin, yPosition, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('DESCARGO DE RESPONSABILIDAD Y AUTORIZACIÓN', margin + 3, yPosition + 5.5);

        yPosition += 12;

        // Contenido del descargo
        doc.setTextColor(...colors.textDark);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        descargoTexto.forEach((linea, index) => {
            if (linea === '') {
                yPosition += 3;
            } else {
                const lines = doc.splitTextToSize(linea, contentWidth - 4);
                lines.forEach(line => {
                    doc.text(line, margin + 2, yPosition);
                    yPosition += 4;
                });
            }
        });

        yPosition += 10;

        // Función helper para agregar secciones
        const addSection = (title, data, startY) => {
            let y = startY;

            const titleHeight = 12;
            let contentHeight = 0;

            Object.entries(data).forEach(([key, value]) => {
                if (value && value !== 'No especificado') {
                    const valueText = String(value);
                    const maxWidth = contentWidth - 60;
                    const lines = doc.splitTextToSize(valueText, maxWidth);
                    contentHeight += lines.length * 4 + 2;
                }
            });

            const totalSectionHeight = titleHeight + contentHeight + 10;

            if (y + totalSectionHeight > pageHeight - 50) {
                doc.addPage();
                y = 20;
            }

            // Título de la sección
            doc.setFillColor(...colors.secondary);
            doc.rect(margin, y, contentWidth, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin + 3, y + 5.5);

            y += 12;

            // Contenido de la sección
            doc.setTextColor(...colors.textDark);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');

            Object.entries(data).forEach(([key, value], index) => {
                if (value && value !== 'No especificado') {
                    if (index % 2 === 0) {
                        doc.setFillColor(...colors.lightGray);
                        doc.rect(margin, y - 2, contentWidth, 6, 'F');
                    }

                    doc.setFont('helvetica', 'bold');
                    doc.text(`${key}:`, margin + 2, y + 2);
                    doc.setFont('helvetica', 'normal');

                    const valueText = String(value);
                    const maxWidth = contentWidth - 60;
                    const lines = doc.splitTextToSize(valueText, maxWidth);
                    doc.text(lines, margin + 55, y + 2);

                    y += lines.length * 4 + 2;
                }
            });

            return y + 5;
        };

        // Datos personales
        const personalData = {
            'Nombre Completo': solicitud.nombresocio || 'No especificado',
            'Cédula': solicitud.cedulasocio || 'No especificado',
            'Estado Civil': solicitud.estadocivil || 'No especificado',
            'Dirección': solicitud.direccionsocio || 'No especificado',
            'País de Residencia': solicitud.paisresidencia || 'No especificado',
            'WhatsApp': solicitud.whatsappsocio || 'No especificado'
        };

        yPosition = addSection('DATOS PERSONALES', personalData, yPosition);

        // Información familiar/referencias
        const familiarData = {
            'Nombre del Cónyuge': solicitud.nombreconyuge || 'No especificado',
            'País Residencia Cónyuge': solicitud.paisresidenciaconyuge || 'No especificado',
            'WhatsApp Cónyuge': solicitud.whatsappconyuge || 'No especificado',
            'Nombre de Referencia': solicitud.nombrereferencia || 'No especificado',
            'WhatsApp Referencia': solicitud.whatsappreferencia ?
                (typeof solicitud.whatsappreferencia === 'number' ?
                    solicitud.whatsappreferencia.toString() :
                    solicitud.whatsappreferencia) : 'No especificado'
        };

        yPosition = addSection('INFORMACIÓN FAMILIAR Y REFERENCIAS', familiarData, yPosition);

        // Datos del préstamo
        const { fecha } = parseSolicitudId(solicitud.solicitudid);
        const creditoData = {
            'Fecha de Solicitud': fecha,
            'Monto Solicitado': solicitud.monto ?
                `$${(typeof solicitud.monto === 'number' ? solicitud.monto : parseInt(solicitud.monto)).toLocaleString()}` :
                'No especificado',
            'Plazo': (solicitud.plazo || '-') + ' meses',
            'Bien como Garantía': solicitud.bien || 'No especificado',
            'Estado de la Solicitud': solicitud.estado || 'PENDIENTE'
        };

        yPosition = addSection('INFORMACIÓN DEL PRÉSTAMO', creditoData, yPosition);

        // --- SECCIÓN: SIMULACIÓN DE PAGOS (NUEVO) ---
        const simularPagos = () => {
            const capital = parseFloat(solicitud.monto || 0);
            const plazo = parseInt(solicitud.plazo || 12);
            const tasaMensual = 0.02; // 2% por defecto para simulación

            // Cálculos simplificados para la solicitud
            let gastosAdmin = 0;
            if (capital < 5000) gastosAdmin = capital * 0.038;
            else if (capital < 20000) gastosAdmin = capital * 0.023;
            else gastosAdmin = capital * 0.018;

            const interesTotal = capital * tasaMensual * plazo;
            const totalPagar = capital + interesTotal + gastosAdmin;
            const cuotaBase = Math.ceil(totalPagar / plazo);
            const ahorroTotal = (capital + interesTotal) * 0.10;
            const ahorroPorCuota = Math.ceil(ahorroTotal / plazo);
            const cuotaTotal = cuotaBase + ahorroPorCuota;

            return {
                cuotaBase,
                ahorroPorCuota,
                cuotaTotal,
                totalPagar,
                ahorroTotal
            };
        };

        const sim = simularPagos();
        const simData = {
            'Cuota Mensual Base': `$${sim.cuotaBase.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`,
            'Ahorro Programado (10%)': `$${sim.ahorroPorCuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`,
            'CUOTA TOTAL ESTIMADA': `$${sim.cuotaTotal.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`,
            'Total a Pagar (Préstamo)': `$${sim.totalPagar.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`,
            'Total Ahorro a Devolver': `$${sim.ahorroTotal.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`
        };

        yPosition = addSection('SIMULACIÓN PRELIMINAR DE PAGOS', simData, yPosition);

        // Cargar todas las imágenes de documentos
        const documentosImagenes = [];
        const documentFields = [
            { field: 'fotoidentidad', title: 'Foto de Identidad' },
            { field: 'fotoconid', title: 'Foto con ID' },
            { field: 'fotodireccion', title: 'Foto de Dirección' },
            { field: 'fotofirma', title: 'Foto de Firma' },
            { field: 'fotoidentidadconyuge', title: 'Foto ID Cónyuge' },
            { field: 'fotofirmaconyuge', title: 'Foto Firma Cónyuge' },
            { field: 'fotoidentidadreferencia', title: 'Foto ID Referencia' },
            { field: 'fotobien', title: 'Foto del Bien' }
        ];

        // Cargar imágenes disponibles
        for (const docField of documentFields) {
            if (solicitud[docField.field]) {
                const imageBase64 = await loadImageAsBase64(solicitud[docField.field]);
                if (imageBase64) {
                    const imageInfo = await new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            resolve({
                                data: imageBase64,
                                width: img.width,
                                height: img.height
                            });
                        };
                        img.onerror = () => {
                            resolve({
                                data: imageBase64,
                                width: 800,
                                height: 600
                            });
                        };
                        img.src = imageBase64;
                    });

                    documentosImagenes.push({
                        title: docField.title,
                        data: imageInfo.data,
                        width: imageInfo.width,
                        height: imageInfo.height
                    });
                }
            }
        }

        // Agregar sección de documentos si hay imágenes
        if (documentosImagenes.length > 0) {
            const calculateImageDimensions = (originalWidth, originalHeight) => {
                const finalMaxWidthMM = 70;
                const finalMaxHeightMM = 50;

                const originalWidthMM = originalWidth * 0.264583;
                const originalHeightMM = originalHeight * 0.264583;

                const widthScale = finalMaxWidthMM / originalWidthMM;
                const heightScale = finalMaxHeightMM / originalHeightMM;

                const scale = Math.min(widthScale, heightScale, 1);

                return {
                    width: originalWidthMM * scale,
                    height: originalHeightMM * scale
                };
            };

            const columnWidth = (contentWidth - 10) / 2;
            const leftColumnX = margin;
            const rightColumnX = margin + columnWidth + 10;

            let maxItemHeight = 0;

            for (let i = 0; i < documentosImagenes.length; i++) {
                const documento = documentosImagenes[i];
                const dimensions = calculateImageDimensions(documento.width, documento.height);
                const textHeight = Math.ceil(documento.title.length / 30) * 3;
                const itemHeight = textHeight + dimensions.height + 10;
                maxItemHeight = Math.max(maxItemHeight, itemHeight);
            }

            const availableSpace = pageHeight - yPosition - 50;
            const minUsefulSpace = 20 + maxItemHeight;

            if (availableSpace < minUsefulSpace) {
                doc.addPage();
                yPosition = 20;
            }

            // Título de la sección de documentos
            doc.setFillColor(...colors.secondary);
            doc.rect(margin, yPosition, contentWidth, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('DOCUMENTOS ADJUNTOS', margin + 3, yPosition + 5.5);

            yPosition += 15;

            let currentColumn = 0;
            let leftColumnY = yPosition;
            let rightColumnY = yPosition;

            for (let i = 0; i < documentosImagenes.length; i++) {
                const documento = documentosImagenes[i];

                const isLeftColumn = currentColumn === 0;
                const xPosition = isLeftColumn ? leftColumnX : rightColumnX;
                const currentY = isLeftColumn ? leftColumnY : rightColumnY;

                doc.setTextColor(...colors.textDark);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');

                const textLines = doc.splitTextToSize(documento.title, columnWidth);
                const textHeight = textLines.length * 3;

                const dimensions = calculateImageDimensions(documento.width, documento.height);
                const totalItemHeight = textHeight + dimensions.height + 10;

                if (currentY + totalItemHeight > pageHeight - 50) {
                    doc.addPage();
                    yPosition = 20;
                    leftColumnY = yPosition;
                    rightColumnY = yPosition;
                    currentColumn = 0;
                    i--;
                    continue;
                }

                doc.text(textLines, xPosition, currentY);
                const imageY = currentY + textHeight + 2;

                try {
                    const centeredX = xPosition + (columnWidth - dimensions.width) / 2;
                    doc.addImage(documento.data, 'JPEG', centeredX, imageY, dimensions.width, dimensions.height);

                    if (isLeftColumn) {
                        leftColumnY += totalItemHeight;
                    } else {
                        rightColumnY += totalItemHeight;
                    }

                } catch (e) {
                    console.error(`Error adding image ${documento.title}:`, e);
                    if (isLeftColumn) {
                        leftColumnY += textHeight + 20;
                    } else {
                        rightColumnY += textHeight + 20;
                    }
                }

                currentColumn = (currentColumn + 1) % 2;
            }

            yPosition = Math.max(leftColumnY, rightColumnY) + 10;
        }

        // --- SECCIÓN: FIRMA ELECTRÓNICA ---
        // Extraer tiempo y fecha del ID para la firma electrónica
        let fechaFirmaElectronica = "";
        if (sid.length >= 14) {
            const dd = sid.substring(0, 2);
            const mm_num = parseInt(sid.substring(2, 4));
            const yyyy = sid.substring(4, 8);
            const hh = sid.substring(8, 10);
            const mm = sid.substring(10, 12);
            const ss = sid.substring(12, 14);
            const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
            fechaFirmaElectronica = `${dd} de ${meses[mm_num - 1]} del ${yyyy} a las ${hh}:${mm}:${ss}`;
        } else {
            fechaFirmaElectronica = new Date().toLocaleString();
        }

        const firmaElectronicaHeight = 55;
        if (yPosition + firmaElectronicaHeight > pageHeight - 50) {
            doc.addPage();
            yPosition = 20;
        }

        // Título de la sección de firma
        doc.setFillColor(...colors.contrast1);
        doc.rect(margin, yPosition, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('FIRMA ELECTRÓNICA', margin + 3, yPosition + 5.5);

        yPosition += 15;

        const textoQR = `FIRMADO ELECTRONICAMENTE POR:\n${nombreSocio.toUpperCase()}\nFECHA: ${fechaFirmaElectronica}\nID: ${sid}`;

        const qr = new QRious({
            value: textoQR,
            size: 200,
            background: 'white',
            foreground: '#0E5936'
        });

        const qrDataURL = qr.toDataURL();

        try {
            const qrSize = 25;
            const qrX = (pageWidth - qrSize) / 2;
            doc.addImage(qrDataURL, 'PNG', qrX, yPosition, qrSize, qrSize);

            yPosition += qrSize + 5;

            doc.setTextColor(...colors.textDark);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');

            const firmaLines = [
                'FIRMADO ELECTRÓNICAMENTE POR:',
                nombreSocio.toUpperCase(),
                `FECHA DE CAPTURA: ${fechaFirmaElectronica}`
            ];

            firmaLines.forEach(line => {
                const textWidth = doc.getTextWidth(line);
                const textX = (pageWidth - textWidth) / 2;
                doc.text(line, textX, yPosition);
                yPosition += 4;
            });

            // Texto de aceptación solicitado
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            const textoAceptacion = "Esta firma electrónica ha sido capturada al momento en que el SOCIO envió la solicitud desde la plataforma oficial, aceptando expresamente los términos, condiciones y políticas de privacidad de INKA CORP.";
            const linesAceptacion = doc.splitTextToSize(textoAceptacion, contentWidth - 20);
            linesAceptacion.forEach(line => {
                const textWidth = doc.getTextWidth(line);
                const textX = (pageWidth - textWidth) / 2;
                doc.text(line, textX, yPosition);
                yPosition += 3;
            });

        } catch (e) {
            console.error('Error adding QR signature:', e);
        }

        yPosition += 10;

        // --- SECCIÓN: CONSTANCIA DE VERACIDAD Y FIRMAS ---
        const user = window.getCurrentUser();
        const asesorNombre = user ? (user.nombre || user.full_name || 'ASESOR DE PRÉSTAMO') : 'ASESOR DE PRÉSTAMO';
        const asesorCedula = user ? (user.cedula || '') : '';
        const asesorLugar = user ? (user.lugar_asesor || 'Ecuador') : 'Ecuador';

        const estadoCivil = (solicitud.estadocivil || '').toUpperCase();
        const esCasadoOUnionLibre = estadoCivil === 'CASADO/A' || estadoCivil === 'UNIÓN LIBRE';

        // Calcular espacio necesario para constancia y firmas
        const constanciaHeight = esCasadoOUnionLibre ? 95 : 80;

        if (yPosition + constanciaHeight > pageHeight - 50) {
            doc.addPage();
            yPosition = 20;
        }

        // Título de la sección
        doc.setFillColor(...colors.tertiary);
        doc.rect(margin, yPosition, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CONSTANCIA DE VERACIDAD', margin + 3, yPosition + 5.5);

        yPosition += 12;

        // Texto de constancia
        doc.setTextColor(...colors.textDark);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        const parrafo1 = "Para constancia de la veracidad de la información contenida en esta solicitud, el SOCIO suscribe el presente documento de manera libre y voluntaria, declarando que todos los datos proporcionados son verídicos, completos y de procedencia lícita.";
        const parrafo2 = "El ASESOR DE PRÉSTAMO designado certifica haber verificado la identidad del solicitante y da fe de que la información ha sido proporcionada directamente por el socio, quien manifiesta pleno conocimiento y aceptación de los términos y condiciones del préstamo solicitado.";

        const lines1 = doc.splitTextToSize(parrafo1, contentWidth - 4);
        doc.text(lines1, margin + 2, yPosition);
        yPosition += (lines1.length * 4) + 4;

        const lines2 = doc.splitTextToSize(parrafo2, contentWidth - 4);
        doc.text(lines2, margin + 2, yPosition);
        yPosition += (lines2.length * 4) + 8;

        // Lugar y Fecha de suscripción
        // Si viene fechaFirmaManual (formato YYYY-MM-DD), usar esa. Si no, usar la fecha actual.
        let dateObj = new Date();
        if (fechaFirmaManual) {
            // Asegurar que se interprete como fecha local, no UTC
            const [year, month, day] = fechaFirmaManual.split('-').map(Number);
            dateObj = new Date(year, month - 1, day);
        }

        const dia = dateObj.getDate();
        const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const mes = meses[dateObj.getMonth()];
        const anio = dateObj.getFullYear();

        doc.setFont('helvetica', 'bold');
        const textoLugarFecha = `Firman en ${asesorLugar}, a los ${dia} días del mes de ${mes} del año ${anio}.`;
        doc.text(textoLugarFecha, margin + 2, yPosition);

        yPosition += 15; // Espacio para firmas

        // Renderizar Firmas
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setDrawColor(...colors.primary);
        doc.setLineWidth(0.5);

        const firmaWidth = 70;

        if (esCasadoOUnionLibre) {
            // Fila 1: Socio y Cónyuge
            // Firma Socio (Izquierda)
            doc.line(margin, yPosition, margin + firmaWidth, yPosition);
            doc.text('FIRMA DEL SOCIO', margin + (firmaWidth / 2), yPosition + 4, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text(nombreSocio.toUpperCase(), margin + (firmaWidth / 2), yPosition + 8, { align: 'center' });
            doc.text(`C.I.: ${solicitud.cedulasocio || ''}`, margin + (firmaWidth / 2), yPosition + 12, { align: 'center' });

            // Firma Cónyuge (Derecha)
            doc.setFont('helvetica', 'bold');
            const xConyuge = pageWidth - margin - firmaWidth;
            doc.line(xConyuge, yPosition, xConyuge + firmaWidth, yPosition);
            doc.text('FIRMA DEL CÓNYUGE', xConyuge + (firmaWidth / 2), yPosition + 4, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text((solicitud.nombreconyuge || 'NOMBRE DEL CÓNYUGE').toUpperCase(), xConyuge + (firmaWidth / 2), yPosition + 8, { align: 'center' });
            doc.text(`C.I.: ${solicitud.cedulaconyuge || ''}`, xConyuge + (firmaWidth / 2), yPosition + 12, { align: 'center' });

            yPosition += 25;

            // Fila 2: Asesor (Centrado)
            doc.setFont('helvetica', 'bold');
            const xAsesor = (pageWidth - firmaWidth) / 2;
            doc.line(xAsesor, yPosition, xAsesor + firmaWidth, yPosition);
            doc.text('ASESOR DE CRÉDITO', pageWidth / 2, yPosition + 4, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text(asesorNombre.toUpperCase(), pageWidth / 2, yPosition + 8, { align: 'center' });
            doc.text(`C.I.: ${asesorCedula}`, pageWidth / 2, yPosition + 12, { align: 'center' });

            yPosition += 15;
        } else {
            // Fila única: Socio (Izquierda) y Asesor (Derecha)
            // Firma Socio
            doc.line(margin, yPosition, margin + firmaWidth, yPosition);
            doc.text('FIRMA DEL SOCIO', margin + (firmaWidth / 2), yPosition + 4, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text(nombreSocio.toUpperCase(), margin + (firmaWidth / 2), yPosition + 8, { align: 'center' });
            doc.text(`C.I.: ${solicitud.cedulasocio || ''}`, margin + (firmaWidth / 2), yPosition + 12, { align: 'center' });

            // Firma Asesor
            doc.setFont('helvetica', 'bold');
            const xAsesor = pageWidth - margin - firmaWidth;
            doc.line(xAsesor, yPosition, xAsesor + firmaWidth, yPosition);
            doc.text('ASESOR DE CRÉDITO', xAsesor + (firmaWidth / 2), yPosition + 4, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text(asesorNombre.toUpperCase(), xAsesor + (firmaWidth / 2), yPosition + 8, { align: 'center' });
            doc.text(`C.I.: ${asesorCedula}`, xAsesor + (firmaWidth / 2), yPosition + 12, { align: 'center' });

            yPosition += 15;
        }

        // Footer en todas las páginas
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            const footerY = pageHeight - 25;
            doc.setFillColor(...colors.tertiary);
            doc.rect(0, footerY, pageWidth, 25, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('INKA CORP - Sistema de Gestión de Solicitudes', margin, footerY + 8);
            const now = new Date();
            const fechaStr = formatDateTime(now);
            doc.text(`Generado el: ${fechaStr}`, margin, footerY + 15);

            doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin - 20, footerY + 8);
        }

        // Guardar el PDF
        const fileName = `Solicitud_${solicitud.solicitudid}_${solicitud.nombresocio?.replace(/\s+/g, '_') || 'Cliente'}.pdf`;
        doc.save(fileName);

        showToast('PDF generado exitosamente', 'success');

    } catch (error) {
        console.error('Error generating PDF:', error);
        showToast('Error al generar el PDF: ' + error.message, 'error');
    } finally {
        if (btnPdf) {
            btnPdf.disabled = false;
            btnPdf.innerHTML = btnPdf.dataset.originalHtml || '<i class="fas fa-file-pdf"></i> Generar PDF';
        }
    }
}

// ==========================================
// MODAL DE DOCUMENTOS DEL CRÉDITO
// ==========================================
let currentCreditoDocumentos = null;

async function abrirModalDocumentosCredito(idCredito) {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('gestionar documentos')) return;
    }

    try {
        const supabase = window.getSupabaseClient();

        // Capturar fecha seleccionada si el modal ya está abierto
        const fechaFirmaInput = document.getElementById('fecha-firma-docs');
        const fechaSeleccionada = fechaFirmaInput ? fechaFirmaInput.value : null;

        // Cargar datos completos del crédito
        const { data: credito, error } = await supabase
            .from('ic_creditos')
            .select(`
                *,
                socio:ic_socios (*),
                documentos:ic_creditos_documentos (*),
                garante_info:ic_creditos_garantes (*),
                amortizacion:ic_creditos_amortizacion (*)
            `)
            .eq('id_credito', idCredito)
            .single();

        if (error) throw error;

        currentCreditoDocumentos = credito;

        // Crear y mostrar modal preservando la fecha
        mostrarModalDocumentos(credito, fechaSeleccionada);

    } catch (error) {
        console.error('Error cargando datos del crédito:', error);
        showToast('Error al cargar datos del crédito', 'error');
    }
}

function generarOpcionesFechaFirma(fechaSeleccionada = null) {
    const opciones = [];
    const hoy = new Date();

    for (let i = 0; i < 8; i++) {
        const fecha = new Date(hoy);
        fecha.setDate(hoy.getDate() + i);

        // Obtener fecha en formato YYYY-MM-DD local
        const anio = fecha.getFullYear();
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const dia = fecha.getDate().toString().padStart(2, '0');
        const isoDate = `${anio}-${mes}-${dia}`;

        const label = formatearFecha(isoDate, 'completo');
        const selected = (fechaSeleccionada === isoDate) ? 'selected' : '';

        opciones.push(`<option value="${isoDate}" ${selected}>${label.toUpperCase()}</option>`);
    }

    return opciones.join('');
}

function mostrarModalDocumentos(credito, fechaSeleccionada = null) {
    const socio = credito.socio || {};
    const docs = credito.documentos?.[0] || {};
    const tieneGarante = credito.garante;
    const nombreCompleto = socio.nombre || '';

    // Remover modal existente si hay
    const existingModal = document.getElementById('modal-documentos-credito');
    if (existingModal) existingModal.remove();

    const modalHTML = `
        <div id="modal-documentos-credito" class="modal">
            <div class="modal-backdrop" onclick="cerrarModalDocumentos()"></div>
            <div class="modal-card modal-documentos">
                <div class="modal-header modal-header-docs">
                    <h3><i class="fas fa-file-contract"></i> Documentos del Préstamo</h3>
                    <button class="modal-close" onclick="cerrarModalDocumentos()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- Info del crédito -->
                    <div class="docs-credito-info">
                        <div class="docs-info-header">
                            <div>
                                <h4>${nombreCompleto}</h4>
                                <span>${socio.cedula} | ${credito.codigo_credito}</span>
                            </div>
                            <div class="docs-monto">
                                <span class="valor">$${parseFloat(credito.capital).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                                <span class="label">${credito.plazo} meses</span>
                            </div>
                        </div>
                    </div>

                    <!-- Selección de Fecha de Firma -->
                    <div class="docs-fecha-firma-container">
                        <label for="fecha-firma-docs">
                            <i class="fas fa-calendar-alt"></i> Fecha de Firma de Documentos:
                        </label>
                        <select id="fecha-firma-docs" class="form-control">
                            ${generarOpcionesFechaFirma(fechaSeleccionada)}
                        </select>
                        <p class="help-text">* Esta fecha aparecerá en todos los documentos generados.</p>
                    </div>
                    
                    <!-- Lista de documentos -->
                    <div class="docs-list">
                        <div class="doc-item generado">
                            <div class="doc-icon">
                                <i class="fas fa-file-invoice"></i>
                            </div>
                            <div class="doc-info">
                                <h5>Solicitud de Préstamo</h5>
                                <p>Formulario original con datos y firmas</p>
                            </div>
                        </div>

                        <div class="doc-item ${docs.contrato_generado ? 'generado' : ''}">
                            <div class="doc-icon">
                                <i class="fas fa-file-signature"></i>
                            </div>
                            <div class="doc-info">
                                <h5>Acuerdo de Préstamo</h5>
                                <p>Contrato principal con términos y condiciones</p>
                            </div>
                        </div>
                        
                        <div class="doc-item ${docs.pagare_generado ? 'generado' : ''}">
                            <div class="doc-icon">
                                <i class="fas fa-file-invoice-dollar"></i>
                            </div>
                            <div class="doc-info">
                                <h5>Pagaré</h5>
                                <p>Documento de compromiso de pago</p>
                            </div>
                        </div>
                        
                        <div class="doc-item ${docs.tabla_amortizacion_generada ? 'generado' : ''}">
                            <div class="doc-icon">
                                <i class="fas fa-table"></i>
                            </div>
                            <div class="doc-info">
                                <h5>Tabla de Amortización</h5>
                                <p>Detalle de pagos mensuales</p>
                            </div>
                        </div>
                        
                        ${tieneGarante ? `
                            <div class="doc-item ${docs.documento_garante_firmado ? 'generado' : ''}">
                                <div class="doc-icon garante">
                                    <i class="fas fa-user-shield"></i>
                                </div>
                                <div class="doc-info">
                                    <h5>Contrato de Garantía</h5>
                                    <p>Documento del garante solidario</p>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Generar todos -->
                    <div class="docs-actions-all">
                        <button class="btn-generar-todos" onclick="generarTodosDocumentos('${credito.id_credito}')">
                            <i class="fas fa-file-archive"></i> Descargar Todos los Documentos
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
}

function cerrarModalDocumentos() {
    const modal = document.getElementById('modal-documentos-credito');
    if (modal) modal.remove();

    const hasVisibleModals = Array.from(document.querySelectorAll('.modal')).some(el => !el.classList.contains('hidden'));
    if (!hasVisibleModals) {
        document.body.style.overflow = '';
    }

    currentCreditoDocumentos = null;
}

// Exponer funciones globalmente
window.abrirModalDocumentosCredito = abrirModalDocumentosCredito;
window.cerrarModalDocumentos = cerrarModalDocumentos;

// ==========================================
// GENERACIÓN DE DOCUMENTOS PDF
// ==========================================
// ========== 1. GENERAR PAGARÉ ==========
// ========== 1. GENERAR PAGARÉ ==========
async function generarDocumentoPagare(idCredito, fechaFirmaManual = null) {
    try {
        const credito = currentCreditoDocumentos || await cargarCreditoCompleto(idCredito);
        if (!credito) throw new Error('No se encontró el préstamo');

        // Obtener fecha de firma del modal o usar hoy
        const fechaFirmaInput = document.getElementById('fecha-firma-docs');
        let fechaFirma = fechaFirmaManual || (fechaFirmaInput ? fechaFirmaInput.value : null);

        if (!fechaFirma) {
            const hoy = new Date();
            fechaFirma = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 30;
        const contentWidth = pageWidth - (margin * 2);

        const socio = credito.socio || {};
        const infoAcreedor = getDatosAcreedor();

        // Validar datos mandatorios del asesor para documentos legales
        if (!infoAcreedor.nombre || !infoAcreedor.telefono || !infoAcreedor.cedula) {
            Swal.fire({
                icon: 'error',
                title: 'Perfil Incompleto',
                text: 'Su usuario no tiene configurado el Nombre, Cédula o WhatsApp. No se puede generar documentos legales sin estos datos.',
                confirmButtonColor: '#0E5936',
                customClass: getSolicitudDarkSwalClass()
            });
            return;
        }

        const garanteInfo = credito.garante_info?.[0];

        const estadoCivil = (socio.estadocivil || '').toUpperCase();
        const esCasado = estadoCivil.includes('CASADO') || estadoCivil.includes('UNION') || estadoCivil.includes('UNIÓN');

        const nombreDeudor = (socio.nombre || '').toUpperCase();
        const cedulaDeudor = socio.cedula || '';
        const nombreConyuge = (socio.nombreconyuge || 'CÓNYUGE').toUpperCase();
        const cedulaConyuge = socio.cedulaconyuge || '';

        const fechaVencimiento = credito.fecha_fin_credito;
        const capital = parseFloat(credito.capital);

        // Determinar firmantes y pluralización
        const firmantes = [];
        const labelFirmante = esCasado ? 'DEUDOR SOLIDARIO' : 'DEUDOR';

        firmantes.push({ nombre: nombreDeudor, cedula: cedulaDeudor, label: labelFirmante });

        if (esCasado) {
            firmantes.push({ nombre: nombreConyuge, cedula: cedulaConyuge, label: labelFirmante });
        }

        const esPlural = firmantes.length > 1;
        const tituloDoc = 'PAGARÉ';

        // Título
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(tituloDoc, pageWidth / 2, 30, { align: 'center' });

        let y = 45;

        // Información de cabecera
        doc.setFontSize(10);
        y = drawField(doc, 'A: ', infoAcreedor.nombre.toUpperCase(), margin, y, contentWidth);
        y = drawField(doc, 'VENCIMIENTO: ', formatearFecha(fechaVencimiento, 'largo').toUpperCase(), margin, y, contentWidth);
        y = drawField(doc, 'LA CANTIDAD DE: ', `$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})`, margin, y, contentWidth);

        y += 10;

        // Cuerpo del pagaré
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        const domicilioDeudor = (socio.domicilio || socio.direccion || 'DIRECCIÓN REGISTRADA').toUpperCase();

        let textoPagere = '';
        if (esPlural) {
            const nombresFirmantes = firmantes.map(f => `**${f.nombre}** (C.I. **${f.cedula}**)`).join(', ');
            textoPagere = `Por este pagaré, nosotros, ${nombresFirmantes}, con domicilio en **${domicilioDeudor}**, nos comprometemos y obligamos a pagar de manera solidaria e incondicional al vencimiento indicado, a la orden de **${infoAcreedor.nombre.toUpperCase()}**, con cédula de identidad número **${infoAcreedor.cedula}**, en la ciudad de **${infoAcreedor.ciudad.toUpperCase()}**, la cantidad de **$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})**.`;
        } else {
            textoPagere = `Por este pagaré, yo, **${nombreDeudor}**, con cédula de identidad ecuatoriana número **${cedulaDeudor}**, con domicilio en **${domicilioDeudor}**, me comprometo y obligo a pagar de manera incondicional al vencimiento indicado, a la orden de **${infoAcreedor.nombre.toUpperCase()}**, con cédula de identidad número **${infoAcreedor.cedula}**, en la ciudad de **${infoAcreedor.ciudad.toUpperCase()}**, la cantidad de **$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})**.`;
        }

        y = renderJustifiedText(doc, textoPagere, margin, y, contentWidth);
        y += 20;

        // --- SECCIÓN DE FIRMAS (2x2) ---
        if (y > pageHeight - 60) {
            doc.addPage();
            y = 40;
        }

        const firmaWidth = 60;
        const spacing = (contentWidth - (firmaWidth * 2)) / 1; // Espacio entre columnas

        // Agrupar firmas de 2 en 2
        for (let i = 0; i < firmantes.length; i += 2) {
            const fila = firmantes.slice(i, i + 2);
            const isLastRowOdd = fila.length === 1;

            const rowY = y + 25;

            fila.forEach((f, index) => {
                let xPos;
                if (isLastRowOdd) {
                    xPos = pageWidth / 2; // Centrado si es impar
                } else {
                    xPos = margin + (firmaWidth / 2) + (index * (firmaWidth + spacing));
                }

                // Línea de firma
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.line(xPos - (firmaWidth / 2), rowY, xPos + (firmaWidth / 2), rowY);

                // Nombre y C.I.
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');

                // Dividir nombre si es muy largo para evitar superposición
                const nombreLineas = doc.splitTextToSize(f.nombre, firmaWidth);
                doc.text(nombreLineas, xPos, rowY + 5, { align: 'center' });

                // Calcular desplazamiento basado en el número de líneas del nombre
                const offsetNombre = (nombreLineas.length * 4); // 4mm por línea aprox

                doc.setFont('helvetica', 'normal');
                doc.text(`C.I.: ${f.cedula}`, xPos, rowY + 5 + offsetNombre, { align: 'center' });
                doc.text(f.label, xPos, rowY + 9 + offsetNombre, { align: 'center' });
            });

            y = rowY + 25; // Espacio para la siguiente fila

            if (y > pageHeight - 40 && i + 2 < firmantes.length) {
                doc.addPage();
                y = 30;
            }
        }

        // Fecha al final centrada
        y += 10;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`${infoAcreedor.ciudad.toUpperCase()}, ${formatearFecha(fechaFirma, 'completo').toUpperCase()}`, pageWidth / 2, y, { align: 'center' });

        // Guardar
        const fileName = `Pagare_${credito.codigo_credito}_${nombreDeudor.replace(/\s+/g, '_')}.pdf`;
        doc.save(fileName);

        // Actualizar estado en BD
        await actualizarEstadoDocumento(idCredito, 'pagare_generado', true);

        showToast('Pagaré generado exitosamente', 'success');

    } catch (error) {
        console.error('Error generando pagaré:', error);
        showToast('Error al generar pagaré: ' + error.message, 'error');
    }
}

// ========== 2. GENERAR CONTRATO/ACUERDO DE PRÉSTAMO ==========
async function generarDocumentoContrato(idCredito, fechaFirmaManual = null) {
    try {
        const credito = currentCreditoDocumentos || await cargarCreditoCompleto(idCredito);
        if (!credito) throw new Error('No se encontró el préstamo');

        // Obtener fecha de firma del modal o usar hoy
        const fechaFirmaInput = document.getElementById('fecha-firma-docs');
        let fechaFirma = fechaFirmaManual || (fechaFirmaInput ? fechaFirmaInput.value : null);

        if (!fechaFirma) {
            const hoy = new Date();
            fechaFirma = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 30;
        const contentWidth = pageWidth - (margin * 2);

        const socio = credito.socio || {};
        const infoAcreedor = getDatosAcreedor();

        // Validar datos mandatorios del asesor para documentos legales
        if (!infoAcreedor.nombre || !infoAcreedor.telefono || !infoAcreedor.cedula) {
            Swal.fire({
                icon: 'error',
                title: 'Perfil Incompleto',
                text: 'Su usuario no tiene configurado el Nombre, Cédula o WhatsApp. No se puede generar documentos legales sin estos datos.',
                confirmButtonColor: '#0E5936',
                customClass: getSolicitudDarkSwalClass()
            });
            return;
        }

        const garanteInfo = credito.garante_info?.[0] || null;

        const estadoCivil = (socio.estadocivil || '').toUpperCase();
        const esCasado = estadoCivil.includes('CASADO') || estadoCivil.includes('UNION') || estadoCivil.includes('UNIÓN');
        const nombreConyuge = (socio.nombreconyuge || 'CÓNYUGE').toUpperCase();

        const nombreDeudor = (socio.nombre || '').toUpperCase();
        const capital = parseFloat(credito.capital);
        const cuota = parseFloat(credito.cuota_con_ahorro);

        // Título
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('ACUERDO DE PRÉSTAMO', pageWidth / 2, 30, { align: 'center' });

        // Fecha arriba a la derecha
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${infoAcreedor.ciudad.toUpperCase()}, ${formatearFecha(fechaFirma, 'completo').toUpperCase()}`, pageWidth - margin, 40, { align: 'right' });

        let y = 50;

        // Información de cabecera
        doc.setFontSize(10);
        y = drawField(doc, `DEUDOR: `, nombreDeudor, margin, y, contentWidth);
        y = drawField(doc, `MONTO: `, `$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})`, margin, y, contentWidth);
        y = drawField(doc, `PLAZO: `, `${credito.plazo} MESES`, margin, y, contentWidth);
        y = drawField(doc, `INTERÉS MENSUAL EN PORCENTAJE: `, `${credito.tasa_interes_mensual} %`, margin, y, contentWidth);
        y = drawField(doc, `VALOR MENSUAL A PAGAR: `, `$${cuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(cuota)})`, margin, y, contentWidth);

        if (garanteInfo) {
            y = drawField(doc, `GARANTE: `, garanteInfo.nombre_garante?.toUpperCase() || 'NO ESPECIFICADO', margin, y, contentWidth);
        }

        y += 10;

        // Cuerpo del contrato
        doc.setFontSize(10);
        const parrafos = [
            `Yo, **${nombreDeudor}** con Cédula de Identidad Ecuatoriana número **${socio.cedula}** haciendo pleno uso de mis facultades racionales y mentales solicito un préstamo a **${infoAcreedor.nombre.toUpperCase()}**.`,

            `Yo, **${nombreDeudor}** solicito un préstamo por **$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})** y una vez que haya firmado este documento acepto que el dinero me fue entregado y así mismo acepto todas las cláusulas y condiciones del mismo.`,

            `Yo, **${nombreDeudor}** estoy completamente de acuerdo en pagar a **${infoAcreedor.nombre.toUpperCase()}** el valor de **$${cuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(cuota)})** mensualmente durante el plazo establecido.`,

            `Yo, **${nombreDeudor}**, doy a conocer voluntariamente mis datos personales como respaldo de que cancelaré mi préstamo y bajo juramento declaro que TODOS los datos proporcionados son legítimos:`,
        ];

        parrafos.forEach(p => {
            y = renderJustifiedText(doc, p, margin, y, contentWidth);
            y += 5;
        });

        // Declaraciones numeradas
        y += 3;
        const declaraciones = [
            `1.- Vivo en **${(socio.domicilio || socio.direccion || 'DIRECCIÓN REGISTRADA').toUpperCase()}** y me comprometo a notificar a **${infoAcreedor.nombre.toUpperCase()}** si llegase a cambiar la dirección de mi domicilio.`,

            `2.- Como referencia pongo a **${(socio.nombrereferencia || 'PERSONA DE CONFIANZA').toUpperCase()}**, declaro que me conoce y puede preguntar por mí llamando al **${socio.whatsappreferencia || 'NÚMERO REGISTRADO'}**.`,

            `3.- Mi número de contacto es el **${socio.whatsapp || 'NÚMERO REGISTRADO'}** mismo que tiene habilitado Whatsapp ya que tengo conocimiento de que cualquier recordatorio o cambio de datos de pago me serán notificados por este medio, así mismo si hubiese un cambio en este número de contacto me comprometo a notificar a **${infoAcreedor.nombre.toUpperCase()}** oportunamente.`
        ];

        declaraciones.forEach(d => {
            y = renderJustifiedText(doc, d, margin, y, contentWidth);
            y += 4;
        });

        y += 5;

        // Declaraciones finales
        const finales = [
            `Yo, **${nombreDeudor}**, declaro bajo juramento que destinaré los fondos que me entregaron mediante este préstamo a fines lícitos y fuera de todo tipo de actividades que sean ilegales.`,

            `Yo, **${nombreDeudor}**, eximo a **${infoAcreedor.nombre.toUpperCase()}**, incluyendo a terceros sobre cualquier problema que se presente en case de que la información proporcionada por mi persona sea errónea.`
        ];

        finales.forEach(p => {
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 25;
            }
            y = renderJustifiedText(doc, p, margin, y, contentWidth);
            y += 5;
        });

        // Firmas
        y += 15;
        if (y > pageHeight - 60) {
            doc.addPage();
            y = 25;
        }

        doc.setFont('helvetica', 'bold');
        doc.text('Firman:', margin, y);
        y += 35;

        // Lista de firmas a generar
        const firmas = [];
        firmas.push({ nombre: nombreDeudor, cedula: socio.cedula || '', label: '(DEUDOR)' });

        if (esCasado) {
            firmas.push({ nombre: nombreConyuge, cedula: socio.cedulaconyuge || '', label: '(CÓNYUGE)' });
        }

        if (garanteInfo) {
            firmas.push({ nombre: (garanteInfo.nombre_garante || 'GARANTE').toUpperCase(), cedula: garanteInfo.cedula_garante || '', label: '(GARANTE)' });
        }

        firmas.push({ nombre: infoAcreedor.nombre.toUpperCase(), cedula: infoAcreedor.cedula || '', label: '(ACREEDOR)' });

        // Dibujar firmas de 2 en 2
        const firmaWidth = (contentWidth / 2) - 20;
        for (let i = 0; i < firmas.length; i += 2) {
            let rowFirmas = firmas.slice(i, i + 2);
            let rowY = y;

            if (rowY > pageHeight - 50) {
                doc.addPage();
                rowY = 30;
            }

            rowFirmas.forEach((f, idx) => {
                const xPos = (rowFirmas.length === 1)
                    ? pageWidth / 2
                    : (idx === 0 ? margin + (contentWidth / 4) : margin + (3 * contentWidth / 4));

                // Línea de firma
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.line(xPos - (firmaWidth / 2), rowY, xPos + (firmaWidth / 2), rowY);

                // Nombre y C.I.
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');

                // Dividir nombre si es muy largo para evitar superposición
                const nombreLineas = doc.splitTextToSize(f.nombre, firmaWidth);
                doc.text(nombreLineas, xPos, rowY + 5, { align: 'center' });

                // Calcular desplazamiento basado en el número de líneas del nombre
                const offsetNombre = (nombreLineas.length * 4);

                doc.setFont('helvetica', 'normal');
                doc.text(`C.I.: ${f.cedula}`, xPos, rowY + 5 + offsetNombre, { align: 'center' });
                doc.text(f.label, xPos, rowY + 9 + offsetNombre, { align: 'center' });
            });

            y = rowY + 35; // Espacio para la siguiente fila
        }

        // Guardar
        const fileName = `Contrato_${credito.codigo_credito}_${nombreDeudor.replace(/\s+/g, '_')}.pdf`;
        doc.save(fileName);

        // Actualizar estado en BD
        await actualizarEstadoDocumento(idCredito, 'contrato_generado', true);

        showToast('Contrato generado exitosamente', 'success');

    } catch (error) {
        console.error('Error generando contrato:', error);
        showToast('Error al generar contrato: ' + error.message, 'error');
    }
}

// ========== 3. GENERAR TABLA DE AMORTIZACIÓN ==========
// ========== 3. GENERAR TABLA DE AMORTIZACIÓN ==========
async function generarDocumentoTablaAmortizacion(idCredito, fechaFirmaManual = null) {
    try {
        const credito = currentCreditoDocumentos || await cargarCreditoCompleto(idCredito);
        if (!credito) throw new Error('No se encontró el préstamo');

        // Obtener fecha de firma del modal o usar hoy
        const fechaFirmaInput = document.getElementById('fecha-firma-docs');
        let fechaFirma = fechaFirmaManual || (fechaFirmaInput ? fechaFirmaInput.value : null);

        if (!fechaFirma) {
            const hoy = new Date();
            fechaFirma = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        const colors = {
            primary: [14, 89, 54],      // #0E5936
            secondary: [22, 115, 54],   // #167336
            tertiary: [17, 76, 89],     // #114C59
            contrast1: [191, 75, 33],   // #BF4B21
            contrast2: [242, 177, 56],  // #F2B138
            textDark: [51, 51, 51],     // #333
            lightGray: [240, 240, 240]  // #f0f0f0
        };

        const socio = credito.socio || {};
        const infoAcreedor = getDatosAcreedor();

        // Validar datos mandatorios del asesor para documentos legales
        if (!infoAcreedor.nombre || !infoAcreedor.telefono || !infoAcreedor.cedula) {
            Swal.fire({
                icon: 'error',
                title: 'Perfil Incompleto',
                text: 'Su usuario no tiene configurado el Nombre, Cédula o WhatsApp. No se puede generar documentos legales sin estos datos.',
                confirmButtonColor: '#0E5936',
                customClass: getSolicitudDarkSwalClass()
            });
            return;
        }

        const garanteInfo = credito.garante_info?.[0] || null;

        const estadoCivil = (socio.estadocivil || '').toUpperCase();
        const esCasado = estadoCivil.includes('CASADO') || estadoCivil.includes('UNION') || estadoCivil.includes('UNIÓN');
        const nombreConyuge = (socio.nombreconyuge || 'CÓNYUGE').toUpperCase();

        const nombreDeudor = (socio.nombre || '').toUpperCase();
        const capital = parseFloat(credito.capital);
        const amortizacion = credito.amortizacion || [];

        // Función para cargar imagen
        const loadImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        // Cargar logo
        showToast('Generando Tabla de Amortización...', 'info');
        const logoUrl = 'https://lh3.googleusercontent.com/d/15J6Aj6ZwkVrmDfs6uyVk-oG0Mqr-i9Jn=w2048?name=inka%20corp%20normal.png';
        const logoImg = await loadImage(logoUrl);

        // --- HEADER CORPORATIVO ---
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, 40, 'F');

        // Línea decorativa superior
        doc.setFillColor(...colors.primary);
        doc.rect(0, 0, pageWidth, 2, 'F');

        // Logo
        if (logoImg) {
            doc.addImage(logoImg, 'PNG', 15, 6, 28, 28);
        }

        // Título principal
        doc.setTextColor(...colors.primary);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('TABLA DE AMORTIZACIÓN', 55, 22);

        // Fecha y Referencia
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${infoAcreedor.ciudad.toUpperCase()}, ${formatearFecha(fechaFirma, 'completo').toUpperCase()}`, 55, 31);

        // Línea divisoria
        doc.setDrawColor(...colors.lightGray);
        doc.setLineWidth(0.5);
        doc.line(margin, 38, pageWidth - margin, 38);

        // Línea de acento dorada
        doc.setDrawColor(...colors.contrast2);
        doc.setLineWidth(1.5);
        doc.line(margin, 45, pageWidth - margin, 45);

        let y = 55;

        // --- DATOS DEL PRÉSTAMO ---
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(margin, y, contentWidth, 32, 2, 2, 'F');
        doc.setDrawColor(...colors.lightGray);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentWidth, 32, 2, 2, 'S');

        y += 8;
        doc.setFontSize(9);
        const col1 = margin + 5;
        const col2 = margin + contentWidth / 2 + 5;

        let yData = y;
        drawField(doc, 'SOCIO: ', nombreDeudor, col1, yData, contentWidth / 2 - 10);
        drawField(doc, 'INTERÉS: ', `${credito.tasa_interes_mensual} %`, col2, yData, contentWidth / 2 - 10);

        yData += 7;
        drawField(doc, 'CÉDULA: ', socio.cedula || '-', col1, yData, contentWidth / 2 - 10);
        drawField(doc, 'PLAZO: ', `${credito.plazo} MESES`, col2, yData, contentWidth / 2 - 10);

        yData += 7;
        drawField(doc, 'MONTO: ', `$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})`, col1, yData, contentWidth - 10);

        y = yData + 15;

        // --- TEXTO INTRODUCTORIO ---
        doc.setTextColor(...colors.textDark);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`ESTIMADO SOCIO/A ${nombreDeudor}:`, margin, y);
        y += 6;

        doc.setFont('helvetica', 'normal');

        const diaPago = parseInt(credito.dia_pago) || 15;
        const recordatorio1 = diaPago - 3;
        const recordatorio2 = diaPago;
        
        const pSocio = (socio.paisresidencia || socio.pais || '').trim().toUpperCase();
        const esEcuador = pSocio === 'ECUADOR' || pSocio === 'EC';
        const bancoInfo = esEcuador 
            ? 'una cuenta en BANCO PICHINCHA' 
            : 'una cuenta en CHASE O ZELLE';

        const introText = [
            `Esta tabla muestra el plan de pagos para su préstamo realizado por la suma de **$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })}** otorgado por **INKA CORP** en la fecha **${formatearFecha(credito.fecha_desembolso || fechaFirma, 'largo')}**.`,
            `El valor total a pagar por el socio comprende el **CAPITAL** más los **INTERESES** y **GASTOS ADMINISTRATIVOS** generados en el proceso de tramitación del préstamo.`,
            `Desglose de **GASTOS ADMINISTRATIVOS** en porcentaje según el capital solicitado:\n- Menor a $5000: 0.16%\n- Menor a $20000 e igual o mayor a $5000: 0.12%\n- Igual o superior a $20000: 0.08%`,
            `El préstamo tiene un plazo de **${credito.plazo} meses** con una tasa de interés porcentual del **${credito.tasa_interes_mensual} %**. La amortización es en cuotas niveladas mensuales.`,
            `El pago mensual es de **$${parseFloat(credito.cuota_con_ahorro).toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(parseFloat(credito.cuota_con_ahorro))})**. Este pago mensual se aplica primero a los intereses acumulados y el resto se aplica al capital del préstamo.`,
            `Los intereses se calculan sobre el saldo insoluto del préstamo al inicio de cada período. A medida que se van pagando las cuotas, una porción del pago se destina a cubrir los intereses y la otra parte reduce el capital, por lo que el saldo insoluto del préstamo va disminuyendo en cada período.`,
            `Por políticas de contabilidad de la empresa, el pago de los préstamos se reciben únicamente el día **${credito.dia_pago} de cada mes** sin importar la fecha en la que se realiza el desembolso. Para ser justo con el socio, **INKA CORP** adaptará la primera cuota a una fecha adecuada para no perjudicarlo; así mismo, las siguientes cuotas se pagarán máximo el día **${credito.dia_pago} de cada mes**; por consecuencia, el préstamo finalizará un día **${credito.dia_pago}**.`,
            `Por políticas de seguridad de la empresa, **INKA CORP** realizará los cobros únicamente mediante **transferencia o depósito a ${bancoInfo}**, los datos de pago serán enviados oportunamente antes del pago de cada cuota. Es responsabilidad exclusiva del socio revisar bien los datos de pago proporcionados en dicho mensaje.`,
            `A fin de evitar retrasos en los pagos, **INKA CORP** enviará mensajes de **recordatorio de pago los días ${recordatorio1} y ${recordatorio2} de cada mes**, estos serán entregados al remitente vía WhatsApp por su asesor asignado. Instamos al socio/a a comunicar si llegase a sufrir algún percance con el contacto proporcionado en este documento, el cual es: **${infoAcreedor.telefono}**`,
            `El prestatario debe realizar un total de **${credito.plazo} pagos mensuales** por la cantidad indicada. La fecha de pago de la primera cuota será el **${formatearFecha(amortizacion[0]?.fecha_pago || amortizacion[0]?.fecha_vencimiento)}** y el último pago vencerá el **${formatearFecha(amortizacion[amortizacion.length - 1]?.fecha_pago || amortizacion[amortizacion.length - 1]?.fecha_vencimiento)}**.`,
            `Si el prestatario incurre en **mora**, se aplicarán cargos por pagos atrasados a razón de **$2.00 diarios** sobre la cuota vencida. Así mismo, en caso de incumplimiento, **INKA CORP** podrá declarar todo el préstamo pagadero de inmediato junto con los intereses devengados hasta la fecha.`,
            `**CONSEJOS PARA TUS PAGOS RESPONSABLES:**\n- Organiza tu presupuesto mensual priorizando el pago de tu cuota.\n- Realiza tus pagos antes de la fecha de vencimiento para evitar recargos.\n- Mantener un buen historial crediticio te abre las puertas a futuros préstamos con mejores condiciones.\n- Si tienes dificultades para pagar, comunícate con nosotros antes de la fecha de vencimiento.`
        ];

        introText.forEach(text => {
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }
            y = renderJustifiedText(doc, text, margin, y, contentWidth, 5);
            y += 3;
        });

        y += 5;

        // --- TABLA DE PAGOS ---
        const colWidths = [10, 30, 18, 18, 18, 20, 18, 20, 18];
        const headers = ['CUOTA', 'FECHA', 'CAPITAL', 'INTERÉS', 'GASTOS', 'C. BASE', 'AHORRO', 'TOTAL', 'SALDO'];

        doc.setFillColor(...colors.primary);
        doc.rect(margin, y - 5, contentWidth, 10, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');

        let colX = margin;
        headers.forEach((h, i) => {
            doc.text(h, colX + colWidths[i] / 2, y, { align: 'center' });
            colX += colWidths[i];
        });
        y += 8;

        // Datos de la tabla
        doc.setTextColor(...colors.textDark);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');

        let totalInteres = 0;
        let totalCapital = 0;
        let totalGastos = 0;
        let totalAhorro = 0;
        let totalCuota = 0;

        amortizacion.sort((a, b) => a.numero_cuota - b.numero_cuota).forEach((cuota, index) => {
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;

                // Header simplificado en nuevas páginas
                if (logoImg) {
                    doc.addImage(logoImg, 'PNG', margin, 10, 15, 15);
                }
                doc.setFontSize(12);
                doc.setTextColor(...colors.primary);
                doc.setFont('helvetica', 'bold');
                doc.text('INKA CORP', pageWidth / 2, 18, { align: 'center' });
                doc.setFontSize(10);
                doc.text('TABLA DE AMORTIZACIÓN (Continuación)', margin, 30);

                y = 40;

                // Repetir cabecera de tabla
                doc.setFillColor(...colors.primary);
                doc.rect(margin, y - 5, contentWidth, 10, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                let colXh = margin;
                headers.forEach((h, i) => {
                    doc.text(h, colXh + colWidths[i] / 2, y, { align: 'center' });
                    colXh += colWidths[i];
                });
                y += 8;
                doc.setTextColor(...colors.textDark);
                doc.setFont('helvetica', 'normal');
            }

            // Alternar color de fondo
            if (index % 2 === 0) {
                doc.setFillColor(248, 248, 248);
                doc.rect(margin, y - 4, contentWidth, 6, 'F');
            }

            const rowData = [
                cuota.numero_cuota.toString(),
                formatearFecha(cuota.fecha_pago || cuota.fecha_vencimiento, 'corto'),
                `$${parseFloat(cuota.capital || cuota.pago_capital || 0).toFixed(2)}`,
                `$${parseFloat(cuota.interes || cuota.pago_interes || 0).toFixed(2)}`,
                `$${parseFloat(cuota.pago_gastos_admin || 0).toFixed(2)}`,
                `$${parseFloat(cuota.cuota_base || 0).toFixed(2)}`,
                `$${parseFloat(cuota.ahorro_programado || 0).toFixed(2)}`,
                `$${parseFloat(cuota.cuota_total || 0).toFixed(2)}`,
                `$${parseFloat(cuota.saldo_pendiente || cuota.saldo_capital || 0).toFixed(2)}`
            ];

            let rowX = margin;
            rowData.forEach((data, i) => {
                doc.text(data, rowX + colWidths[i] / 2, y, { align: 'center' });
                rowX += colWidths[i];
            });

            totalInteres += parseFloat(cuota.interes || cuota.pago_interes || 0);
            totalCapital += parseFloat(cuota.capital || cuota.pago_capital || 0);
            totalGastos += parseFloat(cuota.pago_gastos_admin || 0);
            totalAhorro += parseFloat(cuota.ahorro_programado || 0);
            totalCuota += parseFloat(cuota.cuota_total || 0);
            y += 6;
        });

        // Totales
        doc.setDrawColor(...colors.primary);
        doc.setLineWidth(0.5);
        doc.line(margin, y - 2, pageWidth - margin, y - 2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);

        let totalX = margin;
        doc.text('TOTALES:', totalX + colWidths[0] + colWidths[1] / 2, y + 2, { align: 'center' });
        totalX += colWidths[0] + colWidths[1];

        doc.text(`$${totalCapital.toFixed(2)}`, totalX + colWidths[2] / 2, y + 2, { align: 'center' });
        totalX += colWidths[2];

        doc.text(`$${totalInteres.toFixed(2)}`, totalX + colWidths[3] / 2, y + 2, { align: 'center' });
        totalX += colWidths[3];

        doc.text(`$${totalGastos.toFixed(2)}`, totalX + colWidths[4] / 2, y + 2, { align: 'center' });
        totalX += colWidths[4];

        doc.text(`$${(totalCapital + totalInteres + totalGastos).toFixed(2)}`, totalX + colWidths[5] / 2, y + 2, { align: 'center' });
        totalX += colWidths[5];

        doc.text(`$${totalAhorro.toFixed(2)}`, totalX + colWidths[6] / 2, y + 2, { align: 'center' });
        totalX += colWidths[6];

        doc.text(`$${totalCuota.toFixed(2)}`, totalX + colWidths[7] / 2, y + 2, { align: 'center' });

        y += 25;

        // --- SECCIÓN DE FIRMAS ---
        if (y > pageHeight - 50) {
            doc.addPage();
            y = 30;
        }

        // Lista de firmas a generar
        const firmas = [];
        firmas.push({ nombre: nombreDeudor, cedula: socio.cedula || '', label: '(DEUDOR)' });

        if (esCasado) {
            firmas.push({ nombre: nombreConyuge, cedula: socio.cedulaconyuge || '', label: '(CÓNYUGE)' });
        }

        if (garanteInfo) {
            firmas.push({ nombre: (garanteInfo.nombre_garante || 'GARANTE').toUpperCase(), cedula: garanteInfo.cedula_garante || '', label: '(GARANTE)' });
        }

        firmas.push({ nombre: infoAcreedor.nombre.toUpperCase(), cedula: infoAcreedor.cedula || '', label: '(ASESOR DE PRÉSTAMOS)' });

        // Dibujar firmas de 2 en 2
        const firmaWidth = (contentWidth / 2) - 20;
        for (let i = 0; i < firmas.length; i += 2) {
            let rowFirmas = firmas.slice(i, i + 2);
            let rowY = y;

            if (rowY > pageHeight - 50) {
                doc.addPage();
                rowY = 30;
            }

            rowFirmas.forEach((f, idx) => {
                const xPos = (rowFirmas.length === 1)
                    ? pageWidth / 2
                    : (idx === 0 ? margin + (contentWidth / 4) : margin + (3 * contentWidth / 4));

                // Línea de firma
                doc.setDrawColor(0);
                doc.setLineWidth(0.3);
                doc.line(xPos - (firmaWidth / 2), rowY, xPos + (firmaWidth / 2), rowY);

                // Nombre y C.I.
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');

                // Dividir nombre si es muy largo para evitar superposición
                const nombreLineas = doc.splitTextToSize(f.nombre, firmaWidth);
                doc.text(nombreLineas, xPos, rowY + 5, { align: 'center' });

                // Calcular desplazamiento basado en el número de líneas del nombre
                const offsetNombre = (nombreLineas.length * 4);

                doc.setFont('helvetica', 'normal');
                doc.text(`C.I.: ${f.cedula}`, xPos, rowY + 5 + offsetNombre, { align: 'center' });
                doc.text(f.label, xPos, rowY + 9 + offsetNombre, { align: 'center' });
            });

            y = rowY + 35; // Espacio para la siguiente fila
        }

        // Añadir pie de página a todas las páginas
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);

            // Línea divisoria footer
            doc.setDrawColor(...colors.lightGray);
            doc.setLineWidth(0.5);
            doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

            // Logo footer
            if (logoImg) {
                doc.addImage(logoImg, 'PNG', margin, pageHeight - 18, 12, 12);
            }

            // Texto footer
            doc.setFontSize(10);
            doc.setTextColor(...colors.primary);
            doc.setFont('helvetica', 'bold');
            doc.text('INKA CORP', margin + 15, pageHeight - 10);

            // Numeración
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
        }

        // Guardar
        const fileName = `TablaAmortizacion_${credito.codigo_credito}_${nombreDeudor.replace(/\s+/g, '_')}.pdf`;
        doc.save(fileName);

        // Actualizar estado en BD
        await actualizarEstadoDocumento(idCredito, 'tabla_amortizacion_generada', true);

        showToast('Tabla de amortización generada exitosamente', 'success');

    } catch (error) {
        console.error('Error generando tabla de amortización:', error);
        showToast('Error al generar tabla: ' + error.message, 'error');
    }
}

// ========== 4. GENERAR CONTRATO DE GARANTÍA ==========
async function generarDocumentoGarantia(idCredito, fechaFirmaManual = null) {
    try {
        const credito = currentCreditoDocumentos || await cargarCreditoCompleto(idCredito);
        if (!credito) throw new Error('No se encontró el préstamo');

        // Obtener fecha de firma del modal o usar hoy
        const fechaFirmaInput = document.getElementById('fecha-firma-docs');
        let fechaFirma = fechaFirmaManual || (fechaFirmaInput ? fechaFirmaInput.value : null);

        if (!fechaFirma) {
            const hoy = new Date();
            fechaFirma = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        }

        const garanteInfo = credito.garante_info?.[0];
        if (!garanteInfo) {
            showToast('Este crédito no tiene garante registrado', 'warning');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 30;
        const contentWidth = pageWidth - (margin * 2);

        const socio = credito.socio || {};
        const infoAcreedor = getDatosAcreedor();

        // Validar datos mandatorios del asesor para documentos legales
        if (!infoAcreedor.nombre || !infoAcreedor.telefono || !infoAcreedor.cedula) {
            Swal.fire({
                icon: 'error',
                title: 'Perfil Incompleto',
                text: 'Su usuario no tiene configurado el Nombre, Cédula o WhatsApp. No se puede generar documentos legales sin estos datos.',
                confirmButtonColor: '#0E5936',
                customClass: getSolicitudDarkSwalClass()
            });
            return;
        }

        const estadoCivil = (socio.estadocivil || '').toUpperCase();
        const esCasado = estadoCivil.includes('CASADO') || estadoCivil.includes('UNION') || estadoCivil.includes('UNIÓN');
        const nombreConyuge = (socio.nombreconyuge || 'CÓNYUGE').toUpperCase();

        const nombreDeudor = (socio.nombre || '').toUpperCase();
        const nombreGarante = (garanteInfo.nombre_garante || '').toUpperCase();
        const capital = parseFloat(credito.capital);
        const cuota = parseFloat(credito.cuota_con_ahorro);

        // Título
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('CONTRATO DE GARANTÍA', pageWidth / 2, 30, { align: 'center' });

        // Fecha arriba a la derecha
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${infoAcreedor.ciudad.toUpperCase()}, ${formatearFecha(fechaFirma, 'completo').toUpperCase()}`, pageWidth - margin, 40, { align: 'right' });

        let y = 50;

        // Información de cabecera
        doc.setFontSize(10);
        y = drawField(doc, `GARANTE: `, nombreGarante, margin, y, contentWidth);
        y = drawField(doc, `CÉDULA DE IDENTIDAD: `, garanteInfo.cedula_garante || '-', margin, y, contentWidth);
        y = drawField(doc, `DOMICILIO: `, (garanteInfo.domicilio_garante || 'No especificado').toUpperCase(), margin, y, contentWidth);
        y = drawField(doc, `TELÉFONO: `, garanteInfo.telefono_garante || garanteInfo.whatsapp_garante || '-', margin, y, contentWidth);
        y += 4;

        y = drawField(doc, `DEUDOR: `, nombreDeudor, margin, y, contentWidth);
        y = drawField(doc, `MONTO DEL PRÉSTAMO: `, `$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})`, margin, y, contentWidth);
        y = drawField(doc, `PLAZO DEL PRÉSTAMO: `, `${credito.plazo} MESES`, margin, y, contentWidth);
        y = drawField(doc, `INTERÉS MENSUAL EN PORCENTAJE: `, `${credito.tasa_interes_mensual} %`, margin, y, contentWidth);
        y = drawField(doc, `VALOR MENSUAL A PAGAR: `, `$${cuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(cuota)})`, margin, y, contentWidth);

        y += 10;

        // Declaración del garante
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const declaracion = `Yo, **${nombreGarante}**, con Cédula de Identidad Ecuatoriana número **${garanteInfo.cedula_garante || '-'}**, en mi calidad de GARANTE, me obligo solidariamente con el Deudor **${nombreDeudor}**, en relación al préstamo otorgado por **${infoAcreedor.nombre.toUpperCase()}**.`;
        y = renderJustifiedText(doc, declaracion, margin, y, contentWidth);
        y += 10;

        // Obligaciones
        doc.setFont('helvetica', 'bold');
        doc.text('DECLARACIONES Y OBLIGACIONES DEL GARANTE:', margin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        const obligaciones = [
            `1. Garantía de Pago: Me comprometo a garantizar el pago total del préstamo por un monto de **$${capital.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(capital)})**, más los intereses correspondientes y cualquier otro cargo aplicable, en caso de incumplimiento por parte del Deudor.`,

            `2. Solidaridad: Acepto que mi responsabilidad es solidaria, lo que significa que **${infoAcreedor.nombre.toUpperCase()}** puede requerir el pago total o parcial del préstamo directamente de mi persona sin necesidad de agotar las vías de cobro contra el Deudor.`,

            `3. Datos Personales: Declaro bajo juramento que todos mis datos personales proporcionados en este contrato son verdaderos y me comprometo a notificar cualquier cambio de domicilio o número de contacto a **${infoAcreedor.nombre.toUpperCase()}**.`,

            `4. Información del Deudor: Confirmo que conozco personalmente al Deudor **${nombreDeudor}** y estoy al tanto de su situación económica. Pongo a disposición de **${infoAcreedor.nombre.toUpperCase()}** mi número de contacto **${garanteInfo.telefono_garante || garanteInfo.whatsapp_garante || '-'}** para cualquier comunicación necesaria.`,

            `5. Compromiso de Pago: En caso de incumplimiento por parte del Deudor, me comprometo a realizar los pagos mensuales de **$${cuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })} (${numeroALetras(cuota)})** durante el plazo establecido de **${credito.plazo} meses**, o el pago total del saldo pendiente si así lo solicita **${infoAcreedor.nombre.toUpperCase()}**.`,

            `6. Exoneración de Responsabilidad: Eximo a **${infoAcreedor.nombre.toUpperCase()}** y a terceros de cualquier problema que se presente en caso de que la información proporcionada por mi persona sea errónea.`
        ];

        obligaciones.forEach(o => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = 25;
            }
            y = renderJustifiedText(doc, o, margin, y, contentWidth);
            y += 4;
        });

        // Firmas
        y += 15;
        if (y > pageHeight - 60) {
            doc.addPage();
            y = 25;
        }

        doc.setFont('helvetica', 'bold');
        doc.text('Firman:', margin, y);
        y += 35;

        // Lista de firmas a generar
        const firmas = [];
        firmas.push({ nombre: nombreDeudor, cedula: socio.cedula || '', label: '(DEUDOR)' });

        if (esCasado) {
            firmas.push({ nombre: nombreConyuge, cedula: socio.cedulaconyuge || '', label: '(CÓNYUGE)' });
        }

        firmas.push({ nombre: nombreGarante, cedula: garanteInfo.cedula_garante || '', label: 'GARANTE (DEUDOR)' });
        firmas.push({ nombre: infoAcreedor.nombre.toUpperCase(), cedula: infoAcreedor.cedula || '', label: '(ASESOR INKA CORP)' });

        // Dibujar firmas de 2 en 2
        const firmaWidth = (contentWidth / 2) - 20;
        for (let i = 0; i < firmas.length; i += 2) {
            let rowFirmas = firmas.slice(i, i + 2);
            let rowY = y;

            if (rowY > pageHeight - 50) {
                doc.addPage();
                rowY = 30;
            }

            rowFirmas.forEach((f, idx) => {
                const xPos = (rowFirmas.length === 1)
                    ? pageWidth / 2
                    : (idx === 0 ? margin + (contentWidth / 4) : margin + (3 * contentWidth / 4));

                // Línea de firma
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.line(xPos - (firmaWidth / 2), rowY, xPos + (firmaWidth / 2), rowY);

                // Nombre y C.I.
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');

                // Dividir nombre si es muy largo para evitar superposición
                const nombreLineas = doc.splitTextToSize(f.nombre, firmaWidth);
                doc.text(nombreLineas, xPos, rowY + 5, { align: 'center' });

                // Calcular desplazamiento basado en el número de líneas del nombre
                const offsetNombre = (nombreLineas.length * 4);

                doc.setFont('helvetica', 'normal');
                doc.text(`C.I.: ${f.cedula}`, xPos, rowY + 5 + offsetNombre, { align: 'center' });
                doc.text(f.label, xPos, rowY + 9 + offsetNombre, { align: 'center' });
            });

            y = rowY + 35; // Espacio para la siguiente fila
        }

        // Guardar
        const fileName = `ContratoGarantia_${credito.codigo_credito}_${nombreGarante.replace(/\s+/g, '_')}.pdf`;
        doc.save(fileName);

        // Actualizar estado en BD
        await actualizarEstadoDocumento(idCredito, 'documento_garante_firmado', true);

        showToast('Contrato de garantía generado exitosamente', 'success');

    } catch (error) {
        console.error('Error generando contrato de garantía:', error);
        showToast('Error al generar contrato de garantía: ' + error.message, 'error');
    }
}

// ========== UTILIDADES DE DOCUMENTOS ==========

async function cargarCreditoCompleto(idCredito) {
    const supabase = window.getSupabaseClient();

    // Cargar crédito básico
    const { data: credito, error } = await supabase
        .from('ic_creditos')
        .select('*')
        .eq('id_credito', idCredito)
        .single();

    if (error) throw error;
    if (!credito) return null;

    // Cargar socio - primero intentar desde DB, luego desde caché
    let socioData = null;
    const cachedSocios = window.dataCache?.socios || [];

    // Intentar desde DB si es UUID válido
    if (credito.id_socio && credito.id_socio.length > 30) {
        const { data: socio } = await supabase
            .from('ic_socios')
            .select('*')
            .eq('idsocio', credito.id_socio)
            .single();
        socioData = socio;
    }

    // Fallback a caché
    if (!socioData) {
        socioData = cachedSocios.find(s =>
            s.idsocio === credito.id_socio || s.cedula === credito.id_socio
        );
    }

    // Cargar documentos
    const { data: documentos } = await supabase
        .from('ic_creditos_documentos')
        .select('*')
        .eq('id_credito', idCredito);

    // Cargar garante
    const { data: garantes } = await supabase
        .from('ic_creditos_garantes')
        .select('*')
        .eq('id_credito', idCredito);

    // Cargar amortización
    const { data: amortizacion } = await supabase
        .from('ic_creditos_amortizacion')
        .select('*')
        .eq('id_credito', idCredito)
        .order('numero_cuota', { ascending: true });

    // Ensamblar objeto completo
    credito.socio = socioData || {};
    credito.documentos = documentos || [];
    credito.garante_info = garantes || [];
    credito.amortizacion = amortizacion || [];

    return credito;
}

async function actualizarEstadoDocumento(idCredito, campo, valor) {
    const supabase = window.getSupabaseClient();
    const updateData = {};
    updateData[campo] = valor;

    const { error } = await supabase
        .from('ic_creditos_documentos')
        .update(updateData)
        .eq('id_credito', idCredito);

    if (error) {
        console.warn('Error actualizando estado de documento:', error);
    }

    // Refrescar modal SOLO si está visible en el DOM
    const modalExistente = document.getElementById('modal-documentos-credito');
    if (modalExistente && currentCreditoDocumentos && currentCreditoDocumentos.id_credito === idCredito) {
        await abrirModalDocumentosCredito(idCredito);
    }
}

// ========== 5. GENERAR SOLICITUD DE CRÉDITO ORIGINAL ==========
async function generarDocumentoSolicitud(idCredito, fechaFirmaManual = null) {
    try {
        const supabase = window.getSupabaseClient();
        const credito = currentCreditoDocumentos || await cargarCreditoCompleto(idCredito);
        if (!credito) throw new Error('No se encontró el préstamo');

        if (!credito.id_solicitud) {
            showToast('Este crédito no tiene una solicitud asociada registrada.', 'warning');
            return;
        }

        // Cargar datos de la solicitud
        const { data: solicitud, error } = await supabase
            .from('ic_solicitud_de_credito')
            .select('*')
            .eq('solicitudid', credito.id_solicitud)
            .single();

        if (error) throw error;
        if (!solicitud) throw new Error('No se encontró la solicitud de préstamo.');

        // Obtener fecha de firma del modal
        const fechaFirmaInput = document.getElementById('fecha-firma-docs');
        const fechaFirma = fechaFirmaManual || (fechaFirmaInput ? fechaFirmaInput.value : null);

        // Generar el PDF usando la función existente modificada
        const btnId = `btn-solicitud-${idCredito}`;
        await generarPDFSolicitud(solicitud, btnId, fechaFirma);

        return true;
    } catch (error) {
        console.error('Error generando PDF de solicitud:', error);
        showToast('Error al generar PDF de solicitud: ' + (error.message || 'Error desconocido'), 'error');
        return false;
    }
}

async function generarTodosDocumentos(idCredito) {
    const btnAll = document.querySelector('.btn-generar-todos');
    const originalBtnAllHtml = btnAll ? btnAll.innerHTML : '';
    
    // Elementos de la lista para animar
    const docItems = document.querySelectorAll('.doc-item');

    try {
        if (btnAll) {
            btnAll.disabled = true;
            btnAll.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
        }

        // Mostrar alerta de procesamiento
        Swal.fire({
            title: 'Generando Documentos',
            html: 'Por favor espere mientras se preparan todos los archivos del préstamo...',
            allowOutsideClick: false,
            customClass: getSolicitudDarkSwalClass(),
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Capturar datos ANTES de cerrar el modal
        const credito = currentCreditoDocumentos || await cargarCreditoCompleto(idCredito);
        const fechaFirmaInput = document.getElementById('fecha-firma-docs');
        const fechaFirma = fechaFirmaInput ? fechaFirmaInput.value : null;

        // Cerrar el modal de selección inmediatamente para limpiar la vista
        cerrarModalDocumentos();

        // Restaurar referencia para que las funciones individuales la usen
        currentCreditoDocumentos = credito;

        // Preparar promesas para ejecución en paralelo pasando la fecha capturada
        const promesas = [
            generarDocumentoSolicitud(idCredito, fechaFirma), 
            generarDocumentoContrato(idCredito, fechaFirma),
            generarDocumentoPagare(idCredito, fechaFirma),
            generarDocumentoTablaAmortizacion(idCredito, fechaFirma)
        ];

        if (credito?.garante) {
            promesas.push(generarDocumentoGarantia(idCredito, fechaFirma));
        }

        // Ejecutar todas de golpe
        await Promise.all(promesas);

        // Limpiar referencia
        currentCreditoDocumentos = null;

        // Marcar documentos como generados en el crédito
        const supabase = window.getSupabaseClient();
        await supabase
            .from('ic_creditos')
            .update({ documentos_generados: true })
            .eq('id_credito', idCredito);

        // Mostrar mensaje de éxito detallado con instrucciones
        await Swal.fire({
            title: '¡Documentos Generados!',
            html: `
                <div style="text-align: left; font-size: 0.95rem; line-height: 1.5;">
                    <p>Se han generado todos los documentos exitosamente. <b>Alístate para desembolsar el préstamo</b>.</p>
                    <p style="margin-top: 10px; color: #d32f2f; font-weight: bold;">
                        <i class="fas fa-exclamation-triangle"></i> IMPORTANTE:
                    </p>
                    <p>Recuerda que también tendrás que subir (aparte de los 4 documentos aquí generados):</p>
                    <ul style="margin-left: 20px;">
                        <li>Evidencia del socio firmando los documentos.</li>
                        <li>Evidencia del dinero entregándose (comprobante de transferencia o foto del socio recibiendo el efectivo).</li>
                    </ul>
                    <p style="margin-top: 10px; font-style: italic; color: #666;">
                        Es muy importante para activar el préstamo; de otra forma no podrás hacerlo.
                    </p>
                </div>
            `,
            icon: 'success',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#2e7d32',
            allowOutsideClick: false,
            customClass: getSolicitudDarkSwalClass()
        });

        // Refrescar lista de pendientes
        await loadPendientesDesembolso();

    } catch (error) {
        console.error('Error en generación masiva:', error);
        Swal.fire({
            title: 'Error',
            text: 'Hubo un problema al generar algunos documentos. Por favor, intente de nuevo.',
            icon: 'error',
            confirmButtonText: 'Entendido',
            customClass: getSolicitudDarkSwalClass()
        });
    } finally {
        // Restaurar botón principal
        if (btnAll) {
            btnAll.disabled = false;
            btnAll.innerHTML = originalBtnAllHtml;
        }
        
        // Quitar clase pulso de los items
        docItems.forEach(item => item.classList.remove('generating'));
    }
}

/**
 * Renderiza texto justificado en jsPDF evitando que la última línea se justifique
 * @param {Object} doc Instancia de jsPDF
 * @param {string} text Texto a renderizar
 * @param {number} x Posición X
 * @param {number} y Posición Y
 * @param {number} width Ancho máximo
 * @param {number} lineHeight Altura de línea (default 6)
 * @returns {number} Nueva posición Y
 */
function renderJustifiedText(doc, text, x, y, width, lineHeight = 6) {
    // Si no hay marcadores de negrita, usar el método nativo que es más preciso
    if (!text.includes('**')) {
        const lines = doc.splitTextToSize(text, width);
        lines.forEach((line, index) => {
            if (index === lines.length - 1) {
                doc.text(line, x, y + (index * lineHeight));
            } else {
                doc.text(line, x, y + (index * lineHeight), { align: 'justify', maxWidth: width });
            }
        });
        return y + (lines.length * lineHeight);
    }

    // Procesar texto con negritas (**texto**)
    const tokens = [];
    const parts = text.split(/(\*\*.*?\*\*)/g);
    parts.forEach(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
            tokens.push({ text: part.slice(2, -2), bold: true });
        } else if (part.length > 0) {
            tokens.push({ text: part, bold: false });
        }
    });

    // Convertir tokens a palabras individuales para el wrapping
    const words = [];
    tokens.forEach(token => {
        const splitWords = token.text.split(/(\s+)/);
        splitWords.forEach(word => {
            if (word.length > 0) {
                words.push({ text: word, bold: token.bold });
            }
        });
    });

    // Agrupar palabras en líneas según el ancho
    const lines = [];
    let currentLine = [];
    let currentLineWidth = 0;

    words.forEach(word => {
        doc.setFont('helvetica', word.bold ? 'bold' : 'normal');
        const wordWidth = doc.getTextWidth(word.text);

        if (currentLineWidth + wordWidth > width && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = [];
            currentLineWidth = 0;
        }

        if (currentLine.length === 0 && word.text.trim() === '') return;

        currentLine.push({ ...word, width: wordWidth });
        currentLineWidth += wordWidth;
    });
    if (currentLine.length > 0) lines.push(currentLine);

    // Renderizar cada línea
    lines.forEach((line, lineIndex) => {
        let currentX = x;
        const isLastLine = lineIndex === lines.length - 1;

        // Limpiar espacios al final de la línea para el cálculo de justificación
        let wordsInLine = [...line];
        while (wordsInLine.length > 0 && wordsInLine[wordsInLine.length - 1].text.trim() === '') {
            wordsInLine.pop();
        }

        const totalWordsWidth = wordsInLine.reduce((sum, w) => sum + w.width, 0);
        const spacesInLine = wordsInLine.filter(w => w.text.trim() === '');
        const spacesCount = spacesInLine.length;

        let extraSpacePerSpace = 0;
        if (!isLastLine && spacesCount > 0) {
            extraSpacePerSpace = (width - totalWordsWidth) / spacesCount;
        }

        wordsInLine.forEach(word => {
            doc.setFont('helvetica', word.bold ? 'bold' : 'normal');
            doc.text(word.text, currentX, y);
            currentX += word.width + (word.text.trim() === '' ? extraSpacePerSpace : 0);
        });

        y += lineHeight;
    });

    return y;
}

/**
 * Dibuja un campo con etiqueta en negrita y valor normal, con ajuste de línea si es necesario
 * @returns {number} Nueva posición Y
 */
function drawField(doc, label, value, x, y, maxWidth) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);
    const labelWidth = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    const valX = x + labelWidth + 2;
    const valWidth = maxWidth - (valX - x);
    const lines = doc.splitTextToSize(value, valWidth);
    doc.text(lines, valX, y);
    return y + Math.max(lines.length * 5, 6);
}

/**
 * Convierte un número a letras en formato moneda (Dólares)
 * @param {number} num Número a convertir
 * @returns {string} Texto en letras
 */
function numeroALetras(num) {
    const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const decenas2 = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETENCIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    function convertir(n) {
        if (n === 0) return '';
        if (n < 10) return unidades[n];
        if (n < 20) return decenas[n - 10];
        if (n < 100) {
            const u = n % 10;
            return decenas2[Math.floor(n / 10)] + (u > 0 ? (n > 20 && n < 30 ? '' : ' Y ') + unidades[u] : '');
        }
        if (n === 100) return 'CIEN';
        if (n < 1000) {
            return centenas[Math.floor(n / 100)] + ' ' + convertir(n % 100);
        }
        if (n < 2000) return 'MIL ' + convertir(n % 1000);
        if (n < 1000000) {
            return convertir(Math.floor(n / 1000)) + ' MIL ' + convertir(n % 1000);
        }
        if (n < 2000000) return 'UN MILLÓN ' + convertir(n % 1000000);
        return convertir(Math.floor(n / 1000000)) + ' MILLONES ' + convertir(n % 1000000);
    }

    const entero = Math.floor(num);
    const decimales = Math.round((num - entero) * 100);
    const letras = entero === 0 ? 'CERO' : convertir(entero);
    const centavos = decimales.toString().padStart(2, '0');

    return `${letras} DÓLARES AMERICANOS con ${centavos}/100`.replace(/\s+/g, ' ').trim();
}

function formatearFecha(fechaStr, formato = 'corto') {
    if (!fechaStr) return '-';

    // Usar el parser centralizado que ya maneja la zona horaria de Ecuador
    const fecha = parseDate(fechaStr);
    if (!fecha) return '-';

    const tz = 'America/Guayaquil';

    if (formato === 'largo' || formato === 'completo') {
        const opciones = {
            timeZone: tz,
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        };

        if (formato === 'completo') {
            opciones.weekday = 'long';
        }

        return fecha.toLocaleDateString('es-EC', opciones);
    }

    return fecha.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: tz
    });
}

// ==========================================
// FUNCIÓN DE ANULACIÓN DE CRÉDITO COLOCADO
// ==========================================
let anulandoIds = new Set();
async function anularCreditoColocado(idCredito, codigoCredito) {
    if (anulandoIds.has(idCredito)) return;
    
    try {
        anulandoIds.add(idCredito);
        const supabase = window.getSupabaseClient();

        // 1. Obtener datos necesarios para el mensaje y para después
        const { data: credito, error: errorFetch } = await supabase
            .from('ic_creditos')
            .select(`
                id_solicitud,
                capital,
                socio:ic_socios(nombre)
            `)
            .eq('id_credito', idCredito)
            .single();

        if (errorFetch) throw errorFetch;

        const nombreSocio = credito.socio?.nombre || 'Socio Desconocido';
        const montoFormatted = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(credito.capital);

        const confirmacion = await showConfirm(
            `¿Estás seguro que deseas anular el crédito de <b>${nombreSocio}</b> por <b>${montoFormatted}</b>?<br><br>Solo puedes anular un crédito en este paso si de verdad estás seguro que el socio ya no lo quiere, ya que se perderá todo el progreso (documentos, amortización, etc.).`,
            '⚠️ Advertencia de Anulación',
            { confirmText: 'Sí, Anular Todo', cancelText: 'No, Mantener', type: 'danger' }
        );

        if (!confirmacion) {
            // Cooldown para evitar reabrir por clics residuales
            setTimeout(() => anulandoIds.delete(idCredito), 300);
            return;
        }

        actualizarScreenBlocker('Anulando crédito y revirtiendo cambios...', 10);
        mostrarScreenBlocker('Preparando anulación...');
        
        const idSolicitud = credito.id_solicitud;

        actualizarScreenBlocker('Eliminando registros generados...', 40);

        // 2. Eliminar el crédito. Gracias a ON DELETE CASCADE, esto borrará:
        // ic_creditos_amortizacion, ic_creditos_ahorro, ic_creditos_documentos, ic_creditos_garantes, ic_creditos_historial
        const { error: errorDelete } = await supabase
            .from('ic_creditos')
            .delete()
            .eq('id_credito', idCredito);

        if (errorDelete) throw errorDelete;

        actualizarScreenBlocker('Actualizando estado de la solicitud...', 70);

        // 3. Actualizar el estado de la solicitud a 'ANULADA'
        if (idSolicitud) {
            const { error: errorSolicitud } = await supabase
                .from('ic_solicitud_de_credito')
                .update({ estado: 'ANULADA' })
                .eq('solicitudid', idSolicitud);

            if (errorSolicitud) throw errorSolicitud;
            
            console.log(`✅ Solicitud ${idSolicitud} marcada como ANULADA`);
        }

        actualizarScreenBlocker('Proceso completado', 100);
        await new Promise(resolve => setTimeout(resolve, 500));
        ocultarScreenBlocker();

        showToast(`✅ El crédito de ${nombreSocio} ha sido anulado y sus datos eliminados.`, 'success');

        // Recargar datos
        if (window.dataCache) {
            window.dataCache.creditos = null;
        }
        
        // Recargar dashboard si estamos en él
        if (typeof window.loadDesembolsosPendientes === 'function') {
            await window.loadDesembolsosPendientes();
        }

        await loadSolicitudes();
        await loadPendientesDesembolso();

    } catch (error) {
        console.error('Error al anular crédito:', error);
        ocultarScreenBlocker();
        showToast('Error al anular crédito: ' + error.message, 'error');
    } finally {
        // Solo eliminamos aquí si no se canceló previamente (donde ya hay un timeout)
        if (anulandoIds.has(idCredito)) {
            setTimeout(() => anulandoIds.delete(idCredito), 300);
        }
    }
}

// ==========================================
// FUNCIÓN DE DESEMBOLSO
// ==========================================
async function desembolsarCredito(idCredito) {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('desembolsar créditos')) return;
    }

    try {
        const supabase = window.getSupabaseClient();

        // 1. Obtener datos del crédito, socio y garante
        const { data: credito, error: errorFetch } = await supabase
            .from('ic_creditos')
            .select('*, socio:ic_socios(nombre)')
            .eq('id_credito', idCredito)
            .single();

        if (errorFetch) throw errorFetch;

        const { data: garante } = await supabase
            .from('ic_creditos_garantes')
            .select('*')
            .eq('id_credito', idCredito)
            .maybeSingle();

        const nombreSocio = (credito.socio?.nombre || 'SOCIO').toUpperCase().replace(/\s+/g, '_');
        const tieneGarante = !!garante;

        // 2. Mostrar modal de carga de archivos
        mostrarModalDesembolsoArchivos(credito, nombreSocio, tieneGarante);

    } catch (error) {
        console.error('Error iniciando desembolso:', error);
        showToast('Error al iniciar desembolso: ' + error.message, 'error');
    }
}

function mostrarModalDesembolsoArchivos(credito, nombreSocio, tieneGarante) {
    const idCredito = credito.id_credito;
    selectedFilesForDesembolso = {
        contrato: null,
        pagare: null,
        tabla: null,
        garante: null
    };

    // Remover modal existente si hay
    const existingModal = document.getElementById('modal-desembolso-archivos');
    if (existingModal) existingModal.remove();

    const docs = [
        { id: 'contrato', label: 'Solicitud / Contrato', icon: 'fa-file-contract' },
        { id: 'pagare', label: 'Pagaré Firmado', icon: 'fa-file-signature' },
        { id: 'tabla', label: 'Tabla de Amortización', icon: 'fa-table' }
    ];

    if (tieneGarante) {
        docs.push({ id: 'garante', label: 'Documento Garante', icon: 'fa-user-shield' });
    }

    const modalHTML = `
        <div id="modal-desembolso-archivos" class="modal" style="display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div class="modal-backdrop" onclick="cerrarModalDesembolsoArchivos()" style="background: rgba(3, 7, 18, 0.72); backdrop-filter: blur(6px);"></div>
            <div class="modal-card" style="max-width: 500px; width: 95%; background: linear-gradient(155deg, #1b2735 0%, #1f2d3d 100%); border: 1px solid rgba(148, 163, 184, 0.28); border-radius: 1.25rem; overflow: hidden; box-shadow: 0 28px 56px -14px rgba(2, 6, 12, 0.62); animation: scaleIn 0.3s ease;">
                <div class="modal-header" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(148, 163, 184, 0.24);">
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700;"><i class="fas fa-cloud-upload-alt"></i> Carga de Documentos Firmados</h3>
                    <button onclick="cerrarModalDesembolsoArchivos()" style="background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.24); color: #f8fbff; cursor: pointer; font-size: 1.25rem; width: 36px; height: 36px; border-radius: 0.7rem;"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding: 1.5rem; background: #1f2a38;">
                    <div style="background: linear-gradient(135deg, rgba(11, 78, 50, 0.18) 0%, rgba(11, 78, 50, 0.12) 100%); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 0.75rem; padding: 0.75rem; margin-bottom: 1.25rem;">
                        <p style="color: #d9fbe8; font-size: 0.85rem; margin: 0; line-height: 1.4;">
                            Suba cada documento por separado. El botón de activación se habilitará cuando todos los archivos estén listos.
                        </p>
                    </div>
                    
                    <div id="document-slots-container" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
                        ${docs.map(doc => `
                            <div id="slot-${doc.id}" class="doc-slot" style="border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 0.75rem; padding: 0.75rem; transition: all 0.2s ease; background: #202d3d; box-shadow: 0 4px 10px rgba(4, 10, 18, 0.2);">
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                                        <div style="width: 36px; height: 36px; border-radius: 0.5rem; background: #1a2534; display: flex; align-items: center; justify-content: center; color: #83f0bb; border: 1px solid rgba(74, 222, 128, 0.22);">
                                            <i class="fas ${doc.icon}"></i>
                                        </div>
                                        <div>
                                            <div style="font-weight: 700; font-size: 0.85rem; color: #eef5fe;">${doc.label}</div>
                                            <div id="status-${doc.id}" style="font-size: 0.75rem; color: #b9c8dc;">Pendiente de carga</div>
                                        </div>
                                    </div>
                                    <div id="action-${doc.id}">
                                        <button onclick="document.getElementById('input-${doc.id}').click()" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 10px rgba(11, 78, 50, 0.28);">
                                            <i class="fas fa-upload"></i> Subir
                                        </button>
                                    </div>
                                    <input type="file" id="input-${doc.id}" accept="application/pdf,image/*" style="display: none;" onchange="handleFileSelectSlot('${doc.id}', this)">
                                </div>
                                <div id="progress-bar-container-${doc.id}" style="display: none; margin-top: 0.75rem;">
                                    <div style="width: 100%; height: 6px; background: #1a2534; border-radius: 3px; overflow: hidden; border: 1px solid rgba(148, 163, 184, 0.2);">
                                        <div id="progress-bar-${doc.id}" style="width: 0%; height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; gap: 0.75rem;">
                        <button onclick="cerrarModalDesembolsoArchivos()" style="flex: 1; padding: 0.875rem; border-radius: 0.75rem; border: 1px solid rgba(148, 163, 184, 0.34); background: #2a3748; color: #e4ecf8; font-weight: 700; cursor: pointer;">Cancelar</button>
                        <button id="btn-confirmar-desembolso-final" onclick="ejecutarDesembolsoConArchivos('${idCredito}', '${nombreSocio}', ${tieneGarante})" disabled style="flex: 1.5; padding: 0.875rem; border-radius: 0.75rem; border: none; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%); color: white; font-weight: 700; cursor: pointer; opacity: 0.5; box-shadow: 0 4px 12px rgba(11, 78, 50, 0.2);">
                            <i class="fas fa-check-circle"></i> Activar Crédito
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
}

let selectedFilesForDesembolso = {};

function handleFileSelectSlot(slotId, input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        selectedFilesForDesembolso[slotId] = file;

        // Actualizar UI del slot
        const statusEl = document.getElementById(`status-${slotId}`);
        const actionEl = document.getElementById(`action-${slotId}`);
        const slotEl = document.getElementById(`slot-${slotId}`);

        statusEl.innerHTML = `<span style="color: #6ee7b7; font-weight: 600;"><i class="fas fa-check"></i> ${file.name}</span>`;
        actionEl.innerHTML = `
            <button onclick="document.getElementById('input-${slotId}').click()" style="background: none; border: none; color: #7dd3fc; cursor: pointer; font-size: 0.85rem; padding: 0.4rem;"><i class="fas fa-sync-alt"></i></button>
            <button onclick="removeFileFromSlot('${slotId}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.85rem; padding: 0.4rem;"><i class="fas fa-trash-alt"></i></button>
        `;
        slotEl.style.borderColor = 'rgba(74, 222, 128, 0.45)';
        slotEl.style.background = 'linear-gradient(135deg, rgba(11, 78, 50, 0.22) 0%, rgba(11, 78, 50, 0.14) 100%)';

        checkAllFilesReady();
    }
}

function removeFileFromSlot(slotId) {
    selectedFilesForDesembolso[slotId] = null;

    const statusEl = document.getElementById(`status-${slotId}`);
    const actionEl = document.getElementById(`action-${slotId}`);
    const slotEl = document.getElementById(`slot-${slotId}`);

    statusEl.innerHTML = 'Pendiente de carga';
    statusEl.style.color = '#b9c8dc';
    actionEl.innerHTML = `
        <button onclick="document.getElementById('input-${slotId}').click()" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 10px rgba(11, 78, 50, 0.28);">
            <i class="fas fa-upload"></i> Subir
        </button>
    `;
    slotEl.style.borderColor = 'rgba(148, 163, 184, 0.3)';
    slotEl.style.background = '#202d3d';

    checkAllFilesReady();
}

function checkAllFilesReady() {
    const btn = document.getElementById('btn-confirmar-desembolso-final');
    const slots = document.querySelectorAll('.doc-slot');
    let allReady = true;

    slots.forEach(slot => {
        const id = slot.id.replace('slot-', '');
        if (!selectedFilesForDesembolso[id]) {
            allReady = false;
        }
    });

    if (allReady) {
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }
}

function cerrarModalDesembolsoArchivos() {
    const modal = document.getElementById('modal-desembolso-archivos');
    if (modal) modal.remove();
    const hasVisibleModals = Array.from(document.querySelectorAll('.modal')).some(el => !el.classList.contains('hidden'));
    if (!hasVisibleModals) {
        document.body.style.overflow = '';
    }
    selectedFilesForDesembolso = {};
}

async function ejecutarDesembolsoConArchivos(idCredito, nombreSocio, tieneGarante) {
    const btn = document.getElementById('btn-confirmar-desembolso-final');
    const originalContent = btn.innerHTML;
    const supabase = window.getSupabaseClient();

    // Validar caja abierta antes de cualquier operación financiera
    if (window.validateCajaBeforeAction && !window.validateCajaBeforeAction('desembolsar este crédito')) {
        return;
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

        const hoy = new Date();
        const fechaStr = `${hoy.getDate().toString().padStart(2, '0')}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getFullYear()}`;

        const slots = ['contrato', 'pagare', 'tabla'];
        if (tieneGarante) slots.push('garante');

        const columnMap = {
            contrato: { url: 'contrato_url', firmado: 'contrato_firmado' },
            pagare: { url: 'pagare_url', firmado: 'pagare_firmado' },
            tabla: { url: 'tabla_amortizacion_url', firmado: 'tabla_amortizacion_firmada' },
            garante: { url: 'documento_garante_url', firmado: 'documento_garante_firmado' }
        };

        for (const slotId of slots) {
            const file = selectedFilesForDesembolso[slotId];
            if (!file) continue;

            // Mostrar progreso
            const progressContainer = document.getElementById(`progress-bar-container-${slotId}`);
            const progressBar = document.getElementById(`progress-bar-${slotId}`);
            const statusEl = document.getElementById(`status-${slotId}`);
            const actionEl = document.getElementById(`action-${slotId}`);

            progressContainer.style.display = 'block';
            progressBar.style.width = '30%';
            statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> Subiendo archivo...';
            actionEl.innerHTML = '';

            // 1. Subir a Storage usando la utilidad centralizada
            // folder: documentos_creditos, id: idCredito/tipo (ej: id/pagare)
            const uploadRes = await window.uploadFileToStorage(file, 'documentos_creditos', `${idCredito}/${slotId}`);
            
            if (!uploadRes.success) {
                throw new Error(`Error al subir ${slotId}: ${uploadRes.error}`);
            }

            const fileLink = uploadRes.url;

            progressBar.style.width = '70%';
            statusEl.innerHTML = '<i class="fas fa-database"></i> Registrando en base de datos...';

            // 3. Actualizar Supabase
            const updateData = {};
            updateData[columnMap[slotId].url] = fileLink;
            updateData[columnMap[slotId].firmado] = true;

            const { error: updateError } = await supabase
                .from('ic_creditos_documentos')
                .update(updateData)
                .eq('id_credito', idCredito);

            if (updateError) throw updateError;

            progressBar.style.width = '100%';
            statusEl.innerHTML = `<span style="color: #059669;"><i class="fas fa-check-double"></i> Completado</span>`;

            // Pequeña pausa para la animación
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 4. Activación real del crédito
        await completarActivacionCredito(idCredito);

        showToast('✅ Todos los documentos han sido procesados y el crédito ha sido activado', 'success');

        // Si todo salió bien, podemos cerrar el modal después de un momento
        setTimeout(() => {
            cerrarModalDesembolsoArchivos();
            // Opcional: habilitar un botón de "Activar Ahora" si estamos en modo real
        }, 1500);

    } catch (error) {
        console.error('Error en el proceso de desembolso:', error);
        showToast('Error: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

async function completarActivacionCredito(idCredito) {
    const supabase = window.getSupabaseClient();
    const currentUser = window.getCurrentUser();
    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split('T')[0];

    // CARGAR DATOS DEL CRÉDITO PARA REGISTRO EN CAJA
    const { data: infoCredito, error: errorCarga } = await supabase
        .from('ic_creditos')
        .select('capital, codigo_credito, id_socio, id_solicitud')
        .eq('id_credito', idCredito)
        .single();
    
    if (errorCarga) throw new Error('No se pudo obtener la información del crédito: ' + errorCarga.message);

    // OBTENER NOMBRE DEL SOCIO
    const { data: socioData } = await supabase
        .from('ic_socios')
        .select('nombre')
        .eq('idsocio', infoCredito.id_socio)
        .single();
    
    const nombreSocio = socioData?.nombre || 'SOCIO DESCONOCIDO';

    // OBTENER URL DEL PAGARÉ (Para comprobante en Caja)
    const { data: docData } = await supabase
        .from('ic_creditos_documentos')
        .select('pagare_url')
        .eq('id_credito', idCredito)
        .single();

    const pagareUrl = docData?.pagare_url || null;

    // 1. REGISTRAR EL EGRESO EN CAJA (Si hay caja abierta)
    if (window.sysCajaAbierta) {
        // Buscar id_apertura activo del usuario
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        if (userId) {
            const { data: cajaData } = await supabase
                .from('ic_caja_aperturas')
                .select('id_apertura')
                .eq('id_usuario', userId)
                .eq('estado', 'ABIERTA')
                .order('fecha_apertura', { ascending: false })
                .limit(1)
                .single();

            if (cajaData) {
                const { error: errorMov } = await supabase
                    .from('ic_caja_movimientos')
                    .insert({
                        id_apertura: cajaData.id_apertura,
                        tipo_movimiento: 'EGRESO',
                        categoria: 'DESEMBOLSO_CREDITO',
                        monto: infoCredito.capital,
                        metodo_pago: 'TRANSFERENCIA',
                        descripcion: `DESEMBOLSO DE CRÉDITO ${infoCredito.codigo_credito} A: ${nombreSocio}`,
                        comprobante_url: pagareUrl,
                        id_referencia: idCredito,
                        tabla_referencia: 'ic_creditos',
                        id_usuario: userId
                    });
                
                if (errorMov) console.error('[CAJA] Error registrando desembolso en bitácora:', errorMov);
            }
        }
    }

    // 2. ACTUALIZAR ESTADO DEL CRÉDITO A ACTIVO
    const { error: errorCredito } = await supabase
        .from('ic_creditos')
        .update({
            estado_credito: 'ACTIVO',
            fecha_desembolso: todayStr,
            updated_at: now
        })
        .eq('id_credito', idCredito);

    if (errorCredito) throw errorCredito;

    // Registrar en historial
    await supabase.from('ic_creditos_historial').insert({
        id_credito: idCredito,
        estado_anterior: 'PENDIENTE',
        estado_nuevo: 'ACTIVO',
        fecha_cambio: now,
        usuario: currentUser?.id || null,
        motivo: `Desembolso completado con carga de documentos. Procesado por: ${currentUser?.nombre || 'Sistema'}`
    });

    // Actualizar solicitud
    const { data: creditoData } = await supabase
        .from('ic_creditos')
        .select('id_solicitud')
        .eq('id_credito', idCredito)
        .single();

    if (creditoData?.id_solicitud) {
        await supabase
            .from('ic_solicitud_de_credito')
            .update({ estado: 'DESEMBOLSADA' })
            .eq('solicitudid', creditoData.id_solicitud);

        // Actualizar localmente
        const index = allSolicitudes.findIndex(s => s.solicitudid === creditoData.id_solicitud);
        if (index !== -1) {
            allSolicitudes[index].estado = 'DESEMBOLSADA';
            filteredSolicitudes = [...allSolicitudes];

            // Actualizar caché
            if (window.setCacheData) {
                window.setCacheData('solicitudes', allSolicitudes);
            }

            updateSolicitudesStats();
            updateSolicitudesCounts();
            applyFiltersSolicitud();
        }
    }

    // Refrescar vistas
    if (typeof loadPendientesDesembolso === 'function') await loadPendientesDesembolso();
    if (typeof loadDesembolsosPendientes === 'function') await window.loadDesembolsosPendientes?.();

    cerrarModalDocumentos();
}

// Exponer funciones globalmente
window.handleFileSelectSlot = handleFileSelectSlot;
window.removeFileFromSlot = removeFileFromSlot;
window.cerrarModalDesembolsoArchivos = cerrarModalDesembolsoArchivos;
window.ejecutarDesembolsoConArchivos = ejecutarDesembolsoConArchivos;

// Exponer funciones globalmente
window.generarDocumentoPagare = generarDocumentoPagare;
window.generarDocumentoContrato = generarDocumentoContrato;
window.generarDocumentoTablaAmortizacion = generarDocumentoTablaAmortizacion;
window.generarDocumentoGarantia = generarDocumentoGarantia;
window.generarDocumentoSolicitud = generarDocumentoSolicitud;
window.generarTodosDocumentos = generarTodosDocumentos;
window.desembolsarCredito = desembolsarCredito;
window.anularCreditoColocado = anularCreditoColocado;
window.prepararSimulacionPDF = prepararSimulacionPDF;

// Exponer función globalmente
window.generarPDFSolicitud = generarPDFSolicitud;
