/**
 * INKA CORP - Módulo de Administración de Créditos
 * Gestión y monitoreo de créditos activos
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allCreditos = [];
let filteredCreditos = [];
let currentEstadoFilterCreditos = '';
let currentPaisFilter = ''; // Filtro por país
let estadoSortEnabled = true; // Si está activo, ordena por estado (Morosos > Activos > Otros)
let currentSort = { field: 'cuotas', direction: 'desc' }; // Ordenamiento secundario
let currentViewingCredito = null;
let currentViewingCuota = null;
let currentUnpaidInstallments = []; // Para pagos múltiples
let selectedComprobanteFile = null; // Archivo de comprobante de pago seleccionado
let currentViewingAmortizacion = [];
let currentViewingDebtSummary = null;

// Mapeo de países a códigos ISO, nombres y URLs de banderas
const PAIS_CONFIG = {
    'ECUADOR': { code: 'ECU', name: 'Ecuador', flag: 'https://flagcdn.com/w20/ec.png' },
    'ESTADOS UNIDOS': { code: 'USA', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'USA': { code: 'USA', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'PERÚ': { code: 'PEN', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' },
    'PERU': { code: 'PEN', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function initCreditosModule() {
    // Si venimos del dashboard con un creditoId, intentamos abrirlo inmediatamente si está en caché
    const showCreditoId = sessionStorage.getItem('showCreditoDetails');
    if (showCreditoId && window.hasCacheData && window.hasCacheData('creditos')) {
        allCreditos = window.getCacheData('creditos');
        const creditoExistente = allCreditos.find(c => c.id_credito === showCreditoId);
        if (creditoExistente) {
            // No removemos el item todavía para que el loadCreditos normal no lo pise
            viewCredito(showCreditoId);
        }
    }

    await loadCreditos();
    setupCreditosEventListeners();

    // Exponer funciones al scope global para onclick handlers
    window.openPaymentModal = openPaymentModal;
    window.viewCredito = viewCredito;
    window.filterByPais = filterByPais;
    window.sortCreditos = sortCreditos;
    window.refreshCreditosCache = refreshCreditosCache;
    window.toggleEstadoFilter = toggleEstadoFilter;
    window.filterCreditosByEstado = filterCreditosByEstado;
    window.cleanupStickyHeaders = cleanupStickyHeaders;

    // Si ya lo abrimos desde caché arriba, esto no hará nada o refrescará si se cerró
    if (showCreditoId) {
        sessionStorage.removeItem('showCreditoDetails');
        // Solo abrimos si el modal no está ya visible (para evitar parpadeos)
        const modal = document.getElementById('ver-credito-modal');
        if (modal && modal.classList.contains('hidden')) {
            viewCredito(showCreditoId);
        }
    }
}

// ==========================================
// MODAL HELPERS (aislados del resto de módulos)
// ==========================================
function openCreditosModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeCreditosModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Si se cierra el modal principal, cerrar también el modal anidado
    if (modalId === 'ver-credito-modal') {
        const pagoModal = document.getElementById('registrar-pago-modal');
        if (pagoModal) {
            pagoModal.classList.add('hidden');
            pagoModal.style.display = 'none';
        }
    }

    modal.classList.add('hidden');
    modal.style.display = 'none';

    // Restaurar scroll solo si no queda ningún modal abierto
    const verCreditoModal = document.getElementById('ver-credito-modal');
    const registrarPagoModal = document.getElementById('registrar-pago-modal');
    const verPagoDetalleModal = document.getElementById('ver-pago-detalle-modal');
    const anyOpen =
        (verCreditoModal && !verCreditoModal.classList.contains('hidden')) ||
        (registrarPagoModal && !registrarPagoModal.classList.contains('hidden')) ||
        (verPagoDetalleModal && !verPagoDetalleModal.classList.contains('hidden'));

    if (!anyOpen) {
        document.body.style.overflow = '';
    }
}

function setupCreditosModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closeCreditosModal(modalId));
    });
}

function setupCreditosEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-creditos');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterCreditos();
        }, 300));
    }

    // Tabs de estado
    const estadoTabs = document.querySelectorAll('.estado-tab');
    estadoTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            estadoTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentEstadoFilterCreditos = tab.dataset.estado || '';
            filterCreditos();
        });
    });

    // Modal close handlers
    setupCreditosModalCloseHandlers('ver-credito-modal');
    setupCreditosModalCloseHandlers('registrar-pago-modal');
    setupCreditosModalCloseHandlers('ver-pago-detalle-modal');

    const btnGenerarEstadoPdf = document.getElementById('btn-generar-estado-credito-pdf');
    if (btnGenerarEstadoPdf && !btnGenerarEstadoPdf.dataset.bound) {
        btnGenerarEstadoPdf.addEventListener('click', generateCreditoEstadoPDF);
        btnGenerarEstadoPdf.dataset.bound = 'true';
    }

    // Setup sticky headers con scroll listener
    setupStickyHeaders();
}

// ==========================================
// STICKY HEADERS CON JAVASCRIPT
// ==========================================
let currentStickyHeader = null;
let stickyHeaderClone = null;

function setupStickyHeaders() {
    // Escuchar scroll del window
    window.addEventListener('scroll', handleStickyScroll, { passive: true });
}

function handleStickyScroll() {
    const sections = document.querySelectorAll('.creditos-section');
    if (sections.length === 0) return;

    const scrollTop = window.scrollY;
    let activeSection = null;

    // Encontrar la sección activa (la que está visible en el viewport)
    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const sectionTop = rect.top + scrollTop;
        const sectionBottom = sectionTop + section.offsetHeight;

        // Si el scroll está dentro de esta sección
        if (scrollTop >= sectionTop - 60 && scrollTop < sectionBottom - 100) {
            activeSection = section;
        }
    });

    // Si encontramos una sección activa, mostrar su header fijo
    if (activeSection) {
        const header = activeSection.querySelector('.section-sticky-header');
        const headerRect = header.getBoundingClientRect();

        // Si el header original está fuera del viewport (arriba)
        if (headerRect.top < 0) {
            showFixedHeader(header, activeSection);
        } else {
            hideFixedHeader();
        }
    } else {
        hideFixedHeader();
    }
}

function showFixedHeader(originalHeader, section) {
    // Si ya existe el clone para este header, no hacer nada
    if (stickyHeaderClone && currentStickyHeader === originalHeader) {
        return;
    }

    // Remover clone anterior si existe
    hideFixedHeader();

    // Obtener la tabla de la sección para clonar su thead
    const originalTable = section.querySelector('.creditos-section-table');
    const originalThead = originalTable ? originalTable.querySelector('thead') : null;
    const tableContainer = section.querySelector('.section-table-container');

    // Crear contenedor para el header fijo
    stickyHeaderClone = document.createElement('div');
    stickyHeaderClone.classList.add('fixed-header-clone');
    stickyHeaderClone.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        background: var(--card-bg, #1a1f2e);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        animation: slideDown 0.2s ease;
    `;

    // Clonar el header de sección
    const headerClone = originalHeader.cloneNode(true);
    headerClone.style.cssText = `
        margin: 0;
        border-radius: 0;
    `;
    stickyHeaderClone.appendChild(headerClone);

    // Clonar el thead de la tabla
    if (originalThead && originalTable) {
        // Obtener anchos reales de las columnas de la tabla original
        const originalThs = originalTable.querySelectorAll('thead th');
        const columnWidths = Array.from(originalThs).map(th => th.offsetWidth);

        // Crear una tabla para contener el thead clonado
        const tableClone = document.createElement('table');
        tableClone.className = 'creditos-section-table sticky-table-header';
        tableClone.style.cssText = `
            width: ${originalTable.offsetWidth}px;
            margin: 0 auto;
            border-collapse: collapse;
            table-layout: fixed;
        `;

        // Crear colgroup con anchos dinámicos
        const colgroup = document.createElement('colgroup');
        columnWidths.forEach(width => {
            const col = document.createElement('col');
            col.style.width = `${width}px`;
            colgroup.appendChild(col);
        });
        tableClone.appendChild(colgroup);

        const theadClone = originalThead.cloneNode(true);
        tableClone.appendChild(theadClone);

        // Contenedor para la tabla con padding igual al original
        const tableWrapper = document.createElement('div');
        const originalPadding = tableContainer ? window.getComputedStyle(tableContainer).padding : '0 1rem';
        tableWrapper.style.cssText = `
            padding: ${originalPadding};
            background: var(--card-bg, #1a1f2e);
            overflow: hidden;
        `;
        tableWrapper.appendChild(tableClone);

        stickyHeaderClone.appendChild(tableWrapper);
    }

    document.body.appendChild(stickyHeaderClone);
    currentStickyHeader = originalHeader;
}

function hideFixedHeader() {
    if (stickyHeaderClone) {
        stickyHeaderClone.remove();
        stickyHeaderClone = null;
        currentStickyHeader = null;
    }
}

// Cleanup cuando se cambia de vista
function cleanupStickyHeaders() {
    hideFixedHeader();
    window.removeEventListener('scroll', handleStickyScroll);
}

// ==========================================
// CARGAR DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadCreditos(forceRefresh = false) {
    try {
        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('creditos')) {
            const cachedData = window.getCacheData('creditos');
            
            // Verificamos si los datos cacheados tienen la estructura necesaria (amortización)
            // Si al menos un moroso no tiene amortización, forzamos la actualización de Supabase
            const needsRefresh = cachedData.some(c => c.estado_credito === 'MOROSO' && !c.amortizacion);
            
            if (!needsRefresh) {
                allCreditos = cachedData;
                filteredCreditos = [...allCreditos];
                updateEstadoCountsCreditos();
                updateStats();
                applySorting();
                renderCreditosTable(filteredCreditos);

                // Si el caché es reciente, no recargar
                if (window.isCacheValid && window.isCacheValid('creditos')) {
                    return;
                }
            }
        }

        // PASO 2: Actualizar en segundo plano
        const supabase = window.getSupabaseClient();

        const { data: creditos, error } = await supabase
            .from('ic_creditos')
            .select(`
                *,
                socio:ic_socios (
                    idsocio,
                    nombre,
                    cedula,
                    whatsapp,
                    paisresidencia
                ),
                amortizacion:ic_creditos_amortizacion (
                    cuota_total,
                    fecha_vencimiento,
                    estado_cuota
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allCreditos = creditos || [];
        filteredCreditos = [...allCreditos];

        // Sincronizar estados morosos automáticamente
        await sincronizarEstadosMorosos(allCreditos);

        // Guardar en caché
        if (window.setCacheData) {
            window.setCacheData('creditos', allCreditos);
        }

        updateEstadoCountsCreditos();
        updateStats();
        applySorting();
        renderCreditosTable(filteredCreditos);

    } catch (error) {
        console.error('Error loading creditos:', error);
        // Si hay error pero tenemos caché, mantener los datos de caché
        if (!window.hasCacheData || !window.hasCacheData('creditos')) {
            showErrorMessage('Error al cargar los créditos');
        }
    }
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateStats() {
    const activos = allCreditos.filter(c => c.estado_credito === 'ACTIVO');
    const morosos = allCreditos.filter(c => c.estado_credito === 'MOROSO');

    const carteraTotal = activos.reduce((sum, c) => sum + parseFloat(c.capital || 0), 0);
    const ahorroTotal = allCreditos.reduce((sum, c) => {
        return sum + (parseFloat(c.ahorro_programado_cuota || 0) * (c.cuotas_pagadas || 0));
    }, 0);

    // Calcular porcentaje de mora (morosos / (activos + morosos))
    const totalActivosMorosos = activos.length + morosos.length;
    const porcentajeMora = totalActivosMorosos > 0
        ? Math.round((morosos.length / totalActivosMorosos) * 100)
        : 0;

    document.getElementById('stat-activos').textContent = activos.length;
    document.getElementById('stat-mora').textContent = morosos.length;
    document.getElementById('stat-mora-pct').textContent = `${porcentajeMora}%`;
    document.getElementById('stat-cartera').textContent = formatMoney(carteraTotal);
    document.getElementById('stat-ahorro').textContent = formatMoney(ahorroTotal);
}

// ==========================================
// ACTUALIZAR CONTADORES
// ==========================================
function updateEstadoCountsCreditos() {
    const counts = {
        all: allCreditos.length,
        activo: allCreditos.filter(c => c.estado_credito === 'ACTIVO').length,
        moroso: allCreditos.filter(c => c.estado_credito === 'MOROSO').length,
        cancelado: allCreditos.filter(c => c.estado_credito === 'CANCELADO').length,
        precancelado: allCreditos.filter(c => c.estado_credito === 'PRECANCELADO').length
    };

    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-activo').textContent = counts.activo;
    document.getElementById('count-moroso').textContent = counts.moroso;
    document.getElementById('count-cancelado').textContent = counts.cancelado;
    document.getElementById('count-precancelado').textContent = counts.precancelado;
}

/**
 * Sincroniza automáticamente el estado de los créditos si tienen cuotas vencidas.
 * Se ejecuta al cargar los créditos o después de registrar un pago.
 */
async function sincronizarEstadosMorosos(creditos) {
    // Usamos la fecha actual de Ecuador para la comparación
    const hoyStr = getEcuadorDateString();
    const hoy = parseDate(hoyStr);
    const idsParaActualizar = [];

    creditos.forEach(c => {
        // Solo los créditos en estado ACTIVO pueden pasar a MOROSO.
        // Se ignoran explícitamente PAUSADO, CANCELADO, PRECANCELADO y los que ya son MOROSO.
        if (c.estado_credito !== 'ACTIVO') return;

        // Calcular próxima fecha de pago (Capital + Interés + Ahorro)
        const fechaBase = parseDate(c.fecha_primer_pago);
        if (!fechaBase) return;

        // Sumar meses según cuotas pagadas para obtener el vencimiento de la "próxima" cuota
        fechaBase.setMonth(fechaBase.getMonth() + (c.cuotas_pagadas || 0));
        
        // Si la fecha de vencimiento es estrictamente menor a hoy, está vencido
        if (fechaBase < hoy) {
            idsParaActualizar.push(c.id_credito);
            c.estado_credito = 'MOROSO'; // Actualización local inmediata para la UI
        }
    });

    if (idsParaActualizar.length > 0) {
        console.log(`[Sync] Actualizando ${idsParaActualizar.length} créditos a estado MOROSO...`);
        try {
            const supabase = window.getSupabaseClient();
            const { error } = await supabase
                .from('ic_creditos')
                .update({ 
                    estado_credito: 'MOROSO',
                    updated_at: new Date().toISOString()
                })
                .in('id_credito', idsParaActualizar);

            if (error) throw error;
            console.log(`[Sync] Sincronización de estados completada exitosamente.`);
        } catch (err) {
            console.error('[Sync] Error al sincronizar estados morosos:', err);
        }
    }
}

