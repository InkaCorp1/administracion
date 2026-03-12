let litePrecancelacionesCreditos = [];
let litePrecancelacionesFiltrados = [];
let litePrecancelacionCreditoActual = null;
let litePrecancelacionContextoActual = null;

const LITE_MENSAJE_CREDITO_EN_MORA_PRECANC = 'Este crédito está en mora primero debe ponerse al día para precancelar';
const LITE_MENSAJE_METODO_LEGACY_PRECANC = 'Este crédito requiere revisión detallada. Para continuar use la versión PC o tablet.';

async function initPrecancelacionesModule() {
    bindLitePrecancelacionesEvents();
    exposeLitePrecancelacionesGlobals();
    await loadLitePrecancelacionesCreditos();
}

function bindLitePrecancelacionesEvents() {
    const searchInput = document.getElementById('precanc-lite-search');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener('input', () => filterLitePrecancelaciones(searchInput.value));
        searchInput.dataset.bound = 'true';
    }

    const calcButton = document.getElementById('precanc-lite-calc-btn');
    if (calcButton && !calcButton.dataset.bound) {
        calcButton.addEventListener('click', handleLitePrecancelacionCalculo);
        calcButton.dataset.bound = 'true';
    }
}

function exposeLitePrecancelacionesGlobals() {
    window.openLitePrecancelacion = openLitePrecancelacion;
    window.closePrecancLiteModal = closePrecancLiteModal;
}

async function loadLitePrecancelacionesCreditos() {
    const list = document.getElementById('precanc-lite-list');
    if (list) {
        list.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Cargando créditos para precancelación...</p>
            </div>
        `;
    }

    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito,
                codigo_credito,
                capital,
                capital_financiado,
                tasa_interes_mensual,
                plazo,
                dia_pago,
                fecha_desembolso,
                cuotas_pagadas,
                ahorro_programado_cuota,
                estado_credito,
                socio:ic_socios!id_socio (
                    nombre,
                    cedula
                )
            `)
            .in('estado_credito', ['ACTIVO', 'MOROSO'])
            .order('fecha_desembolso', { ascending: false });

        if (error) throw error;

        litePrecancelacionesCreditos = (data || []).map(normalizeLitePrecancelacionCredito);
        litePrecancelacionesFiltrados = [...litePrecancelacionesCreditos];
        updateLitePrecancelacionesStats(litePrecancelacionesCreditos);
        renderLitePrecancelaciones(litePrecancelacionesFiltrados);
    } catch (error) {
        console.error('[PRECANC-MOBILE] Error cargando créditos:', error);
        if (list) {
            list.innerHTML = '<div class="precanc-lite-empty">No se pudieron cargar las precancelaciones móviles.</div>';
        }
    }
}

function normalizeLitePrecancelacionCredito(credito) {
    const cuotasPagadas = parseInt(credito.cuotas_pagadas || 0, 10);

    return {
        ...credito,
        capital: parseFloat(credito.capital || 0),
        capital_financiado: parseFloat(credito.capital_financiado || credito.capital || 0),
        tasa_interes_mensual: parseFloat(credito.tasa_interes_mensual || 0),
        plazo: parseInt(credito.plazo || 0, 10),
        dia_pago: parseInt(credito.dia_pago || 1, 10),
        cuotas_pagadas_count: cuotasPagadas,
        cuotas_pagadas: cuotasPagadas,
        ahorro_programado_cuota: parseFloat(credito.ahorro_programado_cuota || 0)
    };
}

function updateLitePrecancelacionesStats(creditos) {
    const activos = creditos.filter((credito) => credito.estado_credito === 'ACTIVO').length;
    const mora = creditos.filter((credito) => credito.estado_credito === 'MOROSO').length;

    const activosEl = document.getElementById('precanc-lite-count-activos');
    const moraEl = document.getElementById('precanc-lite-count-mora');
    if (activosEl) activosEl.textContent = activos;
    if (moraEl) moraEl.textContent = mora;
}

