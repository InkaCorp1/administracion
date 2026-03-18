/**
 * INKA CORP - Módulo de Precancelaciones
 * Gestión de precancelaciones de créditos activos
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allCreditosPrecancelables = [];
let filteredCreditosPrecancelables = [];
let historialPrecancelaciones = [];
let creditoActual = null;
let calculoPrecancelacion = null;
let tablaAmortizacionPrecancelacionActual = null;
let contextoLegacyPrecancelacionActual = null;
let currentPaisFilterPrecanc = '';
let currentTab = 'activos';
let penalizacionGastosAdminMultiplicador = 1;
const MENSAJE_CREDITO_EN_MORA_PRECANC = 'Este crédito está en mora primero debe ponerse al día para precancelar';
const MENSAJE_METODO_LEGACY_PRECANC = 'Crédito legacy: tabla ajustada por ser crédito legacy';

// Configuración de caché para precancelaciones
const CACHE_DURATION_PRECANC = 5 * 60 * 1000; // 5 minutos
let precancCacheTimestamp = 0;

// Mapeo de países
const PAIS_CONFIG_PRECANC = {
    'ECUADOR': { code: 'EC', name: 'Ecuador', flag: 'https://flagcdn.com/w20/ec.png' },
    'ESTADOS UNIDOS': { code: 'US', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'USA': { code: 'US', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'PERÚ': { code: 'PE', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' },
    'PERU': { code: 'PE', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function initPrecancelacionesModule() {
    // Cargar datos (desde caché si está disponible)
    await loadCreditosPrecancelables();
    await loadHistorialPrecancelaciones();

    // Event listeners
    setupPrecancelacionesEventListeners();

    // Exponer funciones globalmente
    window.abrirModalCalculo = abrirModalCalculo;
    window.verDetallePrecancelacion = verDetallePrecancelacion;
    window.filterPrecancelacionesByPais = filterPrecancelacionesByPais;
    window.switchPrecancelacionTab = switchPrecancelacionTab;
    window.refreshPrecancelaciones = refreshPrecancelaciones;
    window.mostrarAlertaMoraPrecancelacion = mostrarAlertaMoraPrecancelacion;

    // Sincronización en segundo plano
    syncPrecancelacionesBackground();
}

function setupPrecancelacionesEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-precancelacion');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearchPrecanc, 300));
    }

    // Modal calcular precancelación
    const btnCalcular = document.getElementById('btn-calcular-montos');
    if (btnCalcular) {
        btnCalcular.addEventListener('click', handleCalcularMontos);
    }

    document.querySelectorAll('.penalizacion-multiplicador-btn').forEach((button) => {
        if (!button.dataset.bound) {
            button.addEventListener('click', handlePenalizacionGastosAdminClick);
            button.dataset.bound = 'true';
        }
    });

    // Botón procesar precancelación
    const btnProcesar = document.getElementById('btn-procesar-precancelacion');
    if (btnProcesar) {
        btnProcesar.addEventListener('click', abrirModalConfirmacion);
    }

    const btnGenerarPdf = document.getElementById('btn-generar-pdf-precancelacion');
    if (btnGenerarPdf) {
        btnGenerarPdf.addEventListener('click', generarPDFPrecancelacion);
    }

    // Botón confirmar final
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', handleConfirmarPrecancelacion);
    }

    // Fecha de hoy por defecto
    const fechaInput = document.getElementById('fecha-precancelacion');
    if (fechaInput) {
        fechaInput.valueAsDate = new Date();
    }

    // Setup modal close handlers
    setupPrecancModalCloseHandlers('modal-calcular-precancelacion');
    setupPrecancModalCloseHandlers('modal-confirmar-precancelacion');
    setupPrecancModalCloseHandlers('modal-ver-precancelacion');
}

// ==========================================
// MODAL HELPERS
// ==========================================
function openPrecancModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePrecancModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';

    // Restaurar scroll si no hay modales abiertos
    const anyOpen = document.querySelector('.modal:not(.hidden)');
    if (!anyOpen) {
        document.body.style.overflow = '';
    }
}

function setupPrecancModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closePrecancModal(modalId));
    });
}

// ==========================================
// CARGA DE DATOS CON CACHÉ PERSISTENTE
// ==========================================

// Verificar si el caché tiene datos (para carga instantánea)
// Usa el caché global de créditos para cargar instantáneamente
function hasPrecancCacheData() {
    // Primero verificar datos en memoria
    if (allCreditosPrecancelables.length > 0) {
        return true;
    }
    // Luego verificar caché global de créditos (que tiene los datos necesarios)
    return window.hasCacheData && window.hasCacheData('creditos');
}

// Verificar si necesita sincronización
function needsPrecancSync() {
    return precancCacheTimestamp === 0 ||
        (Date.now() - precancCacheTimestamp) >= CACHE_DURATION_PRECANC;
}

// Sincronización en segundo plano
function syncPrecancelacionesBackground() {
    // Sincronizar silenciosamente en segundo plano siempre
    setTimeout(async () => {
        await loadCreditosPrecancelablesFromDB(true); // silently = true
        await loadHistorialFromDB(true);
    }, 1500); // Esperar 1.5 segundos antes de sincronizar
}

// Forzar recarga desde DB (botón sincronizar)
async function refreshPrecancelaciones() {
    const btn = document.querySelector('.btn-sync');
    if (btn) {
        btn.classList.add('syncing');
        btn.querySelector('i')?.classList.add('fa-spin');
    }

    try {
        // Forzar recarga desde la base de datos
        await loadCreditosPrecancelablesFromDB(false);
        await loadHistorialFromDB(false);
        showNotification('Datos actualizados correctamente', 'success');
    } catch (error) {
        showNotification('Error al sincronizar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.classList.remove('syncing');
            btn.querySelector('i')?.classList.remove('fa-spin');
        }
    }
}

async function loadCreditosPrecancelables() {
    // 1. PRIMERO: Carga instantánea desde caché global de créditos
    if (window.hasCacheData && window.hasCacheData('creditos') && allCreditosPrecancelables.length === 0) {

        // Filtrar créditos activos y morosos del caché global
        const creditosCache = window.dataCache.creditos.filter(c =>
            c.estado_credito === 'ACTIVO' || c.estado_credito === 'MOROSO'
        );

        // Procesar créditos para cálculos básicos
        await procesarCreditosParaPrecancelacion(creditosCache);

        // Sincronizar en segundo plano para obtener datos completos
        syncPrecancelacionesBackground();
        return;
    }

    // Si ya hay datos en memoria, usarlos
    if (allCreditosPrecancelables.length > 0) {
        filteredCreditosPrecancelables = [...allCreditosPrecancelables];
        updatePrecancelacionesStats();
        renderPrecancelacionesSections();

        if (needsPrecancSync()) {
            syncPrecancelacionesBackground();
        }
        return;
    }

    // Si no hay caché, cargar desde DB
    await loadCreditosPrecancelablesFromDB(false);
}

// Procesar créditos del caché para mostrar instantáneamente
async function procesarCreditosParaPrecancelacion(creditos) {
    // Cálculos básicos sin consultar DB adicional
    allCreditosPrecancelables = creditos.map(credito => {
        // Estimación básica del capital pendiente (se actualizará en segundo plano)
        const cuotasPagadas = credito.cuotas_pagadas || 0;
        const plazo = credito.plazo || 12;
        const capitalOriginal = credito.capital || 0;

        // Estimación simple: proporción del capital
        const porcentajePagado = cuotasPagadas / plazo;
        const capitalPendienteEstimado = capitalOriginal * (1 - porcentajePagado);

        return {
            ...credito,
            capital_pendiente: credito.capital_pendiente || capitalPendienteEstimado,
            ahorro_acumulado: (credito.ahorro_programado_cuota || 0) * cuotasPagadas,
            cuotas_pagadas_count: cuotasPagadas
        };
    });

    filteredCreditosPrecancelables = [...allCreditosPrecancelables];
    precancCacheTimestamp = Date.now();

    updatePrecancelacionesStats();
    renderPrecancelacionesSections();
}

async function loadCreditosPrecancelablesFromDB(silently = false) {
    try {
        const supabase = window.getSupabaseClient();

        // Obtener créditos activos y morosos (ambos pueden precancelarse)
        const { data: creditos, error } = await supabase
            .from('ic_creditos')
            .select(`
                *,
                socio:ic_socios(*)
            `)
            .in('estado_credito', ['ACTIVO', 'MOROSO'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Calcular capital pendiente de cada crédito
        await calcularCapitalPendiente(creditos);

        allCreditosPrecancelables = creditos;
        filteredCreditosPrecancelables = [...creditos];
        precancCacheTimestamp = Date.now();

        // Actualizar estadísticas y UI
        updatePrecancelacionesStats();
        renderPrecancelacionesSections();

    } catch (error) {
        console.error('Error al cargar créditos:', error);
        if (!silently) {
            showNotification('Error al cargar créditos: ' + error.message, 'error');
        }
    }
}

async function loadHistorialPrecancelaciones() {
    // Primero renderizamos con datos en memoria si existen
    if (historialPrecancelaciones.length > 0) {
        renderHistorialSections();
        return;
    }
    await loadHistorialFromDB(false);
}

async function loadHistorialFromDB(silently = false) {
    try {
        const supabase = window.getSupabaseClient();

        const { data, error } = await supabase
            .from('ic_creditos_precancelacion')
            .select(`
                *,
                credito:ic_creditos(
                    codigo_credito,
                    capital,
                    plazo,
                    socio:ic_socios(nombre, cedula, paisresidencia)
                )
            `)
            .order('fecha_precancelacion', { ascending: false });

        if (error) throw error;

        historialPrecancelaciones = data || [];

        // Actualizar contador del tab
        const countEl = document.getElementById('tab-count-historial');
        if (countEl) countEl.textContent = historialPrecancelaciones.length;

        // Actualizar stat de procesados
        const procesadosEl = document.getElementById('precanc-stat-procesados');
        if (procesadosEl) procesadosEl.textContent = historialPrecancelaciones.length;

        // Renderizar si estamos en el tab de historial
        if (currentTab === 'historial') {
            renderHistorialSections();
        }

    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}

async function calcularCapitalPendiente(creditos) {
    const supabase = window.getSupabaseClient();

    for (const credito of creditos) {
        try {
            const { data: cuotas, error } = await supabase
                .from('ic_creditos_amortizacion')
                .select('saldo_capital, numero_cuota, estado_cuota')
                .eq('id_credito', credito.id_credito)
                .order('numero_cuota', { ascending: true });

            if (error) throw error;

            const cuotasPagadas = cuotas.filter(c => c.estado_cuota === 'PAGADO');
            const ultimaCuotaPagada = cuotasPagadas.length > 0 ? cuotasPagadas[cuotasPagadas.length - 1] : null;

            if (ultimaCuotaPagada) {
                credito.capital_pendiente = ultimaCuotaPagada.saldo_capital;
            } else {
                credito.capital_pendiente = credito.capital_financiado || credito.capital;
            }

            credito.ahorro_acumulado = cuotasPagadas.length * (credito.ahorro_programado_cuota || 0);
            credito.cuotas_pagadas_count = cuotasPagadas.length;

        } catch (error) {
            console.error('Error al calcular capital para crédito:', credito.codigo_credito, error);
            credito.capital_pendiente = credito.capital;
            credito.ahorro_acumulado = 0;
        }
    }
}

// ==========================================
// ACTUALIZACIÓN DE STATS
// ==========================================
function updatePrecancelacionesStats() {
    const creditos = filteredCreditosPrecancelables;

    // Total créditos activos
    const activosEl = document.getElementById('precanc-stat-activos');
    if (activosEl) activosEl.textContent = creditos.length;

    // Capital pendiente total
    const capitalTotal = creditos.reduce((sum, c) => sum + (c.capital_pendiente || 0), 0);
    const capitalEl = document.getElementById('precanc-stat-capital');
    if (capitalEl) capitalEl.textContent = formatMoney(capitalTotal);

    // Ahorro acumulado total
    const ahorroTotal = creditos.reduce((sum, c) => sum + (c.ahorro_acumulado || 0), 0);
    const ahorroEl = document.getElementById('precanc-stat-ahorro');
    if (ahorroEl) ahorroEl.textContent = formatMoney(ahorroTotal);

    // Contador tab activos
    const tabCountEl = document.getElementById('tab-count-activos');
    if (tabCountEl) tabCountEl.textContent = creditos.length;
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderPrecancelacionesSections() {
    const container = document.getElementById('precancelaciones-sections-container');
    const emptyEl = document.getElementById('precancelaciones-empty');

    if (!container) return;

    const creditos = filteredCreditosPrecancelables;

    if (!creditos || creditos.length === 0) {
        container.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');

    // Agrupar por estado
    const activos = creditos.filter(c => c.estado_credito === 'ACTIVO');
    const morosos = creditos.filter(c => c.estado_credito === 'MOROSO');

    let html = '';

    // Sección Activos
    if (activos.length > 0) {
        html += renderSeccionCreditos('activos', 'Créditos al Día', 'fa-check-circle', activos);
    }

    // Sección Morosos
    if (morosos.length > 0) {
        html += renderSeccionCreditos('morosos', 'Créditos en Mora', 'fa-exclamation-triangle', morosos);
    }

    container.innerHTML = html;
}

function renderSeccionCreditos(tipo, titulo, icono, creditos) {
    return `
        <div class="precancelaciones-section" data-tipo="${tipo}">
            <div class="section-header-precanc ${tipo}">
                <i class="fas ${icono}"></i>
                <span class="section-title-precanc">${titulo}</span>
                <span class="section-count-precanc">${creditos.length}</span>
            </div>
            <table class="precancelaciones-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Socio</th>
                        <th class="text-right">Capital Original</th>
                        <th class="text-center">Cuotas</th>
                        <th class="text-right">Capital Pendiente</th>
                        <th class="text-right">Ahorro</th>
                        <th class="text-center">País</th>
                        <th class="text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${creditos.map(c => renderCreditoRowPrecanc(c)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderCreditoRowPrecanc(credito) {
    const progreso = `${credito.cuotas_pagadas_count || 0}/${credito.plazo}`;
    const pais = credito.socio?.paisresidencia || '';
    const paisConfig = PAIS_CONFIG_PRECANC[pais.toUpperCase()];
    const paisFlag = paisConfig ? paisConfig.flag : '';
    const isMoroso = credito.estado_credito === 'MOROSO';
    const rowClass = isMoroso ? 'clickable-alert-row' : '';
    const rowAction = isMoroso ? ` onclick="mostrarAlertaMoraPrecancelacion('${credito.id_credito}')"` : '';
    const accionHtml = isMoroso
        ? `<button type="button" class="btn-precancelar alerta-mora" onclick="event.stopPropagation(); mostrarAlertaMoraPrecancelacion('${credito.id_credito}')">
                <i class="fas fa-exclamation-triangle"></i>
                <span>EN MORA</span>
            </button>`
        : `<button type="button" class="btn-precancelar" onclick="abrirModalCalculo('${credito.id_credito}')">
                <i class="fas fa-calculator"></i>
                <span>Precancelar</span>
            </button>`;

    return `
        <tr data-credito-id="${credito.id_credito}" class="${rowClass}"${rowAction}>
            <td>
                <span class="codigo-credito">${credito.codigo_credito}</span>
            </td>
            <td>
                <div class="socio-info">
                    <span class="socio-nombre">${credito.socio?.nombre || 'N/A'}</span>
                    <span class="socio-cedula">${credito.socio?.cedula || ''}</span>
                </div>
            </td>
            <td class="text-right">${formatMoney(credito.capital)}</td>
            <td class="text-center">
                <span class="progress-badge">${progreso}</span>
            </td>
            <td class="text-right">
                <span class="capital-amount">${formatMoney(credito.capital_pendiente || 0)}</span>
            </td>
            <td class="text-right">
                <span class="ahorro-amount">${formatMoney(credito.ahorro_acumulado || 0)}</span>
            </td>
            <td class="text-center">
                ${paisFlag ? `<img src="${paisFlag}" alt="${pais}" class="pais-flag-img" title="${pais}">` : '-'}
            </td>
            <td class="text-center">
                ${accionHtml}
            </td>
        </tr>
    `;
}

function mostrarAlertaMoraPrecancelacion(idCredito) {
    const credito = allCreditosPrecancelables.find(c => c.id_credito === idCredito);
    const mensaje = credito?.estado_credito === 'MOROSO'
        ? MENSAJE_CREDITO_EN_MORA_PRECANC
        : 'Este crédito no está disponible para precancelación';

    if (window.Swal) {
        Swal.fire({
            icon: 'warning',
            width: '460px',
            background: '#111827',
            color: '#f8fafc',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#b91c1c',
            customClass: {
                popup: 'precanc-mora-swal'
            },
            title: '<span style="color:#fca5a5; font-size:1.35rem; font-weight:800;">Crédito en mora</span>',
            html: `
                <div style="text-align:center; padding:0.5rem 0.35rem 0;">
                    <div style="width:72px; height:72px; margin:0 auto 1rem; border-radius:1.25rem; display:flex; align-items:center; justify-content:center; background:rgba(239,68,68,0.14); border:1px solid rgba(239,68,68,0.28); box-shadow:0 18px 32px rgba(127,29,29,0.22);">
                        <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:#f87171;"></i>
                    </div>
                    <p style="margin:0; font-size:1rem; line-height:1.7; color:#e5e7eb;">
                        ${mensaje}
                    </p>
                </div>
            `
        });
        return;
    }

    showNotification(mensaje, 'warning');
}

async function mostrarModalMetodoLegacyPrecancelacion(credito) {
    if (window.Swal) {
        await Swal.fire({
            icon: 'info',
            width: '520px',
            background: '#111827',
            color: '#f8fafc',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#0b4e32',
            title: '<span style="color:#93c5fd; font-size:1.3rem; font-weight:800;">Crédito legacy</span>',
            html: `
                <div style="text-align:center; padding:0.5rem 0.35rem 0;">
                    <div style="width:72px; height:72px; margin:0 auto 1rem; border-radius:1.25rem; display:flex; align-items:center; justify-content:center; background:rgba(59,130,246,0.14); border:1px solid rgba(96,165,250,0.26); box-shadow:0 18px 32px rgba(30,64,175,0.2);">
                        <i class="fas fa-layer-group" style="font-size:2rem; color:#60a5fa;"></i>
                    </div>
                    <p style="margin:0; font-size:1rem; line-height:1.7; color:#e5e7eb;">
                        ${MENSAJE_METODO_LEGACY_PRECANC}
                    </p>
                    <p style="margin:0.9rem 0 0; font-size:0.9rem; line-height:1.6; color:#94a3b8;">
                        ${credito?.codigo_credito || 'Este crédito'} mantiene una tabla recalculada solo para referencia, pero todavía no genera ahorro válido para entrar al flujo normal de precancelación.
                    </p>
                </div>
            `
        });
        return;
    }

    showNotification(MENSAJE_METODO_LEGACY_PRECANC, 'info');
}

function limpiarContextoPrecancelacionActual() {
    calculoPrecancelacion = null;
    tablaAmortizacionPrecancelacionActual = null;
    contextoLegacyPrecancelacionActual = null;
    renderTablaLegacyAjustada(null);
}

function renderTablaLegacyAjustada(contexto) {
    const panel = document.getElementById('legacy-adjusted-panel');
    const body = document.getElementById('legacy-adjusted-table-body');
    const title = document.getElementById('legacy-adjusted-title');
    const subtitle = document.getElementById('legacy-adjusted-subtitle');

    if (!panel || !body || !title || !subtitle) return;

    if (!contexto?.usarTablaAjustadaLegacy || !Array.isArray(contexto.amortizacion)) {
        panel.classList.add('hidden');
        body.innerHTML = '';
        return;
    }

    title.textContent = 'Tabla ajustada por ser crédito legacy';
    subtitle.textContent = 'La precancelación usará esta tabla generada en memoria, manteniendo las cuotas ya pagadas como canceladas.';

    body.innerHTML = contexto.amortizacion.map(cuota => `
        <tr>
            <td>${cuota.numero_cuota}</td>
            <td>${formatDate(cuota.fecha_vencimiento)}</td>
            <td><span class="legacy-status-badge ${cuota.estado_cuota === 'PAGADO' ? 'paid' : 'pending'}">${cuota.estado_cuota === 'PAGADO' ? 'PAGADA' : 'PENDIENTE'}</span></td>
            <td class="text-right">${formatMoney(cuota.pago_capital || 0)}</td>
            <td class="text-right">${formatMoney(cuota.pago_interes || 0)}</td>
            <td class="text-right">${formatMoney(cuota.ahorro_programado || 0)}</td>
            <td class="text-right">${formatMoney(cuota.cuota_total || 0)}</td>
        </tr>
    `).join('');

    panel.classList.remove('hidden');
}

async function evaluarAperturaModalPrecancelacion(credito) {
    const fechaHoy = new Date();
    fechaHoy.setHours(0, 0, 0, 0);

    const amortizacionOriginal = await obtenerAmortizacionPrecancelacion(credito.id_credito);
    const calculoOriginalHoy = construirCalculoPrecancelacion(credito, amortizacionOriginal, fechaHoy, credito.id_credito);

    if (calculoOriginalHoy.interesPerdonado > 0) {
        return {
            usarTablaAjustadaLegacy: false,
            amortizacion: amortizacionOriginal,
            calculoHoy: calculoOriginalHoy
        };
    }

    const amortizacionAjustada = generarTablaLegacyAjustadaPrecancelacion(credito, amortizacionOriginal);
    const calculoAjustadoHoy = construirCalculoPrecancelacion(credito, amortizacionAjustada, fechaHoy, credito.id_credito);

    return {
        usarTablaAjustadaLegacy: true,
        amortizacion: amortizacionAjustada,
        calculoHoy: calculoAjustadoHoy,
        requiereMetodoLegacy: calculoAjustadoHoy.interesPerdonado <= 0
    };
}

function generarTablaLegacyAjustadaPrecancelacion(credito, amortizacionOriginal) {
    const capital = parseFloat(credito.capital || 0);
    const plazo = parseInt(credito.plazo || 0, 10);
    const tasaMensual = parseFloat(credito.tasa_interes_mensual || 0) / 100;
    const diaPago = parseInt(credito.dia_pago || 1, 10);
    const fechaDesembolso = parseDate(credito.fecha_desembolso);
    const unDiaEnMs = 1000 * 60 * 60 * 24;

    let fechaPrimerPago = new Date(fechaDesembolso.getTime());
    fechaPrimerPago.setDate(1);
    fechaPrimerPago.setMonth(fechaPrimerPago.getMonth(), diaPago);

    if (fechaPrimerPago <= fechaDesembolso) {
        fechaPrimerPago.setMonth(fechaPrimerPago.getMonth() + 1);
    }

    const diffMs = fechaPrimerPago.getTime() - fechaDesembolso.getTime();
    const diffDays = Math.ceil(diffMs / unDiaEnMs);
    if (diffDays <= 25) {
        fechaPrimerPago.setMonth(fechaPrimerPago.getMonth() + 1);
    }

    const fechaBase = new Date(fechaPrimerPago.getTime());
    fechaBase.setMonth(fechaBase.getMonth() - 1);

    const fechaFinCredito = new Date(fechaBase.getTime());
    fechaFinCredito.setMonth(fechaFinCredito.getMonth() + plazo);

    const diasTotales = Math.round((fechaFinCredito.getTime() - fechaDesembolso.getTime()) / unDiaEnMs);

    let gastosAdmin = 0;
    if (capital < 5000) {
        gastosAdmin = capital * 0.038;
    } else if (capital < 20000) {
        gastosAdmin = capital * 0.023;
    } else {
        gastosAdmin = capital * 0.018;
    }

    const tasaAnual = tasaMensual * 12;
    const tasaDiaria = tasaAnual / 365;
    const interesTotal = Math.round(capital * tasaDiaria * diasTotales * 100) / 100;
    const gastosAdminRedondeado = Math.round(gastosAdmin * 100) / 100;
    const totalPagar = capital + interesTotal + gastosAdminRedondeado;
    const cuotaBase = Math.ceil(totalPagar / plazo);
    const ahorroPorCuota = 0;

    const cuotasPagadas = amortizacionOriginal.filter(c => c.estado_cuota === 'PAGADO').length
        || credito.cuotas_pagadas_count
        || credito.cuotas_pagadas
        || 0;

    const amortizacion = [];
    let saldoCapital = capital;
    let fechaAnterior = new Date(fechaDesembolso.getTime());
    const sumOfDigits = plazo * (plazo + 1) / 2;
    const gastosPorCuota = parseFloat((gastosAdminRedondeado / plazo).toFixed(2));
    let interesAcumulado = 0;
    let gastosAcumulados = 0;

    for (let i = 1; i <= plazo; i++) {
        const fechaVenc = new Date(fechaPrimerPago.getTime());
        fechaVenc.setMonth(fechaPrimerPago.getMonth() + (i - 1));
        const diasPeriodo = Math.ceil((fechaVenc - fechaAnterior) / unDiaEnMs);

        let interesDelMes = parseFloat((interesTotal * ((plazo - i + 1) / sumOfDigits)).toFixed(2));
        let capitalPeriodo = parseFloat((cuotaBase - interesDelMes - gastosPorCuota).toFixed(2));
        let cuotaBaseReal = cuotaBase;

        if (i === plazo) {
            capitalPeriodo = parseFloat(saldoCapital.toFixed(2));
            const interesRestante = parseFloat((interesTotal - interesAcumulado).toFixed(2));
            const gastosRestante = parseFloat((gastosAdminRedondeado - gastosAcumulados).toFixed(2));
            cuotaBaseReal = parseFloat((capitalPeriodo + interesRestante + gastosRestante).toFixed(2));
        }

        const pagoGastos = i === plazo
            ? parseFloat((gastosAdminRedondeado - gastosAcumulados).toFixed(2))
            : gastosPorCuota;
        interesDelMes = parseFloat((cuotaBaseReal - capitalPeriodo - pagoGastos).toFixed(2));

        saldoCapital -= capitalPeriodo;
        if (saldoCapital < 0.01) saldoCapital = 0;

        amortizacion.push({
            numero_cuota: i,
            fecha_vencimiento: toISODate(fechaVenc),
            dias_periodo: diasPeriodo,
            pago_capital: parseFloat(capitalPeriodo.toFixed(2)),
            pago_interes: parseFloat(interesDelMes.toFixed(2)),
            pago_gastos_admin: parseFloat(pagoGastos.toFixed(2)),
            ahorro_programado: 0,
            cuota_base: parseFloat(cuotaBaseReal.toFixed(2)),
            cuota_total: parseFloat(cuotaBaseReal.toFixed(2)),
            saldo_capital: parseFloat(Math.max(0, saldoCapital).toFixed(2)),
            estado_cuota: i <= cuotasPagadas ? 'PAGADO' : 'PENDIENTE'
        });

        interesAcumulado += interesDelMes;
        gastosAcumulados += pagoGastos;
        fechaAnterior = fechaVenc;
    }

    return amortizacion;
}

function renderHistorialSections() {
    const container = document.getElementById('historial-sections-container');
    const emptyEl = document.getElementById('historial-empty');

    if (!container) return;

    if (!historialPrecancelaciones || historialPrecancelaciones.length === 0) {
        container.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');

    const html = `
        <div class="precancelaciones-section">
            <div class="section-header-precanc historial">
                <i class="fas fa-history"></i>
                <span class="section-title-precanc">Precancelaciones Procesadas</span>
                <span class="section-count-precanc">${historialPrecancelaciones.length}</span>
            </div>
            <table class="precancelaciones-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Código</th>
                        <th>Socio</th>
                        <th class="text-right">Capital Cancelado</th>
                        <th class="text-right">Monto Pagado</th>
                        <th class="text-right">Ahorro Devuelto</th>
                        <th class="text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${historialPrecancelaciones.map(p => renderHistorialRow(p)).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function renderHistorialRow(precancelacion) {
    const fecha = formatDate(precancelacion.fecha_precancelacion);

    return `
        <tr data-precancelacion-id="${precancelacion.id}">
            <td>
                <span class="fecha-precancelacion">${fecha}</span>
            </td>
            <td>
                <span class="codigo-credito">${precancelacion.credito?.codigo_credito || 'N/A'}</span>
            </td>
            <td>
                <div class="socio-info">
                    <span class="socio-nombre">${precancelacion.credito?.socio?.nombre || 'N/A'}</span>
                    <span class="socio-cedula">${precancelacion.credito?.socio?.cedula || ''}</span>
                </div>
            </td>
            <td class="text-right">${formatMoney(precancelacion.capital_pendiente)}</td>
            <td class="text-right">
                <span class="monto-pagado">${formatMoney(precancelacion.monto_total_pagado)}</span>
            </td>
            <td class="text-right">
                <span class="ahorro-devuelto">${formatMoney(precancelacion.ahorro_devuelto)}</span>
            </td>
            <td class="text-center">
                <button class="btn-ver-detalle" onclick="verDetallePrecancelacion('${precancelacion.id}')">
                    <i class="fas fa-eye"></i>
                    <span>Ver</span>
                </button>
            </td>
        </tr>
    `;
}

// ==========================================
// TABS Y FILTROS
// ==========================================
function switchPrecancelacionTab(tab) {
    currentTab = tab;

    // Actualizar botones
    document.querySelectorAll('.precancelaciones-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Mostrar contenido
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });

    // Renderizar contenido del tab
    if (tab === 'historial') {
        renderHistorialSections();
    }
}

function filterPrecancelacionesByPais(pais) {
    currentPaisFilterPrecanc = pais;

    // Actualizar UI botones
    document.querySelectorAll('.precancelaciones-toolbar .pais-filter-btn').forEach(btn => {
        const btnPais = btn.dataset.pais || '';
        btn.classList.toggle('active', btnPais === pais);
    });

    applyFiltersPrecanc();
}

function handleSearchPrecanc(e) {
    applyFiltersPrecanc();
}

function applyFiltersPrecanc() {
    const searchInput = document.getElementById('search-precancelacion');
    const query = searchInput?.value.toLowerCase().trim() || '';

    filteredCreditosPrecancelables = allCreditosPrecancelables.filter(credito => {
        // Filtro de búsqueda
        const matchesSearch = !query ||
            credito.codigo_credito.toLowerCase().includes(query) ||
            credito.socio?.nombre?.toLowerCase().includes(query) ||
            credito.socio?.cedula?.includes(query);

        // Filtro de país
        const paisCredito = credito.socio?.paisresidencia?.toUpperCase() || '';
        const matchesPais = !currentPaisFilterPrecanc ||
            paisCredito.includes(currentPaisFilterPrecanc.toUpperCase());

        return matchesSearch && matchesPais;
    });

    updatePrecancelacionesStats();
    renderPrecancelacionesSections();
}

async function refreshPrecancelaciones() {
    showNotification('Actualizando datos...', 'info');
    await Promise.all([
        loadCreditosPrecancelables(),
        loadHistorialPrecancelaciones()
    ]);

    if (currentTab === 'historial') {
        renderHistorialSections();
    }

    showNotification('Datos actualizados', 'success');
}

// ==========================================
// MODAL CÁLCULO PRECANCELACIÓN
// ==========================================
async function abrirModalCalculo(idCredito) {
    try {
        const credito = allCreditosPrecancelables.find(c => c.id_credito === idCredito);
        if (!credito) throw new Error('Crédito no encontrado');
        if (credito.estado_credito === 'MOROSO') {
            mostrarAlertaMoraPrecancelacion(idCredito);
            return;
        }

        beginLoading('Evaluando crédito...');
        const contextoApertura = await evaluarAperturaModalPrecancelacion(credito);

        if (contextoApertura.requiereMetodoLegacy) {
            await mostrarModalMetodoLegacyPrecancelacion(credito);
            return;
        }

        creditoActual = credito;
        tablaAmortizacionPrecancelacionActual = contextoApertura.amortizacion;
        contextoLegacyPrecancelacionActual = contextoApertura;
        calculoPrecancelacion = null;
        renderTablaLegacyAjustada(contextoApertura);

        // Llenar info del crédito
        document.getElementById('calc-credito-codigo').textContent = credito.codigo_credito;
        document.getElementById('calc-credito-socio').textContent = credito.socio?.nombre || 'N/A';
        document.getElementById('calc-capital-original').textContent = formatMoney(credito.capital);
        document.getElementById('calc-cuotas-info').textContent = `${credito.cuotas_pagadas_count || 0}/${credito.plazo}`;
        document.getElementById('calc-tasa-info').textContent = `${credito.tasa_interes_mensual || 2}%`;

        // Resetear resultados
        document.getElementById('resultados-calculo')?.classList.add('hidden');
        document.getElementById('btn-generar-pdf-precancelacion')?.classList.add('hidden');
        document.getElementById('btn-procesar-precancelacion')?.classList.add('hidden');
        penalizacionGastosAdminMultiplicador = 1;
        actualizarBotoneraPenalizacion(1);

        // Fecha por defecto
        document.getElementById('fecha-precancelacion').valueAsDate = new Date();

        // Abrir modal
        openPrecancModal('modal-calcular-precancelacion');

    } catch (error) {
        console.error('Error al abrir modal:', error);
        showNotification('Error al cargar datos del crédito', 'error');
    } finally {
        endLoading();
    }
}

async function handleCalcularMontos() {
    if (!creditoActual) return;

    const fechaPrecancelacion = document.getElementById('fecha-precancelacion').value;

    if (!fechaPrecancelacion) {
        showNotification('Por favor seleccione una fecha de precancelación', 'warning');
        return;
    }

    const fechaPrecanc = parseDate(fechaPrecancelacion);
    const fechaDesembolso = parseDate(creditoActual.fecha_desembolso);

    if (fechaPrecanc <= fechaDesembolso) {
        showNotification('La fecha de precancelación debe ser posterior al desembolso', 'error');
        return;
    }

    try {
        beginLoading('Calculando montos...');

        penalizacionGastosAdminMultiplicador = getPenalizacionGastosAdminMultiplicador();

        const calculo = await calcularPrecancelacion(creditoActual.id_credito, fechaPrecanc, penalizacionGastosAdminMultiplicador);
        calculoPrecancelacion = calculo;

        mostrarResultadosCalculo(calculo);

        document.getElementById('btn-generar-pdf-precancelacion')?.classList.remove('hidden');
        document.getElementById('btn-procesar-precancelacion')?.classList.remove('hidden');

    } catch (error) {
        console.error('Error al calcular:', error);
        showNotification(error.message, 'error');
    } finally {
        endLoading();
    }
}

function getPenalizacionGastosAdminMultiplicador() {
    const activeButton = document.querySelector('.penalizacion-multiplicador-btn.active');
    const value = parseInt(activeButton?.dataset.multiplicador || '1', 10);
    if (Number.isNaN(value)) return 1;
    return Math.min(3, Math.max(1, value));
}

function actualizarBotoneraPenalizacion(multiplicador) {
    document.querySelectorAll('.penalizacion-multiplicador-btn').forEach((button) => {
        const buttonValue = parseInt(button.dataset.multiplicador || '1', 10);
        button.classList.toggle('active', buttonValue === multiplicador);
    });
}

async function handlePenalizacionGastosAdminClick(event) {
    const button = event.currentTarget;
    const multiplicador = parseInt(button?.dataset.multiplicador || '1', 10);

    if (Number.isNaN(multiplicador)) return;

    penalizacionGastosAdminMultiplicador = Math.min(3, Math.max(1, multiplicador));
    actualizarBotoneraPenalizacion(penalizacionGastosAdminMultiplicador);

    if (!creditoActual) return;

    const fechaPrecancelacion = document.getElementById('fecha-precancelacion')?.value;
    if (!fechaPrecancelacion) return;

    const fechaPrecanc = parseDate(fechaPrecancelacion);
    const fechaDesembolso = parseDate(creditoActual.fecha_desembolso);
    if (!fechaPrecanc || fechaPrecanc <= fechaDesembolso) return;

    try {
        const calculo = await calcularPrecancelacion(
            creditoActual.id_credito,
            fechaPrecanc,
            penalizacionGastosAdminMultiplicador
        );

        calculoPrecancelacion = calculo;
        mostrarResultadosCalculo(calculo, { scroll: false });
        document.getElementById('btn-generar-pdf-precancelacion')?.classList.remove('hidden');
        document.getElementById('btn-procesar-precancelacion')?.classList.remove('hidden');
    } catch (error) {
        console.error('Error al recalcular penalización:', error);
        showNotification(error.message, 'error');
    }
}

async function calcularPrecancelacion(idCredito, fechaPrecancelacion, penalizacionMultiplicador = 1) {
    const credito = creditoActual?.id_credito === idCredito
        ? creditoActual
        : allCreditosPrecancelables.find(c => c.id_credito === idCredito);

    if (!credito) throw new Error('Crédito no encontrado');

    const amortizacion = tablaAmortizacionPrecancelacionActual && creditoActual?.id_credito === idCredito
        ? tablaAmortizacionPrecancelacionActual
        : await obtenerAmortizacionPrecancelacion(idCredito);

    return construirCalculoPrecancelacion(credito, amortizacion, fechaPrecancelacion, idCredito, penalizacionMultiplicador);
}

async function obtenerAmortizacionPrecancelacion(idCredito) {
    const supabase = window.getSupabaseClient();

    const { data: amortizacion, error: errorAmort } = await supabase
        .from('ic_creditos_amortizacion')
        .select('*')
        .eq('id_credito', idCredito)
        .order('numero_cuota', { ascending: true });

    if (errorAmort) throw errorAmort;
    if (!amortizacion?.length) throw new Error('No se encontró tabla de amortización');

    return amortizacion;
}

function construirCalculoPrecancelacion(credito, amortizacion, fechaPrecancelacion, idCredito, penalizacionMultiplicador = 1) {
    const fechaEvaluacion = new Date(fechaPrecancelacion);
    fechaEvaluacion.setHours(0, 0, 0, 0);
    const usaTablaAjustadaLegacy = Boolean(
        contextoLegacyPrecancelacionActual?.usarTablaAjustadaLegacy &&
        tablaAmortizacionPrecancelacionActual === amortizacion
    );

    // 2. Determinar cuotas pagadas
    const cuotasPagadasArr = amortizacion.filter(c => c.estado_cuota === 'PAGADO');
    const cuotasPagadas = cuotasPagadasArr.length;
    const cuotasRestantes = amortizacion.length - cuotasPagadas;

    if (cuotasRestantes === 0) throw new Error('El crédito ya está completamente pagado');

    // 3. Validar mora
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaCorte = fechaEvaluacion < hoy ? fechaEvaluacion : hoy;

    const cuotasVencidasSinPagar = amortizacion.filter(c => {
        const fv = parseDate(c.fecha_vencimiento);
        return fv < fechaCorte && c.estado_cuota !== 'PAGADO';
    });

    if (cuotasVencidasSinPagar.length > 0) {
        throw new Error(MENSAJE_CREDITO_EN_MORA_PRECANC);
    }

    // 4. Capital pendiente
    let capitalPendiente;
    let fechaUltimaCuotaPagada;

    if (cuotasPagadas === 0) {
        capitalPendiente = credito.capital_financiado || credito.capital;
        fechaUltimaCuotaPagada = parseDate(credito.fecha_desembolso);
    } else {
        const ultima = cuotasPagadasArr[cuotasPagadasArr.length - 1];
        capitalPendiente = ultima.saldo_capital;
        fechaUltimaCuotaPagada = parseDate(ultima.fecha_vencimiento);
    }

    // 5. Total pendiente y ahorro programado acumulado
    const cuotasPendientes = amortizacion.filter(c => c.estado_cuota !== 'PAGADO');
    const totalCuotasPendientes = cuotasPendientes.reduce(
        (sum, cuota) => sum + parseFloat(cuota.cuota_total || 0),
        0
    );
    const gastosAdministrativosBasePendientes = cuotasPendientes.reduce(
        (sum, cuota) => sum + parseFloat(cuota.pago_gastos_admin || 0),
        0
    );
    const gastosAdministrativosCobrados = gastosAdministrativosBasePendientes * penalizacionMultiplicador;
    const ahorroPagado = usaTablaAjustadaLegacy
        ? 0
        : cuotasPagadas * (credito.ahorro_programado_cuota || 0);

    // 6. Interés proporcional por días
    const unDiaEnMs = 1000 * 60 * 60 * 24;
    const diasTranscurridos = Math.max(0, Math.round((fechaEvaluacion - fechaUltimaCuotaPagada) / unDiaEnMs));

    const tasaMensual = (credito.tasa_interes_mensual || 0) / 100;
    const tasaDiaria = (tasaMensual * 12) / 365;
    const interesProporcional = capitalPendiente * tasaDiaria * diasTranscurridos;

    const montoPrecancelar = capitalPendiente + interesProporcional + gastosAdministrativosCobrados;
    const interesPerdonado = Math.max(0, totalCuotasPendientes - montoPrecancelar);

    return {
        idCredito,
        fechaPrecancelacion: fechaEvaluacion,
        cuotasPagadas,
        cuotasRestantes,
        capitalPendiente,
        totalCuotasPendientes,
        gastosAdministrativosBasePendientes,
        gastosAdministrativosCobrados,
        penalizacionMultiplicador,
        diasTranscurridos,
        interesProporcional,
        interesPerdonado,
        ahorroDevolver: ahorroPagado,
        montoPrecancelar,
        usaTablaAjustadaLegacy,
        tieneMora: false,
        cuotasMora: cuotasVencidasSinPagar.length
    };
}

function mostrarResultadosCalculo(calculo, options = {}) {
    const { scroll = true } = options;
    const ids = {
        'calc-cuotas-pagadas': calculo.cuotasPagadas,
        'calc-cuotas-restantes': calculo.cuotasRestantes,
        'calc-capital-pendiente': formatMoney(calculo.capitalPendiente),
        'calc-dias-transcurridos': `${calculo.diasTranscurridos} días`,
        'calc-interes-proporcional': formatMoney(calculo.interesProporcional),
        'calc-interes-perdonado': formatMoney(calculo.interesPerdonado),
        'calc-total-normal': formatMoney(calculo.totalCuotasPendientes),
        'calc-gastos-admin-cobrados': formatMoney(calculo.gastosAdministrativosCobrados),
        'calc-gastos-admin-base': formatMoney(calculo.gastosAdministrativosBasePendientes),
        'calc-penalizacion-factor': `${calculo.penalizacionMultiplicador}x`,
        'calc-ahorro-devolver': formatMoney(calculo.ahorroDevolver),
        'calc-monto-total': formatMoney(calculo.montoPrecancelar),
        'calc-detalle-pagar': formatMoney(calculo.montoPrecancelar),
        'calc-detalle-gastos-admin': formatMoney(calculo.gastosAdministrativosCobrados),
        'calc-detalle-devolver': formatMoney(calculo.ahorroDevolver),
        'calc-detalle-ahorro': formatMoney(calculo.interesPerdonado)
    };

    for (const [id, value] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    actualizarBotoneraPenalizacion(calculo.penalizacionMultiplicador || 1);

    const resultadosEl = document.getElementById('resultados-calculo');
    resultadosEl?.classList.remove('hidden');

    if (resultadosEl && scroll) {
        requestAnimationFrame(() => {
            resultadosEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

// ==========================================
// MODAL CONFIRMACIÓN
// ==========================================
function abrirModalConfirmacion() {
    // Validar estado de caja
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('PRECANCELACIÓN')) return;
    }

    if (!calculoPrecancelacion || !creditoActual) return;

    const resumen = `
        <div class="confirm-info">
            <p><strong>Crédito:</strong> ${creditoActual.codigo_credito}</p>
            <p><strong>Socio:</strong> ${creditoActual.socio?.nombre}</p>
            <p><strong>Fecha:</strong> ${formatDate(calculoPrecancelacion.fechaPrecancelacion)}</p>
            <hr style="border-color: var(--border-color); margin: 1rem 0;">
            <p><strong>Gastos admin. cobrados:</strong> <span style="color: #f59e0b;">${formatMoney(calculoPrecancelacion.gastosAdministrativosCobrados || 0)}</span></p>
            <p><strong>Base gastos admin.:</strong> <span style="color: #FCD34D;">${formatMoney(calculoPrecancelacion.gastosAdministrativosBasePendientes || 0)}</span> (${calculoPrecancelacion.penalizacionMultiplicador || 1}x)</p>
            <p><strong>Monto a pagar:</strong> <span style="color: var(--gold); font-size: 1.25rem;">${formatMoney(calculoPrecancelacion.montoPrecancelar)}</span></p>
            <p><strong>Ahorro a devolver:</strong> <span style="color: #60A5FA;">${formatMoney(calculoPrecancelacion.ahorroDevolver)}</span></p>
        </div>
    `;

    const resumenEl = document.getElementById('confirm-resumen');
    if (resumenEl) resumenEl.innerHTML = resumen;

    closePrecancModal('modal-calcular-precancelacion');
    openPrecancModal('modal-confirmar-precancelacion');
}

async function generarPDFPrecancelacion() {
    if (!creditoActual || !calculoPrecancelacion) {
        showNotification('Primero calcule los montos de la precancelación', 'warning');
        return;
    }

    if (!window.jspdf?.jsPDF) {
        showNotification('La librería de PDF no está disponible en este momento', 'error');
        return;
    }

    const btnPdf = document.getElementById('btn-generar-pdf-precancelacion');
    const originalHtml = btnPdf?.innerHTML || '';

    try {
        if (btnPdf) {
            btnPdf.disabled = true;
            btnPdf.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        if (typeof doc.autoTable !== 'function') {
            throw new Error('autoTable no está disponible para generar el detalle');
        }

        const colors = {
            primary: [14, 89, 54],
            secondary: [22, 115, 54],
            tertiary: [17, 76, 89],
            contrast1: [191, 75, 33],
            contrast2: [242, 177, 56],
            textDark: [51, 51, 51],
            textSoft: [100, 116, 139],
            lightGray: [240, 240, 240],
            successBg: [236, 253, 245],
            successText: [5, 150, 105]
        };

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 15;
        const contentWidth = pageWidth - (margin * 2);

        const currentUser = window.getCurrentUser ? window.getCurrentUser() : window.currentUser;
        const asesorNombre = currentUser?.nombre || currentUser?.full_name || currentUser?.user_metadata?.full_name || 'SISTEMA';
        const fechaFirma = typeof window.formatDateTime === 'function'
            ? window.formatDateTime(new Date())
            : new Date().toLocaleString('es-EC');

        const fechaAcordada = new Date(calculoPrecancelacion.fechaPrecancelacion);
        fechaAcordada.setHours(0, 0, 0, 0);
        const escenariosProyeccion = [];
        for (let offset = 0; offset <= 7; offset++) {
            const fechaEscenario = new Date(fechaAcordada.getTime());
            fechaEscenario.setDate(fechaEscenario.getDate() + offset);
            try {
                const calculoEscenario = offset === 0
                    ? calculoPrecancelacion
                    : await calcularPrecancelacion(
                        creditoActual.id_credito,
                        fechaEscenario,
                        calculoPrecancelacion.penalizacionMultiplicador || 1
                    );

                escenariosProyeccion.push({
                    offset,
                    fecha: fechaEscenario,
                    calculo: calculoEscenario,
                    detalle: offset === 0 ? 'Fecha acordada' : `Dia ${offset}`
                });
            } catch (error) {
                escenariosProyeccion.push({
                    offset,
                    fecha: fechaEscenario,
                    calculo: null,
                    detalle: error.message || 'No disponible'
                });
            }
        }

        const amortizacionPdf = Array.isArray(tablaAmortizacionPrecancelacionActual)
            ? tablaAmortizacionPrecancelacionActual
            : await obtenerAmortizacionPrecancelacion(creditoActual.id_credito);

        const cuotaReferencial = parseFloat(
            creditoActual.cuota_con_ahorro ||
            amortizacionPdf.find((cuota) => Number(cuota.numero_cuota) === 1)?.cuota_total ||
            amortizacionPdf[0]?.cuota_total ||
            0
        );
        const plazoCredito = parseInt(creditoActual.plazo || amortizacionPdf.length || 0, 10);
        const valorFinalCredito = cuotaReferencial > 0
            ? cuotaReferencial * plazoCredito
            : amortizacionPdf.reduce((sum, cuota) => sum + parseFloat(cuota.cuota_total || 0), 0);

        const capitalOtorgado = parseFloat(creditoActual.capital || creditoActual.capital_financiado || 0);
        const ahorroAnticipado = parseFloat(calculoPrecancelacion.interesPerdonado || 0);
        const ahorroRecolectado = parseFloat(calculoPrecancelacion.ahorroDevolver || 0);
        const nombreSocio = creditoActual.socio?.nombre || 'Socio no identificado';
        const codigoCredito = creditoActual.codigo_credito || 'SIN-CODIGO';
        const modoCalculo = calculoPrecancelacion.usaTablaAjustadaLegacy
            ? 'Resumen estimado con tabla legacy ajustada.'
            : 'Resumen estimado con la tabla vigente del crédito.';

        const loadImage = (url) => new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });

        const money = (value) => formatMoney(value || 0);
        const dateLong = (value) => formatDate(value, { year: 'numeric', month: 'long', day: 'numeric' });
        const dateShort = (value) => formatDate(value, { year: 'numeric', month: 'short', day: 'numeric' });
        const dateDisplay = (value) => {
            const parts = new Intl.DateTimeFormat('es-EC', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).formatToParts(value instanceof Date ? value : new Date(value));
            const day = parts.find((part) => part.type === 'day')?.value || '';
            const month = parts.find((part) => part.type === 'month')?.value || '';
            const year = parts.find((part) => part.type === 'year')?.value || '';
            return `${day} ${month} ${year}`.trim();
        };
        const qrPayload = [
            'INKA CORP',
            'Documento: Resumen de Precancelacion',
            `Credito: ${codigoCredito}`,
            `Socio: ${nombreSocio}`,
            `Monto estimado: ${money(calculoPrecancelacion.montoPrecancelar)}`,
            `Ahorro proyectado: ${money(ahorroAnticipado)}`,
            `Ahorro programado acumulado: ${money(ahorroRecolectado)}`,
            `Emitido por: ${asesorNombre}`,
            `Fecha: ${fechaFirma}`
        ].join('\n');
        const logoImg = await loadImage('https://lh3.googleusercontent.com/d/15J6Aj6ZwkVrmDfs6uyVk-oG0Mqr-i9Jn=w2048?name=inka%20corp%20normal.png');
        const qrImg = await loadImage(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`);
        const splitSocio = doc.splitTextToSize(`Socio: ${nombreSocio}`, 88);
        const splitFecha = doc.splitTextToSize(`Emitido: ${fechaFirma}`, 42);
        const splitModo = doc.splitTextToSize(modoCalculo, 42);

        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        doc.setFillColor(...colors.primary);
        doc.rect(0, 0, pageWidth, 3, 'F');
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 3, pageWidth, 44, 'F');

        if (logoImg) {
            try {
                doc.addImage(logoImg, 'PNG', margin, 7, 24, 24);
            } catch (error) {
                console.error('Error adding logo to precancelacion PDF:', error);
            }
        }

        doc.setTextColor(...colors.primary);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text('RESUMEN DE PRECANCELACION', 45, 15);
        doc.setDrawColor(...colors.lightGray);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(148, 8, 47, 28, 3, 3, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.textSoft);
        doc.setFontSize(11);
        doc.text(`Credito ${codigoCredito}`, 45, 23);
        doc.text(splitSocio, 45, 29);
        doc.setFontSize(8.5);
        doc.text(splitFecha, 151, 15);
        doc.text(splitModo, 151, 24);

        let y = 54;

        doc.setFillColor(...colors.successBg);
        doc.roundedRect(margin, y, contentWidth, 24, 4, 4, 'F');
        doc.setDrawColor(...colors.secondary);
        doc.setLineWidth(0.8);
        doc.roundedRect(margin, y, contentWidth, 24, 4, 4, 'S');
        doc.setTextColor(...colors.successText);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('HACIENDO TU PRECANCELACION AHORRARAS', pageWidth / 2, y + 8, { align: 'center' });
        doc.setFontSize(22);
        doc.text(money(ahorroAnticipado), pageWidth / 2, y + 18, { align: 'center' });

        y += 31;

        const drawMetricCard = (x, posY, width, height, label, value, accent = colors.primary) => {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(...accent);
            doc.setLineWidth(0.6);
            doc.roundedRect(x, posY, width, height, 3, 3, 'S');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...colors.textSoft);
            doc.text(label.toUpperCase(), x + 4, posY + 7);
            doc.setFontSize(12);
            doc.setTextColor(...colors.textDark);
            doc.text(value, x + 4, posY + 15);
        };

        const drawAmountDueCard = (x, posY, width, height, label, value, fechaTexto, accent = colors.contrast1) => {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(...accent);
            doc.setLineWidth(0.6);
            doc.roundedRect(x, posY, width, height, 3, 3, 'S');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...colors.textSoft);
            doc.text(label.toUpperCase(), x + 4, posY + 5.5);
            doc.setFontSize(12);
            doc.setTextColor(...colors.textDark);
            doc.text(value, x + 4, posY + 13.5);
            doc.setDrawColor(...colors.lightGray);
            doc.setLineWidth(0.3);
            doc.line(x + (width / 2), posY + 7, x + (width / 2), posY + height - 3);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...colors.contrast1);
            doc.text('FECHA ELEGIDA', x + (width / 2) + 4, posY + 9.5);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.8);
            doc.text(fechaTexto, x + (width / 2) + 4, posY + 15.8);
        };

        const cardGap = 5;
        const cardWidth = (contentWidth - cardGap) / 2;
        drawMetricCard(margin, y, cardWidth, 20, 'Capital otorgado', money(capitalOtorgado), colors.primary);
        drawMetricCard(margin + cardWidth + cardGap, y, cardWidth, 20, 'Valor final del credito', money(valorFinalCredito), colors.contrast2);
        y += 24;
        drawMetricCard(margin, y, cardWidth, 20, 'Descuento por pago anticipado', money(ahorroAnticipado), colors.secondary);
        drawMetricCard(margin + cardWidth + cardGap, y, cardWidth, 20, 'Ahorro programado acumulado', money(ahorroRecolectado), colors.tertiary);
        y += 24;
        drawAmountDueCard(
            margin,
            y,
            contentWidth,
            21,
            'Valor a pagar en la fecha elegida',
            money(calculoPrecancelacion.montoPrecancelar),
            dateDisplay(fechaAcordada),
            colors.contrast1
        );
        y += 29;



        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...colors.primary);
        const proyeccionIntro = doc.splitTextToSize(
            'Si no puede realizar el pago en la fecha acordada, aqui le compartimos una guia clara con los valores estimados para los siguientes 7 dias. Recuerde que, mientras antes concrete su precancelacion, mayor sera el ahorro que obtiene.',
            contentWidth
        );
        doc.text(proyeccionIntro, margin, y);
        y += proyeccionIntro.length * 5 + 4;

        const escenariosBody = escenariosProyeccion.map((escenario) => {
            if (!escenario.calculo) {
                return [
                    escenario.detalle,
                    dateLong(escenario.fecha),
                    '-',
                    '-',
                    '-',
                    '-',
                    escenario.detalle
                ];
            }

            return [
                escenario.offset === 0 ? 'Fecha acordada' : `+${escenario.offset} dia${escenario.offset === 1 ? '' : 's'}`,
                dateLong(escenario.fecha),
                money(escenario.calculo.interesProporcional),
                money(escenario.calculo.montoPrecancelar),
                money(escenario.calculo.interesPerdonado),
                escenario.offset === 0 ? 'Valor base' : 'Proyeccion diaria'
            ];
        });

        doc.autoTable({
            startY: y,
            head: [['Escenario', 'Fecha de pago', 'Interes proporcional', 'Monto a pagar', 'Ahorro obtenido', 'Detalle']],
            body: escenariosBody,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 7.6,
                cellPadding: 2.1,
                textColor: colors.textDark
            },
            headStyles: {
                fillColor: colors.primary,
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            columnStyles: {
                0: { cellWidth: 22 },
                1: { cellWidth: 40 },
                2: { cellWidth: 30 },
                3: { cellWidth: 30 },
                4: { cellWidth: 30 },
                5: { cellWidth: 28 }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 3) {
                    data.cell.styles.fillColor = [255, 244, 229];
                    data.cell.styles.textColor = colors.contrast1;
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.lineColor = [245, 158, 11];
                    data.cell.styles.lineWidth = 0.2;
                }
            },
            margin: { left: margin, right: margin }
        });

        y = doc.lastAutoTable.finalY + 5;
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, pageWidth, 24, 'F');
        doc.setTextColor(...colors.primary);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('DETALLE DE PAGOS DEL CREDITO', margin, 15);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.textSoft);
        doc.setFontSize(9);
        doc.text('Tabla de cuotas con estado actualizado y ahorro programado por cuota.', margin, 21);

        const amortizacionBody = amortizacionPdf.map((cuota) => [
            String(cuota.numero_cuota || '-'),
            dateShort(cuota.fecha_vencimiento),
            money(cuota.cuota_total || 0),
            money(cuota.ahorro_programado || 0),
            cuota.estado_cuota === 'PAGADO' ? 'Pagada' : 'Pendiente'
        ]);

        doc.autoTable({
            startY: 30,
            head: [['No. cuota', 'Fecha de cobro', 'Valor de cuota', 'Ahorro programado', 'Estado']],
            body: amortizacionBody,
            theme: 'striped',
            styles: {
                font: 'helvetica',
                fontSize: 8,
                cellPadding: 2.2,
                textColor: colors.textDark
            },
            headStyles: {
                fillColor: colors.tertiary,
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [247, 250, 252]
            },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 36 },
                2: { cellWidth: 36 },
                3: { cellWidth: 40 },
                4: { cellWidth: 26 }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 4) {
                    const estado = String(data.cell.raw || '').toLowerCase();
                    if (estado === 'pagada') {
                        data.cell.styles.fillColor = [236, 253, 245];
                        data.cell.styles.textColor = [5, 150, 105];
                    } else {
                        data.cell.styles.fillColor = [255, 247, 237];
                        data.cell.styles.textColor = [234, 88, 12];
                    }
                    data.cell.styles.fontStyle = 'bold';
                }
            },
            margin: { left: margin, right: margin }
        });

        y = doc.lastAutoTable.finalY + 8;
        if (y > pageHeight - 56) {
            doc.addPage();
            y = 24;
        }

        doc.setFillColor(...colors.lightGray);
        doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.primary);
        doc.setFontSize(10.5);
        doc.text('Mensaje de agradecimiento', margin + 4, y + 7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.textDark);
        doc.setFontSize(9);
        const gratitudeText = doc.splitTextToSize(
            'Agradecemos profundamente su preferencia y la confianza que deposita en INKA CORP. Esta propuesta ha sido preparada para destacar el beneficio economico de su precancelacion y facilitar una decision oportuna, clara y favorable para usted.',
            contentWidth - 8
        );
        doc.text(gratitudeText, margin + 4, y + 13);

        y += 36;
        if (y > pageHeight - 56) {
            doc.addPage();
            y = 24;
        }

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...colors.primary);
        doc.roundedRect(margin, y, contentWidth, 36, 3, 3, 'S');
        if (qrImg) {
            try {
                doc.addImage(qrImg, 'PNG', margin + 4, y + 4, 24, 24);
            } catch (error) {
                console.error('Error adding QR to precancelacion PDF:', error);
            }
        } else {
            doc.setFillColor(...colors.lightGray);
            doc.roundedRect(margin + 4, y + 4, 24, 24, 2, 2, 'F');
            doc.setTextColor(...colors.textSoft);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('QR', margin + 16, y + 18, { align: 'center' });
        }
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.textDark);
        doc.setFontSize(10);
        doc.text('FIRMA ELECTRONICA VALIDADA', margin + 34, y + 10);
        doc.text(String(asesorNombre).toUpperCase(), margin + 34, y + 17);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`Fecha y hora: ${fechaFirma}`, margin + 34, y + 24);
        doc.text(`Codigo de verificacion: ${codigoCredito}`, margin + 34, y + 30);

        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setDrawColor(...colors.lightGray);
            doc.line(margin, 287, pageWidth - margin, 287);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...colors.textSoft);
            doc.text('INKA CORP - Resumen de Precancelacion', margin, 292);
            doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - margin, 292, { align: 'right' });
        }

        const safeSocio = String(nombreSocio || 'Socio').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
        doc.save(`Precancelacion_${codigoCredito}_${safeSocio}.pdf`);
    } catch (error) {
        console.error('Error generando PDF de precancelacion:', error);
        showNotification(`No se pudo generar el PDF: ${error.message}`, 'error');
    } finally {
        if (btnPdf) {
            btnPdf.disabled = false;
            btnPdf.innerHTML = originalHtml;
        }
    }
}

async function handleConfirmarPrecancelacion() {
    if (!calculoPrecancelacion || !creditoActual) return;

    const referencia = document.getElementById('confirm-referencia')?.value || '';
    const observaciones = document.getElementById('confirm-observaciones')?.value || '';

    try {
        beginLoading('Procesando precancelación...');

        await ejecutarProcesamiento(calculoPrecancelacion, referencia, observaciones);

        showNotification('Precancelación completada con éxito', 'success');
        closePrecancModal('modal-confirmar-precancelacion');

        // Limpiar formulario
        document.getElementById('confirm-referencia').value = '';
        document.getElementById('confirm-observaciones').value = '';

        // Recargar datos
        await refreshPrecancelaciones();

    } catch (error) {
        console.error('Error al procesar precancelación:', error);
        showNotification('Error: ' + error.message, 'error');
    } finally {
        endLoading();
    }
}

async function ejecutarProcesamiento(calculo, referencia, observacion) {
    const supabase = window.getSupabaseClient();
    const user = window.getCurrentUser();

    // 1. Insertar registro de precancelación
    const { data: precanc, error: errP } = await supabase
        .from('ic_creditos_precancelacion')
        .insert({
            id_credito: calculo.idCredito,
            fecha_precancelacion: toISODate(calculo.fechaPrecancelacion),
            cuotas_pagadas: calculo.cuotasPagadas,
            cuotas_restantes: calculo.cuotasRestantes,
            capital_pendiente: calculo.capitalPendiente,
            dias_desde_ultima_cuota: calculo.diasTranscurridos,
            interes_proporcional: calculo.interesProporcional,
            interes_perdonado: calculo.interesPerdonado,
            ahorro_acumulado: calculo.ahorroDevolver,
            ahorro_devuelto: calculo.ahorroDevolver,
            monto_total_pagado: calculo.montoPrecancelar,
            referencia_pago: referencia,
            observacion: observacion,
            procesado_por: user?.id
        })
        .select()
        .single();

    if (errP) throw errP;

    // 2. Marcar crédito como PRECANCELADO
    const { error: errC } = await supabase
        .from('ic_creditos')
        .update({ estado_credito: 'PRECANCELADO' })
        .eq('id_credito', calculo.idCredito);

    if (errC) throw errC;

    // 3. Cancelar cuotas pendientes
    const { error: errA } = await supabase
        .from('ic_creditos_amortizacion')
        .update({ estado_cuota: 'CANCELADO' })
        .eq('id_credito', calculo.idCredito)
        .eq('estado_cuota', 'PENDIENTE');

    if (errA) throw errA;

    // 4. Invalidar caché de créditos
    if (window.invalidateCache) {
        window.invalidateCache('creditos');
    }

    return precanc;
}

// ==========================================
// VER DETALLE PRECANCELACIÓN
// ==========================================
function verDetallePrecancelacion(idPrecancelacion) {
    const precanc = historialPrecancelaciones.find(p => p.id === idPrecancelacion);
    if (!precanc) {
        showNotification('Precancelación no encontrada', 'error');
        return;
    }

    const fecha = formatDate(precanc.fecha_precancelacion, { weekday: 'long', month: 'long' });

    const html = `
        <div class="detalle-precancelacion">
            <div class="credito-info-card">
                <div class="credito-info-header">
                    <span class="credito-codigo">${precanc.credito?.codigo_credito || 'N/A'}</span>
                    <span class="credito-estado" style="background: rgba(59, 130, 246, 0.15); color: #60A5FA;">PRECANCELADO</span>
                </div>
                <div class="credito-info-socio">${precanc.credito?.socio?.nombre || 'N/A'}</div>
                <div class="credito-info-details">
                    <div class="detail-item">
                        <span class="detail-label">Cédula</span>
                        <span class="detail-value">${precanc.credito?.socio?.cedula || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Capital Original</span>
                        <span class="detail-value">${formatMoney(precanc.credito?.capital)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Plazo</span>
                        <span class="detail-value">${precanc.credito?.plazo} meses</span>
                    </div>
                </div>
            </div>

            <h4 class="section-title"><i class="fas fa-calendar-check"></i> Fecha de Precancelación</h4>
            <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">${fecha}</p>

            <h4 class="section-title"><i class="fas fa-receipt"></i> Detalle del Cálculo</h4>
            <div class="resumen-grid">
                <div class="resumen-item">
                    <div class="resumen-label">Cuotas Pagadas</div>
                    <div class="resumen-value">${precanc.cuotas_pagadas}</div>
                </div>
                <div class="resumen-item">
                    <div class="resumen-label">Cuotas Restantes</div>
                    <div class="resumen-value">${precanc.cuotas_restantes}</div>
                </div>
            </div>

            <div class="resumen-grid">
                <div class="resumen-item">
                    <div class="resumen-label">Capital Pendiente</div>
                    <div class="resumen-value">${formatMoney(precanc.capital_pendiente)}</div>
                </div>
                <div class="resumen-item">
                    <div class="resumen-label">Días desde última cuota</div>
                    <div class="resumen-value">${precanc.dias_desde_ultima_cuota} días</div>
                </div>
            </div>

            <div class="resumen-grid">
                <div class="resumen-item">
                    <div class="resumen-label">Interés Proporcional</div>
                    <div class="resumen-value">${formatMoney(precanc.interes_proporcional)}</div>
                </div>
                <div class="resumen-item success">
                    <div class="resumen-label">Interés Perdonado</div>
                    <div class="resumen-value">${formatMoney(precanc.interes_perdonado)}</div>
                </div>
            </div>

            <div class="resumen-grid highlight-grid">
                <div class="resumen-item highlight devolucion">
                    <div class="resumen-label"><i class="fas fa-piggy-bank"></i> Ahorro Devuelto</div>
                    <div class="resumen-value">${formatMoney(precanc.ahorro_devuelto)}</div>
                </div>
                <div class="resumen-item highlight pagar">
                    <div class="resumen-label"><i class="fas fa-dollar-sign"></i> Monto Pagado</div>
                    <div class="resumen-value">${formatMoney(precanc.monto_total_pagado)}</div>
                </div>
            </div>

            ${precanc.referencia_pago ? `
                <div class="info-box" style="margin-top: 1.5rem;">
                    <strong><i class="fas fa-receipt"></i> Referencia:</strong> ${precanc.referencia_pago}
                </div>
            ` : ''}

            ${precanc.observacion ? `
                <div class="info-box" style="margin-top: 0.75rem;">
                    <strong><i class="fas fa-comment"></i> Observaciones:</strong> ${precanc.observacion}
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('modal-detalle-precancelacion-body').innerHTML = html;
    openPrecancModal('modal-ver-precancelacion');
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(amount || 0);
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

// Exponer globalmente
window.initPrecancelacionesModule = initPrecancelacionesModule;
