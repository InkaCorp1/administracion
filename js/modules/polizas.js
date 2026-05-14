/**
 * INKA CORP - Módulo de Administración de Pólizas
 * Gestión de inversiones y certificados
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allPolizas = [];
let filteredPolizas = [];
let currentEstadoFilterPolizas = '';
let currentSortPolizas = 'valor'; // Alineado con active en HTML

const POLIZA_RENOVACION_DIAS_ANTES = 3;
const POLIZA_RENOVACION_DIAS_DESPUES = 21;
const POLIZA_RENOVACION_COMPROBANTE_URL = 'https://lpsupabase.luispintasolutions.com/storage/v1/object/public/inkacorp/Utilities/DescontadoPoliza.jpg';

// Variables para encabezados fijos (Sticky Headers)
let polizasStickyHeaderClone = null;
let polizasCurrentStickyHeader = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initPolizasModule() {
    loadPolizas();
    setupPolizasEventListeners();
    setupPolizasStickyHeaders();

    // Global scope exposure
    window.viewPoliza = viewPoliza;
    window.openPolizaModal = openPolizaModal;
    window.handleUploadPolizaSignedDocument = handleUploadPolizaSignedDocument;
}

function setupPolizasStickyHeaders() {
    // Escuchar scroll del window
    window.addEventListener('scroll', handlePolizasStickyScroll, { passive: true });
}

function handlePolizasStickyScroll() {
    const sections = document.querySelectorAll('.polizas-section');
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
        if (!header) return;

        const headerRect = header.getBoundingClientRect();

        // Si el header original está fuera del viewport (arriba)
        if (headerRect.top < 0) {
            showPolizasFixedHeader(header, activeSection);
        } else {
            hidePolizasFixedHeader();
        }
    } else {
        hidePolizasFixedHeader();
    }
}

function showPolizasFixedHeader(originalHeader, section) {
    // Si ya existe el clone para este header, no hacer nada
    if (polizasStickyHeaderClone && polizasCurrentStickyHeader === originalHeader) {
        return;
    }

    // Remover clone anterior si existe
    hidePolizasFixedHeader();

    // Obtener la tabla de la sección para clonar su thead
    const originalTable = section.querySelector('.creditos-section-table');
    const originalThead = originalTable ? originalTable.querySelector('thead') : null;
    const tableContainer = section.querySelector('.section-table-container');

    // Crear contenedor para el header fijo
    polizasStickyHeaderClone = document.createElement('div');
    polizasStickyHeaderClone.classList.add('fixed-header-clone');
    polizasStickyHeaderClone.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        background: var(--gray-900);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        animation: slideDown 0.2s ease;
    `;

    // Clonar el header de sección
    const headerClone = originalHeader.cloneNode(true);
    headerClone.style.cssText = `
        margin: 0;
        border-radius: 0;
        box-shadow: none;
    `;
    polizasStickyHeaderClone.appendChild(headerClone);

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
            background: var(--gray-900);
            overflow: hidden;
        `;
        tableWrapper.appendChild(tableClone);

        polizasStickyHeaderClone.appendChild(tableWrapper);
    }

    document.body.appendChild(polizasStickyHeaderClone);
    polizasCurrentStickyHeader = originalHeader;
}

function hidePolizasFixedHeader() {
    if (polizasStickyHeaderClone) {
        polizasStickyHeaderClone.remove();
        polizasStickyHeaderClone = null;
        polizasCurrentStickyHeader = null;
    }
}

function cleanupPolizasModule() {
    hidePolizasFixedHeader();
    window.removeEventListener('scroll', handlePolizasStickyScroll);
}

// ==========================================
// CARGA DE DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadPolizas(forceRefresh = false) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent || !mainContent.querySelector('.polizas-wrapper')) return;

    try {
        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('polizas')) {
            allPolizas = window.getCacheData('polizas');
            renderPolizas();

            // Si el caché es reciente, no recargar
            if (window.isCacheValid && window.isCacheValid('polizas')) {
                return;
            }
        } else if (!forceRefresh) {
            // Solo mostrar loading si no hay caché
            beginLoading('Cargando pólizas...');
        }

        // PASO 2: Actualizar en segundo plano
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data, error } = await supabase
            .from('ic_polizas')
            .select(`
                *,
                socio:ic_socios (
                    idsocio,
                    nombre,
                    cedula,
                    whatsapp,
                    domicilio,
                    paisresidencia,
                    estadocivil,
                    tipo,
                    fotoidentidad
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allPolizas = data || [];

        // Guardar en caché
        if (window.setCacheData) {
            window.setCacheData('polizas', allPolizas);
        }

        renderPolizas();

    } catch (error) {
        console.error('Error cargando pólizas:', error);
        // Si hay error pero tenemos caché, mantener los datos de caché
        if (!window.hasCacheData || !window.hasCacheData('polizas')) {
            Swal.fire('Error', 'No se pudieron cargar las pólizas', 'error');
        }
    } finally {
        endLoading();
    }
}

// ==========================================
// RENDERIZADO
// ==========================================
function filterAndSortPolizas() {
    const search = document.getElementById('search-polizas')?.value.toLowerCase() || '';

    filteredPolizas = allPolizas.filter(p => {
        const matchesEstado = !currentEstadoFilterPolizas || p.estado === currentEstadoFilterPolizas;
        const socioName = p.socio?.nombre || '';
        const cedula = p.socio?.cedula || '';
        const idPoliza = p.id_poliza || '';
        const matchesSearch = socioName.toLowerCase().includes(search) ||
            cedula.includes(search) ||
            idPoliza.toLowerCase().includes(search);

        return matchesEstado && matchesSearch;
    });

    // Ordenamiento
    filteredPolizas.sort((a, b) => {
        if (currentSortPolizas === 'socio') {
            return (a.socio?.nombre || '').localeCompare(b.socio?.nombre || '');
        } else if (currentSortPolizas === 'fecha') {
            return parseDate(b.fecha_vencimiento) - parseDate(a.fecha_vencimiento);
        } else if (currentSortPolizas === 'valor') {
            return b.valor - a.valor;
        }
        return 0;
    });
}

function polizaNeedsSignedDocument(poliza) {
    return !String(poliza?.certificado_firmado || '').trim();
}

function renderPolizasStats() {
    const statsActivos = allPolizas.filter(p => p.estado === 'ACTIVO');
    const totalInvertido = statsActivos.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0);
    const interesProyectado = statsActivos.reduce((sum, p) => sum + ((parseFloat(p.valor_final) || 0) - (parseFloat(p.valor) || 0)), 0);

    const polizasPorVencer = statsActivos.filter(p => {
        const days = getDaysRemaining(p.fecha_vencimiento);
        return isWithinPolizaRenewalWindow(days);
    });

    const porVencer = polizasPorVencer.length;
    let mostImminentMsg = '';

    if (porVencer > 0) {
        let minDays = 999;
        polizasPorVencer.forEach(p => {
            const days = getDaysRemaining(p.fecha_vencimiento);
            if (Math.abs(days) < Math.abs(minDays)) minDays = days;
        });

        if (minDays === 0) mostImminentMsg = 'Vence hoy';
        else if (minDays === 1) mostImminentMsg = 'Vence mañana';
        else if (minDays === -1) mostImminentMsg = 'Venció ayer';
        else if (minDays > 0) mostImminentMsg = `Próximo en ${minDays} días`;
        else mostImminentMsg = `Venció hace ${Math.abs(minDays)} días`;
    }

    // UI Hero
    if (document.getElementById('stat-polizas-activos')) document.getElementById('stat-polizas-activos').textContent = statsActivos.length;
    if (document.getElementById('stat-polizas-vencimiento')) document.getElementById('stat-polizas-vencimiento').textContent = porVencer;
    if (document.getElementById('stat-polizas-vencimiento-msg')) {
        document.getElementById('stat-polizas-vencimiento-msg').textContent = mostImminentMsg;
    }

    if (document.getElementById('stat-polizas-total')) document.getElementById('stat-polizas-total').textContent = formatMoney(totalInvertido);
    if (document.getElementById('stat-polizas-interes')) document.getElementById('stat-polizas-interes').textContent = formatMoney(interesProyectado);

    // Contadores de estado
    if (document.getElementById('count-polizas-all')) document.getElementById('count-polizas-all').textContent = allPolizas.length;
    if (document.getElementById('count-polizas-activo')) document.getElementById('count-polizas-activo').textContent = statsActivos.length;
    if (document.getElementById('count-polizas-pagado')) document.getElementById('count-polizas-pagado').textContent = allPolizas.filter(p => p.estado === 'PAGADO').length;
    if (document.getElementById('count-polizas-capitalizado')) document.getElementById('count-polizas-capitalizado').textContent = allPolizas.filter(p => p.estado === 'CAPITALIZADO').length;
}

function renderPolizas() {
    filterAndSortPolizas();
    renderPolizasStats();

    // Ocultar header fijo anterior antes de re-renderizar
    hidePolizasFixedHeader();

    const container = document.getElementById('polizas-sections-container');
    const emptyDiv = document.getElementById('polizas-empty');
    if (!container) return;

    if (filteredPolizas.length === 0) {
        container.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    // Agrupar pólizas por estado, dejando primero las que necesitan actualización de firma.
    const grouped = {};
    filteredPolizas.forEach(p => {
        let est = polizaNeedsSignedDocument(p) ? 'ACTUALIZAR' : (p.estado || 'ACTIVO');

        // Si es ACTIVA y está en ventana de renovación, moverla a un grupo especial
        if (est === 'ACTIVO') {
            const days = getDaysRemaining(p.fecha_vencimiento);
            if (isWithinPolizaRenewalWindow(days)) {
                est = 'VENCIMIENTO';
            }
        }

        if (!grouped[est]) grouped[est] = [];
        grouped[est].push(p);
    });

    // Orden de secciones (Vencimiento al principio como pidió el usuario)
    const ESTADO_ORDER_POL = ['ACTUALIZAR', 'VENCIMIENTO', 'ACTIVO', 'PAGADO', 'CAPITALIZADO'];
    const CONFIG_POL = {
        'ACTUALIZAR': { icon: 'fa-file-signature', color: '#F59E0B', label: 'Pólizas para Actualizar', bgColor: 'rgba(245, 158, 11, 0.15)' },
        'VENCIMIENTO': { icon: 'fa-clock', color: '#F59E0B', label: 'Ventana de Renovación (-21 a +3 días)', bgColor: 'rgba(245, 158, 11, 0.15)' },
        'ACTIVO': { icon: 'fa-certificate', color: '#10B981', label: 'Pólizas Activas', bgColor: 'rgba(16, 185, 129, 0.15)' },
        'PENDIENTE': { icon: 'fa-hourglass-half', color: '#F59E0B', label: 'Pólizas Pendientes de Firma', bgColor: 'rgba(245, 158, 11, 0.15)' },
        'PAGADO': { icon: 'fa-check-circle', color: '#3B82F6', label: 'Pólizas Pagadas', bgColor: 'rgba(59, 130, 246, 0.15)' },
        'CAPITALIZADO': { icon: 'fa-redo-alt', color: '#8B5CF6', label: 'Pólizas Capitalizadas', bgColor: 'rgba(139, 92, 246, 0.15)' }
    };

    let html = '';

    // Si hay filtro activo
    if (currentEstadoFilterPolizas) {
        if (grouped['ACTUALIZAR']?.length > 0) {
            html += renderPolizaSection('ACTUALIZAR', grouped['ACTUALIZAR'], CONFIG_POL['ACTUALIZAR']);
        }

        if (currentEstadoFilterPolizas === 'ACTIVO') {
            // Si filtra por activos, mostrar Vencimientos y Activos normales
            if (grouped['VENCIMIENTO']?.length > 0) {
                html += renderPolizaSection('VENCIMIENTO', grouped['VENCIMIENTO'], CONFIG_POL['VENCIMIENTO']);
            }
            if (grouped['ACTIVO']?.length > 0) {
                html += renderPolizaSection('ACTIVO', grouped['ACTIVO'], CONFIG_POL['ACTIVO']);
            }
        } else {
            const est = currentEstadoFilterPolizas;
            if (grouped[est]?.length > 0) {
                html += renderPolizaSection(est, grouped[est], CONFIG_POL[est]);
            }
        }
    } else {
        // Todas las secciones en orden de prioridad
        ESTADO_ORDER_POL.forEach(est => {
            if (grouped[est] && grouped[est].length > 0) {
                html += renderPolizaSection(est, grouped[est], CONFIG_POL[est]);
            }
        });
    }

    container.innerHTML = html;
}

function renderPolizaSection(estado, polizas, config) {
    if (!config) config = { icon: 'fa-folder', color: '#9CA3AF', label: estado, bgColor: 'rgba(156, 163, 175, 0.15)' };

    return `
        <div class="creditos-section polizas-section" data-estado="${estado}">
            <div class="section-sticky-header" style="--section-color: ${config.color}; --section-bg: ${config.bgColor};">
                <div class="section-header-content">
                    <i class="fas ${config.icon}" style="color: ${config.color};"></i>
                    <span class="section-title">${config.label}</span>
                    <span class="section-count" style="background: ${config.bgColor}; color: ${config.color};">${polizas.length}</span>
                </div>
                <div class="section-header-actions hide-mobile">
                    <span style="font-size: 0.75rem; color: var(--gray-500); text-transform: uppercase;">Monto Total: ${formatMoney(polizas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0))}</span>
                </div>
            </div>
            <div class="section-table-container">
                <table class="creditos-section-table">
                    <thead>
                        <tr>
                            <th class="col-socio">Socio / Inversionista</th>
                            <th class="hide-mobile">Fecha</th>
                            <th class="text-right">Capital</th>
                            <th class="hide-mobile text-center">Interés</th>
                            <th class="text-center">Vencimiento</th>
                            <th class="text-center">Estado</th>
                            <th class="text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${polizas.map(p => {
        const daysRemaining = getDaysRemaining(p.fecha_vencimiento);

        const isCriticalRange = isWithinPolizaRenewalWindow(daysRemaining);
        const isUpcoming = daysRemaining > POLIZA_RENOVACION_DIAS_ANTES && daysRemaining <= 30;

        let vencimientoSignal = '';
        if (p.estado === 'ACTIVO') {
            if (daysRemaining === 0) vencimientoSignal = '<span class="vencimiento-tag critical">Vence hoy</span>';
            else if (daysRemaining === 1) vencimientoSignal = '<span class="vencimiento-tag warning">Vence mañana</span>';
            else if (daysRemaining === -1) vencimientoSignal = '<span class="vencimiento-tag critical" style="background: var(--error); color: white;">Venció ayer</span>';
            else if (daysRemaining > 1 && daysRemaining <= POLIZA_RENOVACION_DIAS_ANTES) vencimientoSignal = `<span class="vencimiento-tag warning">En ${daysRemaining} días</span>`;
            else if (daysRemaining < -1 && daysRemaining >= -POLIZA_RENOVACION_DIAS_DESPUES) vencimientoSignal = `<span class="vencimiento-tag critical" style="background: var(--error); color: white;">Hace ${Math.abs(daysRemaining)} días</span>`;
            else if (isUpcoming) vencimientoSignal = `<span class="vencimiento-tag info">${daysRemaining} días</span>`;
        }

        return `
                                <tr class="credito-row" onclick="viewPoliza('${p.id_poliza}')">
                                    <td class="col-socio">
                                        <div class="socio-info">
                                            <div class="socio-name">${p.socio?.nombre || 'Socio Desconocido'}</div>
                                            <div class="socio-id">${p.socio?.cedula || '-'}</div>
                                            ${polizaNeedsSignedDocument(p) ? '<div class="poliza-update-tag"><i class="fas fa-pen-nib"></i> Falta firma</div>' : ''}
                                        </div>
                                    </td>
                                    <td class="hide-mobile">${formatDate(p.fecha)}</td>
                                    <td class="text-right font-weight-bold" style="color: var(--white);">${formatMoney(p.valor)}</td>
                                    <td class="hide-mobile text-center">${p.interes}%</td>
                                    <td class="text-center">
                                        <div class="vencimiento-wrapper">
                                            <div class="date-main ${isCriticalRange ? 'text-danger font-weight-bold' : (isUpcoming ? 'text-warning font-weight-bold' : '')}">
                                                ${formatDate(p.fecha_vencimiento)}
                                            </div>
                                            ${vencimientoSignal}
                                        </div>
                                    </td>
                                    <td class="text-center">
                                        ${getEstadoBadgePoliza(p.estado)}
                                    </td>
                                    <td class="text-center poliza-actions-cell">
                                        <div class="poliza-actions-inline">
                                            <button class="btn-icon" title="Ver Detalle" onclick="event.stopPropagation(); viewPoliza('${p.id_poliza}')">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            ${polizaNeedsSignedDocument(p) ? `
                                                <button class="btn-icon" title="Subir documento firmado" onclick="event.stopPropagation(); handleUploadPolizaSignedDocument('${p.id_poliza}')">
                                                    <i class="fas fa-file-upload"></i>
                                                </button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function getEstadoBadgePoliza(estado) {
    const badges = {
        'ACTIVO': '<span class="badge badge-activo" style="background: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">ACTIVO</span>',
        'PENDIENTE': '<span class="badge badge-pendiente" style="background: rgba(245, 158, 11, 0.1); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.2); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">PENDIENTE</span>',
        'PAGADO': '<span class="badge badge-pagado" style="background: rgba(59, 130, 246, 0.1); color: #3B82F6; border: 1px solid rgba(59, 130, 246, 0.2); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">PAGADO</span>',
        'CAPITALIZADO': '<span class="badge badge-capitalizado" style="background: rgba(139, 92, 246, 0.1); color: #8B5CF6; border: 1px solid rgba(139, 92, 246, 0.2); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">CAPITALIZADO</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

function filterPolizasByEstado(estado) {
    currentEstadoFilterPolizas = estado;
    document.querySelectorAll('.estado-counter').forEach(c => {
        c.classList.toggle('active', c.dataset.estado === (estado || ''));
    });
    renderPolizas();
}

function setupPolizasEventListeners() {

    // Búsqueda
    const searchInput = document.getElementById('search-polizas');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderPolizas();
        });
    }

    // Botones de Ordenamiento (Toolbar)
    document.querySelectorAll('.polizas-wrapper .toolbar-btn[data-sort]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.polizas-wrapper .toolbar-btn[data-sort]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSortPolizas = btn.dataset.sort;
            renderPolizas();
        });
    });

    // Filtros por Estado (Counters)
    document.querySelectorAll('.polizas-wrapper .estado-counter').forEach(counter => {
        counter.addEventListener('click', () => {
            const estado = counter.dataset.estado;

            // Toggle filter
            if (currentEstadoFilterPolizas === estado) {
                currentEstadoFilterPolizas = '';
            } else {
                currentEstadoFilterPolizas = estado;
            }

            // UI feedback
            document.querySelectorAll('.polizas-wrapper .estado-counter').forEach(c => {
                c.classList.toggle('active', c.dataset.estado === currentEstadoFilterPolizas);
            });

            renderPolizas();
        });
    });

    // Botón de Agrupamiento (Toggle layer group icon)
    const btnEstado = document.getElementById('btn-estado-filter');
    if (btnEstado) {
        btnEstado.addEventListener('click', () => {
            btnEstado.classList.toggle('active');
            // Aquí podríamos alternar entre vista agrupada y lista simple, 
            // pero por ahora mantendremos la vista agrupada solicitada.
            renderPolizas();
        });
    }

    // Botón Sync
    const btnSync = document.getElementById('btn-sync-polizas');
    if (btnSync) {
        btnSync.addEventListener('click', async () => {
            btnSync.classList.add('loading');
            const icon = btnSync.querySelector('i');
            if (icon) icon.className = 'fas fa-spinner fa-spin';

            await loadPolizas(true);

            btnSync.classList.remove('loading');
            if (icon) icon.className = 'fas fa-sync-alt';
            showToast('Pólizas actualizadas', 'success');
        });
    }

    // Botón Nuevo
    document.getElementById('btn-nueva-poliza')?.addEventListener('click', () => openPolizaModal());

    // Formulario
    document.getElementById('form-poliza')?.addEventListener('submit', (e) => {
        e.preventDefault();
        savePoliza();
    });

    document.getElementById('poliza-socio')?.addEventListener('change', () => {
        setPolizaSocioAvatar(getSelectedPolizaSocio());
    });

    // Cálculos Proyectados en Modal
    ['poliza-valor', 'poliza-interes', 'poliza-plazo', 'poliza-fecha'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', calculatePolizaProjections);
    });

    // Modal Close
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    });

    // Botones de Liquidación y Renovación
    document.getElementById('btn-pagar-poliza')?.addEventListener('click', () => {
        // Validar caja antes de acción financiera
        if (typeof window.validateCajaBeforeAction === 'function') {
            if (!window.validateCajaBeforeAction('LIQUIDACIÓN DE PÓLIZA')) return;
        }

        const id = document.getElementById('poliza-id').value;
        const poliza = allPolizas.find(p => p.id_poliza === id);
        if (poliza) handlePagarPoliza(poliza);
    });

    document.getElementById('btn-renovar-poliza')?.addEventListener('click', () => {
        // Validar caja antes de acción financiera
        if (typeof window.validateCajaBeforeAction === 'function') {
            if (!window.validateCajaBeforeAction('RENOVACIÓN DE PÓLIZA')) return;
        }

        const id = document.getElementById('poliza-id').value;
        const poliza = allPolizas.find(p => p.id_poliza === id);
        if (poliza) handleRenovarPoliza(poliza);
    });

    document.getElementById('btn-whatsapp-poliza')?.addEventListener('click', () => {
        const id = document.getElementById('poliza-id').value;
        const poliza = allPolizas.find(p => p.id_poliza === id);
        if (poliza) handleWhatsAppNotification(poliza);
    });
}

function getSelectedPolizaSocio() {
    const selectedId = document.getElementById('poliza-socio')?.value;
    if (!selectedId) return null;

    const socios = window.dataCache?.socios || [];
    return socios.find(s => String(s.idsocio) === String(selectedId)) || null;
}

function getCachedSocioPhotoForPoliza(idsocio) {
    try {
        const cached = JSON.parse(localStorage.getItem('inkacorp_fotos_cache') || '{}');
        const entry = cached?.[idsocio];
        if (!entry?.url) return null;

        const maxAge = 24 * 60 * 60 * 1000;
        if (entry.timestamp && Date.now() - entry.timestamp > maxAge) return null;
        return entry.url;
    } catch (error) {
        return null;
    }
}

function getPolizaSocioPhotoUrl(socio) {
    if (!socio?.idsocio) return socio?.fotoidentidad || null;
    return getCachedSocioPhotoForPoliza(socio.idsocio) || socio.fotoidentidad || null;
}

function getPolizaSocioInitials(socio) {
    const nombre = String(socio?.nombre || '').trim();
    if (!nombre) return '??';
    return nombre
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

function setPolizaSocioAvatar(socio) {
    const avatar = document.getElementById('socio-avatar-display');
    if (!avatar) return;

    const fotoUrl = getPolizaSocioPhotoUrl(socio);
    avatar.classList.remove('has-photo', 'photo-error');

    if (fotoUrl) {
        avatar.classList.add('has-photo');
        avatar.innerHTML = `<img src="${escapePolizaHtml(fotoUrl)}" alt="Foto de ${escapePolizaHtml(socio?.nombre || 'socio')}" onerror="this.onerror=null; const p=this.parentElement; if(p){ p.classList.remove('has-photo'); p.classList.add('photo-error'); p.innerHTML='<i class=&quot;fas fa-exclamation-triangle&quot;></i><span>ACTUALIZAR</span>'; }">`;
        return;
    }

    avatar.innerHTML = `<span id="socio-initials">${getPolizaSocioInitials(socio)}</span>`;
}

// ==========================================
// CRUD OPERATIONS
// ==========================================
function openPolizaModal(poliza = null) {
    const modal = document.getElementById('poliza-modal');
    const form = document.getElementById('form-poliza');
    const btnGuardar = document.getElementById('btn-guardar-poliza');
    const modalTitle = document.getElementById('modal-poliza-title');
    const actionsContainer = document.getElementById('poliza-actions-container');
    const estadoField = document.getElementById('poliza-estado-field');
    const certificadoField = document.getElementById('poliza-certificado-field');

    if (!modal || !form) return;

    form.reset();
    populateSocioSelect();

    // Reset displays
    document.getElementById('display-vencimiento').textContent = '00/00/0000';
    document.getElementById('display-valor-final').textContent = '$0.00';
    setPolizaSocioAvatar(null);
    if (actionsContainer) actionsContainer.classList.add('hidden');
    if (estadoField) estadoField.classList.remove('hidden');
    if (certificadoField) certificadoField.classList.remove('hidden');

    // Reset preview de certificado
    const previewContainer = document.getElementById('poliza-certificado-preview-container');
    const previewImg = document.getElementById('poliza-certificado-preview');
    if (previewContainer) previewContainer.classList.add('hidden');
    if (previewImg) previewImg.src = '';

    // Manejo de Modos (Info vs Edit)
    const editElements = form.querySelectorAll('.mode-edit');
    const infoElements = form.querySelectorAll('.mode-info');

    if (poliza) {
        // MODO INFORMACIÓN
        if (modalTitle) modalTitle.textContent = 'Reporte de Inversión';
        if (btnGuardar) btnGuardar.classList.add('hidden');
        if (estadoField) estadoField.classList.remove('hidden');
        if (certificadoField) certificadoField.classList.remove('hidden');

        editElements.forEach(el => el.classList.add('hidden'));
        infoElements.forEach(el => el.classList.remove('hidden'));

        // Poblar datos
        document.getElementById('poliza-id').value = poliza.id_poliza;
        document.getElementById('display-socio-nombre').textContent = poliza.socio?.nombre || 'Socio Desconocido';
        document.getElementById('display-fecha-inicio').textContent = formatDate(poliza.fecha);
        document.getElementById('display-plazo').textContent = `${poliza.plazo} meses`;
        document.getElementById('display-valor-inversion').textContent = formatMoney(poliza.valor);
        document.getElementById('display-interes').textContent = `${poliza.interes}%`;
        document.getElementById('display-certificado-url').textContent = poliza.certificado_firmado || 'Sin documento';

        // Estado y Proyecciones
        const estadoDisplay = document.getElementById('display-estado');
        if (estadoDisplay) estadoDisplay.innerHTML = getEstadoBadgePoliza(poliza.estado);
        document.getElementById('display-vencimiento').textContent = formatDate(poliza.fecha_vencimiento);
        document.getElementById('display-valor-final').textContent = formatMoney(poliza.valor_final);

        // Cálculo de valor devengado a HOY
        const devengadoContainer = document.getElementById('poliza-devengado-container');
        if (devengadoContainer && poliza.estado === 'ACTIVO') {
            const fechaInicio = parseDate(poliza.fecha);
            const hoy = new Date();
            const diasPasados = Math.max(0, Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24)));

            // Interés total proyectado (para 365 días base)
            const interesTotal = (parseFloat(poliza.valor_final) - parseFloat(poliza.valor));
            const interesPorDia = interesTotal / (parseInt(poliza.plazo) * 30.44); // Aproximado a días del plazo
            // Ajustamos a 365 días como pidió el usuario: (Capital * % * Plazo_Años)
            const interesDiarioReal = (parseFloat(poliza.valor) * (parseFloat(poliza.interes) / 100)) / 365;

            const interesAcumulado = interesDiarioReal * diasPasados;
            const valorHoy = parseFloat(poliza.valor) + interesAcumulado;

            document.getElementById('display-dias-pasados').textContent = `${diasPasados} días`;
            document.getElementById('display-valor-hoy').textContent = formatMoney(valorHoy);
            devengadoContainer.classList.remove('hidden');

            // Habilitar Pago/Renovación desde 3 días antes hasta 21 días después del vencimiento
            const diasParaVencer = getDaysRemaining(poliza.fecha_vencimiento);
            if (actionsContainer && isWithinPolizaRenewalWindow(diasParaVencer)) {
                actionsContainer.classList.remove('hidden');
                actionsContainer.style.display = 'flex';
            }
        } else {
            if (devengadoContainer) devengadoContainer.classList.add('hidden');
            if (actionsContainer) {
                actionsContainer.classList.add('hidden');
                actionsContainer.style.display = 'none';
            }
        }

        setPolizaSocioAvatar(poliza.socio);

        if (poliza.certificado_firmado && previewContainer && previewImg) {
            previewImg.src = poliza.certificado_firmado;
            previewContainer.classList.remove('hidden');
        }

    } else {
        // MODO EDICIÓN
        if (modalTitle) modalTitle.textContent = 'Apertura de Póliza';
        if (btnGuardar) btnGuardar.classList.remove('hidden');
        if (actionsContainer) actionsContainer.classList.add('hidden');
        if (estadoField) estadoField.classList.add('hidden');
        if (certificadoField) certificadoField.classList.add('hidden');

        editElements.forEach(el => el.classList.remove('hidden'));
        infoElements.forEach(el => el.classList.add('hidden'));

        document.getElementById('poliza-id').value = '';
        document.getElementById('poliza-fecha').value = todayISODate();
        document.getElementById('poliza-estado').value = 'PENDIENTE';
        document.getElementById('poliza-certificado').value = '';
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * Lógica para Liquidar (Pagar) una Póliza
 */