function renderLitePrecancelaciones(creditos) {
    const list = document.getElementById('precanc-lite-list');
    if (!list) return;

    if (!creditos.length) {
        list.innerHTML = '<div class="precanc-lite-empty">No hay créditos que coincidan con la búsqueda.</div>';
        return;
    }

    const grouped = {
        ACTIVO: creditos.filter((credito) => credito.estado_credito === 'ACTIVO'),
        MOROSO: creditos.filter((credito) => credito.estado_credito === 'MOROSO')
    };

    const sections = [
        {
            key: 'ACTIVO',
            title: 'Créditos Activos',
            empty: 'No hay créditos activos en esta búsqueda.',
            icon: 'fa-circle-check',
            className: 'activo'
        },
        {
            key: 'MOROSO',
            title: 'Créditos en Mora',
            empty: 'No hay créditos en mora en esta búsqueda.',
            icon: 'fa-triangle-exclamation',
            className: 'mora'
        }
    ];

    list.innerHTML = sections.map((section) => {
        const items = grouped[section.key] || [];
        const cardsHtml = items.length
            ? items.map(renderLitePrecancelacionCard).join('')
            : `<div class="precanc-lite-category-empty">${section.empty}</div>`;

        return `
            <section class="precanc-lite-category ${section.className}">
                <div class="precanc-lite-category-header ${section.className}">
                    <div class="precanc-lite-category-title-wrap">
                        <i class="fas ${section.icon}"></i>
                        <span>${section.title}</span>
                    </div>
                    <span class="precanc-lite-category-count">${items.length}</span>
                </div>
                <div class="precanc-lite-category-list">
                    ${cardsHtml}
                </div>
            </section>
        `;
    }).join('');
}

function renderLitePrecancelacionCard(credito) {
    const isMora = credito.estado_credito === 'MOROSO';
    return `
        <article class="precanc-lite-card">
            <div class="precanc-lite-card-head">
                <div>
                    <div class="precanc-lite-code">${escapeLitePrecHtml(credito.codigo_credito || 'SIN CÓDIGO')}</div>
                    <div class="precanc-lite-name">${escapeLitePrecHtml(credito.socio?.nombre || 'Socio no encontrado')}</div>
                    <div class="precanc-lite-id">${escapeLitePrecHtml(credito.socio?.cedula || 'Sin cédula')}</div>
                </div>
                <div class="precanc-lite-capital">
                    ${formatMoneyLitePrec(credito.capital)}
                    <span class="precanc-lite-caption">Capital</span>
                </div>
            </div>
            <div class="precanc-lite-card-foot">
                <span class="precanc-lite-chip ${isMora ? 'mora' : 'activo'}">${isMora ? 'EN MORA' : 'ACTIVO'}</span>
                <button class="precanc-lite-open-btn ${isMora ? 'mora' : ''}" onclick="openLitePrecancelacion('${credito.id_credito}')">
                    <i class="fas ${isMora ? 'fa-triangle-exclamation' : 'fa-calculator'}"></i>
                    <span>${isMora ? 'EN MORA' : 'CALCULAR'}</span>
                </button>
            </div>
        </article>
    `;
}

function filterLitePrecancelaciones(query) {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) {
        litePrecancelacionesFiltrados = [...litePrecancelacionesCreditos];
    } else {
        litePrecancelacionesFiltrados = litePrecancelacionesCreditos.filter((credito) => {
            const haystack = [
                credito.codigo_credito,
                credito.socio?.nombre,
                credito.socio?.cedula
            ].join(' ').toLowerCase();

            return haystack.includes(normalized);
        });
    }

    renderLitePrecancelaciones(litePrecancelacionesFiltrados);
}

