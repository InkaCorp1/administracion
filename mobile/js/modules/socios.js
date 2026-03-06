let mobileSociosAll = [];
let mobileSociosFiltered = [];
let mobileSociosTerm = '';

async function initSociosModule() {
    bindMobileSociosEvents();
    await fetchMobileSocios();
}

function bindMobileSociosEvents() {
    const searchInput = document.getElementById('mobile-socios-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            mobileSociosTerm = String(e.target.value || '').toLowerCase().trim();
            applyMobileSociosFilters();
        };
    }

    const modal = document.getElementById('mobile-socio-detail-modal');
    modal?.querySelectorAll('[data-close-socio-modal]').forEach((btn) => {
        btn.onclick = closeMobileSocioDetail;
    });
}

async function fetchMobileSocios() {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_socios')
            .select(`
                idsocio,
                nombre,
                cedula,
                whatsapp,
                domicilio,
                paisresidencia,
                estadocivil,
                nombreconyuge,
                cedulaconyuge,
                whatsappconyuge,
                nombrereferencia,
                whatsappreferencia,
                creditos:ic_creditos (
                    id_credito,
                    codigo_credito,
                    estado_credito,
                    capital,
                    plazo,
                    cuotas_pagadas,
                    cuota_con_ahorro,
                    fecha_desembolso
                )
            `)
            .order('nombre', { ascending: true });

        if (error) throw error;

        const estadoVigente = ['ACTIVO', 'MOROSO', 'PAUSADO'];

        mobileSociosAll = (data || []).map((socio) => {
            const creditos = Array.isArray(socio.creditos) ? socio.creditos : [];
            const creditosVigentes = creditos.filter((c) => estadoVigente.includes((c.estado_credito || '').toUpperCase()));
            const tieneMora = creditos.some((c) => (c.estado_credito || '').toUpperCase() === 'MOROSO');
            const tieneActivo = creditos.some((c) => (c.estado_credito || '').toUpperCase() === 'ACTIVO');
            const tienePausado = creditos.some((c) => (c.estado_credito || '').toUpperCase() === 'PAUSADO');

            return {
                ...socio,
                totalCreditos: creditos.length,
                creditosVigentes: creditosVigentes.length,
                creditoEstado: tieneMora ? 'MOROSO' : (tieneActivo ? 'ACTIVO' : (tienePausado ? 'PAUSADO' : 'SIN_CREDITO'))
            };
        });

        applyMobileSociosFilters();
    } catch (error) {
        console.error('Error al cargar socios móvil:', error);
        const container = document.getElementById('mobile-socios-list');
        if (container) {
            container.innerHTML = `
                <div class="mobile-empty-state">
                    <i class="fas fa-triangle-exclamation"></i>
                    <p>No se pudo cargar la información de socios.</p>
                </div>
            `;
        }
    }
}

function applyMobileSociosFilters() {
    mobileSociosFiltered = mobileSociosAll.filter((socio) => {
        if (mobileSociosTerm) {
            const nombre = String(socio.nombre || '').toLowerCase();
            const cedula = String(socio.cedula || '').toLowerCase();
            if (!nombre.includes(mobileSociosTerm) && !cedula.includes(mobileSociosTerm)) {
                return false;
            }
        }

        return true;
    });

    renderMobileSociosList();
}

function renderMobileSociosList() {
    const container = document.getElementById('mobile-socios-list');
    if (!container) return;

    if (!mobileSociosFiltered.length) {
        container.innerHTML = `
            <div class="mobile-empty-state">
                <i class="fas fa-users-slash"></i>
                <p>No se encontraron socios con estos filtros.</p>
            </div>
        `;
        return;
    }

    const grouped = groupSociosByEstado(mobileSociosFiltered);
    const order = ['MOROSO', 'ACTIVO', 'PAUSADO', 'SIN_CREDITO'];
    const config = {
        MOROSO: { icon: 'fa-triangle-exclamation', label: 'Morosos', className: 'moroso' },
        ACTIVO: { icon: 'fa-circle-check', label: 'Activos', className: 'activo' },
        PAUSADO: { icon: 'fa-circle-pause', label: 'Pausados', className: 'pausado' },
        SIN_CREDITO: { icon: 'fa-user-slash', label: 'Sin crédito', className: 'sin-credito' }
    };

    const html = order
        .filter((estado) => (grouped[estado] || []).length > 0)
        .map((estado) => {
            const socios = grouped[estado];
            const cfg = config[estado];
            return `
                <section class="mobile-socios-group ${cfg.className}">
                    <div class="mobile-socios-group-header">
                        <div class="mobile-socios-group-title">
                            <i class="fas ${cfg.icon}"></i>
                            <span>${cfg.label}</span>
                        </div>
                        <span class="mobile-socios-group-count">${socios.length}</span>
                    </div>
                    <div class="mobile-socios-group-body">
                        ${socios.map((socio) => renderSocioMobileCard(socio)).join('')}
                    </div>
                </section>
            `;
        })
        .join('');

    container.innerHTML = html;

    container.querySelectorAll('.mobile-socio-card').forEach((card) => {
        card.onclick = () => openMobileSocioDetail(card.dataset.socioId);
    });
}

function groupSociosByEstado(socios) {
    return socios.reduce((acc, socio) => {
        const estado = socio.creditoEstado || 'SIN_CREDITO';
        if (!acc[estado]) acc[estado] = [];
        acc[estado].push(socio);
        return acc;
    }, {});
}

