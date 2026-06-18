/**
 * INKA CORP - Modulo de Creditos Emergentes
 * Gestion unitaria: solicitud, aprobacion, colocacion, desembolso y pago.
 */

let allCreditosEmergentes = [];
let filteredCreditosEmergentes = [];
let currentEmergenteEstadoFilter = '';
let currentEmergenteSearch = '';
let sociosEmergentes = [];
let selectedEmergenteDesembolsoFiles = {};
const EMERGENTE_ADMIN_ANNUAL_RATE = 20;

async function initCreditosEmergentesModule() {
    setupCreditosEmergentesEventListeners();
    exposeCreditosEmergentesGlobals();
    await loadSociosEmergentes();
    await loadCreditosEmergentes();
}

function exposeCreditosEmergentesGlobals() {
    window.refreshCreditosEmergentes = refreshCreditosEmergentes;
    window.filterCreditosEmergentes = filterCreditosEmergentes;
    window.openEmergenteSolicitudModal = openEmergenteSolicitudModal;
    window.viewCreditoEmergente = viewCreditoEmergente;
    window.aprobarCreditoEmergente = aprobarCreditoEmergente;
    window.rechazarCreditoEmergente = rechazarCreditoEmergente;
    window.colocarCreditoEmergente = colocarCreditoEmergente;
    window.desembolsarCreditoEmergente = desembolsarCreditoEmergente;
    window.registrarPagoCreditoEmergente = registrarPagoCreditoEmergente;
    window.selectEmergenteSocio = selectEmergenteSocio;
}

function setupCreditosEmergentesEventListeners() {
    setupEmergenteModalClose('modal-emergente-solicitud');
    setupEmergenteModalClose('modal-emergente-detalle');

    const search = document.getElementById('search-emergentes');
    if (search) {
        search.oninput = () => {
            currentEmergenteSearch = search.value.trim().toLowerCase();
            applyCreditosEmergentesFilters();
        };
    }

    const form = document.getElementById('form-emergente-solicitud');
    if (form) {
        form.onsubmit = async (event) => {
            event.preventDefault();
            await saveEmergenteSolicitud();
        };
    }

    setupEmergenteSocioCombobox();
    setupEmergenteRateInputs();
}

function setupEmergenteModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelectorAll('[data-close-modal]').forEach((el) => {
        el.addEventListener('click', () => closeEmergenteModal(modalId));
    });
}

function openEmergenteModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeEmergenteModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

async function loadSociosEmergentes() {
    try {
        if (window.hasCacheData && window.hasCacheData('socios')) {
            sociosEmergentes = window.getCacheData('socios');
            fillEmergenteSocioSelect();
            return;
        }

        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_socios')
            .select('idsocio,nombre,cedula,whatsapp,paisresidencia,estadocivil,nombreconyuge,cedulaconyuge,domicilio,nombrereferencia,whatsappreferencia')
            .order('nombre', { ascending: true });

        if (error) throw error;

        sociosEmergentes = data || [];
        if (window.setCacheData) window.setCacheData('socios', sociosEmergentes);
        fillEmergenteSocioSelect();
    } catch (error) {
        console.error('Error cargando socios para emergentes:', error);
        notifyEmergente('No se pudieron cargar los socios.', 'error');
    }
}

function fillEmergenteSocioSelect() {
    renderEmergenteSocioOptions('');
}

function setupEmergenteSocioCombobox() {
    const search = document.getElementById('emergente-socio-search');
    const hidden = document.getElementById('emergente-socio');
    const toggle = document.querySelector('#emergente-socio-combobox .emergente-combobox-toggle');
    const options = document.getElementById('emergente-socio-options');

    if (!search || !hidden || !options) return;

    search.addEventListener('input', () => {
        hidden.value = '';
        renderEmergenteSocioOptions(search.value);
        openEmergenteSocioOptions();
    });

    search.addEventListener('focus', () => {
        renderEmergenteSocioOptions(search.value);
        openEmergenteSocioOptions();
    });

    search.addEventListener('keydown', (event) => {
        const items = Array.from(options.querySelectorAll('.emergente-combobox-option'));
        if (!items.length) return;

        const currentIndex = items.findIndex((item) => item.classList.contains('active'));

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
            setEmergenteSocioActiveOption(items, nextIndex);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
            setEmergenteSocioActiveOption(items, nextIndex);
        } else if (event.key === 'Enter') {
            const active = items[currentIndex >= 0 ? currentIndex : 0];
            if (active) {
                event.preventDefault();
                selectEmergenteSocio(active.dataset.id);
            }
        } else if (event.key === 'Escape') {
            closeEmergenteSocioOptions();
        }
    });

    if (toggle) {
        toggle.addEventListener('click', () => {
            const isClosed = options.classList.contains('hidden');
            renderEmergenteSocioOptions(search.value);
            if (isClosed) {
                openEmergenteSocioOptions();
                search.focus();
            } else {
                closeEmergenteSocioOptions();
            }
        });
    }

    document.addEventListener('click', (event) => {
        if (!event.target.closest('#emergente-socio-combobox')) {
            closeEmergenteSocioOptions();
        }
    });
}

function renderEmergenteSocioOptions(query = '') {
    const options = document.getElementById('emergente-socio-options');
    if (!options) return;

    const normalized = normalizeEmergenteSearch(query);
    const matches = sociosEmergentes
        .filter((socio) => {
            if (!normalized) return true;
            const haystack = normalizeEmergenteSearch([
                socio.nombre,
                socio.cedula,
                socio.whatsapp,
                socio.paisresidencia
            ].join(' '));
            return haystack.includes(normalized);
        })
        .slice(0, 80);

    if (!matches.length) {
        options.innerHTML = '<div class="emergente-combobox-empty">No se encontraron socios</div>';
        return;
    }

    options.innerHTML = matches.map((socio, index) => `
        <button type="button" class="emergente-combobox-option ${index === 0 ? 'active' : ''}"
            data-id="${escapeEmergenteHtml(socio.idsocio)}"
            onclick="selectEmergenteSocio('${escapeEmergenteJsArg(socio.idsocio)}')">
            <strong>${escapeEmergenteHtml(socio.nombre || 'Socio')}</strong>
            <span>${escapeEmergenteHtml(socio.cedula || 'Sin cedula')} · ${escapeEmergenteHtml(socio.paisresidencia || 'Sin pais')}</span>
        </button>
    `).join('');

    window.selectEmergenteSocio = selectEmergenteSocio;
}

function selectEmergenteSocio(idSocio) {
    const socio = sociosEmergentes.find((item) => item.idsocio === idSocio);
    if (!socio) return;

    const search = document.getElementById('emergente-socio-search');
    const hidden = document.getElementById('emergente-socio');

    if (search) search.value = `${socio.nombre || 'Socio'} - ${socio.cedula || 'Sin cedula'}`;
    if (hidden) hidden.value = socio.idsocio;

    closeEmergenteSocioOptions();
}

function openEmergenteSocioOptions() {
    const options = document.getElementById('emergente-socio-options');
    if (options) options.classList.remove('hidden');
}

function closeEmergenteSocioOptions() {
    const options = document.getElementById('emergente-socio-options');
    if (options) options.classList.add('hidden');
}

function setEmergenteSocioActiveOption(items, index) {
    items.forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === index));
    items[index]?.scrollIntoView({ block: 'nearest' });
}

function setupEmergenteRateInputs() {
    const tasaInput = document.getElementById('emergente-tasa');
    const tasaTipo = document.getElementById('emergente-tasa-tipo');
    const montoInput = document.getElementById('emergente-monto');
    const plazoInput = document.getElementById('emergente-plazo');
    const plazoUnidad = document.getElementById('emergente-plazo-unidad');

    if (tasaInput) tasaInput.addEventListener('input', updateEmergenteRatePreview);
    if (tasaTipo) tasaTipo.addEventListener('change', updateEmergenteRatePreview);
    if (montoInput) montoInput.addEventListener('input', updateEmergenteRatePreview);
    if (plazoInput) plazoInput.addEventListener('input', updateEmergenteRatePreview);
    if (plazoUnidad) plazoUnidad.addEventListener('change', updateEmergenteRatePreview);

    updateEmergenteRatePreview();
}