async function openLitePrecancelacion(idCredito) {
    const credito = litePrecancelacionesCreditos.find((item) => item.id_credito === idCredito);
    if (!credito) return;

    if (credito.estado_credito === 'MOROSO') {
        showLitePrecancMessage('Crédito en mora', LITE_MENSAJE_CREDITO_EN_MORA_PRECANC, 'warning');
        return;
    }

    try {
        const button = document.getElementById('precanc-lite-calc-btn');
        setLitePrecancButtonState(button, true, 'Evaluando crédito...');

        const contexto = await evaluarContextoLitePrecancelacion(credito);
        if (contexto.requiereMetodoLegacy) {
            showLitePrecancMessage('Revisión en PC o tablet', LITE_MENSAJE_METODO_LEGACY_PRECANC, 'info');
            return;
        }

        litePrecancelacionCreditoActual = credito;
        litePrecancelacionContextoActual = contexto;
        fillLitePrecancelacionModal(credito, contexto);

        const dateInput = document.getElementById('precanc-lite-date');
        if (dateInput) {
            dateInput.value = getLiteTodayIso();
        }

        hideLitePrecancelacionResult();
        openLitePrecancModal();
    } catch (error) {
        console.error('[PRECANC-MOBILE] Error abriendo cálculo:', error);
        showLitePrecancMessage('Error', 'No se pudo preparar el cálculo de precancelación.', 'error');
    } finally {
        const button = document.getElementById('precanc-lite-calc-btn');
        setLitePrecancButtonState(button, false, 'Calcular valor');
    }
}

function fillLitePrecancelacionModal(credito, contexto) {
    const codeEl = document.getElementById('precanc-lite-modal-code');
    const socioEl = document.getElementById('precanc-lite-modal-socio');
    const badgeEl = document.getElementById('precanc-lite-context-badge');
    const noteEl = document.getElementById('precanc-lite-context-note');

    if (codeEl) codeEl.textContent = credito.codigo_credito || 'SIN CÓDIGO';
    if (socioEl) socioEl.textContent = credito.socio?.nombre || 'Socio no encontrado';
    if (badgeEl) {
        badgeEl.textContent = contexto.usarTablaAjustadaLegacy ? 'LEGACY AJUSTADO' : 'CRÉDITO NUEVO';
        badgeEl.classList.toggle('legacy', contexto.usarTablaAjustadaLegacy);
    }
    if (noteEl) {
        noteEl.textContent = contexto.usarTablaAjustadaLegacy
            ? 'Se usará una tabla legacy ajustada en memoria para obtener el valor correcto.'
            : 'Se usará la tabla actual del crédito para calcular el valor a precancelar.';
    }
}

async function handleLitePrecancelacionCalculo() {
    if (!litePrecancelacionCreditoActual || !litePrecancelacionContextoActual) return;

    const dateInput = document.getElementById('precanc-lite-date');
    const selectedDate = dateInput?.value;
    if (!selectedDate) {
        showLitePrecancMessage('Fecha requerida', 'Seleccione una fecha de precancelación.', 'warning');
        return;
    }

    const fechaPrecancelacion = window.parseDate(selectedDate);
    const fechaDesembolso = window.parseDate(litePrecancelacionCreditoActual.fecha_desembolso);
    if (!fechaPrecancelacion || !fechaDesembolso || fechaPrecancelacion <= fechaDesembolso) {
        showLitePrecancMessage('Fecha inválida', 'La fecha de precancelación debe ser posterior al desembolso.', 'error');
        return;
    }

    const button = document.getElementById('precanc-lite-calc-btn');
    try {
        setLitePrecancButtonState(button, true, 'Calculando...');
        const calculo = construirCalculoLitePrecancelacion(
            litePrecancelacionCreditoActual,
            litePrecancelacionContextoActual.amortizacion,
            fechaPrecancelacion,
            litePrecancelacionContextoActual.usarTablaAjustadaLegacy
        );

        showLitePrecancelacionResult(calculo);
    } catch (error) {
        console.error('[PRECANC-MOBILE] Error calculando:', error);
        showLitePrecancMessage('No se puede calcular', error.message || 'No se pudo calcular la precancelación.', 'error');
    } finally {
        setLitePrecancButtonState(button, false, 'Calcular valor');
    }
}

