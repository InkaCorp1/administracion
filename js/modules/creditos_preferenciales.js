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
    window.archiveCreditoPref = archiveCreditoPref;
    window.archiveCreditoPrefFromModal = archiveCreditoPrefFromModal;
    window.toggleArchivedPrefSection = toggleArchivedPrefSection;
    window.openPreferentialCreditPaymentModal = openPreferentialCreditPaymentModal;
    window.openPreferentialCreditPaymentModalFromDetail = openPreferentialCreditPaymentModalFromDetail;
    window.cleanupStickyHeadersPref = cleanupStickyHeadersPref;
    window.switchViewPref = switchViewPref;
    window.filterBySocioAndSwitchToTable = filterBySocioAndSwitchToTable;
    window.openEstadoCuentaSocioModal = openEstadoCuentaSocioModal; // Cambiado por botón global
    window.activarInteresCredito = activarInteresCredito; // Para configurar reglas
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

        await enrichPreferentialCreditsFinancials(supabase, creditosPref || []);

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
async function enrichPreferentialCreditsFinancials(supabase, creditos) {
    const idsCreditos = (creditos || []).map(c => c.idcredito).filter(Boolean);
    if (!idsCreditos.length) return;

    let pagosPorCredito = new Map();
    try {
        const { data: pagos, error } = await supabase
            .from('ic_preferencial_pagos')
            .select('*')
            .in('id_credito', idsCreditos)
            .order('fecha_pago', { ascending: true });

        if (error) throw error;

        pagosPorCredito = (pagos || []).reduce((map, pago) => {
            const key = pago.id_credito;
            if (!key) return map;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(pago);
            return map;
        }, new Map());
    } catch (error) {
        console.warn('No se pudieron cargar pagos por crédito preferencial. Revisa que id_credito sea tipo text y referencie ic_preferencial.idcredito:', error);
    }

    creditos.forEach(credito => {
        credito.pagos = pagosPorCredito.get(credito.idcredito) || [];
        credito.balance = calculatePreferentialCreditBalance(credito, credito.pagos);
    });
}

function getActiveCreditosPref() {
    return allCreditosPref.filter(c => c.estado !== 'ARCHIVADO');
}

function updateStatsPref() {
    const activeCreditos = getActiveCreditosPref();
    const pendientes = activeCreditos.filter(c => c.estado === 'PENDIENTE');
    const desembolsados = activeCreditos.filter(c => c.estado === 'DESEMBOLSADO');

    const montoTotal = activeCreditos.reduce((sum, c) => {
        const monto = parseMontoPref(c.montofinal || c.monto || 0);
        return sum + monto;
    }, 0);

    document.getElementById('stat-pref-total').textContent = activeCreditos.length;
    document.getElementById('stat-pref-pendientes').textContent = pendientes.length;
    document.getElementById('stat-pref-desembolsados').textContent = desembolsados.length;
    document.getElementById('stat-pref-monto').textContent = formatMoneyPref(montoTotal);
}

// ==========================================
// ACTUALIZAR CONTADORES
// ==========================================
function updateEstadoCountsPref() {
    const activeCreditos = getActiveCreditosPref();
    const counts = {
        all: activeCreditos.length,
        pendiente: activeCreditos.filter(c => c.estado === 'PENDIENTE').length,
        aprobado: activeCreditos.filter(c => c.estado === 'APROBADO').length,
        desembolsado: activeCreditos.filter(c => c.estado === 'DESEMBOLSADO').length,
        pagado: activeCreditos.filter(c => c.estado === 'PAGADO').length,
        rechazado: activeCreditos.filter(c => c.estado === 'RECHAZADO').length,
        archivado: allCreditosPref.filter(c => c.estado === 'ARCHIVADO').length
    };

    document.getElementById('count-pref-all').textContent = counts.all;
    document.getElementById('count-pref-pendiente').textContent = counts.pendiente;
    document.getElementById('count-pref-aprobado').textContent = counts.aprobado;
    document.getElementById('count-pref-desembolsado').textContent = counts.desembolsado;
    document.getElementById('count-pref-pagado').textContent = counts.pagado;
    document.getElementById('count-pref-rechazado').textContent = counts.rechazado;
    document.getElementById('count-pref-archivado').textContent = counts.archivado;
}

// ==========================================
// FILTRAR CRÉDITOS PREFERENCIALES
// ==========================================
function filterCreditosPref() {
    const searchTerm = document.getElementById('search-creditos-pref')?.value?.toLowerCase() || '';

    filteredCreditosPref = allCreditosPref.filter(credito => {
        const estadoCredito = credito.estado || 'PENDIENTE';
        const isArchived = estadoCredito === 'ARCHIVADO';

        if (isArchived && !(currentViewPref === 'table' && currentEstadoFilterPref === 'ARCHIVADO')) {
            return false;
        }

        // Solo aplicar filtro de estado si estamos en vista tabla
        if (currentViewPref === 'table' && currentEstadoFilterPref && estadoCredito !== currentEstadoFilterPref) {
            return false;
        }

        if (searchTerm && !matchesCreditoPrefSearch(credito, searchTerm)) {
            return false;
        }

        return true;
    });

    applySortingPref();
    renderMainContentPref();
}