function updateEmergenteRatePreview() {
    const tasaInput = parseEmergenteNumber(document.getElementById('emergente-tasa')?.value);
    const tasaTipo = document.getElementById('emergente-tasa-tipo')?.value || 'MENSUAL';
    const tasaMensual = normalizeEmergenteMonthlyRate(tasaInput, tasaTipo);
    const capital = parseEmergenteNumber(document.getElementById('emergente-monto')?.value);
    const plazo = parseInt(document.getElementById('emergente-plazo')?.value || '0', 10);
    const unidad = document.getElementById('emergente-plazo-unidad')?.value || 'DIAS';
    const interesPlazo = calculateEmergenteTermInterestFromInput(capital, tasaInput, tasaTipo, plazo, unidad);
    const gastosAdmin = calculateEmergenteAdminExpenses(capital, plazo, unidad);
    const gastosRate = getEmergenteAdminEffectiveRate(capital, plazo, unidad);

    setEmergenteText('emergente-rate-monthly', formatEmergenteRateDisplay(tasaMensual));
    setEmergenteText('emergente-rate-annual', formatEmergenteRateDisplay(tasaMensual * 12));
    setEmergenteText('emergente-rate-daily', formatEmergenteRateDisplay(tasaMensual / 30));
    setEmergenteText('emergente-term-interest', formatEmergenteMoney(interesPlazo));
    setEmergenteText('emergente-term-admin', formatEmergenteMoney(gastosAdmin));
    setEmergenteText('emergente-term-admin-rate', `${formatEmergenteRateDisplay(gastosRate)} aplicado al plazo`);
    setEmergenteText('emergente-term-total', formatEmergenteMoney(capital + interesPlazo + gastosAdmin));
}

function setupSwalEmergenteRatePreview() {
    const tasaInput = document.getElementById('swal-tasa');
    const tasaTipo = document.getElementById('swal-tasa-tipo');
    const montoInput = document.getElementById('swal-monto-aprobado');
    const plazoInput = document.getElementById('swal-plazo');
    const unidadInput = document.getElementById('swal-unidad');

    const update = () => {
        const tasaCapturada = parseEmergenteNumber(tasaInput?.value);
        const tipo = tasaTipo?.value || 'MENSUAL';
        const mensual = normalizeEmergenteMonthlyRate(tasaCapturada, tipo);
        const capital = parseEmergenteNumber(montoInput?.value);
        const plazo = parseInt(plazoInput?.value || '0', 10);
        const unidad = unidadInput?.value || 'DIAS';
        const interes = calculateEmergenteTermInterestFromInput(capital, tasaCapturada, tipo, plazo, unidad);
        const gastosAdmin = calculateEmergenteAdminExpenses(capital, plazo, unidad);
        const gastosRate = getEmergenteAdminEffectiveRate(capital, plazo, unidad);
        setEmergenteText('swal-rate-monthly', formatEmergenteRateDisplay(mensual));
        setEmergenteText('swal-rate-annual', formatEmergenteRateDisplay(mensual * 12));
        setEmergenteText('swal-rate-daily', formatEmergenteRateDisplay(mensual / 30));
        setEmergenteText('swal-term-interest', formatEmergenteMoney(interes));
        setEmergenteText('swal-term-admin', formatEmergenteMoney(gastosAdmin));
        setEmergenteText('swal-term-admin-rate', `${formatEmergenteRateDisplay(gastosRate)} aplicado al plazo`);
        setEmergenteText('swal-term-total', formatEmergenteMoney(capital + interes + gastosAdmin));
    };

    if (tasaInput) tasaInput.addEventListener('input', update);
    if (tasaTipo) tasaTipo.addEventListener('change', update);
    if (montoInput) montoInput.addEventListener('input', update);
    if (plazoInput) plazoInput.addEventListener('input', update);
    if (unidadInput) unidadInput.addEventListener('change', update);
    update();
}

