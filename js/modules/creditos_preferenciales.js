/**
 * INKA CORP - Módulo de Administración de Créditos Preferenciales
 * Gestión y monitoreo de créditos preferenciales
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allCreditosPref = [];
let filteredCreditosPref = [];
let currentEstadoFilterPref = '';
let currentViewPref = 'gallery'; // Por defecto galería
let estadoSortEnabledPref = true;
let currentSortPref = { field: 'fecha', direction: 'desc' };
let currentViewingCreditoPref = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initCreditosPreferencialesModule() {
    loadCreditosPreferenciales();
    setupCreditosPrefEventListeners();
    
    // Inicializar visual de la vista por defecto
    setTimeout(() => {
        switchViewPref(currentViewPref);
    }, 100);

    // Exponer funciones al scope global para onclick handlers
    window.refreshCreditosPreferencialesCache = refreshCreditosPreferencialesCache;
    window.sortCreditosPref = sortCreditosPref;
    window.toggleEstadoFilterPref = toggleEstadoFilterPref;
    window.filterCreditosPrefByEstado = filterCreditosPrefByEstado;
    window.viewCreditoPref = viewCreditoPref;
    window.cleanupStickyHeadersPref = cleanupStickyHeadersPref;
    window.switchViewPref = switchViewPref;
    window.filterBySocioAndSwitchToTable = filterBySocioAndSwitchToTable;
}

// ==========================================
// MODAL HELPERS
// ==========================================
function openCreditosPrefModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeCreditosPrefModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('hidden');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

// ==========================================
// CAMBIO DE VISTA
// ==========================================
function switchViewPref(view) {
    currentViewPref = view;

    // Actualizar botones del switcher
    document.getElementById('view-gallery-btn').classList.toggle('active', view === 'gallery');
    document.getElementById('view-table-btn').classList.toggle('active', view === 'table');

    // Mostrar/Ocultar contenedores
    const galleryContainer = document.getElementById('creditos-pref-gallery-container');
    const tableContainer = document.getElementById('creditos-pref-sections-container');
    const filterCounters = document.getElementById('estado-counters-pref');

    if (view === 'gallery') {
        galleryContainer.classList.remove('hidden');
        tableContainer.classList.add('hidden');
        filterCounters.style.opacity = '0.3';
        filterCounters.style.pointerEvents = 'none';

        // Limpiar búsqueda al cambiar a galería
        const searchInput = document.getElementById('search-creditos-pref');
        if (searchInput) {
            searchInput.value = '';
        }
    } else {
        galleryContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');
        filterCounters.style.opacity = '1';
        filterCounters.style.pointerEvents = 'all';
    }

    // Re-filtrar para que la galería ignore el filtro de estado o la tabla lo aplique
    filterCreditosPref();
}

function setupCreditosPrefModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closeCreditosPrefModal(modalId));
    });
}

function setupCreditosPrefEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-creditos-pref');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterCreditosPref();
        }, 300));
    }

    // Modal close handlers
    setupCreditosPrefModalCloseHandlers('ver-credito-pref-modal');

    // Setup sticky headers con scroll listener
    setupStickyHeadersPref();
}

// ==========================================
// STICKY HEADERS CON JAVASCRIPT
// ==========================================
let currentStickyHeaderPref = null;
let stickyHeaderClonePref = null;

function setupStickyHeadersPref() {
    window.addEventListener('scroll', handleStickyScrollPref, { passive: true });
}

function handleStickyScrollPref() {
    const sections = document.querySelectorAll('.creditos-pref-section');
    if (sections.length === 0) return;

    const scrollTop = window.scrollY;
    let activeSection = null;

    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const sectionTop = rect.top + scrollTop;
        const sectionBottom = sectionTop + section.offsetHeight;

        if (scrollTop >= sectionTop - 60 && scrollTop < sectionBottom - 100) {
            activeSection = section;
        }
    });

    if (activeSection) {
        const header = activeSection.querySelector('.section-sticky-header');
        const headerRect = header.getBoundingClientRect();

        if (headerRect.top < 0) {
            showFixedHeaderPref(header, activeSection);
        } else {
            hideFixedHeaderPref();
        }
    } else {
        hideFixedHeaderPref();
    }
}

function showFixedHeaderPref(originalHeader, section) {
    if (stickyHeaderClonePref && currentStickyHeaderPref === originalHeader) {
        return;
    }

    hideFixedHeaderPref();

    const originalTable = section.querySelector('.creditos-pref-section-table');
    const originalThead = originalTable ? originalTable.querySelector('thead') : null;
    const tableContainer = section.querySelector('.section-table-container');

    stickyHeaderClonePref = document.createElement('div');
    stickyHeaderClonePref.classList.add('fixed-header-clone-pref');
    stickyHeaderClonePref.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        background: var(--card-bg, #1a1f2e);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        animation: slideDown 0.2s ease;
    `;

    const headerClone = originalHeader.cloneNode(true);
    headerClone.style.cssText = `margin: 0; border-radius: 0;`;
    stickyHeaderClonePref.appendChild(headerClone);

    if (originalThead && originalTable) {
        const originalThs = originalTable.querySelectorAll('thead th');
        const columnWidths = Array.from(originalThs).map(th => th.offsetWidth);

        const tableClone = document.createElement('table');
        tableClone.className = 'creditos-pref-section-table sticky-table-header';
        tableClone.style.cssText = `
            width: ${originalTable.offsetWidth}px;
            margin: 0 auto;
            border-collapse: collapse;
            table-layout: fixed;
        `;

        const colgroup = document.createElement('colgroup');
        columnWidths.forEach(width => {
            const col = document.createElement('col');
            col.style.width = `${width}px`;
            colgroup.appendChild(col);
        });
        tableClone.appendChild(colgroup);

        const theadClone = originalThead.cloneNode(true);
        tableClone.appendChild(theadClone);

        const tableWrapper = document.createElement('div');
        const originalPadding = tableContainer ? window.getComputedStyle(tableContainer).padding : '0 1rem';
        tableWrapper.style.cssText = `
            padding: ${originalPadding};
            background: var(--card-bg, #1a1f2e);
            overflow: hidden;
        `;
        tableWrapper.appendChild(tableClone);

        stickyHeaderClonePref.appendChild(tableWrapper);
    }

    document.body.appendChild(stickyHeaderClonePref);
    currentStickyHeaderPref = originalHeader;
}

function hideFixedHeaderPref() {
    if (stickyHeaderClonePref) {
        stickyHeaderClonePref.remove();
        stickyHeaderClonePref = null;
        currentStickyHeaderPref = null;
    }
}

function cleanupStickyHeadersPref() {
    hideFixedHeaderPref();
    window.removeEventListener('scroll', handleStickyScrollPref);
}

// ==========================================
// CARGAR DATOS
// ==========================================
async function loadCreditosPreferenciales(forceRefresh = false) {
    try {
        // Mostrar desde caché si existe
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('creditos_preferenciales')) {
            allCreditosPref = window.getCacheData('creditos_preferenciales');
            filteredCreditosPref = [...allCreditosPref];
            updateEstadoCountsPref();
            updateStatsPref();
            applySortingPref();
            renderMainContentPref();

            if (window.isCacheValid && window.isCacheValid('creditos_preferenciales')) {
                return;
            }
        }

        // Actualizar en segundo plano
        const supabase = window.getSupabaseClient();

        const { data: creditosPref, error } = await supabase
            .from('ic_preferencial')
            .select(`
                *,
                ic_socios!idsocio (
                    idsocio,
                    nombre,
                    cedula,
                    whatsapp,
                    domicilio,
                    paisresidencia,
                    estadocivil
                )
            `)
            .order('created_at', { ascending: false });
        
        // Transformar los datos para que socio sea accesible
        if (creditosPref) {
            creditosPref.forEach(credito => {
                if (credito.ic_socios) {
                    credito.socio = credito.ic_socios;
                }
            });
        }

        if (error) throw error;

        allCreditosPref = creditosPref || [];
        filteredCreditosPref = [...allCreditosPref];

        if (window.setCacheData) {
            window.setCacheData('creditos_preferenciales', allCreditosPref);
        }

        updateEstadoCountsPref();
        updateStatsPref();
        applySortingPref();
        renderMainContentPref();

    } catch (error) {
        console.error('Error loading creditos preferenciales:', error);
        if (!window.hasCacheData || !window.hasCacheData('creditos_preferenciales')) {
            showErrorMessage('Error al cargar créditos preferenciales');
        }
    }
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateStatsPref() {
    const pendientes = allCreditosPref.filter(c => c.estado === 'PENDIENTE');
    const desembolsados = allCreditosPref.filter(c => c.estado === 'DESEMBOLSADO');

    const montoTotal = allCreditosPref.reduce((sum, c) => {
        const monto = parseMontoPref(c.montofinal || c.monto || 0);
        return sum + monto;
    }, 0);

    document.getElementById('stat-pref-total').textContent = allCreditosPref.length;
    document.getElementById('stat-pref-pendientes').textContent = pendientes.length;
    document.getElementById('stat-pref-desembolsados').textContent = desembolsados.length;
    document.getElementById('stat-pref-monto').textContent = formatMoneyPref(montoTotal);
}

// ==========================================
// ACTUALIZAR CONTADORES
// ==========================================
function updateEstadoCountsPref() {
    const counts = {
        all: allCreditosPref.length,
        pendiente: allCreditosPref.filter(c => c.estado === 'PENDIENTE').length,
        aprobado: allCreditosPref.filter(c => c.estado === 'APROBADO').length,
        desembolsado: allCreditosPref.filter(c => c.estado === 'DESEMBOLSADO').length,
        rechazado: allCreditosPref.filter(c => c.estado === 'RECHAZADO').length
    };

    document.getElementById('count-pref-all').textContent = counts.all;
    document.getElementById('count-pref-pendiente').textContent = counts.pendiente;
    document.getElementById('count-pref-aprobado').textContent = counts.aprobado;
    document.getElementById('count-pref-desembolsado').textContent = counts.desembolsado;
    document.getElementById('count-pref-rechazado').textContent = counts.rechazado;
}

// ==========================================
// FILTRAR CRÉDITOS PREFERENCIALES
// ==========================================
function filterCreditosPref() {
    const searchTerm = document.getElementById('search-creditos-pref')?.value?.toLowerCase() || '';

    filteredCreditosPref = allCreditosPref.filter(credito => {
        // Solo aplicar filtro de estado si estamos en vista tabla
        if (currentViewPref === 'table' && currentEstadoFilterPref && credito.estado !== currentEstadoFilterPref) {
            return false;
        }

        if (searchTerm) {
            const codigo = (credito.idcredito || '').toLowerCase();
            const idsocio = (credito.idsocio || '').toLowerCase();
            const beneficiario = (credito.nombrebeneficiario || '').toLowerCase();
            const nombreSocio = (credito.socio?.nombre || '').toLowerCase();
            const cedula = (credito.socio?.cedula || '').toLowerCase();

            if (!codigo.includes(searchTerm) &&
                !idsocio.includes(searchTerm) &&
                !beneficiario.includes(searchTerm) &&
                !nombreSocio.includes(searchTerm) &&
                !cedula.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    applySortingPref();
    renderMainContentPref();
}

// Aplicar ordenamiento
function applySortingPref() {
    const estadoPriority = {
        'PENDIENTE': 1,
        'APROBADO': 2,
        'DESEMBOLSADO': 3,
        'RECHAZADO': 4
    };

    filteredCreditosPref.sort((a, b) => {
        if (estadoSortEnabledPref) {
            const aEstadoPrio = estadoPriority[a.estado] || 99;
            const bEstadoPrio = estadoPriority[b.estado] || 99;
            if (aEstadoPrio !== bEstadoPrio) {
                return aEstadoPrio - bEstadoPrio;
            }
        }

        let compare = 0;

        switch (currentSortPref.field) {
            case 'monto':
                const aMonto = parseMontoPref(a.montofinal || a.monto || 0);
                const bMonto = parseMontoPref(b.montofinal || b.monto || 0);
                compare = bMonto - aMonto;
                break;
            case 'fecha':
                compare = parseDatePref(a.fechasolicitud) - parseDatePref(b.fechasolicitud);
                break;
        }

        if (currentSortPref.direction === 'asc') {
            compare = -compare;
        }

        return compare;
    });
}

// Cambiar ordenamiento
function sortCreditosPref(field) {
    if (currentSortPref.field === field) {
        currentSortPref.direction = currentSortPref.direction === 'desc' ? 'asc' : 'desc';
    } else {
        currentSortPref.field = field;
        currentSortPref.direction = 'desc';
    }

    document.querySelectorAll('.sort-btn').forEach(btn => {
        const isActive = btn.dataset.sort === field;
        btn.classList.toggle('active', isActive);
        const icon = btn.querySelector('.sort-icon');
        if (icon && isActive) {
            icon.className = `fas fa-sort-${currentSortPref.direction === 'desc' ? 'down' : 'up'} sort-icon`;
        }
    });

    filterCreditosPref();
}

// Toggle ordenamiento por estado
function toggleEstadoFilterPref() {
    const btn = document.getElementById('btn-estado-filter-pref');
    estadoSortEnabledPref = !estadoSortEnabledPref;
    btn?.classList.toggle('active', estadoSortEnabledPref);
    filterCreditosPref();
}

// Refrescar caché
async function refreshCreditosPreferencialesCache() {
    const btn = document.querySelector('.btn-sync');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        await loadCreditosPreferenciales(true);
        showToast('Créditos preferenciales actualizados', 'success');
    } catch (error) {
        console.error('Error sincronizando:', error);
        showToast('Error al sincronizar', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        }
    }
}

// ==========================================
// RENDERIZADO PRINCIPAL
// ==========================================
function renderMainContentPref() {
    const view = currentViewPref;
    
    // Tanto tabla como galería usan filteredCreditosPref para soportar la búsqueda
    if (view === 'gallery') {
        renderCreditosPrefGallery(filteredCreditosPref);
    } else {
        renderCreditosPrefTable(filteredCreditosPref);
    }
}

function renderCreditosPrefGallery(creditos) {
    const container = document.getElementById('creditos-pref-gallery-container');
    const emptyDiv = document.getElementById('creditos-pref-empty');

    if (!creditos || creditos.length === 0) {
        container.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    // Agrupar por socio
    const groupMap = new Map();
    
    creditos.forEach(c => {
        const idSocio = c.idsocio;
        if (!groupMap.has(idSocio)) {
            groupMap.set(idSocio, {
                socio: c.socio || { nombre: c.idsocio, cedula: '' },
                totalDeuda: 0,
                count: 0,
                sumPercent: 0
            });
        }
        
        const group = groupMap.get(idSocio);
        const monto = parseMontoPref(c.montofinal || c.monto || 0);
        
        // Limpiar porcentaje para promedio
        let pStr = c.porcentaje ? c.porcentaje.toString().replace('%', '').replace(',', '.').trim() : "0";
        let pNum = parseFloat(pStr) || 0;

        group.totalDeuda += monto;
        group.count += 1;
        group.sumPercent += pNum;
    });

    const socioGroups = Array.from(groupMap.values());
    
    // Ordenar por total de deuda (opcional, pero se ve mejor)
    socioGroups.sort((a, b) => b.totalDeuda - a.totalDeuda);

    container.innerHTML = socioGroups.map(group => {
        const avgPercent = (group.sumPercent / group.count).toFixed(2).replace('.', ',') + '%';
        
        // Formatear cédula como número de tarjeta (grupos de 4)
        const rawCedula = group.socio.cedula || '0000000000';
        const formattedCedula = rawCedula.padEnd(12, '0').match(/.{1,4}/g).join(' ');

        return `
            <div class="socio-card-pref" onclick="filterBySocioAndSwitchToTable('${group.socio.idsocio}')">
                <div class="card-pref-header">
                    <span class="card-brand">INKA CORP</span>
                    <div class="card-chip"></div>
                </div>

                <div class="card-mid-section">
                    <div class="card-amount-label">Deuda Total</div>
                    <div class="card-amount-value">${formatMoneyPref(group.totalDeuda)}</div>
                </div>

                <div class="card-bottom-section">
                    <div class="card-holder-info">
                        <div class="card-number-display">${formattedCedula}</div>
                        <div class="card-holder-name">${group.socio.nombre}</div>
                    </div>
                    
                    <div class="card-extra-stats">
                        <div class="card-stat-small">
                            <span class="card-stat-small-label">Créditos</span>
                            <span class="card-stat-small-value">${group.count}</span>
                        </div>
                        <div class="card-stat-small">
                            <span class="card-stat-small-label">Promedio</span>
                            <span class="card-stat-small-value percent">${avgPercent}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterBySocioAndSwitchToTable(idSocio) {
    // Si estamos en galería, pasamos a tabla filtrando por el socio seleccionado
    const searchInput = document.getElementById('search-creditos-pref');
    if (searchInput) {
        // Encontramos el socio para poner su nombre en el buscador
        const credit = allCreditosPref.find(c => c.idsocio === idSocio);
        const searchVal = credit?.socio?.nombre || idSocio;
        searchInput.value = searchVal;
        
        // Cambiar a vista tabla
        switchViewPref('table');
        
        // El switchViewPref ya llama a filterCreditosPref(), que usará el searchInput.value
    }
}

// ==========================================
// RENDERIZAR TABLA POR SECCIONES
// ==========================================

const ESTADO_CONFIG_PREF = {
    'PENDIENTE': { icon: 'fa-clock', color: '#F59E0B', label: 'Créditos Pendientes', bgColor: 'rgba(245, 158, 11, 0.15)' },
    'APROBADO': { icon: 'fa-check-circle', color: '#10B981', label: 'Créditos Aprobados', bgColor: 'rgba(16, 185, 129, 0.15)' },
    'DESEMBOLSADO': { icon: 'fa-money-bill-wave', color: '#3B82F6', label: 'Créditos Desembolsados', bgColor: 'rgba(59, 130, 246, 0.15)' },
    'RECHAZADO': { icon: 'fa-times-circle', color: '#EF4444', label: 'Créditos Rechazados', bgColor: 'rgba(239, 68, 68, 0.15)' }
};

const ESTADO_ORDER_PREF = ['PENDIENTE', 'APROBADO', 'DESEMBOLSADO', 'RECHAZADO'];

function renderCreditosPrefTable(creditos) {
    const container = document.getElementById('creditos-pref-sections-container');
    const emptyDiv = document.getElementById('creditos-pref-empty');

    if (!creditos || creditos.length === 0) {
        container.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    // Agrupar por estado
    const groupedByEstado = {};
    creditos.forEach(credito => {
        const estado = credito.estado || 'PENDIENTE';
        if (!groupedByEstado[estado]) {
            groupedByEstado[estado] = [];
        }
        groupedByEstado[estado].push(credito);
    });

    // Si hay filtro activo
    if (currentEstadoFilterPref) {
        const singleEstado = currentEstadoFilterPref;
        const singleCreditos = groupedByEstado[singleEstado] || [];

        if (singleCreditos.length === 0) {
            container.innerHTML = '';
            emptyDiv?.classList.remove('hidden');
            return;
        }

        container.innerHTML = renderEstadoSectionPref(singleEstado, singleCreditos, true);
        return;
    }

    // Renderizar todas las secciones
    let html = '';
    ESTADO_ORDER_PREF.forEach(estado => {
        if (groupedByEstado[estado] && groupedByEstado[estado].length > 0) {
            html += renderEstadoSectionPref(estado, groupedByEstado[estado], false);
        }
    });

    Object.keys(groupedByEstado).forEach(estado => {
        if (!ESTADO_ORDER_PREF.includes(estado) && groupedByEstado[estado].length > 0) {
            html += renderEstadoSectionPref(estado, groupedByEstado[estado], false);
        }
    });

    container.innerHTML = html;
}

function renderEstadoSectionPref(estado, creditos, isSingleSection) {
    const config = ESTADO_CONFIG_PREF[estado] || {
        icon: 'fa-folder',
        color: '#9CA3AF',
        label: estado,
        bgColor: 'rgba(156, 163, 175, 0.15)'
    };

    return `
        <div class="creditos-pref-section" data-estado="${estado}">
            <div class="section-sticky-header" style="--section-color: ${config.color}; --section-bg: ${config.bgColor};">
                <div class="section-header-content">
                    <i class="fas ${config.icon}" style="color: ${config.color};"></i>
                    <span class="section-title">${config.label}</span>
                    <span class="section-count" style="background: ${config.bgColor}; color: ${config.color};">${creditos.length}</span>
                </div>
            </div>
            <div class="section-table-container">
                <table class="creditos-pref-section-table">
                    <thead>
                        <tr>
                            <th>Fecha Solicitud</th>
                            <th>Socio</th>
                            <th>Motivo</th>
                            <th>Tipo</th>
                            <th class="text-right">Monto</th>
                            <th class="text-right">Porcentaje</th>
                            <th class="text-center">Fecha</th>
                            <th class="text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${creditos.map(credito => renderCreditoPrefRow(credito)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderCreditoPrefRow(credito) {
    const monto = parseMontoPref(credito.montofinal || credito.monto || 0);
    const dateObj = parseDatePref(credito.fechasolicitud);
    const fecha = dateObj ? dateObj.toLocaleDateString('es-EC', { month: 'short', day: 'numeric' }) : '-';
    const anio = dateObj ? `<br><small style="color: var(--gray-500); font-size: 0.85em; opacity: 0.8;">${dateObj.getFullYear()}</small>` : '';
    
    // Parsear fecha y hora desde el código (XXDDMMYYYYHHMMSS)
    const code = credito.idcredito || '';
    let fechaCodeStr = '-';
    let horaCodeStr = '';
    if (code.length >= 16) {
        const day = code.substring(2, 4);
        const monthNum = parseInt(code.substring(4, 6), 10);
        const year = code.substring(6, 10);
        const hour = code.substring(10, 12);
        const minute = code.substring(12, 14);
        
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
        const mesNombre = meses[monthNum - 1] || code.substring(4, 6);
        
        fechaCodeStr = `${day} ${mesNombre} ${year}`;
        horaCodeStr = `<br><small style="color: var(--gray-500); font-size: 0.8rem;">${hour}:${minute}</small>`;
    }

    const nombreSocio = credito.socio?.nombre || credito.idsocio || '-';
    const cedulaSocio = credito.socio?.cedula ? `<br><small style="color: var(--text-secondary); font-size: 0.85em;">${credito.socio.cedula}</small>` : '';
    const porcentaje = formatPorcentajePref(credito.porcentaje);
    const motivo = (credito.motivo || '-');

    // Manejo de capsulas por tipo
    const tipoRaw = (credito.tipo || '').toUpperCase();
    let tipoClass = 'type-default';
    if (tipoRaw.includes('PREFERENCIAL')) tipoClass = 'type-preferencial';
    else if (tipoRaw.includes('ESTUDIANTIL')) tipoClass = 'type-estudiantil';
    else if (tipoRaw.includes('SALUD')) tipoClass = 'type-salud';
    
    const tipoBadge = `<span class="type-badge ${tipoClass}">${credito.tipo || '-'}</span>`;
    
    // Clase especial para filas rechazadas
    const isRechazado = credito.estado === 'RECHAZADO';
    const rowClass = isRechazado ? 'row-rechazado' : '';

    return `
        <tr class="credito-row ${rowClass}" onclick="viewCreditoPref('${credito.idcredito}')">
            <td>
                <div style="line-height: 1.2;">
                    <span style="font-weight: 600; font-size: 0.85rem;">${fechaCodeStr}</span>
                    ${horaCodeStr}
                </div>
            </td>
            <td>${nombreSocio}${cedulaSocio}</td>
            <td style="max-width: 180px; white-space: normal; line-height: 1.2; font-size: 0.85rem;">
                <div style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${motivo}
                </div>
            </td>
            <td>${tipoBadge}</td>
            <td class="text-right ${isRechazado ? 'status-rechazado-text' : ''}">${formatMoneyPref(monto)}</td>
            <td class="text-right ${isRechazado ? 'status-rechazado-text' : ''}">${porcentaje}</td>
            <td class="text-center">${fecha}${anio}</td>
            <td class="text-center">
                <button class="btn-icon btn-ver-credito" onclick="event.stopPropagation(); viewCreditoPref('${credito.idcredito}')" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `;
}

// Filtrar por estado
function filterCreditosPrefByEstado(estado) {
    currentEstadoFilterPref = estado;

    document.querySelectorAll('.estado-counter').forEach(counter => {
        counter.classList.toggle('active', counter.dataset.estado === estado);
    });

    filterCreditosPref();
}

// ==========================================
// VER DETALLE
// ==========================================
function viewCreditoPref(idcredito) {
    const credito = allCreditosPref.find(c => c.idcredito === idcredito);
    if (!credito) {
        showToast('Crédito preferencial no encontrado', 'error');
        return;
    }

    currentViewingCreditoPref = credito;

    // Llenar modal
    const estado = (credito.estado || 'PENDIENTE').toUpperCase();
    const tipo = (credito.tipo || 'CRÉDITO').toUpperCase();
    document.getElementById('modal-codigo-credito-pref').textContent = `${estado} - ${tipo}`;
    
    // Información del socio
    const socioInfo = credito.socio ? 
        `${credito.socio.nombre} (${credito.socio.cedula || credito.idsocio})` : 
        credito.idsocio || '-';
    document.getElementById('det-pref-idsocio').textContent = socioInfo;
    
    // WhatsApp del socio si está disponible
    const whatsappSocio = credito.socio?.whatsapp;
    if (whatsappSocio) {
        const socioIdElement = document.getElementById('det-pref-idsocio');
        socioIdElement.innerHTML = `${socioInfo}<br><small style="color: var(--text-secondary);"><i class="fab fa-whatsapp"></i> ${whatsappSocio}</small>`;
    }
    
    // Otros datos del socio
    document.getElementById('det-pref-domicilio').textContent = credito.socio?.domicilio || '-';
    document.getElementById('det-pref-pais').textContent = credito.socio?.paisresidencia || '-';
    document.getElementById('det-pref-estadocivil').textContent = credito.socio?.estadocivil || '-';
    
    // Información del beneficiario
    document.getElementById('det-pref-beneficiario').textContent = credito.nombrebeneficiario || '-';
    document.getElementById('det-pref-whatsapp').textContent = credito.whatsappbeneficiario || '-';

    document.getElementById('det-pref-tipo').textContent = credito.tipo || '-';
    document.getElementById('det-pref-porcentaje').textContent = formatPorcentajePref(credito.porcentaje);
    document.getElementById('det-pref-monto').textContent = formatMoneyPref(parseMontoPref(credito.monto));
    document.getElementById('det-pref-montofinal').textContent = formatMoneyPref(parseMontoPref(credito.montofinal));

    document.getElementById('det-pref-fecha-solicitud').textContent = formatDatePref(credito.fechasolicitud);
    document.getElementById('det-pref-fecha-aprobacion').textContent = formatDatePref(credito.fechaaprobacion);
    document.getElementById('det-pref-estado').textContent = credito.estado || '-';

    document.getElementById('det-pref-motivo').textContent = credito.motivo || '-';
    document.getElementById('det-pref-motivorespuesta').textContent = credito.motivorespuesta || '-';
    document.getElementById('det-pref-motivorecargo').textContent = credito.motivorecargo || '-';

    // Fotografía
    const fotoSection = document.getElementById('pref-fotografia-section');
    const fotoImg = document.getElementById('det-pref-fotografia');
    if (credito.fotografia) {
        fotoSection.style.display = 'block';
        fotoImg.src = credito.fotografia;
    } else {
        fotoSection.style.display = 'none';
    }

    openCreditosPrefModal('ver-credito-pref-modal');
}

// ==========================================
// UTILIDADES
// ==========================================
function parseMontoPref(monto) {
    if (monto === undefined || monto === null || monto === '') return 0;
    if (typeof monto === 'number') return monto;

    // Si viene con coma como decimal y sin separador de miles
    // O si viene con punto como decimal y sin separador de miles
    // Normalizamos: reemplazamos coma por punto para parseFloat
    let cleaned = monto.toString().replace(',', '.');
    return parseFloat(cleaned) || 0;
}

function formatMoneyPref(amount) {
    const num = Number(amount || 0);
    // Formato con separador de miles (.) y decimales (,) para Ecuador
    return '$' + num.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPorcentajePref(porcentaje) {
    if (!porcentaje) return '-';
    
    // Limpiar el string de % y espacios, y normalizar coma a punto para procesar numéricamente
    let cleaned = porcentaje.toString().replace('%', '').replace(',', '.').trim();
    let num = parseFloat(cleaned);
    
    if (isNaN(num)) return porcentaje; // Si no es un número válido, mostrar original
    
    // Formatear a 2 decimales usando coma como separador
    return num.toFixed(2).replace('.', ',') + '%';
}

function formatDatePref(dateStr) {
    if (!dateStr) return '-';
    // Si la fecha ya viene en DD/MM/YYYY o similar que no sea ISO
    const date = parseDatePref(dateStr);
    return date ? date.toLocaleDateString('es-EC') : '-';
}

function formatDateShortPref(dateStr) {
    if (!dateStr) return '-';
    const date = parseDatePref(dateStr);
    return date ? date.toLocaleDateString('es-EC', { month: 'short', day: 'numeric' }) : '-';
}

function parseDatePref(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;

    // Manejar formato DD/MM/YYYY
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            // Asumimos DD/MM/YYYY -> Date(YYYY, MM-1, DD)
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
    }

    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

function showErrorMessage(message) {
    console.error(message);
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

// Inicializar al cargar
if (typeof window !== 'undefined') {
    window.initCreditosPreferencialesModule = initCreditosPreferencialesModule;
}
