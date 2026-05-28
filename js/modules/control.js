/**
 * INKA CORP - Subapp Control
 * Panel solo lectura para seguimiento operativo de movimientos de dinero.
 */

let controlData = {
    movimientos: [],
    cajas: [],
    creditos: [],
    bancos: [],
    polizas: []
};

let activeControlTab = 'movimientos';
let controlFilters = {};

const CONTROL_TABLE_CONFIG = {
    movimientos: {
        title: 'Movimientos de dinero',
        subtitle: 'Ingresos y egresos registrados en caja.',
        dateField: 'fecha_movimiento',
        sortOptions: [
            ['fecha_desc', 'Más recientes'],
            ['monto_desc', 'Mayor monto'],
            ['usuario_asc', 'Usuario A-Z']
        ]
    },
    creditos: {
        title: 'Créditos por responsable',
        subtitle: 'Seguimiento de cartera agrupada por encargado de cobranza.',
        dateField: 'proximo_pago',
        sortOptions: [
            ['riesgo_desc', 'Mayor riesgo'],
            ['responsable_asc', 'Responsable A-Z'],
            ['proximo_pago_asc', 'Próximo pago'],
            ['saldo_desc', 'Mayor saldo']
        ]
    },
    cajas: {
        title: 'Cajas',
        subtitle: 'Aperturas, cierres y saldos calculados por usuario.',
        dateField: 'fecha_apertura',
        sortOptions: [
            ['fecha_desc', 'Más recientes'],
            ['saldo_desc', 'Mayor saldo'],
            ['usuario_asc', 'Usuario A-Z']
        ]
    },
    bancos: {
        title: 'Pagos a bancos',
        subtitle: 'Obligaciones pendientes, próximas, vencidas y pagadas.',
        dateField: 'fecha_pago',
        sortOptions: [
            ['estado_asc', 'Estado prioritario'],
            ['fecha_asc', 'Fecha de pago'],
            ['banco_asc', 'Banco A-Z'],
            ['valor_desc', 'Mayor valor']
        ]
    },
    polizas: {
        title: 'Pólizas',
        subtitle: 'Pólizas vencidas, por vencer o pendientes de contrato.',
        dateField: 'fecha_vencimiento',
        sortOptions: [
            ['estado_asc', 'Estado prioritario'],
            ['vence_asc', 'Vencimiento'],
            ['valor_desc', 'Mayor valor'],
            ['socio_asc', 'Socio A-Z']
        ]
    }
};

async function initControlModule() {
    if (!window.isControlUser?.()) {
        await loadView('dashboard');
        return;
    }

    setupControlTabs();
    try {
        await loadControlData();
        renderControlDashboard();
        renderControlActiveTab();
    } catch (error) {
        console.error('[CONTROL] Error cargando datos:', error);
        showControlError(getControlFriendlyError(error));
    }
}

function setupControlTabs() {
    document.querySelectorAll('.control-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            activeControlTab = btn.dataset.controlTab || 'movimientos';
            controlFilters = {};
            document.querySelectorAll('.control-tab').forEach(tab => {
                tab.classList.toggle('active', tab === btn);
            });
            renderControlFilterControls();
            renderControlActiveTab();
        });
    });
}