// ==========================================
// FILTRAR CRÉDITOS
// ==========================================
function filterCreditos() {
    const searchTerm = document.getElementById('search-creditos')?.value?.toLowerCase() || '';

    filteredCreditos = allCreditos.filter(credito => {
        // Filtro por estado (si está activado)
        if (currentEstadoFilterCreditos && credito.estado_credito !== currentEstadoFilterCreditos) {
            return false;
        }

        // Filtro por país (banderitas)
        if (currentPaisFilter) {
            const paisCredito = normalizePais(credito.socio?.paisresidencia);
            if (paisCredito !== currentPaisFilter) return false;
        }

        // Filtro por búsqueda
        if (searchTerm) {
            const nombre = (credito.socio?.nombre || '').toLowerCase();
            const cedula = (credito.socio?.cedula || '').toLowerCase();

            if (!nombre.includes(searchTerm) &&
                !cedula.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    // Aplicar ordenamiento
    applySorting();

    renderCreditosTable(filteredCreditos);
}

// Aplicar ordenamiento según estado, país y ordenamiento secundario
function applySorting() {
    // Prioridad de estados para ordenamiento (menor número = mayor prioridad)
    const estadoPriority = {
        'MOROSO': 1,
        'ACTIVO': 2,
        'PAUSADO': 3,
        'PRECANCELADO': 4,
        'CANCELADO': 5,
        'PENDIENTE': 6,
        'ANULADO': 7
    };

    filteredCreditos.sort((a, b) => {
        // 1. Si estadoSortEnabled, ordenar primero por estado
        if (estadoSortEnabled) {
            const aEstadoPrio = estadoPriority[a.estado_credito] || 99;
            const bEstadoPrio = estadoPriority[b.estado_credito] || 99;
            if (aEstadoPrio !== bEstadoPrio) {
                return aEstadoPrio - bEstadoPrio;
            }
        }

        // 2. Si hay filtro de país, priorizar ese país
        if (currentPaisFilter) {
            const aIsPais = normalizePais(a.socio?.paisresidencia) === currentPaisFilter;
            const bIsPais = normalizePais(b.socio?.paisresidencia) === currentPaisFilter;
            if (aIsPais && !bIsPais) return -1;
            if (!aIsPais && bIsPais) return 1;
        }

        // 3. Ordenamiento secundario (cuotas, monto, fecha)
        let compare = 0;

        switch (currentSort.field) {
            case 'cuotas':
                // Por cuotas pendientes (descendente = más cuotas pendientes primero)
                const aPendientes = (a.plazo || 0) - (a.cuotas_pagadas || 0);
                const bPendientes = (b.plazo || 0) - (b.cuotas_pagadas || 0);
                compare = bPendientes - aPendientes;
                break;
            case 'monto':
                // Por monto (descendente = mayor monto primero)
                compare = parseFloat(b.capital || 0) - parseFloat(a.capital || 0);
                break;
            case 'fecha':
                // Por fecha de otorgamiento (ascendente = más antiguo primero)
                compare = parseDate(a.fecha_desembolso) - parseDate(b.fecha_desembolso);
                break;
        }

        // Invertir si es ascendente
        if (currentSort.direction === 'asc') {
            compare = -compare;
        }

        return compare;
    });
}

// Normalizar nombre de país
function normalizePais(pais) {
    if (!pais) return '';
    const normalized = pais.toUpperCase().trim();
    if (normalized === 'USA' || normalized === 'ESTADOS UNIDOS') return 'USA';
    if (normalized === 'PERÚ' || normalized === 'PERU') return 'PERU';
    return normalized;
}

// Filtrar por país
function filterByPais(pais) {
    const target = normalizePais(pais);
    currentPaisFilter = target;

    // Actualizar UI de botones de país
    document.querySelectorAll('.pais-filter-btn').forEach(btn => {
        btn.classList.toggle('active', normalizePais(btn.dataset.pais) === target);
    });

    filterCreditos();
}

// Cambiar ordenamiento secundario
function sortCreditos(field) {
    // Si es el mismo campo, invertir dirección
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'desc';
    }

    // Actualizar UI de botones de ordenamiento
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const isActive = btn.dataset.sort === field;
        btn.classList.toggle('active', isActive);
        const icon = btn.querySelector('.sort-icon');
        if (icon && isActive) {
            icon.className = `fas fa-sort-${currentSort.direction === 'desc' ? 'down' : 'up'} sort-icon`;
        }
    });

    filterCreditos();
}

// Toggle ordenamiento por estado (Activos > Morosos > Otros)
function toggleEstadoFilter() {
    const btn = document.getElementById('btn-estado-filter');
    estadoSortEnabled = !estadoSortEnabled;
    btn?.classList.toggle('active', estadoSortEnabled);
    filterCreditos();
}

// Forzar actualización del caché de créditos
async function refreshCreditosCache() {
    const btn = document.querySelector('.btn-sync');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        // Recargar créditos forzando actualización
        await loadCreditos(true);

        showToast('Créditos actualizados', 'success');
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
// RENDERIZAR TABLA POR SECCIONES
// ==========================================

// Configuración de estados para secciones
const ESTADO_CONFIG = {
    'ACTIVO': { icon: 'fa-check-circle', color: '#10B981', label: 'CARTERA ACTIVA', bgColor: 'rgba(16, 185, 129, 0.15)' },
    'MOROSO': { icon: 'fa-exclamation-triangle', color: '#EF4444', label: 'CARTERA EN MORA', bgColor: 'rgba(239, 68, 68, 0.15)' },
    'PAUSADO': { icon: 'fa-pause-circle', color: '#F59E0B', label: 'CRÉDITOS PAUSADOS', bgColor: 'rgba(245, 158, 11, 0.15)' },
    'PRECANCELADO': { icon: 'fa-calendar-check', color: '#3B82F6', label: 'CRÉDITOS PRECANCELADOS', bgColor: 'rgba(59, 130, 246, 0.15)' },
    'CANCELADO': { icon: 'fa-flag-checkered', color: '#6B7280', label: 'CRÉDITOS FINALIZADOS', bgColor: 'rgba(107, 114, 128, 0.15)' },
    'PENDIENTE': { icon: 'fa-clock', color: '#8B5CF6', label: 'POR APROBAR', bgColor: 'rgba(139, 92, 246, 0.15)' },
    'ANULADO': { icon: 'fa-times-circle', color: '#6b7280', label: 'CRÉDITOS ANULADOS', bgColor: 'rgba(107, 114, 128, 0.15)' }
};

// Orden de prioridad para mostrar secciones
const ESTADO_ORDER = ['MOROSO', 'ACTIVO', 'PAUSADO', 'PRECANCELADO', 'CANCELADO', 'PENDIENTE', 'ANULADO'];

function renderCreditosTable(creditos) {
    const container = document.getElementById('creditos-sections-container');
    const emptyDiv = document.getElementById('creditos-empty');

    if (!creditos || creditos.length === 0) {
        container.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    // Agrupar créditos por estado
    const groupedByEstado = {};
    creditos.forEach(credito => {
        const estado = credito.estado_credito || 'PENDIENTE';
        if (!groupedByEstado[estado]) {
            groupedByEstado[estado] = [];
        }
        groupedByEstado[estado].push(credito);
    });

    // Si hay filtro de estado activo, solo mostrar ese estado
    if (currentEstadoFilterCreditos) {
        const singleEstado = currentEstadoFilterCreditos;
        const singleCreditos = groupedByEstado[singleEstado] || [];

        if (singleCreditos.length === 0) {
            container.innerHTML = '';
            emptyDiv?.classList.remove('hidden');
            return;
        }

        container.innerHTML = renderEstadoSection(singleEstado, singleCreditos, true);
        return;
    }

    // Renderizar todas las secciones en orden de prioridad
    let html = '';
    ESTADO_ORDER.forEach(estado => {
        if (groupedByEstado[estado] && groupedByEstado[estado].length > 0) {
            html += renderEstadoSection(estado, groupedByEstado[estado], false);
        }
    });

    // Agregar estados no contemplados
    Object.keys(groupedByEstado).forEach(estado => {
        if (!ESTADO_ORDER.includes(estado) && groupedByEstado[estado].length > 0) {
            html += renderEstadoSection(estado, groupedByEstado[estado], false);
        }
    });

    container.innerHTML = html;
}

function renderEstadoSection(estado, creditos, isSingleSection) {
    const config = ESTADO_CONFIG[estado] || {
        icon: 'fa-folder',
        color: '#9CA3AF',
        label: estado,
        bgColor: 'rgba(156, 163, 175, 0.15)'
    };

    return `
        <div class="creditos-section" data-estado="${estado}">
            <div class="section-sticky-header" style="--section-color: ${config.color}; --section-bg: ${config.bgColor}; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 4px solid ${config.color};">
                <div class="section-header-content">
                    <i class="fas ${config.icon}" style="color: ${config.color}; text-shadow: 0 2px 4px rgba(0,0,0,0.1);"></i>
                    <span class="section-title" style="text-shadow: 0 1px 2px rgba(0,0,0,0.1);">${config.label}</span>
                    <span class="section-count" style="background: ${config.color}; color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${creditos.length}</span>
                </div>
            </div>
            <div class="section-table-container">
                <table class="creditos-section-table">
                    <thead>
                        <tr>
                            <th class="col-socio">Socio</th>
                            <th class="col-capital text-right">Capital</th>
                            <th class="text-right">${estado === 'MOROSO' ? 'DEUDA ACUMULADA' : 'CUOTA'}</th>
                            <th class="text-center">País</th>
                            <th class="text-center">Pagadas</th>
                            <th class="text-center">Próx. Pago</th>
                            <th class="text-center">Estado</th>
                            <th class="text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${creditos.map(credito => renderCreditoRow(credito, estado)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Calcula la deuda acumulada para un crédito moroso (Cuotas vencidas + mora)
 */
function calculateDeudaAcumulada(credito) {
    if (!credito.amortizacion || !Array.isArray(credito.amortizacion)) {
        return credito.cuota_con_ahorro || 0;
    }

    // Obtener la fecha actual en Ecuador para comparar
    const hoyStr = getEcuadorDateString();
    const hoy = parseDate(hoyStr);
    if (hoy) hoy.setHours(23, 59, 59, 999);

    // Filtrar solo cuotas que no están pagadas Y que YA vencieron (hasta hoy)
    const overdueCuotas = credito.amortizacion.filter(c => {
        const isNotPaid = c.estado_cuota === 'VENCIDO' || c.estado_cuota === 'PENDIENTE' || c.estado_cuota === 'PARCIAL';
        const vencimiento = parseDate(c.fecha_vencimiento);
        return isNotPaid && vencimiento && (vencimiento <= hoy);
    });

    if (overdueCuotas.length === 0) {
        return 0;
    }

    let totalDeuda = 0;
    overdueCuotas.forEach(cuota => {
        const montoCuota = parseFloat(cuota.cuota_total || 0);
        const moraInfo = calcularMora(cuota.fecha_vencimiento);
        totalDeuda += montoCuota + (moraInfo.montoMora || 0);
    });

    return totalDeuda;
}

function renderCreditoRow(credito, sectionEstado = '') {
    const progreso = `${credito.cuotas_pagadas || 0}/${credito.plazo}`;
    const proximoPago = getProximoPago(credito);
    const pais = credito.socio?.paisresidencia || '';
    const paisFlag = getPaisFlag(pais);
    const paisCode = getPaisCode(pais);
    const estadoBadge = getEstadoBadgeCredito(credito.estado_credito);
    
    // Si estamos en la sección de morosos, calculamos la deuda acumulada total
    const valorCuota = sectionEstado === 'MOROSO' 
        ? calculateDeudaAcumulada(credito) 
        : (credito.cuota_con_ahorro || 0);
    
    // Clase de estado para fondo sutil
    const statusClass = credito.estado_credito ? `row-status-${credito.estado_credito.toLowerCase()}` : '';

    return `
        <tr class="credito-row ${statusClass}" data-credito-id="${credito.id_credito}" onclick="viewCredito('${credito.id_credito}')">
            <td class="col-socio">
                <div class="socio-info">
                    <span class="socio-nombre">${credito.socio?.nombre || 'N/A'}</span>
                    <span class="socio-cedula">${credito.socio?.cedula || ''}</span>
                </div>
            </td>
            <td class="col-capital text-right">${formatMoney(credito.capital)}</td>
            <td class="text-right"><strong>${formatMoney(valorCuota)}</strong></td>
            <td class="col-pais text-center">
                <div class="pais-container-row">
                    ${paisFlag ? `<img src="${paisFlag}" alt="${paisCode}" class="pais-flag-img-row">` : ''}
                    <span class="pais-code-row">${paisCode}</span>
                </div>
            </td>
            <td class="col-pagadas text-center">
                <span class="progress-badge">${progreso}</span>
            </td>
            <td class="col-prox-pago text-center">${proximoPago}</td>
            <td class="text-center">${estadoBadge}</td>
            <td class="text-center">
                <button class="btn-icon btn-ver-credito" onclick="event.stopPropagation(); viewCredito('${credito.id_credito}', this)" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `;
}

// Filtrar por estado desde los counters
function filterCreditosByEstado(estado) {
    currentEstadoFilterCreditos = estado;

    // Actualizar UI de counters
    document.querySelectorAll('.estado-counter').forEach(counter => {
        counter.classList.toggle('active', counter.dataset.estado === estado);
    });

    filterCreditos();
}

// Obtener URL de imagen de bandera del país
function getPaisFlag(pais) {
    if (!pais) return '';
    const normalized = pais.toUpperCase().trim();
    const config = PAIS_CONFIG[normalized];
    return config ? config.flag : '';
}

// Obtener código corto del país
function getPaisCode(pais) {
    if (!pais) return '';
    const normalized = pais.toUpperCase().trim();
    const config = PAIS_CONFIG[normalized];
    return config ? config.code : pais.substring(0, 2).toUpperCase();
}

/**
 * Formatea una fecha en formato "13 mar 2026"
 */
function formatDateMedium(date) {
    if (!date) return '-';
    // Usar el formateador centralizado para consistencia de zona horaria
    return window.formatDate(date, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).replace('.', '');
}

function getProximoPago(credito) {
    // Estados sin próximo pago
    const estadosSinPago = ['CANCELADO', 'PRECANCELADO', 'PAUSADO'];
    if (estadosSinPago.includes(credito.estado_credito)) {
        return '<span class="text-muted">-</span>';
    }

    // Calcular próxima fecha de pago basada en cuotas pagadas
    const fechaBase = parseDate(credito.fecha_primer_pago);
    if (!fechaBase) return '<span class="text-muted">-</span>';

    // Crear una copia para evitar mutar el original si fuera necesario
    const fechaProx = new Date(fechaBase);
    fechaProx.setMonth(fechaProx.getMonth() + (credito.cuotas_pagadas || 0));

    const hoy = new Date();
    // Normalizar hoy a medianoche para comparar solo días
    hoy.setHours(0, 0, 0, 0);
    const fechaComp = new Date(fechaProx);
    fechaComp.setHours(0, 0, 0, 0);

    const diffTime = fechaComp - hoy;
    const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const dateStr = formatDateMedium(fechaProx);

    if (diasRestantes < 0) {
        return `<div class="pago-status"><span class="text-danger" style="font-weight: 800;">Vencido ${Math.abs(diasRestantes)}d</span><br><small class="text-muted">${dateStr}</small></div>`;
    } else if (diasRestantes === 0) {
        return `<div class="pago-status"><span class="text-warning" style="font-weight: 800;">Paga Hoy</span><br><small class="text-muted">${dateStr}</small></div>`;
    } else if (diasRestantes <= 5) {
        return `<div class="pago-status"><span class="text-warning" style="font-weight: 800;">En ${diasRestantes}d</span><br><small class="text-muted">${dateStr}</small></div>`;
    }

    return `<span class="text-date">${dateStr}</span>`;
}

function getEstadoBadgeCredito(estado) {
    const badges = {
        'ACTIVO': '<span class="badge-activo">ACTIVO</span>',
        'MOROSO': '<span class="badge-moroso">MOROSO</span>',
        'CANCELADO': '<span class="badge-cancelado">CANCELADO</span>',
        'PRECANCELADO': '<span class="badge-precancelado">PRECANCELADO</span>',
        'PAUSADO': '<span class="badge-pausado">PAUSADO</span>',
        'PENDIENTE': '<span class="badge-pendiente">PENDIENTE</span>',
        'ANULADO': '<span class="badge-anulado">ANULADO</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// VER DETALLE DE CRÉDITO
// ==========================================
async function viewCredito(creditoId, btn = null) {
    let originalContent = '';
    if (btn) {
        originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    const credito = allCreditos.find(c => c.id_credito === creditoId);
    if (!credito) {
        showToast('Crédito no encontrado', 'error');
        return;
    }

    currentViewingCredito = credito;
    currentViewingAmortizacion = [];
    currentViewingDebtSummary = null;

    // Obtener configuración de color por estado
    const config = ESTADO_CONFIG[credito.estado_credito] || { color: 'var(--primary)', bgColor: 'rgba(11, 78, 50, 0.15)' };

    // Llenar información del modal
    const valorFormateado = typeof formatMoney === 'function' ? formatMoney(credito.capital) : `$${credito.capital}`;
    const modalTitleEl = document.getElementById('modal-codigo-credito');
    modalTitleEl.innerHTML = `${credito.socio?.nombre || 'Crédito'} - ${valorFormateado}`;
    
    // Si el crédito está en MORA, calcular cuotas adeudadas y añadir cápsula
    if (credito.estado_credito === 'MOROSO') {
        try {
            const supabase = window.getSupabaseClient();
            // Obtenemos las cuotas vencidas para calcular meses y días de atraso
            const { data: cuotasVencidas, error } = await supabase
                .from('ic_creditos_amortizacion')
                .select('fecha_vencimiento')
                .eq('id_credito', credito.id_credito)
                .eq('estado_cuota', 'VENCIDO')
                .order('fecha_vencimiento', { ascending: true });
            
            if (!error && cuotasVencidas && cuotasVencidas.length > 0) {
                const count = cuotasVencidas.length;
                
                // Calcular días desde la cuota más antigua vencida
                const oldestDate = window.parseDate(cuotasVencidas[0].fecha_vencimiento);
                const today = new Date();
                const diffTime = Math.max(0, today - oldestDate);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                const badgeHtml = `<span class="mora-badge-inline" style="
                    background: #fff;
                    color: #EF4444;
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    margin-left: 10px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    display: inline-flex;
                    align-items: center;
                    vertical-align: middle;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    text-transform: uppercase;
                "><i class="fas fa-calendar-times" style="margin-right: 5px;"></i>ADEUDA ${count} ${count === 1 ? 'MES' : 'MESES'} POR ${diffDays} DÍAS</span>`;
                
                modalTitleEl.insertAdjacentHTML('beforeend', badgeHtml);
            }
        } catch (err) {
            console.error('Error al calcular meses de mora:', err);
        }
    }
    
    // Aplicar colores dinámicos al header del modal
    const modalHeader = document.querySelector('#ver-credito-modal .modal-header');
    const modalTitle = document.querySelector('#ver-credito-modal .modal-title');
    const modalClose = document.querySelector('#ver-credito-modal .modal-close');
    const modalDoc = document.querySelector('#ver-credito-modal .modal-card');
    
    // Resetear clase de moroso por si acaso
    if (modalDoc) modalDoc.classList.remove('modal-moroso-wide');

    if (modalHeader) {
        modalHeader.style.background = `linear-gradient(135deg, ${config.color} 0%, #a48d5d 100%)`;
    }
    if (modalTitle) {
        modalTitle.style.color = '#FFFFFF';
    }
    if (modalClose) {
        modalClose.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalClose.style.color = '#FFFFFF';
        modalClose.style.borderRadius = '50%';
        modalClose.style.width = '30px';
        modalClose.style.height = '30px';
        modalClose.style.display = 'flex';
        modalClose.style.alignItems = 'center';
        modalClose.style.justifyContent = 'center';
    }

    // Si es moroso, añadir clase para ensanchar el modal
    if (credito.estado_credito === 'MOROSO' && modalDoc) {
        modalDoc.classList.add('modal-moroso-wide');
    }

    document.getElementById('det-nombre-socio').textContent = credito.socio?.nombre || '-';
    document.getElementById('det-cedula-socio').textContent = credito.socio?.cedula || '-';
    document.getElementById('det-whatsapp-socio').textContent = credito.socio?.whatsapp || '-';
    updateCreditoPdfMeta(credito);

    // Resumen
    document.getElementById('det-capital').textContent = formatMoney(credito.capital);
    document.getElementById('det-interes').textContent = formatMoney(credito.total_interes);
    document.getElementById('det-gastos').textContent = formatMoney(credito.gastos_administrativos);
    document.getElementById('det-cuota').textContent = formatMoney(credito.cuota_base);
    document.getElementById('det-ahorro-cuota').textContent = formatMoney(credito.ahorro_programado_cuota);
    document.getElementById('det-cuota-total').textContent = formatMoney(credito.cuota_con_ahorro);

    // Progreso
    const cuotasPagadas = credito.cuotas_pagadas || 0;
    const progresoPct = Math.round((cuotasPagadas / credito.plazo) * 100);
    document.getElementById('det-progreso-text').textContent = `${cuotasPagadas}/${credito.plazo} cuotas`;
    document.getElementById('det-progreso-pct').textContent = `${progresoPct}%`;
    document.getElementById('det-progreso-bar').style.width = `${progresoPct}%`;

    // Fechas
    document.getElementById('det-fecha-desembolso').textContent = formatDate(credito.fecha_desembolso);
    document.getElementById('det-fecha-primer-pago').textContent = formatDate(credito.fecha_primer_pago);
    document.getElementById('det-fecha-fin').textContent = formatDate(credito.fecha_fin_credito);
    document.getElementById('det-dia-pago').textContent = `Día ${credito.dia_pago} de cada mes`;

    // Ahorro
    const ahorroAcumulado = credito.ahorro_programado_cuota * cuotasPagadas;
    const ahorroPendiente = credito.ahorro_programado_total - ahorroAcumulado;
    document.getElementById('det-ahorro-total').textContent = formatMoney(ahorroAcumulado);
    document.getElementById('det-ahorro-acumulado').textContent = formatMoney(credito.ahorro_programado_total);
    document.getElementById('det-ahorro-pendiente').textContent = formatMoney(ahorroPendiente);

    // Configurar botón de registrar pago
    const btnRegistrarPago = document.getElementById('btn-registrar-pago');
    const btnAnularCredito = document.getElementById('btn-anular-credito');

    if (btnAnularCredito) {
        // Solo permitir anular si el crédito es ACTIVO o MOROSO y NO TIENE CUOTAS PAGADAS
        const canAnul = (credito.estado_credito === 'ACTIVO' || credito.estado_credito === 'MOROSO') && (credito.cuotas_pagadas === 0);
        btnAnularCredito.style.display = canAnul ? 'inline-flex' : 'none';
        btnAnularCredito.onclick = () => confirmAnularCredito(creditoId);
    }
    if (btnRegistrarPago) {
        const canPay = credito.estado_credito === 'ACTIVO' || credito.estado_credito === 'MOROSO';
        btnRegistrarPago.style.display = canPay ? 'inline-flex' : 'none';
        
        // Aplicar color dinámico al botón según el estado INMEDIATAMENTE
        if (canPay) {
            btnRegistrarPago.style.setProperty('background', config.color, 'important');
            btnRegistrarPago.style.setProperty('background-color', config.color, 'important');
            btnRegistrarPago.style.setProperty('border-color', config.color, 'important');
            btnRegistrarPago.style.setProperty('color', '#FFFFFF', 'important');
        } else {
            // Resetear estilos si no puede pagar
            btnRegistrarPago.style.removeProperty('background');
            btnRegistrarPago.style.removeProperty('background-color');
            btnRegistrarPago.style.removeProperty('border-color');
            btnRegistrarPago.style.removeProperty('color');
        }

        btnRegistrarPago.onclick = () => openNextPaymentModal(creditoId, btnRegistrarPago);
    }

    // Cargar tabla de amortización
    loadAmortizacionTable(creditoId);

    // Abrir modal INMEDIATAMENTE
    openCreditosModal('ver-credito-modal');

    // Restaurar botón si existía
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

async function fetchCreditoAmortizacion(creditoId) {
    const supabase = window.getSupabaseClient();
    const { data: cuotas, error } = await supabase
        .from('ic_creditos_amortizacion')
        .select('*')
        .eq('id_credito', creditoId)
        .order('numero_cuota', { ascending: true });

    if (error) throw error;
    return cuotas || [];
}

function buildCreditoDebtSummary(cuotas = []) {
    const fechaCorte = getEcuadorDateString();
    const fechaLimite = parseDate(fechaCorte);

    if (fechaLimite) {
        fechaLimite.setHours(23, 59, 59, 999);
    }

    let cuotasVencidas = 0;
    let montoCuotasVencidas = 0;
    let moraTotalAcumulada = 0;

    cuotas.forEach(cuota => {
        const isNotPaid = cuota.estado_cuota !== 'PAGADO' && cuota.estado_cuota !== 'CONDONADO';
        const vencimiento = parseDate(cuota.fecha_vencimiento);

        if (isNotPaid && vencimiento && (!fechaLimite || vencimiento <= fechaLimite)) {
            cuotasVencidas += 1;
            montoCuotasVencidas += parseFloat(cuota.cuota_total || 0);
            moraTotalAcumulada += calcularMora(cuota.fecha_vencimiento).montoMora || 0;
        }
    });

    return {
        fechaCorte,
        cuotasVencidas,
        montoCuotasVencidas,
        moraTotalAcumulada,
        totalAlDia: montoCuotasVencidas + moraTotalAcumulada
    };
}

function updateCreditoPdfMeta(credito, fechaCorte = getEcuadorDateString()) {
    const codigoElem = document.getElementById('det-pdf-codigo');
    const socioElem = document.getElementById('det-pdf-socio');
    const corteElem = document.getElementById('det-pdf-fecha-corte');

    if (codigoElem) codigoElem.textContent = credito?.codigo_credito || '-';
    if (socioElem) socioElem.textContent = credito?.socio?.nombre || '-';
    if (corteElem) corteElem.textContent = formatDate(fechaCorte);
}

function updateCreditoDebtSummarySection(credito, debtSummary) {
    const morosoSection = document.getElementById('det-deuda-moroso-section');
    if (!morosoSection) return;

    if (debtSummary && debtSummary.cuotasVencidas > 0) {
        document.getElementById('det-monto-cuotas-vencidas').textContent = formatMoney(debtSummary.montoCuotasVencidas);
        document.getElementById('det-mora-acumulada-total').textContent = formatMoney(debtSummary.moraTotalAcumulada);
        document.getElementById('det-total-deuda-acumulada').textContent = formatMoney(debtSummary.totalAlDia);
        morosoSection.style.display = 'block';
    } else {
        morosoSection.style.display = 'none';
    }

    updateCreditoPdfMeta(credito, debtSummary?.fechaCorte || getEcuadorDateString());
}

// ==========================================
// TABLA DE AMORTIZACIÓN
// ==========================================
async function loadAmortizacionTable(creditoId) {
    const tbody = document.getElementById('amortizacion-table-body');
    const thead = document.querySelector('.amortizacion-table thead tr');
    tbody.innerHTML = '<tr><td colspan="12" class="text-center">Cargando...</td></tr>';

    try {
        const credito = currentViewingCredito;
        const isMoroso = credito && credito.estado_credito === 'MOROSO';

        // Ajustar el header de la tabla si es Moroso
        if (thead) {
            thead.innerHTML = `
                <th class="hide-mobile">#</th>
                <th>Fecha</th>
                <th class="hide-mobile">Capital</th>
                <th class="hide-mobile">Interés</th>
                <th class="hide-mobile">Cuota</th>
                <th class="hide-mobile">Ahorro</th>
                <th>Subtotal</th>
                ${isMoroso ? '<th class="text-danger" style="font-weight: 800;">Mora</th>' : ''}
                <th>Total</th>
                <th>Saldo</th>
                <th>Estado</th>
                <th>Acción</th>
            `;
        }

        const cuotas = await fetchCreditoAmortizacion(creditoId);

        if (!cuotas || cuotas.length === 0) {
            currentViewingAmortizacion = [];
            currentViewingDebtSummary = null;
            updateCreditoDebtSummarySection(credito, null);
            tbody.innerHTML = '<tr><td colspan="12" class="text-center">No hay datos de amortización</td></tr>';
            return;
        }

        currentViewingAmortizacion = cuotas;
        currentViewingDebtSummary = buildCreditoDebtSummary(cuotas);

        updateCreditoDebtSummarySection(credito, currentViewingDebtSummary);

        // Encontrar la última cuota pagada
        let lastPaidIndex = -1;
        for (let i = cuotas.length - 1; i >= 0; i--) {
            if (cuotas[i].estado_cuota === 'PAGADO') {
                lastPaidIndex = i;
                break;
            }
        }

        // La siguiente cuota pagable es la inmediatamente después de la última pagada
        const nextPayableIndex = lastPaidIndex + 1;

        tbody.innerHTML = cuotas.map((cuota, index) => {
            const moraInfo = calcularMora(cuota.fecha_vencimiento);
            const moraVal = (cuota.estado_cuota !== 'PAGADO' && cuota.estado_cuota !== 'CONDONADO') ? moraInfo.montoMora : 0;
            const estadoBadge = getEstadoCuotaBadge(cuota.estado_cuota, moraVal);

            // Solo habilitar botón para la siguiente cuota pagable
            const canPay = index === nextPayableIndex &&
                (cuota.estado_cuota === 'PENDIENTE' || cuota.estado_cuota === 'VENCIDO');

            let moraHtml = '';
            let valorTotalFinal = parseFloat(cuota.cuota_total);

            if (isMoroso) {
                valorTotalFinal += moraVal;
                moraHtml = `<td class="text-right text-danger" style="font-weight: 800;">${moraVal > 0 ? formatMoney(moraVal) : '-'}</td>`;
            }

            return `
                <tr class="${cuota.estado_cuota === 'PAGADO' ? 'row-paid' : ''}">
                    <td class="text-center hide-mobile">${cuota.numero_cuota}</td>
                    <td>${formatDateShort(cuota.fecha_vencimiento)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.pago_capital)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.pago_interes)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.cuota_base)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.ahorro_programado)}</td>
                    <td class="text-right">${formatMoney(cuota.cuota_total)}</td>
                    ${moraHtml}
                    <td class="text-right"><strong>${formatMoney(valorTotalFinal)}</strong></td>
                    <td class="text-right">${formatMoney(cuota.saldo_capital)}</td>
                    <td>${estadoBadge}</td>
                    <td>
                        ${canPay ? `<button class="btn-pagar-cuota" onclick="openPaymentModal('${cuota.id_detalle}', this)">
                            <i class="fas fa-dollar-sign"></i> <span>Pagar</span>
                        </button>` : 
                        (cuota.estado_cuota === 'PAGADO' ? 
                            `<button class="btn-view-payment" onclick="window.showReceiptDetail('${cuota.id_detalle}')" title="Ver Recibo" style="background: var(--success); color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-eye"></i>
                            </button>` : '<span class="text-muted">-</span>')
                        }
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading amortización:', error);
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-danger">Error al cargar datos</td></tr>';
    }
}

async function generateCreditoEstadoPDF() {
    if (!currentViewingCredito) {
        showToast('Primero abre un crédito para generar el PDF', 'warning');
        return;
    }

    const btnPdf = document.getElementById('btn-generar-estado-credito-pdf');
    const originalHtml = btnPdf ? btnPdf.innerHTML : '';

    try {
        if (!window.jspdf?.jsPDF) {
            throw new Error('La librería PDF no está disponible en esta vista');
        }

        if (btnPdf) {
            btnPdf.disabled = true;
            btnPdf.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
        }

        let cuotas = Array.isArray(currentViewingAmortizacion) ? [...currentViewingAmortizacion] : [];
        if (cuotas.length === 0) {
            cuotas = await fetchCreditoAmortizacion(currentViewingCredito.id_credito);
        }

        if (!cuotas.length) {
            throw new Error('No hay tabla de amortización disponible para este crédito');
        }

        currentViewingAmortizacion = cuotas;
        currentViewingDebtSummary = buildCreditoDebtSummary(cuotas);
        updateCreditoDebtSummarySection(currentViewingCredito, currentViewingDebtSummary);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const gap = 6;
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-EC');
        const timeStr = now.toLocaleTimeString('es-EC');
        const credito = currentViewingCredito;
        const socioNombre = credito.socio?.nombre || 'Socio';
        const estadoLabel = ESTADO_CONFIG[credito.estado_credito]?.label || credito.estado_credito || 'N/A';
        const cuotasPagadas = credito.cuotas_pagadas || 0;
        const progreso = `${cuotasPagadas}/${credito.plazo}`;
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        const drawInfoCards = (items, startY, fillColor = [248, 250, 252], borderColor = [226, 232, 240], textColor = [15, 23, 42]) => {
            const cols = 4;
            const cardWidth = (pageWidth - (margin * 2) - (gap * (cols - 1))) / cols;
            const cardHeight = 18;

            items.forEach((item, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                const x = margin + (col * (cardWidth + gap));
                const y = startY + (row * (cardHeight + gap));

                doc.setFillColor(...fillColor);
                doc.setDrawColor(...borderColor);
                doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(item.label.toUpperCase(), x + 4, y + 6);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...textColor);
                const valueLines = doc.splitTextToSize(item.value, cardWidth - 8);
                doc.text(valueLines.slice(0, 2), x + 4, y + 12);
            });

            return startY + (Math.ceil(items.length / cols) * (cardHeight + gap));
        };

        try {
            doc.addImage(logoUrl, 'PNG', margin, 10, 18, 18);
        } catch (e) {
            console.warn('Logo no disponible para PDF de crédito');
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(11, 78, 50);
        doc.text('INKA CORP', margin + 23, 17);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text('ESTADO DE PAGOS DEL CRÉDITO', margin + 23, 23);

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generado: ${dateStr} | ${timeStr}`, pageWidth - margin, 17, { align: 'right' });
        doc.text(`Fecha de corte: ${formatDate(currentViewingDebtSummary.fechaCorte)}`, pageWidth - margin, 22, { align: 'right' });

        doc.setDrawColor(242, 187, 58);
        doc.setLineWidth(0.5);
        doc.line(margin, 30, pageWidth - margin, 30);

        let yPos = 36;
        yPos = drawInfoCards([
            { label: 'Código', value: credito.codigo_credito || '-' },
            { label: 'Socio', value: socioNombre },
            { label: 'Estado', value: estadoLabel },
            { label: 'Progreso', value: `${progreso} cuotas` },
            { label: 'Capital', value: formatMoney(credito.capital) },
            { label: 'Cuota Base', value: formatMoney(credito.cuota_base) },
            { label: 'Cuota Total', value: formatMoney(credito.cuota_con_ahorro) },
            { label: 'Ahorro Cobrado', value: formatMoney((credito.ahorro_programado_cuota || 0) * cuotasPagadas) }
        ], yPos);

        if (currentViewingDebtSummary.cuotasVencidas > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(185, 28, 28);
            doc.text('RESUMEN PARA ESTAR AL DÍA', margin, yPos + 2);

            yPos = drawInfoCards([
                { label: 'Cuotas Vencidas', value: `${currentViewingDebtSummary.cuotasVencidas} cuota(s)` },
                { label: 'Capital Exigible', value: formatMoney(currentViewingDebtSummary.montoCuotasVencidas) },
                { label: 'Mora Acumulada', value: formatMoney(currentViewingDebtSummary.moraTotalAcumulada) },
                { label: 'Total Para Ponerse al Día', value: formatMoney(currentViewingDebtSummary.totalAlDia) }
            ], yPos + 6, [254, 242, 242], [248, 113, 113], [127, 29, 29]);
        }

        const tableData = cuotas.map(cuota => {
            const isNotPaid = cuota.estado_cuota !== 'PAGADO' && cuota.estado_cuota !== 'CONDONADO';
            const moraInfo = isNotPaid ? calcularMora(cuota.fecha_vencimiento) : { montoMora: 0, diasMora: 0 };
            const totalFinal = parseFloat(cuota.cuota_total || 0) + moraInfo.montoMora;
            const estadoPdf = moraInfo.montoMora > 0 && ['PENDIENTE', 'VENCIDO', 'PARCIAL'].includes(cuota.estado_cuota)
                ? `ATRASADO ${moraInfo.diasMora}D`
                : cuota.estado_cuota;

            return [
                cuota.numero_cuota,
                formatDateShort(cuota.fecha_vencimiento),
                formatMoney(cuota.pago_capital),
                formatMoney(cuota.pago_interes),
                formatMoney(cuota.cuota_base),
                formatMoney(cuota.ahorro_programado),
                formatMoney(cuota.cuota_total),
                formatMoney(moraInfo.montoMora),
                formatMoney(totalFinal),
                formatMoney(cuota.saldo_capital),
                estadoPdf
            ];
        });

        doc.autoTable({
            startY: yPos + 4,
            head: [['#', 'VENCIMIENTO', 'CAPITAL', 'INTERÉS', 'CUOTA', 'AHORRO', 'SUBTOTAL', 'MORA', 'TOTAL', 'SALDO', 'ESTADO']],
            body: tableData,
            theme: 'striped',
            styles: { fontSize: 7.2, cellPadding: 2.2, valign: 'middle' },
            headStyles: {
                fillColor: [11, 78, 50],
                textColor: [242, 187, 58],
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { halign: 'center', cellWidth: 24 },
                2: { halign: 'right', cellWidth: 21 },
                3: { halign: 'right', cellWidth: 21 },
                4: { halign: 'right', cellWidth: 21 },
                5: { halign: 'right', cellWidth: 19 },
                6: { halign: 'right', cellWidth: 21 },
                7: { halign: 'right', cellWidth: 17 },
                8: { halign: 'right', cellWidth: 21, fontStyle: 'bold' },
                9: { halign: 'right', cellWidth: 21 },
                10: { halign: 'center', cellWidth: 24 }
            },
            margin: { left: margin, right: margin },
            didParseCell: function(data) {
                if (data.section !== 'body') return;

                if (data.column.index === 7 && data.cell.raw !== '$0.00') {
                    data.cell.styles.textColor = [185, 28, 28];
                    data.cell.styles.fontStyle = 'bold';
                }

                if (data.column.index === 10) {
                    const value = String(data.cell.raw || '');
                    if (value.startsWith('ATRASADO')) {
                        data.cell.styles.fillColor = [254, 226, 226];
                        data.cell.styles.textColor = [153, 27, 27];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (value === 'PAGADO') {
                        data.cell.styles.fillColor = [220, 252, 231];
                        data.cell.styles.textColor = [21, 128, 61];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (value === 'PENDIENTE') {
                        data.cell.styles.fillColor = [254, 249, 195];
                        data.cell.styles.textColor = [133, 77, 14];
                    }
                }
            },
            didDrawPage: function() {
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${doc.internal.getNumberOfPages()}`, margin, pageHeight - 8);
                doc.text('Sistema Administrativo INKA CORP', pageWidth - margin, pageHeight - 8, { align: 'right' });
            }
        });

        const safeCodigo = String(credito.codigo_credito || 'CREDITO').replace(/[^a-zA-Z0-9_-]+/g, '_');
        const safeSocio = String(socioNombre || 'SOCIO').replace(/[^a-zA-Z0-9_-]+/g, '_');
        doc.save(`Estado_Credito_${safeCodigo}_${safeSocio}.pdf`);
        showToast('Estado PDF generado exitosamente', 'success');
    } catch (error) {
        console.error('Error generando PDF del crédito:', error);
        Swal.fire('Error', error.message || 'No se pudo generar el PDF del crédito', 'error');
    } finally {
        if (btnPdf) {
            btnPdf.disabled = false;
            btnPdf.innerHTML = originalHtml || '<i class="fas fa-file-arrow-down"></i> Generar PDF';
        }
    }
}

/**
 * Muestra el detalle de un pago realizado (Recibo)
 */
async function showReceiptDetail(detalleId) {
    const modal = document.getElementById('ver-pago-detalle-modal');
    const content = document.getElementById('pago-detalle-content');
    
    if (!modal || !content) return;
    
    // Usar función estandarizada para abrir modales
    openCreditosModal('ver-pago-detalle-modal');

    content.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i>
            <p style="margin-top: 1rem;">Cargando detalle del pago...</p>
        </div>
    `;

    try {
        const supabase = window.getSupabaseClient();
        
        // Consultar el pago siguiendo la cadena de llaves foráneas: 
        // ic_creditos_pagos -> ic_creditos_amortizacion -> ic_creditos -> ic_socios
        // Se añade cobrador:ic_users!cobrado_por para especificar la relación exacta
        const { data: pago, error } = await supabase
            .from('ic_creditos_pagos')
            .select(`
                *,
                cobrador:ic_users!cobrado_por ( id, nombre ),
                amortizacion:ic_creditos_amortizacion (
                    id_detalle,
                    numero_cuota,
                    credito:ic_creditos (
                        codigo_credito,
                        socio:ic_socios (
                            nombre
                        )
                    )
                )
            `)
            .eq('id_detalle', detalleId)
            .maybeSingle();

        if (error) throw error;
        
        if (!pago) {
            content.innerHTML = '<div class="alert alert-warning">No se encontró información del pago.</div>';
            return;
        }

        const infoSocio = pago.amortizacion?.credito?.socio?.nombre || '---';
        const infoCredito = pago.amortizacion?.credito?.codigo_credito || '---';
        const infoCobrador = pago.cobrador?.nombre || 'Administrador (Sync)';
        const numCuota = pago.amortizacion?.numero_cuota || '-';

        content.innerHTML = `
            <div class="receipt-luxury" style="font-family: 'Inter', sans-serif; color: var(--white); background: var(--gray-900); padding: 10px;">
                <div style="text-align: center; margin-bottom: 20px; position: relative;">
                    <div style="width: 50px; height: 2px; background: var(--gold); margin: 0 auto 10px;"></div>
                    <div style="font-size: 0.75rem; color: var(--gold); letter-spacing: 2px; font-weight: 700; text-transform: uppercase;">Certificado de Pago</div>
                    <div style="font-size: 1.4rem; font-weight: 800; color: var(--white); margin: 5px 0;">${infoCredito}</div>
                    <div style="display: inline-block; background: var(--gray-800); color: var(--gold); padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; border: 1px solid var(--border-color);">
                        Cuota #${numCuota}
                    </div>
                </div>

                <div style="background: var(--gray-800); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);">
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--gray-400); font-size: 0.9rem;"><i class="fas fa-user-circle" style="width: 20px;"></i> Socio</span>
                            <span style="font-weight: 700; color: var(--white);">${infoSocio}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--gray-400); font-size: 0.9rem;"><i class="fas fa-user-shield" style="width: 20px;"></i> Recibido por</span>
                            <span style="font-weight: 600; color: var(--gray-300); font-size: 0.9rem;">${infoCobrador}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--gray-400); font-size: 0.9rem;"><i class="fas fa-calendar-check" style="width: 20px;"></i> Fecha de Pago</span>
                            <span style="font-weight: 600; color: var(--gray-200);">${formatDateShort(pago.fecha_pago)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--gray-400); font-size: 0.9rem;"><i class="fas fa-wallet" style="width: 20px;"></i> Método</span>
                            <span style="display: flex; align-items: center; gap: 5px; font-weight: 600; color: var(--gray-200);">
                                <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
                                ${pago.metodo_pago}
                            </span>
                        </div>
                        
                        <div style="margin: 10px 0; border-top: 1px dashed var(--border-color);"></div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 5px;">
                            <span style="font-weight: 800; color: var(--white); font-size: 1rem;">Monto Total</span>
                            <span style="font-size: 1.6rem; font-weight: 900; color: #10b981; letter-spacing: -0.5px;">$${pago.monto_pagado.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                ${pago.referencia_pago ? `
                    <div style="background: var(--gray-800); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px;">
                        <div style="background: var(--gray-700); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--gray-400);">
                            <i class="fas fa-hashtag"></i>
                        </div>
                        <div>
                            <div style="font-size: 0.7rem; color: var(--gray-500); text-transform: uppercase; font-weight: 600;">Referencia</div>
                            <div style="font-size: 0.9rem; font-weight: 600; color: var(--gray-200);">${pago.referencia_pago}</div>
                        </div>
                    </div>
                ` : ''}

                ${pago.observaciones ? `
                    <div style="background: var(--gray-800); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px 16px; margin-bottom: 20px;">
                        <div style="font-size: 0.7rem; color: var(--gold); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Observaciones</div>
                        <div style="font-size: 0.85rem; line-height: 1.5; color: var(--gray-300); font-style: italic;">"${pago.observaciones}"</div>
                    </div>
                ` : ''}

                ${pago.comprobante_url ? `
                    <div style="margin-top: 20px;">
                        <div style="font-size: 0.75rem; color: var(--gray-400); font-weight: 600; text-transform: uppercase; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                            <span>Archivo Adjunto</span>
                            <a href="${pago.comprobante_url}" target="_blank" style="color: var(--gold); text-decoration: none; font-size: 0.7rem;">Ver original <i class="fas fa-external-link-alt"></i></a>
                        </div>
                        <div style="border-radius: 16px; overflow: hidden; border: 1px solid var(--border-color); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.4);">
                            <img src="${pago.comprobante_url}" style="width: 100%; height: auto; display: block;" 
                                 onerror="this.src='https://placehold.co/600x400?text=Error+al+cargar+imagen&bg=1f2937&fg=ffffff'; this.style.opacity='0.5';" alt="Recibo">
                        </div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px; border: 2px dashed var(--border-color); border-radius: 16px; color: var(--gray-500);">
                        <i class="fas fa-image" style="font-size: 1.5rem; margin-bottom: 8px; opacity: 0.5;"></i>
                        <p style="font-size: 0.8rem; margin: 0;">No se adjuntó comprobante digital</p>
                    </div>
                `}
                
                <div style="text-align: center; margin-top: 30px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <p style="font-size: 0.7rem; color: var(--gray-600);">ID Pago: ${pago.id_pago}</p>
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--gray-500); display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <img src="img/icon-192.png" style="height: 14px; opacity: 0.3;" onerror="this.style.display='none'">
                        INKA CORP SISTEMAS
                    </div>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('Error al cargar recibo:', err);
        content.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    }
}

// Exponer globalmente para el onclick de la tabla
window.showReceiptDetail = showReceiptDetail;

function getEstadoCuotaBadge(estado, moraVal = 0) {
    if ((estado === 'PENDIENTE' || estado === 'VENCIDO' || estado === 'PARCIAL') && moraVal > 0) {
        return '<span class="badge badge-atrasado">Atrasado</span>';
    }
    const badges = {
        'PAGADO': '<span class="badge badge-pagado">Pagado</span>',
        'PENDIENTE': '<span class="badge badge-pendiente">Pendiente</span>',
        'VENCIDO': '<span class="badge badge-vencido">Vencido</span>',
        'PARCIAL': '<span class="badge badge-pendiente">Parcial</span>',
        'CONDONADO': '<span class="badge badge-cancelado">Condonado</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// MODAL DE PAGO
// ==========================================

// Obtener cuotas consecutivas impagadas
async function getConsecutiveUnpaidInstallments(creditoId, startDetalleId) {
    try {
        const supabase = window.getSupabaseClient();

        // Obtener todas las cuotas del crédito
        const { data: allCuotas, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_credito', creditoId)
            .order('numero_cuota', { ascending: true });

        if (error) throw error;

        // Encontrar el índice de la cuota inicial
        const startIndex = allCuotas.findIndex(c => c.id_detalle === startDetalleId);

        if (startIndex === -1) return [];

        // Obtener cuotas consecutivas impagadas
        const consecutive = [];
        for (let i = startIndex; i < allCuotas.length; i++) {
            if (allCuotas[i].estado_cuota === 'PENDIENTE' || allCuotas[i].estado_cuota === 'VENCIDO') {
                consecutive.push(allCuotas[i]);
            } else {
                break; // Detener al encontrar una cuota pagada
            }
        }

        return consecutive;

    } catch (error) {
        console.error('Error getting consecutive installments:', error);
        return [];
    }
}

async function openPaymentModal(detalleId, btn = null) {
    // Validar estado de caja antes de abrir el modal
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('PAGO DE CUOTA')) return;
    }

    let originalContent = '';
    if (btn) {
        originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    try {
        const supabase = window.getSupabaseClient();

        // Obtener la cuota inicial
        const { data: cuota, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_detalle', detalleId)
            .single();

        if (error) throw error;

        currentViewingCuota = cuota;

        // Obtener cuotas consecutivas impagadas
        currentUnpaidInstallments = await getConsecutiveUnpaidInstallments(
            currentViewingCredito.id_credito,
            detalleId
        );

        // Llenar info del crédito y socio (nuevos campos)
        const codigoElem = document.getElementById('pago-credito-codigo');
        const socioElem = document.getElementById('pago-socio-nombre');
        if (codigoElem) codigoElem.textContent = currentViewingCredito.codigo_credito || '-';
        if (socioElem) socioElem.textContent = currentViewingCredito.socio?.nombre || 'Socio';

        // Función para actualizar mora y total
        const actualizarMoraYTotal = () => {
            const fechaPagoInput = document.getElementById('pago-fecha').value;
            const count = parseInt(document.getElementById('pago-cuotas-select').value) || 1;
            const cuotasSeleccionadas = currentUnpaidInstallments.slice(0, count);

            // Calcular monto base
            const montoBase = cuotasSeleccionadas.reduce(
                (sum, c) => sum + parseFloat(c.cuota_total), 0
            );

            // Calcular mora total
            const { totalMora, cuotasConMora } = calcularMoraMultiple(cuotasSeleccionadas, fechaPagoInput);

            // Actualizar UI de mora
            const moraRow = document.getElementById('pago-mora-row');
            const diasMoraElem = document.getElementById('pago-dias-mora');
            const montoMoraElem = document.getElementById('pago-monto-mora');

            if (totalMora > 0) {
                if (moraRow) moraRow.style.display = 'flex';
                const totalDias = cuotasConMora.reduce((sum, c) => sum + c.diasMora, 0);
                if (diasMoraElem) diasMoraElem.textContent = totalDias;
                if (montoMoraElem) montoMoraElem.textContent = formatMoney(totalMora);
            } else {
                if (moraRow) moraRow.style.display = 'none';
            }

            // Actualizar total
            const totalFinal = montoBase + totalMora;
            const totalElem = document.getElementById('pago-total-final');
            if (totalElem) totalElem.textContent = formatMoney(totalFinal);

            // Actualizar cuota base
            const montoCuotaElem = document.getElementById('pago-monto-cuota');
            if (montoCuotaElem) montoCuotaElem.textContent = formatMoney(montoBase);

            // Manejo de Convenio dinámico
            const isConvenio = document.getElementById('pago-convenio-toggle').checked;
            const hintContainer = document.getElementById('pago-monto-min-hint');
            const hintValue = document.getElementById('pago-monto-min-valor');
            const obsInput = document.getElementById('pago-observaciones');
            const montoInput = document.getElementById('pago-monto');

            if (isConvenio) {
                if (hintContainer) hintContainer.style.display = 'block';
                if (hintValue) hintValue.textContent = formatMoney(montoBase);
                
                let montoPagar = parseFloat(montoInput.value) || 0;

                // Solo forzar el valor base automáticamente si el usuario NO está escribiendo en este campo.
                // Si el usuario cambia las cuotas, el foco estará en el select y se ajustará.
                if (document.activeElement !== montoInput) {
                    if (montoPagar < (montoBase - 0.01)) {
                        montoPagar = montoBase;
                        montoInput.value = montoBase.toFixed(2);
                    }
                }
                
                const descuentMora = totalFinal - montoPagar;
                
                if (obsInput) {
                    obsInput.value = `[CONVENIO DE PAGO] Orig. Total: ${formatMoney(totalFinal)} | Pagado: ${formatMoney(montoPagar)} | Descto: ${formatMoney(descuentMora)}.`.trim();
                }
            } else {
                if (hintContainer) hintContainer.style.display = 'none';
                if (obsInput && !obsInput.readOnly) {
                    // Solo limpiar si no es convenio (si es convenio ya lo manejamos arriba)
                }
                montoInput.value = totalFinal.toFixed(2);
            }

            // Actualizar fecha de vencimiento (última cuota seleccionada)
            const lastCuota = cuotasSeleccionadas[cuotasSeleccionadas.length - 1];
            const fechaVencElem = document.getElementById('pago-fecha-vencimiento');
            if (fechaVencElem) fechaVencElem.textContent = formatDate(lastCuota.fecha_vencimiento);
        };

        // Poblar el dropdown de selección de cuotas
        const select = document.getElementById('pago-cuotas-select');
        const hoyStr = getEcuadorDateString();
        const hoy = parseDate(hoyStr);
        if (hoy) hoy.setHours(23, 59, 59, 999);

        select.innerHTML = currentUnpaidInstallments.map((cuotaActual, idx) => {
            const count = idx + 1;
            const endNum = currentUnpaidInstallments[0].numero_cuota + idx;
            const total = currentUnpaidInstallments.slice(0, count).reduce(
                (sum, c) => sum + parseFloat(c.cuota_total), 0
            );

            // Determinar si la cuota de este índice está vencida para resaltar en rojo
            const vencimiento = parseDate(cuotaActual.fecha_vencimiento);
            const isVencida = vencimiento && (vencimiento <= hoy);
            const style = isVencida ? ' style="color: #EF4444; font-weight: 800;"' : '';
            const fechaStr = formatDate(cuotaActual.fecha_vencimiento);

            if (count === 1) {
                return `<option value="${count}"${style}>Cuota #${cuotaActual.numero_cuota} (${fechaStr}) - ${formatMoney(total)}</option>`;
            } else {
                return `<option value="${count}"${style}>Cuotas #${currentUnpaidInstallments[0].numero_cuota} - #${endNum} (${count}) [Vence: ${fechaStr}] - ${formatMoney(total)}</option>`;
            }
        }).join('');

        // Configurar listener para cambio de selección de cuotas
        select.onchange = actualizarMoraYTotal;

        // Configurar listener para cambio de fecha de pago
        const fechaInput = document.getElementById('pago-fecha');
        fechaInput.onchange = actualizarMoraYTotal;

        // Configurar listener para cambio de monto manual (solo para convenio)
        const montoInput = document.getElementById('pago-monto');
        montoInput.oninput = actualizarMoraYTotal;
        montoInput.onblur = () => {
            const isConvenio = document.getElementById('pago-convenio-toggle').checked;
            if (isConvenio) {
                const count = parseInt(document.getElementById('pago-cuotas-select').value) || 1;
                const cuotasSeleccionadas = currentUnpaidInstallments.slice(0, count);
                const montoBase = cuotasSeleccionadas.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
                const valorActual = parseFloat(montoInput.value) || 0;
                
                if (valorActual < (montoBase - 0.01)) { // Tolerancia centavos
                    Swal.fire({
                        title: 'Monto fuera de rango',
                        text: `No puedes cobrar un monto menor a la cuota base ($${formatMoney(montoBase)}).`,
                        icon: 'warning',
                        confirmButtonText: 'Aceptar',
                        confirmButtonColor: '#0B4E32'
                    }).then(() => {
                        montoInput.value = montoBase.toFixed(2);
                        actualizarMoraYTotal();
                    });
                }
            }
        };

        // Configurar listener para Convenio de Pago
        const convenioToggle = document.getElementById('pago-convenio-toggle');
        const obsInput = document.getElementById('pago-observaciones');
        convenioToggle.checked = false;
        if (obsInput) obsInput.readOnly = false; // Reset al abrir

        convenioToggle.onchange = async () => {
            if (convenioToggle.checked) {
                const result = await Swal.fire({
                    title: '¿Activar Convenio de Pago?',
                    text: 'Esto permitirá registrar un monto inferior al total calculado. El sistema redactará la observación automáticamente.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, activar',
                    cancelButtonText: 'No, cancelar',
                    confirmButtonColor: '#0B4E32'
                });

                if (result.isConfirmed) {
                    if (obsInput) {
                        obsInput.readOnly = true;
                        obsInput.style.backgroundColor = "#f8f9fa";
                    }
                    actualizarMoraYTotal();
                    document.getElementById('pago-monto').focus();
                    document.getElementById('pago-monto').select();
                } else {
                    convenioToggle.checked = false;
                }
            } else {
                if (obsInput) {
                    obsInput.readOnly = false;
                    obsInput.value = "";
                    obsInput.style.backgroundColor = "";
                }
            }
        };

        // Establecer fecha de pago inicial (fecha de Ecuador)
        const ecuadorDate = getEcuadorDateString();
        fechaInput.value = ecuadorDate;

        // Llenar información inicial
        document.getElementById('pago-referencia').value = '';
        document.getElementById('pago-observaciones').value = '';

        // Resetear comprobante
        clearComprobantePreview();

        // Calcular mora inicial
        actualizarMoraYTotal();

        // Configurar botón confirmar
        const btnConfirmar = document.getElementById('btn-confirmar-pago');
        resetConfirmPaymentButton(btnConfirmar);
        btnConfirmar.onclick = () => confirmarPago();

        // Abrir modal
        openCreditosModal('registrar-pago-modal');


    } catch (error) {
        console.error('Error opening payment modal:', error);
        showToast('Error al cargar datos de la cuota', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

async function openNextPaymentModal(creditoId, btn = null) {
    if (btn) {
        btn.disabled = true;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }
    try {
        const supabase = window.getSupabaseClient();
        const { data: cuotas, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_credito', creditoId)
            .in('estado_cuota', ['PENDIENTE', 'VENCIDO'])
            .order('numero_cuota', { ascending: true })
            .limit(1);

        if (error) throw error;

        if (!cuotas || cuotas.length === 0) {
            showToast('No hay cuotas pendientes de pago', 'info');
            return;
        }

        await openPaymentModal(cuotas[0].id_detalle);

    } catch (error) {
        console.error('Error finding next payment:', error);
        showToast('Error al buscar cuota pendiente', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalHtml;
        }
    }
}

// ==========================================
// CONFIRMAR PAGO
// ==========================================
async function confirmarPago() {
    if (!currentViewingCuota || !currentViewingCredito) {
        showToast('Error: No hay datos de pago', 'error');
        return;
    }

    const btnConfirmar = document.getElementById('btn-confirmar-pago');
    setConfirmPaymentButtonState(btnConfirmar, {
        tone: 'processing',
        text: 'Procesando pago...',
        icon: 'fas fa-spinner fa-spin',
        disabled: true
    });

    try {
        const supabase = window.getSupabaseClient();
        const user = window.currentUser || (typeof getCurrentUser === 'function' ? getCurrentUser() : null);

        const fechaPago = document.getElementById('pago-fecha').value;
        const montoPagado = parseFloat(document.getElementById('pago-monto').value);
        const metodoPago = document.getElementById('pago-metodo').value;
        const referencia = document.getElementById('pago-referencia').value;
        const observaciones = document.getElementById('pago-observaciones').value;
        
        const isConvenio = document.getElementById('pago-convenio-toggle').checked;

        // Limpiar estilos previos
        const fieldsToValidate = [
            { id: 'pago-fecha', value: fechaPago },
            { id: 'pago-monto', value: isNaN(montoPagado) ? '' : montoPagado },
            { id: 'pago-metodo', value: metodoPago },
            { id: 'pago-referencia', value: referencia }
        ];

        let hasError = false;
        fieldsToValidate.forEach(f => {
            const el = document.getElementById(f.id);
            if (!f.value || f.value <= 0 || (typeof f.value === 'string' && f.value.trim() === '')) {
                el.style.border = '2px solid #ef4444';
                el.classList.add('error-pulse');
                hasError = true;
            } else {
                el.style.border = '';
                el.classList.remove('error-pulse');
            }
        });

        // Validar comprobante obligatorio (Resaltar siempre si falta)
        const uploadContainer = document.getElementById('pago-comprobante-dropzone');
        if (!selectedComprobanteFile) {
            if (uploadContainer) {
                uploadContainer.style.border = '2px solid #ef4444';
                uploadContainer.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                uploadContainer.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.2)';
            }
            hasError = true;
        } else {
            if (uploadContainer) {
                uploadContainer.style.border = '';
                uploadContainer.style.backgroundColor = '';
                uploadContainer.style.boxShadow = '';
            }
        }

        if (hasError) {
            Swal.fire({
                title: 'Información Requerida',
                text: 'Por favor complete todos los campos resaltados en rojo y suba la evidencia del comprobante.',
                icon: 'warning'
            });
            resetConfirmPaymentButton(btnConfirmar);
            return;
        }

        // Obtener cantidad de cuotas seleccionadas
        const cantidadCuotas = parseInt(document.getElementById('pago-cuotas-select').value);
        const cuotasAPagar = currentUnpaidInstallments.slice(0, cantidadCuotas);

        // Calcular mora total para la validación (usando la fecha de pago seleccionada)
        const { totalMora, cuotasConMora } = calcularMoraMultiple(cuotasAPagar, fechaPago);

        // Validar que el monto coincida (Base + Mora)
        const montoBase = cuotasAPagar.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
        const totalEsperado = montoBase + totalMora;

        if (isConvenio && montoPagado < montoBase) {
            if (window.Swal) {
                await Swal.fire({
                    title: 'Monto Insuficiente',
                    text: `No puedes cobrar un monto menor a la cuota base ($${formatMoney(montoBase)}).`,
                    icon: 'warning',
                    confirmButtonText: 'Aceptar',
                    confirmButtonColor: '#0B4E32'
                });
                const inputMonto = document.getElementById('pago-monto');
                if (inputMonto) {
                    inputMonto.value = montoBase.toFixed(2);
                    // Disparar actualización de nota
                    actualizarMoraYTotal();
                }
            } else {
                showToast(`No puedes cobrar un monto menor a la cuota base ($${formatMoney(montoBase)})`, 'warning');
            }
            resetConfirmPaymentButton(btnConfirmar);
            return;
        }

        if (!isConvenio && Math.abs(montoPagado - totalEsperado) > 0.01) {
            showToast('El monto no coincide. Esperado: ' + formatMoney(totalEsperado) + ' (Base: ' + formatMoney(montoBase) + ' + Mora: ' + formatMoney(totalMora) + ')', 'warning');
            resetConfirmPaymentButton(btnConfirmar);
            return;
        }

        // Preparar observaciones con detalle de mora si existe
        let obsFinal = observaciones;
        if (isConvenio) {
            const descuento = totalEsperado - montoPagado;
            obsFinal = `[CONVENIO DE PAGO] Orig. Total: $${totalEsperado.toFixed(2)} | Pagado: $${montoPagado.toFixed(2)} | Descto: $${descuento.toFixed(2)}. ${obsFinal}`.trim();
        } else if (totalMora > 0) {
            const detalleMora = cuotasConMora
                .filter(c => c.estaEnMora)
                .map(c => `Cuota #${c.numero_cuota}: ${c.diasMora}d x $2 = $${c.montoMora.toFixed(2)}`)
                .join(', ');
            obsFinal = `${observaciones} | MORA TOTAL: $${totalMora.toFixed(2)} (${detalleMora})`.trim();
        }

        // Subir comprobante a Storage (una sola vez para todos los pagos)
        setConfirmPaymentButtonState(btnConfirmar, {
            tone: 'processing',
            text: 'Subiendo comprobante...',
            icon: 'fas fa-spinner fa-spin',
            disabled: true
        });
        const uploadResult = await uploadReceiptToStorage(
            selectedComprobanteFile,
            currentViewingCredito.id_credito,
            cuotasAPagar[0].numero_cuota
        );

        if (!uploadResult.success) {
            showToast('Error al subir comprobante: ' + uploadResult.error, 'error');
            resetConfirmPaymentButton(btnConfirmar);
            return;
        }

        const comprobanteUrl = uploadResult.url;
        console.log('Comprobante subido:', comprobanteUrl);

        // Procesar cada cuota
        const montoBaseCalculado = cuotasAPagar.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
        const excedenteConvenio = isConvenio ? (montoPagado - montoBaseCalculado) : 0;
        
        for (let i = 0; i < cuotasConMora.length; i++) {
            const infoCuota = cuotasConMora[i];
            
            // El usuario ingresa un monto total ("Monto a Registrar"). 
            // Si hay convenio, la regla es: cobramos la base para todas las cuotas, 
            // y el excedente sobre esa base se registra todo en la primera cuota.
            let montoParaRegistro;
            const cuotaBaseVal = parseFloat(infoCuota.cuota_total || 0);
            const cuotaMoraVal = parseFloat(infoCuota.montoMora || 0);

            if (isConvenio) {
                montoParaRegistro = (i === 0) ? (cuotaBaseVal + excedenteConvenio) : cuotaBaseVal;
            } else {
                montoParaRegistro = (cantidadCuotas === 1) ? montoPagado : (cuotaBaseVal + cuotaMoraVal);
            }

            // Validar que el monto a registrar sea mayor a 0 para evitar errores de restricción en DB
            if (montoParaRegistro <= 0) {
                console.warn(`Saltando cuota #${infoCuota.numero_cuota} con monto 0`);
                continue; 
            }

            // 1. Registrar el pago
            const { error: errorPago } = await supabase
                .from('ic_creditos_pagos')
                .insert({
                    id_detalle: infoCuota.id_detalle,
                    id_credito: currentViewingCredito.id_credito,
                    fecha_pago: fechaPago,
                    monto_pagado: montoParaRegistro,
                    metodo_pago: metodoPago,
                    referencia_pago: referencia,
                    observaciones: obsFinal,
                    comprobante_url: comprobanteUrl,
                    cobrado_por: (user?.id) || null
                });

            if (errorPago) throw errorPago;

            // 2. Actualizar estado de la cuota
            const { error: errorCuota } = await supabase
                .from('ic_creditos_amortizacion')
                .update({
                    estado_cuota: 'PAGADO',
                    requiere_cobro: false,
                    recordatorio_enviado: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id_detalle', infoCuota.id_detalle);

            if (errorCuota) throw errorCuota;

            // 3. Actualizar ahorro a ACUMULADO
            const { error: errorAhorro } = await supabase
                .from('ic_creditos_ahorro')
                .update({
                    estado: 'ACUMULADO',
                    updated_at: new Date().toISOString()
                })
                .eq('id_credito', currentViewingCredito.id_credito)
                .eq('numero_cuota', infoCuota.numero_cuota);

            if (errorAhorro) console.error('Error updating ahorro:', errorAhorro);
        }

        // 4. Actualizar contador de cuotas pagadas y mora en el crédito
        const nuevasCuotasPagadas = (currentViewingCredito.cuotas_pagadas || 0) + cantidadCuotas;

        // Decrementar el contador de cuotas en mora si las cuotas pagadas estaban vencidas
        const cuotasPagadasEnMora = cuotasConMora.filter(c => c.estaEnMora).length;
        const cuotasEnMoraAnterior = currentViewingCredito.cuotas_en_mora || 0;
        const nuevasCuotasEnMora = Math.max(0, cuotasEnMoraAnterior - cuotasPagadasEnMora);

        const nuevoEstadoCredito = nuevasCuotasPagadas >= currentViewingCredito.plazo ? 'CANCELADO' : 'ACTIVO';

        const { error: errorCredito } = await supabase
            .from('ic_creditos')
            .update({
                cuotas_pagadas: nuevasCuotasPagadas,
                cuotas_en_mora: nuevasCuotasEnMora,
                estado_credito: nuevoEstadoCredito,
                updated_at: new Date().toISOString()
            })
            .eq('id_credito', currentViewingCredito.id_credito);

        if (errorCredito) throw errorCredito;

        // ==========================================
        // NOTIFICACIONES (SISTEMA DE PRODUCCIÓN)
        // ==========================================
        try {
            // Reusar la lógica de construcción de datos para el recibo
            const fechaRegistro = formatEcuadorDateTime();
            const cuotasPagadasActualizado = nuevasCuotasPagadas - cantidadCuotas; // Estado previo al commit de hoy

            const reciboData = {
                socioNombre: currentViewingCredito.socio?.nombre || 'Socio',
                socioCedula: currentViewingCredito.socio?.cedula || 'N/A',
                codigoCredito: currentViewingCredito.codigo_credito,
                capitalTotal: currentViewingCredito.capital,
                plazo: currentViewingCredito.plazo,
                montoBase: montoBase,
                totalMora: totalMora,
                montoPagado: montoPagado,
                fechaPago: fechaPago,
                fechaRegistro: fechaRegistro,
                metodoPago: metodoPago,
                cantidadCuotas: cantidadCuotas,
                cuotasPagadasAntes: cuotasPagadasActualizado,
                estaEnMora: totalMora > 0,
                cuotas: cuotasConMora.map(c => ({
                    numero: c.numero_cuota,
                    monto: parseFloat(c.cuota_total),
                    estado: c.estaEnMora ? 'EN MORA' : 'A TIEMPO',
                    fechaVencimiento: c.fecha_vencimiento,
                    diasMora: c.diasMora,
                    montoMora: c.montoMora,
                    estaEnMora: c.estaEnMora
                }))
            };

            let image_base64;
            let message;

            setConfirmPaymentButtonState(btnConfirmar, {
                tone: 'processing',
                text: 'Generando comprobante...',
                icon: 'fas fa-receipt',
                disabled: true
            });

            if (cantidadCuotas === 1) {
                const cuota = cuotasConMora[0];
                reciboData.numeroCuota = cuota.numero_cuota;
                reciboData.fechaVencimiento = cuota.fecha_vencimiento;
                reciboData.diasMora = cuota.diasMora;
                reciboData.estaEnMora = cuota.estaEnMora;
                reciboData.estadoCuota = cuota.estaEnMora ? 'EN MORA' : 'A TIEMPO';

                image_base64 = await generateReceiptCanvas(reciboData);

                let moraTexto = cuota.estaEnMora ? `\n⚠️ *MORA:* ${cuota.diasMora} días × $2 = ${formatMoney(cuota.montoMora)}` : '';
                message = `¡HOLA ${reciboData.socioNombre.toUpperCase()}! 👋\n\n✅ *PAGO REGISTRADO EXITOSAMENTE*\n\nMuchas gracias por realizar tu pago de cuota ${reciboData.numeroCuota} de ${reciboData.plazo}, te informamos que ha sido registrado correctamente.\n\n📋 *DETALLES DEL PAGO:*\n━━━━━━━━━━━━━━━\n🔢 Cuota: ${reciboData.numeroCuota} de ${reciboData.plazo}\n📊 Estado: ${reciboData.estadoCuota}${moraTexto}\n💰 *TOTAL PAGADO:* ${formatMoney(montoPagado)}\n━━━━━━━━━━━━━━━\n📅 Fecha de pago: ${formatDate(fechaPago)}\n🕐 Registrado: ${fechaRegistro}\n💳 Método: ${metodoPago}\n\n📈 *PROGRESO:* ${nuevasCuotasPagadas}/${reciboData.plazo} cuotas pagadas\n\n🏦 _INKA CORP - Tu confianza, nuestro compromiso_`;
            } else {
                image_base64 = await generateMultiQuotaReceiptCanvas(reciboData);
                const listaCuotas = cuotasConMora.map(c => `  • Cuota ${c.numero_cuota}: ${formatMoney(c.cuota_total + c.montoMora)}`).join('\n');
                let moraTexto = totalMora > 0 ? `\n⚠️ *MORA TOTAL:* ${formatMoney(totalMora)}` : '';
                message = `¡HOLA ${reciboData.socioNombre.toUpperCase()}! 👋\n\n✅ *PAGO MÚLTIPLE REGISTRADO*\n\nMuchas gracias por adelantar ${cantidadCuotas} cuotas de tu crédito. Tu pago ha sido registrado correctamente.\n\n📋 *DETALLE DE CUOTAS PAGADAS:*\n━━━━━━━━━━━━━━━\n${listaCuotas}\n━━━━━━━━━━━━━━━\n💵 Subtotal cuotas: ${formatMoney(montoBase)}${moraTexto}\n💰 *TOTAL PAGADO:* ${formatMoney(montoPagado)}\n━━━━━━━━━━━━━━━\n📅 Fecha de pago: ${formatDate(fechaPago)}\n🕐 Registrado: ${fechaRegistro}\n💳 Método: ${metodoPago}\n\n📈 *PROGRESO:* ${nuevasCuotasPagadas}/${reciboData.plazo} cuotas pagadas\n\n🏦 _INKA CORP - Tu confianza, nuestro compromiso_`;
            }

            const whatsapp = currentViewingCredito.socio?.whatsapp || '';
            setConfirmPaymentButtonState(btnConfirmar, {
                tone: 'processing',
                text: 'Enviando notificación al socio...',
                icon: 'fas fa-spinner fa-spin',
                disabled: true
            });

            const socioNotificationPayload = {
                whatsapp: whatsapp,
                image_base64: image_base64,
                message: message
            };

            const socioWebhookResult = await sendImageNotificationWebhook(socioNotificationPayload);

            const detailList = cantidadCuotas === 1
                ? `🔢 Cuota: ${reciboData.numeroCuota} de ${reciboData.plazo}\n📊 Estado: ${reciboData.estadoCuota}${totalMora > 0 ? ` (Mora: ${formatMoney(totalMora)})` : ''}`
                : `🔢 Cuotas pagadas: ${cantidadCuotas}\n💰 Detalle: ${montoBase.toFixed(2)}${totalMora > 0 ? ` + Mora: ${totalMora.toFixed(2)}` : ''}`;

            const socioNotificationSuccess = socioWebhookResult.success;

            setConfirmPaymentButtonState(btnConfirmar, {
                tone: socioNotificationSuccess ? 'success' : 'error',
                text: socioNotificationSuccess ? 'Notificación al socio exitosa' : 'Notificación al socio fallida',
                icon: socioNotificationSuccess ? 'fas fa-check-circle' : 'fas fa-exclamation-circle',
                disabled: true
            });
            await waitMilliseconds(900);

            const socioStatusMessage = socioNotificationSuccess
                ? 'Te comentamos que el socio ya ha sido notificado correctamente vía WhatsApp. ✅'
                : 'Atención: el intento de notificación directa al socio por WhatsApp no se completó correctamente. ⚠️';

            const ownerMessage = `JOSÉ KLEVER NISHVE CORO se ha registrado el pago de un crédito con los siguientes detalles:\n\n👤 Socio: ${reciboData.socioNombre.toUpperCase()}\n🆔 Cédula: ${reciboData.socioCedula}\n📑 Crédito: ${reciboData.codigoCredito}\n${detailList}\n💵 TOTAL RECIBIDO: ${formatMoney(montoPagado)}\n📅 Fecha Pago: ${formatDate(fechaPago)}\n🕐 Registro: ${fechaRegistro}\n💳 Método: ${metodoPago}\n\n${socioStatusMessage}`;

            await waitRandomNotificationDelay((remainingSeconds) => {
                setConfirmPaymentButtonState(btnConfirmar, {
                    tone: 'processing',
                    text: `Esperando ${remainingSeconds} s para enviar a Jose...`,
                    icon: 'fas fa-hourglass-half',
                    disabled: true
                });
            });

            setConfirmPaymentButtonState(btnConfirmar, {
                tone: 'processing',
                text: 'Enviando notificación a José...',
                icon: 'fas fa-spinner fa-spin',
                disabled: true
            });

            const joseWebhookResult = await sendImageNotificationWebhook({
                whatsapp: '19175309618',
                image_base64: image_base64,
                message: ownerMessage
            });

            setConfirmPaymentButtonState(btnConfirmar, {
                tone: joseWebhookResult.success ? 'success' : 'error',
                text: joseWebhookResult.success ? 'Notificación a José exitosa' : 'Notificación a José fallida',
                icon: joseWebhookResult.success ? 'fas fa-check-circle' : 'fas fa-exclamation-circle',
                disabled: true
            });
            await waitMilliseconds(900);
        } catch (errorNotif) {
            console.error('Error en el sistema de notificaciones:', errorNotif);
            setConfirmPaymentButtonState(btnConfirmar, {
                tone: 'error',
                text: 'Error en notificaciones',
                icon: 'fas fa-exclamation-circle',
                disabled: true
            });
            await waitMilliseconds(900);
            // No bloqueamos el flujo principal si fallan las notificaciones
        }

        // Cerrar modal y recargar
        closeCreditosModal('registrar-pago-modal');
        showToast('Pago de ' + cantidadCuotas + ' cuota' + (cantidadCuotas > 1 ? 's' : '') + ' registrado exitosamente', 'success');

        // Recargar datos
        await loadCreditos();
        await loadAmortizacionTable(currentViewingCredito.id_credito);

        // Actualizar datos del modal principal
        const creditoActualizado = allCreditos.find(c => c.id_credito === currentViewingCredito.id_credito);
        if (creditoActualizado) {
            currentViewingCredito = creditoActualizado;
            // Actualizar progreso
            const cuotasPagadas = creditoActualizado.cuotas_pagadas || 0;
            const progresoPct = Math.round((cuotasPagadas / creditoActualizado.plazo) * 100);
            document.getElementById('det-progreso-text').textContent = `${cuotasPagadas}/${creditoActualizado.plazo} cuotas`;
            document.getElementById('det-progreso-pct').textContent = `${progresoPct}%`;
            document.getElementById('det-progreso-bar').style.width = `${progresoPct}%`;

            // Actualizar ahorro
            const ahorroAcumulado = creditoActualizado.ahorro_programado_cuota * cuotasPagadas;
            document.getElementById('det-ahorro-acumulado').textContent = formatMoney(ahorroAcumulado);
            document.getElementById('det-ahorro-pendiente').textContent = formatMoney(creditoActualizado.ahorro_programado_total - ahorroAcumulado);
        }

    } catch (error) {
        console.error('Error al registrar pago:', error);
        if (window.showFinancialError) {
            await window.showFinancialError(error, 'No se pudo registrar el pago del crédito.');
        } else {
            showAlert('Error al registrar el pago: ' + (error.message || error), 'Error', 'error');
        }
        resetConfirmPaymentButton(btnConfirmar);
    }
}

function setConfirmPaymentButtonState(button, { tone = 'default', text = 'Confirmar Pago', icon = 'fas fa-check-circle', disabled = false } = {}) {
    if (!button) return;

    const styles = {
        default: {
            background: '',
            borderColor: '',
            color: '',
            boxShadow: ''
        },
        processing: {
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            borderColor: '#1d4ed8',
            color: '#ffffff',
            boxShadow: '0 10px 24px rgba(37, 99, 235, 0.28)'
        },
        success: {
            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            borderColor: '#15803d',
            color: '#ffffff',
            boxShadow: '0 10px 24px rgba(22, 163, 74, 0.28)'
        },
        error: {
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            borderColor: '#b91c1c',
            color: '#ffffff',
            boxShadow: '0 10px 24px rgba(220, 38, 38, 0.28)'
        }
    };

    const selectedStyle = styles[tone] || styles.default;
    button.disabled = disabled;
    button.innerHTML = `<i class="${icon}"></i> ${text}`;
    button.style.background = selectedStyle.background;
    button.style.borderColor = selectedStyle.borderColor;
    button.style.color = selectedStyle.color;
    button.style.boxShadow = selectedStyle.boxShadow;
}

function resetConfirmPaymentButton(button) {
    setConfirmPaymentButtonState(button, {
        tone: 'default',
        text: 'Confirmar Pago',
        icon: 'fas fa-check-circle',
        disabled: false
    });
}

function waitMilliseconds(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

function formatNotificationDelaySeconds(delayMs) {
    return Math.max(1, Math.ceil(delayMs / 1000));
}

async function waitRandomNotificationDelay(updateStatus, minMs = 2000, maxMs = 6000) {
    const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    let remainingMs = delayMs;

    while (remainingMs > 0) {
        if (typeof updateStatus === 'function') {
            updateStatus(formatNotificationDelaySeconds(remainingMs));
        }

        const chunkMs = Math.min(1000, remainingMs);
        await waitMilliseconds(chunkMs);
        remainingMs -= chunkMs;
    }

    return delayMs;
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    return '$' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

window.generateCreditoEstadoPDF = generateCreditoEstadoPDF;

/**
 * Función para anular un crédito por error humano
 * @param {string} creditoId 
 */
async function confirmAnularCredito(creditoId) {
    const credito = allCreditos.find(c => c.id_credito === creditoId);
    if (!credito) return;

    const { value: reason } = await Swal.fire({
        title: '¿Anular este crédito?',
        text: "Esta acción marcará el crédito como ANULADO. No se borrará del historial, pero ya no estará activo para pagos.",
        icon: 'warning',
        input: 'textarea',
        inputPlaceholder: 'Indique el motivo de la anulación (Ej: Monto incorrecto, socio desistió...)',
        inputAttributes: {
            'aria-label': 'Motivo de anulación'
        },
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'SÍ, ANULAR CRÉDITO',
        cancelButtonText: 'CANCELAR',
        inputValidator: (value) => {
            if (!value) {
                return '¡Debe ingresar un motivo para la anulación!';
            }
        }
    });

    if (reason) {
        try {
            showLoader('Anulando crédito...');
            const supabase = window.getSupabaseClient();
            
            // Actualizar el estado del crédito y guardar el motivo en observaciones o un campo de auditoría
            const { error } = await supabase
                .from('ic_creditos')
                .update({ 
                    estado_credito: 'ANULADO',
                    observaciones: (credito.observaciones ? credito.observaciones + '\n' : '') + `[ANULACIÓN ${getEcuadorDateString()}]: ${reason}`
                })
                .eq('id_credito', creditoId);

            if (error) throw error;

            showToast('Crédito anulado exitosamente', 'success');
            closeCreditosModal('ver-credito-modal');
            
            // Refrescar datos
            if (typeof refreshCreditosCache === 'function') {
                await refreshCreditosCache();
            } else {
                await loadCreditos();
            }
        } catch (error) {
            console.error('Error al anular crédito:', error);
            showToast('Nose pudo anular el crédito', 'error');
        } finally {
            hideLoader();
        }
    }
}

function showErrorMessage(message) {
    console.error(message);
    // Implementar toast o notificación si está disponible
}

// Debounce helper
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

/**
 * Obtiene la fecha/hora actual en zona horaria Ecuador
 * @returns {Date} Fecha actual en Ecuador
 */
function getEcuadorNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
}

/**
 * Obtiene la fecha actual de Ecuador como string YYYY-MM-DD
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
function getEcuadorDateString() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { // format yyyy-mm-dd
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(now);
}

/**
 * Formatea fecha/hora actual de Ecuador para mostrar
 * @returns {string} Fecha y hora formateada
 */
function formatEcuadorDateTime() {
    return new Date().toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Calcula la mora para una cuota vencida
 * @param {string} fechaVencimiento - Fecha de vencimiento de la cuota (YYYY-MM-DD)
 * @param {string} fechaPago - Fecha en que se realiza el pago (YYYY-MM-DD). Si es null, usa fecha actual.
 * @param {number} costoPorDia - Costo por día de mora (default: $2)
 * @returns {Object} { diasMora, montoMora, estaEnMora }
 */
function calcularMora(fechaVencimiento, fechaPago = null, costoPorDia = 2) {
    if (!fechaVencimiento) {
        return { diasMora: 0, montoMora: 0, estaEnMora: false };
    }

    // Fecha de pago (o fecha actual si no se especifica)
    const fechaPagoDate = fechaPago
        ? parseDate(fechaPago)
        : getEcuadorNow();

    // Fecha de vencimiento
    const fechaVencDate = parseDate(fechaVencimiento);

    if (!fechaPagoDate || !fechaVencDate) {
        return { diasMora: 0, montoMora: 0, estaEnMora: false };
    }

    // Calcular diferencia en días
    const diffTime = fechaPagoDate.getTime() - fechaVencDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        // Pago a tiempo o anticipado
        return { diasMora: 0, montoMora: 0, estaEnMora: false };
    }

    return {
        diasMora: diffDays,
        montoMora: diffDays * costoPorDia,
        estaEnMora: true
    };
}

/**
 * Calcula mora total para múltiples cuotas
 * @param {Array} cuotas - Array de cuotas con fecha_vencimiento
 * @param {string} fechaPago - Fecha de pago
 * @param {number} costoPorDia - Costo por día de mora
 * @returns {Object} { totalMora, cuotasConMora }
 */
function calcularMoraMultiple(cuotas, fechaPago = null, costoPorDia = 2) {
    let totalMora = 0;
    const cuotasConMora = cuotas.map(cuota => {
        const mora = calcularMora(cuota.fecha_vencimiento, fechaPago, costoPorDia);
        totalMora += mora.montoMora;
        return {
            ...cuota,
            ...mora
        };
    });

    return { totalMora, cuotasConMora };
}

// ==========================================
// MANEJO DE COMPROBANTE DE PAGO
// ==========================================

/**
 * Maneja la selección de archivo de comprobante
 * Muestra preview de la imagen
 */
function handleComprobanteSelect(input) {
    const file = input.files[0];
    if (!file) return;

    // Quitar error visual si existía
    const dropzone = document.getElementById('pago-comprobante-dropzone');
    if (dropzone) {
        dropzone.style.border = '';
        dropzone.style.backgroundColor = '';
    }

    // Validar que sea imagen
    if (!file.type.startsWith('image/')) {
        showToast('Por favor seleccione una imagen', 'warning');
        input.value = '';
        return;
    }

    selectedComprobanteFile = file;

    // Mostrar preview
    const controls = document.getElementById('pago-upload-controls');
    const previewWrapper = document.getElementById('pago-preview-wrapper');
    const previewImg = document.getElementById('pago-comprobante-preview');

    if (controls && previewWrapper && previewImg) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            controls.classList.add('hidden');
            previewWrapper.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    console.log(`Comprobante seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
}

/**
 * Limpia el preview y resetea el archivo de comprobante
 */
function clearComprobantePreview() {
    selectedComprobanteFile = null;

    const controls = document.getElementById('pago-upload-controls');
    const previewWrapper = document.getElementById('pago-preview-wrapper');
    const previewImg = document.getElementById('pago-comprobante-preview');
    const cameraInput = document.getElementById('pago-comprobante-camera');
    const galleryInput = document.getElementById('pago-comprobante-gallery');

    if (controls) controls.classList.remove('hidden');
    if (previewWrapper) previewWrapper.classList.add('hidden');
    if (previewImg) previewImg.src = '';
    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
}

// ==========================================
// WEBHOOK DE PAGO CON RECIBO CANVAS
// ==========================================

/**
 * Genera una imagen de recibo de pago usando Canvas
 * @param {Object} data - Datos del pago
 * @returns {Promise<string>} - Imagen en formato base64
 */
async function generateReceiptCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Dimensiones del recibo
        canvas.width = 600;
        canvas.height = 750;

        // Cargar logo
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => {
            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Barra superior verde
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#0B4E32');
            gradient.addColorStop(1, '#146E3A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, 110);

            // Dibujar logo (izquierda del encabezado)
            const logoSize = 60;
            const logoX = 30;
            const logoY = 25;
            ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

            // Título INKA CORP (al lado del logo)
            ctx.fillStyle = '#F2BB3A';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('INKA CORP', logoX + logoSize + 15, 55);

            // Subtítulo
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '13px Arial';
            ctx.fillText('COMPROBANTE DE PAGO', logoX + logoSize + 15, 80);

            finishDrawing();
        };

        logo.onerror = () => {
            // Si falla la carga del logo, dibujar sin él
            console.warn('No se pudo cargar el logo, dibujando sin él');

            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Barra superior verde
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#0B4E32');
            gradient.addColorStop(1, '#146E3A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, 100);

            // Título INKA CORP (centrado si no hay logo)
            ctx.fillStyle = '#F2BB3A';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('INKA CORP', canvas.width / 2, 55);

            // Subtítulo
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px Arial';
            ctx.fillText('COMPROBANTE DE PAGO', canvas.width / 2, 80);

            finishDrawing();
        };

        function finishDrawing() {

            // Fecha y hora
            const now = new Date();
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(now.toLocaleString('es-EC', {
                timeZone: 'America/Guayaquil',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }), canvas.width - 30, 130);

            // Línea decorativa
            ctx.strokeStyle = '#E2E8F0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(30, 150);
            ctx.lineTo(canvas.width - 30, 150);
            ctx.stroke();

            // Sección SOCIO
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('SOCIO', 30, 180);

            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 22px Arial';
            ctx.fillText(data.socioNombre || 'N/A', 30, 210);

            ctx.fillStyle = '#64748B';
            ctx.font = '14px Arial';
            ctx.fillText('Cédula: ' + (data.socioCedula || 'N/A'), 30, 235);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(30, 260);
            ctx.lineTo(canvas.width - 30, 260);
            ctx.stroke();

            // Sección CRÉDITO
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('CRÉDITO', 30, 290);

            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(data.codigoCredito || 'N/A', 30, 318);

            // Grid de información
            const infoY = 350;
            const colWidth = (canvas.width - 60) / 2;

            // Columna 1: Capital
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('CAPITAL TOTAL', 30, infoY);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(formatMoney(data.capitalTotal), 30, infoY + 22);

            // Columna 2: Plazo
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('PLAZO', 30 + colWidth, infoY);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(data.plazo + ' meses', 30 + colWidth, infoY + 22);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(30, infoY + 50);
            ctx.lineTo(canvas.width - 30, infoY + 50);
            ctx.stroke();

            // Sección DETALLES DEL PAGO (caja destacada)
            const pagoBoxY = infoY + 70;
            const boxHeight = data.estaEnMora ? 240 : 200;
            ctx.fillStyle = 'rgba(11, 78, 50, 0.08)';
            ctx.beginPath();
            ctx.roundRect(30, pagoBoxY, canvas.width - 60, boxHeight, 15);
            ctx.fill();

            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('DETALLES DEL PAGO', 50, pagoBoxY + 30);

            // Cuota
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('CUOTA', 50, pagoBoxY + 60);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(`${data.numeroCuota} de ${data.plazo}`, 50, pagoBoxY + 82);

            // Estado
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText('ESTADO', canvas.width - 50, pagoBoxY + 60);

            // Badge de estado (basado en mora)
            const estadoColor = data.estaEnMora ? '#EF4444' : '#10B981';
            const estadoText = data.estaEnMora ? `MORA (${data.diasMora}d)` : 'A TIEMPO';
            ctx.fillStyle = estadoColor;
            ctx.font = 'bold 14px Arial';
            ctx.fillText(estadoText, canvas.width - 50, pagoBoxY + 82);

            // Si hay mora, mostrar detalle
            let yOffset = 0;
            if (data.estaEnMora && data.totalMora > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = '#EF4444';
                ctx.font = '12px Arial';
                ctx.fillText(`⚠️ Mora: ${data.diasMora} días × $2 = ${formatMoney(data.totalMora)}`, canvas.width / 2, pagoBoxY + 105);
                yOffset = 25;
            }

            // Monto pagado (grande y destacado)
            ctx.textAlign = 'center';
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('TOTAL PAGADO', canvas.width / 2, pagoBoxY + 120 + yOffset);

            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 42px Arial';
            ctx.fillText(formatMoney(data.montoPagado), canvas.width / 2, pagoBoxY + 170 + yOffset);

            // Información adicional (fechas y método)
            const adicionalY = pagoBoxY + boxHeight + 20;
            ctx.textAlign = 'left';

            // Fila 1: Fechas
            const col3Width = (canvas.width - 60) / 3;

            // Fecha de pago
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('FECHA DE PAGO', 30, adicionalY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(formatDate(data.fechaPago), 30, adicionalY + 16);

            // Fecha de registro
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('REGISTRADO', 30 + col3Width, adicionalY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '12px Arial';
            ctx.fillText(data.fechaRegistro || formatEcuadorDateTime(), 30 + col3Width, adicionalY + 16);

            // Método
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('MÉTODO', 30 + col3Width * 2, adicionalY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(data.metodoPago || 'N/A', 30 + col3Width * 2, adicionalY + 16);

            // Pie de página
            ctx.fillStyle = '#94A3B8';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Este comprobante fue generado automáticamente por INKA CORP', canvas.width / 2, canvas.height - 40);
            ctx.fillText('Guarda este comprobante como respaldo de tu pago', canvas.width / 2, canvas.height - 22);

            // Convertir a base64
            const base64 = canvas.toDataURL('image/png');
            console.log('Recibo generado como imagen base64');
            resolve(base64);
        }
    });
}

/**
 * Envía el webhook de notificación de pago
 * @param {Object} payload - Datos a enviar
 */
async function sendPaymentWebhook(payload) {
    return sendImageNotificationWebhook(payload);
}


/**
 * Genera un recibo para pago de múltiples cuotas usando Canvas
 * @param {Object} data - Datos del pago con múltiples cuotas
 * @returns {Promise<string>} - Imagen en formato base64
 */
async function generateMultiQuotaReceiptCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Altura dinámica según cantidad de cuotas
        const baseHeight = 650;
        const cuotaRowHeight = 35;
        const extraHeight = Math.max(0, (data.cuotas.length - 3) * cuotaRowHeight);
        canvas.width = 600;
        canvas.height = baseHeight + extraHeight;

        // Cargar logo
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => {
            drawReceipt(true);
        };

        logo.onerror = () => {
            console.warn('No se pudo cargar el logo');
            drawReceipt(false);
        };

        function drawReceipt(withLogo) {
            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Barra superior verde
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#0B4E32');
            gradient.addColorStop(1, '#146E3A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, 110);

            if (withLogo) {
                ctx.drawImage(logo, 30, 25, 60, 60);
                ctx.fillStyle = '#F2BB3A';
                ctx.font = 'bold 32px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('INKA CORP', 105, 55);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '13px Arial';
                ctx.fillText('PAGO DE MÚLTIPLES CUOTAS', 105, 80);
            } else {
                ctx.fillStyle = '#F2BB3A';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('INKA CORP', canvas.width / 2, 55);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '14px Arial';
                ctx.fillText('PAGO DE MÚLTIPLES CUOTAS', canvas.width / 2, 80);
            }

            // Badge de cantidad de cuotas
            ctx.fillStyle = '#F2BB3A';
            ctx.beginPath();
            ctx.roundRect(canvas.width - 100, 35, 70, 40, 10);
            ctx.fill();
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${data.cantidadCuotas}`, canvas.width - 65, 55);
            ctx.font = 'bold 11px Arial';
            ctx.fillText('CUOTAS', canvas.width - 65, 68);

            // Fecha y hora
            const now = new Date();
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(now.toLocaleString('es-EC', {
                timeZone: 'America/Guayaquil',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }), canvas.width - 30, 130);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(30, 145);
            ctx.lineTo(canvas.width - 30, 145);
            ctx.stroke();

            // Sección SOCIO
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('SOCIO', 30, 170);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 20px Arial';
            ctx.fillText(data.socioNombre || 'N/A', 30, 195);
            ctx.fillStyle = '#64748B';
            ctx.font = '13px Arial';
            ctx.fillText('Cédula: ' + (data.socioCedula || 'N/A') + '  |  Crédito: ' + (data.codigoCredito || 'N/A'), 30, 218);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(30, 235);
            ctx.lineTo(canvas.width - 30, 235);
            ctx.stroke();

            // Tabla de cuotas
            let tableY = 255;

            // Header de tabla (añadir columna MORA)
            ctx.fillStyle = 'rgba(11, 78, 50, 0.1)';
            ctx.fillRect(30, tableY, canvas.width - 60, 30);
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('CUOTA', 50, tableY + 20);
            ctx.textAlign = 'center';
            ctx.fillText('ESTADO', canvas.width * 0.4, tableY + 20);
            ctx.fillText('MORA', canvas.width * 0.6, tableY + 20);
            ctx.textAlign = 'right';
            ctx.fillText('SUBTOTAL', canvas.width - 50, tableY + 20);

            tableY += 35;

            // Filas de cuotas (con mora)
            ctx.font = '12px Arial';
            data.cuotas.forEach((cuota, idx) => {
                // Fondo alternado
                if (idx % 2 === 0) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
                    ctx.fillRect(30, tableY - 5, canvas.width - 60, cuotaRowHeight);
                }

                // Cuota
                ctx.textAlign = 'left';
                ctx.fillStyle = '#0F172A';
                ctx.font = 'bold 12px Arial';
                ctx.fillText(`Cuota ${cuota.numero}`, 50, tableY + 15);

                // Estado con color (basado en mora)
                ctx.textAlign = 'center';
                const estadoColor = cuota.estaEnMora ? '#EF4444' : '#10B981';
                const estadoTexto = cuota.estaEnMora ? `Mora ${cuota.diasMora}d` : 'A tiempo';
                ctx.fillStyle = estadoColor;
                ctx.font = 'bold 11px Arial';
                ctx.fillText(estadoTexto, canvas.width * 0.4, tableY + 15);

                // Mora
                ctx.fillStyle = cuota.estaEnMora ? '#EF4444' : '#64748B';
                ctx.font = '11px Arial';
                const moraText = cuota.estaEnMora ? formatMoney(cuota.montoMora) : '$0.00';
                ctx.fillText(moraText, canvas.width * 0.6, tableY + 15);

                // Subtotal (cuota + mora)
                ctx.textAlign = 'right';
                ctx.fillStyle = '#0F172A';
                ctx.font = '12px Arial';
                const subtotal = cuota.monto + (cuota.montoMora || 0);
                ctx.fillText(formatMoney(subtotal), canvas.width - 50, tableY + 15);

                tableY += cuotaRowHeight;
            });

            // Línea antes del total
            ctx.strokeStyle = '#0B4E32';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(30, tableY + 5);
            ctx.lineTo(canvas.width - 30, tableY + 5);
            ctx.stroke();

            // Si hay mora, mostrar subtotal + mora = total
            if (data.totalMora > 0) {
                tableY += 20;

                // Subtotal cuotas
                ctx.textAlign = 'left';
                ctx.fillStyle = '#64748B';
                ctx.font = '12px Arial';
                ctx.fillText('Subtotal cuotas:', 50, tableY + 10);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#0F172A';
                ctx.fillText(formatMoney(data.montoBase), canvas.width - 50, tableY + 10);

                tableY += 20;

                // Total mora
                ctx.textAlign = 'left';
                ctx.fillStyle = '#EF4444';
                ctx.font = 'bold 12px Arial';
                ctx.fillText('⚠️ Total mora:', 50, tableY + 10);
                ctx.textAlign = 'right';
                ctx.fillText(formatMoney(data.totalMora), canvas.width - 50, tableY + 10);

                tableY += 15;
            }

            // TOTAL
            tableY += 20;
            ctx.fillStyle = 'rgba(11, 78, 50, 0.08)';
            ctx.beginPath();
            ctx.roundRect(30, tableY, canvas.width - 60, 50, 10);
            ctx.fill();

            ctx.textAlign = 'left';
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 16px Arial';
            ctx.fillText('TOTAL PAGADO', 50, tableY + 32);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(formatMoney(data.montoPagado), canvas.width - 50, tableY + 35);

            // Información adicional (3 columnas: Fecha pago, Registrado, Método)
            tableY += 70;
            const col3Width = (canvas.width - 60) / 3;
            ctx.textAlign = 'left';

            // Fecha de pago
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('FECHA DE PAGO', 30, tableY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(formatDate(data.fechaPago), 30, tableY + 16);

            // Fecha de registro
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('REGISTRADO', 30 + col3Width, tableY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '11px Arial';
            ctx.fillText(data.fechaRegistro || formatEcuadorDateTime(), 30 + col3Width, tableY + 16);

            // Método
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('MÉTODO', 30 + col3Width * 2, tableY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(data.metodoPago || 'N/A', 30 + col3Width * 2, tableY + 16);

            // Pie de página
            ctx.fillStyle = '#94A3B8';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Este comprobante fue generado automáticamente por INKA CORP', canvas.width / 2, canvas.height - 30);
            ctx.fillText('Guarda este comprobante como respaldo de tu pago', canvas.width / 2, canvas.height - 14);

            // Convertir a base64
            const base64 = canvas.toDataURL('image/png');
            console.log('Recibo multicuota generado como imagen base64');
            resolve(base64);
        }
    });
}

/**
 * Genera una imagen de aviso de pago para el administrador
 */
async function generateNoticeCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 750;

        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => { draw('withLogo'); };
        logo.onerror = () => { draw('noLogo'); };

        function draw(mode) {
            // Fondo blanco con borde verde
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#0B4E32';
            ctx.lineWidth = 15;
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // Barra superior de "AVISO"
            ctx.fillStyle = '#C2410C'; // Color naranja fuerte para aviso
            ctx.fillRect(15, 15, canvas.width - 30, 90);

            if (mode === 'withLogo') {
                ctx.drawImage(logo, 40, 30, 60, 60);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('AVISO DE PAGO', 120, 65);
                ctx.font = '14px Arial';
                ctx.fillText('NOTIFICACIÓN DE REGISTRO', 120, 85);
            } else {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 40px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('AVISO DE PAGO', canvas.width / 2, 70);
            }

            // Datos del socio
            ctx.fillStyle = '#0F172A';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(data.socioNombre.toUpperCase(), canvas.width / 2, 160);
            ctx.font = '16px Arial';
            ctx.fillStyle = '#475569';
            ctx.fillText('Ha registrado el pago de una cuota', canvas.width / 2, 190);

            // Caja de detalles
            ctx.fillStyle = '#F8FAFC';
            ctx.beginPath();
            ctx.roundRect(50, 220, canvas.width - 100, 380, 20);
            ctx.fill();
            ctx.strokeStyle = '#E2E8F0';
            ctx.stroke();

            // Detalles
            const startY = 270;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#64748B';
            ctx.font = '14px Arial';

            const fields = [
                { label: 'CÓDIGO CRÉDITO:', value: data.codigoCredito },
                { label: 'NÚMERO CUOTA:', value: `${data.numeroCuota} de ${data.plazo}` },
                { label: 'ESTADO:', value: data.estaEnMora ? 'CON MORA' : 'A TIEMPO' },
                { label: 'MONTO BASE:', value: formatMoney(data.montoBase) },
                { label: 'MORA:', value: formatMoney(data.totalMora) },
                { label: 'MONTO PAGADO:', value: formatMoney(data.montoPagado), color: '#0B4E32', size: 'bold 22px' },
                { label: 'FECHA PAGO:', value: formatDate(data.fechaPago) },
                { label: 'MÉTODO:', value: data.metodoPago }
            ];

            fields.forEach((f, i) => {
                ctx.fillStyle = '#64748B';
                ctx.font = 'bold 13px Arial';
                ctx.fillText(f.label, 80, startY + (i * 45));

                ctx.fillStyle = f.color || '#0F172A';
                ctx.font = f.size || 'bold 16px Arial';
                ctx.fillText(f.value, 250, startY + (i * 45));
            });

            // Footer aviso
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('El socio ya ha sido notificado vía WhatsApp', canvas.width / 2, 650);

            ctx.fillStyle = '#94A3B8';
            ctx.font = 'italic 12px Arial';
            ctx.fillText('Generado por el sistema de INKA CORP', canvas.width / 2, 710);

            resolve(canvas.toDataURL('image/png'));
        }
    });
}

/**
 * Genera una imagen de aviso de multicuota para el administrador
 */
async function generateMultiQuotaNoticeCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 850;

        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => { draw('withLogo'); };
        logo.onerror = () => { draw('noLogo'); };

        function draw(mode) {
            // Fondo blanco con borde verde
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#0B4E32';
            ctx.lineWidth = 15;
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // Barra superior de "AVISO"
            ctx.fillStyle = '#C2410C';
            ctx.fillRect(15, 15, canvas.width - 30, 90);

            if (mode === 'withLogo') {
                ctx.drawImage(logo, 40, 30, 60, 60);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('AVISO MULTIPAGO', 120, 65);
                ctx.font = '14px Arial';
                ctx.fillText('REPORTE DE MULTICUOTAS', 120, 85);
            }

            ctx.fillStyle = '#0F172A';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(data.socioNombre.toUpperCase(), canvas.width / 2, 160);
            ctx.font = '16px Arial';
            ctx.fillStyle = '#475569';
            ctx.fillText(`Ha registrado el pago de ${data.cantidadCuotas} cuotas`, canvas.width / 2, 190);

            // Caja de detalles
            ctx.fillStyle = '#F8FAFC';
            ctx.beginPath();
            ctx.roundRect(50, 220, canvas.width - 100, 520, 20);
            ctx.fill();

            // Lista resumida de cuotas
            let y = 260;
            ctx.textAlign = 'left';
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#0B4E32';
            ctx.fillText('RESUMEN DE CUOTAS:', 80, y);
            y += 30;

            const cuotasAMostrar = data.cuotas.slice(0, 8);
            cuotasAMostrar.forEach((c, i) => {
                ctx.fillStyle = '#475569';
                ctx.font = '13px Arial';
                const moraPart = c.estaEnMora ? ` (+ mora ${formatMoney(c.montoMora)})` : '';
                ctx.fillText(`• Cuota ${c.numero}: ${formatMoney(c.monto)}${moraPart}`, 80, y + (i * 25));
            });

            if (data.cuotas.length > 8) {
                ctx.fillText(`... y ${data.cuotas.length - 8} cuotas más`, 80, y + (8 * 25));
            }

            // Totales
            const totalsY = 530;
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(80, totalsY);
            ctx.lineTo(520, totalsY);
            ctx.stroke();

            const finalFields = [
                { label: 'MONTO BASE:', value: formatMoney(data.montoBase) },
                { label: 'MORA TOTAL:', value: formatMoney(data.totalMora) },
                { label: 'TOTAL PAGADO:', value: formatMoney(data.montoPagado), color: '#0B4E32', size: 'bold 24px' },
                { label: 'FECHA PAGO:', value: formatDate(data.fechaPago) },
                { label: 'REGISTRADO:', value: data.fechaRegistro }
            ];

            finalFields.forEach((f, i) => {
                ctx.fillStyle = '#64748B';
                ctx.font = 'bold 13px Arial';
                ctx.fillText(f.label, 80, totalsY + 30 + (i * 40));
                ctx.fillStyle = f.color || '#0F172A';
                ctx.font = f.size || 'bold 16px Arial';
                ctx.fillText(f.value, 250, totalsY + 30 + (i * 40));
            });

            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('El socio ya ha sido notificado vía WhatsApp', canvas.width / 2, 780);

            resolve(canvas.toDataURL('image/png'));
        }
    });
}

/**
 * Envía el segundo webhook al administrador (Jose)
 */
async function sendOwnerWebhook(payload) {
    return sendImageNotificationWebhook(payload);
}

/**
 * Envía el webhook de notificación de imágenes a n8n (Copia de respaldo/procesamiento)
 */
async function sendImageNotificationWebhook(payload) {
    const WEBHOOK_URL_N8N = 'https://lpn8nwebhook.luispintasolutions.com/webhook/notificarimagenes';

    try {
        console.log('Enviando notificación de imagen a n8n:', WEBHOOK_URL_N8N);
        const response = await fetch(WEBHOOK_URL_N8N, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { success: true };
    } catch (error) {
        console.error('Error enviando notificación a n8n:', error);
        return { success: false, error: error.message };
    }
}

// Exponer funciones necesarias al scope global
window.generateReceiptCanvas = generateReceiptCanvas;
window.generateNoticeCanvas = generateNoticeCanvas;
window.sendPaymentWebhook = sendPaymentWebhook;
window.sendOwnerWebhook = sendOwnerWebhook;
window.sendImageNotificationWebhook = sendImageNotificationWebhook;

/* ==========================================
   REPORTES Y EXPORTACIÓN (ESTILO CORPORATIVO)
   ========================================== */

/**
 * Abre el configurador de reportes con filtros (PC)
 */
/**
 * Abre el configurador de reportes con filtros (PC)
 */
window.openExportCreditosModal = async function() {
    // 1. Obtener lista de usuarios activos para el filtro "Cobrados por"
    let collectors = [];
    try {
        const supabase = window.getSupabaseClient();
        const { data } = await supabase.from('ic_users').select('id, nombre').eq('activo', true).order('nombre');
        collectors = data || [];
    } catch (e) {
        console.warn('No se pudieron cargar usuarios para el reporte:', e);
    }

    // 2. Generar HTML para el selector de meses (Últimos 12 meses)
    const now = new Date();
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    let monthsHtml = `<button class="export-selector-btn active" data-value="todos" style="flex: 0 0 calc(33.33% - 5px);">TODOS</button>`;
    for (let i = 0; i < 11; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = `${monthNames[d.getMonth()].toUpperCase()} ${d.getFullYear().toString().substring(2)}`;
        const value = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        monthsHtml += `<button class="export-selector-btn" data-value="${value}" style="flex: 0 0 calc(33.33% - 5px);">${label}</button>`;
    }

    // 3. Generar HTML para el selector de cobradores
    let usersHtml = `<button class="export-selector-btn active" data-value="todos" style="flex: 0 0 calc(50% - 5px);">TODOS</button>`;
    collectors.forEach(u => {
        const shortName = u.nombre.split(' ')[0].toUpperCase();
        usersHtml += `<button class="export-selector-btn" data-value="${u.id}" style="flex: 0 0 calc(50% - 5px);">${shortName}</button>`;
    });

    Swal.fire({
        title: 'Reportes de Créditos',
        width: '600px',
        background: 'var(--gray-800)',
        color: 'var(--white)',
        html: `
            <div class="export-options-container" style="text-align: left; padding: 5px;">
                <!-- Selector de Modo de Reporte (Slider) -->
                <div class="report-mode-selector">
                    <button class="report-mode-btn active" data-mode="general">
                        <i class="fas fa-file-invoice-dollar"></i>REPORTE GENERAL
                    </button>
                    <button class="report-mode-btn" data-mode="cobros">
                        <i class="fas fa-hand-holding-usd"></i>REPORTE DE COBROS
                    </button>
                </div>

                <p id="export-mode-desc" style="margin-bottom: 20px; color: var(--gray-400); font-size: 0.9rem;">
                    Visualice el inventario actual de la cartera con saldos y estados.
                </p>
                
                <!-- Contenedor General (Filtros Cartera) -->
                <div id="section-general">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <!-- Estado -->
                        <div class="filter-group-corporate">
                            <label class="export-label-corporate">
                                <i class="fas fa-filter" style="margin-right: 8px; color: var(--gold);"></i>Estado de Cartera
                            </label>
                            <div class="export-selector-group" id="export-selector-estado" style="flex-wrap: wrap;">
                                <button class="export-selector-btn active" data-value="todos">TODOS</button>
                                <button class="export-selector-btn" data-value="ACTIVO">ACTIVOS</button>
                                <button class="export-selector-btn" data-value="MOROSO">MORA</button>
                                <button class="export-selector-btn" data-value="PAUSADO">PAUSA</button>
                                <button class="export-selector-btn" data-value="PENDIENTE">PEND.</button>
                                <button class="export-selector-btn" data-value="CANCELADO">CANC.</button>
                            </div>
                        </div>

                        <!-- País -->
                        <div class="filter-group-corporate">
                            <label class="export-label-corporate">
                                <i class="fas fa-globe" style="margin-right: 8px; color: var(--gold);"></i>País de Residencia
                            </label>
                            <div class="export-selector-group" id="export-selector-pais" style="flex-wrap: wrap;">
                                <button class="export-selector-btn active" data-value="todos">TODOS</button>
                                <button class="export-selector-btn" data-value="ECUADOR">ECU</button>
                                <button class="export-selector-btn" data-value="USA">USA</button>
                                <button class="export-selector-btn" data-value="PERU">PEN</button>
                                <button class="export-selector-btn" data-value="ESPAÑA">ESP</button>
                            </div>
                        </div>
                    </div>

                    <!-- Criterio de Orden -->
                    <div class="filter-group-corporate" style="margin-top: 20px;">
                        <label class="export-label-corporate">
                            <i class="fas fa-sort-amount-down" style="margin-right: 8px; color: var(--gold);"></i>Criterio de Orden
                        </label>
                        <div class="export-selector-group" id="export-selector-order">
                            <button class="export-selector-btn active" data-value="socio">ORDENADO POR SOCIO</button>
                            <button class="export-selector-btn" data-value="monto">POR MONTO MAYOR</button>
                            <button class="export-selector-btn" data-value="estado">POR ESTADO</button>
                        </div>
                    </div>
                </div>

                <!-- Contenedor Cobros (Filtros Recaudación) -->
                <div id="section-cobros" class="hidden-filter">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <!-- Cobrados en el Mes -->
                        <div class="filter-group-corporate">
                            <label class="export-label-corporate">
                                <i class="fas fa-calendar-check" style="margin-right: 8px; color: var(--gold);"></i>Cobrados en el Mes
                            </label>
                            <div class="export-selector-group" id="export-selector-mes" style="flex-wrap: wrap; max-height: 200px; overflow-y: auto; padding: 5px; background: rgba(0,0,0,0.1); border-radius: 8px;">
                                ${monthsHtml}
                            </div>
                        </div>

                        <!-- Cobrados Por -->
                        <div class="filter-group-corporate">
                            <label class="export-label-corporate">
                                <i class="fas fa-user-tie" style="margin-right: 8px; color: var(--gold);"></i>Cobrado Por (Usuario)
                            </label>
                            <div class="export-selector-group" id="export-selector-cobrador" style="flex-wrap: wrap; max-height: 200px; overflow-y: auto; padding: 5px; background: rgba(0,0,0,0.1); border-radius: 8px;">
                                ${usersHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-file-pdf" style="margin-right: 8px;"></i>Generar Reporte',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0E5936',
        cancelButtonColor: '#64748b',
        focusConfirm: false,
        didOpen: () => {
            // Lógica del Selector de Modo (Slider)
            const modeBtns = document.querySelectorAll('.report-mode-btn');
            const secGeneral = document.getElementById('section-general');
            const secCobros = document.getElementById('section-cobros');
            const descMode = document.getElementById('export-mode-desc');

            modeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const mode = btn.dataset.mode;

                    if (mode === 'general') {
                        secGeneral.classList.remove('hidden-filter');
                        secCobros.classList.add('hidden-filter');
                        descMode.innerText = 'Visualice el inventario actual de la cartera con saldos y estados.';
                    } else {
                        secGeneral.classList.add('hidden-filter');
                        secCobros.classList.remove('hidden-filter');
                        descMode.innerText = 'Muestra el detalle de pagos recaudados por mes y usuario.';
                    }
                });
            });

            // Configurar eventos de los botones (Multi-selección)
            const multiGroups = ['estado', 'pais', 'mes', 'cobrador'];
            multiGroups.forEach(groupId => {
                const container = document.getElementById(`export-selector-${groupId}`);
                if (!container) return;
                const buttons = container.querySelectorAll('.export-selector-btn');
                
                buttons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const val = btn.dataset.value;
                        if (val === 'todos') {
                            buttons.forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                        } else {
                            const todosBtn = container.querySelector('[data-value="todos"]');
                            if (todosBtn) todosBtn.classList.remove('active');
                            btn.classList.toggle('active');
                            
                            const activeCount = container.querySelectorAll('.export-selector-btn.active').length;
                            if (activeCount === 0 && todosBtn) {
                                todosBtn.classList.add('active');
                            }
                        }
                    });
                });
            });

            // Single select para Orden
            const orderContainer = document.getElementById('export-selector-order');
            const orderButtons = orderContainer.querySelectorAll('.export-selector-btn');
            orderButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    orderButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        },
        preConfirm: () => {
            const getActiveValues = (id) => {
                const container = document.getElementById(`export-selector-${id}`);
                if (!container) return 'todos';
                const active = Array.from(container.querySelectorAll('.export-selector-btn.active'))
                                    .map(btn => btn.dataset.value);
                return active.includes('todos') ? 'todos' : active;
            };

            return {
                reportType: document.querySelector('.report-mode-btn.active').dataset.mode,
                estado: getActiveValues('estado'),
                pais: getActiveValues('pais'),
                mes: getActiveValues('mes'),
                cobrador: getActiveValues('cobrador'),
                order: document.getElementById('export-selector-order').querySelector('.export-selector-btn.active').dataset.value
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            processCreditosExport(result.value);
        }
    });
};

/**
 * Filtra y ordena los datos para el reporte
 */
async function processCreditosExport(filters) {
    // Si el usuario eligió reporte de cobros, usamos esa lógica
    if (filters.reportType === 'cobros') {
        return await processCobrosExport(filters);
    }

    let listToExport = [...allCreditos];

    // 1. Filtro por Estado (Multi-selección)
    if (filters.estado !== 'todos') {
        const estados = Array.isArray(filters.estado) ? filters.estado : [filters.estado];
        listToExport = listToExport.filter(c => estados.includes(c.estado_credito || 'PENDIENTE'));
    }

    // 2. Filtro por País (Multi-selección)
    if (filters.pais !== 'todos') {
        const paises = Array.isArray(filters.pais) ? filters.pais : [filters.pais];
        listToExport = listToExport.filter(c => {
            const paisNorm = normalizePais(c.socio?.paisresidencia);
            return paises.includes(paisNorm);
        });
    }

    // 3. Ordenamiento
    switch (filters.order) {
        case 'codigo':
            listToExport.sort((a, b) => (a.codigo_credito || '').localeCompare(b.codigo_credito || ''));
            break;
        case 'socio':
            listToExport.sort((a, b) => (a.socio?.nombre || '').localeCompare(b.socio?.nombre || ''));
            break;
        case 'monto':
            listToExport.sort((a, b) => (parseFloat(b.capital || 0) - parseFloat(a.capital || 0)));
            break;
        case 'estado':
            const priority = { 'MOROSO': 1, 'ACTIVO': 2, 'PAUSADO': 3, 'PENDIENTE': 4, 'PRECANCELADO': 5, 'CANCELADO': 6 };
            listToExport.sort((a, b) => (priority[a.estado_credito] || 99) - (priority[b.estado_credito] || 99));
            break;
    }

    if (listToExport.length === 0) {
        Swal.fire('Sin resultados', 'No se encontraron créditos que coincidan con estos filtros.', 'info');
        return;
    }

    generateCreditosPDF(listToExport, filters);
}

/**
 * Lógica específica para el Reporte de Cobros (Modo Horizontal)
 */
async function processCobrosExport(filters) {
    try {
        const supabase = window.getSupabaseClient();
        
        // 1. Construir query de pagos con joins necesarios
        let query = supabase
            .from('ic_creditos_pagos')
            .select(`
                id_pago,
                fecha_pago,
                monto_pagado,
                metodo_pago,
                observaciones,
                cobrado_por,
                cobrador:ic_users!ic_creditos_pagos_cobrado_por_fkey ( nombre ),
                detalle:ic_creditos_amortizacion!ic_creditos_pagos_id_detalle_fkey (
                    pago_interes,
                    cuota_total,
                    fecha_vencimiento,
                    credito:ic_creditos!ic_creditos_amortizacion_id_credito_fkey (
                        codigo_credito,
                        estado_credito,
                        socio:ic_socios ( nombre, paisresidencia )
                    )
                )
            `);

        // 2. Aplicar filtros de cobrador
        if (filters.cobrador !== 'todos') {
            const cobradores = Array.isArray(filters.cobrador) ? filters.cobrador : [filters.cobrador];
            query = query.in('cobrado_por', cobradores);
        }

        const { data: pagos, error } = await query;
        if (error) throw error;

        // Normalizar estructura: Aplanar el join anidado (pagos -> detalle -> credito)
        let listToExport = (pagos || []).map(p => ({
            ...p,
            credito_info: p.detalle?.credito || {}
        }));

        // 3. Filtro por Mes
        if (filters.mes !== 'todos') {
            const meses = Array.isArray(filters.mes) ? filters.mes : [filters.mes];
            listToExport = listToExport.filter(p => {
                const monthKey = p.fecha_pago ? p.fecha_pago.substring(0, 7) : '';
                return meses.includes(monthKey);
            });
        }

        // 4. Filtro por País
        if (filters.pais !== 'todos') {
            const paises = Array.isArray(filters.pais) ? filters.pais : [filters.pais];
            listToExport = listToExport.filter(p => {
                const paisNorm = normalizePais(p.credito_info?.socio?.paisresidencia);
                return paises.includes(paisNorm);
            });
        }

        // 5. Ordenamiento por FECHA DE COBRO (Más antiguo a más reciente)
        listToExport.sort((a, b) => window.parseDate(a.fecha_pago) - window.parseDate(b.fecha_pago));

        if (listToExport.length === 0) {
            Swal.fire('Sin resultados', 'No se encontraron registros de cobro para estos filtros.', 'info');
            return;
        }

        // 6. Generar PDF especializado
        generateCobrosPDF(listToExport, filters);

    } catch (err) {
        console.error('Error en reporte de cobros:', err);
        Swal.fire('Error', 'No se pudo procesar el reporte de cobros', 'error');
    }
}

/**
 * Reporte Horizontal de Cobros
 */
async function generateCobrosPDF(data, filters) {
    try {
        const { jsPDF } = window.jspdf;
        // p = portrait, l = landscape
        const doc = new jsPDF('l', 'mm', 'a4'); 
        const pageWidth = doc.internal.pageSize.getWidth();

        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-EC');
        const timeStr = now.toLocaleTimeString('es-EC');

        // Logo y Encabezado
        try { doc.addImage(logoUrl, 'PNG', 15, 12, 18, 18); } catch (e) {}
        
        doc.setFontSize(20);
        doc.setTextColor(11, 78, 50);
        doc.text('INKA CORP', 38, 18);
        
        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text('REPORTE DETALLADO DE RECAUDACIÓN Y COBROS', 38, 25);
        
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Generado: ${dateStr} | ${timeStr}`, pageWidth - 60, 18);
        doc.text(`Registros: ${data.length}`, pageWidth - 60, 23);

        // Filtros en el encabezado
        doc.setFontSize(8);
        doc.setTextColor(11, 78, 50);
        const mesTxt = filters.mes === 'todos' ? 'TODOS' : (Array.isArray(filters.mes) ? filters.mes.join(', ') : filters.mes);
        const cobTxt = filters.cobrador === 'todos' ? 'TODOS' : 'FILTRADO POR USUARIO';
        doc.text(`FILTROS COBRO: MESES [${mesTxt.toUpperCase()}] | COBRADORES [${cobTxt}]`, 15, 34);

        doc.setDrawColor(242, 187, 58);
        doc.setLineWidth(0.6);
        doc.line(15, 36, pageWidth - 15, 36);

        // Totales para el resumen final
        let totalGeneral = 0;
        const totalPorCobrador = {};

        const tableData = data.map((p, index) => {
            const monto = parseFloat(p.monto_pagado || 0);
            const cuotaEsperada = parseFloat(p.detalle?.cuota_total || 0);
            // Mora = lo cobrado que exceda la cuota programada
            const mora = Math.max(0, monto - cuotaEsperada);
            
            totalGeneral += monto;
            
            const cobradorOriginal = p.cobrador?.nombre || 'SISTEMA';
            totalPorCobrador[cobradorOriginal] = (totalPorCobrador[cobradorOriginal] || 0) + monto;

            // Formatear COBRADOR: 1ra y 3ra palabra (ej: "LUIS ALBERTO PINTA" -> "LUIS PINTA")
            const cParts = cobradorOriginal.split(' ').filter(x => x.length > 0);
            const cobradorShort = (cParts[0] || '') + (cParts[2] ? ' ' + cParts[2] : '');

            const row = [
                index + 1,
                (p.credito_info?.socio?.nombre || 'N/A').toUpperCase(),
                getPaisCode(p.credito_info?.socio?.paisresidencia),
                formatMoney(monto),
                formatMoney(mora),
                p.fecha_pago ? window.formatDateMedium(window.parseDate(p.fecha_pago)) : '-',
                cobradorShort.toUpperCase(),
                p.metodo_pago
            ];
            row._raw = p; // Adjuntar datos para didParseCell
            return row;
        });

        doc.autoTable({
            startY: 40,
            head: [['#', 'SOCIO', 'PAÍS', 'VALOR COB.', 'MORA CONT.', 'FECHA PAGO', 'COBRADO POR', 'MÉTODO PAGO']],
            body: tableData,
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle' },
            headStyles: { fillColor: [11, 78, 50], textColor: [242, 187, 58], fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { halign: 'left' },
                2: { halign: 'center', cellWidth: 15 },
                3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
                4: { halign: 'right', cellWidth: 28 },
                5: { halign: 'center', cellWidth: 30 },
                6: { halign: 'left', cellWidth: 40 },
                7: { halign: 'center', cellWidth: 40 }
            },
            margin: { left: 15, right: 15 },
            didParseCell: function(data) {
                if (data.section === 'body') {
                    const raw = data.row.raw._raw;
                    const fPago = raw.fecha_pago;
                    const fVenc = raw.detalle?.fecha_vencimiento;

                    // Si la fecha de pago es estrictamente posterior al vencimiento -> resaltado
                    if (fPago && fVenc && new Date(fPago) > new Date(fVenc)) {
                        data.cell.styles.fillColor = [254, 226, 226]; // Rosa sutil
                        data.cell.styles.textColor = [153, 27, 27];   // Texto rojo oscuro para contraste
                    }
                }
            },
            didDrawPage: function(data) {
                // Pie de página
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Página ${doc.internal.getNumberOfPages()}`, 15, doc.internal.pageSize.getHeight() - 10);
            }
        });

        // Sección de Resumen y Totales (al final de la tabla)
        let finalY = doc.lastAutoTable.finalY + 10;
        
        // Si no hay espacio suficiente, crear nueva página
        if (finalY > doc.internal.pageSize.getHeight() - 40) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(10);
        doc.setTextColor(11, 78, 50);
        doc.text('RESUMEN DE RECAUDACIÓN POR COBRADOR:', 15, finalY);
        finalY += 6;

        doc.setFontSize(9);
        doc.setTextColor(60);
        Object.keys(totalPorCobrador).forEach(nombre => {
            doc.text(`${nombre}:`, 15, finalY);
            doc.text(formatMoney(totalPorCobrador[nombre]), 100, finalY, { align: 'right' });
            finalY += 5;
        });

        doc.setDrawColor(200);
        doc.line(15, finalY, 100, finalY);
        finalY += 6;
        
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(11, 78, 50);
        doc.text('TOTAL GENERAL RECAUDADO:', 15, finalY);
        doc.text(formatMoney(totalGeneral), 100, finalY, { align: 'right' });

        doc.save(`Recaudacion_INKA_${now.getTime()}.pdf`);
        showToast('Reporte de cobros generado', 'success');

    } catch (e) {
        console.error(e);
        showToast('Error generando PDF de cobros', 'error');
    }
}

/**
 * Genera el archivo PDF con el branding de la empresa
 */
async function generateCreditosPDF(data, filters) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-EC');
        const timeStr = now.toLocaleTimeString('es-EC');

        // Logo
        try {
            doc.addImage(logoUrl, 'PNG', 15, 12, 18, 18);
        } catch (e) {
            console.warn('Logo no disponible');
        }

        // Encabezado principal
        doc.setFontSize(18);
        doc.setTextColor(11, 78, 50); // Verde INKA
        doc.text('INKA CORP', 38, 18);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // Slate 500
        doc.text('REPORTE EJECUTIVO DE CARTERA DE CRÉDITOS', 38, 24);
        
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // Slate 400
        doc.text(`Generado: ${dateStr} | ${timeStr}`, 148, 18);
        doc.text(`Total registros: ${data.length}`, 148, 23);

        // Sub-info de filtros
        doc.setFontSize(7); // Reducir un poco para que quepan más filtros
        doc.setTextColor(11, 78, 50);
        
        const estTxt = filters.estado === 'todos' ? 'TODOS' : (Array.isArray(filters.estado) ? filters.estado.join(', ') : filters.estado);
        const paisTxt = filters.pais === 'todos' ? 'TODOS' : (Array.isArray(filters.pais) ? filters.pais.join(', ') : filters.pais);
        const mesTxt = filters.mes === 'todos' ? 'TODOS' : (Array.isArray(filters.mes) ? filters.mes.join(', ') : filters.mes);
        const orderLabels = { 'socio': 'SOCIO (A-Z)', 'monto': 'CAPITAL (DESC)', 'codigo': 'CÓDIGO', 'estado': 'ESTADO' };
        const ordTxt = orderLabels[filters.order] || filters.order;

        let filterText = `Estados [${estTxt}] | Países [${paisTxt}] | Meses [${mesTxt}] | Orden [${ordTxt}]`;
        doc.text(`FILTROS: ${filterText.toUpperCase()}`, 15, 34);

        // Línea divisoria decorativa
        doc.setDrawColor(242, 187, 58); // Dorado INKA
        doc.setLineWidth(0.5);
        doc.line(15, 36, 195, 36);

        // Tabla de datos
        const tableData = data.map((c, index) => {
            const fechaBase = parseDate(c.fecha_primer_pago);
            if (fechaBase) {
                fechaBase.setMonth(fechaBase.getMonth() + (c.cuotas_pagadas || 0));
            }
            const proxPagoStr = (c.estado_credito === 'CANCELADO' || c.estado_credito === 'PRECANCELADO') 
                ? '-' 
                : formatDateMedium(fechaBase);

            const estadoLabel = ESTADO_CONFIG[c.estado_credito]?.label || c.estado_credito;

            return [
                index + 1,
                (c.socio?.nombre || 'N/A').toUpperCase(),
                formatMoney(c.capital),
                getPaisCode(c.socio?.paisresidencia),
                `${c.cuotas_pagadas || 0}/${c.plazo}`,
                proxPagoStr,
                estadoLabel
            ];
        });

        doc.autoTable({
            startY: 40,
            head: [['#', 'SOCIO', 'CAPITAL', 'PAÍS', 'CUOTAS', 'PRÓX. PAGO', 'ESTADO']],
            body: tableData,
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 2, valign: 'middle' },
            headStyles: { 
                fillColor: [11, 78, 50], 
                textColor: [242, 187, 58], // Texto dorado sobre fondo verde
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 8 },
                1: { halign: 'left' },
                2: { halign: 'right', cellWidth: 22 },
                3: { halign: 'center', cellWidth: 15 },
                4: { halign: 'center', cellWidth: 15 },
                5: { halign: 'center', cellWidth: 25 },
                6: { halign: 'center', cellWidth: 30 }
            },
            margin: { left: 15, right: 15 },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 6) {
                    const status = data.cell.raw;
                    if (status === 'CARTERA EN MORA') {
                        data.cell.styles.fillColor = [254, 226, 226]; // Rosa sutil (Red 100)
                        data.cell.styles.textColor = [185, 28, 28];   // Rojo oscuro
                        data.cell.styles.fontStyle = 'bold';
                    } else if (status === 'CARTERA ACTIVA') {
                        data.cell.styles.fillColor = [220, 252, 231]; // Verde sutil (Green 100)
                        data.cell.styles.textColor = [21, 128, 61];   // Verde oscuro
                        data.cell.styles.fontStyle = 'bold';
                    } else if (status === 'CRÉDITOS PAUSADOS') {
                        data.cell.styles.fillColor = [254, 243, 199]; // Ámbar sutil
                        data.cell.styles.textColor = [180, 83, 9];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (status === 'POR APROBAR') {
                        data.cell.styles.fillColor = [237, 233, 254]; // Violeta sutil
                        data.cell.styles.textColor = [109, 40, 217];
                    }
                }
            },
            didDrawPage: function (data) {
                // Pie de página
                doc.setFontSize(8);
                doc.setTextColor(150);
                const pageNum = doc.internal.getNumberOfPages();
                doc.text(`Página ${pageNum}`, 15, doc.internal.pageSize.getHeight() - 10);
                doc.text('Sistema Administrativo INKA CORP © 2024', 135, doc.internal.pageSize.getHeight() - 10);
            }
        });

        // Guardar
        const filename = `Reporte_Creditos_INKA_${now.getTime()}.pdf`;
        doc.save(filename);
        
        if (window.showToast) {
            showToast('PDF generado exitosamente', 'success');
        }

    } catch (error) {
        console.error('PDF Error:', error);
        Swal.fire('Error', 'No se pudo generar el reporte PDF', 'error');
    }
}
