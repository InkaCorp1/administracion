/**
 * INKA CORP - Módulo de Ahorros Programados
 * Gestión de ahorros acumulados de los créditos
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allAhorros = [];
let filteredAhorros = [];
let currentFilterAhorro = '';
let currentViewingAhorro = null;

// Variables para Sticky Header (Pila de clones como en Créditos)
let stickyAhorrosHeaderClone = null;
let currentAhorrosStickyHeader = null;

// ==========================================
// UTILIDADES DE MODALES
// ==========================================
function setupModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Cerrar al hacer click en backdrop o botón close
    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.onclick = () => closeModal(modalId);
    });

    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal(modalId);
        }
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initAhorrosModule() {
    loadAhorros();
    setupAhorrosEventListeners();
    setupAhorrosStickyHeaders();
}

function setupAhorrosEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-ahorros');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterAhorros();
        }, 300));
    }

    // Modal close handlers
    setupModalCloseHandlers('ver-ahorro-modal');
    setupModalCloseHandlers('devolucion-modal');

    // Botón para abrir modal de devolución desde el detalle
    const btnDevolver = document.getElementById('btn-devolver-ahorro');
    if (btnDevolver) {
        btnDevolver.onclick = () => openDevolucionModal();
    }
}

// Función para filtrar por estado desde toolbar
function filterAhorrosByEstado(estado) {
    // Ya no hay múltiples estados, pero mantenemos la firma por compatibilidad con el HTML
    // y para resaltar que estamos viendo "Créditos con Ahorro"
    document.querySelectorAll('.ahorros-toolbar .filter-btn').forEach(btn => {
        btn.classList.add('active');
    });

    currentFilterAhorro = ''; // Siempre mostramos todos los que pasaron el filtro inicial
    filterAhorros();
}

// Función para refrescar datos
async function refreshAhorros() {
    const btn = document.getElementById('btn-sync-ahorros');
    if (btn) {
        btn.classList.add('spinning');
        btn.disabled = true;
    }

    await loadAhorros(true); // Forzar actualización
    showToast('Ahorros actualizados', 'success');

    if (btn) {
        btn.classList.remove('spinning');
        btn.disabled = false;
    }
}

// ==========================================
// CARGAR DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadAhorros(forceRefresh = false) {
    try {
        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('creditos')) {
            const creditos = window.getCacheData('creditos');
            processAhorrosFromCreditos(creditos);

            // Si el caché es reciente, no recargar
            if (window.isCacheValid && window.isCacheValid('creditos')) {
                return;
            }
        }

        // PASO 2: Actualizar en segundo plano
        const supabase = window.getSupabaseClient();

        const { data: creditos, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito,
                codigo_credito,
                ahorro_programado_cuota,
                ahorro_programado_total,
                cuotas_pagadas,
                plazo,
                estado_credito,
                socio:ic_socios (
                    idsocio,
                    nombre,
                    cedula
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        processAhorrosFromCreditos(creditos);

    } catch (error) {
        console.error('Error loading ahorros:', error);
        if (!window.hasCacheData || !window.hasCacheData('creditos')) {
            showAhorrosError('Error al cargar los ahorros');
        }
    }
}

// Procesar ahorros desde datos de créditos
function processAhorrosFromCreditos(creditos) {
    allAhorros = (creditos || [])
        .filter(credito => {
            // Solo créditos vigentes (ACTIVO o MOROSO) con cuota de ahorro mayor a 0
            const isVigente = credito.estado_credito === 'ACTIVO' || credito.estado_credito === 'MOROSO';
            const tieneAhorro = (credito.ahorro_programado_cuota || 0) > 0;
            return isVigente && tieneAhorro;
        })
        .map(credito => {
            const acumulado = (credito.ahorro_programado_cuota || 0) * (credito.cuotas_pagadas || 0);
            const total = credito.ahorro_programado_total || 0;
            const pendiente = total - acumulado;

            return {
                ...credito,
                ahorro_acumulado: acumulado,
                ahorro_pendiente: pendiente > 0 ? pendiente : 0
            };
        });

    filteredAhorros = [...allAhorros];
    updateAhorrosStats();
    renderAhorrosTable(filteredAhorros);
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateAhorrosStats() {
    let totalCreditosWithAhorro = allAhorros.length;
    let totalAcumulado = 0;
    let pendienteDevolucion = 0; // Esto podría referirse a otra cosa ahora, pero mantengamos el cálculo básico

    allAhorros.forEach(ahorro => {
        totalAcumulado += ahorro.ahorro_acumulado || 0;

        // Si por alguna razón necesitamos rastrear algo que no es activo aquí, 
        // pero por ahora allAhorros ya está filtrado
    });

    // Actualizar stats del hero
    document.getElementById('stat-total-ahorros').textContent = totalCreditosWithAhorro;
    document.getElementById('stat-total-acumulado').textContent = formatMoney(totalAcumulado);

    // El stat de "Por Devolver" lo ocultamos o lo ponemos en 0 si ya no mostramos cancelados
    const statPorDevolver = document.getElementById('stat-pendiente-devolucion');
    if (statPorDevolver) {
        statPorDevolver.textContent = '0';
        // Podríamos incluso ocultar esta tarjeta si el usuario no la quiere
    }

    // Actualizar contadores de toolbar
    const countAll = document.getElementById('count-ahorros-all');
    if (countAll) countAll.textContent = totalCreditosWithAhorro;

    const countTable = document.getElementById('count-ahorros-table');
    if (countTable) countTable.textContent = totalCreditosWithAhorro;
}

// ==========================================
// FILTRAR AHORROS
// ==========================================
function filterAhorros() {
    const searchTerm = document.getElementById('search-ahorros')?.value?.toLowerCase() || '';

    filteredAhorros = allAhorros.filter(ahorro => {
        // Filtro por búsqueda
        if (searchTerm) {
            const codigo = (ahorro.codigo_credito || '').toLowerCase();
            const nombre = (ahorro.socio?.nombre || '').toLowerCase();
            const cedula = (ahorro.socio?.cedula || '').toLowerCase();

            return codigo.includes(searchTerm) ||
                nombre.includes(searchTerm) ||
                cedula.includes(searchTerm);
        }

        return true;
    });

    renderAhorrosTable(filteredAhorros);
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function renderAhorrosTable(ahorros) {
    const tbody = document.getElementById('ahorros-table-body');
    const emptyDiv = document.getElementById('ahorros-empty');

    if (!ahorros || ahorros.length === 0) {
        tbody.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    tbody.innerHTML = ahorros.map(ahorro => {
        const estadoBadge = getEstadoCreditoBadge(ahorro.estado_credito);

        return `
            <tr>
                <td>
                    <span class="codigo-credito">${ahorro.codigo_credito}</span>
                </td>
                <td>
                    <div class="socio-info">
                        <span class="socio-nombre">${ahorro.socio?.nombre || 'N/A'}</span>
                        <span class="socio-cedula">${ahorro.socio?.cedula || ''}</span>
                    </div>
                </td>
                <td class="text-right">${formatMoney(ahorro.ahorro_programado_cuota)}</td>
                <td class="text-right">
                    <strong style="color: #10B981;">${formatMoney(ahorro.ahorro_acumulado)}</strong>
                </td>
                <td>${estadoBadge}</td>
                <td>
                    <button class="btn-ver-ahorro" onclick="viewAhorroDetail('${ahorro.id_credito}')">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getEstadoCreditoBadge(estado) {
    const badges = {
        'ACTIVO': '<span class="badge badge-activo">Activo</span>',
        'MOROSO': '<span class="badge badge-moroso">Moroso</span>',
        'CANCELADO': '<span class="badge badge-cancelado">Cancelado</span>',
        'PRECANCELADO': '<span class="badge badge-devuelto">Precancelado</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// VER DETALLE DE AHORRO
// ==========================================
async function viewAhorroDetail(creditoId) {
    const ahorro = allAhorros.find(a => a.id_credito === creditoId);
    if (!ahorro) {
        showToast('Crédito no encontrado', 'error');
        return;
    }

    currentViewingAhorro = ahorro;

    // Llenar información del modal
    const codigoSpan = document.getElementById('modal-codigo-ahorro');
    if (codigoSpan) {
        const nombreSocio = ahorro.socio?.nombre || 'Socio';
        const codigoCredito = ahorro.codigo_credito || '-';
        codigoSpan.innerHTML = `${nombreSocio} <span style="color: #b59410; margin-left: 8px;">- ${codigoCredito}</span>`;
    }

    // Info del socio (IDs que ya no existen en el HTML se ignoran)
    const detNombre = document.getElementById('ahorro-det-nombre');
    if (detNombre) detNombre.textContent = ahorro.socio?.nombre || '-';

    const detCredito = document.getElementById('ahorro-det-credito');
    if (detCredito) detCredito.textContent = ahorro.codigo_credito;

    // Resumen del ahorro
    document.getElementById('ahorro-det-cuota').textContent = formatMoney(ahorro.ahorro_programado_cuota);
    document.getElementById('ahorro-det-acumulado').textContent = formatMoney(ahorro.ahorro_acumulado);
    document.getElementById('ahorro-det-cuotas-pagadas').textContent = `${ahorro.cuotas_pagadas || 0}/${ahorro.plazo}`;

    // Cargar detalle por cuota
    await loadAhorroDetalle(creditoId);

    // Mostrar/ocultar botón de devolución
    const btnDevolver = document.getElementById('btn-devolver-ahorro');
    if (btnDevolver) {
        const canDevolver = ahorro.ahorro_acumulado > 0 &&
            (ahorro.estado_credito === 'CANCELADO' || ahorro.estado_credito === 'PRECANCELADO');
        btnDevolver.style.display = canDevolver ? 'inline-flex' : 'none';
        btnDevolver.onclick = () => openDevolucionModal();
    }

    // Abrir modal
    const modal = document.getElementById('ver-ahorro-modal');
    modal.classList.remove('hidden');

    // Reset scroll del contenedor de tabla
    const tableContainer = modal.querySelector('.table-responsive-modern');
    if (tableContainer) tableContainer.scrollTop = 0;

    document.body.style.overflow = 'hidden';
}

async function loadAhorroDetalle(creditoId) {
    const tbody = document.getElementById('ahorro-detalle-body');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando...</td></tr>';

    try {
        const supabase = window.getSupabaseClient();
        const { data: ahorros, error } = await supabase
            .from('ic_creditos_ahorro')
            .select('*')
            .eq('id_credito', creditoId)
            .order('numero_cuota', { ascending: true });

        if (error) throw error;

        if (!ahorros || ahorros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No hay registros de ahorro</td></tr>';
            return;
        }

        tbody.innerHTML = ahorros.map(item => {
            const estadoBadge = getEstadoAhorroBadge(item.estado);
            const fechaDevolucion = formatDate(item.fecha_devolucion);

            return `
                <tr>
                    <td class="text-center" style="font-weight: 600; color: var(--gray-500);">${item.numero_cuota}</td>
                    <td class="text-right" style="font-weight: 700; color: var(--white);">${formatMoney(item.monto)}</td>
                    <td>${estadoBadge}</td>
                    <td class="text-center">${fechaDevolucion || '-'}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading ahorro detail:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar datos</td></tr>';
    }
}

function getEstadoAhorroBadge(estado) {
    const badges = {
        'PENDIENTE': '<span class="badge badge-pendiente">Pendiente</span>',
        'ACUMULADO': '<span class="badge badge-acumulado">Pagado</span>',
        'DEVUELTO': '<span class="badge badge-devuelto">Devuelto</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// DEVOLUCIÓN DE AHORRO
// ==========================================
function openDevolucionModal() {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('DEVOLUCIÓN DE AHORRO')) {
            return;
        }
    }

    if (!currentViewingAhorro) return;

    document.getElementById('devolucion-monto').textContent = formatMoney(currentViewingAhorro.ahorro_acumulado);

    const observacionesEl = document.getElementById('devolucion-observaciones');
    if (observacionesEl) observacionesEl.value = '';

    // Configurar confirmación
    const btnConfirmar = document.getElementById('btn-confirmar-devolucion');
    btnConfirmar.onclick = () => confirmarDevolucion();

    // Abrir modal
    const modal = document.getElementById('devolucion-modal');
    modal.classList.remove('hidden');
}

async function confirmarDevolucion() {
    if (!currentViewingAhorro) return;

    const btnConfirmar = document.getElementById('btn-confirmar-devolucion');
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    try {
        const supabase = window.getSupabaseClient();
        const observacion = document.getElementById('devolucion-observaciones')?.value || '';
        const fechaHoy = todayISODate();

        // Actualizar todos los ahorros ACUMULADOS a DEVUELTO
        const { error } = await supabase
            .from('ic_creditos_ahorro')
            .update({
                estado: 'DEVUELTO',
                fecha_devolucion: fechaHoy,
                observacion: observacion
            })
            .eq('id_credito', currentViewingAhorro.id_credito)
            .eq('estado', 'ACUMULADO');

        if (error) throw error;

        // Cerrar modales
        closeModal('devolucion-modal');
        closeModal('ver-ahorro-modal');

        showToast('Ahorro devuelto exitosamente', 'success');
        await loadAhorros();

    } catch (error) {
        console.error('Error devolviendo ahorro:', error);
        showAlert('Error al devolver el ahorro: ' + (error.message || 'Error desconocido'), 'Error', 'error');
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Devolución';
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    return '$' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showAhorrosError(message) {
    console.error(message);
    const tbody = document.getElementById('ahorros-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 2rem; color: var(--error-light);">
                    <i class="fas fa-exclamation-triangle"></i> ${message}
                </td>
            </tr>
        `;
    }
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

// Exponer funciones globalmente para que sean accesibles desde HTML
window.initAhorrosModule = initAhorrosModule;
window.viewAhorroDetail = viewAhorroDetail;
window.filterAhorrosByEstado = filterAhorrosByEstado;
window.refreshAhorros = refreshAhorros;
window.confirmarDevolucion = confirmarDevolucion;
window.openDevolucionModal = openDevolucionModal;
window.cleanupAhorrosStickyHeaders = cleanupAhorrosStickyHeaders;

// ==========================================
// STICKY HEADERS (Lógica clonada de Créditos)
// ==========================================
function setupAhorrosStickyHeaders() {
    window.addEventListener('scroll', handleAhorrosScroll, { passive: true });
}

function cleanupAhorrosStickyHeaders() {
    hideFixedAhorrosHeader();
    window.removeEventListener('scroll', handleAhorrosScroll);
}

function handleAhorrosScroll() {
    const sections = document.querySelectorAll('.ahorros-section');
    if (sections.length === 0) return;

    const scrollTop = window.scrollY;
    let activeSection = null;

    // Solo tenemos una sección usualmente en ahorros, pero mantenemos la lógica robusta
    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const sectionTop = rect.top + scrollTop;
        const sectionBottom = sectionTop + section.offsetHeight;

        // Si el scroll está dentro de esta sección
        if (scrollTop >= sectionTop - 60 && scrollTop < sectionBottom - 100) {
            activeSection = section;
        }
    });

    if (activeSection) {
        const header = activeSection.querySelector('.section-sticky-header');
        if (!header) return;

        const headerRect = header.getBoundingClientRect();

        // Si el header original está fuera del viewport (arriba)
        if (headerRect.top < 0) {
            showFixedAhorrosHeader(header, activeSection);
        } else {
            hideFixedAhorrosHeader();
        }
    } else {
        hideFixedAhorrosHeader();
    }
}

function showFixedAhorrosHeader(originalHeader, section) {
    if (stickyAhorrosHeaderClone && currentAhorrosStickyHeader === originalHeader) {
        return;
    }

    hideFixedAhorrosHeader();

    const originalTable = section.querySelector('table');
    const originalThead = originalTable ? originalTable.querySelector('thead') : null;

    // Crear contenedor para el header fijo
    stickyAhorrosHeaderClone = document.createElement('div');
    stickyAhorrosHeaderClone.classList.add('fixed-header-clone');
    // Usamos la clase de créditos ya que tiene los estilos base adecuados
    stickyAhorrosHeaderClone.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        background: var(--card-bg);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        animation: slideDown 0.2s ease;
    `;

    // Clonar el header de sección
    const headerClone = originalHeader.cloneNode(true);
    headerClone.style.cssText = `
        margin: 0;
        border-radius: 0;
        padding: 1rem 1.5rem;
    `;
    stickyAhorrosHeaderClone.appendChild(headerClone);

    // Clonar el thead de la tabla
    if (originalThead && originalTable) {
        const originalThs = originalTable.querySelectorAll('thead th');
        const columnWidths = Array.from(originalThs).map(th => th.offsetWidth);

        const tableClone = document.createElement('table');
        tableClone.style.cssText = `
            width: ${originalTable.offsetWidth}px;
            margin: 0;
            border-collapse: collapse;
            table-layout: fixed;
            background: var(--bg-secondary);
        `;

        const colgroup = document.createElement('colgroup');
        columnWidths.forEach(width => {
            const col = document.createElement('col');
            col.style.width = `${width}px`;
            colgroup.appendChild(col);
        });
        tableClone.appendChild(colgroup);

        const theadClone = originalThead.cloneNode(true);
        // Quitar position sticky del clone para que no haga cosas raras
        theadClone.querySelectorAll('th').forEach(th => {
            th.style.position = 'static';
            th.style.background = 'transparent';
        });
        tableClone.appendChild(theadClone);

        const tableWrapper = document.createElement('div');
        tableWrapper.style.cssText = `
            padding: 0;
            background: var(--bg-secondary);
            overflow: hidden;
            border-bottom: 1px solid var(--border-color);
        `;
        tableWrapper.appendChild(tableClone);
        stickyAhorrosHeaderClone.appendChild(tableWrapper);
    }

    document.body.appendChild(stickyAhorrosHeaderClone);
    currentAhorrosStickyHeader = originalHeader;
}

function hideFixedAhorrosHeader() {
    if (stickyAhorrosHeaderClone) {
        stickyAhorrosHeaderClone.remove();
        stickyAhorrosHeaderClone = null;
        currentAhorrosStickyHeader = null;
    }
}