async function handlePagarPoliza(poliza) {
    // Calcular interés ganado a hoy
    const fechaInicio = parseDate(poliza.fecha);
    const hoy = new Date();
    const diasPasados = Math.max(0, Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24)));
    const interesDiario = (parseFloat(poliza.valor) * (parseFloat(poliza.interes) / 100)) / 365;
    const interesGanado = interesDiario * diasPasados;
    const totalAPagar = parseFloat(poliza.valor) + interesGanado;

    const { value: confirm } = await Swal.fire({
        title: '⚠️ ¿ESTÁ SEGURO DE ESTA OPERACIÓN?',
        html: `
            <div style="text-align: left; background: #fff5f5; border: 1px solid #feb2b2; padding: 1.25rem; border-radius: 0.75rem; margin-top: 1rem;">
                <p style="color: #c53030; font-weight: 800; text-align: center; margin-bottom: 1rem; text-transform: uppercase;">
                    <i class="fas fa-exclamation-triangle"></i> Verifique antes de continuar
                </p>
                <p style="margin-bottom: 0.5rem; color: #2d3748;">Asegúrese de haber <b>entregado físicamente</b> el dinero al socio:</p>
                <div style="background: white; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #edf2f7; margin-bottom: 1rem;">
                    <p style="margin: 0;"><b>Capital:</b> ${formatMoney(poliza.valor)}</p>
                    <p style="margin: 0;"><b>Interés (${diasPasados} días):</b> ${formatMoney(interesGanado)}</p>
                    <hr style="margin: 0.5rem 0; border: none; border-top: 1px dashed #e2e8f0;">
                    <p style="font-size: 1.1rem; color: #0B4E32; margin: 0;"><b>Total a Pagar: ${formatMoney(totalAPagar)}</b></p>
                </div>
                <p style="font-size: 0.85rem; color: #742a2a; line-height: 1.4; padding: 0.5rem; background: #fff; border-radius: 0.3rem;">
                    <b>IMPORTANTE:</b> Esta acción es <b>irreversible</b> en el sistema, marcará la póliza como PAGADA y enviará automáticamente el comprobante por WhatsApp.
                </p>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, he entregado el dinero',
        confirmButtonColor: '#d33',
        cancelButtonText: 'Cancelar',
        focusCancel: true
    });

    if (confirm) {
        try {
            beginLoading('Procesando pago...');
            const supabase = getSupabaseClient();

            // 1. Marcar póliza como PAGADA
            const { error: errPol } = await supabase
                .from('ic_polizas')
                .update({ estado: 'PAGADO', updated_at: new Date().toISOString() })
                .eq('id_poliza', poliza.id_poliza);

            if (errPol) throw errPol;

            // 2. Registrar en tabla de pagos
            const { error: errPago } = await supabase
                .from('ic_polizas_pagos')
                .insert([{
                    id_poliza: poliza.id_poliza,
                    id_socio: poliza.id_socio,
                    monto_total_pagado: totalAPagar,
                    monto_capital: poliza.valor,
                    monto_interes: interesGanado,
                    tipo_pago: 'LIQUIDACION_TOTAL',
                    notas: `Liquidación total al vencimiento (${diasPasados} días transcurridos)`
                }]);

            if (errPago) throw errPago;

            await Swal.fire('Pagado', 'La póliza ha sido liquidada correctamente.', 'success');

            // Cerrar modal
            const modal = document.getElementById('poliza-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
            document.body.style.overflow = '';

            // Enviar notificación de agradecimiento
            await sendPayoutNotification(poliza, totalAPagar, interesGanado);

            await loadPolizas(true);

        } catch (error) {
            console.error('Error pagando póliza:', error);
            await window.showFinancialError?.(error, 'No se pudo procesar el pago de la póliza.')
                || Swal.fire('Error', 'No se pudo procesar el pago', 'error');
        } finally {
            endLoading();
        }
    }
}

/**
 * Lógica para Renovar una Póliza (Capital vs Capital+Int)
 * Calcula el interés real a la fecha para justicia de ambas partes.
 */
async function handleRenovarPoliza(poliza) {
    const capitalOriginal = parseFloat(poliza.valor);
    const fechaInicio = parseDate(poliza.fecha);
    const fechaVencimiento = parseDate(poliza.fecha_vencimiento);
    const hoyISO = todayISODate();
    let resumenDescuentos = {
        total: 0,
        creditosNormales: [],
        creditosPreferenciales: [],
        error: null
    };

    // La renovación siempre toma el valor pactado al vencimiento, incluso si ya venció.
    const diasPoliza = fechaInicio && fechaVencimiento
        ? Math.max(0, Math.floor((fechaVencimiento - fechaInicio) / (1000 * 60 * 60 * 24)))
        : 0;
    const valorVencimientoTotal = parseFloat(poliza.valor_final || 0) || capitalOriginal;
    const interesAlVencimiento = Math.max(0, valorVencimientoTotal - capitalOriginal);

    try {
        resumenDescuentos = await loadPolizaRenewalDeductions(poliza.id_socio);
    } catch (error) {
        console.error('Error calculando descuentos de renovación:', error);
        resumenDescuentos.error = error.message || 'No se pudieron calcular las deudas pendientes.';
    }
    const totalDescuentosPreview = resumenDescuentos.total || 0;
    const saldoCapitalMasInteresPreview = Math.max(0, valorVencimientoTotal - totalDescuentosPreview);
    const saldoSoloCapitalPreview = Math.max(0, capitalOriginal - totalDescuentosPreview);

    // 1. Selección de Modo de Renovación
    const { value: modo, isDismissed } = await Swal.fire({
        title: 'Modo de Renovación',
        width: '920px',
        html: `
            <div style="margin-bottom: 1rem; font-size: 1.05rem; color: #e5e7eb; font-weight: 700;">¿Cómo desea renovar la inversión?</div>
            <div style="display: grid; grid-template-columns: minmax(280px, 0.9fr) minmax(360px, 1.1fr); gap: 1rem; align-items: stretch;">
                <div style="font-size: 1rem; background: #f8fafc; padding: 1.2rem; border-radius: 1rem; text-align: left; border: 1px solid #dbe3ee; box-shadow: 0 14px 30px rgba(0,0,0,0.22); color: #1e293b;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
                        <span style="color: #334155; font-weight: 700;">Capital Inicial:</span>
                        <span style="font-weight: 800; color: #0f172a;">${formatMoney(capitalOriginal)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
                        <span style="color: #334155; font-weight: 700;">Interés al Vencimiento (${diasPoliza} días):</span>
                        <span style="font-weight: 800; color: #10b981;">${formatMoney(interesAlVencimiento)}</span>
                    </div>
                    <hr style="margin: 0.85rem 0; border: none; border-top: 1px solid #e2e8f0;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; color: #1e293b;">VALOR AL VENCIMIENTO:</span>
                        <span style="color: #0B4E32; font-weight: 900; font-size: 1.35rem;">${formatMoney(valorVencimientoTotal)}</span>
                    </div>
                </div>
                ${renderPolizaRenewalDebtSummary(resumenDescuentos)}
            </div>
            <div style="margin-top: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; text-align: left;">
                <div style="background: #052e1c; border: 1px solid #16a34a; border-radius: 0.85rem; padding: 0.85rem;">
                    <div style="color: #bbf7d0; font-size: 0.78rem; font-weight: 900; text-transform: uppercase;">Renovando capital + interés</div>
                    <div style="color: #fff; font-size: 1.2rem; font-weight: 900;">${formatMoney(saldoCapitalMasInteresPreview)}</div>
                </div>
                <div style="background: #172554; border: 1px solid #3b82f6; border-radius: 0.85rem; padding: 0.85rem;">
                    <div style="color: #bfdbfe; font-size: 0.78rem; font-weight: 900; text-transform: uppercase;">Renovando solo capital</div>
                    <div style="color: #fff; font-size: 1.2rem; font-weight: 900;">${formatMoney(saldoSoloCapitalPreview)}</div>
                </div>
            </div>
            <p style="font-size: 0.85rem; color: #cbd5e1; margin-top: 1rem; line-height: 1.4;">
                <i class="fas fa-info-circle"></i> La renovación usa siempre el valor pactado al vencimiento de la póliza.
            </p>
            <button type="button" id="btn-poliza-descuentos-pdf" style="width: 100%; margin-top: 0.25rem; padding: 0.85rem 1rem; border: 1px solid #93c5fd; border-radius: 0.8rem; background: #1e3a8a; color: #eff6ff; font-weight: 900; cursor: pointer;">
                <i class="fas fa-file-pdf"></i> Descargar detalle de descuentos PDF
            </button>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#0B4E32',
        denyButtonColor: '#3B82F6',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Capital + Interés',
        denyButtonText: 'Solo Capital',
        cancelButtonText: 'Cancelar',
        background: '#1f2937',
        color: '#f8fafc',
        didOpen: () => {
            const btnPdf = document.getElementById('btn-poliza-descuentos-pdf');
            btnPdf?.addEventListener('click', async () => {
                await generatePolizaRenewalDiscountsPDF(poliza, resumenDescuentos, {
                    capitalOriginal,
                    interesAlVencimiento,
                    valorVencimientoTotal,
                    saldoCapitalMasInteresPreview,
                    saldoSoloCapitalPreview,
                    totalDescuentosPreview,
                    diasPoliza
                });
            });
        }
    });

    if (isDismissed) return;

    // modo === true (Confirm) -> Capital + Interés
    // modo === false (Deny) -> Solo Capital
    const esCapitalMasInteres = (modo === true);
    const capitalAntesDescuento = parseFloat((esCapitalMasInteres ? valorVencimientoTotal : capitalOriginal).toFixed(2));
    const totalDescuentosRenovacion = parseFloat((resumenDescuentos.total || 0).toFixed(2));
    const nuevoCapitalBase = parseFloat(Math.max(0, capitalAntesDescuento - totalDescuentosRenovacion).toFixed(2));

    if (nuevoCapitalBase <= 0) {
        Swal.fire(
            'Saldo insuficiente',
            `Las deudas pendientes (${formatMoney(totalDescuentosRenovacion)}) consumen el valor disponible para renovar (${formatMoney(capitalAntesDescuento)}).`,
            'warning'
        );
        return;
    }

    // 2. Calcular Nueva Proyección para la nueva póliza (Regla del 17)
    const nuevaFechaVenc = calculateFixed17Maturity(hoyISO, poliza.plazo);
    let nuevoInteres = parseFloat(poliza.interes);
    let nuevoInteresTotal = (nuevoCapitalBase * (nuevoInteres / 100) * (parseInt(poliza.plazo) / 12));
    let currentNuevoValorFinal = parseFloat((nuevoCapitalBase + nuevoInteresTotal).toFixed(2));

    // 3. Confirmación Detallada y Generación de Contrato
    let contratoGenerado = false;
    const { value: confirmado } = await Swal.fire({
        title: 'Confirmar Nueva Inversión',
        width: '820px',
        html: `
            <div style="text-align: left; background: #ffffff; padding: 1.8rem; border-radius: 1.25rem; border: 2.5px solid #0B4E32; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);">
                <p style="margin-bottom: 1rem;"><small style="color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">Nueva Póliza Renovada</small></p>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-size: 1.05rem;">
                    <span style="color: #475569;">Valor elegido para renovar:</span>
                    <span style="font-weight: 800; color: #0f172a;">${formatMoney(capitalAntesDescuento)}</span>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-size: 1.05rem;">
                    <span style="color: #991b1b;">Descuento de deudas:</span>
                    <span style="font-weight: 900; color: #dc2626;">-${formatMoney(totalDescuentosRenovacion)}</span>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-size: 1.05rem; background: #ecfdf5; border: 1px solid #bbf7d0; padding: 0.75rem 1rem; border-radius: 0.75rem;">
                    <span style="color: #065f46; font-weight: 900;">Nuevo Capital Base:</span>
                    <span style="font-weight: 800; color: #0b4e32;">${formatMoney(nuevoCapitalBase)}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; background: #f1f5f9; padding: 0.75rem 1rem; border-radius: 0.75rem; border: 1px solid #e2e8f0;">
                    <span style="font-weight: 700; color: #1e293b;">Nueva Tasa Sugerida:</span>
                    <div style="position: relative; width: 120px;">
                        <input type="number" id="nuevo-interes-renovacion" step="0.01" value="${nuevoInteres}" 
                            style="width: 100%; padding: 8px 30px 8px 12px; border: 2px solid #0B4E32; border-radius: 8px; text-align: right; font-weight: 900; color: #0B4E32; font-size: 1.2rem; background: #fff; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
                        <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-weight: 900; color: #0B4E32; font-size: 1.1rem;">%</span>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; font-size: 1.05rem;">
                    <span style="color: #475569;">Vencimiento (Día 17):</span>
                    <span style="font-weight: 800; color: #b45309;">${formatDate(nuevaFechaVenc)}</span>
                </div>
                
                <hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 1.2rem 0;">
                
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #1e293b; font-size: 1.1rem;">VALOR AL FINALIZAR:</span>
                    <span id="display-nuevo-valor-final" style="font-size: 1.7rem; font-weight: 900; color: #0b4e32;">${formatMoney(currentNuevoValorFinal)}</span>
                </div>
            </div>

            <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem;">
                <button type="button" id="btn-descargar-contrato" class="swal2-confirm swal2-styled" style="background-color: #3B82F6; margin: 0;">
                    <i class="fas fa-file-pdf"></i> Ver Contrato PDF
                </button>
                <div id="msg-recordatorio-firma" class="hidden" style="padding: 0.8rem; background: #ecfdf5; border-radius: 0.5rem; border: 1px solid #bbf7d0; color: #065f46; font-size: 0.85rem; font-weight: 700;">
                    El contrato se aceptó y podemos firmar.
                </div>
            </div>

            ${!esCapitalMasInteres ? `
                <div style="margin-top: 1rem; padding: 0.8rem; background: #ecfdf5; border-radius: 0.5rem; border: 1px solid #10b981; color: #065f46; font-size: 0.9rem;">
                    <i class="fas fa-hand-holding-usd"></i> Se pagará al socio el interés al vencimiento cuando aplique.
                </div>
            ` : ''}
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Generar Renovación',
        confirmButtonColor: '#0B4E32',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            const btnConfirm = Swal.getConfirmButton();
            const btnPDF = document.getElementById('btn-descargar-contrato');
            const msgFirma = document.getElementById('msg-recordatorio-firma');
            const inputInteres = document.getElementById('nuevo-interes-renovacion');
            const displayValorFinal = document.getElementById('display-nuevo-valor-final');

            btnConfirm.disabled = true;
            btnConfirm.style.opacity = '0.5';

            // Listener para actualizar el cálculo si cambia el interés
            inputInteres.addEventListener('input', () => {
                nuevoInteres = parseFloat(inputInteres.value) || 0;
                nuevoInteresTotal = (nuevoCapitalBase * (nuevoInteres / 100) * (parseInt(poliza.plazo) / 12));
                currentNuevoValorFinal = parseFloat((nuevoCapitalBase + nuevoInteresTotal).toFixed(2));
                displayValorFinal.textContent = formatMoney(currentNuevoValorFinal);
            });

            btnPDF.addEventListener('click', async () => {
                const previewWindow = window.open('', '_blank');
                if (previewWindow) {
                    previewWindow.document.write('<p style="font-family: sans-serif; padding: 24px;">Generando contrato...</p>');
                }

                const dataPDF = {
                    id_poliza: poliza.id_poliza,
                    socio: poliza.socio,
                    capital: nuevoCapitalBase,
                    interes: nuevoInteres,
                    fecha_inicio: hoyISO,
                    fecha_venc: nuevaFechaVenc,
                    valor_final: currentNuevoValorFinal,
                    renovacion: {
                        capital_antes_descuento: capitalAntesDescuento,
                        descuentos: resumenDescuentos,
                        total_descuentos: totalDescuentosRenovacion,
                        valor_vencimiento: valorVencimientoTotal,
                        modo: esCapitalMasInteres ? 'CAPITAL_MAS_INTERES' : 'SOLO_CAPITAL'
                    }
                };

                await generatePolizaPDF(dataPDF, { preview: true, previewWindow });

                contratoGenerado = true;
                btnConfirm.disabled = false;
                btnConfirm.style.opacity = '1';
                msgFirma.classList.remove('hidden');
                btnPDF.innerHTML = '<i class="fas fa-check"></i> Contrato visto y aceptado';
                btnPDF.style.background = '#10B981';
            });
        }
    });

    if (!confirmado) return;

    try {
        beginLoading('Procesando renovación...');
        const supabase = getSupabaseClient();

        // 1. Registrar pagos descontados de créditos antes de crear la nueva póliza
        await registerPolizaRenewalCreditPayments(supabase, poliza, resumenDescuentos);

        // 2. Marcar póliza actual
        const nuevoEstadoPadre = esCapitalMasInteres ? 'CAPITALIZADO' : 'PAGADO';
        await supabase.from('ic_polizas').update({
            estado: nuevoEstadoPadre,
            updated_at: new Date().toISOString()
        }).eq('id_poliza', poliza.id_poliza);

        // 3. Si es Solo Capital, registrar pago del interés real acumulado
        if (!esCapitalMasInteres) {
            await supabase.from('ic_polizas_pagos').insert([{
                id_poliza: poliza.id_poliza,
                id_socio: poliza.id_socio,
                monto_total_pagado: interesAlVencimiento,
                monto_capital: 0,
                monto_interes: interesAlVencimiento,
                tipo_pago: 'PAGO_INTERES_RENOVACION',
                notas: `Intereses al vencimiento pagados al socio por ${diasPoliza} días de inversión.`
            }]);
        }

        // 4. Crear Nueva Póliza con el nuevo capital base (pro-rateado)
        const { error: errNew } = await supabase.from('ic_polizas').insert([{
            id_socio: poliza.id_socio,
            fecha: hoyISO,
            valor: nuevoCapitalBase,
            interes: nuevoInteres,
            plazo: poliza.plazo,
            fecha_vencimiento: nuevaFechaVenc,
            valor_final: currentNuevoValorFinal.toFixed(2),
            estado: 'ACTIVO',
            notas: `Renovación de póliza ${poliza.id_poliza.substring(0, 8)} | Valor tomado al vencimiento por ${diasPoliza} días. Descuentos aplicados: ${formatMoney(totalDescuentosRenovacion)}.`
        }]);

        if (errNew) throw errNew;

        Swal.fire('Renovación Exitosa', 'Se ha generado la nueva inversión ajustada a la fecha.', 'success');

        const modal = document.getElementById('poliza-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        document.body.style.overflow = '';
        await loadPolizas(true);

    } catch (error) {
        console.error('Error renovando póliza:', error);
        await window.showFinancialError?.(error, 'No se pudo procesar la renovación.')
            || Swal.fire('Error', 'No se pudo procesar la renovación', 'error');
    } finally {
        endLoading();
    }
}

async function loadPolizaRenewalDeductions(idSocio) {
    const supabase = getSupabaseClient();
    if (!supabase || !idSocio) {
        return { total: 0, creditosNormales: [], creditosPreferenciales: [], error: null };
    }

    const [normalRes, prefRes] = await Promise.all([
        loadNormalCreditDeductionsForRenewal(supabase, idSocio),
        loadPreferentialCreditDeductionsForRenewal(supabase, idSocio)
    ]);

    const totalNormales = normalRes.reduce((sum, item) => sum + item.total, 0);
    const totalPreferenciales = prefRes.reduce((sum, item) => sum + item.total, 0);

    return {
        total: parseFloat((totalNormales + totalPreferenciales).toFixed(2)),
        creditosNormales: normalRes,
        creditosPreferenciales: prefRes,
        error: null
    };
}

async function loadNormalCreditDeductionsForRenewal(supabase, idSocio) {
    const { data: creditos, error } = await supabase
        .from('ic_creditos')
        .select(`
            id_credito,
            codigo_credito,
            capital,
            plazo,
            cuotas_pagadas,
            cuotas_en_mora,
            estado_credito,
            amortizacion:ic_creditos_amortizacion (
                id_detalle,
                numero_cuota,
                fecha_vencimiento,
                cuota_total,
                estado_cuota
            )
        `)
        .eq('id_socio', idSocio)
        .in('estado_credito', ['ACTIVO', 'MOROSO']);

    if (error) throw error;
    if (!creditos?.length) return [];

    const detalleIds = creditos
        .flatMap(c => c.amortizacion || [])
        .filter(c => ['PENDIENTE', 'VENCIDO', 'PARCIAL'].includes(c.estado_cuota))
        .map(c => c.id_detalle);

    let pagosPorDetalle = new Map();
    if (detalleIds.length > 0) {
        const { data: pagos, error: pagosError } = await supabase
            .from('ic_creditos_pagos')
            .select('id_detalle, monto_pagado')
            .in('id_detalle', detalleIds);

        if (pagosError) throw pagosError;
        pagosPorDetalle = (pagos || []).reduce((map, pago) => {
            const current = map.get(pago.id_detalle) || 0;
            map.set(pago.id_detalle, current + parsePolizaMoney(pago.monto_pagado));
            return map;
        }, new Map());
    }

    const paidDetalleMap = new Map();
    creditos.forEach(credito => {
        (credito.amortizacion || []).forEach(cuota => {
            if (cuota.estado_cuota === 'PAGADO') {
                paidDetalleMap.set(cuota.id_detalle, {
                    idCredito: credito.id_credito,
                    numero: cuota.numero_cuota,
                    fechaVencimiento: cuota.fecha_vencimiento
                });
            }
        });
    });

    let pagosHistorialPorCredito = new Map();
    const paidDetalleIds = Array.from(paidDetalleMap.keys());
    if (paidDetalleIds.length > 0) {
        const { data: pagosHistorial, error: pagosHistorialError } = await supabase
            .from('ic_creditos_pagos')
            .select('id_credito, id_detalle, fecha_pago, monto_pagado, metodo_pago, referencia_pago, comprobante_url, observaciones')
            .in('id_detalle', paidDetalleIds)
            .order('fecha_pago', { ascending: true });

        if (pagosHistorialError) throw pagosHistorialError;

        pagosHistorialPorCredito = (pagosHistorial || []).reduce((map, pago) => {
            const detalle = paidDetalleMap.get(pago.id_detalle) || {};
            const key = pago.id_credito || detalle.idCredito;
            if (!key) return map;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push({
                ...pago,
                numero_cuota: detalle.numero,
                fecha_vencimiento: detalle.fechaVencimiento
            });
            return map;
        }, new Map());
    }

    return creditos.map(credito => {
        const cuotasPendientes = (credito.amortizacion || [])
            .filter(cuota => ['PENDIENTE', 'VENCIDO', 'PARCIAL'].includes(cuota.estado_cuota))
            .map(cuota => {
                const cuotaTotal = parsePolizaMoney(cuota.cuota_total);
                const abonado = pagosPorDetalle.get(cuota.id_detalle) || 0;
                const saldoBase = parseFloat(Math.max(0, cuotaTotal - abonado).toFixed(2));
                const mora = calculatePolizaRenewalMora(cuota.fecha_vencimiento, todayISODate());
                return {
                    id_detalle: cuota.id_detalle,
                    numero: cuota.numero_cuota,
                    numero_cuota: cuota.numero_cuota,
                    estado: cuota.estado_cuota,
                    estado_cuota: cuota.estado_cuota,
                    fecha_vencimiento: cuota.fecha_vencimiento,
                    cuota_total: saldoBase,
                    montoBase: saldoBase,
                    diasMora: mora.diasMora,
                    montoMora: mora.montoMora,
                    estaEnMora: mora.estaEnMora,
                    saldo: parseFloat((saldoBase + mora.montoMora).toFixed(2))
                };
            })
            .filter(cuota => cuota.saldo > 0);

        const total = cuotasPendientes.reduce((sum, cuota) => sum + cuota.saldo, 0);
        const totalMora = cuotasPendientes.reduce((sum, cuota) => sum + cuota.montoMora, 0);
        return {
            id: credito.id_credito,
            label: credito.codigo_credito || `CR-${String(credito.id_credito).slice(0, 8)}`,
            estado: credito.estado_credito,
            plazo: parseInt(credito.plazo) || 0,
            cuotasPagadas: parseInt(credito.cuotas_pagadas) || 0,
            cuotasEnMora: parseInt(credito.cuotas_en_mora) || 0,
            total: parseFloat(total.toFixed(2)),
            totalMora: parseFloat(totalMora.toFixed(2)),
            cuotas: cuotasPendientes,
            pagosHistorial: pagosHistorialPorCredito.get(credito.id_credito) || [],
            detalle: `${cuotasPendientes.length} cuota${cuotasPendientes.length === 1 ? '' : 's'} pendiente${cuotasPendientes.length === 1 ? '' : 's'}${totalMora > 0 ? `, incluye mora ${formatMoney(totalMora)}` : ''}`
        };
    }).filter(item => item.total > 0);
}

async function loadPreferentialCreditDeductionsForRenewal(supabase, idSocio) {
    const { data: creditos, error } = await supabase
        .from('ic_preferencial')
        .select('idcredito, idsocio, tipo, fechaaprobacion, fechasolicitud, porcentaje, motivo, fotografia, monto, montofinal, estado')
        .eq('idsocio', idSocio)
        .in('estado', ['DESEMBOLSADO', 'ABONADO']);

    if (error) throw error;
    if (!creditos?.length) return [];

    const idsCreditos = creditos.map(c => c.idcredito);

    const { data: pagos, error: pagosError } = await supabase
        .from('ic_preferencial_pagos')
        .select('*')
        .in('id_credito', idsCreditos)
        .order('fecha_pago', { ascending: true });

    if (pagosError) throw pagosError;

    const pagosPorCredito = (pagos || []).reduce((map, pago) => {
        const key = pago.id_credito;
        if (!key) return map;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(pago);
        return map;
    }, new Map());

    return creditos.map(credito => {
        const pagosCredito = pagosPorCredito.get(credito.idcredito) || [];
        const balance = calculatePolizaPreferentialCreditBalance(credito, pagosCredito);
        const total = parseFloat(Math.max(0, balance.saldo).toFixed(2));

        return {
            id: credito.idcredito,
            label: `${credito.tipo || 'Preferencial'} ${credito.fechaaprobacion ? `(${credito.fechaaprobacion})` : ''}`,
            total,
            capital: balance.capitalPendiente,
            interes: balance.interesPendiente,
            motivo: credito.motivo || '',
            comprobanteDesembolso: credito.fotografia || '',
            pagos: pagosCredito,
            detalle: `Saldo a hoy con ${formatPolizaPreferentialRate(credito)} mensual`
        };
    }).filter(item => item.total > 0);
}

function calculatePolizaPreferentialCreditBalance(credito, pagos = [], untilDate = new Date()) {
    const principalOriginal = parsePolizaMoney(credito.montofinal || credito.monto || 0);
    const monthlyRate = parsePolizaPreferentialMonthlyRate(credito);
    const startDate = parsePolizaPreferentialDate(credito.fechaaprobacion || credito.fechasolicitud) || parsePolizaPreferentialDate(credito.created_at) || new Date();
    const endDate = untilDate instanceof Date ? untilDate : parsePolizaPreferentialDate(untilDate) || new Date();
    const sortedPayments = [...(pagos || [])]
        .filter(p => parsePolizaMoney(p.monto_abonado) > 0)
        .sort((a, b) => (parsePolizaPreferentialDate(a.fecha_pago)?.getTime() || 0) - (parsePolizaPreferentialDate(b.fecha_pago)?.getTime() || 0));

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
        const paymentDate = parsePolizaPreferentialDate(pago.fecha_pago) || cursor;
        accrueUntil(paymentDate);

        let montoPago = parsePolizaMoney(pago.monto_abonado);
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

function parsePolizaPreferentialMonthlyRate(credito) {
    const raw = credito?.porcentaje ? credito.porcentaje.toString().replace('%', '').replace(',', '.').trim() : '0';
    const rate = parseFloat(raw);
    return Number.isFinite(rate) ? rate / 100 : 0;
}

function formatPolizaPreferentialRate(credito) {
    const rate = parsePolizaPreferentialMonthlyRate(credito) * 100;
    return `${rate.toFixed(2)}%`;
}

function parsePolizaPreferentialDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;

    if (typeof value === 'string' && value.includes('/')) {
        const parts = value.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

async function registerPolizaRenewalCreditPayments(supabase, poliza, resumenDescuentos) {
    const creditosNormales = resumenDescuentos?.creditosNormales || [];
    const creditosPreferenciales = resumenDescuentos?.creditosPreferenciales || [];

    if (!creditosNormales.length && !creditosPreferenciales.length) return;

    const user = window.currentUser || (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
    const fechaPago = todayISODate();
    const referencia = `DESC-POL-${String(poliza.id_poliza || Date.now()).slice(0, 8).toUpperCase()}`;
    const socio = await getPolizaRenewalSocioInfo(supabase, poliza);

    for (const credito of creditosNormales) {
        await registerNormalCreditRenewalPayment(supabase, credito, poliza, socio, {
            fechaPago,
            referencia,
            user
        });
    }

    if (creditosPreferenciales.length) {
        await registerPreferentialCreditRenewalPayment(supabase, poliza, creditosPreferenciales, {
            fechaPago,
            referencia
        });
    }
}

async function registerNormalCreditRenewalPayment(supabase, credito, poliza, socio, options) {
    const cuotas = (credito.cuotas || []).filter(cuota => cuota.saldo > 0);
    if (!cuotas.length) return;

    const cantidadCuotas = cuotas.length;
    const montoBase = parseFloat(cuotas.reduce((sum, cuota) => sum + parsePolizaMoney(cuota.montoBase), 0).toFixed(2));
    const totalMora = parseFloat(cuotas.reduce((sum, cuota) => sum + parsePolizaMoney(cuota.montoMora), 0).toFixed(2));
    const montoPagado = parseFloat((montoBase + totalMora).toFixed(2));
    const metodoPago = 'OTRO';
    const obsFinal = `[DESCUENTO POR RENOVACION DE POLIZA] Poliza ${String(poliza.id_poliza || '').slice(0, 8)}. Comprobante fijo: ${POLIZA_RENOVACION_COMPROBANTE_URL}${totalMora > 0 ? ` | MORA TOTAL: $${totalMora.toFixed(2)}` : ''}`;

    for (let i = 0; i < cuotas.length; i++) {
        const cuota = cuotas[i];
        const montoParaRegistro = cantidadCuotas === 1
            ? montoPagado
            : parseFloat((parsePolizaMoney(cuota.montoBase) + parsePolizaMoney(cuota.montoMora)).toFixed(2));

        if (montoParaRegistro <= 0) continue;

        const { error: errorPago } = await supabase
            .from('ic_creditos_pagos')
            .insert({
                id_detalle: cuota.id_detalle,
                id_credito: credito.id,
                fecha_pago: options.fechaPago,
                monto_pagado: montoParaRegistro,
                metodo_pago: metodoPago,
                referencia_pago: options.referencia,
                observaciones: obsFinal,
                comprobante_url: POLIZA_RENOVACION_COMPROBANTE_URL,
                cobrado_por: (options.user?.id) || null
            });

        if (errorPago) throw errorPago;

        const { error: errorCuota } = await supabase
            .from('ic_creditos_amortizacion')
            .update({
                estado_cuota: 'PAGADO',
                requiere_cobro: false,
                recordatorio_enviado: false,
                updated_at: new Date().toISOString()
            })
            .eq('id_detalle', cuota.id_detalle);

        if (errorCuota) throw errorCuota;

        const { error: errorAhorro } = await supabase
            .from('ic_creditos_ahorro')
            .update({
                estado: 'ACUMULADO',
                updated_at: new Date().toISOString()
            })
            .eq('id_credito', credito.id)
            .eq('numero_cuota', cuota.numero_cuota);

        if (errorAhorro) console.error('Error actualizando ahorro por renovacion:', errorAhorro);
    }

    const nuevasCuotasPagadas = (credito.cuotasPagadas || 0) + cantidadCuotas;
    const cuotasPagadasEnMora = cuotas.filter(cuota => cuota.estaEnMora).length;
    const nuevasCuotasEnMora = Math.max(0, (credito.cuotasEnMora || 0) - cuotasPagadasEnMora);
    const nuevoEstadoCredito = nuevasCuotasPagadas >= (credito.plazo || 0) ? 'CANCELADO' : 'ACTIVO';

    const { error: errorCredito } = await supabase
        .from('ic_creditos')
        .update({
            cuotas_pagadas: nuevasCuotasPagadas,
            cuotas_en_mora: nuevasCuotasEnMora,
            estado_credito: nuevoEstadoCredito,
            updated_at: new Date().toISOString()
        })
        .eq('id_credito', credito.id);

    if (errorCredito) throw errorCredito;

    await notifyPolizaRenewalCreditPayment({
        socio,
        credito,
        cuotas,
        cantidadCuotas,
        montoBase,
        totalMora,
        montoPagado,
        fechaPago: options.fechaPago,
        metodoPago,
        nuevasCuotasPagadas
    });
}

async function registerPreferentialCreditRenewalPayment(supabase, poliza, creditosPreferenciales, options) {
    for (const credito of creditosPreferenciales) {
        const monto = parseFloat(parsePolizaMoney(credito.total).toFixed(2));
        if (monto <= 0) continue;

        const { error } = await supabase.from('ic_preferencial_pagos').insert([{
            id_credito: credito.id,
            id_socio: poliza.id_socio,
            monto_abonado: monto,
            fecha_pago: options.fechaPago,
            comprobante_url: POLIZA_RENOVACION_COMPROBANTE_URL,
            tipo_pago: 'PAGO_TOTAL',
            notas: `Descuento automático por renovación de póliza ${String(poliza.id_poliza || '').slice(0, 8)}.`,
            notas_admin: `[DESCUENTO POR RENOVACION DE POLIZA] ${options.referencia}. ${credito.label}: ${formatMoney(monto)}`,
            capital_pendiente_despues: 0,
            interes_pendiente_despues: 0,
            saldo_pendiente_despues: 0
        }]);

        if (error) throw error;

        const { error: estadoError } = await supabase
            .from('ic_preferencial')
            .update({ estado: 'PAGADO' })
            .eq('idcredito', credito.id);

        if (estadoError) throw estadoError;
    }
}

async function notifyPolizaRenewalCreditPayment(data) {
    try {
        const fechaRegistro = formatPolizaRenewalEcuadorDateTime();
        const socioNombre = data.socio?.nombre || 'Socio';
        const socioCedula = data.socio?.cedula || 'N/A';
        const codigoCredito = data.credito.label;
        const plazo = data.credito.plazo || data.nuevasCuotasPagadas;
        const whatsapp = data.socio?.whatsapp || '';
        const cuotasPagadasAntes = data.nuevasCuotasPagadas - data.cantidadCuotas;

        let message;
        let detailList;
        if (data.cantidadCuotas === 1) {
            const cuota = data.cuotas[0];
            const estadoCuota = cuota.estaEnMora ? 'EN MORA' : 'A TIEMPO';
            const moraTexto = cuota.estaEnMora ? `\nMORA: ${cuota.diasMora} dias x $2 = ${formatMoney(cuota.montoMora)}` : '';
            message = `HOLA ${socioNombre.toUpperCase()}\n\nPAGO REGISTRADO EXITOSAMENTE\n\nMuchas gracias por realizar tu pago de cuota ${cuota.numero_cuota} de ${plazo}, te informamos que ha sido registrado correctamente.\n\nDETALLES DEL PAGO:\nCuota: ${cuota.numero_cuota} de ${plazo}\nEstado: ${estadoCuota}${moraTexto}\nTOTAL PAGADO: ${formatMoney(data.montoPagado)}\nFecha de pago: ${formatDate(data.fechaPago)}\nRegistrado: ${fechaRegistro}\nMetodo: ${data.metodoPago}\n\nPROGRESO: ${data.nuevasCuotasPagadas}/${plazo} cuotas pagadas\n\nINKA CORP - Tu confianza, nuestro compromiso`;
            detailList = `Cuota: ${cuota.numero_cuota} de ${plazo}\nEstado: ${estadoCuota}${data.totalMora > 0 ? ` (Mora: ${formatMoney(data.totalMora)})` : ''}`;
        } else {
            const listaCuotas = data.cuotas
                .map(cuota => `  - Cuota ${cuota.numero_cuota}: ${formatMoney(parsePolizaMoney(cuota.montoBase) + parsePolizaMoney(cuota.montoMora))}`)
                .join('\n');
            const moraTexto = data.totalMora > 0 ? `\nMORA TOTAL: ${formatMoney(data.totalMora)}` : '';
            message = `HOLA ${socioNombre.toUpperCase()}\n\nPAGO MULTIPLE REGISTRADO\n\nMuchas gracias por adelantar ${data.cantidadCuotas} cuotas de tu credito. Tu pago ha sido registrado correctamente.\n\nDETALLE DE CUOTAS PAGADAS:\n${listaCuotas}\nSubtotal cuotas: ${formatMoney(data.montoBase)}${moraTexto}\nTOTAL PAGADO: ${formatMoney(data.montoPagado)}\nFecha de pago: ${formatDate(data.fechaPago)}\nRegistrado: ${fechaRegistro}\nMetodo: ${data.metodoPago}\n\nPROGRESO: ${data.nuevasCuotasPagadas}/${plazo} cuotas pagadas\n\nINKA CORP - Tu confianza, nuestro compromiso`;
            detailList = `Cuotas pagadas: ${data.cantidadCuotas}\nDetalle: ${data.montoBase.toFixed(2)}${data.totalMora > 0 ? ` + Mora: ${data.totalMora.toFixed(2)}` : ''}`;
        }

        const socioResult = await sendPolizaRenewalImageWebhook({
            whatsapp,
            image_url: POLIZA_RENOVACION_COMPROBANTE_URL,
            comprobante_url: POLIZA_RENOVACION_COMPROBANTE_URL,
            message
        });

        const socioStatusMessage = socioResult.success
            ? 'El socio ya fue notificado correctamente por WhatsApp.'
            : 'Atencion: el intento de notificacion directa al socio por WhatsApp no se completo correctamente.';

        const ownerMessage = `JOSE KLEVER NISHVE CORO se ha registrado el pago de un credito con los siguientes detalles:\n\nSocio: ${socioNombre.toUpperCase()}\nCedula: ${socioCedula}\nCredito: ${codigoCredito}\n${detailList}\nTOTAL RECIBIDO: ${formatMoney(data.montoPagado)}\nFecha Pago: ${formatDate(data.fechaPago)}\nRegistro: ${fechaRegistro}\nMetodo: ${data.metodoPago}\n\n${socioStatusMessage}`;

        await sendPolizaRenewalImageWebhook({
            whatsapp: '19175309618',
            image_url: POLIZA_RENOVACION_COMPROBANTE_URL,
            comprobante_url: POLIZA_RENOVACION_COMPROBANTE_URL,
            message: ownerMessage
        });

        console.log('Webhook de descuento por renovacion enviado. Cuotas previas:', cuotasPagadasAntes);
    } catch (error) {
        console.error('Error enviando webhook por descuento de renovacion:', error);
    }
}

async function sendPolizaRenewalImageWebhook(payload) {
    if (typeof window.sendImageNotificationWebhook === 'function') {
        return window.sendImageNotificationWebhook(payload);
    }

    const WEBHOOK_URL_N8N = 'https://lpn8nwebhook.luispintasolutions.com/webhook/notificarimagenes';
    try {
        const response = await fetch(WEBHOOK_URL_N8N, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { success: true };
    } catch (error) {
        console.error('Error enviando notificacion a n8n:', error);
        return { success: false, error: error.message };
    }
}

async function getPolizaRenewalSocioInfo(supabase, poliza) {
    if (poliza.socio?.whatsapp && poliza.socio?.nombre && poliza.socio?.cedula) return poliza.socio;

    const { data } = await supabase
        .from('ic_socios')
        .select('idsocio, nombre, cedula, whatsapp')
        .eq('idsocio', poliza.id_socio)
        .maybeSingle();

    return { ...(poliza.socio || {}), ...(data || {}) };
}

function calculatePolizaRenewalMora(fechaVencimiento, fechaPago = null, costoPorDia = 2) {
    if (!fechaVencimiento) return { diasMora: 0, montoMora: 0, estaEnMora: false };

    const fechaPagoDate = fechaPago ? parseDate(fechaPago) : new Date();
    const fechaVencDate = parseDate(fechaVencimiento);
    if (!fechaPagoDate || !fechaVencDate) return { diasMora: 0, montoMora: 0, estaEnMora: false };

    const diffTime = fechaPagoDate.getTime() - fechaVencDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return { diasMora: 0, montoMora: 0, estaEnMora: false };

    return {
        diasMora: diffDays,
        montoMora: diffDays * costoPorDia,
        estaEnMora: true
    };
}

function formatPolizaRenewalEcuadorDateTime() {
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

function renderPolizaRenewalDebtSummary(resumen) {
    const creditosNormales = resumen.creditosNormales || [];
    const creditosPreferenciales = resumen.creditosPreferenciales || [];
    const total = resumen.total || 0;

    if (resumen.error) {
        return `
            <div style="padding: 1rem; border-radius: 0.9rem; background: #7f1d1d; color: #fee2e2; border: 1px solid #ef4444; text-align: left;">
                <strong><i class="fas fa-exclamation-triangle"></i> No se pudieron calcular descuentos de créditos.</strong>
                <div style="font-size: 0.85rem; margin-top: 0.35rem;">${escapePolizaHtml(resumen.error)}</div>
            </div>
        `;
    }

    return `
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 1rem; padding: 1rem; text-align: left; color: #e5e7eb; max-height: 260px; overflow-y: auto;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.85rem;">
                <strong style="color: #f8fafc;"><i class="fas fa-balance-scale"></i> Descuentos antes de renovar</strong>
                <span style="font-weight: 900; color: ${total > 0 ? '#fca5a5' : '#86efac'};">${total > 0 ? '-' : ''}${formatMoney(total)}</span>
            </div>
            ${renderPolizaRenewalDebtGroup('Créditos normales', creditosNormales, 'No registra créditos normales vigentes con saldo pendiente.')}
            ${renderPolizaRenewalDebtGroup('Créditos preferenciales', creditosPreferenciales, 'No registra créditos preferenciales activos.')}
        </div>
    `;
}

function renderPolizaRenewalDebtGroup(title, items, emptyText) {
    const rows = items.length
        ? items.map(item => `
            <div style="display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.55rem 0; border-top: 1px solid rgba(148, 163, 184, 0.18);">
                <div style="min-width: 0;">
                    <div style="font-weight: 800; color: #f8fafc;">${escapePolizaHtml(item.label)}</div>
                    <div style="font-size: 0.78rem; color: #cbd5e1;">${escapePolizaHtml(item.detalle || '')}</div>
                </div>
                <div style="font-weight: 900; color: #fca5a5; white-space: nowrap;">-${formatMoney(item.total)}</div>
            </div>
        `).join('')
        : `<div style="padding: 0.45rem 0; color: #94a3b8; font-size: 0.85rem;">${emptyText}</div>`;

    return `
        <div style="margin-top: 0.75rem;">
            <div style="color: #93c5fd; font-size: 0.78rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;">${title}</div>
            ${rows}
        </div>
    `;
}

function parsePolizaMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const clean = String(value || '0').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(clean);
    return Number.isFinite(parsed) ? parsed : 0;
}

function escapePolizaHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function generatePolizaRenewalDiscountsPDF(poliza, resumen, polizaDetalle = {}) {
    const { jsPDF } = window.jspdf;
    const doc = jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);
    let y = 16;

    const ensureSpace = (needed = 20) => {
        if (y + needed > 280) {
            doc.addPage();
            y = 16;
        }
    };

    const text = (value, x, opts = {}) => {
        const lines = doc.splitTextToSize(String(value || ''), opts.width || contentWidth);
        doc.text(lines, x, y, opts.options || {});
        y += (lines.length * (opts.lineHeight || 5));
    };

    const sectionTitle = (title) => {
        ensureSpace(16);
        doc.setFillColor(32, 70, 82);
        doc.rect(margin, y, contentWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255);
        doc.text(title, margin + 3, y + 4.8);
        y += 12;
        doc.setTextColor(0);
    };

    const drawPaymentTable = (rows, columns) => {
        if (!rows?.length) return;
        ensureSpace(14);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, y - 4, contentWidth, 7, 'F');
        let x = margin + 2;
        columns.forEach(col => {
            doc.text(col.label, x, y);
            x += col.width;
        });
        y += 5;
        doc.setFont('helvetica', 'normal');
        rows.forEach(row => {
            ensureSpace(8);
            x = margin + 2;
            columns.forEach(col => {
                const value = typeof col.value === 'function' ? col.value(row) : row[col.value];
                const lines = doc.splitTextToSize(String(value || '-'), col.width - 2);
                doc.text(lines.slice(0, 2), x, y);
                x += col.width;
            });
            y += 7;
        });
        y += 2;
    };

    const socio = poliza.socio || {};
    const normales = resumen?.creditosNormales || [];
    const preferenciales = resumen?.creditosPreferenciales || [];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(11, 78, 50);
    doc.text('DETALLE DE DESCUENTOS PARA RENOVACION', margin, y);
    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(70);
    doc.text(`Socio: ${socio.nombre || poliza.id_socio || '-'}`, margin, y);
    y += 5;
    doc.text(`Poliza: ${String(poliza.id_poliza || '-').slice(0, 12)} | Fecha: ${formatDate(todayISODate())}`, margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text('Detalle de la póliza', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Capital inicial: ${formatMoney(polizaDetalle.capitalOriginal ?? poliza.valor ?? 0)}`, margin, y);
    doc.text(`Interés al vencimiento (${polizaDetalle.diasPoliza ?? '-'} días): ${formatMoney(polizaDetalle.interesAlVencimiento || 0)}`, margin + 78, y);
    y += 5;
    doc.text(`Valor al vencimiento: ${formatMoney(polizaDetalle.valorVencimientoTotal ?? poliza.valor_final ?? 0)}`, margin, y);
    doc.text(`Total descuentos: ${formatMoney(polizaDetalle.totalDescuentosPreview ?? resumen?.total ?? 0)}`, margin + 78, y);
    y += 5;
    doc.text(`Valor a renovar con capital + intereses: ${formatMoney(polizaDetalle.saldoCapitalMasInteresPreview || 0)}`, margin, y);
    doc.text(`Valor a renovar solo capital: ${formatMoney(polizaDetalle.saldoSoloCapitalPreview || 0)}`, margin + 78, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(153, 27, 27);
    doc.text(`Total a descontar: ${formatMoney(resumen?.total || 0)}`, margin, y);
    y += 8;

    sectionTitle('CREDITOS NORMALES');
    if (!normales.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        text('No registra créditos normales con saldo pendiente para descontar.', margin);
    }
    normales.forEach(item => {
        ensureSpace(18);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0);
        text(`${item.label} | Descuento: ${formatMoney(item.total)} | ${item.detalle}`, margin);
        const pagos = item.pagosHistorial || [];
        if (pagos.length) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('Pagos registrados de cuotas pagadas', margin, y);
            y += 5;
            drawPaymentTable(pagos, [
                { label: 'Cuota', width: 18, value: r => r.numero_cuota || '-' },
                { label: 'Fecha Pago', width: 28, value: r => formatDate(r.fecha_pago) },
                { label: 'Monto', width: 24, value: r => formatMoney(r.monto_pagado) },
                { label: 'Metodo', width: 26, value: r => r.metodo_pago || '-' },
                { label: 'Referencia', width: 45, value: r => r.referencia_pago || '-' },
                { label: 'Comprobante', width: 38, value: r => r.comprobante_url ? 'Registrado' : '-' }
            ]);
        }
    });

    sectionTitle('CREDITOS PREFERENCIALES');
    if (!preferenciales.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        text('No registra créditos preferenciales con saldo pendiente para descontar.', margin);
    }
    for (const item of preferenciales) {
        ensureSpace(24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0);
        text(`${item.label} | Descuento: ${formatMoney(item.total)} | ${item.detalle}`, margin);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        text(`Motivo: ${item.motivo || '-'}`, margin, { width: contentWidth, lineHeight: 4 });
        if (item.comprobanteDesembolso) {
            ensureSpace(54);
            doc.setFont('helvetica', 'bold');
            doc.text('Comprobante de desembolso:', margin, y);
            y += 4;
            const imageData = await loadPolizaImageAsDataUrl(item.comprobanteDesembolso);
            if (imageData) {
                try {
                    doc.addImage(imageData, getPolizaImageFormat(imageData), margin, y, 55, 42, undefined, 'FAST');
                    y += 46;
                } catch (error) {
                    try {
                        doc.addImage(imageData, undefined, margin, y, 55, 42, undefined, 'FAST');
                        y += 46;
                    } catch (fallbackError) {
                        doc.setFont('helvetica', 'normal');
                        text('No se pudo incrustar la imagen del comprobante.', margin, { width: contentWidth, lineHeight: 4 });
                    }
                }
            } else {
                doc.setFont('helvetica', 'normal');
                text('No se pudo cargar la imagen del comprobante.', margin, { width: contentWidth, lineHeight: 4 });
            }
        } else {
            text('Comprobante desembolso: Sin comprobante registrado', margin, { width: contentWidth, lineHeight: 4 });
        }
        const pagos = item.pagos || [];
        if (pagos.length) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('Pagos registrados', margin, y);
            y += 5;
            drawPaymentTable(pagos, [
                { label: 'Fecha', width: 30, value: r => formatDate(r.fecha_pago) },
                { label: 'Monto', width: 28, value: r => formatMoney(r.monto_abonado) },
                { label: 'Tipo', width: 28, value: r => r.tipo_pago || 'ABONO' },
                { label: 'Saldo Desp.', width: 32, value: r => r.saldo_pendiente_despues !== null && r.saldo_pendiente_despues !== undefined ? formatMoney(r.saldo_pendiente_despues) : '-' },
                { label: 'Notas', width: 60, value: r => r.notas || r.notas_admin || '-' }
            ]);
        }
    }

    doc.save(`Detalle_Descuentos_Renovacion_${String(poliza.id_poliza || Date.now()).slice(0, 8)}.pdf`);
}