async function loadCreditosEmergentes(forceRefresh = false) {
    try {
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('creditos_emergentes')) {
            allCreditosEmergentes = window.getCacheData('creditos_emergentes');
            applyCreditosEmergentesFilters();

            if (window.isCacheValid && window.isCacheValid('creditos_emergentes')) return;
        }

        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_creditos_emergentes')
            .select(`
                *,
                socio:ic_socios (
                    idsocio,
                    nombre,
                    cedula,
                    whatsapp,
                    paisresidencia,
                    estadocivil,
                    nombreconyuge,
                    cedulaconyuge,
                    domicilio,
                    nombrereferencia,
                    whatsappreferencia
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allCreditosEmergentes = data || [];
        if (window.setCacheData) window.setCacheData('creditos_emergentes', allCreditosEmergentes);
        applyCreditosEmergentesFilters();
    } catch (error) {
        console.error('Error cargando creditos emergentes:', error);
        const grid = document.getElementById('emergentes-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="emergente-empty">
                    <i class="fas fa-database"></i>
                    <p>No se pudieron cargar los creditos emergentes.</p>
                    <button class="emergente-action-btn primary" onclick="refreshCreditosEmergentes()">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
        }
    }
}

async function refreshCreditosEmergentes() {
    if (window.dataCache) {
        window.dataCache.creditos_emergentes = [];
        if (window.dataCache.lastUpdate) window.dataCache.lastUpdate.creditos_emergentes = 0;
    }
    await loadCreditosEmergentes(true);
    notifyEmergente('Creditos emergentes actualizados.', 'success');
}

function filterCreditosEmergentes(estado) {
    currentEmergenteEstadoFilter = estado || '';
    document.querySelectorAll('.emergente-filter').forEach((btn) => {
        btn.classList.toggle('active', (btn.dataset.estado || '') === currentEmergenteEstadoFilter);
    });
    applyCreditosEmergentesFilters();
}

function applyCreditosEmergentesFilters() {
    filteredCreditosEmergentes = allCreditosEmergentes.filter((credito) => {
        const estado = (credito.estado || '').toUpperCase();
        if (currentEmergenteEstadoFilter && estado !== currentEmergenteEstadoFilter) return false;

        if (currentEmergenteSearch) {
            const socio = getEmergenteSocioName(credito);
            const haystack = [
                credito.codigo_emergente,
                socio,
                credito.cedula_socio_snapshot,
                credito.motivo,
                credito.condiciones
            ].join(' ').toLowerCase();
            if (!haystack.includes(currentEmergenteSearch)) return false;
        }

        return true;
    });

    updateCreditosEmergentesStats();
    renderCreditosEmergentes();
}

function updateCreditosEmergentesStats() {
    const total = allCreditosEmergentes.length;
    const solicitados = allCreditosEmergentes.filter((c) => c.estado === 'SOLICITADO').length;
    const desembolsados = allCreditosEmergentes.filter((c) => ['DESEMBOLSADO', 'ABONADO', 'VENCIDO'].includes(c.estado)).length;
    const alertas = getEmergentesConAlerta().length;

    setEmergenteText('stat-emergentes-total', total);
    setEmergenteText('stat-emergentes-solicitados', solicitados);
    setEmergenteText('stat-emergentes-desembolsados', desembolsados);
    setEmergenteText('stat-emergentes-alertas', alertas);

    setEmergenteText('count-emergentes-all', total);
    setEmergenteText('count-emergentes-solicitado', solicitados);
    setEmergenteText('count-emergentes-aprobado', allCreditosEmergentes.filter((c) => c.estado === 'APROBADO').length);
    setEmergenteText('count-emergentes-colocado', allCreditosEmergentes.filter((c) => c.estado === 'COLOCADO').length);
    setEmergenteText('count-emergentes-desembolsado', allCreditosEmergentes.filter((c) => c.estado === 'DESEMBOLSADO').length);
    setEmergenteText('count-emergentes-pagado', allCreditosEmergentes.filter((c) => c.estado === 'PAGADO').length);

    updateEmergentesAlertStrip(alertas);
}

function updateEmergentesAlertStrip(alertas) {
    const strip = document.getElementById('emergentes-alert-strip');
    const text = document.getElementById('emergentes-alert-text');
    if (!strip || !text) return;

    strip.classList.remove('warning', 'danger');

    const vencidos = getEmergentesConAlerta().filter((c) => daysToEmergenteDue(c.fecha_vencimiento) < 0).length;
    if (vencidos > 0) {
        strip.classList.add('danger');
        text.textContent = `${vencidos} credito${vencidos === 1 ? '' : 's'} emergente${vencidos === 1 ? '' : 's'} vencido${vencidos === 1 ? '' : 's'} pendiente${vencidos === 1 ? '' : 's'} de pago`;
    } else if (alertas > 0) {
        strip.classList.add('warning');
        text.textContent = `${alertas} credito${alertas === 1 ? '' : 's'} emergente${alertas === 1 ? '' : 's'} vence${alertas === 1 ? '' : 'n'} dentro de 3 dias o hoy`;
    } else {
        text.textContent = 'Sin vencimientos urgentes';
    }
}

function getEmergentesConAlerta() {
    return allCreditosEmergentes.filter((credito) => {
        if (!['DESEMBOLSADO', 'ABONADO', 'VENCIDO'].includes(credito.estado)) return false;
        const days = daysToEmergenteDue(credito.fecha_vencimiento);
        return days !== null && days <= 3;
    });
}

function renderCreditosEmergentes() {
    const grid = document.getElementById('emergentes-grid');
    if (!grid) return;

    if (!filteredCreditosEmergentes.length) {
        grid.innerHTML = `
            <div class="emergente-empty">
                <i class="fas fa-folder-open fa-2x"></i>
                <p>No hay creditos emergentes para este filtro.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredCreditosEmergentes.map(renderEmergenteCard).join('');
}

function renderEmergenteCard(credito) {
    const estado = (credito.estado || 'SOLICITADO').toUpperCase();
    const fechaVencimiento = resolveEmergenteDueDate(credito);
    const dueLabel = getEmergenteDueLabel(credito);
    const socio = getEmergenteSocioName(credito);
    const total = Number(credito.monto_total || credito.monto_aprobado || credito.monto_solicitado || 0);
    const saldo = Number(credito.saldo_pendiente ?? total);
    const dueTitle = ['SOLICITADO', 'APROBADO', 'COLOCADO'].includes(estado)
        ? 'Vencimiento estimado'
        : 'Vencimiento';

    return `
        <article class="emergente-card">
            <div class="emergente-card-header">
                <div class="emergente-card-identity">
                    <div class="emergente-code">${escapeEmergenteHtml(credito.codigo_emergente || 'EMG')}</div>
                    <div class="emergente-socio">${escapeEmergenteHtml(socio)}</div>
                </div>
                <span class="emergente-badge ${estado.toLowerCase()}">${escapeEmergenteHtml(estado)}</span>
            </div>

            <div class="emergente-financial-summary">
                <div class="emergente-total-block">
                    <span>Total al vencimiento</span>
                    <strong>${formatEmergenteMoney(total)}</strong>
                    <small>Capital + interes + gastos administrativos</small>
                </div>
                <div class="emergente-breakdown-grid">
                    <div>
                        <span>Capital</span>
                        <strong>${formatEmergenteMoney(credito.monto_aprobado || credito.monto_solicitado)}</strong>
                    </div>
                    <div>
                        <span>Interes</span>
                        <strong>${formatEmergenteMoney(credito.monto_interes)}</strong>
                    </div>
                    <div>
                        <span>Gastos</span>
                        <strong>${formatEmergenteMoney(credito.gastos_administrativos)}</strong>
                    </div>
                    <div>
                        <span>Saldo</span>
                        <strong>${formatEmergenteMoney(saldo)}</strong>
                    </div>
                </div>
            </div>

            <div class="emergente-terms-row">
                <span><i class="fas fa-clock"></i> ${escapeEmergenteHtml(formatEmergentePlazo(credito))}</span>
                <span><i class="fas fa-percent"></i> ${formatEmergenteOriginalRate(credito)}</span>
                <span><i class="fas fa-receipt"></i> ${formatEmergenteRateDisplay(getEmergenteAdminMonthlyRate(credito.monto_aprobado || credito.monto_solicitado))} admin. mensual</span>
            </div>

            <div class="emergente-dates">
                <div>
                    <span>Solicitud</span>
                    <strong>${formatEmergenteDate(credito.fecha_solicitud)}</strong>
                </div>
                <i class="fas fa-arrow-right"></i>
                <div class="${daysToEmergenteDue(fechaVencimiento) < 0 ? 'overdue' : ''}">
                    <span>${dueTitle}</span>
                    <strong>${formatEmergenteDate(fechaVencimiento)}</strong>
                    <small>${escapeEmergenteHtml(dueLabel)}</small>
                </div>
            </div>

            <div class="emergente-actions">
                <button class="emergente-action-btn" onclick="viewCreditoEmergente('${credito.id_emergente}')">
                    <i class="fas fa-eye"></i> Ver
                </button>
                ${renderEmergenteActionButtons(credito)}
            </div>
        </article>
    `;
}

function renderEmergenteActionButtons(credito) {
    const estado = credito.estado;
    const id = credito.id_emergente;

    if (estado === 'SOLICITADO') {
        return `
            <button class="emergente-action-btn primary" onclick="aprobarCreditoEmergente('${id}')">
                <i class="fas fa-check"></i> Aprobar
            </button>
            <button class="emergente-action-btn danger" onclick="rechazarCreditoEmergente('${id}')">
                <i class="fas fa-times"></i> Rechazar
            </button>
        `;
    }

    if (estado === 'APROBADO') {
        return `
            <button class="emergente-action-btn primary" onclick="colocarCreditoEmergente('${id}')">
                <i class="fas fa-file-signature"></i> Colocar / Docs
            </button>
        `;
    }

    if (estado === 'COLOCADO') {
        return `
            <button class="emergente-action-btn success" onclick="desembolsarCreditoEmergente('${id}')">
                <i class="fas fa-file-signature"></i> Documentos / Desembolso
            </button>
        `;
    }

    if (['DESEMBOLSADO', 'ABONADO', 'VENCIDO'].includes(estado)) {
        return `
            <button class="emergente-action-btn success" onclick="registrarPagoCreditoEmergente('${id}')">
                <i class="fas fa-cash-register"></i> Pago
            </button>
        `;
    }

    return '';
}

function openEmergenteSolicitudModal() {
    const form = document.getElementById('form-emergente-solicitud');
    if (form) form.reset();
    const search = document.getElementById('emergente-socio-search');
    if (search) search.value = '';
    const hidden = document.getElementById('emergente-socio');
    if (hidden) hidden.value = '';
    const fechaSolicitud = document.getElementById('emergente-fecha-solicitud');
    if (fechaSolicitud) fechaSolicitud.value = todayEmergenteISO();
    fillEmergenteSocioSelect();
    closeEmergenteSocioOptions();
    updateEmergenteRatePreview();
    openEmergenteModal('modal-emergente-solicitud');
}

async function saveEmergenteSolicitud() {
    const socioId = document.getElementById('emergente-socio')?.value;
    const socio = sociosEmergentes.find((item) => item.idsocio === socioId);

    if (!socio) {
        notifyEmergente('Seleccione un socio valido.', 'warning');
        return;
    }

    const monto = parseEmergenteNumber(document.getElementById('emergente-monto')?.value);
    const plazo = parseInt(document.getElementById('emergente-plazo')?.value || '0', 10);
    const tasaInput = parseEmergenteNumber(document.getElementById('emergente-tasa')?.value);
    const tasaTipo = document.getElementById('emergente-tasa-tipo')?.value || 'MENSUAL';
    const tasaMensual = normalizeEmergenteMonthlyRate(tasaInput, tasaTipo);
    const fechaSolicitud = document.getElementById('emergente-fecha-solicitud')?.value || todayEmergenteISO();
    const motivo = document.getElementById('emergente-motivo')?.value?.trim();

    if (!monto || !plazo || !motivo) {
        notifyEmergente('Complete monto, plazo y motivo.', 'warning');
        return;
    }

    try {
        const supabase = window.getSupabaseClient();
        const user = window.getCurrentUser ? window.getCurrentUser() : window.currentUser;
        const plazoUnidad = document.getElementById('emergente-plazo-unidad')?.value || 'DIAS';
        const interes = calculateEmergenteTermInterestFromInput(monto, tasaInput, tasaTipo, plazo, plazoUnidad);
        const gastosAdmin = calculateEmergenteAdminExpenses(monto, plazo, plazoUnidad);
        const fechaVencimiento = calcularFechaVencimientoEmergente(fechaSolicitud, plazo, plazoUnidad);

        const payload = {
            id_socio: socio.idsocio,
            nombre_socio_snapshot: socio.nombre || null,
            cedula_socio_snapshot: socio.cedula || null,
            whatsapp_socio_snapshot: socio.whatsapp || null,
            monto_solicitado: monto,
            monto_interes: interes,
            gastos_administrativos_porcentaje: getEmergenteAdminAnnualRate(monto),
            gastos_administrativos: gastosAdmin,
            monto_total: roundEmergenteMoney(monto + interes + gastosAdmin),
            tasa_interes_porcentaje: tasaMensual,
            tasa_original_valor: roundEmergenteRate(tasaInput),
            tasa_original_tipo: tasaTipo,
            tasa_interes_default: tasaTipo === 'MENSUAL' && roundEmergenteRate(tasaMensual) === 2,
            plazo_valor: plazo,
            plazo_unidad: plazoUnidad,
            plazo_origen: document.getElementById('emergente-plazo-origen')?.value || 'MANUAL',
            motivo,
            estado: 'SOLICITADO',
            fecha_solicitud: fechaSolicitud,
            fecha_vencimiento: fechaVencimiento,
            creado_por: user?.id || null
        };

        const { error } = await supabase.from('ic_creditos_emergentes').insert(payload);
        if (error) throw error;

        closeEmergenteModal('modal-emergente-solicitud');
        notifyEmergente('Solicitud emergente registrada.', 'success');
        await refreshCreditosEmergentes();
    } catch (error) {
        console.error('Error guardando solicitud emergente:', error);
        notifyEmergente(error.message || 'No se pudo guardar la solicitud.', 'error');
    }
}

async function aprobarCreditoEmergente(id) {
    const credito = findEmergenteById(id);
    if (!credito) return;
    const tasaOriginalTipo = credito.tasa_original_tipo || 'MENSUAL';
    const tasaOriginalValor = credito.tasa_original_valor ?? credito.tasa_interes_porcentaje ?? 2;

    const result = await Swal.fire({
        title: 'Aprobar credito emergente',
        html: `
            <div class="emergente-swal-grid">
                <label>Monto aprobado<input id="swal-monto-aprobado" type="number" min="1" step="0.01" value="${Number(credito.monto_solicitado || 0).toFixed(2)}"></label>
                <label>Tasa (%)<input id="swal-tasa" type="number" min="0" step="0.01" value="${formatEmergenteRateInput(tasaOriginalValor)}"></label>
                <label>Tipo de tasa
                    <select id="swal-tasa-tipo">
                        <option value="MENSUAL" ${tasaOriginalTipo === 'MENSUAL' ? 'selected' : ''}>Mensual</option>
                        <option value="ANUAL" ${tasaOriginalTipo === 'ANUAL' ? 'selected' : ''}>Anual</option>
                    </select>
                </label>
                <div class="emergente-rate-preview span-2">
                    <div><span>Mensual</span><strong id="swal-rate-monthly">${formatEmergenteRateDisplay(credito.tasa_interes_porcentaje || 2)}</strong></div>
                    <div><span>Anual</span><strong id="swal-rate-annual">${formatEmergenteRateDisplay((credito.tasa_interes_porcentaje || 2) * 12)}</strong></div>
                    <div><span>Diario</span><strong id="swal-rate-daily">${formatEmergenteRateDisplay((credito.tasa_interes_porcentaje || 2) / 30)}</strong></div>
                </div>
                <label>Plazo<input id="swal-plazo" type="number" min="1" step="1" value="${credito.plazo_valor || 30}"></label>
                <label>Unidad
                    <select id="swal-unidad">
                        <option value="DIAS" ${credito.plazo_unidad === 'DIAS' ? 'selected' : ''}>Dias</option>
                        <option value="MESES" ${credito.plazo_unidad === 'MESES' ? 'selected' : ''}>Meses</option>
                    </select>
                </label>
                <div class="emergente-term-preview span-2">
                    <div><span>Interes del plazo</span><strong id="swal-term-interest">${formatEmergenteMoney(credito.monto_interes)}</strong></div>
                    <div>
                        <span>Gastos administrativos</span>
                        <strong id="swal-term-admin">${formatEmergenteMoney(credito.gastos_administrativos)}</strong>
                        <small id="swal-term-admin-rate">${formatEmergenteRateDisplay(getEmergenteAdminEffectiveRate(credito.monto_aprobado || credito.monto_solicitado, credito.plazo_valor, credito.plazo_unidad))} aplicado al plazo</small>
                    </div>
                    <div><span>Total al vencimiento</span><strong id="swal-term-total">${formatEmergenteMoney(credito.monto_total)}</strong></div>
                </div>
                <label class="span-2">Condiciones<textarea id="swal-condiciones" rows="3">${escapeEmergenteHtml(credito.condiciones || '')}</textarea></label>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Aprobar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0B4E32',
        background: '#0f172a',
        color: '#fff',
        didOpen: () => setupSwalEmergenteRatePreview(),
        preConfirm: () => ({
            monto: parseEmergenteNumber(document.getElementById('swal-monto-aprobado')?.value),
            tasa: parseEmergenteNumber(document.getElementById('swal-tasa')?.value),
            tasaTipo: document.getElementById('swal-tasa-tipo')?.value || 'MENSUAL',
            plazo: parseInt(document.getElementById('swal-plazo')?.value || '0', 10),
            unidad: document.getElementById('swal-unidad')?.value || 'DIAS',
            condiciones: document.getElementById('swal-condiciones')?.value?.trim() || null
        })
    });

    if (!result.isConfirmed) return;

    const data = result.value;
    if (!data.monto || !data.plazo) {
        notifyEmergente('Monto y plazo son obligatorios.', 'warning');
        return;
    }

    const tasaMensual = normalizeEmergenteMonthlyRate(data.tasa, data.tasaTipo);
    const interes = calculateEmergenteTermInterestFromInput(data.monto, data.tasa, data.tasaTipo, data.plazo, data.unidad);
    const gastosAdmin = calculateEmergenteAdminExpenses(data.monto, data.plazo, data.unidad);
    const fechaVencimiento = calcularFechaVencimientoEmergente(
        credito.fecha_solicitud || todayEmergenteISO(),
        data.plazo,
        data.unidad
    );
    await updateEmergente(id, {
        estado: 'APROBADO',
        monto_aprobado: data.monto,
        monto_interes: interes,
        gastos_administrativos_porcentaje: getEmergenteAdminAnnualRate(data.monto),
        gastos_administrativos: gastosAdmin,
        monto_total: roundEmergenteMoney(data.monto + interes + gastosAdmin),
        tasa_interes_porcentaje: tasaMensual,
        tasa_original_valor: roundEmergenteRate(data.tasa),
        tasa_original_tipo: data.tasaTipo,
        tasa_interes_default: data.tasaTipo === 'MENSUAL' && roundEmergenteRate(tasaMensual) === 2,
        plazo_valor: data.plazo,
        plazo_unidad: data.unidad,
        fecha_vencimiento: fechaVencimiento,
        condiciones: data.condiciones,
        fecha_aprobacion: todayEmergenteISO(),
        aprobado_por: getEmergenteUserId()
    }, 'Credito emergente aprobado.');
}

async function rechazarCreditoEmergente(id) {
    const result = await Swal.fire({
        title: 'Rechazar solicitud',
        input: 'textarea',
        inputLabel: 'Motivo',
        inputPlaceholder: 'Detalle el motivo de rechazo...',
        showCancelButton: true,
        confirmButtonText: 'Rechazar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626'
    });

    if (!result.isConfirmed) return;

    await updateEmergente(id, {
        estado: 'RECHAZADO',
        motivo_respuesta: result.value || null,
        aprobado_por: getEmergenteUserId(),
        fecha_aprobacion: todayEmergenteISO()
    }, 'Solicitud rechazada.');
}

async function colocarCreditoEmergente(id) {
    const credito = findEmergenteById(id);
    if (!credito) return;

    const confirmed = await Swal.fire({
        title: 'Colocar y preparar documentos',
        html: `
            <div style="text-align:left;color:#cbd5e1">
                <p><strong>Socio:</strong> ${escapeEmergenteHtml(getEmergenteSocioName(credito))}</p>
                <p><strong>Total:</strong> ${formatEmergenteMoney(credito.monto_total)}</p>
                <p><strong>Plazo:</strong> ${escapeEmergenteHtml(formatEmergentePlazo(credito))}</p>
                <p style="margin-top:12px;">Despues de colocar, se abrira el panel para generar contrato, pagare y subir los firmados.</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Colocar y continuar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0B4E32'
    });

    if (!confirmed.isConfirmed) return;

    const updated = await updateEmergente(id, {
        estado: 'COLOCADO',
        fecha_colocacion: todayEmergenteISO(),
        colocado_por: getEmergenteUserId(),
        documentos_generados: false
    }, 'Credito colocado. Prepare contrato y pagare firmados.');

    if (updated) {
        const creditoCompleto = await fetchCreditoEmergenteCompleto(id);
        if (creditoCompleto) mostrarModalDesembolsoEmergenteDocs(creditoCompleto);
    }
}

async function desembolsarCreditoEmergente(id) {
    const credito = await fetchCreditoEmergenteCompleto(id);
    if (!credito) return;

    mostrarModalDesembolsoEmergenteDocs(credito);
}

async function fetchCreditoEmergenteCompleto(id) {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_creditos_emergentes')
            .select(`
                *,
                socio:ic_socios (
                    idsocio,
                    nombre,
                    cedula,
                    whatsapp,
                    paisresidencia,
                    estadocivil,
                    nombreconyuge,
                    cedulaconyuge,
                    domicilio,
                    nombrereferencia,
                    whatsappreferencia
                )
            `)
            .eq('id_emergente', id)
            .single();

        if (error) throw error;

        const index = allCreditosEmergentes.findIndex((item) => item.id_emergente === id);
        if (index >= 0) {
            allCreditosEmergentes[index] = data;
        } else {
            allCreditosEmergentes.push(data);
        }

        return data;
    } catch (error) {
        console.error('Error cargando credito emergente completo:', error);
        notifyEmergente('No se pudo cargar la informacion completa del socio para documentos.', 'error');
        return findEmergenteById(id);
    }
}