async function loadControlData() {
    const sb = getSupabaseClient();
    if (!sb) return;

    const wrap = document.getElementById('control-table-wrap');
    if (wrap) {
        wrap.innerHTML = `
            <div class="control-loading">
                <i class="fas fa-circle-notch fa-spin"></i>
                <span>Cargando información...</span>
            </div>
        `;
    }

    const [
        movimientosRes,
        cajasRes,
        creditosRes,
        bancosRes,
        polizasRes
    ] = await Promise.all([
        sb.from('ic_control_movimientos_dinero').select('*').order('fecha_movimiento', { ascending: false }).limit(500),
        sb.from('ic_control_cajas').select('*').order('fecha_apertura', { ascending: false }).limit(200),
        sb.from('ic_control_creditos_cobranza').select('*').order('proximo_pago', { ascending: true, nullsFirst: false }).limit(500),
        sb.from('ic_control_bancos_obligaciones').select('*').order('fecha_pago', { ascending: true, nullsFirst: false }).limit(500),
        sb.from('ic_control_polizas').select('*').order('fecha_vencimiento', { ascending: true, nullsFirst: false }).limit(500)
    ]);

    const errors = [movimientosRes, cajasRes, creditosRes, bancosRes, polizasRes].filter(r => r.error).map(r => r.error.message);
    if (errors.length) {
        throw new Error(errors.join(' | '));
    }

    controlData = {
        movimientos: movimientosRes.data || [],
        cajas: cajasRes.data || [],
        creditos: creditosRes.data || [],
        bancos: bancosRes.data || [],
        polizas: polizasRes.data || []
    };

    renderControlFilterControls();

    const lastUpdate = document.getElementById('control-last-update');
    if (lastUpdate) {
        lastUpdate.textContent = `Actualizado ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
}

async function refreshControlDashboard() {
    try {
        await loadControlData();
        renderControlDashboard();
        renderControlActiveTab();
        if (typeof showToast === 'function') {
            showToast('Panel actualizado', 'success');
        }
    } catch (error) {
        console.error('[CONTROL] Error actualizando panel:', error);
        showControlError(error.message || 'No se pudo actualizar la información.');
    }
}

function renderControlDashboard() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthMovs = controlData.movimientos.filter(m => parseControlDate(m.fecha_movimiento) >= monthStart);
    const ingresos = monthMovs.filter(m => m.tipo_movimiento === 'INGRESO').reduce((sum, m) => sum + Number(m.monto || 0), 0);
    const egresos = monthMovs.filter(m => m.tipo_movimiento === 'EGRESO').reduce((sum, m) => sum + Number(m.monto || 0), 0);
    const creditosRiesgo = controlData.creditos.filter(c => Number(c.cuotas_en_riesgo || 0) > 0).length;
    const bancosProximos = controlData.bancos.filter(b => ['VENCIDO', 'PROXIMO'].includes(b.estado_control)).length;
    const polizasRevision = controlData.polizas.filter(p => ['FALTA_CONTRATO', 'VENCIDA', 'POR_VENCER'].includes(p.estado_control)).length;

    setControlText('control-stat-ingresos', formatControlMoney(ingresos));
    setControlText('control-stat-egresos', formatControlMoney(egresos));
    setControlText('control-stat-creditos', creditosRiesgo);
    setControlText('control-stat-bancos', bancosProximos);
    setControlText('control-stat-polizas', polizasRevision);

    renderControlAlerts({ creditosRiesgo, bancosProximos, polizasRevision });
}

function renderControlAlerts(stats) {
    const container = document.getElementById('control-alerts');
    if (!container) return;

    const alerts = [];
    if (stats.creditosRiesgo > 0) alerts.push(`${stats.creditosRiesgo} créditos requieren seguimiento de cobranza.`);
    if (stats.bancosProximos > 0) alerts.push(`${stats.bancosProximos} obligaciones bancarias están próximas o vencidas.`);
    if (stats.polizasRevision > 0) alerts.push(`${stats.polizasRevision} pólizas necesitan revisión.`);

    container.classList.toggle('hidden', alerts.length === 0);
    container.innerHTML = alerts.map(alert => `
        <div class="control-alert">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${escapeControlHtml(alert)}</span>
        </div>
    `).join('');
}

function renderControlActiveTab() {
    const config = CONTROL_TABLE_CONFIG[activeControlTab] || CONTROL_TABLE_CONFIG.movimientos;
    setControlText('control-table-title', config.title);
    setControlText('control-table-subtitle', config.subtitle);
    renderControlFilterControls();
    renderControlFilterChips();
    updateControlCreditReportButton();

    const filtered = sortControlRows(filterControlRows(controlData[activeControlTab] || [], config.dateField));

    switch (activeControlTab) {
        case 'creditos':
            renderControlTable(filtered, renderControlCreditosTable());
            break;
        case 'cajas':
            renderControlTable(filtered, renderControlCajasTable());
            break;
        case 'bancos':
            renderControlTable(filtered, renderControlBancosTable());
            break;
        case 'polizas':
            renderControlTable(filtered, renderControlPolizasTable());
            break;
        default:
            renderControlTable(filtered, renderControlMovimientosTable());
            break;
    }
}

function updateControlCreditReportButton() {
    const btn = document.getElementById('control-credit-report-btn');
    if (!btn) return;
    btn.classList.toggle('hidden', activeControlTab !== 'creditos');
}

function filterControlRows(rows, dateField) {
    const search = (document.getElementById('control-search')?.value || '').trim().toLowerCase();
    const period = document.getElementById('control-period-filter')?.value || 'month';
    const minDate = getControlMinDate(period);

    return rows.filter(row => {
        if (minDate && dateField && row[dateField]) {
            const rowDate = parseControlDate(row[dateField]);
            if (!rowDate || rowDate < minDate) return false;
        }

        if (!search) return true;
        if (!rowMatchesControlFilters(row)) return false;
        return JSON.stringify(row).toLowerCase().includes(search);
    }).filter(row => search ? true : rowMatchesControlFilters(row));
}

function rowMatchesControlFilters(row) {
    return Object.entries(controlFilters).every(([key, value]) => {
        if (!value || value === 'all') return true;

        if (key === 'riesgo') {
            return value === 'true' ? Number(row.cuotas_en_riesgo || 0) > 0 : true;
        }

        const rowValue = normalizeControlFilterValue(row, key);
        const allowedValues = String(value).split(',').map(v => v.trim()).filter(Boolean);
        if (allowedValues.length > 1) {
            return allowedValues.includes(rowValue);
        }

        return rowValue === String(value);
    });
}

function normalizeControlFilterValue(row, key) {
    const fallbackByKey = {
        encargado_nombre: 'Sin asignar',
        usuario_nombre: 'Sin usuario',
        categoria: 'MANUAL'
    };
    return String(row[key] || fallbackByKey[key] || '');
}

function renderControlFilterControls() {
    const context = document.getElementById('control-context-filters');
    const sort = document.getElementById('control-sort-filter');
    const config = CONTROL_TABLE_CONFIG[activeControlTab] || CONTROL_TABLE_CONFIG.movimientos;

    if (sort) {
        const selectedSort = controlFilters.__sort || config.sortOptions?.[0]?.[0] || '';
        sort.innerHTML = (config.sortOptions || []).map(([value, label]) => `
            <option value="${value}" ${value === selectedSort ? 'selected' : ''}>${escapeControlHtml(label)}</option>
        `).join('');
        sort.onchange = () => {
            controlFilters.__sort = sort.value;
            renderControlActiveTab();
        };
    }

    if (!context) return;

    const filters = getControlFilterDefinitions(activeControlTab);
    context.innerHTML = filters.map(filter => {
        const current = controlFilters[filter.key] || 'all';
        return `
            <select class="control-select" data-control-filter="${filter.key}">
                <option value="all">${escapeControlHtml(filter.label)}</option>
                ${filter.options.map(option => `
                    <option value="${escapeControlHtml(option.value)}" ${String(option.value) === String(current) ? 'selected' : ''}>
                        ${escapeControlHtml(option.label)}
                    </option>
                `).join('')}
            </select>
        `;
    }).join('');

    context.querySelectorAll('[data-control-filter]').forEach(select => {
        select.addEventListener('change', () => {
            const key = select.dataset.controlFilter;
            if (select.value === 'all') {
                delete controlFilters[key];
            } else {
                controlFilters[key] = select.value;
            }
            renderControlActiveTab();
        });
    });
}

function renderControlFilterChips() {
    const container = document.getElementById('control-active-filters');
    if (!container) return;

    const visibleFilters = Object.entries(controlFilters)
        .filter(([key, value]) => key !== '__sort' && value && value !== 'all')
        .map(([key, value]) => {
            const label = getControlFilterLabel(key);
            const cleanValue = String(value).split(',').map(v => v.replaceAll('_', ' ')).join(' / ');
            return `
                <span class="control-filter-chip">
                    <i class="fas fa-filter"></i>
                    ${escapeControlHtml(label)}: ${escapeControlHtml(cleanValue)}
                </span>
            `;
        });

    container.innerHTML = visibleFilters.join('');
}

function getControlFilterLabel(key) {
    const labels = {
        tipo_movimiento: 'Tipo',
        categoria: 'Categoría',
        usuario_nombre: 'Usuario',
        encargado_nombre: 'Responsable',
        estado_credito: 'Estado',
        riesgo: 'Riesgo',
        estado: 'Estado',
        nombre_banco: 'Banco',
        estado_control: 'Control'
    };
    return labels[key] || key;
}

function getControlFilterDefinitions(tab) {
    if (tab === 'movimientos') {
        return [
            { key: 'tipo_movimiento', label: 'Tipo', options: uniqueControlOptions(controlData.movimientos, 'tipo_movimiento') },
            { key: 'categoria', label: 'Categoría', options: uniqueControlOptions(controlData.movimientos, 'categoria') },
            { key: 'usuario_nombre', label: 'Usuario', options: uniqueControlOptions(controlData.movimientos, 'usuario_nombre') }
        ];
    }

    if (tab === 'creditos') {
        return [
            { key: 'encargado_nombre', label: 'Responsable', options: uniqueControlOptions(controlData.creditos, 'encargado_nombre', 'Sin asignar') },
            { key: 'estado_credito', label: 'Estado', options: uniqueControlOptions(controlData.creditos, 'estado_credito') },
            { key: 'riesgo', label: 'Riesgo', options: [{ value: 'true', label: 'Con riesgo' }] }
        ];
    }

    if (tab === 'cajas') {
        return [
            { key: 'usuario_nombre', label: 'Usuario', options: uniqueControlOptions(controlData.cajas, 'usuario_nombre') },
            { key: 'estado', label: 'Estado', options: uniqueControlOptions(controlData.cajas, 'estado') }
        ];
    }

    if (tab === 'bancos') {
        return [
            { key: 'nombre_banco', label: 'Banco', options: uniqueControlOptions(controlData.bancos, 'nombre_banco') },
            { key: 'estado_control', label: 'Estado', options: uniqueControlOptions(controlData.bancos, 'estado_control') }
        ];
    }

    if (tab === 'polizas') {
        return [
            { key: 'estado_control', label: 'Control', options: uniqueControlOptions(controlData.polizas, 'estado_control') },
            { key: 'estado', label: 'Estado', options: uniqueControlOptions(controlData.polizas, 'estado') }
        ];
    }

    return [];
}

function uniqueControlOptions(rows, key, fallback = '---') {
    const values = new Map();
    rows.forEach(row => {
        const raw = row[key] || fallback;
        const value = String(raw);
        if (!values.has(value)) {
            values.set(value, { value, label: value.replaceAll('_', ' ') });
        }
    });
    return [...values.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function sortControlRows(rows) {
    const sortValue = controlFilters.__sort || CONTROL_TABLE_CONFIG[activeControlTab]?.sortOptions?.[0]?.[0] || '';
    const priority = { VENCIDO: 1, VENCIDA: 1, FALTA_CONTRATO: 1, PROXIMO: 2, POR_VENCER: 2, PENDIENTE: 3, ABIERTA: 3, PAGADO: 4, AL_DIA: 4, CERRADA: 5 };

    return [...rows].sort((a, b) => {
        switch (sortValue) {
            case 'monto_desc':
                return Number(b.monto || 0) - Number(a.monto || 0);
            case 'usuario_asc':
                return String(a.usuario_nombre || '').localeCompare(String(b.usuario_nombre || ''));
            case 'responsable_asc':
                return String(a.encargado_nombre || 'Sin asignar').localeCompare(String(b.encargado_nombre || 'Sin asignar'));
            case 'riesgo_desc':
                return Number(b.cuotas_en_riesgo || 0) - Number(a.cuotas_en_riesgo || 0);
            case 'proximo_pago_asc':
                return compareControlDates(a.proximo_pago, b.proximo_pago);
            case 'saldo_desc':
                return Number(b.saldo_cuotas_pendientes || b.saldo_calculado || 0) - Number(a.saldo_cuotas_pendientes || a.saldo_calculado || 0);
            case 'estado_asc':
                return (priority[a.estado_control || a.estado] || 99) - (priority[b.estado_control || b.estado] || 99);
            case 'fecha_asc':
                return compareControlDates(a.fecha_pago, b.fecha_pago);
            case 'banco_asc':
                return String(a.nombre_banco || '').localeCompare(String(b.nombre_banco || ''));
            case 'valor_desc':
                return Number(b.valor || b.valor_final || 0) - Number(a.valor || a.valor_final || 0);
            case 'vence_asc':
                return compareControlDates(a.fecha_vencimiento, b.fecha_vencimiento);
            case 'socio_asc':
                return String(a.socio_nombre || '').localeCompare(String(b.socio_nombre || ''));
            case 'fecha_desc':
            default:
                return compareControlDates(b.fecha_movimiento || b.fecha_apertura, a.fecha_movimiento || a.fecha_apertura);
        }
    });
}

function compareControlDates(a, b) {
    const dateA = parseControlDate(a)?.getTime() || Number.MAX_SAFE_INTEGER;
    const dateB = parseControlDate(b)?.getTime() || Number.MAX_SAFE_INTEGER;
    return dateA - dateB;
}

function applyControlSummaryCard(tab, filters = {}) {
    activeControlTab = tab || 'movimientos';
    controlFilters = { ...filters };

    const defaultSort = CONTROL_TABLE_CONFIG[activeControlTab]?.sortOptions?.[0]?.[0];
    if (defaultSort) controlFilters.__sort = defaultSort;

    document.querySelectorAll('.control-tab').forEach(button => {
        button.classList.toggle('active', button.dataset.controlTab === activeControlTab);
    });

    renderControlFilterControls();
    renderControlActiveTab();

    document.querySelector('.control-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearControlFilters() {
    controlFilters = {};
    const search = document.getElementById('control-search');
    if (search) search.value = '';
    renderControlFilterControls();
    renderControlActiveTab();
}

function getControlFilteredRows(tab = activeControlTab) {
    const config = CONTROL_TABLE_CONFIG[tab] || CONTROL_TABLE_CONFIG.movimientos;
    return sortControlRows(filterControlRows(controlData[tab] || [], config.dateField));
}

async function generateControlCreditsReport() {
    const reportFilters = await openControlCreditReportFilters();
    if (!reportFilters) return;

    const rows = filterControlCreditReportRows(reportFilters);

    if (!rows.length) {
        await showControlReportNotice('Sin datos', 'No hay créditos para generar con los filtros seleccionados.', 'info');
        return;
    }

    if (!window.jspdf?.jsPDF) {
        await showControlReportNotice('No se pudo generar', 'El generador de PDF no está disponible en este momento.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    if (typeof doc.autoTable !== 'function') {
        await showControlReportNotice('No se pudo generar', 'El generador de tablas del PDF no está disponible en este momento.', 'error');
        return;
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const verdeInka = [11, 78, 50];
    const doradoInka = [242, 187, 58];
    const slate = [71, 85, 105];
    const currentUser = window.getCurrentUser?.() || {};
    const generatedBy = currentUser.nombre || currentUser.email || 'Usuario de control';
    const now = new Date();

    try {
        doc.addImage('https://i.ibb.co/3mC22Hc4/inka-corp.png', 'PNG', 14, 10, 17, 17);
    } catch (error) {
        console.warn('[CONTROL] No se pudo agregar logo al PDF:', error);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...verdeInka);
    doc.text('INKA CORP', 36, 16);

    doc.setFontSize(10);
    doc.setTextColor(...slate);
    doc.text('REPORTE DE CONTROL DE CREDITOS', 36, 23);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Generado: ${now.toLocaleDateString('es-EC')} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, pageWidth - 14, 15, { align: 'right' });
    doc.text(`Registros: ${rows.length}`, pageWidth - 14, 21, { align: 'right' });

    doc.setDrawColor(...doradoInka);
    doc.setLineWidth(0.5);
    doc.line(14, 31, pageWidth - 14, 31);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...verdeInka);
    doc.text('Resumen del filtro', 14, 39);

    const totalCapital = rows.reduce((sum, row) => sum + Number(row.capital_financiado || row.capital || 0), 0);
    const totalSaldoCuotas = rows.reduce((sum, row) => sum + Number(row.saldo_cuotas_pendientes || 0), 0);
    const totalRiesgo = rows.filter(row => Number(row.cuotas_en_riesgo || 0) > 0).length;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 28, 38);
    doc.text(`Capital total: ${formatControlMoney(totalCapital)}`, 14, 46);
    doc.text(`Saldo cuotas pendientes: ${formatControlMoney(totalSaldoCuotas)}`, 76, 46);
    doc.text(`Creditos en riesgo: ${totalRiesgo}`, 160, 46);

    const filterSummary = getControlCreditReportFilterSummary(reportFilters);
    if (filterSummary) {
        doc.setFontSize(7.5);
        doc.setTextColor(...slate);
        doc.text(`Filtros: ${filterSummary}`, 14, 51);
    }

    const categorizedRows = categorizeControlCreditRows(rows);
    let nextY = filterSummary ? 58 : 54;

    nextY = appendControlCreditReportSection(doc, 'Cartera activa y al dia', categorizedRows.active, nextY, verdeInka);
    nextY = appendControlMorosoReportSection(doc, categorizedRows.morosos, nextY + 4);
    if (categorizedRows.inactive.length) {
        nextY = appendControlCreditReportSection(doc, 'Creditos no activos', categorizedRows.inactive, nextY + 4, slate);
    }

    appendControlCreditsPieChart(doc, categorizedRows, nextY + 8, verdeInka, [185, 28, 28]);

    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setDrawColor(220, 225, 232);
    doc.line(14, footerY - 12, pageWidth - 14, footerY - 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...verdeInka);
    doc.text(`Generado por: ${generatedBy}`, 14, footerY - 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...slate);
    doc.text('Oficial de cumplimiento interno', 14, footerY);
    doc.text('Documento generado desde el Panel de Control de INKA CORP', pageWidth - 14, footerY, { align: 'right' });

    const fileDate = now.toISOString().slice(0, 10);
    doc.save(`Reporte_Control_Creditos_${fileDate}.pdf`);
}

function categorizeControlCreditRows(rows) {
    return rows.reduce((groups, row) => {
        if (isControlMorosoCredit(row)) {
            groups.morosos.push(row);
        } else if (isControlOperationalCredit(row.estado_credito)) {
            groups.active.push(row);
        } else {
            groups.inactive.push(row);
        }
        return groups;
    }, { active: [], morosos: [], inactive: [] });
}

function appendControlCreditReportSection(doc, title, rows, startY, headerColor) {
    if (!rows.length) return startY;

    const currentY = getControlPdfSectionStart(doc, startY, 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...headerColor);
    doc.text(`${title} (${rows.length})`, 14, currentY);

    doc.autoTable({
        startY: currentY + 4,
        head: [[
            'Codigo',
            'Responsable',
            'Socio',
            'Dia pago',
            'Capital',
            'Cuota',
            'Estado',
            'Cuotas'
        ]],
        body: rows.map(row => [
            row.codigo_credito || row.id_credito || '---',
            row.encargado_nombre || 'Sin asignar',
            row.socio_nombre || 'Socio',
            formatControlPaymentDay(row.proximo_pago),
            formatControlMoney(row.capital_financiado || row.capital),
            formatControlMoney(row.cuota_con_ahorro),
            row.estado_credito || '---',
            `${Number(row.cuotas_pagadas || 0)}/${Number(row.total_cuotas || row.plazo || 0)}`
        ]),
        styles: getControlReportTableStyles(),
        headStyles: {
            fillColor: headerColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
        rowPageBreak: 'avoid',
        columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 40 },
            2: { cellWidth: 46 },
            3: { cellWidth: 21 },
            4: { halign: 'right', cellWidth: 27 },
            5: { halign: 'right', cellWidth: 23 },
            6: { cellWidth: 23 },
            7: { halign: 'center', cellWidth: 18 }
        }
    });

    return doc.lastAutoTable?.finalY || currentY + 12;
}

function appendControlMorosoReportSection(doc, rows, startY) {
    if (!rows.length) return startY;

    const currentY = getControlPdfSectionStart(doc, startY, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text(`Creditos morosos: detalle para ponerse al dia (${rows.length})`, 14, currentY);

    doc.autoTable({
        startY: currentY + 4,
        head: [[
            'Codigo',
            'Responsable',
            'Socio',
            'Dia pago',
            'Cuotas mora',
            'Dias mora',
            'Valor al dia',
            'Cuotas',
            'Observaciones'
        ]],
        body: rows.map(row => [
            row.codigo_credito || row.id_credito || '---',
            row.encargado_nombre || 'Sin asignar',
            row.socio_nombre || 'Socio',
            formatControlPaymentDay(row.proximo_pago),
            Number(row.cuotas_en_riesgo || 0),
            getControlOverdueDays(row),
            formatControlMoney(getControlCatchUpAmount(row)),
            `${Number(row.cuotas_pagadas || 0)}/${Number(row.total_cuotas || row.plazo || 0)}`,
            ''
        ]),
        styles: {
            ...getControlReportTableStyles(),
            minCellHeight: 13,
            valign: 'top'
        },
        headStyles: {
            fillColor: [185, 28, 28],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        margin: { left: 14, right: 14 },
        rowPageBreak: 'avoid',
        columnStyles: {
            0: { cellWidth: 28 },
            1: { cellWidth: 34 },
            2: { cellWidth: 38 },
            3: { cellWidth: 18 },
            4: { halign: 'center', cellWidth: 18 },
            5: { halign: 'center', cellWidth: 18 },
            6: { halign: 'right', cellWidth: 25 },
            7: { halign: 'center', cellWidth: 16 },
            8: { cellWidth: 58 }
        }
    });

    return doc.lastAutoTable?.finalY || currentY + 12;
}

function getControlReportTableStyles() {
    return {
        fontSize: 7.3,
        cellPadding: 2,
        overflow: 'linebreak'
    };
}

function appendControlCreditsPieChart(doc, categorizedRows, startY, activeColor, morosoColor) {
    const activeCount = categorizedRows.active.length;
    const morosoCount = categorizedRows.morosos.length;
    const total = activeCount + morosoCount;
    if (!total) return;

    startY = getControlPdfSectionStart(doc, startY, 62);

    const dataUrl = createControlPieChartImage(activeCount, morosoCount, activeColor, morosoColor);
    const pageWidth = doc.internal.pageSize.getWidth();
    const chartSize = 46;
    const chartX = (pageWidth - chartSize) / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 28, 38);
    doc.text('Distribucion de cartera operativa', pageWidth / 2, startY, { align: 'center' });
    doc.addImage(dataUrl, 'PNG', chartX, startY + 6, chartSize, chartSize);

    const activePercent = Math.round((activeCount / total) * 100);
    const morosoPercent = 100 - activePercent;
    const legendY = startY + chartSize + 15;

    doc.setFillColor(...activeColor);
    doc.roundedRect(pageWidth / 2 - 58, legendY - 4, 4, 4, 1, 1, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(20, 28, 38);
    doc.text(`Activos/al dia: ${activeCount} (${activePercent}%)`, pageWidth / 2 - 51, legendY);

    doc.setFillColor(...morosoColor);
    doc.roundedRect(pageWidth / 2 + 22, legendY - 4, 4, 4, 1, 1, 'F');
    doc.text(`Morosos: ${morosoCount} (${morosoPercent}%)`, pageWidth / 2 + 29, legendY);
}

function createControlPieChartImage(activeCount, morosoCount, activeColor, morosoColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const total = activeCount + morosoCount;
    const center = 160;
    const radius = 112;
    let start = -Math.PI / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(center + 4, center + 8, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.fill();

    [
        { value: activeCount, color: activeColor },
        { value: morosoCount, color: morosoColor }
    ].forEach(slice => {
        const angle = total ? (slice.value / total) * Math.PI * 2 : 0;
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = `rgb(${slice.color.join(',')})`;
        ctx.fill();
        start += angle;
    });

    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, 54, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${total}`, center, center - 8);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 15px Arial';
    ctx.fillText('creditos', center, center + 18);

    return canvas.toDataURL('image/png');
}