function renderSocioMobileCard(socio) {
    const estadoClass = (socio.creditoEstado || 'SIN_CREDITO').toLowerCase().replace('_', '-');
    return `
        <article class="mobile-socio-card" data-socio-id="${socio.idsocio}">
            <div class="mobile-socio-top">
                <div>
                    <h4 class="mobile-socio-name">${escapeHtml(socio.nombre || 'Sin nombre')}</h4>
                    <p class="mobile-socio-id">${escapeHtml(socio.cedula || 'Sin cédula')}</p>
                </div>
                <span class="mobile-badge ${estadoClass}">${formatEstado(socio.creditoEstado)}</span>
            </div>
            <div class="mobile-socio-meta">
                <span><i class="fas fa-globe-americas"></i> ${escapeHtml(socio.paisresidencia || 'Sin país')}</span>
                <span>${socio.creditosVigentes} vigentes / ${socio.totalCreditos} total</span>
            </div>
            <div class="mobile-socio-row">
                <i class="fas fa-eye"></i>
                <span>Tocar para ver información completa e historial</span>
            </div>
        </article>
    `;
}

function openMobileSocioDetail(idsocio) {
    const socio = mobileSociosAll.find((s) => String(s.idsocio) === String(idsocio));
    if (!socio) return;

    const modal = document.getElementById('mobile-socio-detail-modal');
    const modalName = document.getElementById('mobile-socio-modal-name');
    const modalBody = document.getElementById('mobile-socio-modal-body');
    if (!modal || !modalName || !modalBody) return;

    modalName.textContent = socio.nombre || 'Detalle del Socio';

    const creditosOrdenados = [...(socio.creditos || [])].sort((a, b) => {
        const priority = { MOROSO: 1, ACTIVO: 2, PAUSADO: 3, CANCELADO: 4, PRECANCELADO: 5, PENDIENTE: 6 };
        const ap = priority[(a.estado_credito || '').toUpperCase()] || 99;
        const bp = priority[(b.estado_credito || '').toUpperCase()] || 99;
        return ap - bp;
    });

    modalBody.innerHTML = `
        <section class="mobile-detail-section">
            <div class="mobile-detail-title">Datos personales</div>
            <div class="mobile-detail-grid">
                ${detailItem('Nombre', socio.nombre)}
                ${detailItem('Cédula', socio.cedula)}
                ${detailItem('WhatsApp', socio.whatsapp ? `<a href="https://wa.me/${String(socio.whatsapp).replace(/\D/g, '')}" target="_blank">${escapeHtml(socio.whatsapp)}</a>` : '-', true)}
                ${detailItem('País de residencia', socio.paisresidencia)}
                ${detailItem('Estado civil', socio.estadocivil)}
                ${detailItem('Domicilio', socio.domicilio)}
            </div>
        </section>

        <section class="mobile-detail-section">
            <div class="mobile-detail-title">Referencia</div>
            <div class="mobile-detail-grid">
                ${detailItem('Nombre referencia', socio.nombrereferencia)}
                ${detailItem('WhatsApp referencia', socio.whatsappreferencia ? `<a href="https://wa.me/${String(socio.whatsappreferencia).replace(/\D/g, '')}" target="_blank">${escapeHtml(socio.whatsappreferencia)}</a>` : '-', true)}
            </div>
        </section>

        <section class="mobile-detail-section">
            <div class="mobile-detail-title">Cónyuge</div>
            <div class="mobile-detail-grid">
                ${detailItem('Nombre', socio.nombreconyuge)}
                ${detailItem('Cédula', socio.cedulaconyuge)}
                ${detailItem('WhatsApp', socio.whatsappconyuge ? `<a href="https://wa.me/${String(socio.whatsappconyuge).replace(/\D/g, '')}" target="_blank">${escapeHtml(socio.whatsappconyuge)}</a>` : '-', true)}
            </div>
        </section>

        <section class="mobile-detail-section">
            <div class="mobile-detail-title">Historial de créditos (${creditosOrdenados.length})</div>
            <div class="mobile-credit-history">
                ${creditosOrdenados.length ? creditosOrdenados.map((credito) => `
                    <article class="mobile-credit-item">
                        <div class="mobile-credit-code">${escapeHtml(credito.codigo_credito || credito.id_credito || 'CRÉDITO')}</div>
                        <div class="mobile-credit-amount">$${formatMoney(credito.capital)}</div>
                        <div class="mobile-credit-meta">
                            <span><strong>Estado:</strong> ${escapeHtml(formatEstado(credito.estado_credito || 'PENDIENTE'))}</span>
                            <span><strong>Cuotas:</strong> ${Number(credito.cuotas_pagadas || 0)}/${Number(credito.plazo || 0)}</span>
                            <span><strong>Pago:</strong> $${formatMoney(credito.cuota_con_ahorro)}</span>
                            <span><strong>Desembolso:</strong> ${credito.fecha_desembolso ? window.formatDate(credito.fecha_desembolso) : '-'}</span>
                        </div>
                    </article>
                `).join('') : '<p class="mobile-empty-state">Sin créditos registrados.</p>'}
            </div>
        </section>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeMobileSocioDetail() {
    const modal = document.getElementById('mobile-socio-detail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function detailItem(label, value, allowHtml = false) {
    const hasValue = value && String(value).trim();
    const safeValue = hasValue
        ? (allowHtml ? String(value) : escapeHtml(String(value)))
        : '-';
    return `
        <div class="mobile-detail-item">
            <label>${escapeHtml(label)}</label>
            <span>${safeValue}</span>
        </div>
    `;
}

function formatEstado(estado) {
    const raw = String(estado || 'SIN_CREDITO').toUpperCase();
    if (raw === 'SIN_CREDITO') return 'Sin crédito';
    if (raw === 'CON_CREDITO') return 'Con crédito';
    return raw.charAt(0) + raw.slice(1).toLowerCase();
}

function formatMoney(value) {
    const number = Number(value || 0);
    return number.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.initSociosModule = initSociosModule;