async function loadPolizaImageAsDataUrl(url) {
    try {
        const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('No se pudo cargar imagen para PDF de descuentos:', error);
        return null;
    }
}

function getPolizaImageFormat(dataUrl) {
    const match = String(dataUrl || '').match(/^data:image\/([^;]+)/i);
    const type = (match?.[1] || 'JPEG').toUpperCase();
    if (type === 'JPG') return 'JPEG';
    return type;
}

function populateSocioSelect() {
    const select = document.getElementById('poliza-socio');
    if (!select) return;

    const socios = window.dataCache?.socios || [];
    select.innerHTML = '<option value="">Seleccione un socio...</option>' +
        socios.map(s => `<option value="${s.idsocio}">${s.nombre} (${s.cedula})</option>`).join('');
}

function calculatePolizaProjections() {
    const valor = parseFloat(document.getElementById('poliza-valor').value) || 0;
    const interesPct = parseFloat(document.getElementById('poliza-interes').value) || 0;
    const plazoMeses = parseInt(document.getElementById('poliza-plazo').value) || 0;
    const fechaInicio = document.getElementById('poliza-fecha').value;

    if (valor > 0 && plazoMeses > 0 && fechaInicio) {
        // Calcular fecha vencimiento (Regla del día 17 y 360 días)
        const vencDate = calculateFixed17Maturity(fechaInicio, plazoMeses);

        // Recalcular el plazo real en días para el interés exacto si fuera necesario, 
        // pero seguiremos usando el interés anual prorrateado por meses o el nuevo cálculo solicitado
        const interesTotal = (valor * (interesPct / 100) * (plazoMeses / 12));
        const valorFinal = parseFloat((valor + interesTotal).toFixed(2));

        document.getElementById('poliza-vencimiento').value = vencDate;
        document.getElementById('display-vencimiento').textContent = formatDate(vencDate);
        document.getElementById('poliza-valor-final').value = valorFinal.toFixed(2);
        document.getElementById('display-valor-final').textContent = formatMoney(valorFinal);
    }
}