function matchesCreditoPrefSearch(credito, searchTerm) {
    const codigo = (credito.idcredito || '').toLowerCase();
    const idsocio = (credito.idsocio || '').toLowerCase();
    const beneficiario = (credito.nombrebeneficiario || '').toLowerCase();
    const nombreSocio = (credito.socio?.nombre || '').toLowerCase();
    const cedula = (credito.socio?.cedula || '').toLowerCase();

    return codigo.includes(searchTerm) ||
        idsocio.includes(searchTerm) ||
        beneficiario.includes(searchTerm) ||
        nombreSocio.includes(searchTerm) ||
        cedula.includes(searchTerm);
}

function getVisibleArchivedCreditosPref() {
    const searchTerm = document.getElementById('search-creditos-pref')?.value?.toLowerCase() || '';
    return allCreditosPref.filter(credito =>
        credito.estado === 'ARCHIVADO' &&
        (!searchTerm || matchesCreditoPrefSearch(credito, searchTerm))
    );
}

// Aplicar ordenamiento
function applySortingPref() {
    const estadoPriority = {
        'PENDIENTE': 1,
        'APROBADO': 2,
        'DESEMBOLSADO': 3,
        'PAGADO': 4,
        'RECHAZADO': 5,
        'ARCHIVADO': 99
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
        const archivados = !currentEstadoFilterPref ? getVisibleArchivedCreditosPref() : [];
        if (archivados.length > 0) {
            container.innerHTML = renderArchivedPrefCollapsedSection(archivados);
            emptyDiv?.classList.add('hidden');
            return;
        }

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
        const monto = c.balance?.saldo ?? parseMontoPref(c.montofinal || c.monto || 0);
        
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
    'PAGADO': { icon: 'fa-check-double', color: '#22C55E', label: 'Créditos Pagados', bgColor: 'rgba(34, 197, 94, 0.15)' },
    'RECHAZADO': { icon: 'fa-times-circle', color: '#EF4444', label: 'Créditos Rechazados', bgColor: 'rgba(239, 68, 68, 0.15)' },
    'ARCHIVADO': { icon: 'fa-archive', color: '#94A3B8', label: 'Archivados', bgColor: 'rgba(148, 163, 184, 0.14)' }
};

const ESTADO_ORDER_PREF = ['PENDIENTE', 'APROBADO', 'DESEMBOLSADO', 'PAGADO', 'RECHAZADO'];

function renderCreditosPrefTable(creditos) {
    const container = document.getElementById('creditos-pref-sections-container');
    const emptyDiv = document.getElementById('creditos-pref-empty');

    if (!creditos || creditos.length === 0) {
        container.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    // Agrupar por estado. Archivados se mantienen al final y no entran en el flujo normal.
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
        if (!ESTADO_ORDER_PREF.includes(estado) && estado !== 'ARCHIVADO' && groupedByEstado[estado].length > 0) {
            html += renderEstadoSectionPref(estado, groupedByEstado[estado], false);
        }
    });

    if (currentEstadoFilterPref === 'ARCHIVADO' && groupedByEstado.ARCHIVADO?.length) {
        html += renderEstadoSectionPref('ARCHIVADO', groupedByEstado.ARCHIVADO, true);
    } else {
        const archivados = getVisibleArchivedCreditosPref();
        if (archivados.length > 0) {
            html += renderArchivedPrefCollapsedSection(archivados);
        }
    }

    container.innerHTML = html;
}