function getControlPdfSectionStart(doc, startY, requiredHeight) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 24;
    let y = Math.max(Number(startY || 0), 22);
    if (doc.lastAutoTable?.finalY && doc.lastAutoTable.finalY >= y - 2) {
        y = doc.lastAutoTable.finalY + 8;
    }

    if (y + requiredHeight > pageHeight - bottomMargin) {
        doc.addPage();
        return 22;
    }
    return y;
}

async function openControlCreditReportFilters() {
    const allRows = controlData.creditos || [];
    if (!allRows.length) {
        await showControlReportNotice('Sin datos', 'No hay créditos cargados para generar el reporte.', 'info');
        return null;
    }

    if (typeof Swal === 'undefined') {
        return {
            responsible: controlFilters.encargado_nombre || 'all',
            status: controlFilters.estado_credito || 'all',
            risk: controlFilters.riesgo === 'true' ? 'with_risk' : 'all',
            paymentDay: 'all',
            search: '',
            includeInactive: false
        };
    }

    const responsibleOptions = buildControlReportSelectOptions(allRows, 'encargado_nombre', 'Sin asignar', controlFilters.encargado_nombre);
    const statusOptions = buildControlReportSelectOptions(allRows, 'estado_credito', 'Sin estado', controlFilters.estado_credito);
    const paymentDayOptions = buildControlPaymentDayOptions(allRows);
    const currentSearch = document.getElementById('control-search')?.value || '';

    const result = await Swal.fire({
        title: 'Reporte de créditos',
        html: `
            <div class="control-report-modal">
                <label>
                    <span>Responsable de cobro</span>
                    <select id="swal-control-report-responsible">
                        <option value="all">Todos los responsables</option>
                        ${responsibleOptions}
                    </select>
                </label>
                <label>
                    <span>Estado</span>
                    <select id="swal-control-report-status">
                        <option value="all">Todos los estados</option>
                        ${statusOptions}
                    </select>
                </label>
                <label>
                    <span>Riesgo</span>
                    <select id="swal-control-report-risk">
                        <option value="all">Todos</option>
                        <option value="with_risk" ${controlFilters.riesgo === 'true' ? 'selected' : ''}>Con cuotas en riesgo</option>
                        <option value="without_risk">Sin cuotas en riesgo</option>
                    </select>
                </label>
                <label>
                    <span>Día de pago</span>
                    <select id="swal-control-report-payment-day">
                        <option value="all">Todos los días</option>
                        ${paymentDayOptions}
                    </select>
                </label>
                <label class="control-report-modal-full">
                    <span>Buscar</span>
                    <input id="swal-control-report-search" type="search" value="${escapeControlHtml(currentSearch)}" placeholder="Socio, cédula o código">
                </label>
                <label class="control-report-check control-report-modal-full">
                    <input id="swal-control-report-inactive" type="checkbox">
                    <span>Incluir créditos no activos como cancelados, precancelados o pausados</span>
                </label>
                <p>Por defecto se incluyen créditos activos, al día y morosos.</p>
            </div>
        `,
        width: 720,
        confirmButtonText: 'Generar PDF',
        cancelButtonText: 'Cancelar',
        showCancelButton: true,
        focusConfirm: false,
        customClass: {
            popup: 'control-report-swal'
        },
        preConfirm: () => ({
            responsible: document.getElementById('swal-control-report-responsible')?.value || 'all',
            status: document.getElementById('swal-control-report-status')?.value || 'all',
            risk: document.getElementById('swal-control-report-risk')?.value || 'all',
            paymentDay: document.getElementById('swal-control-report-payment-day')?.value || 'all',
            search: document.getElementById('swal-control-report-search')?.value?.trim() || '',
            includeInactive: !!document.getElementById('swal-control-report-inactive')?.checked
        })
    });

    return result.isConfirmed ? result.value : null;
}