/**
 * Calcula la fecha de vencimiento fija al día 17.
 * Si los días totales son menos de 360 (para plazos >= 12 meses), se recorre al siguiente mes.
 */
function calculateFixed17Maturity(fechaInicioStr, plazoMeses) {
    if (!fechaInicioStr || !plazoMeses) return '';

    let start = new Date(fechaInicioStr + 'T00:00:00');
    let target = new Date(start);

    // 1. Sumar meses del plazo
    target.setMonth(target.getMonth() + parseInt(plazoMeses));

    // 2. Forzar día 17
    target.setDate(17);

    // 3. Validar regla de los 360 días (solo si el plazo es de 12 meses o más)
    if (plazoMeses >= 12) {
        let diffTime = target - start;
        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 360) {
            target.setMonth(target.getMonth() + 1);
            target.setDate(17);
        }
    }

    return toISODate(target);
}

async function confirmNewPolizaWithContract(data) {
    let contratoGenerado = false;
    const socio = getSelectedPolizaSocio() || { idsocio: data.id_socio };

    const { value } = await Swal.fire({
        title: 'Contrato requerido',
        width: '760px',
        html: `
            <div style="text-align: left; color: #1e293b; line-height: 1.55;">
                <p style="font-weight: 800; margin-bottom: 0.75rem;">
                    Debes tener el contrato firmado.
                </p>
                <p style="margin-bottom: 1rem;">
                    Primero genera el contrato PDF, haz que el socio lo firme y luego sube la foto del documento firmado desde la lista de pólizas. La póliza quedará como <b>PENDIENTE</b> y no se activará hasta cargar ese documento.
                </p>
                <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 0.85rem; padding: 0.9rem; color: #9a3412; font-weight: 700;">
                    <i class="fas fa-triangle-exclamation"></i>
                    Sin documento firmado no se activa la póliza.
                </div>
                <button type="button" id="btn-generar-contrato-nueva-poliza" class="swal2-confirm swal2-styled" style="width: 100%; margin: 1rem 0 0; background: #2563eb;">
                    <i class="fas fa-file-pdf"></i> Generar contrato PDF
                </button>
            </div>
        `,
        icon: 'warning',
        customClass: {
            popup: 'poliza-swal-contrast'
        },
        showCancelButton: true,
        confirmButtonText: 'Guardar como pendiente',
        confirmButtonColor: '#0B4E32',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            const btnConfirm = Swal.getConfirmButton();
            const btnPdf = document.getElementById('btn-generar-contrato-nueva-poliza');

            btnConfirm.disabled = true;
            btnConfirm.style.opacity = '0.5';

            btnPdf?.addEventListener('click', async () => {
                const previewWindow = window.open('', '_blank');
                if (previewWindow) {
                    previewWindow.document.write('<p style="font-family: sans-serif; padding: 24px;">Generando contrato...</p>');
                }

                await generatePolizaPDF({
                    id_socio: data.id_socio,
                    socio,
                    capital: data.valor,
                    interes: data.interes,
                    fecha_inicio: data.fecha,
                    fecha_venc: data.fecha_vencimiento,
                    valor_final: data.valor_final
                }, { preview: true, previewWindow });

                contratoGenerado = true;
                btnConfirm.disabled = false;
                btnConfirm.style.opacity = '1';
                btnPdf.innerHTML = '<i class="fas fa-check"></i> Contrato generado';
                btnPdf.style.background = '#10B981';
            });
        },
        preConfirm: () => {
            if (!contratoGenerado) {
                Swal.showValidationMessage('Primero debes generar el contrato PDF.');
                return false;
            }
            return true;
        }
    });

    return Boolean(value);
}