async function evaluarContextoLitePrecancelacion(credito) {
    const fechaHoy = new Date();
    fechaHoy.setHours(0, 0, 0, 0);

    const amortizacionOriginal = await obtenerAmortizacionLitePrecancelacion(credito.id_credito);
    const calculoOriginalHoy = construirCalculoLitePrecancelacion(credito, amortizacionOriginal, fechaHoy, false);

    if (calculoOriginalHoy.interesPerdonado > 0) {
        return {
            usarTablaAjustadaLegacy: false,
            amortizacion: amortizacionOriginal,
            calculoHoy: calculoOriginalHoy,
            requiereMetodoLegacy: false
        };
    }

    const amortizacionAjustada = generarTablaLegacyAjustadaLitePrecancelacion(credito, amortizacionOriginal);
    const calculoAjustadoHoy = construirCalculoLitePrecancelacion(credito, amortizacionAjustada, fechaHoy, true);

    return {
        usarTablaAjustadaLegacy: true,
        amortizacion: amortizacionAjustada,
        calculoHoy: calculoAjustadoHoy,
        requiereMetodoLegacy: calculoAjustadoHoy.interesPerdonado <= 0
    };
}

async function obtenerAmortizacionLitePrecancelacion(idCredito) {
    const supabase = window.getSupabaseClient();
    const { data, error } = await supabase
        .from('ic_creditos_amortizacion')
        .select('*')
        .eq('id_credito', idCredito)
        .order('numero_cuota', { ascending: true });

    if (error) throw error;
    if (!data?.length) throw new Error('No se encontró tabla de amortización.');
    return data;
}