function buildControlReportSelectOptions(rows, key, fallback, selectedValue = '') {
    return uniqueControlOptions(rows, key, fallback).map(option => `
        <option value="${escapeControlHtml(option.value)}" ${String(option.value) === String(selectedValue) ? 'selected' : ''}>
            ${escapeControlHtml(option.label)}
        </option>
    `).join('');
}

function buildControlPaymentDayOptions(rows) {
    const days = new Set();
    rows.forEach(row => {
        const day = getControlPaymentDay(row.proximo_pago);
        if (day) days.add(day);
    });

    return [...days].sort((a, b) => a - b).map(day => `
        <option value="${day}">Día ${day}</option>
    `).join('');
}

function filterControlCreditReportRows(filters = {}) {
    const rows = (controlData.creditos || []).filter(row => {
        if (!filters.includeInactive && !isControlOperationalCredit(row.estado_credito)) return false;

        if (filters.responsible && filters.responsible !== 'all' && normalizeControlFilterValue(row, 'encargado_nombre') !== filters.responsible) {
            return false;
        }

        if (filters.status && filters.status !== 'all' && normalizeControlFilterValue(row, 'estado_credito') !== filters.status) {
            return false;
        }

        if (filters.risk === 'with_risk' && Number(row.cuotas_en_riesgo || 0) <= 0) return false;
        if (filters.risk === 'without_risk' && Number(row.cuotas_en_riesgo || 0) > 0) return false;

        if (filters.paymentDay && filters.paymentDay !== 'all') {
            const paymentDay = getControlPaymentDay(row.proximo_pago);
            if (String(paymentDay) !== String(filters.paymentDay)) return false;
        }

        return rowMatchesControlReportSearch(row, filters.search);
    });

    return sortControlRowsForReport(rows);
}