async function handleUploadPolizaSignedDocument(idPoliza) {
    const poliza = allPolizas.find(p => String(p.id_poliza) === String(idPoliza));
    if (!poliza) {
        Swal.fire('No encontrado', 'No se encontró la póliza seleccionada.', 'warning');
        return;
    }

    const alreadyActive = poliza.estado === 'ACTIVO';

    if (!alreadyActive && typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('ACTIVACIÓN DE PÓLIZA')) return;
    }

    const { value: file } = await Swal.fire({
        title: 'Subir documento firmado',
        html: `
            <div style="text-align: left; color: #1e293b;">
                <p style="margin-bottom: 0.75rem;">Selecciona la foto del contrato firmado por el socio.</p>
                <p style="font-size: 0.85rem; color: #64748b; margin: 0;">${alreadyActive ? 'La póliza ya está activa; solo se guardará el comprobante firmado.' : 'Al guardar, la póliza pasará a estado ACTIVO.'}</p>
            </div>
        `,
        input: 'file',
        inputAttributes: {
            accept: 'image/*',
            'aria-label': 'Foto del contrato firmado'
        },
        customClass: {
            popup: 'poliza-swal-contrast'
        },
        showCancelButton: true,
        confirmButtonText: alreadyActive ? 'Subir comprobante' : 'Subir y activar',
        confirmButtonColor: '#0B4E32',
        cancelButtonText: 'Cancelar',
        inputValidator: selectedFile => {
            if (!selectedFile) return 'Debes seleccionar una foto del documento firmado.';
            if (!selectedFile.type?.startsWith('image/')) return 'El archivo debe ser una imagen.';
            return null;
        }
    });

    if (!file) return;

    try {
        beginLoading('Subiendo documento firmado...');
        const supabase = getSupabaseClient();
        const uploadResult = await uploadPolizaSignedDocumentToWebp(file, poliza);

        if (!uploadResult?.success) {
            throw new Error(uploadResult?.error || 'No se pudo subir el documento firmado.');
        }

        const updateData = {
            certificado_firmado: uploadResult.url,
            updated_at: new Date().toISOString()
        };

        if (!alreadyActive) {
            updateData.estado = 'ACTIVO';
        }

        const { error } = await supabase
            .from('ic_polizas')
            .update(updateData)
            .eq('id_poliza', poliza.id_poliza);

        if (error) throw error;

        Swal.fire(
            alreadyActive ? 'Comprobante guardado' : 'Póliza activada',
            alreadyActive
                ? 'El documento firmado fue cargado correctamente.'
                : 'El documento firmado fue cargado correctamente y la póliza quedó activa.',
            'success'
        );
        if (window.dataCache) window.dataCache.lastUpdate.polizas = 0;
        await loadPolizas(true);
    } catch (error) {
        console.error('Error subiendo documento firmado de póliza:', error);
        await window.showFinancialError?.(error, 'No se pudo subir el documento firmado.')
            || Swal.fire('Error', error.message || 'No se pudo subir el documento firmado.', 'error');
    } finally {
        endLoading();
    }
}