async function registrarPagoCreditoEmergente(id) {
    const credito = findEmergenteById(id);
    if (!credito) return;

    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('PAGO DE CREDITO EMERGENTE')) return;
    }

    const saldo = Number(credito.saldo_pendiente || credito.monto_total || 0);
    const result = await Swal.fire({
        title: 'Registrar pago emergente',
        html: `
            <div class="emergente-swal-grid">
                <label>Monto recibido<input id="swal-pago-monto" type="number" min="0.01" step="0.01" value="${saldo.toFixed(2)}"></label>
                <label>Metodo
                    <select id="swal-pago-metodo">
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="DEPOSITO">Deposito</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="OTRO">Otro</option>
                    </select>
                </label>
                <label class="span-2">URL comprobante<input id="swal-pago-url" type="text" placeholder="Opcional"></label>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Registrar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0B4E32',
        background: '#0f172a',
        color: '#fff',
        preConfirm: () => ({
            monto: parseEmergenteNumber(document.getElementById('swal-pago-monto')?.value),
            metodo: document.getElementById('swal-pago-metodo')?.value || 'TRANSFERENCIA',
            url: document.getElementById('swal-pago-url')?.value?.trim() || null
        })
    });

    if (!result.isConfirmed) return;

    const nuevoPagado = roundEmergenteMoney(Number(credito.monto_pagado || 0) + result.value.monto);
    const total = Number(credito.monto_total || 0);
    const nuevoEstado = nuevoPagado + 0.009 >= total ? 'PAGADO' : 'ABONADO';

    await updateEmergente(id, {
        estado: nuevoEstado,
        monto_pagado: nuevoPagado,
        metodo_pago: result.value.metodo,
        comprobante_pago_url: result.value.url,
        fecha_pago: nuevoEstado === 'PAGADO' ? todayEmergenteISO() : credito.fecha_pago,
        pagado_por: getEmergenteUserId()
    }, nuevoEstado === 'PAGADO' ? 'Credito emergente pagado.' : 'Abono registrado en caja.');
}

function mostrarModalDesembolsoEmergenteDocs(credito) {
    cerrarModalDesembolsoEmergenteDocs();
    selectedEmergenteDesembolsoFiles = {};

    const socio = credito.socio || {};
    const fechaFirmaDefault = credito.fecha_solicitud || todayEmergenteISO();
    const monto = Number(credito.monto_aprobado || credito.monto_solicitado || 0);

    const modalHTML = `
        <div id="modal-desembolso-emergente-docs" class="modal emergente-docs-modal" style="display:flex;">
            <div class="modal-backdrop" onclick="cerrarModalDesembolsoEmergenteDocs()"></div>
            <div class="modal-card emergente-modal-card wide">
                <div class="modal-header emergente-modal-header">
                    <h3><i class="fas fa-file-signature"></i> Documentos y Desembolso</h3>
                    <button class="modal-close" onclick="cerrarModalDesembolsoEmergenteDocs()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body emergente-docs-body">
                    <div class="emergente-docs-summary">
                        <div>
                            <span>Credito</span>
                            <strong>${escapeEmergenteHtml(credito.codigo_emergente)}</strong>
                        </div>
                        <div>
                            <span>Socio</span>
                            <strong>${escapeEmergenteHtml(getEmergenteSocioName(credito))}</strong>
                        </div>
                        <div>
                            <span>Estado civil</span>
                            <strong>${escapeEmergenteHtml(socio.estadocivil || 'No registrado')}</strong>
                        </div>
                        <div>
                            <span>Total</span>
                            <strong>${formatEmergenteMoney(credito.monto_total || monto)}</strong>
                        </div>
                    </div>

                    <div class="emergente-docs-controls">
                        <label>
                            <span>Fecha de firma</span>
                            <input id="emergente-fecha-firma-docs" type="date" value="${escapeEmergenteHtml(fechaFirmaDefault)}">
                        </label>
                        <label>
                            <span>Monto a desembolsar</span>
                            <input id="emergente-desembolso-monto" type="number" min="1" step="0.01" value="${monto.toFixed(2)}">
                        </label>
                        <label>
                            <span>Metodo</span>
                            <select id="emergente-desembolso-metodo">
                                <option value="TRANSFERENCIA">Transferencia</option>
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="DEPOSITO">Deposito</option>
                                <option value="CHEQUE">Cheque</option>
                                <option value="OTRO">Otro</option>
                            </select>
                        </label>
                    </div>

                    <div class="emergente-docs-grid">
                        ${renderEmergenteDocSlot('contrato', 'Acuerdo de Prestamo', 'Contrato adaptado a prestamo emergente', 'fa-file-contract')}
                        ${renderEmergenteDocSlot('pagare', 'Pagare', 'Compromiso de pago unico al vencimiento', 'fa-file-invoice-dollar')}
                    </div>

                    <div class="emergente-docs-note">
                        <i class="fas fa-circle-info"></i>
                        <span>Descarga los documentos, firma con el socio y conyuge si aplica, luego sube los archivos firmados para habilitar el desembolso.</span>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="cerrarModalDesembolsoEmergenteDocs()">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btn-confirmar-desembolso-emergente"
                            onclick="ejecutarDesembolsoEmergenteConDocs('${credito.id_emergente}')" disabled>
                            <i class="fas fa-money-bill-transfer"></i> Confirmar Desembolso
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
    window.cerrarModalDesembolsoEmergenteDocs = cerrarModalDesembolsoEmergenteDocs;
    window.generarContratoEmergente = generarContratoEmergente;
    window.generarPagareEmergente = generarPagareEmergente;
    window.handleEmergenteDocFile = handleEmergenteDocFile;
    window.clearEmergenteDocFile = clearEmergenteDocFile;
    window.ejecutarDesembolsoEmergenteConDocs = ejecutarDesembolsoEmergenteConDocs;
    updateEmergenteDesembolsoButtonState();
}

function renderEmergenteDocSlot(slot, title, subtitle, icon) {
    const generator = slot === 'contrato' ? 'generarContratoEmergente' : 'generarPagareEmergente';
    return `
        <div class="emergente-doc-slot" id="emergente-doc-slot-${slot}">
            <div class="emergente-doc-slot-header">
                <div class="emergente-doc-icon"><i class="fas ${icon}"></i></div>
                <div>
                    <h4>${title}</h4>
                    <p>${subtitle}</p>
                </div>
            </div>
            <div class="emergente-doc-actions">
                <button type="button" class="emergente-action-btn primary" onclick="${generator}()">
                    <i class="fas fa-download"></i> Descargar
                </button>
                <label class="emergente-upload-btn">
                    <i class="fas fa-upload"></i> Subir firmado
                    <input type="file" accept=".pdf,image/*" onchange="handleEmergenteDocFile('${slot}', this.files[0])">
                </label>
            </div>
            <div class="emergente-doc-file" id="emergente-doc-file-${slot}">
                <span>Sin archivo firmado</span>
            </div>
            <div class="emergente-doc-progress hidden" id="emergente-doc-progress-${slot}">
                <div></div>
            </div>
        </div>
    `;
}

function cerrarModalDesembolsoEmergenteDocs() {
    const modal = document.getElementById('modal-desembolso-emergente-docs');
    if (modal) modal.remove();
    selectedEmergenteDesembolsoFiles = {};

    const hasVisibleModals = Array.from(document.querySelectorAll('.modal')).some((el) => !el.classList.contains('hidden'));
    if (!hasVisibleModals) document.body.style.overflow = '';
}

function handleEmergenteDocFile(slot, file) {
    if (!file) return;
    selectedEmergenteDesembolsoFiles[slot] = file;
    const container = document.getElementById(`emergente-doc-file-${slot}`);
    if (container) {
        container.innerHTML = `
            <strong>${escapeEmergenteHtml(file.name)}</strong>
            <button type="button" onclick="clearEmergenteDocFile('${slot}')">
                <i class="fas fa-times"></i>
            </button>
        `;
    }
    updateEmergenteDesembolsoButtonState();
}

function clearEmergenteDocFile(slot) {
    selectedEmergenteDesembolsoFiles[slot] = null;
    const container = document.getElementById(`emergente-doc-file-${slot}`);
    if (container) container.innerHTML = '<span>Sin archivo firmado</span>';
    updateEmergenteDesembolsoButtonState();
}

function updateEmergenteDesembolsoButtonState() {
    const btn = document.getElementById('btn-confirmar-desembolso-emergente');
    if (!btn) return;

    const ready = Boolean(
        selectedEmergenteDesembolsoFiles.contrato
        && selectedEmergenteDesembolsoFiles.pagare
    );
    btn.disabled = !ready;
    btn.title = ready
        ? 'Confirmar desembolso'
        : 'Suba el contrato y el pagaré firmados para continuar';
}

async function generarContratoEmergente() {
    const credito = getCreditoEmergenteFromOpenDocsModal();
    if (!credito) return;
    await generarDocumentoLegalEmergente(credito, 'contrato');
}

async function generarPagareEmergente() {
    const credito = getCreditoEmergenteFromOpenDocsModal();
    if (!credito) return;
    await generarDocumentoLegalEmergente(credito, 'pagare');
}

function getCreditoEmergenteFromOpenDocsModal() {
    const modal = document.getElementById('modal-desembolso-emergente-docs');
    if (!modal) return null;
    const title = modal.querySelector('.emergente-docs-summary strong')?.textContent;
    return allCreditosEmergentes.find((item) => item.codigo_emergente === title);
}

async function generarDocumentoLegalEmergente(credito, tipo) {
    try {
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) throw new Error('jsPDF no esta disponible.');

        const fechaFirma = document.getElementById('emergente-fecha-firma-docs')?.value || todayEmergenteISO();
        const socio = credito.socio || {};
        const infoAcreedor = window.getDatosAcreedor ? window.getDatosAcreedor() : {};

        if (!infoAcreedor.nombre || !infoAcreedor.cedula) {
            notifyEmergente('Complete nombre y cedula del asesor antes de generar documentos.', 'warning');
            return;
        }

        const doc = new jsPDF('p', 'mm', 'letter');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 24;
        const contentWidth = pageWidth - (margin * 2);
        const nombreSocio = (getEmergenteSocioName(credito) || '').toUpperCase();
        const cedulaSocio = socio.cedula || credito.cedula_socio_snapshot || '';
        const estadoCivil = (socio.estadocivil || '').toUpperCase();
        const esCasado = estadoCivil.includes('CASADO') || estadoCivil.includes('UNION') || estadoCivil.includes('UNIÓN');
        const montoCapital = Number(credito.monto_aprobado || credito.monto_solicitado || 0);
        const montoTotal = Number(credito.monto_total || montoCapital);
        const fechaVencimiento = credito.fecha_vencimiento || calcularFechaVencimientoEmergente(fechaFirma, credito.plazo_valor, credito.plazo_unidad);

        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text(tipo === 'contrato' ? 'ACUERDO DE PRESTAMO EMERGENTE' : 'PAGARE', pageWidth / 2, 24, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`${(infoAcreedor.ciudad || 'MACHACHI').toUpperCase()}, ${formatEmergenteDateLong(fechaFirma).toUpperCase()}`, pageWidth - margin, 34, { align: 'right' });

        let y = 46;
        if (tipo === 'contrato') {
            y = drawEmergenteField(doc, 'ACREEDOR: ', `${infoAcreedor.nombre}`.toUpperCase(), margin, y, contentWidth);
            y = drawEmergenteField(doc, 'CEDULA ACREEDOR: ', infoAcreedor.cedula || '-', margin, y, contentWidth);
            y = drawEmergenteField(doc, 'DEUDOR: ', `${nombreSocio} - C.I. ${cedulaSocio}`, margin, y, contentWidth);
            y = drawEmergenteField(doc, 'MONTO ENTREGADO: ', `${formatEmergenteMoney(montoCapital)} (${numeroEmergenteALetras(montoCapital)})`, margin, y, contentWidth);
            y = drawEmergenteField(doc, 'GASTOS ADMINISTRATIVOS: ', `${formatEmergenteRateDisplay(getEmergenteAdminMonthlyRate(montoCapital))} MENSUAL EQUIVALENTE`, margin, y, contentWidth);
            y = drawEmergenteField(doc, 'VALOR AL VENCIMIENTO: ', `${formatEmergenteMoney(montoTotal)} (${numeroEmergenteALetras(montoTotal)})`, margin, y, contentWidth);
            y = drawEmergenteField(doc, 'VENCIMIENTO: ', formatEmergenteDateLong(fechaVencimiento).toUpperCase(), margin, y, contentWidth);
        } else {
            y = drawEmergenteField(doc, 'A: ', `${infoAcreedor.nombre}`.toUpperCase(), margin, y, contentWidth);
            y = drawEmergenteField(doc, 'VENCIMIENTO: ', formatEmergenteDateLong(fechaVencimiento).toUpperCase(), margin, y, contentWidth);
            y = drawEmergenteField(doc, 'LA CANTIDAD DE: ', `${formatEmergenteMoney(montoTotal)} (${numeroEmergenteALetras(montoTotal)})`, margin, y, contentWidth);
        }

        const domicilio = (socio.domicilio || socio.direccion || 'DIRECCION REGISTRADA').toUpperCase();
        const paisResidencia = (socio.paisresidencia || 'ECUADOR').toUpperCase();
        const ciudadPago = (infoAcreedor.ciudad || 'MACHACHI').toUpperCase();
        y += 8;

        const tasaMensual = Number(credito.tasa_interes_porcentaje || 0);
        const tasaDocumento = credito.plazo_unidad === 'DIAS' ? tasaMensual / 30 : tasaMensual;
        const baseTasaDocumento = credito.plazo_unidad === 'DIAS' ? 'diaria' : 'mensual';
        const tasaAdminMensual = getEmergenteAdminMonthlyRate(montoCapital);
        const conyugeClause = esCasado
            ? `Comparece tambien su conyuge **${(socio.nombreconyuge || 'CONYUGE').toUpperCase()}**, con cedula **${socio.cedulaconyuge || ''}**, quien suscribe como deudor solidario conforme al estado civil registrado.`
            : '';

        const referenciaNombre = (socio.nombrereferencia || 'PERSONA DE REFERENCIA').toUpperCase();
        const referenciaWhatsapp = socio.whatsappreferencia || 'NUMERO REGISTRADO';
        const telefonoDeudor = socio.whatsapp || credito.whatsapp_socio_snapshot || 'NUMERO REGISTRADO';
        const acreedor = `${infoAcreedor.nombre}`.toUpperCase();

        const paragraphs = tipo === 'contrato'
            ? [
                `PRIMERA - COMPARECIENTES: Comparecen por una parte **${acreedor}**, en calidad de acreedor, y por otra parte **${nombreSocio}**, con cedula de identidad **${cedulaSocio}**, en calidad de deudor. Las partes manifiestan tener capacidad legal suficiente para obligarse en los terminos del presente acuerdo de prestamo emergente.`,
                conyugeClause,
                `SEGUNDA - ENTREGA DEL DINERO: El deudor declara que recibe a su entera satisfaccion del acreedor la suma de **${formatEmergenteMoney(montoCapital)} (${numeroEmergenteALetras(montoCapital)})**, dinero que sera destinado exclusivamente a fines licitos y bajo responsabilidad directa del deudor.`,
                `TERCERA - CONDICIONES DEL PRESTAMO: El presente prestamo emergente se pacta bajo modalidad de pago unico. Para control del calculo se registra una tasa de **${formatEmergenteRateDisplay(tasaDocumento)} ${baseTasaDocumento}**. Los gastos administrativos se calculan proporcionalmente al plazo con una equivalencia de **${formatEmergenteRateDisplay(tasaAdminMensual)} mensual**. El valor total a pagar al vencimiento es **${formatEmergenteMoney(montoTotal)} (${numeroEmergenteALetras(montoTotal)})**.`,
                `CUARTA - PLAZO Y VENCIMIENTO: El deudor se obliga a cancelar la totalidad del valor adeudado hasta el dia **${formatEmergenteDateLong(fechaVencimiento)}**. Los abonos parciales, si existieren, solo reduciran el saldo pendiente y no extinguiran la obligacion hasta que el valor total sea cubierto.`,
                `QUINTA - DATOS PERSONALES Y NOTIFICACIONES: El deudor declara vivir en **${domicilio}** y se compromete a informar oportunamente cualquier cambio de domicilio o contacto. Su numero de contacto registrado es **${telefonoDeudor}**, medio por el cual acepta recibir recordatorios y comunicaciones relacionadas con este prestamo.`,
                `SEXTA - REFERENCIA PERSONAL: Como referencia personal, el deudor senala a **${referenciaNombre}**, contacto **${referenciaWhatsapp}**, quien puede ser consultado para ubicar o confirmar informacion del deudor en caso de ser necesario.`,
                `SEPTIMA - VERACIDAD DE INFORMACION: El deudor declara bajo juramento que todos los datos entregados al acreedor son verdaderos, completos y actualizados. En caso de informacion erronea, incompleta o falsa, el deudor asumira toda responsabilidad derivada.`,
                `OCTAVA - INCUMPLIMIENTO: En caso de falta de pago al vencimiento, el acreedor podra realizar las gestiones de cobro correspondientes sobre el saldo pendiente, sin perjuicio de los acuerdos de pago que las partes puedan documentar posteriormente.`,
                `NOVENA - ACEPTACION: Leido que fue el presente documento por las partes, y en constancia de aceptacion libre y voluntaria, lo firman en la fecha indicada.`
            ].filter(Boolean)
            : [
                esCasado
                    ? `Por este pagare, nosotros, **${nombreSocio}**, con cedula de identidad **${cedulaSocio}**, y **${(socio.nombreconyuge || 'CONYUGE').toUpperCase()}**, con cedula **${socio.cedulaconyuge || ''}**, ambos con domicilio en **${domicilio}, ${paisResidencia}**, nos obligamos de manera solidaria e incondicional a pagar a la orden del acreedor **${acreedor}**, con cedula **${infoAcreedor.cedula}**, en la ciudad de **${ciudadPago}**, la cantidad de **${formatEmergenteMoney(montoTotal)} (${numeroEmergenteALetras(montoTotal)})**.`
                    : `Por este pagare, yo, **${nombreSocio}**, con cedula de identidad **${cedulaSocio}**, con domicilio en **${domicilio}, ${paisResidencia}**, me obligo de manera incondicional a pagar a la orden del acreedor **${acreedor}**, con cedula **${infoAcreedor.cedula}**, en la ciudad de **${ciudadPago}**, la cantidad de **${formatEmergenteMoney(montoTotal)} (${numeroEmergenteALetras(montoTotal)})**.`,
                `El pago debera realizarse en un solo vencimiento el dia **${formatEmergenteDateLong(fechaVencimiento)}**. Cualquier abono parcial aceptado por el acreedor reducira el saldo pendiente, pero no extinguira la obligacion hasta cubrir la totalidad del valor adeudado.`,
                `Declaro que el domicilio y pais de residencia indicados en este pagare corresponden a mi residencia registrada, y me comprometo a comunicar al acreedor cualquier cambio de domicilio o lugar de residencia mientras la obligacion permanezca pendiente.`,
                `En caso de incumplimiento, reconozco que el acreedor podra ejercer las gestiones de cobro correspondientes sobre el saldo pendiente conforme a los documentos suscritos entre las partes.`
            ].filter(Boolean);

        doc.setFontSize(10);
        paragraphs.forEach((text) => {
            y = drawEmergenteParagraph(doc, text, margin, y, contentWidth);
            y += 4;
            if (y > 210) {
                doc.addPage();
                y = 28;
            }
        });

        y += 16;
        drawEmergenteSignatures(doc, y, [
            { nombre: nombreSocio, cedula: cedulaSocio, label: esCasado ? 'DEUDOR SOLIDARIO' : 'DEUDOR' },
            ...(esCasado ? [{ nombre: (socio.nombreconyuge || 'CONYUGE').toUpperCase(), cedula: socio.cedulaconyuge || '', label: 'DEUDOR SOLIDARIO' }] : []),
            { nombre: `${infoAcreedor.nombre}`.toUpperCase(), cedula: infoAcreedor.cedula || '', label: 'ACREEDOR' }
        ]);

        const cleanName = nombreSocio.replace(/\s+/g, '_').replace(/[^\w-]/g, '');
        const fileName = `${tipo === 'contrato' ? 'Contrato' : 'Pagare'}Emergente_${credito.codigo_emergente}_${cleanName}.pdf`;
        doc.save(fileName);

        await updateEmergenteSilent(credito.id_emergente, { documentos_generados: true });
        notifyEmergente(`${tipo === 'contrato' ? 'Acuerdo de prestamo' : 'Pagare'} generado.`, 'success');
    } catch (error) {
        console.error('Error generando documento emergente:', error);
        notifyEmergente(error.message || 'No se pudo generar el documento.', 'error');
    }
}