function sortControlRowsForReport(rows) {
    const priority = { MOROSO: 1, VENCIDO: 1, ACTIVO: 2, AL_DIA: 3, 'AL DIA': 3, PENDIENTE: 4, PAUSADO: 5, PRECANCELADO: 6, CANCELADO: 7 };
    return [...rows].sort((a, b) => {
        const stateDiff = (priority[normalizeControlState(a.estado_credito)] || 99) - (priority[normalizeControlState(b.estado_credito)] || 99);
        if (stateDiff !== 0) return stateDiff;
        const dateDiff = compareControlDates(a.proximo_pago, b.proximo_pago);
        if (dateDiff !== 0) return dateDiff;
        return String(a.encargado_nombre || 'Sin asignar').localeCompare(String(b.encargado_nombre || 'Sin asignar'));
    });
}

function rowMatchesControlReportSearch(row, search = '') {
    const term = String(search || '').trim().toLowerCase();
    if (!term) return true;
    return [
        row.encargado_nombre,
        row.codigo_credito,
        row.id_credito,
        row.socio_nombre,
        row.socio_cedula,
        row.estado_credito
    ].some(value => String(value || '').toLowerCase().includes(term));
}

function isControlOperationalCredit(state) {
    return ['ACTIVO', 'AL_DIA', 'AL DIA', 'MOROSO'].includes(normalizeControlState(state));
}