async function uploadPolizaSignedDocumentToWebp(file, poliza) {
    try {
        if (!file?.type?.startsWith('image/')) {
            throw new Error('El documento firmado debe ser una imagen para convertirla a WebP.');
        }

        const supabase = window.getSupabaseClient();
        if (!supabase) throw new Error('Cliente Supabase no disponible.');

        const socioNombre = poliza.socio?.nombre || poliza.id_socio || 'socio';
        const safeSocio = slugPolizaStorageName(socioNombre);
        const safeFecha = slugPolizaStorageName(poliza.fecha || todayISODate());
        const safeValor = slugPolizaStorageName(parseFloat(poliza.valor || 0).toFixed(2));
        const path = `contratospolizas/${safeSocio}_${safeFecha}_${safeValor}_${Date.now()}.webp`;
        const webpBlob = await compressPolizaSignedDocumentToWebp(file);

        const { error } = await supabase.storage
            .from('inkacorp')
            .upload(path, webpBlob, {
                cacheControl: '3600',
                upsert: false,
                contentType: 'image/webp'
            });

        if (error) throw error;

        const { data: publicData } = supabase.storage.from('inkacorp').getPublicUrl(path);
        if (!publicData?.publicUrl) throw new Error('No se pudo obtener URL pública del documento firmado.');

        return { success: true, url: publicData.publicUrl, path };
    } catch (error) {
        console.error('Error subiendo documento firmado WebP:', error);
        return { success: false, error: error.message || 'Error al subir documento firmado.' };
    }
}

function compressPolizaSignedDocumentToWebp(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const img = new Image();

        reader.onload = (event) => {
            img.onload = () => {
                const maxSize = 1600;
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
                    reject(new Error('No se pudo preparar la compresión del documento firmado.'));
                    return;
                }

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('No se pudo convertir el documento firmado a WebP.'));
                        return;
                    }
                    resolve(blob);
                }, 'image/webp', 0.88);
            };
            img.onerror = () => reject(new Error('No se pudo leer la imagen del documento firmado.'));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error('No se pudo leer el documento firmado.'));
        reader.readAsDataURL(file);
    });
}

function slugPolizaStorageName(value) {
    return String(value || 'poliza')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .substring(0, 90) || 'poliza';
}