async function ejecutarDesembolsoEmergenteConDocs(id) {
    const credito = findEmergenteById(id);
    if (!credito) return;

    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('DESEMBOLSO DE CREDITO EMERGENTE')) return;
    }

    const contrato = selectedEmergenteDesembolsoFiles.contrato;
    const pagare = selectedEmergenteDesembolsoFiles.pagare;
    if (!contrato || !pagare) {
        notifyEmergente('Debe subir contrato y pagare firmados antes de desembolsar.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-confirmar-desembolso-emergente');
    const original = btn ? btn.innerHTML : '';

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        }

        const uploads = {};
        for (const slot of ['contrato', 'pagare']) {
            setEmergenteDocProgress(slot, 35);
            const uploadRes = await window.uploadFileToStorage(
                selectedEmergenteDesembolsoFiles[slot],
                'documentos_creditos_emergentes',
                `${id}/${slot}`
            );

            if (!uploadRes.success) {
                throw new Error(`Error al subir ${slot}: ${uploadRes.error || 'sin detalle'}`);
            }

            uploads[slot] = uploadRes.url;
            setEmergenteDocProgress(slot, 100);
        }

        const monto = parseEmergenteNumber(document.getElementById('emergente-desembolso-monto')?.value);
        const metodo = document.getElementById('emergente-desembolso-metodo')?.value || 'TRANSFERENCIA';
        const fechaFirma = document.getElementById('emergente-fecha-firma-docs')?.value || todayEmergenteISO();

        const fechaVenc = credito.fecha_vencimiento || calcularFechaVencimientoEmergente(fechaFirma, credito.plazo_valor, credito.plazo_unidad);

        await updateEmergente(id, {
            estado: 'DESEMBOLSADO',
            monto_desembolsado: monto,
            metodo_desembolso: metodo,
            contrato_url: uploads.contrato,
            pagare_url: uploads.pagare,
            comprobante_desembolso_url: uploads.contrato,
            documentos_generados: true,
            documentos_subidos: true,
            fecha_desembolso: todayEmergenteISO(),
            fecha_vencimiento: fechaVenc,
            desembolsado_por: getEmergenteUserId()
        }, 'Documentos firmados subidos y desembolso registrado en caja.');

        cerrarModalDesembolsoEmergenteDocs();
        if (typeof window.loadDesembolsosPendientes === 'function') {
            await window.loadDesembolsosPendientes();
        }
    } catch (error) {
        console.error('Error en desembolso emergente:', error);
        notifyEmergente(error.message || 'No se pudo completar el desembolso.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }
}

function viewCreditoEmergente(id) {
    const credito = findEmergenteById(id);
    if (!credito) return;

    setEmergenteText('emergente-detalle-title', credito.codigo_emergente || 'Credito Emergente');
    const body = document.getElementById('emergente-detalle-body');
    if (!body) return;

    body.innerHTML = `
        <div class="emergente-detail-grid">
            ${detailEmergenteItem('Socio', getEmergenteSocioName(credito))}
            ${detailEmergenteItem('Cedula', credito.socio?.cedula || credito.cedula_socio_snapshot || '-')}
            ${detailEmergenteItem('WhatsApp', credito.socio?.whatsapp || credito.whatsapp_socio_snapshot || '-')}
            ${detailEmergenteItem('Estado', credito.estado || '-')}
            ${detailEmergenteItem('Monto solicitado', formatEmergenteMoney(credito.monto_solicitado))}
            ${detailEmergenteItem('Monto aprobado', formatEmergenteMoney(credito.monto_aprobado))}
            ${detailEmergenteItem('Interes', formatEmergenteMoney(credito.monto_interes))}
            ${detailEmergenteItem('Gastos administrativos', `${formatEmergenteMoney(credito.gastos_administrativos)} (${formatEmergenteRateDisplay(getEmergenteAdminMonthlyRate(credito.monto_aprobado || credito.monto_solicitado))} mensual equivalente)`)}
            ${detailEmergenteItem('Total', formatEmergenteMoney(credito.monto_total))}
            ${detailEmergenteItem('Pagado', formatEmergenteMoney(credito.monto_pagado))}
            ${detailEmergenteItem('Saldo', formatEmergenteMoney(credito.saldo_pendiente))}
            ${detailEmergenteItem('Plazo', formatEmergentePlazo(credito))}
            ${detailEmergenteItem('Vencimiento', formatEmergenteDate(credito.fecha_vencimiento))}
            ${detailEmergenteItem('Movimiento desembolso', credito.id_movimiento_desembolso || '-')}
            ${detailEmergenteItem('Movimiento pago', credito.id_movimiento_ultimo_pago || credito.id_movimiento_pago || '-')}
            ${detailEmergenteItem('Motivo', credito.motivo || '-')}
        </div>
    `;

    openEmergenteModal('modal-emergente-detalle');
}

function detailEmergenteItem(label, value) {
    return `
        <div class="emergente-detail-item">
            <span>${escapeEmergenteHtml(label)}</span>
            <strong>${escapeEmergenteHtml(value)}</strong>
        </div>
    `;
}

async function updateEmergente(id, payload, successMessage) {
    try {
        const supabase = window.getSupabaseClient();
        const { error } = await supabase
            .from('ic_creditos_emergentes')
            .update(payload)
            .eq('id_emergente', id);

        if (error) throw error;

        notifyEmergente(successMessage || 'Credito emergente actualizado.', 'success');
        await refreshCreditosEmergentes();
        return true;
    } catch (error) {
        console.error('Error actualizando credito emergente:', error);
        notifyEmergente(error.message || 'No se pudo actualizar el credito emergente.', 'error');
        return false;
    }
}

async function updateEmergenteSilent(id, payload) {
    try {
        const supabase = window.getSupabaseClient();
        const { error } = await supabase
            .from('ic_creditos_emergentes')
            .update(payload)
            .eq('id_emergente', id);
        if (error) throw error;
    } catch (error) {
        console.warn('No se pudo actualizar silenciosamente el credito emergente:', error);
    }
}

function findEmergenteById(id) {
    return allCreditosEmergentes.find((credito) => credito.id_emergente === id);
}

function getEmergenteSocioName(credito) {
    return credito?.socio?.nombre || credito?.nombre_socio_snapshot || 'Socio';
}

function formatEmergenteMoney(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
}

function formatEmergentePercent(value) {
    return formatEmergenteRateDisplay(value);
}

function formatEmergenteOriginalRate(credito) {
    const tipo = credito?.tasa_original_tipo || 'MENSUAL';
    const valor = credito?.tasa_original_valor ?? credito?.tasa_interes_porcentaje ?? 0;
    return `${formatEmergenteRateDisplay(valor)} ${tipo.toLowerCase()}`;
}

function formatEmergenteDate(value) {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatEmergentePlazo(credito) {
    if (!credito?.plazo_valor) return '-';
    const unidad = credito.plazo_unidad === 'MESES' ? 'meses' : 'dias';
    return `${credito.plazo_valor} ${unidad}`;
}

function getEmergenteDueLabel(credito) {
    const fechaVencimiento = resolveEmergenteDueDate(credito);
    if (!fechaVencimiento) return '-';
    const days = daysToEmergenteDue(fechaVencimiento);
    if (days === null) return formatEmergenteDate(fechaVencimiento);
    if (days < 0) return `Vencido hace ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`;
    if (days === 0) return 'Vence hoy';
    return `Vence en ${days} dia${days === 1 ? '' : 's'}`;
}

function resolveEmergenteDueDate(credito) {
    if (credito?.fecha_vencimiento) return credito.fecha_vencimiento;
    return calcularFechaVencimientoEmergente(
        credito?.fecha_solicitud,
        credito?.plazo_valor,
        credito?.plazo_unidad
    );
}

function daysToEmergenteDue(value) {
    if (!value) return null;
    const due = new Date(`${value}T00:00:00`);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.round((due - today) / 86400000);
}

function setEmergenteText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function parseEmergenteNumber(value) {
    const parsed = Number(String(value || '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundEmergenteMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundEmergenteRate(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

function normalizeEmergenteMonthlyRate(value, type = 'MENSUAL') {
    const rate = Number(value || 0);
    if (!Number.isFinite(rate)) return 0;
    if (type === 'ANUAL') return roundEmergenteRate(rate / 12);
    return roundEmergenteRate(rate);
}

function calculateEmergenteTermInterest(capital, monthlyRate, termValue, termUnit = 'DIAS') {
    const principal = Number(capital || 0);
    const rate = Number(monthlyRate || 0);
    const term = Number(termValue || 0);

    if (principal <= 0 || rate < 0 || term <= 0) return 0;

    const monthFactor = termUnit === 'MESES' ? term : term / 30;
    return roundEmergenteMoney(principal * (rate / 100) * monthFactor);
}

function calculateEmergenteTermInterestFromInput(capital, rateValue, rateType, termValue, termUnit = 'DIAS') {
    const principal = Number(capital || 0);
    const rate = Number(rateValue || 0);
    const term = Number(termValue || 0);
    if (principal <= 0 || rate < 0 || term <= 0) return 0;

    const monthFactor = termUnit === 'MESES' ? term : term / 30;
    const periodFactor = rateType === 'ANUAL' ? monthFactor / 12 : monthFactor;
    return roundEmergenteMoney(principal * (rate / 100) * periodFactor);
}

function getEmergenteAdminAnnualRate(capital) {
    return Number(capital || 0) > 0 ? EMERGENTE_ADMIN_ANNUAL_RATE : 0;
}

function getEmergenteAdminMonthlyRate(capital) {
    return roundEmergenteRate(getEmergenteAdminAnnualRate(capital) / 12);
}

function getEmergenteAdminEffectiveRate(capital, termValue, termUnit = 'DIAS') {
    const term = Number(termValue || 0);
    if (term <= 0) return 0;
    const monthFactor = termUnit === 'MESES' ? term : term / 30;
    return roundEmergenteRate(getEmergenteAdminAnnualRate(capital) * (monthFactor / 12));
}

function calculateEmergenteAdminExpenses(capital, termValue, termUnit = 'DIAS') {
    const principal = Number(capital || 0);
    if (principal <= 0) return 0;
    return roundEmergenteMoney(principal * (getEmergenteAdminEffectiveRate(principal, termValue, termUnit) / 100));
}

function formatEmergenteRateDisplay(value) {
    return `${Number(value || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatEmergenteRateInput(value) {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

function todayEmergenteISO() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function calcularFechaVencimientoEmergente(fechaBase, plazoValor, plazoUnidad) {
    if (!fechaBase || !plazoValor) return null;
    const date = new Date(`${fechaBase}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    if (plazoUnidad === 'MESES') {
        date.setMonth(date.getMonth() + Number(plazoValor));
    } else {
        date.setDate(date.getDate() + Number(plazoValor));
    }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatEmergenteDateLong(value) {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
}

function setEmergenteDocProgress(slot, percent) {
    const progress = document.getElementById(`emergente-doc-progress-${slot}`);
    const bar = progress?.querySelector('div');
    if (!progress || !bar) return;
    progress.classList.remove('hidden');
    bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function drawEmergenteField(doc, label, value, x, y, width) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);
    const labelWidth = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(value || '-'), width - labelWidth);
    doc.text(lines, x + labelWidth, y);
    return y + Math.max(6, lines.length * 5);
}

function drawEmergenteParagraph(doc, text, x, y, width) {
    const clean = String(text || '').replace(/\*\*/g, '');
    const lines = doc.splitTextToSize(clean, width);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, x, y, { align: 'justify', maxWidth: width });
    return y + lines.length * 5;
}

function drawEmergenteSignatures(doc, startY, firmas) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 24;
    const contentWidth = pageWidth - margin * 2;
    const firmaWidth = 62;
    let y = startY;

    for (let i = 0; i < firmas.length; i += 2) {
        const row = firmas.slice(i, i + 2);
        if (y > pageHeight - 42) {
            doc.addPage();
            y = 46;
        }

        row.forEach((firma, index) => {
            const x = row.length === 1
                ? pageWidth / 2
                : margin + contentWidth * (index === 0 ? 0.25 : 0.75);

            doc.setDrawColor(0);
            doc.setLineWidth(0.4);
            doc.line(x - firmaWidth / 2, y, x + firmaWidth / 2, y);

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            const nameLines = doc.splitTextToSize(firma.nombre || '-', firmaWidth);
            doc.text(nameLines, x, y + 5, { align: 'center' });
            const offset = nameLines.length * 4;

            doc.setFont('helvetica', 'normal');
            doc.text(`C.I.: ${firma.cedula || ''}`, x, y + 5 + offset, { align: 'center' });
            doc.text(`(${firma.label || 'FIRMA'})`, x, y + 9 + offset, { align: 'center' });
        });

        y += 36;
    }
}

function numeroEmergenteALetras(value) {
    if (typeof window.numeroALetras === 'function') {
        return window.numeroALetras(Number(value || 0));
    }

    const amount = Math.max(0, Number(value || 0));
    const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const convertir = (numero) => {
        const n = Math.floor(numero);
        if (n === 0) return '';
        if (n < 10) return unidades[n];
        if (n < 20) return especiales[n - 10];
        if (n < 30) return n === 20 ? 'VEINTE' : `VEINTI${unidades[n - 20]}`;
        if (n < 100) return `${decenas[Math.floor(n / 10)]}${n % 10 ? ` Y ${unidades[n % 10]}` : ''}`;
        if (n === 100) return 'CIEN';
        if (n < 1000) return `${centenas[Math.floor(n / 100)]} ${convertir(n % 100)}`;
        if (n < 2000) return `MIL ${convertir(n % 1000)}`;
        if (n < 1000000) return `${convertir(Math.floor(n / 1000))} MIL ${convertir(n % 1000)}`;
        if (n < 2000000) return `UN MILLON ${convertir(n % 1000000)}`;
        if (n < 1000000000000) return `${convertir(Math.floor(n / 1000000))} MILLONES ${convertir(n % 1000000)}`;
        return String(n);
    };

    const entero = Math.floor(amount);
    const centavos = Math.round((amount - entero) * 100);
    const letras = entero === 0 ? 'CERO' : convertir(entero);
    return `${letras} DOLARES DE LOS ESTADOS UNIDOS DE AMERICA CON ${String(centavos).padStart(2, '0')}/100`
        .replace(/\s+/g, ' ')
        .trim();
}

function getEmergenteUserId() {
    const user = window.getCurrentUser ? window.getCurrentUser() : window.currentUser;
    return user?.id || null;
}

function notifyEmergente(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else if (typeof showToast === 'function') {
        showToast(message, type);
    } else if (typeof Swal !== 'undefined') {
        Swal.fire({ text: message, icon: type === 'error' ? 'error' : type, timer: 1800, showConfirmButton: false });
    } else {
        console.log(`[${type}] ${message}`);
    }
}

function escapeEmergenteHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeEmergenteJsArg(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function normalizeEmergenteSearch(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}