function isControlMorosoCredit(row) {
    return normalizeControlState(row?.estado_credito) === 'MOROSO' || Number(row?.cuotas_en_riesgo || 0) > 0;
}

function getControlCatchUpAmount(row) {
    const catchUp = Number(row?.saldo_para_ponerse_al_dia || 0);
    if (catchUp > 0) return catchUp;
    return Number(row?.saldo_cuotas_pendientes || 0);
}

function getControlOverdueDays(row) {
    if (row?.dias_mora !== null && row?.dias_mora !== undefined) {
        return Math.max(Number(row.dias_mora) || 0, 0);
    }

    const overdueDate = parseControlDate(row?.primer_pago_vencido || row?.proximo_pago);
    if (!overdueDate) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    overdueDate.setHours(0, 0, 0, 0);
    return Math.max(Math.floor((today.getTime() - overdueDate.getTime()) / 86400000), 0);
}

function getControlMorosoObservation(row) {
    const cuotas = Number(row?.cuotas_en_riesgo || 0);
    const dias = getControlOverdueDays(row);
    const amount = getControlCatchUpAmount(row);

    if (dias >= 30 || cuotas >= 2) {
        return `Prioridad alta: regularizar ${cuotas} cuota(s), ${dias} dia(s), ${formatControlMoney(amount)}.`;
    }

    if (dias > 0) {
        return `Seguimiento preventivo: ${dias} dia(s) de atraso.`;
    }

    return `Revisar cuota parcial o estado de cartera.`;
}