async function savePoliza() {
    const form = document.getElementById('form-poliza');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const id = document.getElementById('poliza-id').value;
    const isNewPoliza = !id;

    const data = {
        id_socio: document.getElementById('poliza-socio').value,
        fecha: document.getElementById('poliza-fecha').value,
        valor: parseFloat(document.getElementById('poliza-valor').value),
        interes: parseFloat(document.getElementById('poliza-interes').value),
        plazo: parseInt(document.getElementById('poliza-plazo').value),
        fecha_vencimiento: document.getElementById('poliza-vencimiento').value,
        valor_final: parseFloat(document.getElementById('poliza-valor-final').value),
        certificado_firmado: isNewPoliza ? null : (document.getElementById('poliza-certificado').value || null),
        estado: isNewPoliza ? 'PENDIENTE' : (document.getElementById('poliza-estado').value || 'PENDIENTE'),
        updated_at: new Date().toISOString()
    };

    if (isNewPoliza) {
        const confirmed = await confirmNewPolizaWithContract(data);
        if (!confirmed) return;
    }

    try {
        beginLoading(isNewPoliza ? 'Guardando póliza pendiente...' : 'Guardando póliza...');
        const supabase = getSupabaseClient();

        let result;
        if (id) {
            result = await supabase.from('ic_polizas').update(data).eq('id_poliza', id);
        } else {
            result = await supabase.from('ic_polizas').insert([data]).select('*').single();
        }

        if (result.error) throw result.error;

        Swal.fire(
            isNewPoliza ? 'Póliza pendiente registrada' : 'Éxito',
            isNewPoliza
                ? 'La póliza quedó pendiente. Sube el documento firmado para activarla.'
                : 'Póliza guardada correctamente',
            'success'
        );

        // Cerrar modal
        const modal = document.getElementById('poliza-modal');
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';

        // Recargar datos
        if (window.dataCache) window.dataCache.lastUpdate.polizas = 0;
        await loadPolizas();

    } catch (error) {
        console.error('Error al guardar póliza:', error);
        await window.showFinancialError?.(error, 'No se pudo guardar la póliza.')
            || Swal.fire('Error', 'No se pudo guardar la póliza', 'error');
    } finally {
        endLoading();
    }
}

// ==========================================
// HELPERS
// ==========================================
function getEstadoBadgePoliza(estado) {
    const badges = {
        'ACTIVO': '<span class="badge badge-poliza-activo">Activo</span>',
        'PENDIENTE': '<span class="badge badge-poliza-pendiente">Pendiente</span>',
        'PAGADO': '<span class="badge badge-poliza-pagado">Pagado</span>',
        'CAPITALIZADO': '<span class="badge badge-poliza-capitalizado">Capitalizado</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

function isCloseToVencimiento(fechaVenc) {
    const days = getDaysRemaining(fechaVenc);
    return isWithinPolizaRenewalWindow(days);
}

function isWithinPolizaRenewalWindow(daysRemaining) {
    return daysRemaining >= -POLIZA_RENOVACION_DIAS_DESPUES &&
        daysRemaining <= POLIZA_RENOVACION_DIAS_ANTES;
}

function getDaysRemaining(fechaVenc) {
    const hoy = new Date();
    const venc = parseDate(fechaVenc);
    if (!venc) return 999;
    const diffTime = venc - hoy;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Envía un mensaje de agradecimiento y confirmación de cobro vía WhatsApp
 */
async function sendPayoutNotification(poliza, totalPagado, interesGanado) {
    if (!poliza || !poliza.socio) return;

    const mensaje = `*${poliza.socio.nombre.toUpperCase()}:*\n\n` +
        `¡Muchísimas gracias por tu confianza en *INKA CORP*! 🤝\n\n` +
        `Queremos confirmarte que has cobrado con éxito tu póliza. Estos son los detalles de tu liquidación:\n\n` +
        `✅ *Resumen de Cobro:*\n` +
        `• *Valor cobrado:* ${formatMoney(totalPagado)}\n` +
        `• *Ganancia generada:* ${formatMoney(interesGanado)}\n\n` +
        `Para nosotros ha sido un gusto trabajar contigo en el crecimiento de tu patrimonio. No olvides que siempre estamos aquí para asesorarte en tus próximas inversiones. 🚀\n\n` +
        `_Atentamente,_\n*INKA CORP*`;

    try {
        // Enviar automáticamente sin confirmación adicional
        beginLoading('Enviando agradecimiento...');

        const response = await fetch('https://lpwebhook.luispinta.com/webhook/vencimientopolizas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                whatsapp: poliza.socio.whatsapp,
                nombre: poliza.socio.nombre,
                mensaje: mensaje,
                poliza_id: poliza.id_poliza,
                datos: {
                    monto_total: totalPagado,
                    monto_interes: interesGanado,
                    tipo: 'AGRADECIMIENTO_COBRO'
                }
            })
        });

        if (!response.ok) throw new Error('Error en el servidor de mensajería');

        showToast('Agradecimiento enviado por WhatsApp', 'success');

    } catch (error) {
        console.error('Error enviando WHATSAPP:', error);
        showToast('No se pudo enviar el WhatsApp de agradecimiento', 'error');
    } finally {
        endLoading();
    }
}