function generarTablaLegacyAjustadaLitePrecancelacion(credito, amortizacionOriginal) {
    const capital = parseFloat(credito.capital || 0);
    const plazo = parseInt(credito.plazo || 0, 10);
    const tasaMensual = parseFloat(credito.tasa_interes_mensual || 0) / 100;
    const diaPago = parseInt(credito.dia_pago || 1, 10);
    const fechaDesembolso = window.parseDate(credito.fecha_desembolso);
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

    const cuotasPagadas = amortizacionOriginal.filter((cuota) => cuota.estado_cuota === 'PAGADO').length
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

    for (let i = 1; i <= plazo; i += 1) {
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
            fecha_vencimiento: toIsoDateLitePrec(fechaVenc),
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

function construirCalculoLitePrecancelacion(credito, amortizacion, fechaPrecancelacion, usarTablaAjustadaLegacy = false) {
    const fechaEvaluacion = new Date(fechaPrecancelacion);
    fechaEvaluacion.setHours(0, 0, 0, 0);

    const cuotasPagadasArr = amortizacion.filter((cuota) => cuota.estado_cuota === 'PAGADO');
    const cuotasPagadas = cuotasPagadasArr.length;
    const cuotasRestantes = amortizacion.length - cuotasPagadas;

    if (cuotasRestantes === 0) {
        throw new Error('El crédito ya está completamente pagado.');
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaCorte = fechaEvaluacion < hoy ? fechaEvaluacion : hoy;

    const cuotasVencidasSinPagar = amortizacion.filter((cuota) => {
        const fechaVencimiento = window.parseDate(cuota.fecha_vencimiento);
        return fechaVencimiento < fechaCorte && cuota.estado_cuota !== 'PAGADO';
    });

    if (cuotasVencidasSinPagar.length > 0) {
        throw new Error(LITE_MENSAJE_CREDITO_EN_MORA_PRECANC);
    }

    let capitalPendiente;
    let fechaUltimaCuotaPagada;
    if (cuotasPagadas === 0) {
        capitalPendiente = credito.capital_financiado || credito.capital;
        fechaUltimaCuotaPagada = window.parseDate(credito.fecha_desembolso);
    } else {
        const ultimaCuota = cuotasPagadasArr[cuotasPagadasArr.length - 1];
        capitalPendiente = parseFloat(ultimaCuota.saldo_capital || 0);
        fechaUltimaCuotaPagada = window.parseDate(ultimaCuota.fecha_vencimiento);
    }

    const cuotasPendientes = amortizacion.filter((cuota) => cuota.estado_cuota !== 'PAGADO');
    const totalCuotasPendientes = cuotasPendientes.reduce((sum, cuota) => sum + parseFloat(cuota.cuota_total || 0), 0);
    const ahorroPagado = usarTablaAjustadaLegacy ? 0 : cuotasPagadas * (credito.ahorro_programado_cuota || 0);

    const unDiaEnMs = 1000 * 60 * 60 * 24;
    const diasTranscurridos = Math.max(0, Math.round((fechaEvaluacion - fechaUltimaCuotaPagada) / unDiaEnMs));
    const tasaMensual = (credito.tasa_interes_mensual || 0) / 100;
    const tasaDiaria = (tasaMensual * 12) / 365;
    const interesProporcional = capitalPendiente * tasaDiaria * diasTranscurridos;
    const montoPrecancelar = capitalPendiente + interesProporcional;
    const interesPerdonado = Math.max(0, totalCuotasPendientes - montoPrecancelar);

    return {
        cuotasPagadas,
        cuotasRestantes,
        capitalPendiente,
        totalCuotasPendientes,
        diasTranscurridos,
        interesProporcional,
        interesPerdonado,
        ahorroDevolver: ahorroPagado,
        montoPrecancelar,
        usaTablaAjustadaLegacy: usarTablaAjustadaLegacy
    };
}

function showLitePrecancelacionResult(calculo) {
    const resultEl = document.getElementById('precanc-lite-result');
    const amountEl = document.getElementById('precanc-lite-result-amount');
    const metaEl = document.getElementById('precanc-lite-result-meta');

    if (amountEl) amountEl.textContent = formatMoneyLitePrec(calculo.montoPrecancelar);
    if (metaEl) {
        metaEl.textContent = calculo.usaTablaAjustadaLegacy
            ? `Valor calculado con tabla legacy ajustada. Restan ${calculo.cuotasRestantes} cuotas por considerar.`
            : `Valor calculado con tabla vigente. Restan ${calculo.cuotasRestantes} cuotas por considerar.`;
    }
    if (resultEl) resultEl.classList.remove('hidden');
}

function hideLitePrecancelacionResult() {
    const resultEl = document.getElementById('precanc-lite-result');
    if (resultEl) resultEl.classList.add('hidden');
}

function openLitePrecancModal() {
    const modal = document.getElementById('precanc-lite-modal');
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePrecancLiteModal() {
    const modal = document.getElementById('precanc-lite-modal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function setLitePrecancButtonState(button, disabled, text) {
    if (!button) return;
    button.disabled = disabled;
    button.innerHTML = `<i class="fas ${disabled ? 'fa-spinner fa-spin' : 'fa-bolt'}"></i><span>${text}</span>`;
}

function showLitePrecancMessage(title, text, icon = 'info') {
    if (window.Swal) {
        window.Swal.fire({
            title,
            text,
            icon,
            confirmButtonColor: '#0B4E32',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    console.warn(`[PRECANC-MOBILE] ${title}: ${text}`);
}

function formatMoneyLitePrec(amount) {
    return '$' + parseFloat(amount || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toIsoDateLitePrec(dateInput) {
    const date = window.parseDate(dateInput);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLiteTodayIso() {
    return toIsoDateLitePrec(new Date());
}

function escapeLitePrecHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}