function normalizeControlState(state) {
    return String(state || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replaceAll('-', '_')
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

function getControlCreditReportFilterSummary(filters = {}) {
    const parts = [];
    parts.push(filters.includeInactive ? 'Incluye no activos' : 'Solo cartera activa operativa');
    if (filters.responsible && filters.responsible !== 'all') parts.push(`Responsable ${filters.responsible}`);
    if (filters.status && filters.status !== 'all') parts.push(`Estado ${filters.status}`);
    if (filters.risk === 'with_risk') parts.push('Con riesgo');
    if (filters.risk === 'without_risk') parts.push('Sin riesgo');
    if (filters.paymentDay && filters.paymentDay !== 'all') parts.push(`Dia de pago ${filters.paymentDay}`);
    if (filters.search) parts.push(`Busqueda "${filters.search}"`);
    return parts.join(' | ');
}

async function showControlReportNotice(title, text, icon = 'info') {
    if (typeof Swal !== 'undefined') {
        await Swal.fire(title, text, icon);
    } else if (typeof showToast === 'function') {
        showToast(text, icon === 'error' ? 'error' : 'info');
    } else {
        console.warn(`[CONTROL] ${title}: ${text}`);
    }
}

function renderControlTable(rows, tableRenderer) {
    const wrap = document.getElementById('control-table-wrap');
    if (!wrap) return;

    if (!rows.length) {
        wrap.innerHTML = `
            <div class="control-empty">
                <i class="fas fa-check-circle"></i>
                <span>No hay registros para los filtros seleccionados.</span>
            </div>
        `;
        return;
    }

    wrap.innerHTML = tableRenderer(rows);
}

function renderControlMovimientosTable() {
    return rows => `
        <table class="control-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th>Monto</th>
                    <th>Saldo</th>
                    <th>Estado Caja</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(m => `
                    <tr>
                        <td>${formatControlDateTime(m.fecha_movimiento)}</td>
                        <td><strong>${escapeControlHtml(m.usuario_nombre || 'Sin usuario')}</strong></td>
                        <td>${controlBadge(m.categoria || 'MANUAL')}</td>
                        <td>${escapeControlHtml(m.descripcion || 'Sin descripción')}</td>
                        <td class="${m.tipo_movimiento === 'INGRESO' ? 'control-money-in' : 'control-money-out'}">
                            ${m.tipo_movimiento === 'INGRESO' ? '+' : '-'} ${formatControlMoney(m.monto)}
                        </td>
                        <td><strong>${m.saldo !== null && m.saldo !== undefined ? formatControlMoney(m.saldo) : '---'}</strong></td>
                        <td>${controlBadge(m.estado_caja || '---', m.estado_caja === 'ABIERTA' ? 'ok' : '')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderControlCreditosTable() {
    return rows => `
        <table class="control-table">
            <thead>
                <tr>
                    <th>Responsable</th>
                    <th>Socio</th>
                    <th>Crédito</th>
                    <th>Estado</th>
                    <th>Progreso</th>
                    <th>Próximo pago</th>
                    <th>Saldo cuotas</th>
                    <th>Último recordatorio</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(c => `
                    <tr>
                        <td><strong>${escapeControlHtml(c.encargado_nombre || 'Sin asignar')}</strong></td>
                        <td>${escapeControlHtml(c.socio_nombre || 'Socio')}</td>
                        <td>${escapeControlHtml(c.codigo_credito || c.id_credito)}</td>
                        <td>${controlBadge(c.estado_credito || '---', Number(c.cuotas_en_riesgo || 0) > 0 ? 'danger' : 'ok')}</td>
                        <td>${Number(c.cuotas_pagadas || 0)}/${Number(c.total_cuotas || c.plazo || 0)}</td>
                        <td>${formatControlDate(c.proximo_pago)}</td>
                        <td><strong>${formatControlMoney(c.saldo_cuotas_pendientes)}</strong></td>
                        <td>${formatControlDateTime(c.ultimo_recordatorio)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderControlCajasTable() {
    return rows => `
        <table class="control-table">
            <thead>
                <tr>
                    <th>Usuario</th>
                    <th>Estado</th>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th>Inicial</th>
                    <th>Ingresos</th>
                    <th>Egresos</th>
                    <th>Saldo calculado</th>
                    <th>Movs</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(c => `
                    <tr>
                        <td><strong>${escapeControlHtml(c.usuario_nombre || 'Usuario')}</strong></td>
                        <td>${controlBadge(c.estado || '---', c.estado === 'ABIERTA' ? 'warn' : 'ok')}</td>
                        <td>${formatControlDateTime(c.fecha_apertura)}</td>
                        <td>${formatControlDateTime(c.fecha_cierre)}</td>
                        <td>${formatControlMoney(c.saldo_inicial)}</td>
                        <td class="control-money-in">${formatControlMoney(c.total_ingresos)}</td>
                        <td class="control-money-out">${formatControlMoney(c.total_egresos)}</td>
                        <td><strong>${formatControlMoney(c.saldo_calculado)}</strong></td>
                        <td>${Number(c.movimientos || 0)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderControlBancosTable() {
    return rows => `
        <table class="control-table">
            <thead>
                <tr>
                    <th>Banco</th>
                    <th>Motivo</th>
                    <th>Cuota</th>
                    <th>Valor</th>
                    <th>Fecha pago</th>
                    <th>Fecha pagado</th>
                    <th>Estado</th>
                    <th>Comprobante</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(b => `
                    <tr>
                        <td><strong>${escapeControlHtml(b.nombre_banco || b.transaccion)}</strong></td>
                        <td>${escapeControlHtml(b.motivo || b.a_nombre_de || '---')}</td>
                        <td>${b.cuota || '---'}</td>
                        <td><strong>${formatControlMoney(b.valor)}</strong></td>
                        <td>${formatControlDate(b.fecha_pago)}</td>
                        <td>${formatControlDate(b.fecha_pagado)}</td>
                        <td>${controlBadge(b.estado_control || b.estado_cuota, getControlStateTone(b.estado_control))}</td>
                        <td>${b.comprobante_url ? '<i class="fas fa-check-circle control-money-in"></i>' : '---'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderControlPolizasTable() {
    return rows => `
        <table class="control-table">
            <thead>
                <tr>
                    <th>Socio</th>
                    <th>Estado</th>
                    <th>Control</th>
                    <th>Valor</th>
                    <th>Valor final</th>
                    <th>Fecha</th>
                    <th>Vence</th>
                    <th>Contrato</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(p => `
                    <tr>
                        <td><strong>${escapeControlHtml(p.socio_nombre || 'Socio')}</strong></td>
                        <td>${controlBadge(p.estado || '---')}</td>
                        <td>${controlBadge(p.estado_control || '---', getControlStateTone(p.estado_control))}</td>
                        <td>${formatControlMoney(p.valor)}</td>
                        <td><strong>${formatControlMoney(p.valor_final)}</strong></td>
                        <td>${formatControlDate(p.fecha)}</td>
                        <td>${formatControlDate(p.fecha_vencimiento)}</td>
                        <td>${p.certificado_firmado ? '<i class="fas fa-check-circle control-money-in"></i>' : '<span class="control-badge warn">Pendiente</span>'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function getControlStateTone(state) {
    if (['VENCIDO', 'VENCIDA', 'FALTA_CONTRATO'].includes(state)) return 'danger';
    if (['PROXIMO', 'POR_VENCER'].includes(state)) return 'warn';
    if (['PAGADO', 'AL_DIA'].includes(state)) return 'ok';
    return '';
}

function controlBadge(text, tone = '') {
    return `<span class="control-badge ${tone}">${escapeControlHtml(String(text || '---').replaceAll('_', ' '))}</span>`;
}

function getControlMinDate(period) {
    if (period === 'all') return null;

    const date = new Date();
    date.setHours(0, 0, 0, 0);

    if (period === 'month') {
        date.setDate(1);
        return date;
    }

    const days = Number(period);
    if (Number.isFinite(days)) {
        date.setDate(date.getDate() - (days - 1));
        return date;
    }

    return null;
}

function parseControlDate(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) {
            const [, year, month, day] = dateOnly;
            return new Date(Number(year), Number(month) - 1, Number(day));
        }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatControlDate(value) {
    const date = parseControlDate(value);
    return date ? date.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '---';
}

function formatControlDateTime(value) {
    const date = parseControlDate(value);
    return date ? `${date.toLocaleDateString('es-EC')} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '---';
}

function getControlPaymentDay(value) {
    const date = parseControlDate(value);
    return date ? date.getDate() : null;
}

function formatControlPaymentDay(value) {
    const day = getControlPaymentDay(value);
    return day ? `Día ${day}` : '---';
}

function formatControlMoney(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString('es-EC', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    });
}

function setControlText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeControlHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function showControlError(message) {
    const wrap = document.getElementById('control-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
        <div class="control-empty">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${escapeControlHtml(message)}</span>
        </div>
    `;
}

function getControlFriendlyError(error) {
    const message = String(error?.message || error || '');
    const normalized = message.toLowerCase();

    if (normalized.includes('schema cache') || normalized.includes('ic_control_')) {
        return 'Las vistas de Control todavía no están disponibles para la app. Ejecuta el SQL de creación de vistas y luego NOTIFY pgrst, reload schema.';
    }

    return message || 'No se pudo cargar la información de control.';
}

window.initControlModule = initControlModule;
window.refreshControlDashboard = refreshControlDashboard;
window.renderControlActiveTab = renderControlActiveTab;
window.applyControlSummaryCard = applyControlSummaryCard;
window.clearControlFilters = clearControlFilters;
window.generateControlCreditsReport = generateControlCreditsReport;