async function handleWhatsAppNotification(poliza) {
    if (!poliza || !poliza.socio) return;

    const capital = parseFloat(poliza.valor);
    const fechaInicio = parseDate(poliza.fecha);
    const hoy = new Date();
    const diasPasados = Math.max(0, Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24)));
    const diasFaltantes = getDaysRemaining(poliza.fecha_vencimiento);

    // Cálculo interés real a hoy
    const interesDiario = (capital * (parseFloat(poliza.interes) / 100)) / 365;
    const interesGanadoHoy = interesDiario * diasPasados;
    const valorHoy = capital + interesGanadoHoy;

    // Interés proyectado pactado
    const interesVencimiento = parseFloat(poliza.valor_final) - capital;

    const mensaje = `*${poliza.socio.nombre.toUpperCase()}:*\n\n` +
        `Es un placer para nosotros comunicarte que el vencimiento de tu póliza es dentro de *${diasFaltantes}* días, te brindamos los detalles a continuación:\n\n` +
        `📊 *Detalles de tu Inversión:*\n` +
        `• *Capital:* ${formatMoney(capital)}\n` +
        `• *Interés al vencimiento:* ${formatMoney(interesVencimiento)}\n` +
        `• *Días transcurridos:* ${diasPasados} días\n` +
        `• *Valor de la póliza al día de hoy:* ${formatMoney(valorHoy)}\n\n` +
        `💡 *Opciones para tu renovación:*\n` +
        `1️⃣ *Renovación Total (Capital + Interés):* Puedes reinvertir un total de *${formatMoney(valorHoy)}* para seguir maximizando tus ganancias.\n` +
        `2️⃣ *Solo Capital:* Puedes cobrar tus intereses actuales de *${formatMoney(interesGanadoHoy)}* y renovar únicamente el capital inicial.\n` +
        `3️⃣ *Liquidación:* Si decides retirar tu inversión el día de hoy, recibirás *${formatMoney(valorHoy)}*.\n\n` +
        `⚠️ *Nota:* Agradecemos nos comuniques tu decisión. Si al vencimiento no recibimos respuesta, la póliza se renovará automáticamente para asegurar que tu dinero siga generando rendimientos.\n\n` +
        `_Atentamente,_\n*INKA CORP*`;

    try {
        const result = await Swal.fire({
            title: 'Enviar Recordatorio',
            text: `¿Desea enviar la notificación de vencimiento a ${poliza.socio.nombre}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, enviar WhatsApp',
            confirmButtonColor: '#25D366'
        });

        if (!result.isConfirmed) return;

        beginLoading('Enviando notificación...');

        const response = await fetch('https://lpwebhook.luispinta.com/webhook/vencimientopolizas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                whatsapp: poliza.socio.whatsapp,
                nombre: poliza.socio.nombre,
                mensaje: mensaje,
                poliza_id: poliza.id_poliza,
                datos: {
                    capital,
                    interes_hoy: interesGanadoHoy,
                    valor_hoy: valorHoy,
                    dias_pasados: diasPasados,
                    dias_faltantes: diasFaltantes
                }
            })
        });

        if (!response.ok) throw new Error('Error en el servidor de mensajería');

        Swal.fire('Enviado', 'La notificación ha sido enviada con éxito.', 'success');

    } catch (error) {
        console.error('Error enviando WHATSAPP:', error);
        Swal.fire('Error', 'No se pudo conectar con el servicio de mensajería.', 'error');
    } finally {
        endLoading();
    }
}

function viewPoliza(id) {
    const poliza = allPolizas.find(p => p.id_poliza === id);
    if (poliza) {
        openPolizaModal(poliza);
    }
}

// Inicializar si el módulo está cargado
document.addEventListener('DOMContentLoaded', () => {
    // El sistema dinámico de INKA CORP suele inicializar mediante app.js
    // pero dejamos esto por precaución o integración directa
});

/**
 *Helpers para formatear texto y campos en PDF (Basados en Solicitudes)
 */
function renderJustifiedText(doc, text, x, y, width, lineHeight = 5.8) {
    if (!text) return y;

    doc.setFontSize(10);
    const paragraphs = text.split('\n');
    let currentY = y;
    let isBoldGlobal = false;

    paragraphs.forEach(para => {
        if (!para.trim()) {
            currentY += lineHeight * 0.8;
            return;
        }

        const words = para.trim().split(/\s+/);
        let currentLine = [];
        let currentLineWidth = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const cleanWord = word.replace(/\*\*/g, '');

            // Determinar si esta palabra empieza como negrita
            // Si el estado global es bold, la palabra es bold.
            // Si no lo es, pero la palabra empieza con **, también se marca para medirla.
            const startsWithMarker = word.startsWith('**');
            const measureBold = isBoldGlobal || startsWithMarker;

            if (measureBold) doc.setFont("helvetica", "bold");
            else doc.setFont("helvetica", "normal");

            const wordWidth = doc.getTextWidth(cleanWord + ' ');

            if (currentLineWidth + wordWidth > width && currentLine.length > 0) {
                drawParagraphLine(doc, currentLine, x, currentY, width, true);
                currentY += lineHeight;
                currentLine = [];
                currentLineWidth = 0;
            }

            // Guardamos el estado EXACTO antes de procesar la palabra
            currentLine.push({
                text: word,
                startsBold: isBoldGlobal
            });
            currentLineWidth += wordWidth;

            // Actualizar el estado global para la siguiente palabra
            const markers = (word.match(/\*\*/g) || []).length;
            if (markers % 2 !== 0) isBoldGlobal = !isBoldGlobal;

            if (i === words.length - 1) {
                drawParagraphLine(doc, currentLine, x, currentY, width, false);
                currentY += lineHeight;
            }
        }
    });

    return currentY;
}

function drawParagraphLine(doc, segments, x, y, width, justify) {
    let currentX = x;
    let extraSpace = 0;

    if (justify && segments.length > 1) {
        let totalWordsWidth = 0;
        segments.forEach(seg => {
            let tempBold = seg.startsBold;
            const parts = seg.text.split('**');
            parts.forEach((part, idx) => {
                if (tempBold) doc.setFont("helvetica", "bold");
                else doc.setFont("helvetica", "normal");
                totalWordsWidth += doc.getTextWidth(part);
                if (idx < parts.length - 1) tempBold = !tempBold;
            });
        });

        doc.setFont("helvetica", "normal");
        const spaceWidth = doc.getTextWidth(' ');
        extraSpace = (width - totalWordsWidth - (spaceWidth * (segments.length - 1))) / (segments.length - 1);
    }

    segments.forEach((seg, index) => {
        let wordBold = seg.startsBold;
        const parts = seg.text.split('**');

        parts.forEach((part, idx) => {
            if (wordBold) doc.setFont("helvetica", "bold");
            else doc.setFont("helvetica", "normal");

            doc.text(part, currentX, y);
            currentX += doc.getTextWidth(part);

            if (idx < parts.length - 1) wordBold = !wordBold;
        });

        if (index < segments.length - 1) {
            doc.setFont("helvetica", "normal");
            currentX += doc.getTextWidth(' ') + extraSpace;
        }
    });
}

function drawField(doc, label, value, x, y, maxWidth) {
    doc.setFont("helvetica", "bold");
    doc.text(label, x, y);
    const labelWidth = doc.getTextWidth(label);

    doc.setFont("helvetica", "normal");
    const valText = value || '';
    const lines = doc.splitTextToSize(valText, maxWidth - labelWidth);
    doc.text(lines, x + labelWidth, y);

    return y + (lines.length * 5);
}

function formatDateFull(fechaStr) {
    if (!fechaStr) return '-';
    const fecha = parseDate(fechaStr);
    if (!fecha) return '-';

    return fecha.toLocaleDateString('es-EC', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}


/**
 * Convierte un número a letras
 */
function porcentajeALetras(valor) {
    const num = parseFloat(valor);
    if (isNaN(num)) return "CERO POR CIENTO";

    // Usamos el mismo motor de conversión que numeroALetras pero adaptado
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
            if (n > 20 && n < 30) return 'VEINTI' + unidades[u];
            return decenas2[Math.floor(n / 10)] + (u > 0 ? ' Y ' + unidades[u] : '');
        }
        if (n === 100) return 'CIEN';
        return ''; // El interés no suele pasar del 100%
    }

    const entero = Math.floor(num);
    const decimales = Math.round((num - entero) * 100);

    let letras = entero === 0 ? 'CERO' : convertir(entero);

    if (decimales > 0) {
        letras += ' PUNTO ' + convertir(decimales);
    }

    return `${letras} POR CIENTO`.replace(/\s+/g, ' ').trim();
}

function numeroALetras(valor) {
    const num = parseFloat(valor);
    if (isNaN(num)) return "CERO";
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
            if (n > 20 && n < 30) return 'VEINTI' + unidades[u];
            return decenas2[Math.floor(n / 10)] + (u > 0 ? ' Y ' + unidades[u] : '');
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

/**
 * Agrega marca de agua de seguridad al PDF
 */
function addWatermark(doc) {
    try {
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        doc.saveGraphicsState();
        // Opacidad extremadamente sutil para compensar la mayor densidad
        if (typeof doc.setGState === 'function') {
            doc.setGState(new doc.GState({ opacity: 0.03 }));
        }

        // Aumentamos la densidad (8 filas x 5 columnas = 40 logos) para asegurar cobertura uniforme
        const rows = 8;
        const cols = 5;
        const stepX = pageWidth / cols;
        const stepY = pageHeight / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Reducimos el desplazamiento aleatorio (30% máximo) para evitar huecos grandes
                const jitterX = (Math.random() - 0.5) * stepX * 0.3;
                const jitterY = (Math.random() - 0.5) * stepY * 0.3;

                const centerX = (c * stepX) + (stepX / 2) + jitterX;
                const centerY = (r * stepY) + (stepY / 2) + jitterY;

                // Tamaño más controlado para uniformidad visual (25mm a 45mm)
                const size = 25 + (Math.random() * 20);

                // Rotación totalmente aleatoria para mantener el dinamismo
                const angle = Math.random() * 360;

                doc.addImage(logoUrl, 'PNG', centerX - (size / 2), centerY - (size / 2), size, size, undefined, 'FAST', angle);
            }
        }

        doc.restoreGraphicsState();
    } catch (e) {
        console.warn('No se pudo añadir la marca de agua:', e);
    }
}

/**
 * Dibuja una banda de seguridad densa y recortada (Estilo billete/título valor)
 */
function drawSecurityBand(doc, y, height) {
    try {
        const pageWidth = doc.internal.pageSize.getWidth();
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        const logoSize = 6; // Tamaño fijo pequeño para máxima densidad

        doc.saveGraphicsState();

        // Franja de borde a borde (0 a pageWidth)
        doc.rect(0, y, pageWidth, height);
        doc.clip();

        // Fondo sutil para la zona de seguridad
        doc.setFillColor(245, 245, 245);
        doc.rect(0, y, pageWidth, height, 'F');

        // Alta densidad para cubrir de lado a lado sin huecos
        // Usamos una rejilla densa con jitter para asegurar cobertura total
        const cols = Math.ceil(pageWidth / (logoSize * 0.6)); // Superposición del 40%
        const rows = Math.ceil(height / (logoSize * 0.6));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Posición base con jitter mínimo para evitar huecos grandes
                const lx = (c * logoSize * 0.6) + ((Math.random() - 0.5) * 2);
                const ly = y + (r * logoSize * 0.6) + ((Math.random() - 0.5) * 2);

                const angle = Math.random() * 360;
                const opacity = 0.5 + (Math.random() * 0.5); // 50% a 100%

                if (typeof doc.setGState === 'function') {
                    doc.setGState(new doc.GState({ opacity: opacity }));
                }

                doc.addImage(logoUrl, 'PNG', lx, ly, logoSize, logoSize, undefined, 'FAST', angle);
            }
        }

        doc.restoreGraphicsState();

        // Bordes de la franja en VERDE INKA de borde a borde
        doc.setDrawColor(11, 78, 50);
        doc.setLineWidth(0.5);
        doc.line(0, y, pageWidth, y);
        doc.line(0, y + height, pageWidth, y + height);

    } catch (e) {
        console.warn('Error al crear banda de seguridad:', e);
    }
}

/**
 * Genera el PDF del Contrato de Depósito a Plazo Fijo (Versión Profesional con jsPDF)
 */
async function generatePolizaPDF(data, options = {}) {
    const { jsPDF } = window.jspdf;

    // REFUERZO DE DATOS: Si el socio está incompleto, intentamos recuperarlo de la base de datos o de las solicitudes
    let socioCompleto = data.socio || {};
    const idSocio = data.id_socio || socioCompleto.idsocio || socioCompleto.id_socio;

    // Forzar recarga si faltan datos críticos o si es el socio del problema
    if (idSocio) {
        try {
            const supabase = window.getSupabaseClient();
            // Buscar en la tabla maestra de socios
            const { data: sMaster } = await supabase.from('ic_socios').select('*').eq('idsocio', idSocio).single();
            if (sMaster) {
                socioCompleto = { ...socioCompleto, ...sMaster };
            }

            // Si sigue sin domicilio real, buscar en la solicitud de crédito más reciente
            if (!socioCompleto.domicilio || socioCompleto.domicilio.toUpperCase() === 'SIN DIRECCIÓN' || !socioCompleto.estadocivil) {
                const socioCI = socioCompleto.cedula || idSocio;
                const { data: sSolicitud } = await supabase
                    .from('ic_solicitud_de_credito')
                    .select('direccionsocio, estadocivil, paisresidencia')
                    .or(`cedulasocio.eq.${socioCI},whatsappsocio.eq.${socioCompleto.whatsapp || ''}`)
                    .order('solicitudid', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (sSolicitud) {
                    if (!socioCompleto.domicilio || socioCompleto.domicilio.toUpperCase() === 'SIN DIRECCIÓN') {
                        socioCompleto.domicilio = sSolicitud.direccionsocio;
                    }
                    socioCompleto.estadocivil = socioCompleto.estadocivil || sSolicitud.estadocivil;
                    socioCompleto.paisresidencia = socioCompleto.paisresidencia || sSolicitud.paisresidencia;
                }
            }
        } catch (e) {
            console.warn('No se pudo recuperar información extendida del socio:', e);
        }
    }

    const doc = jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    // Registrar marca de agua en la primera página
    addWatermark(doc);

    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);
    const acreedor = getDatosAcreedor();

    // Validar datos mandatorios del asesor para el contrato de inversión
    if (!acreedor.nombre || !acreedor.cedula) {
        Swal.fire({
            icon: 'error',
            title: 'Perfil de Asesor Incompleto',
            text: 'Su usuario no tiene configurado el Nombre o la Cédula. No se puede generar contratos de inversión sin estos datos legales.',
            confirmButtonColor: '#0B4E32'
        });
        return;
    }

    let y = 15;

    // --- ENCABEZADO ESTILO SOLICITUD ---
    try {
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        doc.addImage(logoUrl, 'PNG', margin, y, 25, 25);
    } catch (e) { }

    // Título Principal
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(11, 78, 50); // Verde Inka
    doc.text("CONTRATO DE INVERSIÓN", margin + 32, y + 10);
    doc.text("A PLAZO FIJO", margin + 32, y + 18);

    // Referencia / Contrato
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    const numContrato = data.id_poliza ? data.id_poliza.substring(0, 12).toUpperCase() : 'NUEVO';
    doc.text(`REFERENCIA: ${numContrato}`, pageWidth - margin, y + 18, { align: 'right' });

    y += 28;
    // Barra de color temática
    doc.setDrawColor(11, 78, 50); // Verde Inka
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setDrawColor(241, 164, 53); // Naranja acento
    doc.line(margin, y + 1, margin + 40, y + 1);

    y += 12;
    doc.setFontSize(10);
    doc.setTextColor(0);

    // --- SECCIÓN: IDENTIFICACIÓN (Estilo Banner Oscuro) ---
    doc.setFillColor(32, 70, 82);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    doc.text("COMPARECIENTES Y ANTECEDENTES", margin + 3, y + 4.8);

    y += 14;
    doc.setTextColor(0);

    // Fallbacks mejorados para datos del socio usando el objeto completo recuperado
    const s = socioCompleto;
    const domicilioSocio = (s.domicilio || s.direccionsocio || s.direccion || 'SIN DIRECCIÓN').toUpperCase();
    const paisSocio = (s.paisresidencia || s.pais_residencia || s.pais || 'ECUADOR').toUpperCase();
    const estadoCivilSocio = (s.estadocivil || s.estado_civil || '---').toUpperCase();
    const socioNombre = (s.nombre || data.nombre_socio || 'SOCIO').toUpperCase();
    const socioCedula = s.cedula || s.cedulasocio || data.cedula_socio || '---';

    const introText = `En la ciudad de **${acreedor.ciudad}**, hoy **${formatDateFull(data.fecha_inicio)}**, se celebra el presente CONTRATO DE INVERSIÓN A PLAZO FIJO, bajo los términos y condiciones aquí descritos:\n\n` +
        `De una parte, la institución **${acreedor.institucion}**, representada por el Sr. **${acreedor.nombre}**, con C.I. **${acreedor.cedula}**, denominada en lo sucesivo como "EL DEPOSITARIO"; y de otra parte, el Sr/Sra. **${socioNombre}**, con C.I. **${socioCedula}**, de estado civil **${estadoCivilSocio}**, con domicilio en **${domicilioSocio}**, quien actúa por sus propios derechos y a quien se denominará como "EL DEPOSITANTE".`;

    y = renderJustifiedText(doc, introText, margin, y, contentWidth, 5.8);
    y += 12;

    // --- SECCIÓN: CONDICIONES ---
    doc.setFillColor(32, 70, 82);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255);
    doc.text("CLÁUSULAS DEL CONTRATO", margin + 3, y + 4.8);

    y += 14;
    doc.setTextColor(0);

    const diffTime = parseDate(data.fecha_venc) - parseDate(data.fecha_inicio);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const interesVal = data.valor_final - data.capital;

    const formatCurr = (val) => val.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const descuentosRenovacion = data.renovacion?.descuentos || { creditosNormales: [], creditosPreferenciales: [], total: 0 };
    const filasDescuentos = [
        ...(descuentosRenovacion.creditosNormales || []).map(item => ({
            tipo: 'Credito normal',
            concepto: item.label,
            detalle: item.detalle,
            total: item.total
        })),
        ...(descuentosRenovacion.creditosPreferenciales || []).map(item => ({
            tipo: 'Credito preferencial',
            concepto: item.label,
            detalle: item.detalle,
            total: item.total
        }))
    ];
    const totalDescuentosPDF = parsePolizaMoney(data.renovacion?.total_descuentos ?? descuentosRenovacion.total);

    const clausulas = [
        `**PRIMERA: OBJETO Y NATURALEZA.** El DEPOSITANTE entrega en este acto, de forma libre y voluntaria, la cantidad de **$${formatCurr(data.capital)}** (${numeroALetras(data.capital)}), para que EL DEPOSITARIO proceda con su administración y colocación financiera bajo la modalidad de Certificado de Inversión a Plazo Fijo, garantizando el manejo profesional y ético de los fondos.`,
        `**SEGUNDA: PLAZO DE VIGENCIA.** El término de permanencia de la presente inversión se establece en un periodo de **${diffDays} días**, los cuales iniciarán su cómputo legal a partir del día **${formatDateFull(data.fecha_inicio)}**, teniendo como fecha de vencimiento e interrupción definitiva de la vigencia el día **${formatDateFull(data.fecha_venc)}**.`,
        `**TERCERA: RENTABILIDAD Y BENEFICIOS.** EL DEPOSITARIO se compromete formalmente a reconocer y acreditar una tasa de interés preferencial fija del **${parseFloat(data.interes).toFixed(2)}% (${porcentajeALetras(data.interes)}) anual**. Al concluir el plazo pactado, el rendimiento financiero generado a favor del DEPOSITANTE ascenderá a la suma neta de **$${formatCurr(interesVal)}** (${numeroALetras(interesVal)}).`,
        `**CUARTA: RESTITUCIÓN DE HABERES.** Al cumplimiento efectivo del plazo estipulado, EL DEPOSITARIO procederá con la devolución íntegra del capital inicial más los rendimientos financieros devengados, sumando una cuantía total consolidada de **$${formatCurr(data.valor_final)}** (${numeroALetras(data.valor_final)}), pagaderos mediante los canales institucionales vigentes.`,
        `**QUINTA: CONDICIONES DE LIQUIDACIÓN Y RETIRO.** La liquidación de haberes se efectuará obligatoriamente en la fecha de vencimiento. Cualquier solicitud de retiro anticipado o pre-cancelación excepcional estará sujeta a la aprobación administrativa previa y conllevará las penalidades financieras correspondientes, incluyendo la pérdida o reducción de los intereses pactados originalmente.`,
        `**SEXTA: PROCEDIMIENTO DE RENOVACIÓN.** Salvo notificación expresa y por escrito dirigida a EL DEPOSITARIO con al menos 48 horas de antelación al vencimiento, el presente contrato se renovará automáticamente por un periodo idéntico al original, bajo las tasas de rendimiento institucionales aplicables a la fecha de la prórroga.`,
        `**SÉPTIMA: VALIDEZ DEL DOCUMENTO.** Para la efectivización del cobro de la inversión, el DEPOSITANTE deberá presentar obligatoriamente este documento original impreso. No se admitirán copias simples, escaneos ni fotografías del mismo para trámites de liquidación o retiro.`,
        `**OCTAVA: DECLARACIÓN Y JURISDICCIÓN.** Las partes declaran su total aceptación y conformidad con todas las condiciones expuestas. En caso de discrepancias, las partes renuncian a fuero o domicilio y se someten a la competencia de los tribunales correspondientes a la sede de **${acreedor.ciudad}** y a las leyes vigentes de la República.`
    ];

    clausulas.forEach(txt => {
        if (y > 265) {
            // Dibujar banda al final de cada página antes de cambiar
            drawSecurityBand(doc, 278, 8);
            doc.addPage();
            addWatermark(doc);
            y = 20;
        }
        y = renderJustifiedText(doc, txt, margin, y, contentWidth, 5.2);
        y += 2.5;
    });

    if (totalDescuentosPDF > 0) {
        if (y > 232) {
            drawSecurityBand(doc, 278, 8);
            doc.addPage();
            addWatermark(doc);
            y = 20;
        }

        y += 5;
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, y - 4, contentWidth, 22 + (filasDescuentos.length * 8), 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(153, 27, 27);
        doc.text("DETALLE DE DESCUENTOS APLICADOS EN LA RENOVACION", margin + 3, y + 2);
        y += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(40);
        const resumenDescuentoText = `Las partes dejan constancia de que, después de las cláusulas anteriores, la presente renovación registra descuentos previos por obligaciones del DEPOSITANTE.`;
        const resumenLines = doc.splitTextToSize(resumenDescuentoText, contentWidth - 6);
        doc.text(resumenLines, margin + 3, y);
        y += resumenLines.length * 4 + 3;

        filasDescuentos.forEach(item => {
            const left = `${item.tipo}: ${item.concepto} - ${item.detalle || ''}`;
            const lines = doc.splitTextToSize(left, contentWidth - 45);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(40);
            doc.text(lines, margin + 3, y);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(153, 27, 27);
            doc.text(`-$${formatCurr(parsePolizaMoney(item.total))}`, pageWidth - margin - 3, y, { align: 'right' });
            y += Math.max(7, lines.length * 4);
        });

        doc.setDrawColor(220);
        doc.line(margin + 3, y, pageWidth - margin - 3, y);
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`Valor tomado para renovar: $${formatCurr(parsePolizaMoney(data.renovacion?.capital_antes_descuento))}`, margin + 3, y);
        doc.text(`Total descontado: -$${formatCurr(totalDescuentosPDF)}`, pageWidth - margin - 3, y, { align: 'right' });
        y += 5;
        doc.setTextColor(11, 78, 50);
        doc.text(`Capital neto contratado: $${formatCurr(data.capital)}`, pageWidth - margin - 3, y, { align: 'right' });
        y += 8;
    }

    // Dibujar banda en la página actual (sea la 1 o la última) al final del contenido
    drawSecurityBand(doc, 278, 8);

    // --- FIRMAS ---
    y += 10;
    if (y > 240) {
        doc.addPage();
        addWatermark(doc);
        y = 20;
    }

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`En fe de lo cual, las partes suscriben el presente documento en ${acreedor.ciudad}, el ${formatDateFull(new Date().toISOString())}`, pageWidth / 2, y, { align: 'center' });

    y += 30;
    doc.setLineWidth(0.4);
    doc.setDrawColor(0);
    doc.line(margin + 5, y, margin + 70, y);
    doc.line(pageWidth - margin - 70, y, pageWidth - margin - 5, y);

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(socioNombre, margin + 37.5, y, { align: 'center' });
    doc.text(acreedor.nombre.toUpperCase(), pageWidth - margin - 37.5, y, { align: 'center' });

    y += 4;
    doc.setFont("helvetica", "normal");
    doc.text(`C.I. ${socioCedula}`, margin + 37.5, y, { align: 'center' });
    doc.text(`C.I. ${acreedor.cedula}`, pageWidth - margin - 37.5, y, { align: 'center' });

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("EL DEPOSITANTE", margin + 37.5, y, { align: 'center' });
    doc.text("EL DEPOSITARIO", pageWidth - margin - 37.5, y, { align: 'center' });

    // Pie de página
    doc.setTextColor(150);
    doc.setFontSize(7);
    doc.text(`ID Transacción: ${numContrato} | Generado por sistema INKA CORP`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });

    if (options.preview) {
        const blobUrl = doc.output('bloburl');
        if (options.previewWindow && !options.previewWindow.closed) {
            options.previewWindow.location.href = blobUrl;
        } else {
            window.open(blobUrl, '_blank');
        }
    } else {
        doc.save(`Contrato_Poliza_${socioNombre.split(' ')[0]}_${numContrato.substring(0, 6)}.pdf`);
    }
    return true;
}