function renderArchivedPrefCollapsedSection(creditos) {
    const config = ESTADO_CONFIG_PREF.ARCHIVADO;
    return `
        <div class="creditos-pref-section archived-pref-section collapsed" data-estado="ARCHIVADO">
            <button type="button" class="section-sticky-header archived-pref-toggle" style="--section-color: ${config.color}; --section-bg: ${config.bgColor};" onclick="toggleArchivedPrefSection()">
                <div class="section-header-content">
                    <i class="fas ${config.icon}" style="color: ${config.color};"></i>
                    <span class="section-title">${config.label}</span>
                    <span class="section-count" style="background: ${config.bgColor}; color: ${config.color};">${creditos.length}</span>
                </div>
                <div class="archived-pref-hint">
                    <span>Contraído</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
            </button>
            <div class="section-table-container archived-pref-body hidden">
                <table class="creditos-pref-section-table">
                    <thead>
                        <tr>
                            <th>Fecha Aprobación</th>
                            <th>Socio</th>
                            <th>Motivo</th>
                            <th>Tipo</th>
                            <th class="text-right">Monto</th>
                            <th class="text-right">Saldo a Hoy</th>
                            <th class="text-right">Interés</th>
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

function toggleArchivedPrefSection() {
    const section = document.querySelector('.archived-pref-section');
    if (!section) return;

    const body = section.querySelector('.archived-pref-body');
    const hint = section.querySelector('.archived-pref-hint span');
    const icon = section.querySelector('.archived-pref-hint i');
    const isCollapsed = section.classList.toggle('collapsed');

    body?.classList.toggle('hidden', isCollapsed);
    if (hint) hint.textContent = isCollapsed ? 'Contraído' : 'Expandido';
    if (icon) icon.className = `fas fa-chevron-${isCollapsed ? 'down' : 'up'}`;
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
                            <th>Fecha Aprobación</th>
                            <th>Socio</th>
                            <th>Motivo</th>
                            <th>Tipo</th>
                            <th class="text-right">Monto</th>
                            <th class="text-right">Saldo a Hoy</th>
                            <th class="text-right">Interés</th>
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
    const dateObj = parseDatePref(credito.fechaaprobacion || credito.fechasolicitud);
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
    const isArchivado = credito.estado === 'ARCHIVADO';
    const isPendiente = credito.estado === 'PENDIENTE';
    const canRegisterPayment = ['DESEMBOLSADO', 'ABONADO'].includes(credito.estado);
    const saldoCredito = credito.balance?.saldo ?? monto;
    const rowClass = isRechazado ? 'row-rechazado' : (isArchivado ? 'row-archivado' : '');

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
            <td class="text-right ${saldoCredito <= 0.01 ? 'status-pagado-text' : ''}">${formatMoneyPref(Math.max(0, saldoCredito))}</td>
            <td class="text-right ${isRechazado ? 'status-rechazado-text' : ''}">${porcentaje}</td>
            <td class="text-center">
                <div style="display: flex; gap: 5px; justify-content: center;">
                    <button class="btn-icon btn-ver-credito" onclick="event.stopPropagation(); viewCreditoPref('${credito.idcredito}')" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${isPendiente ? `
                    <button class="btn-icon btn-archivar-pref" style="color: #94A3B8;" onclick="event.stopPropagation(); archiveCreditoPref('${credito.idcredito}')" title="Archivar pendiente">
                        <i class="fas fa-archive"></i>
                    </button>
                    ` : ''}
                    ${canRegisterPayment ? `
                    <button class="btn-icon btn-pagar-pref" style="color: #10B981;" onclick="event.stopPropagation(); openPreferentialCreditPaymentModal('${credito.idcredito}')" title="Registrar pago">
                        <i class="fas fa-cash-register"></i>
                    </button>
                    ` : ''}
                </div>
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
    renderPreferentialPaymentsTable(credito);

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

    const archiveButton = document.getElementById('btn-archivar-credito-pref');
    if (archiveButton) {
        archiveButton.classList.toggle('hidden', estado !== 'PENDIENTE');
    }

    const payButton = document.getElementById('btn-pagar-credito-pref');
    if (payButton) {
        payButton.classList.toggle('hidden', !['DESEMBOLSADO', 'ABONADO'].includes(estado));
    }

    openCreditosPrefModal('ver-credito-pref-modal');
}

function renderPreferentialPaymentsTable(credito) {
    const container = document.getElementById('det-pref-pagos-table');
    if (!container) return;

    const pagos = credito.pagos || [];
    if (!pagos.length) {
        container.innerHTML = '<div style="color: var(--gray-400); padding: 0.75rem; border: 1px dashed var(--border-color); border-radius: 0.5rem;">Sin pagos registrados</div>';
        return;
    }

    container.innerHTML = `
        <div style="overflow-x: auto;">
            <table class="creditos-pref-section-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th class="text-right">Monto</th>
                        <th>Notas</th>
                        <th class="text-center">Comprobante</th>
                    </tr>
                </thead>
                <tbody>
                    ${pagos.map(pago => `
                        <tr>
                            <td>${formatDatePref(pago.fecha_pago)}</td>
                            <td class="text-right">${formatMoneyPref(pago.monto_abonado)}</td>
                            <td style="white-space: normal;">${escapePrefHtml(pago.notas || pago.notas_admin || '-')}</td>
                            <td class="text-center">
                                ${pago.comprobante_url ? `<button class="btn-icon" onclick="window.open('${pago.comprobante_url}', '_blank')" title="Ver comprobante"><i class="fas fa-eye"></i></button>` : '-'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function archiveCreditoPrefFromModal() {
    if (!currentViewingCreditoPref?.idcredito) {
        showToast('No hay crédito preferencial seleccionado', 'error');
        return;
    }

    await archiveCreditoPref(currentViewingCreditoPref.idcredito);
}

async function archiveCreditoPref(idcredito) {
    const credito = allCreditosPref.find(c => c.idcredito === idcredito);
    if (!credito) {
        showToast('Crédito preferencial no encontrado', 'error');
        return;
    }

    if (credito.estado !== 'PENDIENTE') {
        showToast('Solo se pueden archivar créditos preferenciales pendientes', 'warning');
        return;
    }

    const result = await Swal.fire({
        title: '¿Archivar crédito pendiente?',
        text: 'El crédito dejará de contar en estadísticas y se moverá a la pestaña contraída de archivados.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#64748B',
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Sí, archivar'
    });

    if (!result.isConfirmed) return;

    try {
        if (typeof window.showLoader === 'function') window.showLoader('Archivando crédito...');
        const supabase = window.getSupabaseClient();

        const { error } = await supabase
            .from('ic_preferencial')
            .update({
                estado: 'ARCHIVADO'
            })
            .eq('idcredito', idcredito)
            .eq('estado', 'PENDIENTE');

        if (error) throw error;

        credito.estado = 'ARCHIVADO';
        if (currentViewingCreditoPref?.idcredito === idcredito) {
            currentViewingCreditoPref.estado = 'ARCHIVADO';
        }

        if (window.setCacheData) {
            window.setCacheData('creditos_preferenciales', allCreditosPref);
        }

        updateEstadoCountsPref();
        updateStatsPref();
        filterCreditosPref();
        closeCreditosPrefModal('ver-credito-pref-modal');
        showToast('Crédito preferencial archivado', 'success');
    } catch (error) {
        console.error('Error archivando crédito preferencial:', error);
        Swal.fire('Error', 'No se pudo archivar el crédito preferencial: ' + (error.message || error), 'error');
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
}

async function openPreferentialCreditPaymentModalFromDetail() {
    if (!currentViewingCreditoPref?.idcredito) {
        showToast('No hay crédito preferencial seleccionado', 'error');
        return;
    }
    await openPreferentialCreditPaymentModal(currentViewingCreditoPref.idcredito);
}

async function openPreferentialCreditPaymentModal(idcredito) {
    const credito = allCreditosPref.find(c => c.idcredito === idcredito);
    if (!credito) {
        showToast('Crédito preferencial no encontrado', 'error');
        return;
    }

    const balance = calculatePreferentialCreditBalance(credito, credito.pagos || []);
    const hoyISO = new Date().toISOString().split('T')[0];

    const { value: pagoData } = await Swal.fire({
        title: 'Registrar Pago Preferencial',
        width: '560px',
        html: `
            <div style="text-align:left; background:#111827; color:#e5e7eb; padding:1rem; border-radius:0.75rem; border:1px solid #374151;">
                <div style="font-weight:800; color:#fff; margin-bottom:0.35rem;">${escapePrefHtml(credito.socio?.nombre || credito.idsocio || 'Socio')}</div>
                <div style="font-size:0.85rem; color:#9ca3af; margin-bottom:1rem;">Crédito: ${escapePrefHtml(credito.idcredito)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
                    <div style="background:#0f172a; padding:0.75rem; border-radius:0.6rem;">
                        <div style="font-size:0.75rem; color:#9ca3af; text-transform:uppercase;">Capital pendiente</div>
                        <div style="font-size:1.1rem; font-weight:900;">${formatMoneyPref(balance.capitalPendiente)}</div>
                    </div>
                    <div style="background:#0f172a; padding:0.75rem; border-radius:0.6rem;">
                        <div style="font-size:0.75rem; color:#9ca3af; text-transform:uppercase;">Interés pendiente</div>
                        <div style="font-size:1.1rem; font-weight:900; color:#f59e0b;">${formatMoneyPref(balance.interesPendiente)}</div>
                    </div>
                </div>
                <div style="background:#052e1c; border:1px solid #10b981; padding:0.75rem; border-radius:0.6rem; margin-bottom:1rem;">
                    <div style="font-size:0.75rem; color:#bbf7d0; text-transform:uppercase;">Saldo a hoy</div>
                    <div style="font-size:1.35rem; font-weight:900; color:#fff;">${formatMoneyPref(balance.saldo)}</div>
                </div>
                <button type="button" id="btn-pref-pago-total" style="width:100%; margin:0 0 0.75rem 0; padding:0.75rem; border:1px solid #10b981; border-radius:0.6rem; background:#064e3b; color:#ecfdf5; font-weight:900; cursor:pointer;">
                    <i class="fas fa-check-double"></i> Pago Total ${formatMoneyPref(balance.saldo)}
                </button>
                <input id="pref-pago-total-flag" type="hidden" value="0">
                <label style="display:block; font-size:0.8rem; color:#cbd5e1; margin-bottom:0.35rem;">Monto pagado</label>
                <input id="pref-pago-monto" type="number" step="0.01" min="0.01" class="swal2-input" style="margin:0 0 0.75rem 0; width:100%;" placeholder="0.00">
                <label style="display:block; font-size:0.8rem; color:#cbd5e1; margin-bottom:0.35rem;">Fecha de pago</label>
                <input id="pref-pago-fecha" type="date" class="swal2-input" value="${hoyISO}" style="margin:0 0 0.75rem 0; width:100%;">
                <label style="display:block; font-size:0.8rem; color:#cbd5e1; margin-bottom:0.35rem;">Comprobante</label>
                <input id="pref-pago-file" type="file" accept="image/*" class="swal2-file" style="margin:0 0 0.75rem 0; width:100%; color:#fff;">
                <label style="display:block; font-size:0.8rem; color:#cbd5e1; margin-bottom:0.35rem;">Notas</label>
                <textarea id="pref-pago-notas" class="swal2-textarea" style="margin:0; width:100%; min-height:70px;" placeholder="Opcional"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Registrar Pago',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10B981',
        didOpen: () => {
            const btnPagoTotal = document.getElementById('btn-pref-pago-total');
            const montoInput = document.getElementById('pref-pago-monto');
            const flagInput = document.getElementById('pref-pago-total-flag');
            const notasInput = document.getElementById('pref-pago-notas');

            btnPagoTotal?.addEventListener('click', () => {
                montoInput.value = Math.max(0, balance.saldo).toFixed(2);
                flagInput.value = '1';
                if (notasInput && !notasInput.value.trim()) {
                    notasInput.value = 'Pago total del crédito preferencial.';
                }
                btnPagoTotal.style.background = '#10b981';
                btnPagoTotal.style.color = '#052e1c';
            });

            montoInput?.addEventListener('input', () => {
                const montoManual = parseFloat(montoInput.value) || 0;
                flagInput.value = Math.abs(montoManual - balance.saldo) <= 0.01 ? '1' : '0';
                if (btnPagoTotal && flagInput.value === '0') {
                    btnPagoTotal.style.background = '#064e3b';
                    btnPagoTotal.style.color = '#ecfdf5';
                }
            });
        },
        preConfirm: () => {
            const monto = parseFloat(document.getElementById('pref-pago-monto').value);
            const fecha = document.getElementById('pref-pago-fecha').value;
            const file = document.getElementById('pref-pago-file').files[0];
            const notas = document.getElementById('pref-pago-notas').value;
            const pagoTotal = document.getElementById('pref-pago-total-flag').value === '1';

            if (!monto || monto <= 0) {
                Swal.showValidationMessage('Ingrese un monto válido.');
                return false;
            }
            if (!fecha) {
                Swal.showValidationMessage('Ingrese la fecha de pago.');
                return false;
            }
            return { monto, fecha, file, notas, pagoTotal };
        }
    });

    if (!pagoData) return;
    await savePreferentialCreditPayment(credito, pagoData);
}

async function savePreferentialCreditPayment(credito, data) {
    if (typeof window.showLoader === 'function') window.showLoader('Registrando pago...');

    try {
        const supabase = window.getSupabaseClient();
        let comprobanteUrl = null;

        if (data.file) {
            const uploadResult = await uploadPreferentialPaymentReceipt(data.file, credito, data);
            if (!uploadResult.success) throw new Error(uploadResult.error || 'No se pudo subir el comprobante.');
            comprobanteUrl = uploadResult.url;
        }

        const pagoLocal = {
            id_credito: credito.idcredito,
            id_socio: credito.idsocio,
            monto_abonado: parseFloat(data.monto),
            fecha_pago: data.fecha,
            comprobante_url: comprobanteUrl,
            notas: data.notas || null
        };

        const pagosActualizados = [...(credito.pagos || []), pagoLocal];
        let nuevoBalance = calculatePreferentialCreditBalance(credito, pagosActualizados);
        if (data.pagoTotal) {
            nuevoBalance = {
                ...nuevoBalance,
                capitalPendiente: 0,
                interesPendiente: 0,
                saldo: 0
            };
        }

        const { error } = await supabase.from('ic_preferencial_pagos').insert([{
            ...pagoLocal,
            notas_admin: data.notas || (data.pagoTotal ? 'Pago total registrado desde crédito preferencial' : 'Pago registrado desde crédito preferencial'),
            tipo_pago: data.pagoTotal ? 'PAGO_TOTAL' : 'ABONO',
            capital_pendiente_despues: nuevoBalance.capitalPendiente,
            interes_pendiente_despues: nuevoBalance.interesPendiente,
            saldo_pendiente_despues: nuevoBalance.saldo
        }]);

        if (error) throw error;

        const nuevoEstado = data.pagoTotal || nuevoBalance.saldo <= 0.01 ? 'PAGADO' : credito.estado;

        if (nuevoEstado !== credito.estado) {
            const { error: estadoError } = await supabase
                .from('ic_preferencial')
                .update({ estado: nuevoEstado })
                .eq('idcredito', credito.idcredito);
            if (estadoError) throw estadoError;
        }

        if (typeof window.hideLoader === 'function') window.hideLoader();
        Swal.fire('Pago registrado', `Saldo actual: ${formatMoneyPref(Math.max(0, nuevoBalance.saldo))}`, 'success');
        await loadCreditosPreferenciales(true);
    } catch (err) {
        if (typeof window.hideLoader === 'function') window.hideLoader();
        console.error('Error registrando pago preferencial:', err);
        Swal.fire('Error', err.message || 'No se pudo registrar el pago.', 'error');
    }
}

async function uploadPreferentialPaymentReceipt(file, credito, pagoData) {
    try {
        if (!file?.type?.startsWith('image/')) {
            throw new Error('El comprobante debe ser una imagen para comprimirla en WebP.');
        }

        const supabase = window.getSupabaseClient();
        if (!supabase) throw new Error('Cliente Supabase no disponible.');

        const socioNombre = credito.socio?.nombre || credito.idsocio || 'socio';
        const safeSocio = slugPref(socioNombre);
        const safeFecha = slugPref(pagoData.fecha || new Date().toISOString().split('T')[0]);
        const safeValor = slugPref(parseFloat(pagoData.monto || 0).toFixed(2));
        const path = `pagospreferenciales/${safeSocio}_${safeFecha}_${safeValor}_${Date.now()}.webp`;
        const webpBlob = await compressPreferentialReceiptToWebp(file);

        const { error } = await supabase.storage
            .from('inkacorp')
            .upload(path, webpBlob, {
                cacheControl: '3600',
                upsert: false,
                contentType: 'image/webp'
            });

        if (error) throw error;

        const { data: publicData } = supabase.storage.from('inkacorp').getPublicUrl(path);
        if (!publicData?.publicUrl) throw new Error('No se pudo obtener URL pública del comprobante.');

        return { success: true, url: publicData.publicUrl, path };
    } catch (error) {
        console.error('Error subiendo comprobante preferencial:', error);
        return { success: false, error: error.message || 'Error al subir comprobante preferencial.' };
    }
}

function compressPreferentialReceiptToWebp(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const img = new Image();

        reader.onload = (event) => {
            img.onload = () => {
                const maxSize = 1200;
                let { width, height } = img;
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('No se pudo preparar la compresión del comprobante.'));
                    return;
                }

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('No se pudo convertir el comprobante a WebP.'));
                        return;
                    }
                    resolve(blob);
                }, 'image/webp', 0.82);
            };
            img.onerror = () => reject(new Error('No se pudo leer la imagen del comprobante.'));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error('No se pudo leer el comprobante.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Modal de Estado de Cuenta y Abonos Globales por Socio
 */
async function openEstadoCuentaSocioModal() {
    // 1. Obtener lista única de socios con créditos desembolsados
    const sociosConCreditos = [];
    const idsAgregados = new Set();
    
    allCreditosPref.forEach(c => {
        if (c.estado === 'DESEMBOLSADO' && !idsAgregados.has(c.idsocio)) {
            sociosConCreditos.push({
                idsocio: c.idsocio,
                nombre: c.socio?.nombre || c.idsocio
            });
            idsAgregados.add(c.idsocio);
        }
    });

    if (sociosConCreditos.length === 0) {
        Swal.fire('Atención', 'No hay socios con créditos desembolsados para gestionar pagos.', 'info');
        return;
    }

    // 2. Selección de Socio
    const { value: idSocio } = await Swal.fire({
        title: '<i class="fas fa-users-cog"></i> Seleccione Socio',
        input: 'select',
        inputOptions: sociosConCreditos.reduce((acc, s) => ({ ...acc, [s.idsocio]: s.nombre }), {}),
        inputPlaceholder: 'Elija un socio...',
        showCancelButton: true,
        confirmButtonColor: '#10B981',
        cancelButtonText: 'Cancelar'
    });

    if (!idSocio) return;

    // 3. Cargar Datos Completo del Socio (Créditos, Configuración de Intereses, Pagos)
    if (typeof window.showLoader === 'function') window.showLoader('Calculando estado de cuenta...');
    
    try {
        const supabase = window.getSupabaseClient();
        
        // Créditos del socio
        const creditosSocio = allCreditosPref.filter(c => c.idsocio === idSocio && c.estado === 'DESEMBOLSADO');
        const idsCreditosSocio = creditosSocio.map(c => c.idcredito);
        
        // Configuraciones de intereses
        const { data: configs } = await supabase.from('ic_preferencial_config').select('*').in('id_credito', idsCreditosSocio);
        
        // Historial de pagos globales del socio
        const { data: pagos } = await supabase.from('ic_preferencial_pagos').select('*').eq('id_socio', idSocio).order('fecha_pago', { ascending: false });
        
        // 4. Procesar Deuda Viva (Cápital + Intereses Calculados)
        let totalCapital = 0;
        let totalInteresProcesado = 0;
        const hoy = new Date();
        
        const detallesDeuda = creditosSocio.map(c => {
            const capital = parseMontoPref(c.montofinal || c.monto || 0);
            totalCapital += capital;
            
            // Buscar si tiene interés activado
            const cfg = configs?.find(f => f.id_credito === c.idcredito);
            let interesHeredado = 0;
            let diasTranscurridos = 0;
            let ruleLabel = 'Sin Interés';

            if (cfg) {
                const fInicio = new Date(cfg.fecha_inicio_interes + 'T12:00:00');
                const diffTime = Math.max(0, hoy - fInicio);
                const diasBrutos = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                let periodos = 0;
                if (cfg.frecuencia === 'diario') periodos = diasBrutos;
                else if (cfg.frecuencia === 'semanal') periodos = Math.floor(diasBrutos / 7);
                else if (cfg.frecuencia === 'mensual') periodos = Math.floor(diasBrutos / 30);
                else if (cfg.frecuencia === 'anual') periodos = Math.floor(diasBrutos / 365);
                
                interesHeredado = capital * (parseFloat(cfg.tasa_decimal)) * periodos;
                diasTranscurridos = diasBrutos;
                ruleLabel = `${(parseFloat(cfg.tasa_decimal) * 100).toFixed(1)}% ${cfg.frecuencia}`;
            }

            totalInteresProcesado += interesHeredado;
            return {
                id: c.idcredito,
                label: `${c.tipo || 'Crédito'} (${formatDateShortPref(c.fechaaprobacion)})`,
                capital,
                interes: interesHeredado,
                rule: ruleLabel
            };
        });

        const totalAbonado = pagos ? pagos.reduce((sum, p) => sum + parseFloat(p.monto_abonado || 0), 0) : 0;
        const totalDeudaReal = (totalCapital + totalInteresProcesado) - totalAbonado;

        if (typeof window.hideLoader === 'function') window.hideLoader();

        // 5. Mostrar Modal Resumen y Pago
        const socioNombre = sociosConCreditos.find(s => s.idsocio === idSocio).nombre;
        
        const { value: abonoData } = await Swal.fire({
            title: `<i class="fas fa-file-invoice-dollar" style="color: #10B981;"></i><br>Estado de Cuenta`,
            width: '600px',
            html: `
                <div style="text-align: left; background: #1a1f2e; padding: 20px; border-radius: 12px; border: 1px solid #30363d;">
                    <div style="font-size: 1.1rem; font-weight: bold; color: #FFF; margin-bottom: 5px;">${socioNombre}</div>
                    <div style="font-size: 0.8rem; color: #8b949e; margin-bottom: 15px;">ID: ${idSocio}</div>

                    <div style="margin-bottom: 20px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; color: #c9d1d9;">
                            <thead>
                                <tr style="border-bottom: 1px solid #30363d;">
                                    <th style="text-align: left; padding: 5px;">Crédito</th>
                                    <th style="text-align: right; padding: 5px;">Capital</th>
                                    <th style="text-align: right; padding: 5px;">Interés</th>
                                    <th style="text-align: center; padding: 5px;">Regla</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detallesDeuda.map(d => `
                                    <tr>
                                        <td style="padding: 5px;">${d.label}</td>
                                        <td style="text-align: right; padding: 5px;">${formatMoneyPref(d.capital)}</td>
                                        <td style="text-align: right; padding: 5px; color: #f0883e;">+${formatMoneyPref(d.interes)}</td>
                                        <td style="text-align: center; padding: 5px; font-size: 0.75rem; background: rgba(240,136,62,0.1); border-radius: 4px;">${d.rule}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; padding-top: 15px; border-top: 2px solid #30363d;">
                        <div style="text-align: left;">
                            <div style="font-size: 0.8rem; color: #8b949e;">Deuda Total (viva):</div>
                            <div style="font-size: 1.2rem; font-weight: bold; color: #FFF;">${formatMoneyPref(totalCapital + totalInteresProcesado)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.8rem; color: #8b949e;">Abonado Histórico:</div>
                            <div style="font-size: 1.2rem; font-weight: bold; color: #10B981;">${formatMoneyPref(totalAbonado)}</div>
                        </div>
                    </div>

                    <div style="background: rgba(245, 158, 11, 0.1); padding: 15px; border-radius: 10px; border: 1px solid rgba(245, 158, 11, 0.2); text-align: center;">
                        <div style="font-size: 0.9rem; color: #F59E0B; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">Saldo Pendiente Real</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #F59E0B;">${formatMoneyPref(totalDeudaReal)}</div>
                    </div>

                    <div style="margin-top: 20px;">
                        <label style="display: block; font-size: 0.85rem; color: #FFF; font-weight: bold; margin-bottom: 10px;">REGISTRAR NUEVO ABONO</label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <input id="sw-abono-monto" type="number" step="0.01" class="swal2-input" placeholder="Monto $" style="margin: 0; width: 100%;">
                            <input id="sw-abono-fecha" type="date" class="swal2-input" value="${hoy.toISOString().split('T')[0]}" style="margin: 0; width: 100%;">
                        </div>
                        <input id="sw-abono-file" type="file" accept="image/*" class="swal2-file" style="margin-top: 10px; width: 100%; color: #FFF; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 10px;">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Registrar Abono Global',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#10B981',
            preConfirm: () => {
                const monto = document.getElementById('sw-abono-monto').value;
                const fecha = document.getElementById('sw-abono-fecha').value;
                const file = document.getElementById('sw-abono-file').files[0];
                
                if (monto && parseFloat(monto) > 0) {
                    return { monto, fecha, file };
                }
                return null; // Si no hay monto, solo se cierra el modal
            }
        });

        if (abonoData) {
            saveAbonoGlobalSocio(idSocio, abonoData);
        }

    } catch (err) {
        if (typeof window.hideLoader === 'function') window.hideLoader();
        console.error("Error cargando estado de cuenta:", err);
        Swal.fire('Error', 'No se pudo generar el estado de cuenta: ' + err.message, 'error');
    }
}

/**
 * Guarda el abono global del socio
 */
async function saveAbonoGlobalSocio(idSocio, data) {
    if (typeof window.showLoader === 'function') window.showLoader('Guardando abono...');
    
    try {
        const supabase = window.getSupabaseClient();
        let comprovanteUrl = null;

        if (data.file) {
            const fileName = `abono_global_${idSocio}_${Date.now()}.jpg`;
            const { data: uploadData, error: uploadErr } = await supabase.storage.from('comprobantes_preferenciales').upload(fileName, data.file);
            if (!uploadErr) {
                const { data: { publicUrl } } = supabase.storage.from('comprobantes_preferenciales').getPublicUrl(fileName);
                comprovanteUrl = publicUrl;
            }
        }

        const { error } = await supabase.from('ic_preferencial_pagos').insert([{
            id_socio: idSocio,
            monto_abonado: parseFloat(data.monto),
            fecha_pago: data.fecha,
            comprobante_url: comprovanteUrl,
            notas_admin: 'Abono global desde Estado de Cuenta'
        }]);

        if (error) throw error;
        
        if (typeof window.hideLoader === 'function') window.hideLoader();
        Swal.fire('Abono Exitoso', `Se han registrado ${formatMoneyPref(data.monto)} al perfil del socio.`, 'success');
        
        // Refrescar para ver impacto
        renderCreditosPref();

    } catch (err) {
        if (typeof window.hideLoader === 'function') window.hideLoader();
        Swal.fire('Error', err.message, 'error');
    }
}

/**
 * Configurar interés para un crédito específico
 */
async function activarInteresCredito(idcredito) {
    const credito = allCreditosPref.find(c => c.idcredito === idcredito);
    if (!credito) return;

    const { value: formValues } = await Swal.fire({
        title: '⚡ Configurar Intereses',
        html: `
            <div style="text-align: left; background: rgba(245, 158, 11, 0.05); padding: 15px; border-radius: 8px; border: 1px dashed #F59E0B; margin-bottom: 15px;">
                <div style="font-size: 0.85rem; color: #9CA3AF;">Crédito: <b>${credito.tipo || 'Preferencial'}</b></div>
                <div style="font-size: 0.85rem; color: #9CA3AF;">Monto: <b>${formatMoneyPref(credito.montofinal || credito.monto)}</b></div>
            </div>
            
            <div class="swal-custom-field">
                <label style="display:block; text-align:left; color:#8b949e; font-size:0.8rem; margin-bottom:5px;">Tasa de Interés (%)</label>
                <input id="sw-int-tasa" type="number" step="0.01" class="swal2-input" placeholder="Ej: 2" style="margin:0; width:100%;">
            </div>

            <div class="swal-custom-field" style="margin-top:15px;">
                <label style="display:block; text-align:left; color:#8b949e; font-size:0.8rem; margin-bottom:5px;">Frecuencia</label>
                <select id="sw-int-frec" class="swal2-select" style="margin:0; width:100%; color: #FFF; background: #21262d;">
                    <option value="diario">Diario</option>
                    <option value="semanal">Semanal</option>
                    <option value="mensual" selected>Mensual</option>
                    <option value="anual">Anual</option>
                </select>
            </div>

            <div class="swal-custom-field" style="margin-top:15px;">
                <label style="display:block; text-align:left; color:#8b949e; font-size:0.8rem; margin-bottom:5px;">Inicia cobrar desde</label>
                <input id="sw-int-fecha" type="date" class="swal2-input" value="${new Date().toISOString().split('T')[0]}" style="margin:0; width:100%;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Activar / Guardar',
        confirmButtonColor: '#F59E0B',
        preConfirm: () => {
            return {
                tasa: document.getElementById('sw-int-tasa').value,
                frecuencia: document.getElementById('sw-int-frec').value,
                fecha: document.getElementById('sw-int-fecha').value
            }
        }
    });

    if (formValues && formValues.tasa > 0) {
        if (typeof window.showLoader === 'function') window.showLoader('Guardando configuración...');
        try {
            const supabase = window.getSupabaseClient();
            
            // Upsert: Si ya existe configuración para este crédito, la sobreescribe
            const { error } = await supabase.from('ic_preferencial_config').upsert({
                id_credito: idcredito,
                tasa_decimal: parseFloat(formValues.tasa) / 100,
                frecuencia: formValues.frecuencia,
                fecha_inicio_interes: formValues.fecha,
                estado_interes: true
            }, { onConflict: 'id_credito' });

            if (error) throw error;
            
            if (typeof window.hideLoader === 'function') window.hideLoader();
            Swal.fire('Activado', `Regla de interés guardada para este crédito.`, 'success');
        } catch (err) {
            if (typeof window.hideLoader === 'function') window.hideLoader();
            Swal.fire('Error', err.message, 'error');
        }
    }
}

/**
 * Abre el modal para registrar abonos a un crédito específico (OBSOLETO - SE USA openEstadoCuentaSocioModal)
 */
async function openPagarCreditoModal(idcredito) {
    // Redirigir al flujo global por socio
    const credito = allCreditosPref.find(c => c.idcredito === idcredito);
    if (credito) {
        // Podríamos filtrar el selector de socios si quisiéramos, pero mejor ir directo al global
        openEstadoCuentaSocioModal(); 
    }
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

function parsePreferentialMonthlyRate(credito) {
    const raw = credito?.porcentaje ? credito.porcentaje.toString().replace('%', '').replace(',', '.').trim() : '0';
    const rate = parseFloat(raw);
    return Number.isFinite(rate) ? rate / 100 : 0;
}

function calculatePreferentialCreditBalance(credito, pagos = [], untilDate = new Date()) {
    const principalOriginal = parseMontoPref(credito.montofinal || credito.monto || 0);
    const monthlyRate = parsePreferentialMonthlyRate(credito);
    const startDate = parseDatePref(credito.fechaaprobacion || credito.fechasolicitud) || parseDatePref(credito.created_at) || new Date();
    const endDate = untilDate instanceof Date ? untilDate : parseDatePref(untilDate) || new Date();
    const sortedPayments = [...(pagos || [])]
        .filter(p => parseMontoPref(p.monto_abonado) > 0)
        .sort((a, b) => (parseDatePref(a.fecha_pago)?.getTime() || 0) - (parseDatePref(b.fecha_pago)?.getTime() || 0));

    let capitalPendiente = principalOriginal;
    let interesPendiente = 0;
    let totalInteresGenerado = 0;
    let totalPagado = 0;
    let cursor = startDate;

    const accrueUntil = (targetDate) => {
        if (!targetDate || targetDate <= cursor || capitalPendiente <= 0 || monthlyRate <= 0) {
            if (targetDate && targetDate > cursor) cursor = targetDate;
            return;
        }

        const dias = Math.max(0, Math.floor((targetDate - cursor) / (1000 * 60 * 60 * 24)));
        const interes = capitalPendiente * monthlyRate * (dias / 30);
        interesPendiente += interes;
        totalInteresGenerado += interes;
        cursor = targetDate;
    };

    sortedPayments.forEach(pago => {
        const paymentDate = parseDatePref(pago.fecha_pago) || cursor;
        accrueUntil(paymentDate);

        let montoPago = parseMontoPref(pago.monto_abonado);
        totalPagado += montoPago;

        const aplicadoInteres = Math.min(interesPendiente, montoPago);
        interesPendiente -= aplicadoInteres;
        montoPago -= aplicadoInteres;

        const aplicadoCapital = Math.min(capitalPendiente, montoPago);
        capitalPendiente -= aplicadoCapital;
    });

    accrueUntil(endDate);

    return {
        principalOriginal: parseFloat(principalOriginal.toFixed(2)),
        capitalPendiente: parseFloat(Math.max(0, capitalPendiente).toFixed(2)),
        interesPendiente: parseFloat(Math.max(0, interesPendiente).toFixed(2)),
        totalInteresGenerado: parseFloat(totalInteresGenerado.toFixed(2)),
        totalPagado: parseFloat(totalPagado.toFixed(2)),
        saldo: parseFloat(Math.max(0, capitalPendiente + interesPendiente).toFixed(2))
    };
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

function escapePrefHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function slugPref(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'item';
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
